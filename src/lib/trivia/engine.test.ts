import { describe, expect, it } from "vitest";
import { blankContent, defaultTeams } from "./content";
import { applyHost, applyPlayer, initialState, smallestTeam, standings, toolOptions, type EngineContext } from "./engine";
import type { ActionResult, GameMode, HostAction, PlayerAction, RoomState, TriviaContent } from "./types";

// Three players on three teams: A on t1, B on t2, C on t3. D is a second t1 player.
const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const C = "33333333-3333-4333-8333-333333333333";
const D = "44444444-4444-4444-8444-444444444444";
const T1 = "t1";
const T2 = "t2";
const T3 = "t3";

function board(mode: GameMode = "traditional"): TriviaContent {
  const content = blankContent(2, [200, 400]);
  content.columns[0].title = "Leadership";
  content.columns[1].title = "Strategy";
  content.columns.forEach((c, ci) =>
    c.questions.forEach((q, ri) => {
      q.id = `c${ci}r${ri}`;
      q.question = `Question ${ci}-${ri}`;
      q.answer = `Answer ${ci}-${ri}`;
    }),
  );
  content.columns[1].questions[1].dailyDouble = true;
  content.columns[0].questions[0].hint = "Think of Drucker";
  content.final = { enabled: true, category: "Finale", question: "Final question", answer: "Final answer" };
  content.settings.mode = mode;
  content.settings.teams = defaultTeams(3);
  return content;
}

const clock = 1_000_000;
function ctx(content: TriviaContent, now = clock, playerIds = [A, B, C, D]): EngineContext {
  return { content, playerIds, now };
}

function must(result: ActionResult): RoomState {
  if (!result.ok) throw new Error(result.error);
  return result.state;
}

function makeGame(mode: GameMode = "traditional") {
  const content = board(mode);
  let s = initialState(content.settings.teams);
  const c = () => ctx(content);
  const host = (action: HostAction, now?: number) => {
    s = must(applyHost(s, action, ctx(content, now)));
    return s;
  };
  const player = (id: string, action: PlayerAction, now?: number) => {
    s = must(applyPlayer(s, id, action, ctx(content, now)));
    return s;
  };
  const tryHost = (action: HostAction, now?: number) => applyHost(s, action, ctx(content, now));
  const tryPlayer = (id: string, action: PlayerAction, now?: number) => applyPlayer(s, id, action, ctx(content, now));
  // Seat everyone.
  player(A, { type: "chooseTeam", teamId: T1 });
  player(B, { type: "chooseTeam", teamId: T2 });
  player(C, { type: "chooseTeam", teamId: T3 });
  player(D, { type: "chooseTeam", teamId: T1 });
  return { content, get s() { return s; }, set s(v: RoomState) { s = v; }, c, host, player, tryHost, tryPlayer };
}

describe("teams", () => {
  it("players choose a team in the lobby but can't hop teams mid-game", () => {
    const g = makeGame();
    expect(g.s.members).toEqual({ [A]: T1, [B]: T2, [C]: T3, [D]: T1 });
    g.host({ type: "start" });
    expect(g.tryPlayer(A, { type: "chooseTeam", teamId: T2 }).ok).toBe(false);
    // The host can still move people.
    g.host({ type: "moveMember", playerId: A, teamId: T2 });
    expect(g.s.members[A]).toBe(T2);
  });

  it("auto-assign fills the smallest team first", () => {
    const g = makeGame();
    expect(smallestTeam(g.s, [A, B, C, D])).toBe(T2);
  });

  it("teams can be renamed any time but only added or removed in the lobby", () => {
    const g = makeGame();
    const four = [...g.s.teams, { id: "t4", name: "Oryx", color: "#B39DFF" }];
    g.host({ type: "setTeams", teams: four });
    expect(g.s.teams).toHaveLength(4);
    expect(g.tryHost({ type: "setTeams", teams: [...four, { id: "t5", name: "Falcons", color: "#56A98F" }] }).ok).toBe(false); // duplicate name
    g.host({ type: "start" });
    expect(g.tryHost({ type: "setTeams", teams: four.slice(0, 3) }).ok).toBe(false);
    g.host({ type: "setTeams", teams: four.map((t) => (t.id === T1 ? { ...t, name: "Hawks" } : t)) });
    expect(g.s.teams[0].name).toBe("Hawks");
  });

  it("can't start until someone is on a team, and needs a playable board", () => {
    const content = board();
    const empty = initialState(content.settings.teams);
    expect(applyHost(empty, { type: "start" }, ctx(content)).ok).toBe(false);
  });
});

