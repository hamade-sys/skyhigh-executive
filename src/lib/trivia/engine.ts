/**
 * ICAN Trivia — the game engine.
 *
 * A pure reducer: (state, action, context) → new state. No I/O, no
 * clock of its own (`ctx.now` is the server's), no randomness. The API
 * reads the room, runs one action through here and writes back with a
 * version compare-and-swap, so two simultaneous buzzes (or steals) can
 * never both win: the second re-runs against what the first wrote.
 *
 * Teams are the unit of play. Players belong to a team (`members`);
 * whoever presses the buzzer or a tool acts for their team.
 *
 * TRADITIONAL — the TV show:
 *   The host reads the question and opens the buzzers (or they open at
 *   once with `autoOpenBuzzers`). First team in answers. Right: +value
 *   and control of the board. Wrong: −value (if `negativeScoring`),
 *   locked out, buzzers re-open for everyone else. Daily Double: only
 *   the team in control answers, for a wager of 5..max(score, top value).
 *
 * COMPETITIVE — turns and tools:
 *   Teams take turns. On your turn you pick a question and get first
 *   shot. A short tools window runs before the answer clock:
 *     Steal       another team takes your question before you answer.
 *     Block       a team can't answer this question at all.
 *     Swap        you hand it to a team; they get `swapAnswerSec`, then
 *                 it comes back to you if they miss.
 *     Skip        you retire the question and pick again.
 *     Double Down right = +2× value, wrong = −1× value.
 *     Hint        unlocks a hint on your team's phones (usable while
 *                 answering, too).
 *   A miss passes the question to the next team in the queue, then
 *   (with `reboundOnMiss`) to a buzz among the teams still in.
 *   Turns move to the next team whatever happened.
 *
 * FINAL TRIVIA (both modes): every team wagers 0..max(score, 0),
 * writes an answer against the clock, and the host judges each one.
 */

import {
  findCell,
  finalPlayable,
  hintFor,
  isPlayable,
  LIMITS,
  maxBoardValue,
  playableCellIds,
  validateTeams,
} from "./content";
import {
  TOOL_KINDS,
  type ActionResult,
  type BuzzState,
  type HistoryEntry,
  type HostAction,
  type PlayerAction,
  type RoomState,
  type TeamDef,
  type ToolKind,
  type TriviaContent,
  type TurnState,
} from "./types";

export interface EngineContext {
  content: TriviaContent;
  /** Players in the room (from the players table). */
  playerIds: string[];
  /** Server clock, ms. */
  now: number;
}

/** Late buzzes that arrive just after the window still count — they were in flight. */
const BUZZ_GRACE_MS = 400;
const FINAL_GRACE_MS = 2500;
export const MIN_DD_WAGER = 5;

export function initialState(teams: TeamDef[]): RoomState {
  return {
    phase: "lobby",
    teams: teams.map((t) => ({ ...t })),
    members: {},
    scores: {},
    tools: {},
    usedCells: [],
    cellWinners: {},
    current: null,
    controllerTeamId: null,
    buzz: emptyBuzz(),
    turn: null,
    wager: null,
    final: null,
    history: [],
    lastResult: null,
    lastTool: null,
    kicked: [],
    locked: false,
    startedAt: null,
    endedAt: null,
    seq: 0,
  };
}

function emptyBuzz(lockedOut: string[] = []): BuzzState {
  return {
    openedAt: null,
    closesAt: null,
    winnerTeamId: null,
    winnerPlayerId: null,
    buzzedAt: null,
    answerDeadline: null,
    lockedOut,
  };
}

function ok(state: RoomState, note?: string): ActionResult {
  return { ok: true, state: { ...state, seq: state.seq + 1 }, changed: true, note };
}
function unchanged(state: RoomState, note: string): ActionResult {
  return { ok: true, state, changed: false, note };
}
function fail(error: string): ActionResult {
  return { ok: false, error };
}

// ─── Helpers ────────────────────────────────────────────────

export function teamOf(state: RoomState, playerId: string): string | null {
  const teamId = state.members[playerId];
  return teamId && state.teams.some((t) => t.id === teamId) ? teamId : null;
}

function hasTeam(state: RoomState, teamId: string | null | undefined): teamId is string {
  return Boolean(teamId && state.teams.some((t) => t.id === teamId));
}

function scoreOf(state: RoomState, teamId: string): number {
  return state.scores[teamId] ?? 0;
}

