import { z } from "zod";
import { Ability, DefId, Ruleset } from "./core.js";
import { Grant, Modifier } from "./modifiers.js";

export const SCHEMA_VERSION = 1;

/** Choices the player made for a definition: choiceId -> chosen values. */
export const ChoiceValues = z.record(z.string(), z.array(z.string()));
export type ChoiceValues = z.infer<typeof ChoiceValues>;

export const ClassLevel = z
  .object({
    class: DefId,
    subclass: DefId.optional(),
    level: z.number().int().min(1).max(20),
    /**
     * Hit points rolled at each level after the first, in order. Missing
     * entries use the fixed average (half the die + 1).
     */
    hpRolls: z.array(z.number().int().min(1)).optional(),
  })
  .strict();
export type ClassLevel = z.infer<typeof ClassLevel>;

export const FeatInstance = z
  .object({
    feat: DefId,
    /** Where it came from, shown in breakdowns: "Level 4 ASI", "Variant human". */
    from: z.string(),
  })
  .strict();
export type FeatInstance = z.infer<typeof FeatInstance>;

export const ItemInstance = z
  .object({
    id: z.string(),
    item: DefId,
    quantity: z.number().int().min(0).default(1),
    equipped: z.boolean().default(false),
    attuned: z.boolean().default(false),
    /** Display name override, e.g. a named heirloom. */
    name: z.string().optional(),
    notes: z.string().optional(),
  })
  .strict();
export type ItemInstance = z.infer<typeof ItemInstance>;

/** A grant typed in by hand, for anything the packs don't cover yet. */
export const ManualGrant = z
  .object({
    label: z.string(),
    grant: Grant,
  })
  .strict();
export type ManualGrant = z.infer<typeof ManualGrant>;

/** An effect currently on the character. */
export const EffectInstance = z
  .object({
    id: z.string(),
    /** Pack effect id, or "custom" with `custom` filled in. */
    effect: DefId,
    custom: z
      .object({ name: z.string(), modifiers: z.array(Modifier) })
      .strict()
      .optional(),
    /** Rounds left; absent = until removed. */
    rounds: z.number().int().min(0).optional(),
    /** For leveled effects (Exhaustion). */
    level: z.number().int().min(1).optional(),
    /** Who or what applied it, e.g. "Cleric's Bless". */
    from: z.string().optional(),
    /** Ends when this character's own concentration ends (a spell they cast on themselves). */
    concentration: z.boolean().optional(),
  })
  .strict();
export type EffectInstance = z.infer<typeof EffectInstance>;

/** A spell the character knows or has in a spellbook, on one of their spell lists. */
export const SpellInstance = z
  .object({
    spell: DefId,
    /** Spellcasting id it is cast with: "wizard", "ranger", "warlock"... */
    list: z.string(),
    /** For prepared casters (wizard, cleric...): on today's prepared list. */
    prepared: z.boolean().default(false),
  })
  .strict();
export type SpellInstance = z.infer<typeof SpellInstance>;

export const Note = z
  .object({
    id: z.string(),
    category: z.string(),
    title: z.string(),
    body: z.string(),
    pinned: z.boolean().default(false),
  })
  .strict();
export type Note = z.infer<typeof Note>;

export const Character = z
  .object({
    id: z.string(),
    schemaVersion: z.literal(SCHEMA_VERSION),
    ruleset: Ruleset,
    name: z.string(),
    player: z.string().optional(),
    alignment: z.string().optional(),
    xp: z.number().int().min(0).optional(),
    /** Ability scores before racial bonuses and other grants. */
    abilities: z.record(Ability, z.number().int().min(1).max(30)),
    race: DefId,
    background: DefId.optional(),
    classes: z.array(ClassLevel).min(1),
    feats: z.array(FeatInstance).default([]),
    /** Choices keyed by the definition that asked for them. */
    choices: z.record(DefId, ChoiceValues).default({}),
    manualGrants: z.array(ManualGrant).default([]),
    /** Table rules (house rules, rulings) active for this character: feature ids from a pack. */
    rules: z.array(DefId).default([]),
    inventory: z.array(ItemInstance).default([]),
    currency: z
      .object({ cp: z.number(), sp: z.number(), ep: z.number(), gp: z.number(), pp: z.number() })
      .partial()
      .default({}),
    hp: z
      .object({
        current: z.number().int(),
        temp: z.number().int().min(0).default(0),
      })
      .strict(),
    hitDiceUsed: z.record(z.string(), z.number().int().min(0)).default({}),
    deathSaves: z
      .object({ successes: z.number().int().min(0).max(3), failures: z.number().int().min(0).max(3) })
      .strict()
      .default({ successes: 0, failures: 0 }),
    /** Uses spent per resource id. */
    resourcesUsed: z.record(z.string(), z.number().int().min(0)).default({}),
    /** Spell slots spent, keyed by slot level ("1".."9"). */
    slotsUsed: z.record(z.string(), z.number().int().min(0)).default({}),
    /** Pact Magic slots spent. */
    pactSlotsUsed: z.number().int().min(0).default(0),
    spells: z.array(SpellInstance).default([]),
    /** The spell the character is concentrating on, if any. */
    concentration: z.object({ spell: DefId, name: z.string() }).strict().optional(),
    /** Conditions and effects currently on the character. */
    effects: z.array(EffectInstance).default([]),
    /** Named on/off states the engine reads, e.g. "raging". */
    toggles: z.array(z.string()).default([]),
    inspiration: z.boolean().default(false),
    /** Per-character preferences. Real dice is the default: most players at the table roll physical dice. */
    settings: z
      .object({ physicalDice: z.boolean().default(true) })
      .strict()
      .default({}),
    notes: z.array(Note).default([]),
  })
  .strict();
export type Character = z.infer<typeof Character>;
/** The shape as written in JSON, before defaults are filled in. */
export type CharacterInput = z.input<typeof Character>;
