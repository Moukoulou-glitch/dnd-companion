import type { Character } from "@dnd/schema";
import type { DerivedSheet } from "./derive.js";

/** What the player is about to do, for checking against the turn's rules. */
export interface TurnIntent {
  name: string;
  economy: "action" | "bonus" | "reaction" | "free";
  /** An attack with the Attack action (Extra Attack allows more than one per action). */
  attack?: boolean;
  /** For spells: level 0 for cantrips, and whether it needs concentration. */
  spell?: { level: number; concentration: boolean };
  /** Releasing what you readied (it's what the reaction was kept for: no warning about it). */
  releasesReadied?: boolean;
  /** Only allowed if you haven't moved this turn (Steady Aim). */
  notAfterMoving?: boolean;
  /** Feature id, to notice it was already used this turn. */
  actionId?: string;
  /** A weapon or feature attack, for two-weapon fighting and attacks that need another first. */
  weapon?: {
    attackId: string;
    itemInstanceId?: string;
    offHand?: boolean;
    light: boolean;
    requires?: { attack: string; text: string };
  };
}

const INCAPACITATING = ["incapacitated", "paralyzed", "petrified", "stunned", "unconscious"];

/**
 * War Caster (PHB 2014): when a creature provokes an opportunity attack, a
 * spell instead of the attack: a casting time of 1 action, targeting only that
 * creature, and one you can cast now (known or prepared; not one only on your
 * class list for preparing, not a scroll).
 */
export function warCasterSpells(sheet: DerivedSheet): DerivedSheet["spells"] {
  if (!sheet.rules.warCaster) return [];
  return sheet.spells.filter((s) => s.singleTarget && castingEconomy(s.castingTime) === "action" && s.ready !== "not prepared" && !s.cast.scroll);
}

/** What you've readied with the Ready action and not released yet (one tag on you: the same one the Effects show). */
export function readiedNow(c: Character): { name: string; spell?: string } | undefined {
  const e = c.effects.find((x) => x.effect === "custom" && x.untilTurnStart && x.custom?.name.startsWith("Ready"));
  if (!e) return undefined;
  const name = e.custom!.name.replace(/^Ready:?\s*/, "") || "your readied action";
  return e.readied ? { name, spell: e.readied.spell } : { name };
}

/**
 * Using your reaction for something else while something is readied: a
 * readied spell stays held with concentration, but releasing it needs the
 * reaction, so it can't be released this round and is lost when your next
 * turn starts; a readied action simply can't be taken when its trigger comes.
 */
export function readiedWarning(r: { name: string; spell?: string }): string {
  return r.spell
    ? `You're holding ${r.name} (readied, with concentration). Releasing it takes your reaction: spend it on this and you can't release ${r.name} when its trigger comes; it's lost if it isn't released before your next turn starts.`
    : `You've readied ${r.name}. Taking it when the trigger comes uses your reaction: spend it on this and you can't take the readied action this round.`;
}

/** Reads a spell's casting time as the part of the turn it uses. */
export function castingEconomy(castingTime: string): TurnIntent["economy"] {
  const t = castingTime.toLowerCase();
  if (t.includes("bonus action")) return "bonus";
  if (t.includes("reaction")) return "reaction";
  if (t.includes("action")) return "action";
  return "free";
}

/**
 * Everything a player should hear before doing this, by the 2014 rules. The
 * app shows these and offers "Use anyway": it warns, it never blocks.
 */
