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
    expect(levelGains(log.character, reg, "class:bard")!.features.map((f) => f.name)).toEqual(["Jack of All Trades", "Song of Rest", "Magical Inspiration"]);
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

describe("SRD class features that work", () => {
  const make = (cls: string, abilities: Record<string, number>, race = "race:human") =>
    logOf(newCharacter({ id: cls, name: cls, race, class: cls, abilities: abilities as never }, reg));
  const up = (log: CharacterLog, cls: string, to: number) => {
    while (log.character.classes.find((c) => c.class === cls)!.level < to) log.record("levelUp", { class: cls });
  };
  const action = (log: CharacterLog, id: string) => sheetOf(log).actions.find((a) => a.id === id);

  it("Fighter: Second Wind heals, Action Surge gives another action, Extra Attack grows to 4", () => {
    const log = make("class:fighter", { str: 15, dex: 13, con: 14, int: 8, wis: 12, cha: 10 });
    log.record("setHp", { current: 3 });
    log.record("useAction", { action: "second-wind", rolled: 7 });
    expect(log.character.hp.current).toBe(10);
    up(log, "class:fighter", 2);
    log.record("startCombat", {});
    log.record("startTurn", {});
    log.record("useEconomy", { kind: "action" });
    log.record("useAction", { action: "action-surge" });
    expect(log.character.combat).toMatchObject({ action: 1, extraActions: 1 });
    expect(sheetOf(log).resources.find((r) => r.id === "action-surge")!.remaining).toBe(0);
    up(log, "class:fighter", 11);
    expect(sheetOf(log).attacksPerAction).toBe(3);
    up(log, "class:fighter", 20);
    expect(sheetOf(log).attacksPerAction).toBe(4);
  });

  it("Monk: Martial Arts die grows, Unarmored Defense, ki and Patient Defense", () => {
    const log = make("class:monk", { str: 10, dex: 15, con: 13, int: 8, wis: 14, cha: 12 });
    const s1 = sheetOf(log);
    const unarmed = s1.attacks.find((a) => a.attackId === "martial-arts")!;
    expect(unarmed.damage.dice).toBe("1d4");
    // Human +1 to all: Dexterity 16 (+3), Wisdom 15 (+2).
    expect(s1.ac.total).toBe(10 + 3 + 2);
    up(log, "class:monk", 5);
    const s5 = sheetOf(log);
    expect(s5.attacks.find((a) => a.attackId === "martial-arts")!.damage.dice).toBe("1d6");
    expect(s5.resources.find((r) => r.id === "ki")!.max).toBe(5);
    expect(s5.attacksPerAction).toBe(2);
    log.record("useAction", { action: "patient-defense" });
    expect(sheetOf(log).saves.dex.advantage).toContain("Dodge");
  });

  it("Paladin: Lay on Hands spends the points you choose", () => {
    const log = make("class:paladin", { str: 15, dex: 10, con: 14, int: 8, wis: 12, cha: 14 });
    up(log, "class:paladin", 3);
    expect(sheetOf(log).resources.find((r) => r.id === "lay-on-hands")!.max).toBe(15);
    log.record("setHp", { current: 5 });
    log.record("useAction", { action: "lay-on-hands", amount: 7, healSelf: true });
    expect(log.character.hp.current).toBe(12);
    expect(sheetOf(log).resources.find((r) => r.id === "lay-on-hands")!.remaining).toBe(8);
    expect(sheetOf(log).resources.find((r) => r.id === "divine-sense")!.max).toBe(3);
  });

  it("Bard: Bardic Inspiration uses Charisma (at least one) and comes back on a short rest from 5th", () => {
    const log = make("class:bard", { str: 8, dex: 14, con: 12, int: 10, wis: 10, cha: 9 });
    const bi = () => sheetOf(log).resources.find((r) => r.id === "bardic-inspiration")!;
    expect(bi()).toMatchObject({ max: 1, reset: "long", die: "d6" });
    up(log, "class:bard", 5);
    expect(bi()).toMatchObject({ reset: "short", die: "d8" });
  });

  it("Cleric: Channel Divinity uses and Turn Undead spends one", () => {
    const log = make("class:cleric", { str: 10, dex: 10, con: 14, int: 8, wis: 15, cha: 12 });
    up(log, "class:cleric", 6);
    expect(sheetOf(log).resources.find((r) => r.id === "channel-divinity")!.max).toBe(2);
    log.record("useAction", { action: "turn-undead" });
    expect(sheetOf(log).resources.find((r) => r.id === "channel-divinity")!.remaining).toBe(1);
    expect(action(log, "turn-undead")!.economy).toBe("action");
  });
});

