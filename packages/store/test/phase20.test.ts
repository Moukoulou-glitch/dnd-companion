import { describe, expect, it } from "vitest";
import { bookPack, buildItems, choiceOptions, classSpellOptions, derive, multiclassIssues, newCharacter, spellListOf } from "@dnd/engine";
import { tableRegistry } from "../../engine/test/helpers.js";
import { CharacterLog } from "../src/log.js";
import { HybridClock } from "../src/clock.js";

const reg = tableRegistry();

describe("Ability maximums, permanent changes and multiclassing", () => {
  it("flags Ability Score Improvements that go above 20", () => {
    const c = newCharacter({ id: "w", name: "W", race: "race:human", class: "class:wizard", abilities: { str: 8, dex: 12, con: 14, int: 17, wis: 10, cha: 8 } }, reg);
    c.classes[0] = { ...c.classes[0]!, level: 8 };
    c.asi = [
      { class: "class:wizard", level: 4, abilities: { int: 2 } },
      { class: "class:wizard", level: 8, abilities: { int: 2 } },
    ] as never;
    const sheet = derive(c, reg);
    expect(sheet.abilities.int.score.total).toBe(22);
    expect(sheet.abilities.int.asiOver).toBe(true);
    expect(sheet.warnings.join(" ")).toMatch(/can't raise a score above 20/);
  });

  it("a permanent change counts, with a new maximum", () => {
    const c = newCharacter({ id: "f", name: "F", race: "race:human", class: "class:fighter", abilities: { str: 19, dex: 12, con: 14, int: 10, wis: 10, cha: 8 } }, reg);
    c.abilityAdjust.str = { bonus: 0, penalty: 0, penaltyEndsOnRest: false, permanent: [{ amount: 2, from: "Manual of Gainful Exercise", newMax: 22 }] };
    const sheet = derive(c, reg);
    expect(sheet.abilities.str.score.total).toBe(22);
    expect(sheet.abilities.str.max).toBe(22);
    expect(sheet.warnings.join(" ")).not.toMatch(/Strength is 22/);
  });

  it("multiclassing reads the scores as they stand, not the base scores", () => {
    const c = newCharacter({ id: "a", name: "Asmo", race: "race:human", class: "class:warlock", abilities: { str: 12, dex: 12, con: 14, int: 10, wis: 10, cha: 16 } }, reg);
    expect(multiclassIssues(c, reg, "class:paladin").length).toBe(0);
    c.abilityAdjust.str = { bonus: 0, penalty: 2, penaltyEndsOnRest: false };
    expect(multiclassIssues(c, reg, "class:paladin").join(" ")).toMatch(/Paladin needs/);
  });

  it("features with a save show their DC", () => {
    const c = newCharacter({ id: "m", name: "M", race: "race:human", class: "class:monk", abilities: { str: 10, dex: 16, con: 12, int: 10, wis: 16, cha: 8 } }, reg);
    c.classes[0] = { ...c.classes[0]!, level: 5 };
    const sheet = derive(c, reg);
    const f = sheet.features.find((x) => x.id === "feature:stunning-strike");
    // Human +1 Wisdom: 17, +3; 8 + 3 proficiency + 3.
    expect(f?.dc?.value).toBe(14);
    expect(f?.dc?.save).toBe("Constitution");
  });
});

describe("Auras and feature tags", () => {
  const paladin = () => {
    const c = newCharacter({ id: "p", name: "P", race: "race:human", class: "class:paladin", abilities: { str: 16, dex: 10, con: 14, int: 8, wis: 10, cha: 16 } }, reg);
    c.classes[0] = { ...c.classes[0]!, level: 10 };
    return c;
  };
  it("a paladin's auras are tags that go off while unconscious", () => {
    const c = paladin();
    let sheet = derive(c, reg);
    expect(sheet.featureTags.map((t) => t.name)).toEqual(expect.arrayContaining(["Aura of Protection", "Aura of Courage"]));
    expect(sheet.featureTags.every((t) => t.active)).toBe(true);
    expect(sheet.featureTags.find((t) => t.name === "Aura of Protection")!.reminders[0]).toMatch(/\+3 to saving throws/);
    expect(sheet.saves.wis.parts.some((p) => p.label.startsWith("Aura of Protection"))).toBe(true);
    c.effects.push({ id: "u", effect: "condition:unconscious" } as never);
    sheet = derive(c, reg);
    expect(sheet.featureTags.find((t) => t.name === "Aura of Protection")).toMatchObject({ active: false, why: "You're unconscious." });
    expect(sheet.saves.wis.parts.some((p) => p.label.startsWith("Aura of Protection"))).toBe(false);
  });
  it("an ally's Aura of Protection adds the chosen bonus to saves", () => {
    const c = newCharacter({ id: "a", name: "A", race: "race:human", class: "class:fighter", abilities: { str: 16, dex: 10, con: 14, int: 8, wis: 10, cha: 10 } }, reg);
    c.effects.push({ id: "x", effect: "other:aura-of-protection", choice: "+4" } as never);
    const save = derive(c, reg).saves.wis;
    expect(JSON.stringify(save)).toMatch(/Aura of Protection/);
  });
});

describe("Divine Soul", () => {
  it("the sorcerer list becomes the Divine Soul list with cleric spells, tagged", () => {
    const c = newCharacter({ id: "d", name: "D", race: "race:human", class: "class:sorcerer", abilities: { str: 8, dex: 14, con: 14, int: 10, wis: 12, cha: 16 } }, reg);
    c.classes[0] = { ...c.classes[0]!, level: 3, subclass: "subclass:divine-soul" };
    expect(spellListOf(c, reg, "class:sorcerer")).toEqual({ classes: ["sorcerer", "cleric"], name: "Divine Soul spell list" });
    const opts = classSpellOptions(reg, "class:sorcerer", "known", 2, c);
    expect(opts.find((o) => o.value === "spell:spiritual-weapon")?.detail).toMatch(/Cleric/);
    expect(opts.find((o) => o.value === "spell:magic-missile")?.detail).toMatch(/Sorcerer/);
    const item = buildItems(c, reg).find((i) => i.key === "feature:divine-soul-divine-magic|affinity")!;
    const aff = choiceOptions(item.choice!, reg, item.slotMax);
    expect(aff.slice(0, 5).map((o) => o.value)).toContain("spell:bless");
    expect(aff.some((o) => o.value === "spell:spiritual-weapon" && /cleric spell, when replacing/.test(o.detail ?? ""))).toBe(true);
    expect(aff.some((o) => o.value === "spell:magic-missile")).toBe(false);
  });
});

describe("Backstory, notes, calendar and a custom background", () => {
  let t = 1_791_000_000_000;
  const log = () => {
    const c = newCharacter({ id: "b", name: "B", race: "race:human", class: "class:rogue", abilities: { str: 8, dex: 16, con: 12, int: 12, wis: 12, cha: 14 } }, reg);
    return new CharacterLog(c, reg, new HybridClock("test", () => (t += 60000)), "player");
  };
  it("notes are dated with the real time, edited, and deleted", () => {
    const l = log();
    l.record("setStory", { traits: "I hum when I lie.", session: 4 });
    l.record("addNote", { title: "The mill", body: "Met Agatha.", category: "gold", session: 4, gameDate: "Κλέα, 25 Δανάη 521" });
    const n = l.character.notes[0]!;
    expect(n).toMatchObject({ title: "The mill", category: "gold", session: 4, gameDate: "Κλέα, 25 Δανάη 521" });
    expect(new Date(n.createdAt!).getTime()).toBeGreaterThan(1_790_000_000_000);
    l.record("updateNote", { id: n.id, body: "Met Agatha, she lied." });
    expect(l.character.notes[0]!.updatedAt! > n.createdAt!).toBe(true);
    l.record("removeNote", { id: n.id });
    expect(l.character.notes).toHaveLength(0);
    expect(l.character.story).toMatchObject({ traits: "I hum when I lie.", session: 4 });
  });
  it("the in-world clock moves with rests unless switched off", () => {
    const l = log();
    l.record("setCalendar", { kind: "mithiologio", minutes: 1000 });
    l.record("rest", { kind: "long" });
    expect(l.character.story.calendar.minutes).toBe(1480);
    l.record("setCalendar", { followRests: false, add: 20 });
    l.record("rest", { kind: "short" });
    expect(l.character.story.calendar.minutes).toBe(1500);
  });
  it("a custom background asks for two tools or languages in the chosen mix", () => {
    const l = log();
    l.record("setDetails", { background: "background:custom" });
    l.record("setCustomBackground", { name: "Smuggler", languages: 1, featureName: "Hidden Docks", featureText: "Safe passage by river." });
    l.record("setChoice", { source: "background:custom", choice: "skills", values: ["stealth", "deception"] });
    const items = buildItems(l.character, reg).filter((i) => i.source === "background:custom");
    expect(items.map((i) => [i.choice!.id, i.need])).toEqual([
      ["skills", 2],
      ["languages", 1],
      ["tools", 1],
    ]);
    const sheet = derive(l.character, reg);
    expect(sheet.features.find((f) => f.id === "background:custom-feature")?.name).toBe("Hidden Docks");
    expect(sheet.skills.deception.proficiency).toBe(1);
  });
});

describe("Volo's races", () => {
  it("are playable from the table pack, and a races file only gives them their text", () => {
    const c = newCharacter({ id: "l", name: "L", race: "race:lizardfolk", class: "class:fighter", abilities: { str: 14, dex: 14, con: 14, int: 10, wis: 10, cha: 10 } }, reg);
    expect(derive(c, reg).ac.total).toBe(15);
    expect(reg.find("race:protector-aasimar", "race")?.group).toBe("Aasimar");
    // A made-up file in the races-sublist layout (not the book's words).
    const text = ["## Aasimar (Protector)", "", "- **Ability Scores:** Charisma +2; Wisdom +1", "- **Size:** Medium", "- **Speed:** 30 feet", "", "***Radiant Soul.*** Sample words for a test.", "", "---"].join("\n");
    const { pack, report } = bookPack([{ name: "races-sublist_test.md", text }], reg);
    expect(report.added.race).toBeUndefined();
    const ids = pack.definitions.filter((d) => d.text?.length).map((d) => d.id);
    expect(ids).toContain("feature:aasimar-radiant-soul");
    expect(ids).not.toContain("feature:celestial-radiant-soul");
  });
});
