import { z } from "zod";
import { Ability, DamageType, DefId, Ruleset } from "./core.js";
import { ChoiceDef, Grant, SpellcastingDef } from "./modifiers.js";

/**
 * Where a definition comes from. `book` and `page` are references only;
 * definitions never carry copied book text, just short summaries in our own
 * words plus the mechanics.
 */
export const SourceRef = z
  .object({
    pack: z.string(),
    book: z.string().optional(),
    page: z.number().int().optional(),
  })
  .strict();
export type SourceRef = z.infer<typeof SourceRef>;

const base = {
  id: DefId,
  name: z.string(),
  /** One or two sentences in our own words. */
  summary: z.string().optional(),
  source: SourceRef,
};

export const FeatureDef = z
  .object({
    ...base,
    kind: z.literal("feature"),
    grant: Grant.optional(),
    choices: z.array(ChoiceDef).optional(),
  })
  .strict();
export type FeatureDef = z.infer<typeof FeatureDef>;

export const ClassFeatureRef = z
  .object({ level: z.number().int().min(1).max(20), feature: DefId })
  .strict();

export const ClassDef = z
  .object({
    ...base,
    kind: z.literal("class"),
    hitDie: z.union([z.literal(6), z.literal(8), z.literal(10), z.literal(12)]),
    saves: z.array(Ability).length(2),
    /** Proficiencies granted only when this is the first class. */
    startingGrant: Grant.optional(),
    /** Proficiencies granted when multiclassing into it. */
    multiclassGrant: Grant.optional(),
    spellcasting: SpellcastingDef.optional(),
    /** The level at which spellcasting starts (ranger and paladin: 2). */
    spellcastingFromLevel: z.number().int().min(1).optional(),
    features: z.array(ClassFeatureRef),
    subclassLevel: z.number().int().min(1),
  })
  .strict();
export type ClassDef = z.infer<typeof ClassDef>;

export const SubclassDef = z
  .object({
    ...base,
    kind: z.literal("subclass"),
    class: DefId,
    features: z.array(ClassFeatureRef),
  })
  .strict();
export type SubclassDef = z.infer<typeof SubclassDef>;

export const RaceDef = z
  .object({
    ...base,
    kind: z.literal("race"),
    size: z.enum(["small", "medium"]),
    speed: z.number().int(),
    grant: Grant.optional(),
    features: z.array(DefId).default([]),
  })
  .strict();
export type RaceDef = z.infer<typeof RaceDef>;

export const BackgroundDef = z
  .object({
    ...base,
    kind: z.literal("background"),
    grant: Grant.optional(),
    features: z.array(DefId).default([]),
  })
  .strict();
export type BackgroundDef = z.infer<typeof BackgroundDef>;

export const FeatDef = z
  .object({
    ...base,
    kind: z.literal("feat"),
    features: z.array(DefId).default([]),
    grant: Grant.optional(),
    choices: z.array(ChoiceDef).optional(),
  })
  .strict();
export type FeatDef = z.infer<typeof FeatDef>;

export const WeaponProperty = z.enum([
  "ammunition",
  "finesse",
  "heavy",
  "light",
  "loading",
  "reach",
  "special",
  "thrown",
  "two-handed",
  "versatile",
]);
export type WeaponProperty = z.infer<typeof WeaponProperty>;

export const WeaponStats = z
  .object({
    category: z.enum(["simple", "martial"]),
    kind: z.enum(["melee", "ranged"]),
    /** Weapon group used for proficiencies like "longswords". */
    group: z.string(),
    damage: z.string(),
    damageType: DamageType,
    versatileDamage: z.string().optional(),
    properties: z.array(WeaponProperty).default([]),
    range: z.tuple([z.number(), z.number()]).optional(),
  })
  .strict();
export type WeaponStats = z.infer<typeof WeaponStats>;

export const ArmorStats = z
  .object({
    category: z.enum(["light", "medium", "heavy"]),
    base: z.number().int(),
    stealthDisadvantage: z.boolean().default(false),
    strengthRequired: z.number().int().optional(),
  })
  .strict();
export type ArmorStats = z.infer<typeof ArmorStats>;

export const ItemDef = z
  .object({
    ...base,
    kind: z.literal("item"),
    category: z.enum(["weapon", "armor", "shield", "ammunition", "gear", "tool", "consumable", "wondrous", "focus"]),
    weight: z.number().optional(),
    weapon: WeaponStats.optional(),
    armor: ArmorStats.optional(),
    /** Shield AC bonus. */
    shieldBonus: z.number().int().optional(),
    magic: z
      .object({
        /** +1/+2/+3 to attack and damage (weapons) or AC (armor, shields). */
        bonus: z.number().int().optional(),
        rarity: z.enum(["common", "uncommon", "rare", "very rare", "legendary", "artifact"]).optional(),
      })
      .strict()
      .optional(),
    requiresAttunement: z.boolean().default(false),
    /** Applies while equipped (and attuned, if attunement is required). */
    grant: Grant.optional(),
  })
  .strict();
export type ItemDef = z.infer<typeof ItemDef>;

export const Definition = z.discriminatedUnion("kind", [
  FeatureDef,
  ClassDef,
  SubclassDef,
  RaceDef,
  BackgroundDef,
  FeatDef,
  ItemDef,
]);
export type Definition = z.infer<typeof Definition>;

export const ContentPack = z
  .object({
    id: z.string(),
    title: z.string(),
    ruleset: Ruleset,
    license: z.string(),
    visibility: z.enum(["built-in", "private", "campaign"]),
    definitions: z.array(Definition),
  })
  .strict();
export type ContentPack = z.infer<typeof ContentPack>;
