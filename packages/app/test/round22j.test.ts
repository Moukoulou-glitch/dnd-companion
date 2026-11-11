import { describe, expect, it } from "vitest";
import { Character } from "@dnd/schema";
import { actionDays, interventionNote, lastsDaysNote, spellDays } from "../src/everyDays.js";
import { moveIncrease } from "../src/components/RaceBonus.js";
import { opFx } from "../src/fx/triggers.js";
import { specOf } from "../src/fx/FxLayer.js";
import { fromDate } from "../src/calendar.js";

const story = (kind: "normal" | "mithiologio" = "mithiologio") =>
  Character.parse({ id: "x", schemaVersion: 1, ruleset: "5e-2014", name: "X", abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 16, cha: 10 }, race: "race:human", classes: [{ class: "class:cleric", level: 12 }], hp: { current: 1, temp: 0 }, story: { session: 4, calendar: { kind, minutes: fromDate({ year: 521, month: 7, day: 25, hour: 20, minute: 30 }, kind) } } });

describe("22j: race increases never share an ability", () => {
  const tiefling = { cha: 2, int: 1 } as const;
  it("picking a taken ability swaps the two", () => {
    expect(moveIncrease(tiefling, {}, "cha", "int")).toEqual({ cha: "int", int: "cha" });
    expect(moveIncrease(tiefling, {}, "cha", "dex")).toEqual({ cha: "dex" });
    // Moved back where it started: no move left.
    expect(moveIncrease(tiefling, { cha: "dex" }, "cha", "cha")).toEqual({});
  });
});

describe("22j: notes for things that last days", () => {
  it("spells: days, 24 hours, nothing shorter or without an end", () => {
    expect(spellDays("10 days")).toBe(10);
    expect(spellDays("24 hours")).toBe(1);
    expect(spellDays("Up to 24 hours")).toBe(1);
    expect(spellDays("8 hours")).toBeUndefined();
    expect(spellDays("Until dispelled")).toBeUndefined();
  });
  it("features: rolled in days (Theros), or a day of time (Blackrazor)", () => {
    expect(actionDays({ duration: { fromRoll: "days" } }, 4)).toBe(4);
    expect(actionDays({ duration: { minutes: 1440 } }, undefined)).toBe(1);
    expect(actionDays({ duration: { rounds: 10 } }, undefined)).toBeUndefined();
  });
  it("the note says until when", () => {
    const n = lastsDaysNote("Gentle Repose", 10, story().story);
    expect(n.body).toBe("Gentle Repose was cast. It lasts 10 days: until Πέρια, 5 Δάφνη 521 Μετά Σχίσματος.");
    expect(n.session).toBe(4);
  });
});

describe("22j: Divine Intervention's note and look", () => {
  it("the day and session the player gave, on the calendar they picked", () => {
    const c = story();
    const minutes = fromDate({ year: 521, month: 7, day: 25, hour: 12, minute: 0 }, "mithiologio");
    const yes = interventionNote({ name: "Divine Intervention", session: 5, minutes, kind: "mithiologio", rolled: 7, answered: true, days: 7, story: c.story });
    expect(yes.body).toBe("Divine Intervention was used in session 5, on Πιττάκα, 25 Δανάη 521 Μετά Σχίσματος. Your deity answered (rolled 7). It can't be used again for 7 days: from Πιττάκα, 2 Δάφνη 521 Μετά Σχίσματος.");
    expect(yes).toMatchObject({ session: 5, gameMinutes: minutes, pinned: true });
    // Another calendar than the character's: the date as text only.
    const normal = fromDate({ year: 2026, month: 10, day: 12, hour: 12, minute: 0 }, "normal");
    const no = interventionNote({ name: "Divine Intervention", session: 5, minutes: normal, kind: "normal", rolled: 57, answered: false, story: c.story });
    expect(no.body).toMatch(/No answer this time \(rolled 57\): it can be tried again after a long rest\./);
    expect("gameMinutes" in no).toBe(false);
  });
  it("answered: the epic look; not: the silent one", () => {
    const c = story();
    const yes = opFx("useAction", { action: "divine-intervention", rolled: 7 }, c, c).find((e) => e.kind === "moment")!;
    expect(specOf(yes)).toMatchObject({ look: "fx-mo fx-mo-divine-intervention", label: "Divine Intervention · your deity answers (7)" });
    const no = opFx("useAction", { action: "divine-intervention", rolled: 57 }, c, c).find((e) => e.kind === "moment")!;
    expect(specOf(no).label).toBe("Divine Intervention · 57: the heavens are silent");
    expect(opFx("useAction", { action: "divine-intervention-sure" }, c, c).find((e) => e.kind === "moment")).toMatchObject({ motif: "divine-intervention" });
  });
});
