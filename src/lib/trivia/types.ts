/**
 * ICAN Trivia — shared types.
 *
 * A Jeopardy-style quiz game that runs alongside the simulations.
 * Three layers, kept apart on purpose:
 *
 *   1. Content  — what a host authors in the editor: columns of
 *      questions, a Final Trivia round and the game settings (mode,
 *      teams, tools, clocks). Stored on a board or template and
 *      snapshotted onto a room when a game starts, so editing a board
 *      mid-game never changes the live game.
 *   2. RoomState — the live game: teams and who's on them, whose turn,
 *      which question is up, who buzzed, tools left, scores. Mutated
 *      only by the pure reducer in `engine.ts`, then written with a
 *      version compare-and-swap.
 *   3. Views    — what each screen is allowed to see. The host sees
 *      everything; the big display and phones get a sanitized view
 *      with answers (and other teams' hints) stripped (`views.ts`).
 *
 * Teams are the unit of play: scores, control of the board, buzzer
 * lock-outs, tools and wagers all belong to a team. Players are the
 * people (phones) on a team — a team can be a single person.
 */

// ─── Content ────────────────────────────────────────────────

export interface TriviaQuestion {
  /** Stable id — survives reordering, used as the board cell id. */
  id: string;
  /** Points awarded (or lost) for this question. */
  value: number;
  /** The question read out and shown on screen. */
  question: string;
  /** The accepted answer. Host-only until revealed. */
  answer: string;
  /** Unlocked by a team's Hint (Competitive). Falls back to the answer's first letter and length. */
  hint?: string;
  /** Host-only context: a fun fact, alternate accepted answers. */
  notes?: string;
  /** Optional picture shown with the question (https URL). */
  imageUrl?: string;
  /** Daily Double (Traditional) — only the team in control answers, for a wager. */
  dailyDouble?: boolean;
}

export interface TriviaColumn {
  /** Stable id. Also the key that ties a column to its column-bank row. */
  id: string;
  /** Category title shown at the top of the board. */
  title: string;
  /** Ordered top (lowest value) to bottom (highest value). */
  questions: TriviaQuestion[];
}

export interface TriviaFinal {
  enabled: boolean;
  category: string;
  question: string;
  answer: string;
  notes?: string;
}

export interface TeamDef {
  id: string;
  name: string;
  color: string;
}

export type GameMode = "traditional" | "competitive";

export const TOOL_KINDS = ["steal", "hint", "block", "swap", "skip", "doubleDown"] as const;
export type ToolKind = (typeof TOOL_KINDS)[number];

export interface TriviaSettings {
  /**
   * traditional — open buzzers: everyone races; a right answer wins control.
   * competitive — teams take turns; each team has tools (steal, block…).
   */
  mode: GameMode;
  /** 1–5 teams, each with a name and a colour. */
  teams: TeamDef[];
  /** "choose": players pick a team on their phone; "auto": spread evenly. */
  teamPick: "choose" | "auto";
  /** A wrong answer loses the question's value. */
  negativeScoring: boolean;
  /** Seconds the buzzers stay open. 0 = until the host moves on. */
  buzzWindowSec: number;
  /** Seconds a team has to answer. 0 = no clock. */
  answerTimeSec: number;
  /** Seconds to write the Final Trivia answer. */
  finalTimeSec: number;
  /** Traditional: the team in control can pick from a phone. */
  playersPick: boolean;
  /** Traditional: open buzzers as soon as a question shows (remote play). */
  autoOpenBuzzers: boolean;
  /** Remind players to answer in the form of a question. */
  phraseAsQuestion: boolean;
  /** Competitive: how many of each tool every team starts with (0 = off). */
  tools: Record<ToolKind, number>;
  /** Competitive: seconds for tools (steal, block, swap…) before the answer clock starts. */
  toolWindowSec: number;
  /** Competitive: seconds the team on the receiving end of a Swap gets. */
  swapAnswerSec: number;
  /** Competitive: after a miss, the other teams can buzz in for it. */
  reboundOnMiss: boolean;
}

