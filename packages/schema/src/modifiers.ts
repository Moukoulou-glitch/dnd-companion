import { z } from "zod";
import { Ability, DamageType, DefId, ValueExpr } from "./core.js";

/**
 * Selectors are dotted paths saying what a modifier touches. A trailing "*"
 * matches everything below that point.
 *
 * Rolls
 *   roll.attack.weapon.melee | roll.attack.weapon.ranged | roll.attack.spell.melee | roll.attack.spell.ranged
 *   roll.damage.weapon.melee | roll.damage.weapon.ranged | roll.damage.spell
 *   roll.save.<ability>
 *   roll.check.<ability>            (every check with that ability, skills included)
 *   roll.check.skill.<skill>
 *   roll.initiative                 (initiative is also a Dexterity check, so roll.check.dex applies too)
 * Stats
 *   stat.ac | stat.speed.walk | stat.hp.max | stat.spell.dc | stat.spell.attack
 *   stat.passive.<skill>
 * Defenses
 *   defense.resist.<damageType> | defense.immune.<damageType> | defense.vulnerable.<damageType>
 * Item-scoped (only inside an item's own grant; applies to rolls made with that item)
 *   item.attack | item.damage
 * One attack, from anywhere (house rules, features)
 *   attack.<attackId> | damage.<attackId>           (attackId = item definition id or AttackDef id)
 *   attack.<attackId>.thrown | damage.<attackId>.thrown
 *   roll.attack.weapon.thrown | roll.damage.weapon.thrown   (any melee weapon thrown at range)
 *
 * Examples: "roll.attack.*", "roll.save.*", "roll.check.skill.stealth", "stat.ac".
 */
export const Selector = z.string().min(1);
export type Selector = z.infer<typeof Selector>;

/**
 * When a modifier applies. Everything listed must hold. The engine can check
 * the structured fields; `text` is a condition the app cannot know (e.g.
 * "target is within 5 ft"), which always turns the modifier into a suggestion.
 */
export const Condition = z
  .object({
    /** Not wearing body armor (a shield is allowed). */
    noArmor: z.boolean().optional(),
    /** Not wearing heavy armor. */
    noHeavyArmor: z.boolean().optional(),
    /** Not holding a shield. */
    noShield: z.boolean().optional(),
    /** Holding a shield. */
    withShield: z.boolean().optional(),
    /** Final ability scores at least these values, e.g. { "dex": 16 }. */
    minScore: z.record(Ability, z.number().int()).optional(),
    /** A named on/off state on the character, e.g. "raging", "sharpshooter". */
    toggle: z.string().optional(),
    /** Human-readable condition the engine cannot verify. */
    text: z.string().optional(),
  })
  .strict();
export type Condition = z.infer<typeof Condition>;

export const ModifierOp = z.enum([
  /** Add a flat number or dice to the roll or stat. */
  "add",
  /** Advantage on the roll. 2014 rule: any advantage + any disadvantage cancel. */
  "advantage",
  "disadvantage",
  /** Offer an alternative AC base formula (Mage Armor, Unarmored Defense). The highest applicable one wins. */
  "acBase",
  /** Treat any d20 below `value` as `value` (Reliable Talent). */
  "minD20",
  /** Reroll dice at or below `value` once (Great Weapon Fighting, Halfling Lucky). */
  "reroll",
  /** Critical hit range starts at `value` (Champion: 19). */
  "critRange",
  /** Extra weapon damage dice on a critical hit (Brutal Critical). */
  "extraCritDice",
  /** Extra flat damage added only on a natural 20 (Vicious weapon). */
  "critBonusDamage",
  /** Raise the Dexterity cap of medium armor to `value` (Medium Armor Master: 3). Selector stat.ac. */
  "mediumArmorDexCap",
  /** Stats: the value becomes at most `value` (Grappled: speed 0). */
  "set",
  /** Stats: multiply, rounding down (Exhaustion 2: speed × 0.5; Haste: × 2). */
  "multiply",
  /** Rolls: the roll fails automatically (Paralyzed: Strength and Dexterity saves). */
  "autoFail",
  "resist",
  "vulnerable",
  "immune",
  /** Rolls: a reminder shown with the roll; `label` is the text (Ancestral Protectors on your first hit). */
  "note",
  /**
   * A rule permission, no number: "rule.twoWeapon.nonLight" (Dual Wielder:
   * two-weapon fighting with weapons that aren't light), "rule.twoWeapon.ability"
   * (Two-Weapon Fighting style: ability modifier on the off-hand damage).
   */
  "allow",
]);
export type ModifierOp = z.infer<typeof ModifierOp>;

