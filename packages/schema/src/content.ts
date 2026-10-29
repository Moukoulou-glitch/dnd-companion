import { z } from "zod";
import { Ability, DamageType, DefId, Ruleset } from "./core.js";
import { ActionDef, AttackDef, ChoiceDef, Grant, Modifier, SpellcastingDef } from "./modifiers.js";

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
    /** The class whose level picks the row; left out: the character's level (a race's breath weapon). */
    class: DefId.optional(),
    table: z.array(z.tuple([z.number().int().min(1).max(20), z.union([z.number(), z.string()])])).min(1),
  })
  .strict();
export type Scaling = z.infer<typeof Scaling>;

export const FeatureDef = z
  .object({
    ...base,
    kind: z.literal("feature"),
    /** Every character has it: the actions anyone can take in combat (Dash, Dodge, Grapple...). */
    common: z.boolean().optional(),
    grant: Grant.optional(),
    choices: z.array(ChoiceDef).optional(),
    scaling: z.record(z.string(), Scaling).optional(),
  })
  .strict();
export type FeatureDef = z.infer<typeof FeatureDef>;

/** Items and how many. */
export const EquipCount = z.object({ item: DefId, quantity: z.number().int().min(1).default(1) }).strict();
export type EquipCount = z.infer<typeof EquipCount>;

/**
 * Starting equipment: what everyone gets, and choices like "(a) chain mail or
 * (b) leather armor, longbow and 20 arrows". A choice can also be "any martial
 * weapon": a pick from items with that tag. `gold` is the alternative of
 * starting wealth instead ("5d4*10"), or the coins a background comes with.
 */
export const StartingEquipment = z
  .object({
    fixed: z.array(EquipCount).default([]),
    options: z
      .array(
        z
          .object({
            label: z.string(),
            choices: z
              .array(
                z
                  .object({
                    items: z.array(EquipCount).default([]),
                    picks: z.array(z.object({ tag: z.string(), count: z.number().int().min(1), label: z.string() }).strict()).default([]),
                  })
                  .strict(),
              )
              .min(1),
          })
          .strict(),
      )
      .default([]),
    gold: z.string().optional(),
    /** Things the content has no item for ("a letter from a dead colleague"). */
    other: z.array(z.string()).optional(),
  })
  .strict();
export type StartingEquipment = z.infer<typeof StartingEquipment>;

export const ClassFeatureRef = z
  .object({
    level: z.number().int().min(1).max(20),
    feature: DefId,
    /** A Tasha's optional class feature: on unless the character turns it off. */
    optional: z.boolean().optional(),
    /**
     * The features this optional one stands in for (Favored Foe for Favored Enemy and
     * its later improvements): left out while it's on, back when it's off.
     */
    replaces: z.array(DefId).optional(),
  })
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
    /** What the subclass is called for this class ("Primal Path", "Otherworldly Patron"). */
    subclassTitle: z.string().optional(),
    /** Choices when this is the first class (skills), and when multiclassing into it. */
    choices: z.array(ChoiceDef).optional(),
    multiclassChoices: z.array(ChoiceDef).optional(),
    /** Levels that give an Ability Score Improvement (or a feat). */
    asiLevels: z.array(z.number().int().min(1).max(20)).optional(),
    /** Numbers by class level, index 0 = level 1: cantrips and spells known, invocations known. */
    progression: z.record(z.string(), z.array(z.number().int().min(0)).length(20)).optional(),
    /** Ability minimums to multiclass into or out of it; `any` means one of them is enough (Fighter: STR or DEX 13). */
    multiclassPrereq: z.object({ abilities: z.record(Ability, z.number().int()), any: z.boolean().optional() }).strict().optional(),
    /** Features of an earlier pack's version of this class that this one drops (Tasha's ranger replaces Favored Enemy). */
    replaces: z.array(DefId).optional(),
    /**
     * Features added on top of an earlier pack's version, without replacing that
     * level's others (Tasha's optional class features: Ki-Fueled Attack at 3rd).
     */
    adds: z.array(z.object({ level: z.number().int().min(1).max(20), feature: DefId, replaces: z.array(DefId).optional() }).strict()).optional(),
    startingEquipment: StartingEquipment.optional(),
  })
  .strict();
