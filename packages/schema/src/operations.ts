import { z } from "zod";
import { CalendarDef, CustomAction, CustomSpell, Extra, ExtraTag } from "./character.js";
import { DefId } from "./core.js";
import { Modifier } from "./modifiers.js";

/**
 * One logged change to a character. Operations record intent ("take 7 fire
 * damage"), not resulting values, so logs from two devices can be merged by
 * replaying them in clock order. Undo, history, sync and DM actions all come
 * from this log.
 */
export const OperationBase = z.object({
  id: z.string(),
  characterId: z.string(),
  /** User id of whoever made the change (player or DM). */
  author: z.string(),
  /** Hybrid logical clock timestamp: sortable across devices. */
  at: z.string(),
});

export const OPERATION_PAYLOADS = {
  /** Damage of one type; resistances, temp HP and 0 HP are handled when applied. */
  /** `companion` sends it to a companion instead of the character. */
  /** `magical`: from a magic weapon or spell (Heavy Armor Master and the like only stop nonmagical damage). */
  /** fromSpell: the damage comes from a spell (resistance to damage from spells: Aura of Warding). */
  damage: z.object({ amount: z.number().int().min(0), damageType: z.string().optional(), companion: z.string().optional(), magical: z.boolean().optional(), fromSpell: z.boolean().optional() }).strict(),
  /** Healing, capped at maximum HP. Healing from 0 HP clears death saves. */
  heal: z.object({ amount: z.number().int().min(0), companion: z.string().optional() }).strict(),
  /** Gain temporary HP: they don't stack, so the higher value is kept. 0 clears them. */
  setTempHp: z.object({ amount: z.number().int().min(0), companion: z.string().optional() }).strict(),
  /** Set current HP directly (DM ruling, correction). Clamped to 0..max. */
  setHp: z.object({ current: z.number().int() }).strict(),
  spendResource: z.object({ resource: z.string(), amount: z.number().int().min(1).default(1) }).strict(),
  restoreResource: z.object({ resource: z.string(), amount: z.number().int().min(1).default(1) }).strict(),
  /** Spend a spell slot of `level`, or a Pact Magic slot. */
  spendSlot: z.object({ level: z.number().int().min(1).max(9), pact: z.boolean().default(false) }).strict(),
  restoreSlot: z.object({ level: z.number().int().min(1).max(9), pact: z.boolean().default(false) }).strict(),
  /** Spend one Hit Die during a short rest; `roll` is the die result (digital or typed from a real die). */
  /** `reduce`: spent to soak damage (Durable's reaction) instead of healing. */
  spendHitDie: z.object({ die: z.string(), roll: z.number().int().min(1), reduce: z.boolean().optional() }).strict(),
  /** A spent Hit Die back by hand (the app asks first). No HP change. */
  restoreHitDie: z.object({ die: z.string() }).strict(),
  /** Wild Shape (spends uses: 2 for an elemental) or Polymorph into a creature. */
  transform: z
    .object({ kind: z.enum(["wildshape", "polymorph", "truepolymorph"]), creature: DefId, uses: z.number().int().min(0).max(2).default(1), effect: z.string().optional() })
    .strict(),
  /** Creatures from a summoning spell. */
  summon: z
    .object({ spell: DefId, group: z.string(), creatures: z.array(z.object({ creature: DefId, count: z.number().int().min(1) }).strict()).min(1), concentration: z.boolean().optional() })
    .strict(),
  /** A summoned creature's hit points (after damage or healing worked out in the app). */
  /** Set its hit points, or deal damage of a type (its resistances, immunities and vulnerabilities apply). */
  summonHp: z
    .object({
      id: z.string(),
      hp: z.number().int().min(0).optional(),
      damage: z.number().int().min(0).optional(),
      type: z.string().optional(),
      /** From a magical attack, or a silvered or adamantine weapon: some resistances don't apply. */
      magical: z.boolean().optional(),
      silvered: z.boolean().optional(),
      adamantine: z.boolean().optional(),
    })
    .strict(),
  /** Change an effect on a summoned creature: its time left, the level it was cast at, its choice. */
  summonEffectEdit: z
    .object({ id: z.string(), instance: z.string(), rounds: z.number().int().min(0).nullable().optional(), slotLevel: z.number().int().min(1).max(9).optional(), choice: z.string().optional() })
    .strict(),
  /** A summoned creature's maximum hit points changed by hand. */
  summonMaxHpAdjust: z.object({ id: z.string(), reduce: z.number().int().min(0).optional(), increase: z.number().int().min(0).optional() }).strict(),
  /** Inspiration on hand. */
  setInspiration: z.object({ count: z.number().int().min(0).max(10) }).strict(),
  /** Maximum hit points reduced or increased by hand. */
  setMaxHpAdjust: z.object({ reduce: z.number().int().min(0).optional(), increase: z.number().int().min(0).optional() }).strict(),
  /** An ability score changed by hand. */
  setAbilityAdjust: z
    .object({
      ability: z.enum(["str", "dex", "con", "int", "wis", "cha"]),
      bonus: z.number().int().min(0).optional(),
      penalty: z.number().int().min(0).optional(),
      penaltyEndsOnRest: z.boolean().optional(),
      setTo: z.number().int().min(1).max(30).nullable().optional(),
      setNote: z.string().max(60).optional(),
      /** Add a permanent change (Manual of Gainful Exercise). */
      addPermanent: z.object({ amount: z.number().int().min(-30).max(30), from: z.string().max(60).default(""), newMax: z.number().int().min(1).max(30).optional() }).strict().optional(),
      /** Remove the permanent change at this index. */
      removePermanent: z.number().int().min(0).optional(),
    })
    .strict(),
  /** A hit point roll for a level (index 0 is the first level that was rolled for that class). */
  setHpRoll: z.object({ class: z.string(), index: z.number().int().min(0), value: z.number().int().min(1) }).strict(),
  /** It casts a spell: a use of "N/day" or a slot, its action economy, its concentration. */
  summonCast: z
    .object({
      id: z.string(),
      spell: z.string(),
      /** What the use counts against ("spell:entangle", "slot:3"); left out for at will. */
      key: z.string().optional(),
      max: z.number().int().min(0).optional(),
      economy: z.enum(["action", "bonus", "reaction", "none"]).default("action"),
      concentration: z.boolean().optional(),
      /** Give a use back instead (tapping a spent marker). */
      restore: z.boolean().optional(),
    })
    .strict(),
  summonInitiative: z.object({ group: z.string(), id: z.string().optional(), value: z.number().int() }).strict(),
  /** A summoned creature's turn: use or give back its action, bonus action, reaction or an attack; `newTurn` resets them. */
  summonEconomy: z
    .object({
      id: z.string(),
      kind: z.enum(["action", "bonus", "reaction", "attack"]).optional(),
      used: z.boolean().default(true),
      newTurn: z.boolean().optional(),
      /** Feet moved (negative takes some back). */
      move: z.number().int().optional(),
      /** Dash: more movement this turn (false takes one back). */
      dash: z.boolean().optional(),
      /** Which speed it moves with (walk, fly, swim, climb, burrow). */
      mode: z.string().optional(),
    })
    .strict(),
  /** Put an effect on a summoned creature, or take it off. */
  summonEffect: z
    .object({
      id: z.string(),
      effect: DefId,
      add: z.boolean(),
      rounds: z.number().int().min(1).optional(),
      choice: z.string().optional(),
      slotLevel: z.number().int().min(1).max(9).optional(),
      /** Removing: which one, when it has the same effect twice. */
      instance: z.string().optional(),
    })
    .strict(),
  /** A spell the summoned creature concentrates on (null when it ends). */
  summonConcentration: z.object({ id: z.string(), spell: z.string().nullable() }).strict(),
  /** One creature, or a whole group, goes. */
  dismiss: z.object({ id: z.string().optional(), group: z.string().optional() }).strict(),
  /** Back to your normal form. */
  revert: z.object({ why: z.string().optional() }).strict(),
  addExtra: Extra,
  updateExtra: z.object({ id: z.string(), tag: ExtraTag.optional(), reason: z.string().max(250).optional() }).strict(),
  removeExtra: z.object({ id: z.string() }).strict(),
  /** Why a choice has more picks than the rules give; no tag clears it. */
  setExtraNote: z.object({ key: z.string(), tag: ExtraTag.optional(), reason: z.string().max(250).default("") }).strict(),
  /** Whether you have a spell's costly or consumed material component right now. */
  /** How many of a spell's costly or consumed component you have (`have` is the older yes/no). */
  setComponent: z.object({ spell: DefId, have: z.boolean().optional(), count: z.number().int().min(0).max(999).optional() }).strict(),
  /** Wizard: gold set aside for copying spells into the spellbook. */
  setSpellbookFunds: z.object({ gp: z.number().min(0) }).strict(),
  rest: z.object({ kind: z.enum(["short", "long"]) }).strict(),
  /** Use a feature: spends its cost, switches on its states, applies recorded dice results. */
  useAction: z
    .object({
      action: z.string(),
      /** What was picked, for actions that ask (Ready: which action). */
      choice: z.string().optional(),
      /** Points spent, for actions that ask how many (Lay on Hands); `healSelf` heals you by that much. */
      amount: z.number().int().min(1).optional(),
      healSelf: z.boolean().optional(),
      /** Total of the temp HP or healing roll, recorded so replaying the log gives the same result. */
      rolled: z.number().int().min(0).optional(),
      /** "Just activate": switch it on without spending its cost or the turn (forgot to mark it earlier). */
      free: z.boolean().optional(),
    })
    .strict(),
  addItem: z
    .object({
      instanceId: z.string(),
      item: z.string(),
      quantity: z.number().int().min(1).default(1),
      name: z.string().optional(),
    })
    .strict(),
  removeItem: z.object({ instanceId: z.string() }).strict(),
  /** Change one item: any field left out stays as it is. */
  setItem: z
    .object({
      instanceId: z.string(),
      quantity: z.number().int().min(0).optional(),
      equipped: z.boolean().optional(),
      attuned: z.boolean().optional(),
      name: z.string().optional(),
      /** The spell written on a spell scroll; null clears it. */
      scroll: z.object({ spell: z.string(), level: z.number().int().min(0).max(9).optional() }).strict().nullable().optional(),
    })
    .strict(),
  adjustCurrency: z.object({ coin: z.enum(["cp", "sp", "ep", "gp", "pp"]), delta: z.number().int() }).strict(),
  addEffect: z
    .object({
      instanceId: z.string(),
      effect: z.string(),
      minutes: z.number().int().min(1).optional(),
      choice: z.string().optional(),
      castLevel: z.number().int().min(1).max(9).optional(),
      custom: z.object({ name: z.string(), modifiers: z.array(Modifier) }).strict().optional(),
      rounds: z.number().int().min(1).optional(),
      level: z.number().int().min(1).optional(),
      from: z.string().optional(),
    })
    .strict(),
  removeEffect: z.object({ instanceId: z.string() }).strict(),
  updateEffect: z
    .object({
      instanceId: z.string(),
      rounds: z.number().int().min(0).nullable().optional(),
      minutes: z.number().int().min(0).nullable().optional(),
      level: z.number().int().min(1).optional(),
      choice: z.string().optional(),
      castLevel: z.number().int().min(1).max(9).optional(),
    })
    .strict(),
  /** Time passes outside combat: long effects and concentration count down. Rests do this too. */
  passTime: z.object({ minutes: z.number().int().min(1) }).strict(),
  /** Your initiative roll for the current combat. */
  setInitiative: z.object({ value: z.number().int() }).strict(),
  /** Record rolls made in advance (Portent after a long rest). */
  setPool: z.object({ resource: z.string(), values: z.array(z.number().int()) }).strict(),
  /** Spend one recorded roll. */
  usePool: z.object({ resource: z.string(), index: z.number().int().min(0) }).strict(),
  /** End of the character's turn: timed effects lose a round; those reaching 0 end. */
  endTurn: z.object({}).strict(),
  /**
   * Cast a spell: spends a slot of `level` (or a Pact slot, or a free use),
   * starts concentration if the spell needs it, and can put the spell's
   * effect on the caster (Shield, Mage Armor, Haste on yourself).
   */
  castSpell: z
    .object({
      spell: z.string(),
      list: z.string(),
      level: z.number().int().min(0).max(9),
      /** "extra": a spell the table gave, without a slot (counted per rest); "scroll": read from a spell scroll, which is used up. */
      using: z.enum(["slot", "pact", "free", "ritual", "none", "extra", "scroll"]),
      /** A scroll spell above your level: the ability check failed, the spell fades from the scroll with no effect. */
      failed: z.boolean().optional(),
      selfEffect: z.boolean().default(false),
      /** What its effect asks for (Hex: the ability with disadvantage on checks). */
      choice: z.string().optional(),
      /** Which casting time, for spells with more than one (Plant Growth: 1 action or 8 hours). */
      castingTime: z.string().optional(),
      /** Readied (the Ready action): cast now, held with concentration, released with your reaction. */
      readied: z.boolean().optional(),
      /** The costly or consumed material component is used up by this cast. */
      consumeComponent: z.boolean().optional(),
    })
    .strict(),
  endConcentration: z.object({}).strict(),
  setPrepared: z.object({ spell: z.string(), list: z.string(), prepared: z.boolean() }).strict(),
  /** Enter a combat: turn tracking starts. */
  startCombat: z.object({}).strict(),
  /** Start of the character's turn: action, bonus action, reaction and movement come back. */
  startTurn: z.object({}).strict(),
  endCombat: z.object({}).strict(),
  /**
   * Mark part of the turn as used (or given back with a negative count).
   * `attack` counts one attack of the Attack action; `dash` adds your speed.
   */
  useEconomy: z
    .object({
      kind: z.enum(["action", "bonus", "reaction", "attack", "move"]),
      amount: z.number().int().default(1),
      dash: z.boolean().default(false),
      /** The attack made, remembered for the rest of the turn. */
      attackWith: z.object({ attackId: z.string(), itemInstanceId: z.string().optional(), melee: z.boolean(), light: z.boolean() }).strict().optional(),
    })
    .strict(),
  /** Once-per-turn options used on this turn (Sneak Attack). */
  markOnce: z.object({ labels: z.array(z.string()).min(1) }).strict(),
  /** The trigger happened: take the readied action (or release the readied spell) with your reaction. */
  releaseReadied: z.object({ instanceId: z.string() }).strict(),
  /** Change how long concentration has left, by hand. null clears the timer. */
  setConcentration: z.object({ rounds: z.number().int().min(0).nullable().optional(), minutes: z.number().int().min(0).nullable().optional() }).strict(),
  /** Choose a companion's form or name; a new form arrives with full HP. */
  setCompanion: z.object({ companion: z.string(), form: z.string().optional(), name: z.string().optional() }).strict(),
  /** Bring a companion back with full HP, spending a spell slot of `level`. */
  /** Gain a level in a class (a new class is multiclassing). HP: the roll, or the average when absent. */
  levelUp: z.object({ class: z.string(), hpRoll: z.number().int().min(1).optional() }).strict(),
  /** Take a level back (a mistake): the last level of that class. */
  levelDown: z.object({ class: z.string() }).strict(),
  setSubclass: z.object({ class: z.string(), subclass: z.string().nullable() }).strict(),
  /** What the player picked for one choice of a race, class, background, feature or feat. */
  setChoice: z.object({ source: z.string(), choice: z.string(), values: z.array(z.string()) }).strict(),
  /** Base ability scores (before racial and other bonuses). */
  setAbilities: z.object({ abilities: z.record(z.enum(["str", "dex", "con", "int", "wis", "cha"]), z.number().int().min(1).max(30)) }).strict(),
  /** An Ability Score Improvement at a class level: abilities (+2 one or +1 two) or a feat. null clears it. */
  chooseAsi: z
    .object({
      class: z.string(),
      level: z.number().int().min(1).max(20),
      abilities: z.record(z.enum(["str", "dex", "con", "int", "wis", "cha"]), z.number().int().min(1).max(2)).optional(),
      feat: z.string().optional(),
      clear: z.boolean().optional(),
    })
    .strict(),
  /** Name, player, alignment, race or background. */
  setDetails: z
    .object({
      name: z.string().optional(),
      player: z.string().optional(),
      alignment: z.string().optional(),
      race: z.string().optional(),
      background: z.string().nullable().optional(),
      /** null: back to the race's. */
      size: z.enum(["tiny", "small", "medium", "large", "huge", "gargantuan"]).nullable().optional(),
      creatureType: z.string().max(40).nullable().optional(),
    })
    .strict(),
  /** A resistance, immunity or vulnerability added or taken away by hand. */
  setDefense: z.object({ kind: z.enum(["resist", "immune", "vulnerable"]), value: z.string(), on: z.boolean(), note: z.string().max(80).optional() }).strict(),
  /** A bonus or penalty by hand on saves, skills or passive senses ("save.all", "skill.stealth", "passive.perception"). */
  setRollAdjust: z.object({ key: z.string().regex(/^(save|skill|passive)\.[a-zA-Z]+$/), bonus: z.number().int().min(0).optional(), penalty: z.number().int().min(0).optional(), note: z.string().max(80).optional() }).strict(),
  /** An action of the player's own, added or changed (same id). */
  setCustomAction: z.object({ action: CustomAction }).strict(),
  removeCustomAction: z.object({ id: z.string() }).strict(),
  /** A spell of the player's own, added or changed, on one of the character's spell lists. */
  setCustomSpell: z.object({ spell: CustomSpell, list: z.string() }).strict(),
  /** Take a proficiency away (removed: true) or give it back, whatever source grants it. */
  setProfRemoved: z.object({ kind: z.enum(["save", "skill", "expertise", "armor", "weapon", "tool", "language"]), target: z.string(), removed: z.boolean(), reason: z.string().max(250).optional() }).strict(),
  /** Turn a Tasha's optional class feature on or off for this character. */
  setOptionalFeature: z.object({ feature: z.string(), on: z.boolean() }).strict(),
  removeCustomSpell: z.object({ id: z.string() }).strict(),
  /** Proficiency bonus raised or lowered by hand. */
  setPbAdjust: z.object({ bonus: z.number().int().min(0).max(10).optional(), penalty: z.number().int().min(0).max(10).optional(), note: z.string().max(80).optional() }).strict(),
  /** A recharge action (Recharge 5–6) used, or back after its d6: on your form, or on a summoned creature. */
  recharge: z.object({ summon: z.string().optional(), name: z.string(), used: z.boolean() }).strict(),
  /** Personality, backstory and the session number. */
  setStory: z.object({ traits: z.string().max(4000).optional(), ideals: z.string().max(4000).optional(), bonds: z.string().max(4000).optional(), flaws: z.string().max(4000).optional(), backstory: z.string().max(100000).optional(), session: z.number().int().min(0).optional() }).strict(),
  /** The in-world calendar: which one, a custom one, the time (set or moved on). */
  setCalendar: z
    .object({
      kind: z.enum(["normal", "mithiologio", "custom"]).optional(),
      custom: CalendarDef.optional(),
      minutes: z.number().int().min(0).optional(),
      add: z.number().int().optional(),
      followRests: z.boolean().optional(),
    })
    .strict(),
  /** A note; it is dated with the real time it was written. */
  addNote: z.object({ title: z.string().max(200), body: z.string().max(20000), category: z.string().default("none"), pinned: z.boolean().optional(), session: z.number().int().min(0).optional(), gameDate: z.string().max(120).optional() }).strict(),
  updateNote: z.object({ id: z.string(), title: z.string().max(200).optional(), body: z.string().max(20000).optional(), category: z.string().optional(), pinned: z.boolean().optional(), session: z.number().int().min(0).nullable().optional() }).strict(),
  removeNote: z.object({ id: z.string() }).strict(),
  /** The player's own background: its name, how many languages (the rest tools), and a feature written by hand. */
  setCustomBackground: z.object({ name: z.string().max(60).optional(), languages: z.number().int().min(0).max(2).optional(), featureName: z.string().max(80).optional(), featureText: z.string().max(2000).optional() }).strict(),
  /** Add a spell to a class list (known spells, a wizard's spellbook, cantrips), or take it away. */
  /** `cost`: gold taken from the spellbook fund for copying it (wizard). */
  learnSpell: z.object({ spell: z.string(), list: z.string(), cost: z.number().min(0).optional() }).strict(),
  /** A wizard copies a scroll's spell into the spellbook (DMG p. 200): the Arcana check passed or not, the scroll is gone either way. */
  copyScroll: z.object({ instanceId: z.string(), success: z.boolean() }).strict(),
  forgetSpell: z.object({ spell: z.string(), list: z.string() }).strict(),
  /** A companion takes one of the actions anyone can take; Dodge and Ready show as tags until your next turn starts. */
  companionAction: z.object({ companion: z.string(), action: z.string(), choice: z.string().optional() }).strict(),
  /** Takes a companion's tag away (the readied action was used, or it ended early). */
  endCompanionState: z.object({ companion: z.string(), id: z.string() }).strict(),
  reviveCompanion: z.object({ companion: z.string(), level: z.number().int().min(1).max(9), pact: z.boolean().default(false) }).strict(),
  deathSave: z.object({ result: z.enum(["success", "failure", "critSuccess", "critFailure"]) }).strict(),
  /** Set the death save marks by hand (tap a mark, or clear them). */
  setDeathSaves: z.object({ successes: z.number().int().min(0).max(3), failures: z.number().int().min(0).max(3) }).strict(),
  toggle: z.object({ name: z.string(), on: z.boolean() }).strict(),
  /** Generic edit of a stored value, e.g. path ["abilities","str"]. Validated after applying. */
  setField: z.object({ path: z.array(z.union([z.string(), z.number()])).min(1), value: z.unknown() }).strict(),
} as const;

