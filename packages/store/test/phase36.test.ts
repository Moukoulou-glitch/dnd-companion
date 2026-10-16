import { describe, expect, it } from "vitest";
import type { Character } from "@dnd/schema";
import { alreadyOwned, derive, featTaken, newCharacter } from "@dnd/engine";
import { tableRegistry } from "../../engine/test/helpers.js";
import { CharacterLog } from "../src/log.js";
import { HybridClock } from "../src/clock.js";

const reg = tableRegistry();
let t = 1_840_000_000_000;
const logOf = (c: Character) => new CharacterLog(c, reg, new HybridClock("t", () => (t += 1000)), "player");
const choiceOf = (source: string, id: string) => {
  const kind = /^(class|race|background|feat|feature):/.exec(source)![1] as "class";
  return (reg.get(source, kind) as { choices?: { id: string }[] }).choices!.find((x) => x.id === id) as never;
};
/** Ranger 2 / Fighter 1 with a longbow. */
const archer = () => {
  const c = newCharacter({ id: "a", name: "A", race: "race:human", class: "class:ranger", abilities: { str: 10, dex: 16, con: 14, int: 10, wis: 14, cha: 8 } }, reg);
  c.classes[0] = { ...c.classes[0]!, level: 2 };
  c.classes.push({ class: "class:fighter", level: 1 } as never);
  c.inventory.push({ id: "b", item: "item:longbow", quantity: 1, equipped: true, attuned: false } as never);
  return c;
};
const archery = (c: Character) => derive(c, reg).attacks.find((a) => a.name === "Longbow")!.attack.parts.filter((p) => p.label === "Archery").length;

describe("A fighting style you already have", () => {
  it("isn't offered again (with why), and if picked anyway it counts once, with a warning", () => {
    const c = archer();
    const l = logOf(c);
    l.record("setChoice", { source: "feature:fighting-style-ranger", choice: "style", values: ["feature:style-archery"] });
    const owned = alreadyOwned(l.character, reg, "feature:fighter-fighting-style", choiceOf("feature:fighter-fighting-style", "option"));
    expect(owned.get("feature:style-archery")).toBe("You already have it (Ranger 2 · Fighting Style).");
    expect(owned.has("feature:style-defense")).toBe(false);
    // Picked anyway (warn, never block): saved, with a note; +2 once, not twice.
    const notes = l.record("setChoice", { source: "feature:fighter-fighting-style", choice: "option", values: ["feature:style-archery"] });
    expect(notes.join(" ")).toMatch(/already have it.*counts once/);
    expect(archery(l.character)).toBe(1);
    expect(derive(l.character, reg).warnings.some((w) => /Archery is picked again in Fighting Style/.test(w))).toBe(true);
  });

  it("its own pick isn't counted against itself, and removing the other source gives the style back to this one", () => {
    const l = logOf(archer());
    l.record("setChoice", { source: "feature:fighting-style-ranger", choice: "style", values: ["feature:style-archery"] });
    // From the ranger's own choice, Archery is free to keep.
    expect(alreadyOwned(l.character, reg, "feature:fighting-style-ranger", choiceOf("feature:fighting-style-ranger", "style")).has("feature:style-archery")).toBe(false);
    l.record("setChoice", { source: "feature:fighter-fighting-style", choice: "option", values: ["feature:style-archery"] });
    l.record("setChoice", { source: "feature:fighting-style-ranger", choice: "style", values: ["feature:style-defense"] });
    expect(archery(l.character)).toBe(1);
    expect(derive(l.character, reg).warnings.some((w) => /picked again/.test(w))).toBe(false);
  });

  it("replaying the saved log gives the same result", () => {
    const l = logOf(archer());
    l.record("setChoice", { source: "feature:fighting-style-ranger", choice: "style", values: ["feature:style-archery"] });
    l.record("setChoice", { source: "feature:fighter-fighting-style", choice: "option", values: ["feature:style-archery"] });
    const again = new CharacterLog(l.base, reg, new HybridClock("u", () => (t += 1000)), "player", [...l.operations]);
    expect(archery(again.character)).toBe(1);
  });
});