function withScore(state: RoomState, teamId: string, delta: number): Record<string, number> {
  return { ...state.scores, [teamId]: scoreOf(state, teamId) + delta };
}

function pushHistory(state: RoomState, entry: Omit<HistoryEntry, "id">): HistoryEntry[] {
  const id = `h${state.seq + 1}-${state.history.length + 1}`;
  return [...state.history, { id, ...entry }].slice(-300);
}

function activePlayers(state: RoomState, ctx: EngineContext): string[] {
  const kicked = new Set(state.kicked);
  return ctx.playerIds.filter((id) => !kicked.has(id));
}

/** Teams with at least one active player. In an empty team nobody can buzz. */
function staffedTeams(state: RoomState, ctx: EngineContext): string[] {
  const staffed = new Set(activePlayers(state, ctx).map((p) => teamOf(state, p)).filter(Boolean) as string[]);
  return state.teams.map((t) => t.id).filter((id) => staffed.has(id));
}

/** The team after `teamId` in turn order that has players. */
export function nextTeam(state: RoomState, ctx: EngineContext, teamId: string | null): string | null {
  const staffed = new Set(staffedTeams(state, ctx));
  const order = state.teams.map((t) => t.id);
  if (order.length === 0) return null;
  const start = teamId ? order.indexOf(teamId) : -1;
  for (let i = 1; i <= order.length; i++) {
    const candidate = order[(start + i + order.length) % order.length];
    if (staffed.has(candidate)) return candidate;
  }
  return null;
}

function openBuzzWindow(ctx: EngineContext, lockedOut: string[]): BuzzState {
  const secs = ctx.content.settings.buzzWindowSec;
  return { ...emptyBuzz(lockedOut), openedAt: ctx.now, closesAt: secs > 0 ? ctx.now + secs * 1000 : null };
}

function answerClock(ctx: EngineContext, teamId: string, secsOverride?: number): BuzzState {
  const secs = secsOverride ?? ctx.content.settings.answerTimeSec;
  return {
    ...emptyBuzz(),
    winnerTeamId: teamId,
    buzzedAt: ctx.now,
    answerDeadline: secs > 0 ? ctx.now + secs * 1000 : null,
  };
}

/** Remaining playable cells on the board. */
export function remainingCells(state: RoomState, content: TriviaContent): string[] {
  const used = new Set(state.usedCells);
  return playableCellIds(content).filter((id) => !used.has(id));
}

export function ddWagerRange(state: RoomState, content: TriviaContent, teamId: string) {
  return { min: MIN_DD_WAGER, max: Math.max(scoreOf(state, teamId), maxBoardValue(content), MIN_DD_WAGER) };
}

/** Teams at or below zero can only wager 0. */
export function finalWagerRange(state: RoomState, teamId: string) {
  return { min: 0, max: Math.max(scoreOf(state, teamId), 0) };
}

function toBoard(state: RoomState, markUsed: boolean): RoomState {
  const usedCells =
    markUsed && state.current && !state.usedCells.includes(state.current.cellId)
      ? [...state.usedCells, state.current.cellId]
      : state.usedCells;
  return { ...state, phase: "board", current: null, buzz: emptyBuzz(), turn: null, wager: null, usedCells };
}

function freshTools(content: TriviaContent): Record<ToolKind, number> {
  return Object.fromEntries(TOOL_KINDS.map((k) => [k, content.settings.tools[k] ?? 0])) as Record<ToolKind, number>;
}

/** Where a competitive question goes after its holder misses (or is blocked). */
function passOn(state: RoomState, ctx: EngineContext, turn: TurnState): RoomState {
  const out = new Set([...turn.tried, ...turn.blocked]);
  const queue = turn.queue.filter((t) => !out.has(t));
  const next = queue.shift();
  if (next) {
    return { ...state, phase: "answering", turn: { ...turn, answeringTeamId: next, queue }, buzz: answerClock(ctx, next) };
  }
  const eligible = staffedTeams(state, ctx).filter((t) => !out.has(t));
  if (ctx.content.settings.reboundOnMiss && eligible.length > 0) {
    return { ...state, phase: "buzzing", turn: { ...turn, answeringTeamId: null, queue: [] }, buzz: openBuzzWindow(ctx, [...out]) };
  }
  return { ...state, phase: "reveal", turn: { ...turn, answeringTeamId: null, queue: [] } };
}

// ─── Tools ──────────────────────────────────────────────────

export interface ToolOption {
  tool: ToolKind;
  left: number;
  /** For Block and Swap: the teams it can be used on. */
  targets?: string[];
  /** Why it can't be used right now (null = usable). */
  disabled: string | null;
}