export type OperationType = keyof typeof OPERATION_PAYLOADS;

export const Operation = z.discriminatedUnion("type", [
  OperationBase.extend({ type: z.literal("damage"), payload: OPERATION_PAYLOADS.damage }),
  OperationBase.extend({ type: z.literal("heal"), payload: OPERATION_PAYLOADS.heal }),
  OperationBase.extend({ type: z.literal("setTempHp"), payload: OPERATION_PAYLOADS.setTempHp }),
  OperationBase.extend({ type: z.literal("setHp"), payload: OPERATION_PAYLOADS.setHp }),
  OperationBase.extend({ type: z.literal("spendResource"), payload: OPERATION_PAYLOADS.spendResource }),
  OperationBase.extend({ type: z.literal("restoreResource"), payload: OPERATION_PAYLOADS.restoreResource }),
  OperationBase.extend({ type: z.literal("spendSlot"), payload: OPERATION_PAYLOADS.spendSlot }),
  OperationBase.extend({ type: z.literal("restoreSlot"), payload: OPERATION_PAYLOADS.restoreSlot }),
  OperationBase.extend({ type: z.literal("spendHitDie"), payload: OPERATION_PAYLOADS.spendHitDie }),
  OperationBase.extend({ type: z.literal("restoreHitDie"), payload: OPERATION_PAYLOADS.restoreHitDie }),
  OperationBase.extend({ type: z.literal("transform"), payload: OPERATION_PAYLOADS.transform }),
  OperationBase.extend({ type: z.literal("revert"), payload: OPERATION_PAYLOADS.revert }),
  OperationBase.extend({ type: z.literal("summon"), payload: OPERATION_PAYLOADS.summon }),
  OperationBase.extend({ type: z.literal("summonHp"), payload: OPERATION_PAYLOADS.summonHp }),
  OperationBase.extend({ type: z.literal("summonInitiative"), payload: OPERATION_PAYLOADS.summonInitiative }),
  OperationBase.extend({ type: z.literal("dismiss"), payload: OPERATION_PAYLOADS.dismiss }),
  OperationBase.extend({ type: z.literal("summonEconomy"), payload: OPERATION_PAYLOADS.summonEconomy }),
  OperationBase.extend({ type: z.literal("summonCast"), payload: OPERATION_PAYLOADS.summonCast }),
  OperationBase.extend({ type: z.literal("summonEffectEdit"), payload: OPERATION_PAYLOADS.summonEffectEdit }),
  OperationBase.extend({ type: z.literal("setInspiration"), payload: OPERATION_PAYLOADS.setInspiration }),
  OperationBase.extend({ type: z.literal("summonMaxHpAdjust"), payload: OPERATION_PAYLOADS.summonMaxHpAdjust }),
  OperationBase.extend({ type: z.literal("setMaxHpAdjust"), payload: OPERATION_PAYLOADS.setMaxHpAdjust }),
  OperationBase.extend({ type: z.literal("setAbilityAdjust"), payload: OPERATION_PAYLOADS.setAbilityAdjust }),
  OperationBase.extend({ type: z.literal("setHpRoll"), payload: OPERATION_PAYLOADS.setHpRoll }),
  OperationBase.extend({ type: z.literal("summonEffect"), payload: OPERATION_PAYLOADS.summonEffect }),
  OperationBase.extend({ type: z.literal("summonConcentration"), payload: OPERATION_PAYLOADS.summonConcentration }),
  OperationBase.extend({ type: z.literal("addExtra"), payload: OPERATION_PAYLOADS.addExtra }),
  OperationBase.extend({ type: z.literal("updateExtra"), payload: OPERATION_PAYLOADS.updateExtra }),
  OperationBase.extend({ type: z.literal("removeExtra"), payload: OPERATION_PAYLOADS.removeExtra }),
  OperationBase.extend({ type: z.literal("setExtraNote"), payload: OPERATION_PAYLOADS.setExtraNote }),
  OperationBase.extend({ type: z.literal("setComponent"), payload: OPERATION_PAYLOADS.setComponent }),
  OperationBase.extend({ type: z.literal("setSpellbookFunds"), payload: OPERATION_PAYLOADS.setSpellbookFunds }),
  OperationBase.extend({ type: z.literal("rest"), payload: OPERATION_PAYLOADS.rest }),
  OperationBase.extend({ type: z.literal("useAction"), payload: OPERATION_PAYLOADS.useAction }),
  OperationBase.extend({ type: z.literal("addItem"), payload: OPERATION_PAYLOADS.addItem }),
  OperationBase.extend({ type: z.literal("removeItem"), payload: OPERATION_PAYLOADS.removeItem }),
  OperationBase.extend({ type: z.literal("setItem"), payload: OPERATION_PAYLOADS.setItem }),
  OperationBase.extend({ type: z.literal("adjustCurrency"), payload: OPERATION_PAYLOADS.adjustCurrency }),
  OperationBase.extend({ type: z.literal("addEffect"), payload: OPERATION_PAYLOADS.addEffect }),
  OperationBase.extend({ type: z.literal("removeEffect"), payload: OPERATION_PAYLOADS.removeEffect }),
  OperationBase.extend({ type: z.literal("updateEffect"), payload: OPERATION_PAYLOADS.updateEffect }),
  OperationBase.extend({ type: z.literal("endTurn"), payload: OPERATION_PAYLOADS.endTurn }),
  OperationBase.extend({ type: z.literal("castSpell"), payload: OPERATION_PAYLOADS.castSpell }),
  OperationBase.extend({ type: z.literal("endConcentration"), payload: OPERATION_PAYLOADS.endConcentration }),
  OperationBase.extend({ type: z.literal("setPrepared"), payload: OPERATION_PAYLOADS.setPrepared }),
  OperationBase.extend({ type: z.literal("startCombat"), payload: OPERATION_PAYLOADS.startCombat }),
  OperationBase.extend({ type: z.literal("startTurn"), payload: OPERATION_PAYLOADS.startTurn }),
  OperationBase.extend({ type: z.literal("endCombat"), payload: OPERATION_PAYLOADS.endCombat }),
  OperationBase.extend({ type: z.literal("useEconomy"), payload: OPERATION_PAYLOADS.useEconomy }),
  OperationBase.extend({ type: z.literal("setCompanion"), payload: OPERATION_PAYLOADS.setCompanion }),
  OperationBase.extend({ type: z.literal("reviveCompanion"), payload: OPERATION_PAYLOADS.reviveCompanion }),
  OperationBase.extend({ type: z.literal("levelUp"), payload: OPERATION_PAYLOADS.levelUp }),
  OperationBase.extend({ type: z.literal("levelDown"), payload: OPERATION_PAYLOADS.levelDown }),
  OperationBase.extend({ type: z.literal("setSubclass"), payload: OPERATION_PAYLOADS.setSubclass }),
  OperationBase.extend({ type: z.literal("setChoice"), payload: OPERATION_PAYLOADS.setChoice }),
  OperationBase.extend({ type: z.literal("setAbilities"), payload: OPERATION_PAYLOADS.setAbilities }),
  OperationBase.extend({ type: z.literal("chooseAsi"), payload: OPERATION_PAYLOADS.chooseAsi }),
  OperationBase.extend({ type: z.literal("setDetails"), payload: OPERATION_PAYLOADS.setDetails }),
  OperationBase.extend({ type: z.literal("learnSpell"), payload: OPERATION_PAYLOADS.learnSpell }),
  OperationBase.extend({ type: z.literal("forgetSpell"), payload: OPERATION_PAYLOADS.forgetSpell }),
  OperationBase.extend({ type: z.literal("companionAction"), payload: OPERATION_PAYLOADS.companionAction }),
  OperationBase.extend({ type: z.literal("endCompanionState"), payload: OPERATION_PAYLOADS.endCompanionState }),
  OperationBase.extend({ type: z.literal("passTime"), payload: OPERATION_PAYLOADS.passTime }),
  OperationBase.extend({ type: z.literal("setInitiative"), payload: OPERATION_PAYLOADS.setInitiative }),
  OperationBase.extend({ type: z.literal("setPool"), payload: OPERATION_PAYLOADS.setPool }),
  OperationBase.extend({ type: z.literal("usePool"), payload: OPERATION_PAYLOADS.usePool }),
  OperationBase.extend({ type: z.literal("markOnce"), payload: OPERATION_PAYLOADS.markOnce }),
  OperationBase.extend({ type: z.literal("releaseReadied"), payload: OPERATION_PAYLOADS.releaseReadied }),
  OperationBase.extend({ type: z.literal("setConcentration"), payload: OPERATION_PAYLOADS.setConcentration }),
  OperationBase.extend({ type: z.literal("deathSave"), payload: OPERATION_PAYLOADS.deathSave }),
  OperationBase.extend({ type: z.literal("setDeathSaves"), payload: OPERATION_PAYLOADS.setDeathSaves }),
  OperationBase.extend({ type: z.literal("toggle"), payload: OPERATION_PAYLOADS.toggle }),
  OperationBase.extend({ type: z.literal("setField"), payload: OPERATION_PAYLOADS.setField }),
  OperationBase.extend({ type: z.literal("setStory"), payload: OPERATION_PAYLOADS.setStory }),
  OperationBase.extend({ type: z.literal("setDefense"), payload: OPERATION_PAYLOADS.setDefense }),
  OperationBase.extend({ type: z.literal("recharge"), payload: OPERATION_PAYLOADS.recharge }),
  OperationBase.extend({ type: z.literal("setPbAdjust"), payload: OPERATION_PAYLOADS.setPbAdjust }),
  OperationBase.extend({ type: z.literal("setCustomAction"), payload: OPERATION_PAYLOADS.setCustomAction }),
  OperationBase.extend({ type: z.literal("removeCustomAction"), payload: OPERATION_PAYLOADS.removeCustomAction }),
  OperationBase.extend({ type: z.literal("setCustomSpell"), payload: OPERATION_PAYLOADS.setCustomSpell }),
  OperationBase.extend({ type: z.literal("setOptionalFeature"), payload: OPERATION_PAYLOADS.setOptionalFeature }),
  OperationBase.extend({ type: z.literal("setProfRemoved"), payload: OPERATION_PAYLOADS.setProfRemoved }),
  OperationBase.extend({ type: z.literal("copyScroll"), payload: OPERATION_PAYLOADS.copyScroll }),
  OperationBase.extend({ type: z.literal("removeCustomSpell"), payload: OPERATION_PAYLOADS.removeCustomSpell }),
  OperationBase.extend({ type: z.literal("setRollAdjust"), payload: OPERATION_PAYLOADS.setRollAdjust }),
  OperationBase.extend({ type: z.literal("setCalendar"), payload: OPERATION_PAYLOADS.setCalendar }),
  OperationBase.extend({ type: z.literal("addNote"), payload: OPERATION_PAYLOADS.addNote }),
  OperationBase.extend({ type: z.literal("updateNote"), payload: OPERATION_PAYLOADS.updateNote }),
  OperationBase.extend({ type: z.literal("removeNote"), payload: OPERATION_PAYLOADS.removeNote }),
  OperationBase.extend({ type: z.literal("setCustomBackground"), payload: OPERATION_PAYLOADS.setCustomBackground }),
]);
export type Operation = z.infer<typeof Operation>;
export type OperationInput = z.input<typeof Operation>;
