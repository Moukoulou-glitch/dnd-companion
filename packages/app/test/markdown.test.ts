import { describe, expect, it } from "vitest";
import type { Note } from "@dnd/schema";
import { parseInline, parseMarkdown, plainText, safeHref } from "../src/markdown.js";
import { formatWorld, fromDate, parseWorld } from "../src/calendar.js";
import { groupNotes } from "../src/components/BackstoryTab.js";

describe("Markdown in the Backstory and notes", () => {
  it("headings, bold, italics and lists", () => {
    const b = parseMarkdown("# Early years\n\nBorn in **Myrtos**, raised by *wolves*.\n\n- a sister\n- a debt\n  - 40 gp\n\n1. first\n2. second");
    expect(b[0]).toEqual({ t: "h", level: 1, c: [{ t: "text", v: "Early years" }] });
    expect(b[1]).toEqual({
      t: "p",
      c: [{ t: "text", v: "Born in " }, { t: "b", c: [{ t: "text", v: "Myrtos" }] }, { t: "text", v: ", raised by " }, { t: "i", c: [{ t: "text", v: "wolves" }] }, { t: "text", v: "." }],
    });
    expect(b[2]).toMatchObject({ t: "ul", items: [{ c: [{ t: "text", v: "a sister" }] }, { c: [{ t: "text", v: "a debt" }], sub: { t: "ul", items: [{ c: [{ t: "text", v: "40 gp" }] }] } }] });
    expect(b[3]).toMatchObject({ t: "ol", start: 1, items: [{}, {}] });
  });

  it("plain text from before reads the same: line breaks stay, blank lines make paragraphs", () => {
    const b = parseMarkdown("Line one\nline two\n\nNext part");
    expect(b).toEqual([
      { t: "p", c: [{ t: "text", v: "Line one" }, { t: "br" }, { t: "text", v: "line two" }] },
      { t: "p", c: [{ t: "text", v: "Next part" }] },
    ]);
    // Things that only look a little like Markdown stay text.
    expect(parseMarkdown("#1 rule: 2 * 3 = 6, snake_case_name")).toEqual([{ t: "p", c: [{ t: "text", v: "#1 rule: 2 * 3 = 6, snake_case_name" }] }]);
    expect(parseInline("\\*not italic\\*")).toEqual([{ t: "text", v: "*not italic*" }]);
  });

  it("HTML is never HTML: it stays text", () => {
    expect(parseMarkdown('<script>alert(1)</script><img src=x onerror="x()">')).toEqual([{ t: "p", c: [{ t: "text", v: '<script>alert(1)</script><img src=x onerror="x()">' }] }]);
  });

  it("links: web and email open, anything else stays plain text", () => {
    expect(parseInline("[map](https://example.com/map)")).toEqual([{ t: "a", href: "https://example.com/map", c: [{ t: "text", v: "map" }] }]);
    expect(parseInline("[DM](mailto:dm@example.com)")).toEqual([{ t: "a", href: "mailto:dm@example.com", c: [{ t: "text", v: "DM" }] }]);
    expect(parseInline("see https://example.com/a.")).toEqual([{ t: "text", v: "see " }, { t: "a", href: "https://example.com/a", c: [{ t: "text", v: "https://example.com/a" }] }, { t: "text", v: "." }]);
    expect(parseInline("www.example.com")).toEqual([{ t: "a", href: "https://www.example.com", c: [{ t: "text", v: "www.example.com" }] }]);
    for (const bad of ["javascript:alert(1)", "JaVaScRiPt:alert(1)", "data:text/html,<b>x</b>", "vbscript:x", "file:///etc/passwd", "/relative", "//evil.example"]) {
      const r = parseInline(`[click](${bad})`);
      expect(r).toHaveLength(1);
      expect(r[0]!.t).toBe("badlink");
    }
    expect(safeHref("java\tscript:alert(1)")).toBeUndefined();
    expect(safeHref(" javascript:alert(1)")).toBeUndefined();
    expect(safeHref("https://")).toBeUndefined();
    expect(safeHref("mailto:")).toBeUndefined();
    expect(safeHref("http://example.com")).toBe("http://example.com");
    expect(parseInline("[Ajax](https://en.wikipedia.org/wiki/Ajax_(play))")[0]).toMatchObject({ t: "a", href: "https://en.wikipedia.org/wiki/Ajax_(play)" });
  });

  it("word count from the words only", () => {
    expect(plainText("# Title\n\n**Two** words and [a link](https://x.example)")).toBe("Title Two words and a link");
  });
});

describe("Notes by date", () => {
  const cal = { kind: "mithiologio" as const, minutes: 0, followRests: true };
  const at = (d: { year: number; month: number; day: number; hour: number; minute: number }) => fromDate(d, "mithiologio");
  const note = (id: string, extra: Partial<Note>): Note => ({ id, category: "none", title: id, body: "", pinned: false, ...extra });

  it("an older note's date text reads back on the same calendar, and not on another", () => {
    const m = at({ year: 521, month: 2, day: 25, hour: 20, minute: 30 });
    const text = formatWorld(m, "mithiologio");
    expect(parseWorld(text, "mithiologio")).toBe(m);
    expect(parseWorld(text, "normal")).toBeUndefined();
    expect(parseWorld("not a date", "mithiologio")).toBeUndefined();
  });

  it("by in-world day: latest day first, the day's notes in order, undated last", () => {
    const d1 = at({ year: 521, month: 2, day: 25, hour: 9, minute: 0 });
    const d1late = at({ year: 521, month: 2, day: 25, hour: 21, minute: 0 });
    const d2 = at({ year: 521, month: 2, day: 27, hour: 8, minute: 0 });
    const notes = [
      note("late", { gameMinutes: d1late, createdAt: "2026-01-01T00:00:00Z" }),
      note("old-text", { gameDate: formatWorld(d1, "mithiologio"), createdAt: "2026-01-02T00:00:00Z" }),
      note("later-day", { gameMinutes: d2 }),
      note("undated", {}),
    ];
    const g = groupNotes(notes, "world", cal);
    expect(g.map((x) => x.notes.map((n) => n.id))).toEqual([["later-day"], ["old-text", "late"], ["undated"]]);
    expect(g[1]!.label).toContain("25");
    expect(g[2]!.label).toBe("No in-world date");
  });

  it("by session, and newest written with pinned first", () => {
    const notes = [note("a", { session: 1, createdAt: "2026-01-01T00:00:00Z" }), note("b", { session: 2, createdAt: "2026-01-03T00:00:00Z" }), note("c", { pinned: true, createdAt: "2026-01-02T00:00:00Z" })];
    expect(groupNotes(notes, "session", cal).map((x) => x.label)).toEqual(["Session 2", "Session 1", "No session"]);
    expect(groupNotes(notes, "written", cal)[0]!.notes.map((n) => n.id)).toEqual(["c", "b", "a"]);
  });
});
