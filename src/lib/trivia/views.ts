/**
 * ICAN Trivia — what each screen may see.
 *
 * The room row holds the whole board, answers included. Nothing in it
 * reaches a browser except through `buildView`, which strips what the
 * viewer isn't entitled to:
 *
 *   host    — everything: answers, hints, host notes, every wager and
 *             written answer, the score log.
 *   display — the big screen. Only what a TV audience sees: the
 *             question once it's picked, the answer once revealed,
 *             Final Trivia responses once the host puts them up. Hints
 *             never — only that a team used one.
 *   player  — the display view plus their own team's wager, written
 *             answer, tools, and the hint if their team unlocked it.
 *
 * Tested in views.test.ts: no answer, hint or other team's response
 * may appear in a view before its moment.
 */

import { finalPlayable, findCell, hintFor, isPlayable, rowValues } from "./content";
import { ddWagerRange, finalWagerRange, remainingCells, teamOf, toolOptions, type ToolOption } from "./engine";
import type {
  BuzzState,
  GameMode,
  HistoryEntry,
  LastResult,
  Phase,
  PlayerRecord,
  RoomState,
  ToolEvent,
  ToolKind,
  TriviaContent,
  TriviaSettings,
  TurnState,
} from "./types";

export type ViewRole = "host" | "display" | "player";

/** A player counts as connected if their screen checked in this recently. */
export const CONNECTED_WINDOW_MS = 25_000;

export interface ViewCell {
  id: string;
  value: number;
  used: boolean;
  /** Blank cells (no question or answer written) stay dark. */
  playable: boolean;
  /** The team that answered it right — its colour fills the cell. */
  winnerTeamId: string | null;
}

export interface ViewColumn {
  id: string;
  title: string;
  cells: ViewCell[];
}

export interface ViewPlayer {
  id: string;
  name: string;
  teamId: string | null;
  connected: boolean;
}

export interface ViewTeam {
  id: string;
  name: string;
  color: string;
  score: number;
  members: ViewPlayer[];
  /** Competitive: tools left. Public — part of the strategy. */
  tools: Record<ToolKind, number> | null;
}

export interface ViewCurrent {
  cellId: string;
  columnTitle: string;
  value: number;
  dailyDouble: boolean;
  /** Present once the question is on screen. */
  question: string | null;
  imageUrl: string | null;
  /** Present once revealed (always, for the host). */
  answer: string | null;
  /** Host: always. Player: when their team unlocked it. Display: never. */
  hint: string | null;
  /** Host only. */
  notes: string | null;
}

export interface ViewFinalResponse {
  teamId: string;
  answer: string;
  wager: number;
  correct: boolean | null;
}

export interface ViewFinal {
  category: string;
  question: string | null;
  answer: string | null;
  notes: string | null;
  deadline: number | null;
  /** Teams that have locked in a wager / an answer (ids only). */
  wagered: string[];
  answered: string[];
  /** Responses on the big screen (host: every team's). */
  responses: ViewFinalResponse[];
  answerRevealed: boolean;
}

export interface ViewMe {
  id: string;
  name: string;
  teamId: string | null;
  /** Can pick or change team right now. */
  canChooseTeam: boolean;
  score: number;
  isController: boolean;
  lockedOut: boolean;
  canPick: boolean;
  /** Set when this team owes a wager right now. */
  wagerRange: { min: number; max: number } | null;
  finalWager: number | null;
  finalAnswer: string | null;
  tools: ToolOption[];
}

export interface TriviaView {
  role: ViewRole;
  serverNow: number;
  room: { id: string; code: string; title: string; status: string; version: number; setId: string | null };
  phase: Phase;
  mode: GameMode;
  seq: number;
  locked: boolean;
  settings: TriviaSettings;
  board: ViewColumn[];
  rowValues: number[];
  remaining: number;
  hasFinal: boolean;
  teams: ViewTeam[];
  players: ViewPlayer[];
  current: ViewCurrent | null;
  buzz: BuzzState;
  /** Competitive: the current question's turn (who holds it, tools played). */
  turn: TurnState | null;
  wager: number | null;
  controllerTeamId: string | null;
  lastResult: LastResult | null;
  lastTool: ToolEvent | null;
  final: ViewFinal | null;
  me: ViewMe | null;
  /** Host only. */
  history: HistoryEntry[] | null;
  /** Host only: the full board, answers included, for previews. */
  content: TriviaContent | null;
}

export interface RoomRecord {
  id: string;
  /** The board it was started from (host only — null for library templates). */
  setId?: string | null;
  code: string;
  title: string;
  status: string;
  version: number;
  content: TriviaContent;
  state: RoomState;
}

const QUESTION_VISIBLE: Phase[] = ["question", "buzzing", "answering", "dd_answer", "reveal"];