export type ClassDef = z.infer<typeof ClassDef>;

export const SubclassDef = z
  .object({
    ...base,
    kind: z.literal("subclass"),
    class: DefId,
    features: z.array(ClassFeatureRef),
    choices: z.array(ChoiceDef).optional(),
  })
  .strict();
export type SubclassDef = z.infer<typeof SubclassDef>;

export const RaceDef = z
  .object({
    ...base,
    kind: z.literal("race"),
    size: z.enum(["small", "medium"]),
    /** Humanoid unless the race says otherwise. */
    creatureType: z.string().optional(),
    /** For subraces: the race it belongs to, for grouping ("Dwarf" for Hill Dwarf). */
    group: z.string().optional(),
    choices: z.array(ChoiceDef).optional(),
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
    choices: z.array(ChoiceDef).optional(),
    features: z.array(DefId).default([]),
    equipment: StartingEquipment.optional(),
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
    /**
     * Charges (Chime of Opening: 10; Horn of Silent Alarm: 4, 1d4 back at dawn): `regain` is dice, a number or "all";
     * `onEmpty` is what happens when the last one is used.
     */
    charges: z.object({ max: z.number().int().min(1), regain: z.string().optional(), onEmpty: z.string().optional() }).strict().optional(),
    /** A curse (Demon Armor): what it does, our own words; it holds while you're attuned (or have it, for an item without attunement). */
    curse: z.object({ text: z.string(), name: z.string().optional() }).strict().optional(),
    /** Once, when you attune to it (an artifact's 4d10 psychic damage): damage to roll and take, or a note. */
    onAttune: z.array(z.object({ damage: z.object({ dice: z.string(), type: z.string() }).strict().optional(), note: z.string().optional() }).strict()).optional(),
    /** Ammunition: the weapons it's shot from, by item id or weapon group ("item:longbow", "longbow"); left out, it's worked out from its name. */
    ammoFor: z.array(z.string()).optional(),
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
    /** The weapons or armor it can be (Frost Brand: any sword): picked on the item, its stats taken from that one. */
    baseFrom: z.array(DefId).optional(),
    /** Applies while equipped (and attuned, if attunement is required). */
    grant: Grant.optional(),
    cost: z.object({ amount: z.number(), unit: z.enum(["cp", "sp", "ep", "gp", "pp"]) }).strict().optional(),
    /** Equipment categories ("martial-weapons", "musical-instruments", "holy-symbols") for "any ..." choices. */
    tags: z.array(z.string()).optional(),
    /** What a pack holds (Explorer's Pack): unpacked into these items at character creation. */
    contents: z.array(EquipCount).optional(),
    /**
     * Used up from the inventory (a potion): drunk, or given to another creature, with the part of the turn it takes.
     * `heal`: the hit points it restores (Potion of Healing: 2d4 + 2).
     */
    use: z
      .object({
        economy: z.enum(["action", "bonus"]),
        heal: z.object({ dice: z.string(), bonus: z.number().int().default(0) }).strict().optional(),
        /** Damage to whoever drinks it (Potion of Poison: 3d6 poison). */
        damage: z.object({ dice: z.string(), type: z.string() }).strict().optional(),
        /** The effect it puts on whoever drinks it (Potion of Flying), for the effect's own time unless `hours` is rolled. */
        effect: DefId.optional(),
        /** The effect's choice: fixed by the potion (Hill Giant Strength: "21"), or picked when used from `options` (Resistance: the damage type). */
        choice: z.string().optional(),
        options: z.object({ label: z.string(), values: z.array(z.string()).min(1) }).strict().optional(),
        /** Its time in hours, rolled when used (Growth: 1d4). */
        hours: z.string().optional(),
        /** Effects it ends on the drinker (Vitality: exhaustion and poisoned). */
        removes: z.array(DefId).optional(),
        /** Drinking it changes your form (Dragon's Majesty): the creatures whose names match `match`; the form lasts as long as `effect`. */
        transform: z.object({ match: z.string(), label: z.string() }).strict().optional(),
        consumed: z.boolean().default(true),
        note: z.string().optional(),
      })
      .strict()
      .optional(),
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
    /** Lasts until the next short rest (any rest) or long rest. */
    untilRest: z.enum(["short", "long"]).optional(),
    /**
     * Something chosen when it's applied (Hex: the ability). Selectors may use
     * "{choice}", e.g. "roll.check.{choice}".
     */
    choice: z
      .object({
        label: z.string(),
        options: z.array(z.string()).min(1),
        /** The pick is a number rolled (Heroes' Feast: the 2d10 hit point maximum increase): offered as a roll. */
        roll: z.string().optional(),
      })
      .strict()
      .optional(),
    /**
     * Ends something on you instead of staying as a tag (Lesser Restoration): each pick and the condition it ends,
     * or "exhaustion" for one exhaustion level.
     */
    ends: z.record(z.string(), z.string()).optional(),
    /** Cast at a higher level: modifiers may use "slotLevel" (Aid: 5*slotLevel - 5). */
    upcast: z.object({ baseLevel: z.number().int().min(1).max(9) }).strict().optional(),
    /** What each level does (Exhaustion), shown on its card. */
    levelNotes: z.array(z.string()).optional(),
    /**
     * Only ever on the caster (Hex, Hunter's Mark, Shield): left out of
     * "Add an effect", which is for effects someone or something else puts on you.
     */
    selfOnly: z.boolean().optional(),
    /** Gone once its bonus is used in a roll (Bardic Inspiration). */
    usedUp: z.boolean().optional(),
    /** Used up, unless the roll still fails: then it's kept (Unfailing Inspiration). The feature's name. */
    keepIfFails: z.string().optional(),
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
      .object({
        text: z.string(),
        amount: z.union([z.number(), z.string()]).optional(),
        whileTempHp: z.boolean().optional(),
        /** It ends once that damage is taken (Protective Bond's resistance, for the damage taken in another's place). */
        endsAfter: z.boolean().optional(),
      })
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
    /** Conditions it includes by its choice (Blindness/Deafness: "Blinded" → blinded). */
    includesByChoice: z.record(z.string(), z.array(DefId)).optional(),
    /** Reminders for what the app can't apply itself, e.g. "Attacks against you have advantage". */
    reminders: z.array(z.string()).default([]),
    /** Actions you can take while it's on (Haste: the extra action). */
    actions: z.array(ActionDef).optional(),
    /** Its rounds come from the character (holding your breath: 1 + Constitution modifier minutes; suffocating: Constitution modifier rounds). */
    roundsFrom: z.enum(["breath", "suffocation"]).optional(),
    /** When its time runs out (not when it's ended by hand), this effect follows (holding your breath → suffocating). */
    whenTimeRunsOut: DefId.optional(),
    /** When its time runs out, you drop to 0 hit points (suffocating). */
    dropsToZero: z.boolean().optional(),
    /** Its choice is a spell you can cast while it's on, at will (Wish duplicating a spell). */
    grantsChosenSpell: z.boolean().optional(),
    /** Weapons it gives you while it's on (Shadow Blade); damage may use the slot it was cast with. */
    attacks: z.array(AttackDef).optional(),
    /** Said when it ends (Haste: the wave of lethargy). */
    endNote: z.string().optional(),
    /** Turns you into a creature (Polymorph: a beast; True Polymorph: any creature): the app asks which. */
    transform: z.enum(["beast", "creature", "shapechange", "animal"]).optional(),
    /** An effect that follows when it ends, lasting until after your next turn (Haste's lethargy). */
    afterEffect: DefId.optional(),
    /**
     * Something it has a number of, counted down on its card (Mirror Image: 3
     * duplicates). `need[n-1]`: what a d20 must roll with n left (Mirror Image:
     * 11, 8, 6); `ac`: their AC, `base` + an ability modifier; `endsAtZero`: the
     * effect ends with the last one.
     */
    counter: z
      .object({
        label: z.string(),
        start: z.number().int().min(1),
        need: z.array(z.number().int().min(1).max(20)).optional(),
        ac: z.object({ base: z.number().int(), ability: z.enum(["str", "dex", "con", "int", "wis", "cha"]).optional() }).strict().optional(),
        endsAtZero: z.boolean().optional(),
        /** What it deals each time (Guardian of Faith: 20 radiant, half on a Dexterity save): the count goes down by the damage dealt. */
        strike: z.object({ amount: z.number().int().min(1), type: z.string(), save: z.enum(["str", "dex", "con", "int", "wis", "cha"]) }).strict().optional(),
        /** Said when it reaches 0 (Guardian of Faith: the guardian vanishes). */
        endText: z.string().optional(),
        /** Rolled when it's cast, and the count starts there (Time Stop: 1d4 + 1 turns). */
        startRoll: z.string().optional(),
        /** Using one heals you (Goodberry: eat a berry, 1 hit point). */
        /** `spellBonus`: features adding to your healing spells (Disciple of Life) are offered on each use too, your table's call. */
        use: z.object({ label: z.string(), heal: z.number().int().min(0), spellBonus: z.boolean().optional() }).strict().optional(),
      })
      .strict()
      .optional(),
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
    /** Classes it joins only with Tasha's optional expanded list on (a book's "Optional/Variant Classes"). */
    optionalClasses: z.array(z.string()).optional(),
    /** The spell's text, one entry per paragraph. */
    text: z.array(z.string()).default([]),
    higherLevels: z.array(z.string()).default([]),
    attack: z.enum(["melee", "ranged"]).optional(),
    save: z.object({ ability: Ability, onSuccess: z.enum(["half", "none", "other"]) }).strict().optional(),
    /** "MOD" in dice strings means the caster's spellcasting modifier. */
    damage: z
      .object({
        type: z.string().optional(),
        atSlot: DiceTable.optional(),
        atCharacterLevel: DiceTable.optional(),
        /**
         * More damage of another type in the same hit (Ice Storm: 4d6 cold with its
         * bludgeoning). Each part is rolled as its own dice of its own type.
         */
        also: z.array(z.object({ type: z.string(), atSlot: DiceTable.optional(), atCharacterLevel: DiceTable.optional() }).strict()).optional(),
        /** Damage types the caster picks from on each roll (Spirit Guardians: radiant or necrotic). */
        typeOptions: z.array(z.string()).optional(),
        /** What the main dice are for, when there's an alternative (Toll the Dead: "Target unhurt"). */
        label: z.string().optional(),
        /** Other dice in another situation (Toll the Dead: d12s if the target is missing hit points): a second roll button. */
        alt: z.object({ label: z.string(), atSlot: DiceTable.optional(), atCharacterLevel: DiceTable.optional() }).strict().optional(),
      })
      .strict()
      .optional(),
    heal: z.object({ atSlot: DiceTable }).strict().optional(),
    area: z.string().optional(),
    /** Can be cast at just one creature (War Caster's opportunity-attack spell needs this and a 1-action casting time). */
    singleTarget: z.boolean().optional(),
  })
  .strict();
