import "server-only";

/** Request-shape validation for in-game actions (the engine checks the rules). */

import { z } from "zod";
import { TOOL_KINDS, type HostAction, type PlayerAction } from "../types";

const cellId = z.string().min(1).max(64);
const playerId = z.string().uuid();
const teamId = z.string().min(1).max(64);
const amount = z.number().finite();
const tool = z.enum(TOOL_KINDS);
const team = z.object({ id: teamId, name: z.string().max(60), color: z.string().max(16) });

const hostAction = z.discriminatedUnion("type", [
  z.object({ type: z.literal("start") }),
  z.object({ type: z.literal("setTeams"), teams: z.array(team).min(1).max(5) }),
  z.object({ type: z.literal("moveMember"), playerId, teamId }),
  z.object({ type: z.literal("select"), cellId }),
  z.object({ type: z.literal("openBuzzers") }),
  z.object({ type: z.literal("startAnswering") }),
  z.object({ type: z.literal("judge"), correct: z.boolean() }),
  z.object({ type: z.literal("timeout") }),
  z.object({ type: z.literal("revealAnswer") }),
  z.object({ type: z.literal("backToBoard") }),
  z.object({ type: z.literal("setWager"), amount, teamId: teamId.optional() }),
  z.object({ type: z.literal("setController"), teamId: teamId.nullable() }),
  z.object({ type: z.literal("adjustScore"), teamId, delta: amount }),
  z.object({ type: z.literal("undo"), historyId: z.string().min(1).max(40) }),
  z.object({ type: z.literal("useTool"), teamId, tool, targetTeamId: teamId.optional() }),
  z.object({ type: z.literal("startFinal") }),
  z.object({ type: z.literal("showFinalQuestion") }),
  z.object({ type: z.literal("closeFinal") }),
  z.object({ type: z.literal("showFinalResponse"), teamId }),
  z.object({ type: z.literal("judgeFinal"), teamId, correct: z.boolean() }),
  z.object({ type: z.literal("revealFinalAnswer") }),
  z.object({ type: z.literal("finish") }),
  z.object({ type: z.literal("kick"), playerId }),
  z.object({ type: z.literal("lock"), locked: z.boolean() }),
]);

const playerAction = z.discriminatedUnion("type", [
  z.object({ type: z.literal("chooseTeam"), teamId }),
  z.object({ type: z.literal("buzz") }),
  z.object({ type: z.literal("pick"), cellId }),
  z.object({ type: z.literal("wager"), amount }),
  z.object({ type: z.literal("finalAnswer"), text: z.string().max(400) }),
  z.object({ type: z.literal("useTool"), tool, targetTeamId: teamId.optional() }),
]);

export function parseHostAction(raw: unknown): HostAction | null {
  const r = hostAction.safeParse(raw);
  return r.success ? (r.data as HostAction) : null;
}

export function parsePlayerAction(raw: unknown): PlayerAction | null {
  const r = playerAction.safeParse(raw);
  return r.success ? (r.data as PlayerAction) : null;
}
