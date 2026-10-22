import { describe, expect, it } from "vitest";
import { Character } from "@dnd/schema";
import { derive } from "../src/derive.js";
import { buildItems } from "../src/build.js";
import { bookPack } from "../src/books/index.js";
import { multiattackCount } from "../src/shapes.js";
import { spiritId } from "../src/spirits.js";
import { tableRegistry } from "./helpers.js";

const reg = tableRegistry();
const pc = (race: string, level: number, choices: Record<string, Record<string, string[]>>, extra: Record<string, unknown> = {}) =>
  Character.parse({ id: "p", schemaVersion: 1, ruleset: "5e-2014", name: "P", abilities: { str: 15, dex: 12, con: 14, int: 10, wis: 10, cha: 13 }, race, classes: [{ class: "class:fighter", level }], choices, hp: { current: 40, temp: 0 }, ...extra });

describe("9d: Fizban's spells, the Draconic Spirit, dragonborn and gifts", () => {
  it("the seven spells are on the class lists the user gave", () => {
    const on = (id: string) => reg.find(id, "spell")?.classes;
    expect(on("spell:ashardalons-stride")).toEqual(["ranger", "sorcerer", "wizard"]);
    expect(on("spell:draconic-transformation")).toEqual(["druid", "sorcerer", "wizard"]);
    expect(on("spell:fizbans-platinum-shield")).toEqual(["sorcerer", "wizard"]);
    expect(on("spell:nathairs-mischief")).toEqual(["bard", "sorcerer", "wizard"]);
    expect(on("spell:raulothims-psychic-lance")).toEqual(["bard", "sorcerer", "warlock", "wizard"]);
    expect(on("spell:rimes-binding-ice")).toEqual(["sorcerer", "wizard"]);
    expect(on("spell:summon-draconic-spirit")).toEqual(["druid", "sorcerer", "wizard"]);
    expect(reg.find("spell:raulothims-psychic-lance", "spell")?.damage?.atSlot).toMatchObject({ "4": "7d6", "6": "9d6" });
  });
  it("the Draconic Spirit at 5th and 7th: AC 14 + level, 50 HP + 10 a level, Rend, its family's resistances", () => {
    const s5 = reg.find(spiritId("summon:summon-draconic-spirit", "gem", 5, 8, 16), "creature")!;
    expect([s5.name, s5.ac, s5.hp, multiattackCount(s5)]).toEqual(["Draconic Spirit (Gem)", 19, 50, 2]);
    expect(s5.resist).toEqual(["force", "necrotic", "psychic", "radiant", "thunder"]);
    expect(s5.actions.find((a) => a.name === "Rend")!.attack).toMatchObject({ toHit: 8, damage: "1d6", damageBonus: 9, damageType: "piercing" });
    const s7 = reg.find(spiritId("summon:summon-draconic-spirit", "metallic", 7, 8, 16), "creature")!;
    expect([s7.ac, s7.hp, multiattackCount(s7)]).toEqual([21, 70, 3]);
    expect(s7.resist).toEqual(["acid", "cold", "fire", "lightning", "poison"]);
    expect(reg.find("effect:summon-draconic-spirit", "effect")?.choice?.options).toContain("thunder");
  });
  it("Chromatic Dragonborn (red, +2 Str +1 Cha): fire resistance, breath 2d10 at 5th, PB uses, warding at 5th", () => {
    const c = pc("race:chromatic-dragonborn", 5, {
      "race:chromatic-dragonborn": { asi: ["feature:ftd-dragonborn-asi-split"], ancestry: ["feature:ftd-chromatic-ancestry-red"], language: ["Draconic"] },
      "feature:ftd-dragonborn-asi-split": { plus2: ["str"], plus1: ["cha"] },
    });
    const s = derive(c, reg);
    expect([s.abilities.str.score.total, s.abilities.cha.score.total]).toEqual([17, 14]);
    expect(s.defenses.resist).toContain("fire");
    const breath = s.actions.find((a) => a.id === "ftd-breath-red")!;
    expect(breath.roll?.text).toMatch(/2d10/);
    expect(breath.dc?.value).toBe(8 + 2 + 3);
    expect(s.resources.find((r) => r.id === "ftd-breath-weapon")?.max).toBe(3);
    expect(s.resources.some((r) => r.id === "ftd-chromatic-warding")).toBe(true);
    expect(derive({ ...c, toggles: [...c.toggles, "chromatic-warding"] } as Character, reg).defenses.immune).toContain("fire");
    // Level 4: one die, no warding yet.
    const c4 = derive({ ...c, classes: [{ class: "class:fighter", level: 4 }] } as Character, reg);
    expect(c4.actions.find((a) => a.id === "ftd-breath-red")!.roll?.text).toMatch(/1d10/);
    expect(c4.resources.some((r) => r.id === "ftd-chromatic-warding")).toBe(false);
  });
  it("three +1 instead; the same ability twice warns; choices show in Build", () => {
    const c = pc("race:gem-dragonborn", 1, {
      "race:gem-dragonborn": { asi: ["feature:ftd-dragonborn-asi-three"], ancestry: ["feature:ftd-gem-ancestry-amethyst"] },
      "feature:ftd-dragonborn-asi-three": { three: ["dex", "con", "wis"] },
    });
    const s = derive(c, reg);
    expect([s.abilities.dex.score.total, s.abilities.con.score.total, s.abilities.wis.score.total]).toEqual([13, 15, 11]);
    expect(s.defenses.resist).toContain("force");
    const twice = derive(pc("race:metallic-dragonborn", 1, { "race:metallic-dragonborn": { asi: ["feature:ftd-dragonborn-asi-split"] }, "feature:ftd-dragonborn-asi-split": { plus2: ["str"], plus1: ["str"] } }), reg);
    expect(twice.warnings.join(" ")).toMatch(/same ability picked twice/);
    const open = buildItems(pc("race:metallic-dragonborn", 1, {}), reg).filter((i) => !i.done).map((i) => i.label);
    expect(open.join(" | ")).toMatch(/Ability score increase/);
    expect(open.join(" | ")).toMatch(/Metallic ancestry/);
  });
  it("Gem Flight and the Gift of the Gem Dragon", () => {
    const c = pc("race:gem-dragonborn", 5, { "race:gem-dragonborn": { ancestry: ["feature:ftd-gem-ancestry-topaz"] } }, { toggles: ["gem-flight"] });
    expect(derive(c, reg).speeds.find((x) => x.mode === "fly")).toMatchObject({ hover: true });
    expect(derive({ ...c, toggles: [] } as Character, reg).speeds.find((x) => x.mode === "fly")).toBeUndefined();
    const g = derive(pc("race:human", 4, { "feat:gift-of-the-gem-dragon": { ability: ["wis"] } }, { feats: [{ feat: "feat:gift-of-the-gem-dragon", from: "Level 4 Ability Score Improvement" }] }), reg);
    expect(g.abilities.wis.score.total).toBe(12);
    expect(g.resources.find((r) => r.id === "gift-telekinetic-reprisal")?.max).toBe(2);
  });
  it("a book file gives the spells their text and keeps their class lists (invented text)", () => {
    const text = "#### Rime's Binding Ice\n*Level 2 Evocation*\n___\n- **Casting Time:** Action\n- **Range:** Self\n- **Components:** S\n- **Duration:** Instantaneous\n---\nInvented words about cold for the test.\n";
    const { pack } = bookPack([{ name: "spells.md", text }], reg);
    const d = pack.definitions.find((x) => x.id === "spell:rimes-binding-ice") as { text: string[]; classes: string[] } | undefined;
    expect(d?.text.join(" ")).toMatch(/Invented words/);
    expect(d?.classes).toEqual(["sorcerer", "wizard"]);
  });
  it("race and feat book files give these their text, not copies (invented text)", () => {
    const races = "## Dragonborn (Gem)\n\n- **Ability Scores:** Invented\n- **Size:** Medium\n- **Speed:** 30 feet \n\n***Gem Ancestry.*** Invented ancestry words.\n\n***Psionic Mind.*** Invented mind words.\n";
    const feats = "## Gift of the Gem Dragon\n\nInvented gift words.\n";
    const { pack } = bookPack([{ name: "races.md", text: races }, { name: "feats.md", text: feats }], reg);
    const raceIds = pack.definitions.filter((d) => d.kind === "race").map((d) => d.id);
    expect(raceIds.filter((id) => id !== "race:gem-dragonborn")).toEqual([]);
    // Its mechanics stay: the ancestry choice and the flight.
    const gem = pack.definitions.find((d) => d.id === "race:gem-dragonborn") as { choices?: { id: string }[]; features: string[] } | undefined;
    if (gem) {
      expect(gem.choices?.map((c) => c.id)).toEqual(["asi", "ancestry", "language"]);
      expect(gem.features).toContain("feature:ftd-gem-flight");
    }
    const feat = pack.definitions.find((d) => d.id === "feat:gift-of-the-gem-dragon") as { text?: string[]; grant?: unknown } | undefined;
    expect(feat?.text?.join(" ")).toMatch(/Invented gift/);
    expect(feat?.grant).toBeTruthy();
  });
});