export interface TriviaContent {
  schema: 1;
  columns: TriviaColumn[];
  final: TriviaFinal;
  settings: TriviaSettings;
}

export type SetKind = "board" | "template";
export type SetVisibility = "private" | "shared";

/** A board or template as listed in the hub. */
export interface TriviaSetSummary {
  id: string;
  kind: SetKind;
  visibility: SetVisibility | "library";
  title: string;
  description: string;
  columnTitles: string[];
  questionCount: number;
  /** True when the signed-in user owns it (can edit / delete / share). */
  mine: boolean;
  ownerLabel: string | null;
  plays: number;
  updatedAt: string;
}

export interface TriviaSetFull extends TriviaSetSummary {
  content: TriviaContent;
}

/** A column in the column bank — the depository every saved column lands in. */
export interface BankColumn {
  id: string;
  scope: "mine" | "shared" | "library";
  title: string;
  questions: TriviaQuestion[];
  sourceTitle: string | null;
  starred: boolean;
  shared: boolean;
  timesUsed: number;
  updatedAt: string;
}

/** ICAN-authored starter content, shipped in code (`library.ts`). */
export interface LibraryTemplate {
  /** "lib:<slug>" — never collides with a uuid. */
  id: string;
  title: string;
  description: string;
  tags: string[];
  content: TriviaContent;
}

// ─── Live game ──────────────────────────────────────────────

export type Phase =
  /** Waiting for players to join and pick teams. */
  | "lobby"
  /** The board is up; the team in control (or whose turn it is) picks. */
  | "board"
  /**
   * A question is on screen. Traditional: the host reads it, buzzers
   * locked. Competitive: the tools window — steal, block, swap, skip,
   * double down — before the answer clock starts.
   */
  | "question"
  /** Buzzers open — first team in answers. */
  | "buzzing"
  /** A team is answering; the host judges. */
  | "answering"
  /** Daily Double found — the team in control places a wager. */
  | "dd_wager"
  /** Daily Double question is up for that team only. */
  | "dd_answer"
  /** The answer is shown. */
  | "reveal"
  /** Final Trivia category shown; every team wagers. */
  | "final_wager"
  /** Final Trivia question shown; every team writes an answer. */
  | "final_answer"
  /** Answers revealed one by one and judged. */
  | "final_reveal"
  /** Podium. */
  | "ended";

export interface CurrentQuestion {
  cellId: string;
  columnIndex: number;
  rowIndex: number;
  value: number;
  dailyDouble: boolean;
}

export interface BuzzState {
  /** Server ms when buzzers opened, null while locked. */
  openedAt: number | null;
  /** Server ms when the buzz window closes (null = no limit). */
  closesAt: number | null;
  /** Team answering (won the buzz, or holds the question in Competitive). */
  winnerTeamId: string | null;
  /** The person who pressed the buzzer, when it came from a buzz. */
  winnerPlayerId: string | null;
  /** Server ms the winner buzzed / the answer clock started. */
  buzzedAt: number | null;
  /** Server ms the answer clock runs out (null = no clock). */
  answerDeadline: number | null;
  /** Teams out of this question (answered wrong, or blocked). */
  lockedOut: string[];
}

/** Competitive mode: who holds the current question and which tools were played on it. */
export interface TurnState {
  /** The team whose turn it is (they picked the question). */
  turnTeamId: string;
  /** The team with the right to answer next. Null = open to a buzz. */
  answeringTeamId: string | null;
  /** Teams who answer after the current one (a Swap sends it back to the turn team). */
  queue: string[];
  blocked: string[];
  tried: string[];
  /** Teams playing this question for double. */
  doubleDown: string[];
  /** Teams who unlocked the hint. */
  hints: string[];
  stolenBy: string | null;
  swappedTo: string | null;
  /** Server ms the tools window closes and answering starts. */
  windowEndsAt: number | null;
  events: ToolEvent[];
}

export interface ToolEvent {
  seq: number;
  teamId: string;
  tool: ToolKind;
  targetTeamId?: string;
  at: number;
}

