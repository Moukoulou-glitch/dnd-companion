import { describe, expect, it } from "vitest";
import { derive, newCharacter } from "@dnd/engine";
import type { Ability, Character } from "@dnd/schema";
import { tableRegistry } from "../../engine/test/helpers.js";

// Loading the registry validates every pack file against the schemas.
const reg = tableRegistry();

const SCORES: Record<Ability, number> = { str: 14, dex: 14, con: 14, int: 10, wis: 12, cha: 10 };

const fighter = (race = "race:human", level = 1): Character => {
  const c = newCharacter({ id: "t", name: "Test", race, class: "class:fighter", abilities: SCORES }, reg);
  c.classes[0]!.level = level;
  return c;
};

const withFeats = (c: Character, ...feats: string[]): Character => {
  for (const feat of feats) c.feats.push({ feat, from: "Test" });
  return c;
};

describe("2014 feats pack", () => {
  it("loads every new feat", () => {
    for (const id of ["feat:alert", "feat:tough", "feat:mobile", "feat:observant", "feat:resilient", "feat:lucky", "feat:great-weapon-master", "feat:fey-teleportation", "feat:shadow-touched", "feat:eldritch-adept", "feat:fighting-initiate", "feat:dragon-hide"]) {
      expect(reg.find(id, "feat"), id).toBeDefined();
    }
    // The house versions are untouched.
    expect(reg.get("feat:fey-touched", "feat").source.pack).toBe("table-2014");
    expect(reg.get("feat:athlete", "feat").source.book).toMatch(/Homebrew/);
  });

  it("Alert adds +5 to initiative", () => {
    const before = derive(fighter(), reg).initiative.total;
    expect(derive(withFeats(fighter(), "feat:alert"), reg).initiative.total).toBe(before + 5);
  });

  it("Tough adds 2 HP per level", () => {
    const before = derive(fighter("race:human", 5), reg).hpMax.total;
    expect(derive(withFeats(fighter("race:human", 5), "feat:tough"), reg).hpMax.total).toBe(before + 10);
  });

  it("Mobile adds 10 ft of speed", () => {
    expect(derive(withFeats(fighter(), "feat:mobile"), reg).speed.total).toBe(40);
  });

  it("Observant adds +5 to passive Perception and Investigation, and +1 to the chosen ability", () => {
    const base = derive(fighter(), reg);
    const c = withFeats(fighter(), "feat:observant");
    c.choices["feat:observant"] = { ability: ["int"] };
    const sheet = derive(c, reg);
    expect(sheet.passives.perception.total).toBe(base.passives.perception.total + 5);
    expect(sheet.abilities.int.score.total).toBe(base.abilities.int.score.total + 1);
  });

  it("Resilient gives +1 and save proficiency in the chosen ability", () => {
    const base = derive(fighter(), reg);
    expect(base.saves.wis.proficient).toBe(false);
    const c = withFeats(fighter(), "feat:resilient");
    c.choices["feat:resilient"] = { ability: ["wis"] };
    const sheet = derive(c, reg);
    expect(sheet.saves.wis.proficient).toBe(true);
    expect(sheet.abilities.wis.score.total).toBe(base.abilities.wis.score.total + 1);
  });

  it("Lucky and Martial Adept give their pools", () => {
    const sheet = derive(withFeats(fighter(), "feat:lucky", "feat:martial-adept"), reg);
    expect(sheet.resources.find((r) => r.id === "luck-points")).toMatchObject({ max: 3, reset: "long" });
    expect(sheet.resources.find((r) => r.id === "martial-adept-superiority")).toMatchObject({ max: 1, reset: "short", die: "d6" });
  });

  it("Dragon Hide: unarmored AC 13 + Dex and slashing claws", () => {
    const c = withFeats(fighter("race:dragonborn"), "feat:dragon-hide");
    c.choices["feat:dragon-hide"] = { ability: ["con"] };
    const sheet = derive(c, reg);
    expect(sheet.ac.total).toBe(13 + 2);
    expect(sheet.attacks.find((a) => a.attackId === "dragon-hide-claws")?.damage.type).toBe("slashing");
  });

  it("Shadow Touched mirrors Fey Touched: Invisibility free once per long rest with the chosen ability", () => {
    const c = withFeats(fighter(), "feat:shadow-touched");
    c.choices["feat:shadow-touched"] = { ability: ["cha"] };
    const sheet = derive(c, reg);
    expect(sheet.spellcasting.find((s) => s.id === "shadow-touched")?.ability).toBe("cha");
    expect(sheet.spells.find((s) => s.id === "spell:invisibility")?.cast.free?.resource).toBe("shadow-touched-invisibility");
  });

  it("Fighting Initiate and Eldritch Adept activate the chosen feature", () => {
    const c = withFeats(fighter(), "feat:fighting-initiate", "feat:eldritch-adept");
    c.choices["feat:fighting-initiate"] = { style: ["feature:style-defense"] };
    c.choices["feat:eldritch-adept"] = { ability: ["int"], invocation: ["feature:eldritch-invocation-armor-of-shadows"] };
    const sheet = derive(c, reg);
    const ids = sheet.features.map((f) => f.id);
    expect(ids).toContain("feature:style-defense");
    expect(ids).toContain("feature:eldritch-invocation-armor-of-shadows");
    expect(sheet.spells.find((s) => s.id === "spell:mage-armor")?.cast.atWill).toBe(true);
  });

  it("Prodigy gives expertise in the chosen skill", () => {
    const c = withFeats(fighter(), "feat:prodigy");
    c.choices["feat:prodigy"] = { skill: ["stealth"], tool: ["Thieves' tools"], language: ["Elvish"], expertise: ["stealth"] };
    expect(derive(c, reg).skills.stealth.proficiency).toBe(2);
  });
});