export type SpellDef = z.infer<typeof SpellDef>;

/** An action in a creature's stat block; `attack` when it's an attack roll the app can make. */
export const CreatureAction = z
  .object({
    name: z.string(),
    text: z.string().default(""),
    attack: z
      .object({
        kind: z.enum(["melee", "ranged"]),
        toHit: z.number().int(),
        reach: z.string().optional(),
        /** Damage dice ("2d6"); the flat part is `damageBonus`. */
        damage: z.string(),
        damageBonus: z.number().int().default(0),
        damageType: DamageType,
      })
      .strict()
      .optional(),
    /**
     * It gives its own life to a creature at 0 hit points (a Heammer Wisp's Give Life):
     * the target regains `dice` hit points, and its current and maximum hit points drop by as much.
     */
    lifeTransfer: z.object({ dice: z.string() }).strict().optional(),
  })
  .strict();
export type CreatureAction = z.infer<typeof CreatureAction>;

/** A creature's stat block: beasts for Wild Shape and Polymorph, elementals for a Moon druid. */
export const CreatureDef = z
  .object({
    ...base,
    kind: z.literal("creature"),
    size: z.string(),
    type: z.string(),
    alignment: z.string().optional(),
    ac: z.number().int(),
    acNote: z.string().optional(),
    hp: z.number().int().min(1),
    hitDice: z.string().optional(),
    speed: z
      .object({ walk: z.number().int().default(0), swim: z.number().int().optional(), fly: z.number().int().optional(), climb: z.number().int().optional(), burrow: z.number().int().optional(), hover: z.boolean().optional() })
      .strict(),
    abilities: z.record(Ability, z.number().int().min(1).max(30)),
    saves: z.record(Ability, z.number().int()).optional(),
    /** Skill bonuses by skill key ("perception": 4). */
    skills: z.record(z.string(), z.number().int()).optional(),
    senses: z.record(z.string(), z.number().int()).optional(),
    languages: z.string().optional(),
    /** Challenge rating as a number (1/4 = 0.25). */
    cr: z.number().min(0),
    resist: z.array(z.string()).optional(),
    immune: z.array(z.string()).optional(),
    vulnerable: z.array(z.string()).optional(),
    conditionImmune: z.array(z.string()).optional(),
    traits: z.array(z.object({ name: z.string(), text: z.string() }).strict()).default([]),
    actions: z.array(CreatureAction).default([]),
    bonusActions: z.array(CreatureAction).optional(),
    reactions: z.array(CreatureAction).optional(),
  })
  .strict();