export function turnWarnings(c: Character, sheet: DerivedSheet, intent: TurnIntent): string[] {
  const out: string[] = [];
  // Paralyzed, Stunned, Unconscious and Petrified include Incapacitated.
  // Hold Person brings Paralyzed, which brings Incapacitated: look through what effects include too.
  const states = sheet.effects.flatMap((e) => [{ id: e.id, name: e.name }, ...e.includes]);
  const incapacitated = states.find((e) => INCAPACITATING.includes(e.id.replace(/^(condition|effect):/, "")));
  if (states.some((s) => s.id === "effect:haste-lethargy") && intent.economy !== "free") {
    out.push("Haste's lethargy: you can't move or take actions until after your next turn.");
  }
  if (incapacitated && intent.economy !== "free") {
    out.push(`You're ${incapacitated.name.toLowerCase()}: you can't take actions or reactions.`);
  }

  if (intent.spell) {
    if (c.toggles.includes("raging")) out.push("You can't cast spells while raging.");
    if (c.shape && c.shape.kind !== "truepolymorph" && !(c.shape.kind === "wildshape" && sheet.wildShape?.beastSpells)) out.push(`You can't cast spells in ${c.shape.kind === "wildshape" ? "Wild Shape" : "a polymorphed form"}.`);
    if (intent.spell.concentration && c.concentration) {
      out.push(`You're concentrating on ${c.concentration.name}: casting ${intent.name} ends it.`);
    }
  }

  const w = intent.weapon;
  if (w?.offHand && !w.light && !sheet.rules.twoWeaponNonLight) {
    out.push(`${intent.name.replace(/ \(off-hand.*$/, "")} isn't a light weapon: two-weapon fighting needs light weapons in both hands (Dual Wielder lifts this).`);
  }

  const cb = c.combat;
  if (!cb) return out;

  if (w?.requires && !cb.attackedWith.some((a) => a.attackId === w.requires!.attack)) out.push(w.requires.text);
  if (w?.offHand) {
    // A stack of two daggers is one inventory line but a weapon in each hand.
    const pair = (c.inventory.find((i) => i.id === w.itemInstanceId)?.quantity ?? 1) >= 2;
    const first = cb.attackedWith.filter((a) => a.melee && a.itemInstanceId && (a.itemInstanceId !== w.itemInstanceId || pair));
    if (!first.length) out.push("Two-weapon fighting: first attack with a melee weapon in your other hand, using the Attack action.");
    else if (!sheet.rules.twoWeaponNonLight && !first.some((a) => a.light)) out.push("The weapon you attacked with first isn't light: two-weapon fighting needs light weapons in both hands.");
  }

  if (!cb.myTurn && (intent.economy === "action" || intent.economy === "bonus")) {
    out.push("It isn't your turn: actions and bonus actions happen on your turn. Tap Start my turn first.");
  }

  if (intent.attack && intent.weapon && cb.hasteAttack) {
    // Haste's extra action: this one weapon attack doesn't count against the Attack action.
  } else if (intent.attack) {
    const max = sheet.attacksPerAction;
    if (cb.attacks >= max) out.push(`You've made ${cb.attacks} of ${max} attacks for your Attack action this turn.`);
    else if (cb.attacks === 0 && cb.action > cb.extraActions) out.push("You've already used your action this turn.");
  } else if (intent.economy === "action" && cb.action > cb.extraActions) {
    out.push("You've already used your action this turn.");
  }
  if (intent.economy === "bonus" && cb.bonus > 0) out.push("You've already used your bonus action this turn.");
  if (intent.notAfterMoving && cb.moved > 0) out.push(`You've moved ${cb.moved} ft this turn: ${intent.name} only works if you haven't moved.`);
  if (intent.actionId && cb.usedThisTurn.includes(intent.actionId)) out.push(`You've already used ${intent.name} this turn.`);
  if (intent.economy === "reaction" && cb.reaction > 0) out.push("You've already used your reaction this round.");
  const readied = readiedNow(c);
  if (intent.economy === "reaction" && !intent.releasesReadied && cb.reaction === 0 && readied) out.push(readiedWarning(readied));

  if (intent.spell) {
    // 2014 rule: with a bonus-action spell, the only other spell that turn is a cantrip with a casting time of 1 action.
    if (intent.economy === "bonus" && cb.leveledActionSpell) {
      out.push("You've cast a 1st-level or higher spell with your action this turn: a bonus-action spell isn't allowed after it.");
    }
    if (intent.economy === "action" && intent.spell.level > 0 && cb.bonusSpell) {
      out.push("You've cast a bonus-action spell this turn: the only other spell you can cast is a cantrip with a casting time of 1 action.");
    }
    if (intent.economy === "bonus" && cb.bonusSpell) {
      out.push("You've already cast a bonus-action spell this turn.");
    }
  }
  return out;
}

/** Things to keep in mind on this turn, for the Play screen. */
export function turnReminders(c: Character, sheet: DerivedSheet): string[] {
  const out: string[] = [];
  if (c.concentration) out.push(`Concentrating on ${c.concentration.name}. Damage means a Constitution save.`);
  if (c.toggles.includes("raging")) out.push("Raging: it ends if your turn passes without attacking a hostile creature or taking damage.");
  for (const e of sheet.effects) {
    for (const r of e.reminders) out.push(`${e.name}: ${r}`);
    if (e.rounds !== undefined) out.push(`${e.name}: ${e.rounds} ${e.rounds === 1 ? "round" : "rounds"} left.`);
  }
  for (const comp of sheet.companions) {
    if (comp.combatNote && comp.form) out.push(`${comp.name}: ${comp.combatNote}`);
  }
  return [...new Set(out)];
}