describe("subraces and lineages", () => {
  const build = (race: string) => newCharacter({ id: "r", name: "Race test", race, class: "class:fighter", abilities: SCORES }, reg);
  const featureIds = (c: Character) => derive(c, reg).features.map((f) => f.id);

  it("Mountain Dwarf: darkvision 60, speed 25, armor training and the dwarf traits", () => {
    const c = build("race:mountain-dwarf");
    const sheet = derive(c, reg);
    expect(sheet.senses.darkvision).toBe(60);
    expect(sheet.speed.total).toBe(25);
    expect(sheet.abilities.str.score.total).toBe(16);
    expect(sheet.defenses.resist).toContain("poison");
    expect(featureIds(c)).toEqual(expect.arrayContaining(["feature:trait-dwarven-resilience", "feature:trait-stonecunning", "feature:dwarven-armor-training"]));
  });

  it("Drow: superior darkvision, elf traits and drow magic", () => {
    const c = build("race:drow");
    const sheet = derive(c, reg);
    expect(sheet.senses.darkvision).toBe(120);
    expect(sheet.speed.total).toBe(30);
    expect(sheet.skills.perception.proficiency).toBe(1);
    expect(featureIds(c)).toEqual(expect.arrayContaining(["feature:keen-senses", "feature:fey-ancestry", "feature:trance", "feature:sunlight-sensitivity", "feature:drow-magic"]));
    expect(sheet.spells.map((s) => s.id)).toContain("spell:dancing-lights");
  });

  it("Wood Elf and Stout Halfling speeds", () => {
    expect(derive(build("race:wood-elf"), reg).speed.total).toBe(35);
    const halfling = derive(build("race:stout-halfling"), reg);
    expect(halfling.speed.total).toBe(25);
    expect(halfling.defenses.resist).toContain("poison");
  });

  it("Dhampir: speed 35, darkvision, a Constitution bite and the lineage ability choice", () => {
    const c = build("race:dhampir");
    c.choices["race:dhampir"] = { abilities: ["con", "str"], language: ["Elvish"] };
    c.choices["feature:lineage-ability-scores"] = { extra: ["con"] };
    c.choices["feature:ancestral-legacy"] = { skills: ["stealth", "insight"] };
    const sheet = derive(c, reg);
    expect(sheet.speed.total).toBe(35);
    expect(sheet.senses.darkvision).toBe(60);
    expect(sheet.abilities.con.score.total).toBe(16);
    expect(sheet.abilities.str.score.total).toBe(15);
    expect(sheet.skills.stealth.proficiency).toBe(1);
    // Constitution 16 (+3) instead of Strength 15 (+2), plus proficiency.
    const bite = sheet.attacks.find((a) => a.attackId === "vampiric-bite")!;
    expect(bite.attack.total).toBe(3 + sheet.proficiencyBonus);
    expect(bite.damage.bonus.total).toBe(3);
    expect(sheet.resources.find((r) => r.id === "vampiric-bite-empower")?.max).toBe(sheet.proficiencyBonus);
    expect(featureIds(c)).toEqual(expect.arrayContaining(["feature:spider-climb", "feature:vampiric-bite", "feature:ancestral-legacy"]));
    expect(sheet.warnings.filter((w) => /choice/.test(w) && !w.startsWith("Fighter"))).toEqual([]);
  });

  it("Hexblood: fey, darkvision, Eerie Token and Hex Magic with the chosen ability", () => {
    const c = build("race:hexblood");
    expect(reg.get("race:hexblood", "race").creatureType).toBe("fey");
    c.choices["feature:hex-magic"] = { ability: ["wis"] };
    const sheet = derive(c, reg);
    expect(sheet.senses.darkvision).toBe(60);
    expect(sheet.speed.total).toBe(30);
    expect(featureIds(c)).toEqual(expect.arrayContaining(["feature:eerie-token", "feature:hex-magic"]));
    expect(sheet.spellcasting.find((s) => s.id === "hex-magic")?.ability).toBe("wis");
    expect(sheet.resources.find((r) => r.id === "eerie-token")).toMatchObject({ max: 1, reset: "long" });
    expect(sheet.actions.find((a) => a.id === "eerie-token")?.economy).toBe("bonus");
  });

  it("Reborn: poison resistance and Knowledge from a Past Life", () => {
    const sheet = derive(build("race:reborn"), reg);
    expect(sheet.defenses.resist).toContain("poison");
    expect(sheet.senses.darkvision).toBeUndefined();
    expect(sheet.resources.find((r) => r.id === "past-life")?.max).toBe(sheet.proficiencyBonus);
  });
});