export type CreatureDef = z.infer<typeof CreatureDef>;

/** Which variants a part of a spirit's stat block belongs to (all when absent). */
const ForVariants = { variants: z.array(z.string()).optional() };
const SpiritSpeed = z.object({ walk: z.number().int().optional(), swim: z.number().int().optional(), fly: z.number().int().optional(), climb: z.number().int().optional(), burrow: z.number().int().optional(), hover: z.boolean().optional() }).strict();

/**
 * A creature whose stat block grows with the level of the spell that summons it
 * (Summon Beast's Bestial Spirit, Summon Aberration's Aberrant Spirit), in our own
 * words. You pick a variant when you cast it (air, land or water). Its attacks use
 * your spell attack modifier; "{dc}" in its texts is your spell save DC and
 * "{level}" the spell's level. AC is `ac.base` + the spell's level; hit points
 * `hp.base` (or the variant's) + `hp.perLevel` for each level above `minLevel`;
 * its Multiattack makes half the spell's level (rounded down) attacks.
 */
export const SpiritTemplate = z
  .object({
    name: z.string(),
    size: z.string(),
    type: z.string(),
    minLevel: z.number().int().min(1).max(9),
    variants: z.array(z.object({ id: z.string(), name: z.string(), hp: z.number().int().optional(), acBonus: z.number().int().optional() }).strict()).min(1),
    ac: z.object({ base: z.number().int() }).strict(),
    hp: z.object({ base: z.number().int(), perLevel: z.number().int() }).strict(),
    speed: z.array(SpiritSpeed.extend(ForVariants)).min(1),
    abilities: z.record(Ability, z.number().int().min(1).max(30)),
    senses: z.record(z.string(), z.number().int()).optional(),
    languages: z.string().optional(),
    resist: z.array(z.object({ type: z.string(), ...ForVariants }).strict()).optional(),
    immune: z.array(z.object({ type: z.string(), ...ForVariants }).strict()).optional(),
    conditionImmune: z.array(z.string()).optional(),
    traits: z.array(z.object({ name: z.string(), text: z.string(), ...ForVariants }).strict()).default([]),
    /** "{multi}" in a Multiattack's text is the number of attacks (half the spell's level). */
    actions: z
      .array(
        z
          .object({
            name: z.string(),
            text: z.string().default(""),
            ...ForVariants,
            attack: z
              .object({
                kind: z.enum(["melee", "ranged"]),
                reach: z.string().optional(),
                damage: z.string(),
                /** The flat part before the spell's level is added. */
                damageBonus: z.number().int(),
                damageType: DamageType,
                /** A different type for some variants (the fire elemental's Slam). */
                damageTypeFor: z.record(z.string(), DamageType).optional(),
              })
              .strict()
              .optional(),
          })
          .strict(),
      )
      .default([]),
    bonusActions: z.array(z.object({ name: z.string(), text: z.string(), ...ForVariants }).strict()).optional(),
    reactions: z.array(z.object({ name: z.string(), text: z.string(), ...ForVariants }).strict()).optional(),
  })
  .strict();