export interface FinalState {
  /** teamId → wager. */
  wagers: Record<string, number>;
  /** teamId → written answer. */
  answers: Record<string, string>;
  /** teamId → correct?, filled as the host judges. */
  judged: Record<string, boolean>;
  /** Server ms the writing clock ends. */
  deadline: number | null;
  /** Teams whose response has been put on the big screen. */
  shown: string[];
  answerRevealed: boolean;
}

export interface HistoryEntry {
  id: string;
  /** Cell id, or "final", or "adjust" for a manual score change. */
  cellId: string;
  teamId: string;
  delta: number;
  correct: boolean | null;
  at: number;
  /** Doubled by a Double Down or a Daily Double. */
  note?: "doubleDown" | "dailyDouble" | "stolen" | "swapped" | "rebound";
  /** Reversed by the host. */
  undone?: boolean;
}

/** Last judgement, used by every screen for the right/wrong flash. */
export interface LastResult {
  seq: number;
  teamId: string;
  correct: boolean;
  delta: number;
  /** Server ms — screens only celebrate results that just happened. */
  at: number;
}

export interface RoomState {
  phase: Phase;
  teams: TeamDef[];
  /** playerId → teamId. */
  members: Record<string, string>;
  /** teamId → points. */
  scores: Record<string, number>;
  /** Competitive: teamId → tools left. Filled when the game starts. */
  tools: Record<string, Record<ToolKind, number>>;
  /** Cells answered, skipped or passed over. */
  usedCells: string[];
  /** cellId → the team that answered it right (its colour fills the cell). */
  cellWinners: Record<string, string>;
  current: CurrentQuestion | null;
  /** Traditional: the team that picks next. Competitive: whose turn it is. */
  controllerTeamId: string | null;
  buzz: BuzzState;
  /** Competitive: the current question's turn. */
  turn: TurnState | null;
  /** Daily Double wager for the current question. */
  wager: number | null;
  final: FinalState | null;
  history: HistoryEntry[];
  lastResult: LastResult | null;
  lastTool: ToolEvent | null;
  /** Players removed by the host. */
  kicked: string[];
  /** Room closed to new players. */
  locked: boolean;
  startedAt: number | null;
  endedAt: number | null;
  /** Bumped on every change — clients use it to fire animations once. */
  seq: number;
}

export interface PlayerRecord {
  id: string;
  name: string;
  color: string;
  joinedAt: string;
  lastSeenAt: string;
}

// ─── Actions ────────────────────────────────────────────────

export type HostAction =
  | { type: "start" }
  | { type: "setTeams"; teams: TeamDef[] }
  | { type: "moveMember"; playerId: string; teamId: string }
  | { type: "select"; cellId: string }
  | { type: "openBuzzers" }
  | { type: "startAnswering" }
  | { type: "judge"; correct: boolean }
  | { type: "timeout" }
  | { type: "revealAnswer" }
  | { type: "backToBoard" }
  | { type: "setWager"; amount: number; teamId?: string }
  | { type: "setController"; teamId: string | null }
  | { type: "adjustScore"; teamId: string; delta: number }
  | { type: "undo"; historyId: string }
  | { type: "useTool"; teamId: string; tool: ToolKind; targetTeamId?: string }
  | { type: "startFinal" }
  | { type: "showFinalQuestion" }
  | { type: "closeFinal" }
  | { type: "showFinalResponse"; teamId: string }
  | { type: "judgeFinal"; teamId: string; correct: boolean }
  | { type: "revealFinalAnswer" }
  | { type: "finish" }
  | { type: "kick"; playerId: string }
  | { type: "lock"; locked: boolean };

export type PlayerAction =
  | { type: "chooseTeam"; teamId: string }
  | { type: "buzz" }
  | { type: "pick"; cellId: string }
  | { type: "wager"; amount: number }
  | { type: "finalAnswer"; text: string }
  | { type: "useTool"; tool: ToolKind; targetTeamId?: string };

export type ActionResult =
  | { ok: true; state: RoomState; changed: boolean; note?: string }
  | { ok: false; error: string };
