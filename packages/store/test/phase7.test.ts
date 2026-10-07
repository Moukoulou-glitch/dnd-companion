import { describe, expect, it } from "vitest";
import { buildItems, choiceOptions, classSpellOptions, derive, levelGains, multiclassIssues, newCharacter } from "@dnd/engine";
import type { Character } from "@dnd/schema";
import { CharacterLog } from "../src/log.js";
import { HybridClock } from "../src/clock.js";
import { loadCharacter, tableRegistry } from "../../engine/test/helpers.js";

const reg = tableRegistry();
let t = 1_700_000_000_000;
const logOf = (c: Character) => new CharacterLog(c, reg, new HybridClock("test", () => (t += 1000)), "player");
const sheetOf = (log: CharacterLog) => derive(log.character, reg);

const bard = () =>
  logOf(
    newCharacter({
      id: "lyra",
      name: "Lyra",
      race: "race:half-elf",
      class: "class:bard",
      background: "background:acolyte",
      alignment: "CG",
      abilities: { str: 8, dex: 14, con: 13, int: 10, wis: 12, cha: 15 },
    }, reg),
  );

describe("the SRD classes and the table's own", () => {
  it("has all twelve classes, with the table's versions on top", () => {
    const names = reg.list("class").map((c) => c.name);
    expect(names).toEqual(["Barbarian", "Bard", "Cleric", "Druid", "Fighter", "Monk", "Paladin", "Ranger", "Rogue", "Sorcerer", "Warlock", "Wizard"]);
    const barb = reg.get("class:barbarian", "class");
    expect(barb.source.pack).toBe("table-2014");
    expect(barb.asiLevels).toEqual([4, 8, 12, 16, 19]);
    const at = (lvl: number) => barb.features.filter((f) => f.level === lvl).map((f) => f.feature);
    expect(at(1)).toEqual(["feature:rage", "feature:unarmored-defense-barbarian"]);
    expect(at(11).length).toBe(1);
    expect(reg.get("class:warlock", "class").progression!.invocations![1]).toBe(2);
  });

  it("the table's Tasha's ranger keeps its own first levels", () => {
    const ranger = reg.get("class:ranger", "class");
    expect(ranger.features.filter((f) => f.level === 1).map((f) => f.feature)).toEqual(["feature:favored-foe", "feature:deft-explorer"]);
    expect(ranger.choices![0]).toMatchObject({ id: "skills", count: 3 });
  });

  it("the existing characters derive as before", () => {
    for (const name of ["agaklis", "aristotelis", "beren", "elissaios"]) {
      const s = derive(loadCharacter(name), reg);
      expect(s.warnings.filter((w) => /isn't in any content pack|doesn't exist/.test(w))).toEqual([]);
    }
  });
});

describe("a new character", () => {
  it("starts at level 1 with full hit points and a list of choices", () => {
    const log = bard();
    const s = sheetOf(log);
    expect(s.level).toBe(1);
    expect(s.hpMax.total).toBe(8 + 1);
    const open = buildItems(log.character, reg).filter((i) => !i.done).map((i) => `${i.sourceName}: ${i.label}`);
    expect(open).toEqual(
      expect.arrayContaining([
        "Half-Elf: Ability scores (+1 each)",
        "Half-Elf: Language",
        "Bard: Skills",
        "Bard: Tools or instruments",
        "Acolyte: Languages",
        "Bard: Cantrips known",
        "Bard: Spells known",
      ]),
    );
  });

  it("choices change the sheet: Half-Elf +1s, Bard skills, cantrips", () => {
    const log = bard();
    log.record("setChoice", { source: "race:half-elf", choice: "abilities", values: ["dex", "con"] });
    log.record("setChoice", { source: "class:bard", choice: "skills", values: ["persuasion", "deception", "performance"] });
    const s = sheetOf(log);
    expect(s.abilities.dex.score.total).toBe(15);
    expect(s.abilities.cha.score.total).toBe(17);
    expect(s.skills.persuasion.proficiency).toBe(1);
    expect(log.character.hp.current).toBe(s.hpMax.total);

    const cantrips = classSpellOptions(reg, "class:bard", "cantrips", 0).map((o) => o.label);
    expect(cantrips).toContain("Vicious Mockery");
    log.record("learnSpell", { spell: "spell:vicious-mockery", list: "bard" });
    expect(buildItems(log.character, reg).find((i) => i.key === "class:bard|cantrips")).toMatchObject({ need: 2, picked: ["spell:vicious-mockery"], done: false });
  });

  it("options: Half-Elf abilities leave out Charisma; Acolyte languages are any", () => {
    const race = reg.get("race:half-elf", "race");
    expect(choiceOptions(race.choices!.find((c) => c.id === "abilities")!, reg).map((o) => o.value)).toEqual(["str", "dex", "con", "int", "wis"]);
    const bg = reg.get("background:acolyte", "background");
    expect(choiceOptions(bg.choices![0]!, reg).length).toBeGreaterThan(10);
  });
});

