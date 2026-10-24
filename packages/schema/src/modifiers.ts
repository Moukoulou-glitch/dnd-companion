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
    /** Effects only: applies only when the effect's choice is this (Enlarge/Reduce: "Enlarge"). */
    choice: z.string().optional(),
    /** Not wearing body armor (a shield is allowed). */
    noArmor: z.boolean().optional(),
    /** Wearing body armor (Fighting Style: Defense). */
    withArmor: z.boolean().optional(),
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
    /** On unless the player switches this state on (a rune you know: "rune-fire-off" when its object isn't with you). */
    toggleOff: z.string().optional(),
    /** Only while you're conscious (Aura of Protection). */
    conscious: z.boolean().optional(),
    /** Only while you aren't incapacitated (Aura of Alacrity). */
    notIncapacitated: z.boolean().optional(),
    /** Only on a turn you've attacked with the Attack action (Blade Flourish's +10 ft walking speed). */
    attackAction: z.boolean().optional(),
    /** Only with the weapon held in one hand, or in two (Dueling, Great Weapon Fighting): the roll knows, the sheet doesn't. */
    hands: z.enum(["one", "two"]).optional(),
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
  /** Damage dice deal their maximum (Overchannel), as a tick-box. */
  "maximize",
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
  /** Ability scores: the score becomes at least `value` while it lasts (Potion of Giant Strength: Strength 21). Selector stat.ability.<ability>. */
  "setMin",
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
  /**
   * A speed of another kind: selector "stat.speed.swim", "stat.speed.fly" or
   * "stat.speed.climb"; value in feet, or "walk" for "equal to your walking
   * speed". The best one of each kind counts.
   */
  "grantSpeed",
  /**
   * A sense: selector "sense.darkvision" (or blindsight, tremorsense, truesight), `value` in feet.
   * With `ifAlready`: that many feet more instead, if you already have the sense from something
   * else (Goggles of Night: 60, or +60; Umbral Sight: 60, or +30). The best range counts; they don't add up.
   */
  "grantSense",
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
    /** In an effect with a choice: the damage type is what was chosen (Chromatic Infusion: fire). */
    damageTypeFromChoice: z.boolean().optional(),
    /** Usable once per turn (Sneak Attack): the roll warns if it was already used this turn. */
    oncePerTurn: z.boolean().optional(),
    /** grantSpeed (fly): it can hover. */
    hover: z.boolean().optional(),
    /** grantSense: feet added instead when you already have the sense from something else. */
    ifAlready: z.number().int().min(1).optional(),
    /** Ticking it on a roll spends this (a superiority die). */
    spends: z.object({ resource: z.string(), amount: z.number().int().min(1).default(1) }).strict().optional(),
    /** Only one option of a group per roll (one maneuver per attack). */
    group: z.string().optional(),
    /** Starts ticked: always (a smite waiting for the next hit), or on a reaction attack (Riposte, Brace). */
    preset: z.enum(["always", "reaction"]).optional(),
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

/**
 * How a feature's dice look when 3D dice are on: a preset's name ("psionic",
 * "martial", "shadow", "divine", "vital"…) or a look of its own. Looks only:
 * it never changes what's rolled.
 */
export const DiceThemeSpec = z.union([
  z.string(),
  z
    .object({
      preset: z.string().optional(),
      color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
      material: z.string().optional(),
      impact: z.string().optional(),
      particles: z.string().optional(),
      glow: z.union([z.literal(0), z.literal(1), z.literal(2)]).optional(),
    })
    .strict(),
]);

