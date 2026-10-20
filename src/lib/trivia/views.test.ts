import { describe, expect, it } from "vitest";
import { blankContent, defaultTeams } from "./content";
import { applyHost, applyPlayer, initialState } from "./engine";
import type { GameMode, HostAction, PlayerAction, PlayerRecord, RoomState, TriviaContent } from "./types";
import { buildView, type ViewRole } from "./views";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";

function content(mode: GameMode = "traditional"): TriviaContent {
  const c = blankContent(1, [200, 400]);
  c.columns[0].id = "col1";
  c.columns[0].title = "Secrets";
  c.columns[0].questions[0] = { id: "q1", value: 200, question: "Q-ONE?", answer: "SECRET-ANSWER-ONE", notes: "HOST-NOTE", hint: "SECRET-HINT" };
  c.columns[0].questions[1] = { id: "q2", value: 400, question: "Q-TWO?", answer: "SECRET-ANSWER-TWO", dailyDouble: true };
  c.final = { enabled: true, category: "Last", question: "FINAL-QUESTION", answer: "FINAL-SECRET" };
  c.settings.mode = mode;
  c.settings.teams = defaultTeams(2);
  return c;
}

const now = 5_000_000;
const players: PlayerRecord[] = [
  { id: A, name: "Alpha", color: "#00C2CB", joinedAt: new Date(now).toISOString(), lastSeenAt: new Date(now).toISOString() },
  { id: B, name: "Beta", color: "#F7E300", joinedAt: new Date(now).toISOString(), lastSeenAt: new Date(now - 60_000).toISOString() },
];

function game(mode: GameMode = "traditional") {
  const c = content(mode);
  let s: RoomState = initialState(c.settings.teams);
  const ctx = { content: c, playerIds: [A, B], now };
  const host = (a: HostAction) => {
    const r = applyHost(s, a, ctx);
    if (!r.ok) throw new Error(r.error);
    s = r.state;
  };
  const player = (id: string, a: PlayerAction) => {
    const r = applyPlayer(s, id, a, ctx);
    if (!r.ok) throw new Error(r.error);
    s = r.state;
  };
  player(A, { type: "chooseTeam", teamId: "t1" });
  player(B, { type: "chooseTeam", teamId: "t2" });
  const view = (role: ViewRole, playerId?: string) =>
    buildView({ room: { id: "room", code: "BCDF", title: "T", status: "playing", version: 1, content: c, state: s }, players, role, playerId, now });
  const leaks = (role: ViewRole, secret: string, playerId?: string) => JSON.stringify(view(role, playerId)).includes(secret);
  return { host, player, view, leaks, get s() { return s; } };
}