export const Modifier = z
  .object({
    selector: Selector,
    op: ModifierOp,
    value: ValueExpr.optional(),
    /** auto: always applied when its condition holds. suggested: shown as a toggle in the roll composer. */
    mode: z.enum(["auto", "suggested"]).default("auto"),
    when: Condition.optional(),
    /** Same key = doesn't stack; the engine keeps the best one. */
    stackingKey: z.string().optional(),
    /** Overrides the source name in breakdowns, e.g. "Archery". */
    label: z.string().optional(),
    damageType: DamageType.optional(),
  })
  .strict();
export type Modifier = z.infer<typeof Modifier>;

/**
 * A proficiency target can be fixed ("perception") or point at a choice the
 * player makes on the character ({ choice: "canny-skill" }).
 */
export const ChoiceRef = z.object({ choice: z.string() }).strict();
export const Target = z.union([z.string(), ChoiceRef]);
export type Target = z.infer<typeof Target>;

export const Proficiency = z
  .object({
    /**
     * "skillOrExpertise": proficiency in the skill, or expertise if another
     * source already makes the character proficient (Athlete, Keen Mind).
     */
    kind: z.enum(["save", "skill", "expertise", "skillOrExpertise", "armor", "weapon", "tool", "language"]),
    target: Target,
  })
  .strict();
export type Proficiency = z.infer<typeof Proficiency>;

export const ResetRule = z.enum(["short", "long", "dawn", "manual"]);
export type ResetRule = z.infer<typeof ResetRule>;

/** A countable pool: Rage, Favored Foe, Fey Step, a custom "Shadow Charges". */
export const ResourceDef = z
  .object({
    id: z.string(),
    name: z.string(),
    max: ValueExpr,
    reset: ResetRule,
    /** For die-based pools (Psionic Energy, Hit Dice). */
    die: z.string().optional(),
    /**
     * Each use is a roll made in advance and kept (Portent: d20s rolled after
     * a long rest). The player records the values and spends them one by one.
     */
    pool: z.object({ sides: z.number().int().min(2) }).strict().optional(),
  })
  .strict();
export type ResourceDef = z.infer<typeof ResourceDef>;

export const Progression = z.enum(["full", "half", "third", "pact", "none"]);
export type Progression = z.infer<typeof Progression>;

/** A source of spellcasting: a class, or a feat/feature with its own ability. */
export const SpellcastingDef = z
  .object({
    id: z.string(),
    label: z.string(),
    /** Fixed, or the ability the player picked on the granting feat ({ choice: "ability" }). */
    ability: z.union([Ability, ChoiceRef]),
    progression: Progression,
  })
  .strict();
export type SpellcastingDef = z.infer<typeof SpellcastingDef>;

/** A spell granted by a feature, with how it can be cast. */
export const GrantedSpell = z
  .object({
    spell: DefId,
    /** Name shown until a spell definition exists in a pack. */
    name: z.string(),
    casting: z.string(),
    /** Free cast pool, e.g. once per long rest. */
    resource: z.string().optional(),
    /** Spellcasting id it is cast with when the granting feature has none of its own (Primal Awareness: "ranger"). */
    list: z.string().optional(),
  })
  .strict();
export type GrantedSpell = z.infer<typeof GrantedSpell>;

/**
 * An attack a feature gives directly, with no inventory item (Psychic Blades,
 * natural weapons, unarmed strikes). Built and rolled exactly like a weapon.
 */
export const AttackDef = z
  .object({
    id: z.string(),
    name: z.string(),
    category: z.enum(["simple", "martial"]),
    kind: z.enum(["melee", "ranged"]),
    damage: z.string(),
    damageType: DamageType,
    properties: z
      .array(z.enum(["ammunition", "finesse", "heavy", "light", "loading", "reach", "special", "thrown", "two-handed", "versatile"]))
      .default([]),
    range: z.tuple([z.number(), z.number()]).optional(),
    /** Action used to make it, when not a normal Attack action. */
    action: z.enum(["attack", "bonus"]).default("attack"),
    /** Only after attacking with another attack this turn (the second Psychic Blade). */
    requires: z.object({ attack: z.string(), text: z.string() }).strict().optional(),
  })
  .strict();
export type AttackDef = z.infer<typeof AttackDef>;

/**
 * Something the character can choose to do that isn't an attack: Rage,
 * Form of Dread, Fey Step, Portent, igniting a Flame Tongue. Using it spends
 * its cost and switches on its states; dice it rolls (temp HP, healing) are
 * rolled when used and the result is recorded with the use.
 */