export function buildView(args: {
  room: RoomRecord;
  players: PlayerRecord[];
  role: ViewRole;
  playerId?: string | null;
  now: number;
}): TriviaView {
  const { room, role, now } = args;
  const { content, state } = room;
  const isHost = role === "host";
  const kicked = new Set(state.kicked);
  const activeRecords = args.players.filter((p) => !kicked.has(p.id));
  const used = new Set(state.usedCells);
  const competitive = content.settings.mode === "competitive";

  const players: ViewPlayer[] = activeRecords.map((p) => ({
    id: p.id,
    name: p.name,
    teamId: teamOf(state, p.id),
    connected: now - Date.parse(p.lastSeenAt) < CONNECTED_WINDOW_MS,
  }));

  const teams: ViewTeam[] = state.teams.map((t) => ({
    id: t.id,
    name: t.name,
    color: t.color,
    score: state.scores[t.id] ?? 0,
    members: players.filter((p) => p.teamId === t.id),
    tools: competitive ? state.tools[t.id] ?? { ...content.settings.tools } : null,
  }));

  const board: ViewColumn[] = content.columns.map((c) => ({
    id: c.id,
    title: c.title,
    cells: c.questions.map((q) => ({
      id: q.id,
      value: q.value,
      used: used.has(q.id),
      playable: isPlayable(q),
      winnerTeamId: state.cellWinners[q.id] ?? null,
    })),
  }));

  const myTeam = role === "player" && args.playerId ? teamOf(state, args.playerId) : null;

  let current: ViewCurrent | null = null;
  if (state.current) {
    const cell = findCell(content, state.current.cellId);
    if (cell) {
      const showQuestion = isHost || QUESTION_VISIBLE.includes(state.phase);
      const showAnswer = isHost || state.phase === "reveal";
      const showHint = isHost || Boolean(myTeam && state.turn?.hints.includes(myTeam));
      current = {
        cellId: state.current.cellId,
        columnTitle: cell.column.title,
        value: state.current.value,
        dailyDouble: state.current.dailyDouble,
        question: showQuestion ? cell.question.question : null,
        imageUrl: showQuestion ? cell.question.imageUrl ?? null : null,
        answer: showAnswer ? cell.question.answer : null,
        hint: showHint && showQuestion ? hintFor(cell.question) : null,
        notes: isHost ? cell.question.notes ?? null : null,
      };
    }
  }

  let final: ViewFinal | null = null;
  if (state.final) {
    const f = state.final;
    const finalPhase = state.phase === "final_answer" || state.phase === "final_reveal" || state.phase === "ended";
    const shown = isHost ? state.teams.map((t) => t.id) : f.shown;
    final = {
      category: content.final.category,
      question: isHost || finalPhase ? content.final.question : null,
      answer: isHost || f.answerRevealed ? content.final.answer : null,
      notes: isHost ? content.final.notes ?? null : null,
      deadline: f.deadline,
      wagered: Object.keys(f.wagers),
      answered: Object.keys(f.answers).filter((id) => f.answers[id]),
      responses:
        isHost || state.phase === "final_reveal" || state.phase === "ended"
          ? shown
              .filter((id) => state.teams.some((t) => t.id === id))
              .map((id) => ({ teamId: id, answer: f.answers[id] ?? "", wager: f.wagers[id] ?? 0, correct: f.judged[id] ?? null }))
          : [],
      answerRevealed: f.answerRevealed,
    };
  }

  let me: ViewMe | null = null;
  if (role === "player" && args.playerId) {
    const p = activeRecords.find((x) => x.id === args.playerId);
    if (p) {
      const teamId = myTeam;
      let wagerRange: ViewMe["wagerRange"] = null;
      if (teamId && state.phase === "dd_wager" && state.controllerTeamId === teamId) wagerRange = ddWagerRange(state, content, teamId);
      if (teamId && state.phase === "final_wager") wagerRange = finalWagerRange(state, teamId);
      me = {
        id: p.id,
        name: p.name,
        teamId,
        canChooseTeam: state.phase === "lobby" || !teamId,
        score: teamId ? state.scores[teamId] ?? 0 : 0,
        isController: Boolean(teamId && state.controllerTeamId === teamId),
        lockedOut: Boolean(teamId && state.buzz.lockedOut.includes(teamId)),
        canPick:
          Boolean(teamId) &&
          state.phase === "board" &&
          state.controllerTeamId === teamId &&
          (competitive || content.settings.playersPick),
        wagerRange,
        finalWager: teamId ? state.final?.wagers[teamId] ?? null : null,
        finalAnswer: teamId ? state.final?.answers[teamId] ?? null : null,
        tools: teamId ? toolOptions(state, content, { playerIds: activeRecords.map((x) => x.id) }, teamId) : [],
      };
    }
  }

  return {
    role,
    serverNow: now,
    room: {
      id: room.id,
      code: room.code,
      title: room.title,
      status: room.status,
      version: room.version,
      setId: isHost ? room.setId ?? null : null,
    },
    phase: state.phase,
    mode: content.settings.mode,
    seq: state.seq,
    locked: state.locked,
    settings: content.settings,
    board,
    rowValues: rowValues(content),
    remaining: remainingCells(state, content).length,
    hasFinal: finalPlayable(content.final),
    teams,
    players,
    current,
    buzz: state.buzz,
    turn: state.turn,
    wager: state.wager,
    controllerTeamId: state.controllerTeamId,
    lastResult: state.lastResult,
    lastTool: state.lastTool,
    final,
    me,
    history: isHost ? state.history : null,
    content: isHost ? content : null,
  };
}