describe("traditional mode", () => {
  it("buzz → answer → reveal, scoring the team and colouring the cell", () => {
    const g = makeGame();
    g.host({ type: "start" });
    g.host({ type: "select", cellId: "c0r0" });
    expect(g.s.phase).toBe("question");
    const early = g.tryPlayer(A, { type: "buzz" });
    expect(early.ok && !early.changed && early.note).toBe("early");
    g.host({ type: "openBuzzers" });
    g.player(D, { type: "buzz" }); // D buzzes for team 1
    expect(g.s.buzz.winnerTeamId).toBe(T1);
    expect(g.s.buzz.winnerPlayerId).toBe(D);
    const late = g.tryPlayer(B, { type: "buzz" });
    expect(late.ok && !late.changed && late.note).toBe("beaten");
    g.host({ type: "judge", correct: true });
    expect(g.s.scores[T1]).toBe(200);
    expect(g.s.controllerTeamId).toBe(T1);
    expect(g.s.cellWinners.c0r0).toBe(T1);
    g.host({ type: "backToBoard" });
    expect(g.s.usedCells).toEqual(["c0r0"]);
  });

  it("a wrong answer locks the whole team out and re-opens for the rest", () => {
    const g = makeGame();
    g.host({ type: "start" });
    g.host({ type: "select", cellId: "c0r1" });
    g.host({ type: "openBuzzers" });
    g.player(A, { type: "buzz" });
    g.host({ type: "judge", correct: false });
    expect(g.s.scores[T1]).toBe(-400);
    expect(g.s.phase).toBe("buzzing");
    // D is on the same team: locked out too.
    const teammate = g.tryPlayer(D, { type: "buzz" });
    expect(teammate.ok && !teammate.changed && teammate.note).toBe("locked");
    g.player(C, { type: "buzz" });
    expect(g.s.buzz.winnerTeamId).toBe(T3);
  });

  it("Daily Double: the team in control wagers, any teammate can lock it in", () => {
    const g = makeGame();
    g.host({ type: "start" });
    g.host({ type: "setController", teamId: T1 });
    g.host({ type: "select", cellId: "c1r1" });
    expect(g.s.phase).toBe("dd_wager");
    expect(g.tryPlayer(B, { type: "wager", amount: 100 }).ok).toBe(false);
    expect(g.tryPlayer(D, { type: "wager", amount: 401 }).ok).toBe(false);
    g.player(D, { type: "wager", amount: 400 });
    g.host({ type: "judge", correct: false });
    expect(g.s.scores[T1]).toBe(-400);
  });

  it("closes the buzzers after the window, with a little grace", () => {
    const g = makeGame();
    g.host({ type: "start" });
    g.host({ type: "select", cellId: "c0r0" });
    g.host({ type: "openBuzzers" }, clock);
    expect(g.tryPlayer(A, { type: "buzz" }, clock + 10_200).ok).toBe(true);
    const tooLate = g.tryPlayer(A, { type: "buzz" }, clock + 11_000);
    expect(tooLate.ok && !tooLate.changed && tooLate.note).toBe("closed");
    expect(g.host({ type: "timeout" }, clock + 10_001).phase).toBe("reveal");
  });

  it("tools don't exist in Traditional", () => {
    const g = makeGame();
    g.host({ type: "start" });
    g.host({ type: "select", cellId: "c0r0" });
    expect(g.tryPlayer(B, { type: "useTool", tool: "steal" }).ok).toBe(false);
    expect(toolOptions(g.s, g.content, { playerIds: [A, B, C, D] }, T2)).toEqual([]);
  });
});