/** A countable pool: Rage, Favored Foe, Fey Step, a custom "Shadow Charges". */
export const ResourceDef = z
  .object({
    id: z.string(),
    name: z.string(),
    /** Its dice's look (3D dice): every option that spends it rolls in this theme. */
    diceTheme: DiceThemeSpec.optional(),
    max: ValueExpr,
    reset: ResetRule,
    /** For die-based pools (Psionic Energy, Hit Dice). */
    die: z.string().optional(),
    /**
     * Each use is a roll made in advance and kept (Portent: d20s rolled after
     * a long rest). The player records the values and spends them one by one.
     */
    pool: z.object({ sides: z.number().int().min(2) }).strict().optional(),
    /** Never fewer than this (Bardic Inspiration: Charisma modifier, at least once). */
    min: z.number().int().optional(),
    /** Comes back on a short rest from this class level (Font of Inspiration: bard 5). */
    shortFrom: z.object({ class: DefId, level: z.number().int().min(1).max(20) }).strict().optional(),
    /** Only from this level: the character's, or with `levelOf`, that class's (Drow Magic's Darkness: 5th; Shadow Magic's Darkness: sorcerer 3rd). */
    minLevel: z.number().int().min(1).max(20).optional(),
    levelOf: DefId.optional(),
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
    /**
     * Fixed, or the ability the player picked on the granting feat ({ choice: "ability" }),
     * or read from another pick through `map` (Ritual Caster: the class → its ability).
     */
    ability: z.union([Ability, ChoiceRef, z.object({ choice: z.string(), map: z.record(z.string(), Ability) }).strict()]),
    progression: Progression,
    /** A subclass's spellcasting (Eldritch Knight): its slots follow this class's levels. */
    levelsOf: DefId.optional(),
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
    /** Cast at will, without a slot (Armor of Shadows: mage armor). */
    atWill: z.boolean().optional(),
    /** Cast by spending points of a resource instead of a slot (Eyes of the Dark: Darkness for 2 sorcery points). */
    pointCost: z.object({ resource: z.string(), amount: z.number().int().min(1) }).strict().optional(),
    /** Only from this level: the character's, or with `levelOf`, that class's (Drow Magic's Darkness: 5th; Shadow Magic's Darkness: sorcerer 3rd). */
    minLevel: z.number().int().min(1).max(20).optional(),
    levelOf: DefId.optional(),

    /** Given by the table beyond the rules: cast without a slot too, counted per rest (its tag: "DM allows"). */
    extra: z.string().optional(),
    /** Written on a spell scroll in the inventory: read it to cast it (used up). */
    scroll: z.object({ instanceId: z.string(), level: z.number().int().min(0).max(9) }).strict().optional(),
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
    /** Its dice's look (3D dice), when it rolls any. */
    diceTheme: DiceThemeSpec.optional(),
    /** Only from this level: the character's, or with `levelOf`, that class's (Drow Magic's Darkness: 5th; Shadow Magic's Darkness: sorcerer 3rd). */
    minLevel: z.number().int().min(1).max(20).optional(),
    levelOf: DefId.optional(),

    economy: z.enum(["action", "bonus", "reaction", "free"]),
    /** Resource spent per use. */
    cost: z.object({ resource: z.string(), amount: z.number().int().min(1).default(1) }).strict().optional(),
    /** On/off states switched on (e.g. "raging"). */
    toggles: z.array(z.string()).default([]),
    tempHp: ValueExpr.optional(),
    heal: ValueExpr.optional(),
    /** The healing can go to another creature (Healing Hands: touch a creature): asks whether it's on you. */
    others: z.boolean().optional(),
    /**
     * The effect it gives the creature it's used on (Bardic Inspiration: its die, from the resource spent).
     * "Put its effect on me" tracks it on you; `selfWarning` when the rules give it to someone else.
     */
    gives: z.object({ effect: DefId, selfWarning: z.string().optional() }).strict().optional(),
    /** Dice rolled when used, with what the number means (Spirit Shield: damage prevented). */
    roll: z
      .object({
        dice: ValueExpr,
        label: z.string(),
        /** What each face means (Nathair's Mischief's d4 surge): the result shown is table[roll - 1]. */
        table: z.array(z.string()).optional(),
      })
      .strict()
      .optional(),
    /** Rolls this spell's attack and damage, at the level the effect was cast with (Spiritual Weapon's later attacks). */
    rollsSpell: DefId.optional(),
    /** An effect it puts on you, with the pick from `choose` as the effect's choice and `duration` as its time (Chromatic Infusion: the damage type). */
    selfEffect: DefId.optional(),
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
    /** Ability checks it calls for, by skill (Grapple: athletics), with a DC when there is one (Stabilize: 10). */
    check: z.object({ skills: z.array(z.string()).min(1), dc: z.number().int().optional() }).strict().optional(),
    /** Takes the place of one attack of the Attack action (Grapple, Shove). */
    asAttack: z.boolean().optional(),
    /** Adds your speed to this turn's movement (Dash). */
    dash: z.boolean().optional(),
    /** Font of Magic's Flexible Casting: a spell slot into sorcery points, or points into a slot. */
    flexibleCasting: z.enum(["toSlot", "toPoints"]).optional(),
    /** Gives you one more action this turn (Action Surge). */
    /**
     * An extra action of its own, once per turn, that doesn't use your action
     * (Haste). "Attack" in its choices is one weapon attack.
     */
    limited: z.boolean().optional(),
    extraAction: z.boolean().optional(),
    /**
     * Spends as many points of its cost's resource as the player says (Lay on
     * Hands), healing that much when `heals`; the panel asks for the number.
     */
    spendAmount: z.object({ label: z.string(), heals: z.boolean().optional() }).strict().optional(),
    /** Its toggles last until the start of your next turn (Dodge). */
    untilTurnStart: z.boolean().optional(),
    /** Ends your concentration. */
    endsConcentration: z.boolean().optional(),
    /** Asks what to pick when used (Ready: which action), and names the effect after it. */
    choose: z.object({ label: z.string(), options: z.array(z.string()).min(1) }).strict().optional(),
    /** Nothing to record: the panel only explains, and points to where it's done (Attack: the weapons above). */
    infoOnly: z.boolean().optional(),
    /**
     * Brings out a companion of the same feature (Hound of Ill Omen) with all its
     * hit points and these temporary HP; it stays while the action's timer runs.
     */
    summons: z.object({ companion: z.string(), tempHp: ValueExpr.optional() }).strict().optional(),
    /**
     * Recover spent spell slots whose levels add up to half your level in `class` (rounded up),
     * none above `maxLevel` (Arcane Recovery, Natural Recovery). The panel asks which.
     */
    recoversSlots: z.object({ class: DefId, maxLevel: z.number().int().min(1).max(9) }).strict().optional(),
    /** The pick from `choose` switches these on, and the other picks' off (Starry Form: "Dragon" → starry-form-dragon). */
    choiceToggles: z.record(z.string(), z.array(z.string())).optional(),
    /** Spend a spell slot to heal this die per slot level (Combat Wild Shape: 1d8). The panel asks which slot. */
    slotHeal: z.object({ die: z.string() }).strict().optional(),
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
    /** Saving throw totals that differ from the ability modifier (a stat block's "Saving Throws" line); "2 + pb" for one that grows. */
    saves: z.record(Ability, ValueExpr).optional(),
    senses: z.string().optional(),
    languages: z.string().optional(),
    traits: z.array(z.object({ name: z.string(), summary: z.string() }).strict()).default([]),
    attacks: z.array(CompanionAttack).default([]),
    /** Damage it's immune to, resists or is vulnerable to (a drake: its essence). */
    immune: z.array(DamageType).optional(),
    resist: z.array(DamageType).optional(),
    vulnerable: z.array(DamageType).optional(),
    /** Damage it rolls without an attack roll, with the part of its turn it uses (Infused Strikes: a reaction, 1d6 of its essence). */
    rolls: z
      .array(
        z
          .object({
            name: z.string(),
            dice: z.string(),
            damageType: DamageType,
            economy: z.enum(["action", "bonus", "reaction", "free"]),
            note: z.string().optional(),
          })
          .strict(),
      )
      .optional(),
    /**
     * What it gains as the owner's class levels rise (the Drakewarden's drake:
     * Medium and winged at 7th, Large at 15th). Each step that's reached applies,
     * in order: size and speed replace, traits and extra damage add up.
     */
    growth: z
      .array(
        z
          .object({
            level: z.number().int().min(1).max(20),
            class: DefId,
            /** The feature's name, for breakdowns ("Bond of Fang and Scale"). */
            label: z.string(),
            size: z.string().optional(),
            speed: z.string().optional(),
            traits: z.array(z.object({ name: z.string(), summary: z.string() }).strict()).optional(),
            /** Extra damage dice of their own type on one of its attacks (Magic Fang: 1d6 of its essence). */
            extraDamage: z.array(z.object({ attack: z.string(), dice: z.string(), damageType: DamageType }).strict()).optional(),
            /** The owner resists this damage type while it's with them (Bond of Fang and Scale). */
            ownerResist: DamageType.optional(),
          })
          .strict(),
      )
      .optional(),
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
    /**
     * When it takes its turn: `own` (rolls its own initiative: the Hound of Ill Omen), `yours` (acts on your
     * turn: the Primal Companion), `after` (shares your initiative, right after you: the Wildfire Spirit).
     */
    turn: z.enum(["own", "yours", "after"]).optional(),
    /** Only out while the timer of the action that summons it runs (Hound of Ill Omen: that action's id). */
    summonedBy: z.string().optional(),
    /** Commanding it: a bonus action by default, and it can attack in place of one of your attacks (Primal Companion). */
    command: z.object({ economy: z.enum(["action", "bonus"]), attackInstead: z.boolean().default(false) }).strict().optional(),
    /** Bringing it back: spend a spell slot of 1st level or higher. */
    revive: z.object({ note: z.string() }).strict().optional(),
    /**
     * Summoned with an action (the Drakewarden's drake): free once per `resource`,
     * or with a spell slot of `slotMin` or higher. Each summoning picks a form and
     * brings it with all its hit points.
     */
    summon: z.object({ resource: z.string(), slotMin: z.number().int().min(1).max(9), note: z.string() }).strict().optional(),
  })
  .strict();
