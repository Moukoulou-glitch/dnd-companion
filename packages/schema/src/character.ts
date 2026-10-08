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
    /** Minutes left, for long effects (Mage Armor: 480). */
    minutes: z.number().int().min(0).optional(),
    /** What was chosen for it (Hex: "str"). */
    choice: z.string().optional(),
    /** Slot level it was cast with, for upcast effects (Aid at 3rd level). */
    castLevel: z.number().int().min(1).max(9).optional(),
    /** States switched off when it ends (Rage ends "raging"). */
    toggles: z.array(z.string()).optional(),
    /** Ends when your next turn starts (Dodge). */
    untilTurnStart: z.boolean().optional(),
    /** Taken outside combat: it ends when you end your turn (there's no next turn to wait for). */
    outOfCombat: z.boolean().optional(),
    /** A spell held with the Ready action, released with your reaction. */
    readied: z.object({ spell: z.string(), list: z.string(), level: z.number().int().min(0).max(9) }).strict().optional(),
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

/** What the character has used on the current turn of a combat. */
export const CombatState = z
  .object({
    round: z.number().int().min(1).default(1),
    /** Between "Start my turn" and "End my turn". */
    myTurn: z.boolean().default(false),
    /** At least one turn started in this combat, so the next one is a new round. */
    hadTurn: z.boolean().default(false),
    action: z.number().int().min(0).default(0),
    bonus: z.number().int().min(0).default(0),
    reaction: z.number().int().min(0).default(0),
    /** Attacks made with the Attack action this turn (Extra Attack allows more than one). */
    attacks: z.number().int().min(0).default(0),
    /** Extra actions this turn (Action Surge). */
    extraActions: z.number().int().min(0).default(0),
    /** Feet moved this turn. */
    moved: z.number().int().min(0).default(0),
    /** What set your speed to 0 for the rest of this turn (Steady Aim). */
    speedZero: z.string().optional(),
    /** Dash taken this turn (each adds your speed). */
    dashes: z.number().int().min(0).default(0),
    /** Your initiative roll for this combat. */
    initiative: z.number().int().optional(),
    /** Attacks made this turn, for the second Psychic Blade and two-weapon fighting. */
    attackedWith: z
      .array(z.object({ attackId: z.string(), itemInstanceId: z.string().optional(), melee: z.boolean(), light: z.boolean() }).strict())
      .default([]),
    /** Once-per-turn options already used this turn (Sneak Attack), by label. */
    onceUsed: z.array(z.string()).default([]),
    /** Features used this turn, by action id (so Steady Aim isn't spent twice). */
    usedThisTurn: z.array(z.string()).default([]),
    /** Haste's extra action was used to make one weapon attack: the next one doesn't count against the Attack action. */
    hasteAttack: z.boolean().default(false),
    /** 2014: after a bonus-action spell, the only other spell this turn is an action cantrip. */
    bonusSpell: z.boolean().default(false),
    /** A spell of 1st level or higher cast with an action this turn. */
    leveledActionSpell: z.boolean().default(false),
  })
  .strict();
export type CombatState = z.infer<typeof CombatState>;

/** A companion's state: which form it has, its name and hit points. HP missing means full. */
export const CompanionState = z
  .object({
    form: z.string().optional(),
    name: z.string().optional(),
    hp: z.object({ current: z.number().int().min(0), temp: z.number().int().min(0).default(0) }).strict().optional(),
    /** Actions it took that last until your next turn starts (Dodge, Ready: Attack), shown as tags. */
    states: z
      .array(z.object({ id: z.string(), name: z.string(), outOfCombat: z.boolean().optional() }).strict())
      .default([]),
  })
  .strict();
export type CompanionState = z.infer<typeof CompanionState>;

/** How a character came by something beyond the rules. */
export const EXTRA_TAGS = ["DM allows", "Backstory", "Roleplay", "House rule", "Reward", "Pay to Win"] as const;
export const ExtraTag = z.enum(EXTRA_TAGS);
export type ExtraTag = z.infer<typeof ExtraTag>;

/** Why: a tag and the player's own words (up to 250 characters). */
export const ExtraNote = z.object({ tag: ExtraTag, reason: z.string().max(250).default("") }).strict();
export type ExtraNote = z.infer<typeof ExtraNote>;

/**
 * Something the table gave beyond the rules (a feat without the level, a
 * skill for good roleplay), with why. Applied like any other source.
 */
export const Extra = z
  .object({
    id: z.string(),
    kind: z.enum(["skill", "expertise", "language", "tool", "feat", "spell"]),
    /** Skill key, language or tool name, feat id or spell id. */
    value: z.string(),
    /** Spells: the spellcasting it's cast with (a class list id), or the ability when the character has none. */
    list: z.string().optional(),
    ability: Ability.optional(),
    tag: ExtraTag,
    reason: z.string().max(250).default(""),
  })
  .strict();