export type SpiritTemplate = z.infer<typeof SpiritTemplate>;

/**
 * What a spell that summons, creates or animates creatures lets you pick, and
 * how many: listed creatures (Find Familiar), or any of a type up to a CR in
 * tiers (Conjure Animals: one CR 2, two CR 1, four CR 1/2 or eight CR 1/4).
 */
export const SummonDef = z
  .object({
    ...base,
    kind: z.literal("summon"),
    /** The spell that summons them; none for a feature's summons (Theros' Heammer Wisps, through `opensSummon`). */
    spell: DefId.optional(),
    /** How many: a class level divided (Theros: half your druid level). */
    countByClass: z.object({ class: DefId, divide: z.number().int().min(1) }).strict().optional(),
    /** Creatures to choose from; or `type` (with `tiers` or a CR equal to the slot level). */
    creatures: z.array(DefId).optional(),
    type: z.array(z.string()).optional(),
    tiers: z.array(z.object({ maxCr: z.number(), count: z.number().int().min(1) }).strict()).optional(),
    /** Conjure Elemental: CR up to the slot level. */
    crBySlot: z.boolean().optional(),
    /** The highest CR by slot level (Summon Greater Demon: CR 5 at 4th, 6 at 5th...). */
    maxCr: z.record(z.string(), z.number()).optional(),
    /** How many by slot level ("3": 1, "4": 3...); `multiplier` scales tier counts (Conjure Animals at 5th: ×2). */
    count: z.record(z.string(), z.number().int().min(1)).optional(),
    multiplier: z.record(z.string(), z.number().int().min(1)).optional(),
    /** Its own initiative (a familiar), one shared roll for the group (conjured animals), or yours. */
    initiative: z.enum(["own", "shared", "yours"]).default("shared"),
    /** Gone when your concentration ends. */
    concentration: z.boolean().optional(),
    /** Its hit point maximum is half the creature's (Simulacrum). */
    halfHp: z.boolean().optional(),
    /** A spirit whose stat block grows with the spell's level (Summon Beast): built when cast. */
    spirit: SpiritTemplate.optional(),
    note: z.string().optional(),
  })
  .strict();
export type SummonDef = z.infer<typeof SummonDef>;

export const Definition = z.discriminatedUnion("kind", [
  SummonDef,
  CreatureDef,
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