export type CompanionDef = z.infer<typeof CompanionDef>;

export const Grant = z
  .object({
    abilityBonuses: z.record(Ability, z.number()).optional(),
    /** +amount to each ability the player picked for `choice` (Athlete: +1 to STR or DEX). */
    /** Bonuses to abilities the player picks; several (Fizban's dragonborn: +2 to one, +1 to another). */
    abilityChoice: z
      .union([z.object({ choice: z.string(), amount: z.number().int() }).strict(), z.array(z.object({ choice: z.string(), amount: z.number().int() }).strict()).min(1)])
      .optional(),
    attacks: z.array(AttackDef).optional(),
    actions: z.array(ActionDef).optional(),
    modifiers: z.array(Modifier).optional(),
    proficiencies: z.array(Proficiency).optional(),
    resources: z.array(ResourceDef).optional(),
    spellcasting: SpellcastingDef.optional(),
    /** Another class's spells join a class's list (Divine Soul: cleric spells as sorcerer spells), and the list's new name. */
    spellListAdds: z.object({ list: z.string(), classes: z.array(z.string()).min(1), name: z.string() }).strict().optional(),
    /**
     * Tasha's expanded spell list for a class ("Additional Druid Spells"): these spells join that class's
     * list while the feature is on, and so does any spell whose book entry names the class under
     * "Optional/Variant Classes".
     */
    expandedSpells: z.object({ class: z.string(), spells: z.array(DefId).default([]) }).strict().optional(),
    spells: z.array(GrantedSpell).optional(),
    senses: z.record(z.string(), z.number()).optional(),
    companions: z.array(CompanionDef).optional(),
    /** Attacks per Attack action (Extra Attack: 2; a fighter's 3 at 11th level and 4 at 20th). */
    extraAttacks: ValueExpr.optional(),
    /** When you roll initiative with none of this resource left, you regain `amount` (Relentless: a superiority die; Perfect Self: 4 ki). */
    initiativeRegain: z.object({ resource: z.string(), amount: z.number().int().min(1).default(1) }).strict().optional(),
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
    /** Spell choices: the spellcasting they're cast with when the feature has none of its own (Mystic Arcanum: "warlock"). */
    list: z.string().optional(),
    /** Only asked of characters built in the app: older sheets already have it in their scores (Variant Human's +1s). */
    newOnly: z.boolean().optional(),
    /** How many grows with class level, read from the class's table (Eldritch Invocations: "invocations"). */
    countBy: z.string().optional(),
    /** Spell choices: which spells qualify (Magic Initiate cleric cantrips: classes ["cleric"], level 0). */
    spells: z
      .object({
        classes: z.array(z.string()).optional(),
        level: z.number().int().min(0).max(9).optional(),
        maxLevel: z.number().int().min(0).max(9).optional(),
        /** Lower-case school names (Fey Touched: divination or enchantment). */
        schools: z.array(z.string()).optional(),
        /** Only spells with the ritual tag (Book of Ancient Secrets). */
        ritual: z.boolean().optional(),
        /** Leveled spells only from this level (Eldritch Knight's spells known: 1). */
        minLevel: z.number().int().min(0).max(9).optional(),
        /** No higher than the character's highest spell slot. */
        upToSlots: z.boolean().optional(),
        /** The class lists come from another pick on the same feat (Ritual Caster's class). */
        classesFrom: z.string().optional(),
        /** No higher than half the character's level, rounded up (Ritual Caster). */
        upToHalfLevel: z.boolean().optional(),
        /**
         * Most picks must come from these schools; `freeBy` names the class
         * table of how many may come from any school (Eldritch Knight: 1 at 3rd, +1 at 8th, 14th, 20th).
         */
        schoolLimit: z.object({ schools: z.array(z.string()).min(1), freeBy: z.string() }).strict().optional(),
      })
      .strict()
      .optional(),
    /** Feature choices: any feature a background gives (a custom background borrows one). */
    featuresOf: z.literal("background").optional(),
    /** Option choices: the class level a value needs (Rune Carver's Hill Rune: 7); picked earlier, the app warns. */
    optionLevels: z.record(z.string(), z.number().int().min(1).max(20)).optional(),
    /** Option choices: the feature each picked value brings with it (Rune Carver: "Fire Rune" → the Fire Rune's passive and invoke). */
    grants: z.record(z.string(), DefId).optional(),
    /** Spell choices: cast at will at the spell's own level, slots still work for higher levels (Spell Mastery). */
    atWill: z.boolean().optional(),
    /** Spell choices: the spells should be in your spellbook (Spell Mastery, Signature Spells); a picked one that isn't is warned about. */
    spellbook: z.boolean().optional(),
    /** No upper limit: `count` is where it starts and more can be added (a ritual book grows as you copy spells). */
    open: z.boolean().optional(),
    /** Spell choices with a `from` list: other spells it may be swapped for later (Divine affinity: any cleric spell), listed after with a note. */
    orSpells: z.object({ classes: z.array(z.string()), minLevel: z.number().int().min(0).max(9).optional(), upToSlots: z.boolean().optional(), note: z.string() }).strict().optional(),
  })
  .strict();
export type ChoiceDef = z.infer<typeof ChoiceDef>;