export type Extra = z.infer<typeof Extra>;

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
    /** Spell slots created beyond the usual (Flexible Casting); they vanish on a long rest. */
    extraSlots: z.record(z.string(), z.number().int().min(0)).default({}),
    /** Pact Magic slots spent. */
    pactSlotsUsed: z.number().int().min(0).default(0),
    spells: z.array(SpellInstance).default([]),
    /** The spell the character is concentrating on, if any. */
    concentration: z
      .object({
        spell: DefId,
        name: z.string(),
        /** Slot level it was cast at (for rolling its ongoing damage). */
        level: z.number().int().min(0).max(9).optional(),
        rounds: z.number().int().min(0).optional(),
        minutes: z.number().int().min(0).optional(),
      })
      .strict()
      .optional(),
    /** Conditions and effects currently on the character. */
    effects: z.array(EffectInstance).default([]),
    /** Named on/off states the engine reads, e.g. "raging". */
    toggles: z.array(z.string()).default([]),
    inspiration: z.boolean().default(false),
    /** Inspiration on hand (the table allows up to 10). */
    inspirations: z.number().int().min(0).max(10).default(0),
    /** Maximum hit points changed by hand: a vampire's bite reduces it; both at 0 is your normal maximum. */
    maxHpAdjust: z.object({ reduce: z.number().int().min(0).default(0), increase: z.number().int().min(0).default(0) }).strict().default({ reduce: 0, increase: 0 }),
    /**
     * Ability scores changed by hand: a bonus, a penalty (a shadow's Strength
     * drain, gone after a rest when marked), or "becomes N" (Amulet of Health:
     * 19, no effect if already higher).
     */
    abilityAdjust: z
      .record(
        Ability,
        z
          .object({
            bonus: z.number().int().min(0).default(0),
            penalty: z.number().int().min(0).default(0),
            penaltyEndsOnRest: z.boolean().default(false),
            setTo: z.number().int().min(1).max(30).optional(),
            setNote: z.string().max(60).optional(),
          })
          .strict(),
      )
      .default({}),
    /** Present while the character is in a combat. */
    combat: CombatState.optional(),
    /** Rolls made in advance and kept (Portent), keyed by resource id. */
    pools: z.record(z.string(), z.array(z.number().int())).default({}),
    /** Features given by the campaign rather than a class or race (Charm of Sunlight). */
    extraFeatures: z.array(DefId).default([]),
    /** Feats, skills, expertise, languages, tools and spells the table gave beyond the rules, each with why. */
    extras: z.array(Extra).default([]),
    /** Why a choice holds more picks than the rules give, keyed "source|choice" (or "spells|<class>|<kind>"). */
    extraNotes: z.record(z.string(), ExtraNote).default({}),
    /** Spells with a costly or consumed material component: whether the character has it now, by spell id. */
    components: z.record(DefId, z.boolean()).default({}),
    /**
     * Wild Shape or Polymorph: the creature's stat block replaces yours, and
     * its hit points take damage first (PHB p. 66, p. 266).
     */
    shape: z
      .object({
        kind: z.enum(["wildshape", "polymorph", "truepolymorph"]),
        creature: DefId,
        hp: z.number().int().min(0),
        /** The effect (Polymorph, True Polymorph) that holds the form: removing it ends the form, and the form ending removes it. */
        effect: z.string().optional(),
        /** Polymorph cast by this character on themselves: it ends with their concentration. */
        ownSpell: z.boolean().optional(),
      })
      .strict()
      .optional(),
    /** Creatures a spell summoned, created or animated, each with its hit points. */
    summons: z
      .array(
        z
          .object({
            id: z.string(),
            creature: DefId,
            name: z.string().optional(),
            hp: z.number().int().min(0),
            /** The spell that brought it. */
            spell: DefId,
            /** Summoned together: one group, one initiative when it's shared. */
            group: z.string(),
            initiative: z.number().int().optional(),
            concentration: z.boolean().optional(),
            /** Its own turn: what it has used. Reset when its turn starts. */
            used: z
              .object({
                action: z.boolean().default(false),
                bonus: z.boolean().default(false),
                reaction: z.boolean().default(false),
                attacks: z.number().int().min(0).default(0),
                moved: z.number().int().min(0).default(0),
                dashes: z.number().int().min(0).default(0),
              })
              .strict()
              .optional(),
            /** Conditions and spells on it (Bless, Frightened), with rounds when timed. */
            effects: z
              .array(z.object({ id: z.string(), effect: DefId, rounds: z.number().int().min(0).optional(), choice: z.string().optional(), slotLevel: z.number().int().min(1).max(9).optional() }).strict())
              .optional(),
            /** A spell it is concentrating on itself. */
            concentrating: z.string().optional(),
            /** Its own spells used: "N/day" uses by spell, slots by "slot:<level>". */
            spellUses: z.record(z.string(), z.number().int().min(0)).optional(),
          })
          .strict(),
      )
      .default([]),
    /** Wizard: gold set aside for copying spells into the spellbook (materials and fine inks). */
    spellbookFunds: z.number().min(0).default(0),
    /**
     * Ability Score Improvements taken, one per class level that gives one:
     * +2 to one ability or +1 to two, or a feat instead (kept in `feats` too).
     */
    asi: z
      .array(
        z
          .object({
            class: DefId,
            level: z.number().int().min(1).max(20),
            abilities: z.record(Ability, z.number().int().min(1).max(2)).optional(),
            feat: DefId.optional(),
          })
          .strict(),
      )
      .default([]),
    /**
     * Class levels already settled before the app tracked ASIs (characters
     * made outside the app): no ASI is asked for at or below them. Absent for
     * characters that haven't levelled in the app yet: nothing is asked.
     */
    asiBaseline: z.record(DefId, z.number().int().min(0)).optional(),
    /** Made with the app's builder: every build choice is asked for and applied. */
    builtInApp: z.boolean().optional(),
    /** Companions from features (Primal Companion), keyed by companion id. */
    companions: z.record(z.string(), CompanionState).default({}),
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