describe("competitive mode — turns", () => {
  it("team 1 starts, picks, answers after the tools window; turns rotate", () => {
    const g = makeGame("competitive");
    g.host({ type: "start" });
    expect(g.s.controllerTeamId).toBe(T1);
    expect(g.s.tools[T1]).toMatchObject({ steal: 1, hint: 2, block: 1, swap: 1, skip: 1, doubleDown: 1 });
    // Only team 1 can pick.
    expect(g.tryPlayer(B, { type: "pick", cellId: "c0r0" }).ok).toBe(false);
    g.player(A, { type: "pick", cellId: "c0r0" });
    expect(g.s.phase).toBe("question");
    expect(g.s.turn?.answeringTeamId).toBe(T1);
    expect(g.s.turn?.windowEndsAt).toBe(clock + 8_000);
    g.host({ type: "startAnswering" });
    expect(g.s.phase).toBe("answering");
    expect(g.s.buzz.winnerTeamId).toBe(T1);
    g.host({ type: "judge", correct: true });
    expect(g.s.cellWinners.c0r0).toBe(T1);
    g.host({ type: "backToBoard" });
    expect(g.s.controllerTeamId).toBe(T2);
  });

  it("Daily Double cells play as normal questions", () => {
    const g = makeGame("competitive");
    g.host({ type: "start" });
    g.host({ type: "select", cellId: "c1r1" });
    expect(g.s.phase).toBe("question");
    expect(g.s.current?.dailyDouble).toBe(false);
  });

  it("a miss passes to a rebound buzz among the other teams", () => {
    const g = makeGame("competitive");
    g.host({ type: "start" });
    g.host({ type: "select", cellId: "c0r1" });
    g.host({ type: "startAnswering" });
    g.host({ type: "judge", correct: false });
    expect(g.s.scores[T1]).toBe(-400);
    expect(g.s.phase).toBe("buzzing");
    expect(g.s.buzz.lockedOut).toEqual([T1]);
    g.player(C, { type: "buzz" });
    g.host({ type: "judge", correct: true });
    expect(g.s.scores[T3]).toBe(400);
    expect(g.s.history.at(-1)?.note).toBe("rebound");
    g.host({ type: "backToBoard" });
    // Turn still moves on from team 1, not to whoever answered.
    expect(g.s.controllerTeamId).toBe(T2);
  });

  it("with rebounds off, a miss goes straight to the answer", () => {
    const g = makeGame("competitive");
    g.content.settings.reboundOnMiss = false;
    g.host({ type: "start" });
    g.host({ type: "select", cellId: "c0r1" });
    g.host({ type: "startAnswering" });
    g.host({ type: "judge", correct: false });
    expect(g.s.phase).toBe("reveal");
  });
});