describe("invocations, smites and Flexible Casting", () => {
  const warlock = () => {
    const log = logOf(newCharacter({ id: "asmo", name: "Asmo", race: "race:tiefling", class: "class:warlock", abilities: { str: 8, dex: 14, con: 14, int: 10, wis: 12, cha: 15 } }, reg));
    log.record("levelUp", { class: "class:warlock" });
    log.record("learnSpell", { spell: "spell:eldritch-blast", list: "warlock" });
    return log;
  };

  it("Agonizing Blast adds Charisma to Eldritch Blast damage only", () => {
    const log = warlock();
    const before = sheetOf(log).spells.find((s) => s.id === "spell:eldritch-blast")!;
    expect(before.damageBonus!.total).toBe(0);
    log.record("setChoice", { source: "feature:eldritch-invocations", choice: "invocations", values: ["feature:eldritch-invocation-agonizing-blast", "feature:eldritch-invocation-armor-of-shadows"] });
    const s = sheetOf(log);
    const eb = s.spells.find((x) => x.id === "spell:eldritch-blast")!;
    // Tiefling +2 Charisma: 17, +3.
    expect(eb.damageBonus!.total).toBe(3);
    expect(eb.damageBonus!.parts[0]!.label).toMatch(/^Agonizing Blast/);
    // Armor of Shadows: mage armor at will, no slot.
    const ma = s.spells.find((x) => x.id === "spell:mage-armor")!;
    expect(ma.cast).toEqual({ slotLevels: [], atWill: true });
  });

  it("the table's Xanathar's and Tasha's invocations are offered too", () => {
    const opts = choiceOptions(reg.get("feature:eldritch-invocations", "feature").choices![0]!, reg).map((o) => o.label);
    expect(opts).toContain("Eldritch Invocation: Agonizing Blast");
    expect(opts).toContain("Eldritch Invocation: Eldritch Smite");
    expect(opts).toContain("Eldritch Invocation: Tomb of Levistus");
  });

  it("Pact of the Tome gives three cantrips from any list", () => {
    const log = warlock();
    log.record("levelUp", { class: "class:warlock" });
    log.record("setChoice", { source: "feature:pact-boon", choice: "option", values: ["feature:pact-of-the-tome"] });
    expect(buildItems(log.character, reg).find((i) => i.key === "feature:pact-of-the-tome|cantrips")).toMatchObject({ need: 3, done: false });
    log.record("setChoice", { source: "feature:pact-of-the-tome", choice: "cantrips", values: ["spell:guidance", "spell:light", "spell:fire-bolt"] });
    expect(sheetOf(log).spells.filter((s) => s.list.id === "book-of-shadows").map((s) => s.name)).toEqual(["Fire Bolt", "Guidance", "Light"]);
  });

  it("Flexible Casting turns sorcery points into slots and back", () => {
    const log = logOf(newCharacter({ id: "s", name: "S", race: "race:human", class: "class:sorcerer", abilities: { str: 8, dex: 14, con: 14, int: 10, wis: 12, cha: 15 } }, reg));
    log.record("levelUp", { class: "class:sorcerer" });
    log.record("levelUp", { class: "class:sorcerer" });
    const pts = () => sheetOf(log).resources.find((r) => r.id === "sorcery-points")!;
    const slot = (l: number) => sheetOf(log).spellSlots.find((s) => s.level === l)!;
    expect(pts().max).toBe(3);
    expect(slot(2)).toMatchObject({ total: 2, used: 0 });
    log.record("useAction", { action: "flexible-to-slot", choice: "Level 2 slot for 3 points" });
    expect(pts().remaining).toBe(0);
    expect(slot(2)).toMatchObject({ total: 3, used: 0 });
    log.record("useAction", { action: "flexible-to-points", choice: "Level 1 slot into 1 points" });
    expect(pts().remaining).toBe(1);
    expect(slot(1).used).toBe(1);
    log.record("rest", { kind: "long" });
    expect(slot(2).total).toBe(2);
  });
});