describe("Skills, tools and languages you already have", () => {
  const cleric = () => {
    const c = newCharacter({ id: "c", name: "C", race: "race:human", class: "class:cleric", abilities: { str: 10, dex: 12, con: 14, int: 10, wis: 16, cha: 12 } }, reg);
    c.background = "background:acolyte";
    return c;
  };

  it("an Acolyte cleric isn't offered Insight or Religion again; the reason says where they come from", () => {
    const owned = alreadyOwned(cleric(), reg, "class:cleric", choiceOf("class:cleric", "skills"));
    expect(owned.get("insight")).toBe("You already have proficiency in Insight (Acolyte).");
    expect(owned.has("religion")).toBe(true);
    expect(owned.has("medicine")).toBe(false);
  });

  it("picked anyway: proficient once (no double bonus), a note and a warning", () => {
    const l = logOf(cleric());
    const notes = l.record("setChoice", { source: "class:cleric", choice: "skills", values: ["insight", "medicine"] });
    expect(notes.join(" ")).toMatch(/Insight.*counts once/);
    const s = derive(l.character, reg);
    expect(s.skills.insight.proficiency).toBe(1);
    expect(s.skills.insight.total).toBe(3 + 2);
    expect(s.warnings.some((w) => /Insight: you have this skill from Acolyte and from Cleric/.test(w))).toBe(true);
  });

  it("a human isn't offered Common again", () => {
    // The human's own extra language: none of its options (Dwarvish, Elvish…) is known yet.
    const race = alreadyOwned(cleric(), reg, "race:human", choiceOf("race:human", "language"));
    expect(["Dwarvish", "Elvish", "Giant"].some((l) => race.has(l))).toBe(false);
    // The Acolyte's two languages from any: Common (from the race) is left out.
    const bg = alreadyOwned(cleric(), reg, "background:acolyte", choiceOf("background:acolyte", "languages"));
    expect(bg.get("Common")).toMatch(/You already speak Common/);
  });

  it("expertise: only skills you already have expertise in are left out", () => {
    const c = newCharacter({ id: "r", name: "R", race: "race:human", class: "class:rogue", abilities: { str: 10, dex: 16, con: 12, int: 12, wis: 12, cha: 10 } }, reg);
    c.choices["class:rogue"] = { skills: ["stealth", "perception", "acrobatics", "deception"] };
    c.choices["feature:rogue-expertise-1"] = { skills: ["stealth"] };
    c.classes[0] = { ...c.classes[0]!, level: 6 };
    const ch = (reg.get("feature:rogue-expertise-6", "feature").choices ?? [])[0] as never;
    const owned = alreadyOwned(c, reg, "feature:rogue-expertise-6", ch);
    expect(owned.get("stealth")).toMatch(/already have expertise in Stealth/);
    expect(owned.has("perception")).toBe(false);
  });
});

describe("Feats you already have", () => {
  it("aren't offered again (Elemental Adept can be); taken anyway, a note and a warning", () => {
    const c = archer();
    c.classes[0] = { ...c.classes[0]!, level: 8 };
    const l = logOf(c);
    l.record("chooseAsi", { class: "class:ranger", level: 4, feat: "feat:alert" });
    expect(featTaken(l.character, "feat:alert")).toMatch(/You already have it \(Ranger 4/);
    expect(featTaken(l.character, "feat:elemental-adept")).toBeUndefined();
    // The pick being changed isn't counted against itself.
    expect(featTaken(l.character, "feat:alert", l.character.feats[0]!.from)).toBeUndefined();
    const notes = l.record("chooseAsi", { class: "class:ranger", level: 8, feat: "feat:alert" });
    expect(notes.join(" ")).toMatch(/already have Alert/);
    expect(derive(l.character, reg).warnings.some((w) => /Alert is taken twice/.test(w))).toBe(true);
  });
});