/** Every tool a team holds, and whether it can play it right now. Drives the phone UI. */
export function toolOptions(state: RoomState, content: TriviaContent, ctx: Pick<EngineContext, "playerIds">, teamId: string): ToolOption[] {
  if (content.settings.mode !== "competitive") return [];
  const left = state.tools[teamId] ?? freshTools(content);
  const turn = state.turn;
  const engineCtx = { content, playerIds: ctx.playerIds, now: 0 };
  const staffed = staffedTeams(state, engineCtx);
  const out = new Set([...(turn?.tried ?? []), ...(turn?.blocked ?? [])]);
  const isWindow = state.phase === "question" && Boolean(turn);
  const holder = turn?.answeringTeamId ?? null;
  const mine = holder === teamId;
  const myTurn = turn?.turnTeamId === teamId;

  return TOOL_KINDS.filter((k) => (content.settings.tools[k] ?? 0) > 0).map((tool) => {
    const count = left[tool] ?? 0;
    const opt: ToolOption = { tool, left: count, disabled: null };
    if (count <= 0) return { ...opt, disabled: "Used up" };
    if (!turn) return { ...opt, disabled: "Between questions" };
    if (out.has(teamId) && tool !== "block") return { ...opt, disabled: "You're out of this question" };
    switch (tool) {
      case "steal":
        if (!isWindow) return { ...opt, disabled: "Only before the answer clock starts" };
        if (mine) return { ...opt, disabled: "You already hold this question" };
        if (turn.stolenBy) return { ...opt, disabled: "Already stolen" };
        if (holder !== turn.turnTeamId) return { ...opt, disabled: "Only from the team whose turn it is" };
        return opt;
      case "block": {
        if (!isWindow) return { ...opt, disabled: "Only before the answer clock starts" };
        const targets = staffed.filter((t) => t !== teamId && !out.has(t));
        return targets.length ? { ...opt, targets } : { ...opt, disabled: "No team to block" };
      }
      case "swap": {
        if (!isWindow) return { ...opt, disabled: "Only before the answer clock starts" };
        if (!myTurn) return { ...opt, disabled: "Only on your own turn" };
        if (!mine) return { ...opt, disabled: "You've passed this question on" };
        if (turn.swappedTo || turn.stolenBy) return { ...opt, disabled: "Already passed on" };
        const targets = staffed.filter((t) => t !== teamId && !out.has(t));
        return targets.length ? { ...opt, targets } : { ...opt, disabled: "No team to swap with" };
      }
      case "skip":
        if (!isWindow) return { ...opt, disabled: "Only before the answer clock starts" };
        if (!myTurn) return { ...opt, disabled: "Only on your own turn" };
        if (!mine) return { ...opt, disabled: "You've passed this question on" };
        if (turn.stolenBy || turn.swappedTo || turn.events.length > 0) return { ...opt, disabled: "Too late to skip" };
        return opt;
      case "doubleDown":
        if (!isWindow) return { ...opt, disabled: "Only before the answer clock starts" };
        if (!mine) return { ...opt, disabled: "Only for the team answering" };
        if (turn.doubleDown.includes(teamId)) return { ...opt, disabled: "Already doubled" };
        return opt;
      case "hint":
        if (!["question", "answering", "buzzing"].includes(state.phase)) return { ...opt, disabled: "Only while a question is up" };
        if (turn.hints.includes(teamId)) return { ...opt, disabled: "Already unlocked" };
        return opt;
    }
  });
}

