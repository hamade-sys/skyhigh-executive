import { describe, expect, it } from "vitest";
import { generateRoomCode, isRoomCode, normalizeRoomCode, ROOM_ALPHABET } from "./codes";
import { bankableColumns, blankContent, cloneWithNewIds, contentStats, parseContent, rowValues } from "./content";
import { LIBRARY_COLUMNS, LIBRARY_TEMPLATES } from "./library";
import { cleanName } from "./names";

describe("parseContent", () => {
  it("accepts a blank board and fills defaults for older content", () => {
    const blank = blankContent();
    expect(parseContent(blank).ok).toBe(true);
    const legacy = { columns: blank.columns };
    const r = parseContent(legacy);
    expect(r.ok && r.content.settings.buzzWindowSec).toBe(10);
    expect(r.ok && r.content.final.enabled).toBe(true);
  });

  it("trims text, drops non-https images and caps lengths", () => {
    const c = blankContent(1, [200]);
    c.columns[0].questions[0].question = "  What is ICAN?  ";
    c.columns[0].questions[0].imageUrl = "javascript:alert(1)";
    c.columns[0].title = "x".repeat(70);
    const r = parseContent(c);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.content.columns[0].questions[0].question).toBe("What is ICAN?");
    expect(r.content.columns[0].questions[0].imageUrl).toBeUndefined();
    expect(r.content.columns[0].title.length).toBe(60);
  });

  it("rejects duplicate ids and too many columns", () => {
    const c = blankContent(2, [200]);
    c.columns[1].questions[0].id = c.columns[0].questions[0].id;
    expect(parseContent(c).ok).toBe(false);
    expect(parseContent(blankContent(9)).ok).toBe(false);
  });
});

describe("content helpers", () => {
  it("counts ready, half-written and blank cells", () => {
    const c = blankContent(1, [200, 400, 600]);
    c.columns[0].questions[0].question = "Q";
    c.columns[0].questions[0].answer = "A";
    c.columns[0].questions[1].question = "Q only";
    const s = contentStats(c);
    expect(s).toMatchObject({ questions: 3, ready: 1, missingAnswer: 1, missingQuestion: 0, untitledColumns: 1 });
  });

  it("only titled columns with a written question reach the bank", () => {
    const c = blankContent(3, [200]);
    c.columns[0].title = "Has content";
    c.columns[0].questions[0].question = "Q";
    c.columns[1].title = "Empty";
    c.columns[2].questions[0].question = "Untitled";
    expect(bankableColumns(c).map((col) => col.title)).toEqual(["Has content"]);
  });

  it("copies get fresh ids and drop Daily Doubles from columns", () => {
    const c = blankContent(1, [200]);
    c.columns[0].questions[0].dailyDouble = true;
    const copy = cloneWithNewIds(c);
    expect(copy.columns[0].id).not.toBe(c.columns[0].id);
    expect(copy.columns[0].questions[0].id).not.toBe(c.columns[0].questions[0].id);
    expect(copy.columns[0].questions[0].dailyDouble).toBe(false);
    expect(rowValues(c)).toEqual([200]);
  });
});

describe("the ICAN library", () => {
  it("every template is valid, playable content with unique ids", () => {
    const ids = new Set<string>();
    for (const t of LIBRARY_TEMPLATES) {
      const r = parseContent(t.content);
      expect(r.ok, t.id).toBe(true);
      expect(t.id.startsWith("lib:")).toBe(true);
      const stats = contentStats(t.content);
      expect(stats.ready, t.id).toBe(stats.questions);
      expect(stats.finalReady, t.id).toBe(true);
      for (const c of t.content.columns) {
        for (const q of c.questions) {
          expect(ids.has(q.id), q.id).toBe(false);
          ids.add(q.id);
        }
      }
    }
    for (const c of LIBRARY_COLUMNS) {
      expect(c.title.trim().length).toBeGreaterThan(0);
      expect(c.questions.every((q) => q.question && q.answer)).toBe(true);
    }
  });
});

describe("room codes and names", () => {
  it("codes are four consonants and round-trip through normalisation", () => {
    for (let i = 0; i < 200; i++) {
      const code = generateRoomCode();
      expect(isRoomCode(code)).toBe(true);
      expect([...code].every((ch) => ROOM_ALPHABET.includes(ch))).toBe(true);
    }
    expect(normalizeRoomCode(" bc-df ")).toBe("BCDF");
    expect(isRoomCode("BCDA")).toBe(false);
    expect(isRoomCode("BCD")).toBe(false);
  });

  it("names lose control and bidi characters and are capped", () => {
    expect(cleanName("  Team‮  Falcon  ")).toBe("Team Falcon");
    expect(cleanName("x".repeat(40)).length).toBe(20);
  });
});
