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
import { startGame, loadGame, submitStateMutation } from "@/lib/games/api";
import { createInitializedTeamFromOnboarding } from "@/lib/games/team-factory";

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
    const body = await req.json();
    const { gameId, actorSessionId } = body ?? {};
    if (typeof gameId !== "string" || typeof actorSessionId !== "string") {
      return NextResponse.json({ error: "gameId + actorSessionId required" }, { status: 400 });
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
      // All members who will play (include facilitators who also want a team,
      // exclude pure spectators). Facilitators in a self-guided game typically
      // play too — only exclude them if they're in a facilitated game mode.
      const gameMode = (stateJson.session as Record<string, unknown> | undefined)?.mode;
      const humanMembers = members.filter((m) => {
        if (m.role === "spectator") return false;
        // In facilitated mode the facilitator runs the game; exclude them from player teams
        if (gameMode === "facilitated" && m.role === "facilitator") return false;
        return true;
      });

      // Player setups saved from the lobby form
      const playerSetups = (stateJson.playerSetups as Record<string, {
        airlineName: string; code: string; hub: string; doctrine: string;
      }> | undefined) ?? {};

      const plannedSeats = (
        ((stateJson.session as Record<string, unknown> | undefined)?.plannedSeats as Array<{ type: string; botDifficulty?: string }>) ?? []
      );

      const botSeatsCount = plannedSeats.filter((s) => s.type === "bot").length;
      // Use at least 1 bot if no bot seats planned, so the game isn't empty
      const botsToSeed = Math.max(botSeatsCount, humanMembers.length === 0 ? 3 : 0);

      const seededTeams: unknown[] = [];

      // Seed human teams — one per member who joined
      for (let i = 0; i < humanMembers.length; i++) {
        const member = humanMembers[i];
        const defaults = HUMAN_DEFAULTS[i % HUMAN_DEFAULTS.length];
        // Use setup saved from lobby form if available, otherwise use defaults
        const setup = playerSetups[member.session_id];
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
        });
        seededTeams.push({
          ...team,
          flags: Array.from(team.flags ?? []),
        });
      }

      // Seed bot rivals
      for (let i = 0; i < botsToSeed; i++) {
        const meta = BOT_DEFAULTS[i % BOT_DEFAULTS.length];
        const botDoctrines: DoctrineId[] = [
          "premium-service", "budget-expansion", "cargo-dominance", "global-network",
        ];
        const doctrine = botDoctrines[i % botDoctrines.length];
        const botDifficulties = ["easy", "medium", "medium", "hard", "medium"];
        const team = createInitializedTeamFromOnboarding({
          airlineName: meta.name,
          code: meta.code,
          doctrine,
          hubCode: meta.hub,
          color: meta.color,
          controlledBy: "bot",
          claimedBySessionId: null,
          playerDisplayName: null,
        });
        const botTeam = {
          ...team,
          isPlayer: false,
          controlledBy: "bot" as const,
          botDifficulty: botDifficulties[i % botDifficulties.length],
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
      await submitStateMutation({
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