describe("competitive mode — tools", () => {
  function atQuestion(cell = "c0r1") {
    const g = makeGame("competitive");
    g.host({ type: "start" });
    g.host({ type: "select", cellId: cell });
    return g;
  }

  it("Steal: another team takes the question before the holder answers", () => {
    const g = atQuestion();
    expect(g.tryPlayer(A, { type: "useTool", tool: "steal" }).ok).toBe(false); // can't steal your own
    g.player(B, { type: "useTool", tool: "steal" });
    expect(g.s.turn?.answeringTeamId).toBe(T2);
    expect(g.s.tools[T2].steal).toBe(0);
    expect(g.s.lastTool).toMatchObject({ teamId: T2, tool: "steal" });
    // Only one steal per question.
    expect(g.tryPlayer(C, { type: "useTool", tool: "steal" }).ok).toBe(false);
    g.host({ type: "startAnswering" });
    g.host({ type: "judge", correct: true });
    expect(g.s.scores[T2]).toBe(400);
    expect(g.s.history.at(-1)?.note).toBe("stolen");
    // Used up for the rest of the game.
    g.host({ type: "backToBoard" });
    g.host({ type: "select", cellId: "c0r0" });
    const again = toolOptions(g.s, g.content, { playerIds: [A, B, C, D] }, T2).find((o) => o.tool === "steal");
    expect(again?.disabled).toBe("Used up");
  });

  it("Steal only before the answer clock starts", () => {
    const g = atQuestion();
    g.host({ type: "startAnswering" });
    expect(g.tryPlayer(B, { type: "useTool", tool: "steal" }).ok).toBe(false);
  });

  it("Block: the blocked holder loses the question; it opens to the others", () => {
    const g = atQuestion();
    expect(g.tryPlayer(B, { type: "useTool", tool: "block" }).ok).toBe(false); // needs a target
    g.player(B, { type: "useTool", tool: "block", targetTeamId: T1 });
    expect(g.s.turn?.blocked).toEqual([T1]);
    expect(g.s.turn?.answeringTeamId).toBeNull();
    g.host({ type: "startAnswering" });
    expect(g.s.phase).toBe("buzzing");
    expect(g.s.buzz.lockedOut).toContain(T1);
    const blocked = g.tryPlayer(A, { type: "buzz" });
    expect(blocked.ok && !blocked.changed && blocked.note).toBe("locked");
    g.player(B, { type: "buzz" });
    expect(g.s.buzz.winnerTeamId).toBe(T2);
  });

  it("Swap: the receiving team gets 10 seconds; a miss sends it back to the turn team", () => {
    const g = atQuestion();
    expect(g.tryPlayer(B, { type: "useTool", tool: "swap", targetTeamId: T3 }).ok).toBe(false); // not their turn
    g.player(A, { type: "useTool", tool: "swap", targetTeamId: T3 });
    expect(g.s.turn?.answeringTeamId).toBe(T3);
    g.host({ type: "startAnswering" }, clock);
    expect(g.s.buzz.answerDeadline).toBe(clock + 10_000);
    g.host({ type: "judge", correct: false });
    expect(g.s.phase).toBe("answering");
    expect(g.s.buzz.winnerTeamId).toBe(T1);
    expect(g.s.buzz.answerDeadline).toBe(clock + 8_000);
    g.host({ type: "judge", correct: true });
    expect(g.s.scores).toMatchObject({ [T3]: -400, [T1]: 400 });
  });

  it("Skip: the question is retired and the same team picks again", () => {
    const g = atQuestion();
    expect(g.tryPlayer(B, { type: "useTool", tool: "skip" }).ok).toBe(false);
    g.player(D, { type: "useTool", tool: "skip" });
    expect(g.s.phase).toBe("board");
    expect(g.s.usedCells).toContain("c0r1");
    expect(g.s.cellWinners.c0r1).toBeUndefined();
    expect(g.s.controllerTeamId).toBe(T1);
  });

  it("Double Down: right = double; wrong = lose the value, even without negative scoring", () => {
    const g = atQuestion();
    g.content.settings.negativeScoring = false;
    expect(g.tryPlayer(B, { type: "useTool", tool: "doubleDown" }).ok).toBe(false); // not holding it
    g.player(A, { type: "useTool", tool: "doubleDown" });
    g.host({ type: "startAnswering" });
    g.host({ type: "judge", correct: true });
    expect(g.s.scores[T1]).toBe(800);

    const g2 = atQuestion("c0r0");
    g2.content.settings.negativeScoring = false;
    g2.player(A, { type: "useTool", tool: "doubleDown" });
    g2.host({ type: "startAnswering" });
    g2.host({ type: "judge", correct: false });
    expect(g2.s.scores[T1]).toBe(-200);
  });

  it("Double Down doesn't follow a team onto a rebound", () => {
    const g = atQuestion();
    g.player(A, { type: "useTool", tool: "doubleDown" });
    g.player(B, { type: "useTool", tool: "steal" });
    g.host({ type: "startAnswering" });
    g.host({ type: "judge", correct: false }); // team 2 misses
    g.player(A, { type: "buzz" }); // team 1 rebounds
    g.host({ type: "judge", correct: true });
    expect(g.s.scores[T1]).toBe(400);
  });

  it("Hint: two per team, once per question, usable while answering", () => {
    const g = atQuestion("c0r0");
    g.host({ type: "startAnswering" });
    g.player(A, { type: "useTool", tool: "hint" });
    expect(g.s.turn?.hints).toEqual([T1]);
    expect(g.s.tools[T1].hint).toBe(1);
    expect(g.tryPlayer(D, { type: "useTool", tool: "hint" }).ok).toBe(false); // same question
  });

  it("the host can play a tool for a team", () => {
    const g = atQuestion();
    g.host({ type: "useTool", teamId: T3, tool: "steal" });
    expect(g.s.turn?.answeringTeamId).toBe(T3);
  });

  it("tool counts follow the settings; 0 turns a tool off", () => {
    const g = makeGame("competitive");
    g.content.settings.tools = { steal: 0, hint: 3, block: 1, swap: 1, skip: 1, doubleDown: 2 };
    g.host({ type: "start" });
    expect(g.s.tools[T1]).toMatchObject({ steal: 0, hint: 3, doubleDown: 2 });
    g.host({ type: "select", cellId: "c0r0" });
    const kinds = toolOptions(g.s, g.content, { playerIds: [A, B, C, D] }, T2).map((o) => o.tool);
    expect(kinds).not.toContain("steal");
  });
});