export const ActionDef = z
  .object({
    id: z.string(),
    name: z.string(),
    economy: z.enum(["action", "bonus", "reaction", "free"]),
    /** Resource spent per use. */
    cost: z.object({ resource: z.string(), amount: z.number().int().min(1).default(1) }).strict().optional(),
    /** On/off states switched on (e.g. "raging"). */
    toggles: z.array(z.string()).default([]),
    tempHp: ValueExpr.optional(),
    heal: ValueExpr.optional(),
    /** Dice rolled when used, with what the number means (Spirit Shield: damage prevented). */
    roll: z.object({ dice: ValueExpr, label: z.string() }).strict().optional(),
    /**
     * Starts a timer named after the action (Rage: 10 rounds). Its toggles
     * switch off when it runs out. `fromRoll` turns the rolled number into the
     * duration (Psychic Whispers: hours).
     */
    duration: z
      .object({ rounds: z.number().int().min(1).optional(), minutes: z.number().int().min(1).optional(), fromRoll: z.enum(["rounds", "minutes", "hours"]).optional() })
      .strict()
      .optional(),
    /** Gives back uses of another resource (Psionic Power: regain one die). */
    restores: z.object({ resource: z.string(), amount: z.number().int().min(1).default(1) }).strict().optional(),
    /** Only if you haven't moved this turn (Steady Aim). */
    notAfterMoving: z.boolean().optional(),
    /** Your speed becomes 0 for the rest of the turn (Steady Aim). */
    stopsMovement: z.boolean().optional(),
    /** Short reminder of what happens, shown on the button. */
    note: z.string().optional(),
  })
  .strict();
export type ActionDef = z.infer<typeof ActionDef>;

/** Everything a source (race, class level, feat, item, manual entry) gives a character. */
/** An attack a companion makes. "spell" uses the owner's spell attack modifier. */
export const CompanionAttack = z
  .object({
    name: z.string(),
    kind: z.enum(["melee", "ranged"]).default("melee"),
    toHit: z.union([z.literal("spell"), ValueExpr]),
    reach: z.string().optional(),
    /** Damage dice, e.g. "1d8". */
    damage: z.string(),
    /** Flat damage added to the dice, e.g. "2 + pb". */
    damageBonus: ValueExpr.optional(),
    damageType: DamageType,
    note: z.string().optional(),
  })
  .strict();

/** One stat block a companion can take (Beast of the Land, Sea or Sky). */
export const CompanionForm = z
  .object({
    id: z.string(),
    name: z.string(),
    size: z.string(),
    type: z.string(),
    ac: ValueExpr,
    /** HP maximum: base + perLevel × levels in `class`. */
    hp: z.object({ base: z.number().int(), perLevel: z.number().int(), class: DefId }).strict(),
    speed: z.string(),
    abilities: z.record(Ability, z.number().int().min(1).max(30)),
    /** Added to every ability check and saving throw (Primal Bond). */
    checkBonus: ValueExpr.optional(),
    senses: z.string().optional(),
    languages: z.string().optional(),
    traits: z.array(z.object({ name: z.string(), summary: z.string() }).strict()).default([]),
    attacks: z.array(CompanionAttack).default([]),
  })
  .strict();
export type CompanionForm = z.infer<typeof CompanionForm>;

export const CompanionDef = z
  .object({
    id: z.string(),
    name: z.string(),
    /** Spellcasting id whose attack modifier and save DC the companion uses. */
    spellcasting: z.string().optional(),
    forms: z.array(CompanionForm).min(1),
    /** How it acts in combat, shown on the Play screen. */
    combatNote: z.string().optional(),
    /** Bringing it back: spend a spell slot of 1st level or higher. */
    revive: z.object({ note: z.string() }).strict().optional(),
  })
  .strict();
export type CompanionDef = z.infer<typeof CompanionDef>;

export const Grant = z
  .object({
    abilityBonuses: z.record(Ability, z.number()).optional(),
    /** +amount to each ability the player picked for `choice` (Athlete: +1 to STR or DEX). */
    abilityChoice: z.object({ choice: z.string(), amount: z.number().int() }).strict().optional(),
    attacks: z.array(AttackDef).optional(),
    actions: z.array(ActionDef).optional(),
    modifiers: z.array(Modifier).optional(),
    proficiencies: z.array(Proficiency).optional(),
    resources: z.array(ResourceDef).optional(),
    spellcasting: SpellcastingDef.optional(),
    spells: z.array(GrantedSpell).optional(),
    senses: z.record(z.string(), z.number()).optional(),
    companions: z.array(CompanionDef).optional(),
  })
  .strict();
export type Grant = z.infer<typeof Grant>;

/** A choice a feature asks the player to make, e.g. Canny's skill. */
export const ChoiceDef = z
  .object({
    id: z.string(),
    label: z.string(),
    /** "feature": each chosen value is a feature id that becomes active (Fighting Style, Magic Initiate class). */
    kind: z.enum(["skill", "ability", "language", "tool", "option", "spell", "feature"]),
    count: z.number().int().positive().default(1),
    /** Allowed values; empty means any of that kind. */
    from: z.array(z.string()).optional(),
    /** Spell choices: the free-cast pool the chosen spells use (Magic Initiate's once per long rest). */
    resource: z.string().optional(),
  })
  .strict();
export type ChoiceDef = z.infer<typeof ChoiceDef>;
