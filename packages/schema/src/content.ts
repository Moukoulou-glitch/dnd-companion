import { z } from "zod";
import { Ability, DamageType, DefId, Ruleset } from "./core.js";
import { ChoiceDef, Grant, Modifier, SpellcastingDef } from "./modifiers.js";

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
  /**
   * Full text, one entry per paragraph. Filled only by the SRD pack and by book
   * text the player loads on their own device; never committed for non-SRD books.
   */
  text: z.array(z.string()).optional(),
};

/**
 * A value that grows with class level, read with "scale.<name>". The value at
 * the highest listed level not above the character's level in `class` wins.
 * Example: Sneak Attack { class: "class:rogue", table: [[1,"1d6"],[3,"2d6"],...] }.
 */
export const Scaling = z
  .object({
    class: DefId,
    table: z.array(z.tuple([z.number().int().min(1).max(20), z.union([z.number(), z.string()])])).min(1),
  })
  .strict();
export type Scaling = z.infer<typeof Scaling>;

export const FeatureDef = z
  .object({
    ...base,
    kind: z.literal("feature"),
    grant: Grant.optional(),
    choices: z.array(ChoiceDef).optional(),
    scaling: z.record(z.string(), Scaling).optional(),
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
    /** Prepared casters choose today's spells from their list; known casters always have theirs ready. */
    spellPreparation: z.enum(["prepared", "known"]).optional(),
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

/**
 * Something affecting the character for a while: a condition, a spell cast
 * on them, a DM ruling. Its modifiers apply while it is active.
 */
export const EffectDef = z
  .object({
    ...base,
    kind: z.literal("effect"),
    category: z.enum(["condition", "spell", "other"]),
    modifiers: z.array(Modifier).default([]),
    /** Default duration in rounds (1 minute = 10); leave out for "until removed". */
    rounds: z.number().int().min(1).optional(),
    /** Longer default durations in minutes (Mage Armor: 480). Rests and "time passes" count them down. */
    minutes: z.number().int().min(1).optional(),
    /**
     * Something chosen when it's applied (Hex: the ability). Selectors may use
     * "{choice}", e.g. "roll.check.{choice}".
     */
    choice: z.object({ label: z.string(), options: z.array(z.string()).min(1) }).strict().optional(),
    /** Cast at a higher level: modifiers may use "slotLevel" (Aid: 5*slotLevel - 5). */
    upcast: z.object({ baseLevel: z.number().int().min(1).max(9) }).strict().optional(),
    /** What each level does (Exhaustion), shown on its card. */
    levelNotes: z.array(z.string()).optional(),
    /**
     * Only ever on the caster (Hex, Hunter's Mark, Shield): left out of
     * "Add an effect", which is for effects someone or something else puts on you.
     */
    selfOnly: z.boolean().optional(),
    /** Ends when you do one of these (Invisibility: attack or cast a spell); the app asks. */
    endsOn: z.array(z.enum(["attack", "cast"])).optional(),
    /** Temporary HP gained when applied (Armor of Agathys: 5*slotLevel). */
    tempHpGain: z.union([z.number(), z.string()]).optional(),
    /**
     * A reminder each time you take damage while it's on (Armor of Agathys:
     * melee attackers take cold damage). "{amount}" in the text is `amount`
     * worked out at the cast level. `whileTempHp`: only while you have temp HP,
     * and it ends when they're gone.
     */
    onDamage: z
      .object({ text: z.string(), amount: z.union([z.number(), z.string()]).optional(), whileTempHp: z.boolean().optional() })
      .strict()
      .optional(),
    /** Current HP gained when applied (Aid). May use "slotLevel". */
    hpGain: z.union([z.number(), z.string()]).optional(),
    /** Ends if the caster loses concentration. */
    concentration: z.boolean().default(false),
    /** Exhaustion-style levels: level n applies the modifiers of levels 1..n. */
    levels: z.array(z.array(Modifier)).optional(),
    /** Other conditions this one includes (Paralyzed includes Incapacitated). */
    includes: z.array(DefId).default([]),
    /** Reminders for what the app can't apply itself, e.g. "Attacks against you have advantage". */
    reminders: z.array(z.string()).default([]),
  })
  .strict();
export type EffectDef = z.infer<typeof EffectDef>;

/** Dice for a spell at each slot level ("1".."9") or character level ("1","5","11","17"). */
const DiceTable = z.record(z.string(), z.string());

export const SpellDef = z
  .object({
    ...base,
    kind: z.literal("spell"),
    level: z.number().int().min(0).max(9),
    school: z.string(),
    castingTime: z.string(),
    range: z.string(),
    components: z.array(z.enum(["V", "S", "M"])),
    material: z.string().optional(),
    duration: z.string(),
    concentration: z.boolean(),
    ritual: z.boolean(),
    /** Class lists the spell is on, e.g. ["wizard", "sorcerer"]. */
    classes: z.array(z.string()).default([]),
    /** The spell's text, one entry per paragraph. */
    text: z.array(z.string()).default([]),
    higherLevels: z.array(z.string()).default([]),
    attack: z.enum(["melee", "ranged"]).optional(),
    save: z.object({ ability: Ability, onSuccess: z.enum(["half", "none", "other"]) }).strict().optional(),
    /** "MOD" in dice strings means the caster's spellcasting modifier. */
    damage: z
      .object({ type: z.string().optional(), atSlot: DiceTable.optional(), atCharacterLevel: DiceTable.optional() })
      .strict()
      .optional(),
    heal: z.object({ atSlot: DiceTable }).strict().optional(),
    area: z.string().optional(),
  })
  .strict();
export type SpellDef = z.infer<typeof SpellDef>;

export const Definition = z.discriminatedUnion("kind", [
  SpellDef,
  EffectDef,
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