describe("levelling up", () => {
  it("adds HP, features, subclass and ASI choices", () => {
    const log = bard();
    log.record("levelUp", { class: "class:bard", hpRoll: 6 });
    log.record("levelUp", { class: "class:bard" });
    expect(log.character.classes[0]).toMatchObject({ level: 3, hpRolls: [6, 5] });
    expect(sheetOf(log).hpMax.total).toBe(9 + 6 + 1 + 5 + 1);
    expect(log.character.hp.current).toBe(sheetOf(log).hpMax.total);
    const items = buildItems(log.character, reg);
    expect(items.find((i) => i.kind === "subclass")).toMatchObject({ label: "Bard College", done: false });
    log.record("setSubclass", { class: "class:bard", subclass: "subclass:lore" });
    expect(sheetOf(log).features.map((f) => f.name)).toContain("Bonus Proficiencies");

    log.record("levelUp", { class: "class:bard" });
    const asi = buildItems(log.character, reg).find((i) => i.kind === "asi")!;
    expect(asi).toMatchObject({ level: 4, done: false });
    // 15 base, +2 Half-Elf, +2 from the ASI.
    log.record("chooseAsi", { class: "class:bard", level: 4, abilities: { cha: 2 } });
    expect(sheetOf(log).abilities.cha.score.total).toBe(19);
    log.record("chooseAsi", { class: "class:bard", level: 4, feat: "feat:skilled" });
    expect(sheetOf(log).abilities.cha.score.total).toBe(17);
    expect(log.character.feats).toEqual([{ feat: "feat:skilled", from: "Bard 4 (Ability Score Improvement)" }]);
    log.record("levelDown", { class: "class:bard" });
    expect(log.character.feats).toEqual([]);
    expect(log.character.asi).toEqual([]);
  });

  it("what a level brings, and multiclass minimums", () => {
    const log = bard();
    expect(levelGains(log.character, reg, "class:bard")!.features.map((f) => f.name)).toEqual(["Jack of All Trades", "Song of Rest"]);
    expect(multiclassIssues(log.character, reg, "class:fighter")).toEqual([]);
    expect(multiclassIssues(log.character, reg, "class:monk")).toEqual(["Monk needs Dexterity 13 and Wisdom 13."]);
    expect(log.record("levelUp", { class: "class:monk" })).toContain("Multiclassing: Monk needs Dexterity 13 and Wisdom 13.");
    expect(log.character.classes.map((c) => c.class)).toEqual(["class:bard", "class:monk"]);
    expect(buildItems(log.character, reg).find((i) => i.key === "class:monk|skills")).toBeUndefined();
  });

  it("characters made before the app tracked ASIs aren't asked for old ones", () => {
    const log = logOf(loadCharacter("agaklis"));
    expect(buildItems(log.character, reg).filter((i) => i.kind === "asi")).toEqual([]);
    log.record("levelUp", { class: "class:barbarian" });
    expect(log.character.asiBaseline).toEqual({ "class:barbarian": 9 });
    log.record("levelUp", { class: "class:barbarian" });
    log.record("levelUp", { class: "class:barbarian" });
    expect(buildItems(log.character, reg).filter((i) => i.kind === "asi").map((i) => i.level)).toEqual([12]);
  });
});

describe("prepared casters", () => {
  it("a cleric prepares from the whole cleric list up to the spell level they can cast", () => {
    const log = logOf(
      newCharacter({ id: "c", name: "Cleric", race: "race:hill-dwarf", class: "class:cleric", abilities: { str: 14, dex: 8, con: 15, int: 10, wis: 15, cha: 12 } }, reg),
    );
    log.record("setSubclass", { class: "class:cleric", subclass: "subclass:life" });
    const s = sheetOf(log);
    const cleric = s.spells.filter((x) => x.list.id === "cleric");
    expect(cleric.some((x) => x.name === "Cure Wounds" && x.ready === "always")).toBe(true);
    expect(cleric.some((x) => x.name === "Guiding Bolt" && x.ready === "not prepared")).toBe(true);
    expect(cleric.every((x) => x.level <= 1)).toBe(true);
    // d8, +3 Constitution (15 + 2 from Hill Dwarf), +1 Dwarven Toughness.
    expect(s.hpMax.total).toBe(8 + 3 + 1);
  });
});

describe("Variant Human", () => {
  it("a new one picks +1 to two abilities; the table's existing ones aren't asked again", () => {
    const log = logOf(newCharacter({ id: "v", name: "V", race: "race:variant-human", class: "class:fighter", abilities: { str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8 } }, reg));
    expect(buildItems(log.character, reg).find((i) => i.key === "race:variant-human|abilities")).toMatchObject({ need: 2, done: false });
    log.record("setChoice", { source: "race:variant-human", choice: "abilities", values: ["str", "con"] });
    expect(sheetOf(log).abilities.str.score.total).toBe(16);
    const agaklis = loadCharacter("agaklis");
    expect(buildItems(agaklis, reg).some((i) => i.key === "race:variant-human|abilities")).toBe(false);
    expect(derive(agaklis, reg).abilities.str.score.parts.map((p) => p.label)).not.toContain("Variant Human");
  });
});
