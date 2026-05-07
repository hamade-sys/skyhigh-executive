/**
 * POST /api/games/start — host/facilitator advances a lobby to playing.
 *
 * Body: { gameId: string, actorSessionId: string }
 *
 * If the game_state has no teams yet (players never went through
 * onboarding in the multiplayer context) this route auto-seeds teams
 * before flipping the status to "playing":
 *
 *   - Every human game_member (excluding facilitator/spectator) gets
 *     a real team via createInitializedTeamFromOnboarding with sensible
 *     defaults. Their claimedBySessionId is set so each browser binds
 *     to the right team on hydration.
 *   - Any remaining planned bot seats get rival airlines generated
 *     from the same MOCK_COMPETITOR_NAMES palette used in solo play.
 *   - If teams are already present (players did their own onboarding
 *     and pushed state via /api/games/state-update) we skip seeding.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  assertHostOrFacilitator,
  loadGame,
  startGame,
  submitStateMutation,
} from "@/lib/games/api";
import { getAuthenticatedUserId } from "@/lib/supabase/server-auth";
import { createInitializedTeamFromOnboarding } from "@/lib/games/team-factory";
import {
  isAirlineColorId,
  pickNextAvailableColor,
  type AirlineColorId,
} from "@/lib/games/airline-colors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ── Default airline data for auto-seeded human players ──────────────────────
const HUMAN_DEFAULTS = [
  { name: "SkyForce One",       code: "SK1", hub: "IST", doctrine: "premium-service",    color: "#14355E" },
  { name: "Atlas Air",          code: "ATL", hub: "AMS", doctrine: "global-network",      color: "#2B6B88" },
  { name: "Orion Airways",      code: "ORI", hub: "FRA", doctrine: "budget-expansion",    color: "#1E6B5C" },
  { name: "Horizon Express",    code: "HRZ", hub: "DXB", doctrine: "cargo-dominance",     color: "#7A4B2E" },
  { name: "Zenith Airlines",    code: "ZNT", hub: "LHR", doctrine: "premium-service",    color: "#C38A1E" },
  { name: "Polaris Air",        code: "POL", hub: "CDG", doctrine: "global-network",      color: "#4A6480" },
  { name: "Apex Carriers",      code: "APX", hub: "NRT", doctrine: "budget-expansion",    color: "#9A7D3D" },
  { name: "Vantage Global",     code: "VAN", hub: "SIN", doctrine: "cargo-dominance",     color: "#C23B1F" },
] as const;

const BOT_DEFAULTS = [
  { name: "Aurora Airways",     code: "AUR", hub: "SIN", doctrine: "premium-service",    color: "#6B5F88" },
  { name: "Sundial Carriers",   code: "SND", hub: "LHR", doctrine: "budget-expansion",   color: "#4B7A2E" },
  { name: "Meridian Air",       code: "MRD", hub: "DXB", doctrine: "cargo-dominance",    color: "#2E5C7A" },
  { name: "Pacific Crest",      code: "PCC", hub: "NRT", doctrine: "global-network",     color: "#C38A1E" },
  { name: "Transit Nordique",   code: "TND", hub: "CDG", doctrine: "premium-service",    color: "#4A6480" },
  { name: "Solstice Wings",     code: "SOL", hub: "FRA", doctrine: "budget-expansion",   color: "#9A7D3D" },
  { name: "Vermilion Air",      code: "VML", hub: "GRU", doctrine: "cargo-dominance",    color: "#C23B1F" },
  { name: "Firth Pacific",      code: "FTH", hub: "HKG", doctrine: "global-network",     color: "#7A4B2E" },
] as const;

type DoctrineId = "premium-service" | "budget-expansion" | "cargo-dominance" | "global-network";

export async function POST(req: NextRequest) {
  try {
    // Phase 1 hardening: identity is server-derived from the cookie-
    // bound auth session. Body parameter `actorSessionId` is ignored
    // for identity (kept tolerated for backward-compat parsing only).
    const userId = await getAuthenticatedUserId();
    if (!userId) {
      return NextResponse.json(
        { error: "Sign-in required to start a game." },
        { status: 401 },
      );
    }

    const body = await req.json();
    const { gameId } = body ?? {};
    if (typeof gameId !== "string") {
      return NextResponse.json({ error: "gameId required" }, { status: 400 });
    }

    // Authorization: only the host (creator) or facilitator can start.
    const auth = await assertHostOrFacilitator(gameId, userId);
    if (!auth.ok) {
      const status = auth.error.includes("not found") ? 404 : 403;
      return NextResponse.json({ error: auth.error }, { status });
    }
    const actorSessionId = userId;

    // ── Load current game + state ──────────────────────────────────────────
    const loaded = await loadGame(gameId);
    if (!loaded.ok) {
      return NextResponse.json({ error: loaded.error }, { status: 404 });
    }
    const { game, members, state } = loaded.data;

    // ── Auto-seed teams when state has none ───────────────────────────────
    const stateJson = state?.state_json as Record<string, unknown> | undefined;
    const existingTeams = Array.isArray((stateJson as Record<string, unknown> | undefined)?.teams)
      ? ((stateJson as Record<string, unknown>).teams as unknown[])
      : [];

    if (existingTeams.length === 0 && stateJson) {
      // Player setups saved from the lobby form. airlineColorId is
      // optional (Phase 9) — preserved through start so the team's
      // chosen brand color survives into engine state.
      const playerSetups = (stateJson.playerSetups as Record<string, {
        airlineName: string; code: string; hub: string; doctrine: string;
        airlineColorId?: string | null;
      }> | undefined) ?? {};

      const plannedSeats = (
        ((stateJson.session as Record<string, unknown> | undefined)?.plannedSeats as Array<{ type: string; botDifficulty?: string }>) ?? []
      );

      // Only actual players get teams. The facilitator/game master manages the
      // session but does not compete — they see all teams in admin/spectator view.
      const plannedHumanCount = plannedSeats.filter((s) => s.type === "human").length;
      // Hard cap: use plannedHumanCount when available, otherwise game.max_teams
      // (never members.length — that would include phantom rows from the same
      // person joining twice with different session IDs).
      const humanCap = plannedHumanCount > 0 ? plannedHumanCount : game.max_teams;

      // Deduplicate by display_name: if the same physical person joined twice
      // (anonymous session + authenticated session), keep only their most
      // recently active session so claimedBySessionId matches what the play
      // page will use as mySessionId.
      const eligibleMembers = members.filter(
        (m) => m.role !== "spectator" && m.role !== "facilitator",
      );
      const dedupedMap = new Map<string, typeof eligibleMembers[number]>();
      for (const m of eligibleMembers) {
        const key = m.display_name?.trim() || m.session_id;
        const existing = dedupedMap.get(key);
        if (!existing) {
          dedupedMap.set(key, m);
        } else {
          // Keep the more recently seen session — that's the one the browser
          // will present as its sessionId when hitting the play page.
          const existingTs = existing.last_seen_at ? new Date(existing.last_seen_at).getTime() : 0;
          const newTs = m.last_seen_at ? new Date(m.last_seen_at).getTime() : 0;
          if (newTs > existingTs) dedupedMap.set(key, m);
        }
      }
      const humanMembers = Array.from(dedupedMap.values()).slice(0, humanCap);

      // Only seed bots for seats that were explicitly configured as "bot" in the
      // lobby form. Never fill empty human seats with bots — if someone didn't
      // join, the game runs with fewer players. This prevents phantom AI teams
      // appearing when the game master configured 2 player slots but the bot
      // default slots were left in from the new-game form.
      const botSeatsCount = plannedSeats.filter((s) => s.type === "bot").length;
      const botsToSeed = botSeatsCount;

      const seededTeams: unknown[] = [];
      const claimedColorIds: Array<AirlineColorId | null | undefined> = [];

      // Seed human teams — one per member who joined.
      // Phase 9: thread airlineColorId through. Each member's choice from
      // the lobby is in playerSetups[].airlineColorId. If null/missing
      // (legacy member, or they didn't pick), assign the next available
      // palette color so the cohort still renders distinctly.
      for (let i = 0; i < humanMembers.length; i++) {
        const member = humanMembers[i];
        const defaults = HUMAN_DEFAULTS[i % HUMAN_DEFAULTS.length];
        const setup = playerSetups[member.session_id];
        const setupColor = isAirlineColorId(setup?.airlineColorId)
          ? setup.airlineColorId
          : null;
        const memberColorId =
          setupColor ?? pickNextAvailableColor(claimedColorIds);
        claimedColorIds.push(memberColorId);
        const team = createInitializedTeamFromOnboarding({
          airlineName: setup?.airlineName ?? (member.display_name
            ? `${member.display_name}'s Airline`
            : defaults.name),
          code: setup?.code ?? defaults.code,
          doctrine: (setup?.doctrine as DoctrineId) ?? defaults.doctrine,
          hubCode: setup?.hub ?? defaults.hub,
          color: defaults.color,
          controlledBy: "human",
          claimedBySessionId: member.session_id,
          playerDisplayName: member.display_name ?? null,
          airlineColorId: memberColorId,
        });
        seededTeams.push({
          ...team,
          flags: Array.from(team.flags ?? []),
        });
      }

      // Seed bot rivals — difficulty comes from the lobby's seat config
      // (what the host set for each bot seat). Fall back to "medium" if
      // the seat didn't carry a difficulty (e.g. old games pre-lobby
      // config). Color comes from the Phase 9 palette allocator,
      // skipping anything humans already claimed.
      const botPlannedSeats = plannedSeats.filter((s) => s.type === "bot");
      for (let i = 0; i < botsToSeed; i++) {
        const meta = BOT_DEFAULTS[i % BOT_DEFAULTS.length];
        const botDoctrines: DoctrineId[] = [
          "premium-service", "budget-expansion", "cargo-dominance", "global-network",
        ];
        const doctrine = botDoctrines[i % botDoctrines.length];
        const difficulty =
          (botPlannedSeats[i]?.botDifficulty as "easy" | "medium" | "hard" | undefined) ??
          "medium";
        const botColorId = pickNextAvailableColor(claimedColorIds);
        claimedColorIds.push(botColorId);
        const team = createInitializedTeamFromOnboarding({
          airlineName: meta.name,
          code: meta.code,
          doctrine,
          hubCode: meta.hub,
          color: meta.color,
          controlledBy: "bot",
          claimedBySessionId: null,
          playerDisplayName: null,
          airlineColorId: botColorId,
        });
        const botTeam = {
          ...team,
          isPlayer: false,
          controlledBy: "bot" as const,
          botDifficulty: difficulty,
          flags: Array.from(team.flags ?? []),
        };
        seededTeams.push(botTeam);
      }

      // Write teams into the server state before starting
      const newStateJson = {
        ...stateJson,
        teams: seededTeams,
      };

      const currentVersion = state?.version ?? 1;
      const seedResult = await submitStateMutation({
        gameId,
        expectedVersion: currentVersion,
        newState: newStateJson,
        actorSessionId,
        eventType: "game.teamsSeeded",
        eventPayload: {
          humanCount: humanMembers.length,
          botCount: botsToSeed,
        },
      });
      // If the write fails (e.g. version conflict from a concurrent player-setup
      // save), bail out now so the game doesn't start with 0 teams.
      if (!seedResult.ok) {
        return NextResponse.json(
          { error: `Failed to seed teams: ${seedResult.error}. Please try starting again.` },
          { status: 409 },
        );
      }
    }

    // ── Advance status to "playing" ────────────────────────────────────────
    const result = await startGame({ gameId, actorSessionId });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json({ game: result.data });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