describe("Final Trivia", () => {
  it("team wagers are capped at the team's score; judging is correctable", () => {
    const g = makeGame();
    g.host({ type: "start" });
    g.host({ type: "adjustScore", teamId: T1, delta: 600 });
    g.host({ type: "adjustScore", teamId: T2, delta: -200 });
    g.host({ type: "startFinal" });
    expect(g.tryPlayer(A, { type: "wager", amount: 601 }).ok).toBe(false);
    g.player(D, { type: "wager", amount: 500 }); // a teammate wagers for team 1
    expect(g.tryPlayer(B, { type: "wager", amount: 1 }).ok).toBe(false);
    g.host({ type: "showFinalQuestion" }, 2_000_000);
    g.player(A, { type: "finalAnswer", text: " Final answer " }, 2_010_000);
    expect(g.s.final?.answers[T1]).toBe("Final answer");
    expect(g.tryPlayer(C, { type: "finalAnswer", text: "late" }, 2_040_000).ok).toBe(false);
    g.host({ type: "closeFinal" }, 2_030_000);
    expect(g.s.final?.wagers[T3]).toBe(0);
    g.host({ type: "judgeFinal", teamId: T1, correct: false });
    expect(g.s.scores[T1]).toBe(100);
    g.host({ type: "judgeFinal", teamId: T1, correct: true });
    expect(g.s.scores[T1]).toBe(1100);
    g.host({ type: "finish" });
    expect(standings(g.s)[0]).toEqual({ teamId: T1, score: 1100, rank: 1 });
  });
});

describe("host tools", () => {
  it("undo reverses a score change once and clears the cell colour", () => {
    const g = makeGame();
    g.host({ type: "start" });
    g.host({ type: "select", cellId: "c0r0" });
    g.host({ type: "openBuzzers" });
    g.player(A, { type: "buzz" });
    g.host({ type: "judge", correct: true });
    const entry = g.s.history.at(-1)!;
    g.host({ type: "undo", historyId: entry.id });
    expect(g.s.scores[T1]).toBe(0);
    expect(g.s.cellWinners.c0r0).toBeUndefined();
    const twice = g.tryHost({ type: "undo", historyId: entry.id });
    expect(twice.ok && !twice.changed).toBe(true);
  });

  it("removing the only player on the answering team moves the question on", () => {
    const g = makeGame();
    g.host({ type: "start" });
    g.host({ type: "select", cellId: "c0r0" });
    g.host({ type: "openBuzzers" });
    g.player(B, { type: "buzz" });
    g.host({ type: "kick", playerId: B });
    expect(g.s.phase).toBe("buzzing");
    expect(g.tryPlayer(B, { type: "buzz" }).ok).toBe(false);
  });

  it("standings share a rank on a tie", () => {
    const g = makeGame();
    g.host({ type: "start" });
    g.host({ type: "adjustScore", teamId: T1, delta: 200 });
    g.host({ type: "adjustScore", teamId: T2, delta: 200 });
    expect(standings(g.s).map((r) => r.rank)).toEqual([1, 1, 3]);
  });

  it("every change bumps seq; no-ops don't", () => {
    const g = makeGame();
    const before = g.s.seq;
    g.host({ type: "lock", locked: true });
    expect(g.s.seq).toBe(before + 1);
    const same = g.tryHost({ type: "lock", locked: true });
    expect(same.ok && same.state.seq).toBe(g.s.seq);
  });
});