describe("views never leak answers early", () => {
  it("the board and the open question carry no answer for display or players", () => {
    const g = game();
    g.host({ type: "start" });
    for (const role of ["display", "player"] as const) {
      expect(g.leaks(role, "SECRET-ANSWER", A)).toBe(false);
      expect(g.leaks(role, "Q-ONE", A)).toBe(false);
    }
    g.host({ type: "select", cellId: "q1" });
    g.host({ type: "openBuzzers" });
    expect(g.view("display").current?.question).toBe("Q-ONE?");
    expect(g.leaks("display", "SECRET-ANSWER-ONE")).toBe(false);
    expect(g.leaks("player", "SECRET-ANSWER-ONE", A)).toBe(false);
    expect(g.leaks("display", "HOST-NOTE")).toBe(false);
    expect(g.view("host").current?.answer).toBe("SECRET-ANSWER-ONE");
    expect(g.view("host").current?.notes).toBe("HOST-NOTE");
    g.host({ type: "revealAnswer" });
    expect(g.view("display").current?.answer).toBe("SECRET-ANSWER-ONE");
    expect(g.leaks("display", "HOST-NOTE")).toBe(false);
  });

  it("a Daily Double hides its question until the wager is in", () => {
    const g = game();
    g.host({ type: "start" });
    g.host({ type: "setController", teamId: "t1" });
    g.host({ type: "select", cellId: "q2" });
    expect(g.leaks("display", "Q-TWO")).toBe(false);
    expect(g.view("player", A).me?.wagerRange).toEqual({ min: 5, max: 400 });
    expect(g.view("player", B).me?.wagerRange).toBeNull();
    g.host({ type: "setWager", amount: 100 });
    expect(g.view("display").current?.question).toBe("Q-TWO?");
    expect(g.leaks("display", "SECRET-ANSWER-TWO")).toBe(false);
  });

  it("a hint shows only on the phones of the team that unlocked it", () => {
    const g = game("competitive");
    g.host({ type: "start" });
    g.host({ type: "select", cellId: "q1" });
    expect(g.leaks("player", "SECRET-HINT", A)).toBe(false);
    g.player(A, { type: "useTool", tool: "hint" });
    expect(g.view("player", A).current?.hint).toBe("SECRET-HINT");
    expect(g.leaks("player", "SECRET-HINT", B)).toBe(false);
    expect(g.leaks("display", "SECRET-HINT")).toBe(false);
    // Everyone can see that a hint was used.
    expect(g.view("display").turn?.hints).toEqual(["t1"]);
    expect(g.view("host").current?.hint).toBe("SECRET-HINT");
  });

  it("Final Trivia keeps wagers, other teams' answers and the answer hidden until their moment", () => {
    const g = game();
    g.host({ type: "start" });
    g.host({ type: "adjustScore", teamId: "t1", delta: 500 });
    g.host({ type: "startFinal" });
    expect(g.leaks("display", "FINAL-QUESTION")).toBe(false);
    g.player(A, { type: "wager", amount: 300 });
    expect(JSON.stringify(g.view("player", B))).not.toMatch(/\b300\b/);
    expect(g.view("display").final?.wagered).toEqual(["t1"]);
    expect(g.view("player", A).me?.finalWager).toBe(300);
    g.host({ type: "showFinalQuestion" });
    expect(g.view("display").final?.question).toBe("FINAL-QUESTION");
    g.player(A, { type: "finalAnswer", text: "ALPHA-WROTE-THIS" });
    expect(g.leaks("player", "ALPHA-WROTE-THIS", B)).toBe(false);
    expect(g.leaks("display", "ALPHA-WROTE-THIS")).toBe(false);
    expect(g.view("player", A).me?.finalAnswer).toBe("ALPHA-WROTE-THIS");
    g.host({ type: "closeFinal" });
    expect(g.leaks("display", "ALPHA-WROTE-THIS")).toBe(false);
    g.host({ type: "showFinalResponse", teamId: "t1" });
    expect(g.view("display").final?.responses).toEqual([{ teamId: "t1", answer: "ALPHA-WROTE-THIS", wager: 300, correct: null }]);
    expect(g.leaks("display", "FINAL-SECRET")).toBe(false);
    g.host({ type: "revealFinalAnswer" });
    expect(g.view("display").final?.answer).toBe("FINAL-SECRET");
  });

  it("only the host gets the full board and the score log", () => {
    const g = game();
    g.host({ type: "start" });
    expect(g.view("host").content).not.toBeNull();
    expect(g.view("display").content).toBeNull();
    expect(g.view("display").history).toBeNull();
    expect(g.view("player", A).content).toBeNull();
  });
});

describe("teams in the view", () => {
  it("lists members per team, team scores and presence", () => {
    const g = game();
    const v = g.view("display");
    expect(v.teams.map((t) => t.members.map((m) => m.name))).toEqual([["Alpha"], ["Beta"]]);
    expect(v.players.find((p) => p.id === A)?.connected).toBe(true);
    expect(v.players.find((p) => p.id === B)?.connected).toBe(false);
  });

  it("a correct answer colours the cell with the team's id", () => {
    const g = game();
    g.host({ type: "start" });
    g.host({ type: "select", cellId: "q1" });
    g.host({ type: "openBuzzers" });
    g.player(B, { type: "buzz" });
    g.host({ type: "judge", correct: true });
    g.host({ type: "backToBoard" });
    expect(g.view("display").board[0].cells[0]).toMatchObject({ used: true, winnerTeamId: "t2" });
  });

  it("phones get their team's usable tools in Competitive", () => {
    const g = game("competitive");
    g.host({ type: "start" });
    g.host({ type: "select", cellId: "q1" });
    const mine = g.view("player", B).me?.tools ?? [];
    expect(mine.find((t) => t.tool === "steal")?.disabled).toBeNull();
    expect(mine.find((t) => t.tool === "skip")?.disabled).toBe("Only on your own turn");
  });
});
