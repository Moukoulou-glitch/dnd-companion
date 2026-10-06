import { z } from "zod";

/** The six abilities, in sheet order. */
export const ABILITIES = ["str", "dex", "con", "int", "wis", "cha"] as const;
export const Ability = z.enum(ABILITIES);
export type Ability = z.infer<typeof Ability>;

export const ABILITY_NAMES: Record<Ability, string> = {
  str: "Strength",
  dex: "Dexterity",
  con: "Constitution",
  int: "Intelligence",
  wis: "Wisdom",
  cha: "Charisma",
};

/** The 18 skills of the 2014 rules and the ability each one uses. */
export const SKILL_ABILITY = {
  acrobatics: "dex",
  animalHandling: "wis",
  arcana: "int",
  athletics: "str",
  deception: "cha",
  history: "int",
  insight: "wis",
  intimidation: "cha",
  investigation: "int",
  medicine: "wis",
  nature: "int",
  perception: "wis",
  performance: "cha",
  persuasion: "cha",
  religion: "int",
  sleightOfHand: "dex",
  stealth: "dex",
  survival: "wis",
} as const satisfies Record<string, Ability>;

export const SKILLS = Object.keys(SKILL_ABILITY) as (keyof typeof SKILL_ABILITY)[];
export const Skill = z.enum(SKILLS as [keyof typeof SKILL_ABILITY, ...(keyof typeof SKILL_ABILITY)[]]);
export type Skill = z.infer<typeof Skill>;

export const SKILL_NAMES: Record<Skill, string> = {
  acrobatics: "Acrobatics",
  animalHandling: "Animal Handling",
  arcana: "Arcana",
  athletics: "Athletics",
  deception: "Deception",
  history: "History",
  insight: "Insight",
  intimidation: "Intimidation",
  investigation: "Investigation",
  medicine: "Medicine",
  nature: "Nature",
  perception: "Perception",
  performance: "Performance",
  persuasion: "Persuasion",
  religion: "Religion",
  sleightOfHand: "Sleight of Hand",
  stealth: "Stealth",
  survival: "Survival",
};

export const DamageType = z.enum([
  "acid",
  "bludgeoning",
  "cold",
  "fire",
  "force",
  "lightning",
  "necrotic",
  "piercing",
  "poison",
  "psychic",
  "radiant",
  "slashing",
  "thunder",
]);
export type DamageType = z.infer<typeof DamageType>;

export const Ruleset = z.enum(["5e-2014"]);
export type Ruleset = z.infer<typeof Ruleset>;

/**
 * A value expression. Either a plain number, or a string the engine evaluates:
 * terms joined by + or -, where a term is a number, dice ("1d4", "2d6"),
 * "pb" (proficiency bonus), "mod.<ability>", "level" (character level),
 * "classLevel.<classId>", or "scale.<name>" (a level table on the feature
 * that holds the modifier, e.g. Sneak Attack dice or Rage damage).
 * Examples: 2, "1d4", "pb", "13 + mod.dex", "classLevel.ranger", "scale.dice".
 */
export const ValueExpr = z.union([z.number(), z.string().min(1)]);
export type ValueExpr = z.infer<typeof ValueExpr>;

/** Stable id for any definition, e.g. "srd:class:ranger" or "group:feat:magic-initiate". */
export const DefId = z.string().min(1);
export type DefId = z.infer<typeof DefId>;