function playTool(state: RoomState, ctx: EngineContext, teamId: string, tool: ToolKind, targetTeamId?: string): ActionResult {
  const { content, now } = ctx;
  if (content.settings.mode !== "competitive") return fail("Tools are only in Competitive mode.");
  if (!hasTeam(state, teamId)) return fail("Join a team first.");
  const option = toolOptions(state, content, ctx, teamId).find((o) => o.tool === tool);
  if (!option) return fail("That tool isn't in this game.");
  if (option.disabled) return fail(option.disabled);
  if (option.targets && (!targetTeamId || !option.targets.includes(targetTeamId))) return fail("Choose a team.");
  const turn = state.turn!;
  const event = { seq: state.seq + 1, teamId, tool, targetTeamId: option.targets ? targetTeamId : undefined, at: now };
  const tools = { ...state.tools, [teamId]: { ...(state.tools[teamId] ?? freshTools(content)), [tool]: option.left - 1 } };
  const base = { ...state, tools, lastTool: event };
  const withEvent = (t: TurnState): TurnState => ({ ...t, events: [...t.events, event] });

  switch (tool) {
    case "steal":
      return ok({ ...base, turn: withEvent({ ...turn, answeringTeamId: teamId, stolenBy: teamId, queue: [] }) }, "stolen");
    case "block": {
      const target = targetTeamId!;
      let next: TurnState = withEvent({ ...turn, blocked: [...turn.blocked, target], queue: turn.queue.filter((t) => t !== target) });
      if (next.answeringTeamId === target) {
        const queue = [...next.queue];
        next = { ...next, answeringTeamId: queue.shift() ?? null, queue };
      }
      return ok({ ...base, turn: next }, "blocked");
    }
    case "swap":
      return ok(
        { ...base, turn: withEvent({ ...turn, answeringTeamId: targetTeamId!, swappedTo: targetTeamId!, queue: [teamId] }) },
        "swapped",
      );
    case "skip":
      // Retired unplayed; the same team picks again.
      return ok({ ...toBoard(base, true), controllerTeamId: teamId }, "skipped");
    case "doubleDown":
      return ok({ ...base, turn: withEvent({ ...turn, doubleDown: [...turn.doubleDown, teamId] }) }, "doubled");
    case "hint":
      return ok({ ...base, turn: withEvent({ ...turn, hints: [...turn.hints, teamId] }) }, "hint");
  }
}

// ─── Host actions ───────────────────────────────────────────

