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
import { getServerClient } from "@/lib/supabase/server";
import { createInitializedTeamFromOnboarding } from "@/lib/games/team-factory";
import {
  isAirlineColorId,
  pickNextAvailableColor,
  type AirlineColorId,
} from "@/lib/games/airline-colors";
import { pickAirlineNames } from "@/data/airline-names";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ── Default airline data for auto-seeded human players ──────────────────────
// Used when a player joined the lobby but never completed their setup form.
// Hub + doctrine cycle by index; name + code come from the shared 100-name
// pool at seed time so even fallback humans don't recycle the same shortlist.
const HUMAN_DEFAULT_HUBS = ["IST", "AMS", "FRA", "DXB", "LHR", "CDG", "NRT", "SIN"] as const;
const BOT_HUBS = ["SIN", "LHR", "DXB", "NRT", "CDG", "FRA", "GRU", "HKG"] as const;
// Brand color hex (for legacy team.color field — the airline-color
// system uses airlineColorId / palette lookups for the visible chrome).
const BOT_BRAND_HEXES = [
  "#6B5F88", "#4B7A2E", "#2E5C7A", "#C38A1E",
  "#4A6480", "#9A7D3D", "#C23B1F", "#7A4B2E",
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

    // ── Belt-and-suspenders: ensure the actor has a game_members row ──────
    // createGame inserts the host into game_members, but that insert is
    // best-effort and could fail silently on transient DB errors. If the
    // row is missing, assertMembership in every subsequent state-update
    // call would return 403 "Not a member". Upserting here is idempotent
    // and guarantees membership is established before the game begins.
    {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supa = getServerClient() as any;
      await supa.from("game_members").upsert(
        {
          game_id: gameId,
          session_id: actorSessionId,
          role: auth.data.isFacilitator ? "facilitator" : "host",
        },
        { onConflict: "game_id,session_id" },
      );
    }

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

      // If no eligible humans AND no configured bot seats, the normal seeding
      // paths produce 0 teams. This happens most commonly when the Game Master
      // (facilitator role — excluded from human seeding) starts a game alone
      // without first toggling any seats to "bot" in the lobby. A game with 0
      // teams cannot run — guarantee at least `max_teams` bot rivals so the
      // engine always has something to hydrate.
      const fallbackBotCount =
        humanMembers.length === 0 && botsToSeed === 0 ? Math.max(1, game.max_teams) : 0;

      const seededTeams: unknown[] = [];
      const claimedColorIds: Array<AirlineColorId | null | undefined> = [];

      // Pre-pick distinct airline names from the 100-name pool for
      // every team that DIDN'T already supply its own (humans without
      // a saved setup + every bot + any fallback bots). Names typed by
      // players in the lobby setup form take precedence — we exclude
      // those from the pool so a randomly-picked bot can't accidentally
      // collide.
      const humanSuppliedNames = new Set<string>(
        humanMembers
          .map((m) => playerSetups[m.session_id]?.airlineName?.trim())
          .filter((n): n is string => !!n && n.length > 0),
      );
      const namesNeeded =
        humanMembers.filter((m) => !playerSetups[m.session_id]?.airlineName).length +
        botsToSeed +
        fallbackBotCount;
      const pickedNamePool = pickAirlineNames(namesNeeded, humanSuppliedNames);
      let nameCursor = 0;

      const HUMAN_FALLBACK_DOCTRINES: DoctrineId[] = [
        "premium-service", "global-network", "budget-expansion", "cargo-dominance",
        "premium-service", "global-network", "budget-expansion", "cargo-dominance",
      ];

      // Seed human teams — one per member who joined.
      // Phase 9: thread airlineColorId through. Each member's choice from
      // the lobby is in playerSetups[].airlineColorId. If null/missing
      // (legacy member, or they didn't pick), assign the next available
      // palette color so the cohort still renders distinctly.
      for (let i = 0; i < humanMembers.length; i++) {
        const member = humanMembers[i];
        const setup = playerSetups[member.session_id];
        const fallbackName = pickedNamePool[nameCursor];
        const usingFallback = !setup?.airlineName;
        if (usingFallback && fallbackName) nameCursor++;
        const setupColor = isAirlineColorId(setup?.airlineColorId)
          ? setup.airlineColorId
          : null;
        const memberColorId =
          setupColor ?? pickNextAvailableColor(claimedColorIds);
        claimedColorIds.push(memberColorId);
        const team = createInitializedTeamFromOnboarding({
          airlineName: setup?.airlineName ?? (member.display_name
            ? `${member.display_name}'s Airlines`
            : (fallbackName?.name ?? "Skyforce Airlines")),
          code: setup?.code ?? fallbackName?.code ?? "SKF",
          doctrine: (setup?.doctrine as DoctrineId) ?? HUMAN_FALLBACK_DOCTRINES[i % HUMAN_FALLBACK_DOCTRINES.length],
          hubCode: setup?.hub ?? HUMAN_DEFAULT_HUBS[i % HUMAN_DEFAULT_HUBS.length],
          color: BOT_BRAND_HEXES[i % BOT_BRAND_HEXES.length],
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
        // Random distinct name from the 100-name pool (already pre-
        // picked above to avoid colliding with human-supplied names
        // and other bots in the same game).
        const namePick = pickedNamePool[nameCursor++];
        const fallbackHub = BOT_HUBS[i % BOT_HUBS.length];
        const fallbackHex = BOT_BRAND_HEXES[i % BOT_BRAND_HEXES.length];
        const botDoctrines: DoctrineId[] = [
          "premium-service", "budget-expansion", "cargo-dominance", "global-network",
        ];
        const doctrine = botDoctrines[i % botDoctrines.length];
        const difficulty =
          (botPlannedSeats[i]?.botDifficulty as "easy" | "medium" | "hard" | undefined) ??
          "medium";
        // Honor the host's color override (set via the refresh button
        // in the lobby) when it's present, valid, and not already
        // claimed by a human or earlier bot in this loop. Otherwise
        // fall back to the deterministic next-available rule.
        const overrideRaw = (botPlannedSeats[i] as { botColorOverride?: string } | undefined)
          ?.botColorOverride;
        const overrideUsable =
          isAirlineColorId(overrideRaw) && !claimedColorIds.includes(overrideRaw as AirlineColorId);
        const botColorId: AirlineColorId = overrideUsable
          ? (overrideRaw as AirlineColorId)
          : pickNextAvailableColor(claimedColorIds);
        claimedColorIds.push(botColorId);
        const team = createInitializedTeamFromOnboarding({
          airlineName: namePick?.name ?? `Bot Airlines ${i + 1}`,
          code: namePick?.code ?? `B${i.toString().padStart(2, "0")}`,
          doctrine,
          hubCode: fallbackHub,
          color: fallbackHex,
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

      // ── Fallback: auto-seed bots when normal paths produced 0 teams ────
      // Triggered when the host is a Game Master (facilitator, excluded from
      // human seeding) and no explicit bot seats were configured. Without
      // this, the game starts with teams:[] and the play page always shows
      // "State has no teams — game not yet seeded." for every GM-only start.
      if (seededTeams.length === 0 && fallbackBotCount > 0) {
        const fallbackDoctrines: DoctrineId[] = [
          "premium-service", "budget-expansion", "cargo-dominance", "global-network",
        ];
        for (let i = 0; i < fallbackBotCount; i++) {
          const namePick = pickedNamePool[nameCursor++];
          const fallbackBotColorId: AirlineColorId = pickNextAvailableColor(claimedColorIds);
          claimedColorIds.push(fallbackBotColorId);
          const team = createInitializedTeamFromOnboarding({
            airlineName: namePick?.name ?? `Bot Airlines ${i + 1}`,
            code: namePick?.code ?? `B${i.toString().padStart(2, "0")}`,
            doctrine: fallbackDoctrines[i % fallbackDoctrines.length],
            hubCode: BOT_HUBS[i % BOT_HUBS.length],
            color: BOT_BRAND_HEXES[i % BOT_BRAND_HEXES.length],
            controlledBy: "bot",
            claimedBySessionId: null,
            playerDisplayName: null,
            airlineColorId: fallbackBotColorId,
          });
          seededTeams.push({
            ...team,
            isPlayer: false,
            controlledBy: "bot" as const,
            botDifficulty: "medium" as const,
            flags: Array.from(team.flags ?? []),
          });
        }
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
          botCount: seededTeams.length - humanMembers.length,
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