export function applyHost(state: RoomState, action: HostAction, ctx: EngineContext): ActionResult {
  const { content, now } = ctx;
  const competitive = content.settings.mode === "competitive";
  if (state.phase === "ended" && !["adjustScore", "undo", "moveMember", "kick"].includes(action.type)) {
    return fail("This game has ended.");
  }

  switch (action.type) {
    case "start": {
      if (state.phase !== "lobby") return fail("The game has already started.");
      if (playableCellIds(content).length === 0) return fail("This board has no finished questions yet.");
      const staffed = staffedTeams(state, ctx);
      if (staffed.length === 0) return fail("Wait for at least one player to join a team.");
      const tools = Object.fromEntries(state.teams.map((t) => [t.id, freshTools(content)]));
      return ok({
        ...state,
        phase: "board",
        startedAt: now,
        tools: competitive ? tools : {},
        // Competitive: the first team with players starts. Traditional: the host gives the first pick.
        controllerTeamId: competitive ? staffed[0] : null,
      });
    }

    case "setTeams": {
      const teams = action.teams.map((t) => ({ id: t.id, name: t.name.trim().slice(0, LIMITS.teamName), color: t.color }));
      const error = validateTeams(teams);
      if (error) return fail(error);
      if (teams.some((t) => !/^#[0-9a-fA-F]{6}$/.test(t.color))) return fail("Pick a colour for every team.");
      if (state.phase !== "lobby") {
        // Mid-game: rename and recolour only — scores belong to these teams.
        const same = teams.length === state.teams.length && teams.every((t) => state.teams.some((s) => s.id === t.id));
        if (!same) return fail("Teams can only be added or removed before the game starts.");
      }
      const ids = new Set(teams.map((t) => t.id));
      const members = Object.fromEntries(Object.entries(state.members).filter(([, teamId]) => ids.has(teamId)));
      return ok({ ...state, teams, members });
    }

    case "moveMember": {
      if (!ctx.playerIds.includes(action.playerId)) return fail("That player isn't in the room.");
      if (!hasTeam(state, action.teamId)) return fail("That team isn't in this game.");
      return ok({ ...state, members: { ...state.members, [action.playerId]: action.teamId } });
    }

    case "select": {
      if (state.phase !== "board") return fail("Finish the current question first.");
      const cell = findCell(content, action.cellId);
      if (!cell || !isPlayable(cell.question)) return fail("That question isn't on the board.");
      if (state.usedCells.includes(action.cellId)) return fail("That question has already been played.");
      const current = {
        cellId: action.cellId,
        columnIndex: cell.columnIndex,
        rowIndex: cell.rowIndex,
        value: cell.question.value,
        // Daily Doubles are a Traditional rule; Competitive has Double Down instead.
        dailyDouble: !competitive && Boolean(cell.question.dailyDouble),
      };
      if (competitive) {
        const turnTeam = hasTeam(state, state.controllerTeamId) ? state.controllerTeamId : nextTeam(state, ctx, null);
        if (!turnTeam) return fail("No team has players yet.");
        const secs = content.settings.toolWindowSec;
        const turn: TurnState = {
          turnTeamId: turnTeam,
          answeringTeamId: turnTeam,
          queue: [],
          blocked: [],
          tried: [],
          doubleDown: [],
          hints: [],
          stolenBy: null,
          swappedTo: null,
          windowEndsAt: secs > 0 ? now + secs * 1000 : null,
          events: [],
        };
        return ok({ ...state, phase: "question", current, turn, controllerTeamId: turnTeam, wager: null, buzz: emptyBuzz() });
      }
      if (current.dailyDouble) return ok({ ...state, phase: "dd_wager", current, wager: null, buzz: emptyBuzz() });
      if (content.settings.autoOpenBuzzers) return ok({ ...state, phase: "buzzing", current, wager: null, buzz: openBuzzWindow(ctx, []) });
      return ok({ ...state, phase: "question", current, wager: null, buzz: emptyBuzz() });
    }

    case "openBuzzers": {
      if (competitive) return applyHost(state, { type: "startAnswering" }, ctx);
      if (state.phase !== "question") return fail("There's no question waiting for buzzers.");
      return ok({ ...state, phase: "buzzing", buzz: openBuzzWindow(ctx, state.buzz.lockedOut) });
    }

    case "startAnswering": {
      // Competitive: close the tools window and start the clock.
      if (!competitive || state.phase !== "question" || !state.turn) return unchanged(state, "Not in a tools window.");
      const turn = state.turn;
      if (turn.answeringTeamId) {
        const secs = turn.swappedTo === turn.answeringTeamId ? content.settings.swapAnswerSec : undefined;
        return ok({ ...state, phase: "answering", turn: { ...turn, windowEndsAt: null }, buzz: answerClock(ctx, turn.answeringTeamId, secs) });
      }
      return ok(passOn({ ...state, turn: { ...turn, windowEndsAt: null } }, ctx, { ...turn, windowEndsAt: null }));
    }

    case "judge": {
      const cur = state.current;
      if (!cur) return fail("There's no question in play.");
      if (state.phase === "answering") {
        const teamId = state.buzz.winnerTeamId;
        if (!teamId) return fail("Nobody is answering.");
        const turn = state.turn;
        // Double Down counts only while the team holds the question, not on a rebound buzz.
        const doubled = Boolean(turn?.doubleDown.includes(teamId)) && !state.buzz.winnerPlayerId;
        const note: HistoryEntry["note"] = doubled
          ? "doubleDown"
          : turn?.stolenBy === teamId
            ? "stolen"
            : turn?.swappedTo === teamId
              ? "swapped"
              : turn && state.buzz.winnerPlayerId
                ? "rebound"
                : undefined;
        if (action.correct) {
          const delta = doubled ? cur.value * 2 : cur.value;
          return ok({
            ...state,
            phase: "reveal",
            scores: withScore(state, teamId, delta),
            cellWinners: { ...state.cellWinners, [cur.cellId]: teamId },
            // Traditional: a right answer wins control. Competitive: turns rotate on the way back to the board.
            controllerTeamId: competitive ? state.controllerTeamId : teamId,
            history: pushHistory(state, { cellId: cur.cellId, teamId, delta, correct: true, at: now, note }),
            lastResult: { seq: state.seq + 1, teamId, correct: true, delta, at: now },
          });
        }
        // A doubled miss always costs the value; otherwise the house rule decides.
        const delta = doubled || content.settings.negativeScoring ? -cur.value : 0;
        const judged: RoomState = {
          ...state,
          scores: withScore(state, teamId, delta),
          history: pushHistory(state, { cellId: cur.cellId, teamId, delta, correct: false, at: now, note }),
          lastResult: { seq: state.seq + 1, teamId, correct: false, delta, at: now },
        };
        if (competitive && turn) {
          const tried = [...turn.tried, teamId];
          return ok(passOn(judged, ctx, { ...turn, tried }));
        }
        const lockedOut = [...state.buzz.lockedOut, teamId];
        const stillIn = staffedTeams(state, ctx).filter((t) => !lockedOut.includes(t));
        if (stillIn.length === 0) return ok({ ...judged, phase: "reveal", buzz: { ...state.buzz, lockedOut } });
        return ok({ ...judged, phase: "buzzing", buzz: openBuzzWindow(ctx, lockedOut) });
      }
      if (state.phase === "dd_answer") {
        const teamId = state.controllerTeamId;
        const wager = state.wager ?? 0;
        if (!teamId) return fail("No team is answering this Daily Double.");
        // A wager is a wager: a wrong Daily Double always costs it.
        const delta = action.correct ? wager : -wager;
        return ok({
          ...state,
          phase: "reveal",
          scores: withScore(state, teamId, delta),
          cellWinners: action.correct ? { ...state.cellWinners, [cur.cellId]: teamId } : state.cellWinners,
          history: pushHistory(state, { cellId: cur.cellId, teamId, delta, correct: action.correct, at: now, note: "dailyDouble" }),
          lastResult: { seq: state.seq + 1, teamId, correct: action.correct, delta, at: now },
        });
      }
      return fail("There's no answer to judge right now.");
    }

    case "timeout": {
      // Sent by the host console when the buzz window runs out.
      if (state.phase !== "buzzing") return unchanged(state, "Buzzers aren't open.");
      if (state.buzz.closesAt && now < state.buzz.closesAt) return unchanged(state, "Buzzers are still open.");
      return ok({ ...state, phase: "reveal" });
    }

    case "revealAnswer": {
      if (!state.current) return fail("There's no question in play.");
      if (!["question", "buzzing", "answering", "dd_wager", "dd_answer"].includes(state.phase)) {
        return unchanged(state, "The answer is already showing.");
      }
      return ok({ ...state, phase: "reveal" });
    }

    case "backToBoard": {
      if (state.phase === "question" && (!state.turn || state.turn.events.length === 0)) {
        // Picked by mistake — put it back, unplayed.
        return ok(toBoard(state, false));
      }
      if (state.phase !== "reveal") return fail("Reveal the answer before going back to the board.");
      const next = toBoard(state, true);
      if (competitive && state.turn) {
        return ok({ ...next, controllerTeamId: nextTeam(state, ctx, state.turn.turnTeamId) });
      }
      return ok(next);
    }

    case "setWager": {
      if (state.phase !== "dd_wager") return fail("There's no Daily Double waiting for a wager.");
      const teamId = action.teamId ?? state.controllerTeamId;
      if (!hasTeam(state, teamId)) return fail("Choose which team is answering this Daily Double.");
      const range = ddWagerRange(state, content, teamId);
      const amount = Math.round(action.amount);
      if (!Number.isFinite(amount) || amount < range.min || amount > range.max) {
        return fail(`The wager must be between ${range.min} and ${range.max}.`);
      }
      return ok({ ...state, phase: "dd_answer", controllerTeamId: teamId, wager: amount });
    }

    case "setController": {
      if (action.teamId && !hasTeam(state, action.teamId)) return fail("That team isn't in this game.");
      return ok({ ...state, controllerTeamId: action.teamId });
    }

    case "adjustScore": {
      if (!hasTeam(state, action.teamId)) return fail("That team isn't in this game.");
      const delta = Math.round(action.delta);
      if (!Number.isFinite(delta) || delta === 0 || Math.abs(delta) > 1_000_000) return fail("Enter a score change.");
      return ok({
        ...state,
        scores: withScore(state, action.teamId, delta),
        history: pushHistory(state, { cellId: "adjust", teamId: action.teamId, delta, correct: null, at: now }),
      });
    }

    case "undo": {
      const entry = state.history.find((h) => h.id === action.historyId);
      if (!entry) return fail("That score change isn't in the log.");
      if (entry.undone) return unchanged(state, "Already reversed.");
      const winners = { ...state.cellWinners };
      if (entry.correct && winners[entry.cellId] === entry.teamId) delete winners[entry.cellId];
      return ok({
        ...state,
        scores: withScore(state, entry.teamId, -entry.delta),
        cellWinners: winners,
        history: state.history.map((h) => (h.id === entry.id ? { ...h, undone: true } : h)),
        final:
          entry.cellId === "final" && state.final
            ? { ...state.final, judged: omit(state.final.judged, entry.teamId) }
            : state.final,
      });
    }

    case "useTool": {
      // The host can play a tool for a team (one phone dead, team shouting across the room).
      return playTool(state, ctx, action.teamId, action.tool, action.targetTeamId);
    }

    case "startFinal": {
      if (state.phase !== "board") return fail("Finish the current question first.");
      if (!finalPlayable(content.final)) return fail("This board has no Final Trivia question.");
      return ok({
        ...state,
        phase: "final_wager",
        current: null,
        turn: null,
        buzz: emptyBuzz(),
        wager: null,
        final: { wagers: {}, answers: {}, judged: {}, deadline: null, shown: [], answerRevealed: false },
      });
    }

    case "showFinalQuestion": {
      if (state.phase !== "final_wager" || !state.final) return fail("Final Trivia isn't waiting for wagers.");
      return ok({ ...state, phase: "final_answer", final: { ...state.final, deadline: now + content.settings.finalTimeSec * 1000 } });
    }

    case "closeFinal": {
      if (state.phase !== "final_answer" || !state.final) return unchanged(state, "Answers are already closed.");
      const wagers = { ...state.final.wagers };
      for (const t of state.teams) if (wagers[t.id] === undefined) wagers[t.id] = 0;
      return ok({ ...state, phase: "final_reveal", final: { ...state.final, wagers, deadline: Math.min(state.final.deadline ?? now, now) } });
    }

    case "showFinalResponse": {
      if (state.phase !== "final_reveal" || !state.final) return fail("Final Trivia answers aren't being revealed.");
      if (state.final.shown.includes(action.teamId)) return unchanged(state, "Already on screen.");
      return ok({ ...state, final: { ...state.final, shown: [...state.final.shown, action.teamId] } });
    }

    case "judgeFinal": {
      if (state.phase !== "final_reveal" || !state.final) return fail("Final Trivia answers aren't being revealed.");
      if (!hasTeam(state, action.teamId)) return fail("That team isn't in this game.");
      const wager = state.final.wagers[action.teamId] ?? 0;
      let scores = state.scores;
      let history = state.history;
      // Re-judging corrects the earlier call instead of stacking on it.
      const previous = [...state.history].reverse().find((h) => h.cellId === "final" && h.teamId === action.teamId && !h.undone);
      if (previous) {
        if (previous.correct === action.correct) return unchanged(state, "Already judged that way.");
        scores = { ...scores, [action.teamId]: (scores[action.teamId] ?? 0) - previous.delta };
        history = history.map((h) => (h.id === previous.id ? { ...h, undone: true } : h));
      }
      const delta = action.correct ? wager : -wager;
      const base = { ...state, scores, history };
      return ok({
        ...base,
        scores: { ...scores, [action.teamId]: (scores[action.teamId] ?? 0) + delta },
        history: pushHistory(base, { cellId: "final", teamId: action.teamId, delta, correct: action.correct, at: now }),
        lastResult: { seq: state.seq + 1, teamId: action.teamId, correct: action.correct, delta, at: now },
        final: {
          ...state.final,
          judged: { ...state.final.judged, [action.teamId]: action.correct },
          shown: state.final.shown.includes(action.teamId) ? state.final.shown : [...state.final.shown, action.teamId],
        },
      });
    }

    case "revealFinalAnswer": {
      if (state.phase !== "final_reveal" || !state.final) return fail("Final Trivia answers aren't being revealed.");
      return ok({ ...state, final: { ...state.final, answerRevealed: true } });
    }

    case "finish":
      return ok({ ...state, phase: "ended", current: null, turn: null, buzz: emptyBuzz(), endedAt: now });

    case "kick": {
      if (state.kicked.includes(action.playerId)) return unchanged(state, "Already removed.");
      let next: RoomState = { ...state, kicked: [...state.kicked, action.playerId] };
      // If that was the only player on the answering team, the question moves on.
      if (state.phase === "answering" && state.buzz.winnerTeamId) {
        const teamId = state.buzz.winnerTeamId;
        const teamStillStaffed = staffedTeams(next, ctx).includes(teamId);
        if (!teamStillStaffed) {
          if (competitive && state.turn) next = passOn(next, ctx, { ...state.turn, tried: [...state.turn.tried, teamId] });
          else next = { ...next, phase: "buzzing", buzz: openBuzzWindow(ctx, [...state.buzz.lockedOut, teamId]) };
        }
      }
      return ok(next);
    }

    case "lock": {
      if (state.locked === action.locked) return unchanged(state, action.locked ? "Already locked." : "Already open.");
      return ok({ ...state, locked: action.locked });
    }
  }
}

// ─── Player actions ─────────────────────────────────────────

export function applyPlayer(state: RoomState, playerId: string, action: PlayerAction, ctx: EngineContext): ActionResult {
  const { content, now } = ctx;
  if (state.kicked.includes(playerId) || !ctx.playerIds.includes(playerId)) return fail("You're no longer in this game.");

  if (action.type === "chooseTeam") {
    if (!hasTeam(state, action.teamId)) return fail("That team isn't in this game.");
    const current = teamOf(state, playerId);
    if (current === action.teamId) return unchanged(state, "Already on that team.");
    if (current && state.phase !== "lobby") return fail("Teams are set once the game starts — ask the host to move you.");
    return ok({ ...state, members: { ...state.members, [playerId]: action.teamId } });
  }

  const teamId = teamOf(state, playerId);
  if (!teamId) return fail("Pick a team first.");

  switch (action.type) {
    case "buzz": {
      if (state.phase === "question") return unchanged(state, "early");
      if (state.phase === "answering") return unchanged(state, state.buzz.winnerTeamId === teamId ? "won" : "beaten");
      if (state.phase !== "buzzing") return unchanged(state, "closed");
      if (state.buzz.lockedOut.includes(teamId)) return unchanged(state, "locked");
      if (state.buzz.closesAt && now > state.buzz.closesAt + BUZZ_GRACE_MS) return unchanged(state, "closed");
      const buzz = answerClock(ctx, teamId);
      const next: RoomState = {
        ...state,
        phase: "answering",
        buzz: { ...buzz, winnerPlayerId: playerId, lockedOut: state.buzz.lockedOut },
        turn: state.turn ? { ...state.turn, answeringTeamId: teamId } : null,
      };
      return ok(next, "won");
    }

    case "pick": {
      if (state.phase !== "board") return fail("Wait for the board.");
      if (state.controllerTeamId !== teamId) return fail("It's not your team's pick.");
      if (content.settings.mode === "traditional" && !content.settings.playersPick) return fail("The host is picking the questions.");
      return applyHost(state, { type: "select", cellId: action.cellId }, ctx);
    }

    case "wager": {
      if (state.phase === "dd_wager") {
        if (state.controllerTeamId !== teamId) return fail("Only the team in control wagers on a Daily Double.");
        return applyHost(state, { type: "setWager", amount: action.amount, teamId }, ctx);
      }
      if (state.phase === "final_wager" && state.final) {
        const range = finalWagerRange(state, teamId);
        const amount = Math.round(action.amount);
        if (!Number.isFinite(amount) || amount < range.min || amount > range.max) {
          return fail(range.max === 0 ? "Your team can only wager 0 this time." : `Wager between 0 and ${range.max}.`);
        }
        return ok({ ...state, final: { ...state.final, wagers: { ...state.final.wagers, [teamId]: amount } } });
      }
      return fail("There's nothing to wager on right now.");
    }

    case "finalAnswer": {
      if (state.phase !== "final_answer" || !state.final) return fail("Final Trivia answers are closed.");
      if (state.final.deadline && now > state.final.deadline + FINAL_GRACE_MS) return fail("Time's up.");
      const text = action.text.trim().slice(0, LIMITS.finalAnswerText);
      return ok({ ...state, final: { ...state.final, answers: { ...state.final.answers, [teamId]: text } } });
    }

    case "useTool":
      return playTool(state, ctx, teamId, action.tool, action.targetTeamId);
  }
}

/** The hint text, for teams that unlocked it. */
export function currentHint(state: RoomState, content: TriviaContent): string | null {
  if (!state.current) return null;
  const cell = findCell(content, state.current.cellId);
  return cell ? hintFor(cell.question) : null;
}

/** Auto-assign: the team with the fewest players (ties → earliest team). */
export function smallestTeam(state: RoomState, playerIds: string[]): string | null {
  if (state.teams.length === 0) return null;
  const kicked = new Set(state.kicked);
  const counts = new Map(state.teams.map((t) => [t.id, 0]));
  for (const p of playerIds) {
    if (kicked.has(p)) continue;
    const t = state.members[p];
    if (t && counts.has(t)) counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => a[1] - b[1])[0][0];
}

function omit<T>(obj: Record<string, T>, key: string): Record<string, T> {
  const next = { ...obj };
  delete next[key];
  return next;
}

/** Standings, highest first. Ties share a rank. */
export function standings(state: RoomState): Array<{ teamId: string; score: number; rank: number }> {
  const rows = state.teams.map((t) => ({ teamId: t.id, score: scoreOf(state, t.id) })).sort((a, b) => b.score - a.score);
  let rank = 0;
  let last: number | null = null;
  return rows.map((r, i) => {
    if (last === null || r.score !== last) rank = i + 1;
    last = r.score;
    return { ...r, rank };
  });
}
