import type { Character } from "@dnd/schema";
import type { RollRecord } from "../rolls";
import { CHARMED, DAMAGE_FX, FORM_FX, damageKey } from "./looks";
import { alignmentSide, spellFxOf, type SpellPhase } from "./spells";
import { genLook, type GenLook, type SpellInfo } from "./generated";
import { featureLook, type FeatureInfo } from "./features";

/** The feature a recorded use belongs to (fx/features.ts featureFor, on the live sheet); undefined: no look. */
export type FeatureLookup = (type: string, payload: unknown) => FeatureInfo | undefined;

/** Looks a spell up for its generated effect (fx/generated.ts); undefined: the older generic circle. */
export type SpellLookup = (spell: string) => SpellInfo | undefined;

/**
 * Which flourish a confirmed change or roll earns. Pure: it only compares the
 * character before and after a recorded operation (or reads a saved roll), and
 * never changes anything. The app calls it from the "dnd-op" and "dnd-roll"
 * events, which fire once per live action, never on load, replay or redraw.
 */
export type FxEvent =
  | { kind: "crit" }
  | { kind: "fumble" }
  | { kind: "heal"; amount: number }
  /** Healing under Beacon of Hope: the maximum, in emerald and gold (on you, or on a companion or summoned creature: `other`). */
  | { kind: "beacon-heal"; amount: number; other?: string }
  | { kind: "temp"; amount: number }
  /** Damage that never reached you: "prevented" (none got through), "reduced" (less than dealt), "absorbed" (temporary HP took it). */
  | { kind: "defend"; how: "prevented" | "reduced" | "absorbed"; amount: number }
  | { kind: "cast"; school?: string }
  | { kind: "sneak" }
  /** Destructive Wrath: the storm answers (its lightning and thunder dice at their maximum). */
  | { kind: "wrath" }
  | { kind: "concentration"; kept: boolean }
  | { kind: "death-save"; result: "success" | "failure"; final: boolean }
  | { kind: "inspiration"; gained: boolean }
  | { kind: "level-up"; level: number }
  /** A phase of a spell with its own look (fx/spells.ts). */
  | { kind: "spell"; spell: string; phase: SpellPhase; mode?: string }
  /** Flurry of Blows used (its ki spent): the afterimages; each strike's own impact comes from its hit. */
  | { kind: "flurry" }
  /** Way of Mercy, when the feature is actually used (Hand of Healing's or Hand of Harm's ki spent). */
  | { kind: "mercy"; hand: "healing" | "harm" }
  /** Reckless Attack taken on an attack roll (a streak); "hit" when that attack is called a hit. */
  | { kind: "reckless"; hit: boolean }
  /** An unarmed strike the player marked as a hit, a critical hit or a miss. */
  | { kind: "unarmed"; result: "hit" | "crit" | "miss" }
  /** A damage roll's main damage type (the one with the most damage). */
  | { kind: "damage-type"; type: string }
  /** Typed damage that got through to you (none of it stopped). */
  | { kind: "hurt"; type: string; amount: number }
  /** The Charmed condition put on you. */
  | { kind: "charmed" }
  /** A transformation started (Necrotic Shroud, Form of Dread): by the state the feature turns on. */
  | { kind: "form"; form: string }
  /** A spell with no hand-made look: its generated one (fx/generated.ts), by level, school, damage and shape. */
  | { kind: "gen"; g: GenLook }
  /** Sending: the message's words, once it's sent. */
  | { kind: "sending"; words: string[] };

/** A saved roll: crit and natural 1 on attack rolls only; Sneak Attack when its dice are in the damage. */
export function rollFx(r: RollRecord, c?: Character, info?: SpellLookup): FxEvent[] {
  if (r.kind === "d20") {
    if (!r.attack) return [];
    const reckless: FxEvent[] = r.options?.includes(RECKLESS) ? [{ kind: "reckless", hit: false }] : [];
    // The roll's own crit flag: a natural 20, or the crit range a feature gives (Champion's 19).
    if (r.crit) return [...reckless, { kind: "crit" }];
    if (r.natural === 1) return [...reckless, { kind: "fumble" }];
    return reckless;
  }
  const out: FxEvent[] = r.lines.some((l) => /sneak attack/i.test(l.source) && l.detail !== "") ? [{ kind: "sneak" }] : [];
  if (r.options?.includes("Destructive Wrath")) out.unshift({ kind: "wrath" });
  // A spell's damage: right after casting it resolves; from the concentration chip it's a later use.
  const phase: SpellPhase = r.again ? "again" : "resolve";
  // Its damage type changed (Transmuted Spell: Fireball as thunder): the spell's own look is for its own type, so the
  // generated one plays, in the colour of the type rolled.
  const own = r.spell ? info?.(r.spell)?.damage?.type : undefined;
  const retyped = !!own && !!r.byType && Object.keys(r.byType).length > 0 && !Object.keys(r.byType).some((k) => damageKey(k) === damageKey(own));
  const sdef = retyped ? undefined : spellFxOf(r.spell);
  if (r.spell && sdef?.[phase]) {
    const mode = sdef.byAlignment ? alignmentSide(c?.alignment) : undefined;
    out.push({ kind: "spell", spell: r.spell, phase, ...(mode ? { mode } : {}) });
    // The damage type the player picked (Spirit Guardians: radiant or necrotic) plays too.
    const type = sdef.withDamageType ? mainType(r) : undefined;
    if (type) out.push({ kind: "damage-type", type });
  }
  // A spell with no hand-made look at all: its generated impact, in the colour of the damage rolled (it says the type too).
  const gi = r.spell && !sdef ? info?.(r.spell) : undefined;
  if (gi) {
    const t = mainType(r);
    out.push({ kind: "gen", g: genLook(gi, phase, t ? { type: t } : {}) });
  }
  // The damage type's look, only when nothing else plays on this roll (a spell's own look or Sneak Attack say more).
  if (!out.length) {
    const type = mainType(r);
    if (type) out.push({ kind: "damage-type", type });
  }
  return out;
}

/** The damage type with the most damage in a roll (the first one on a tie); undefined when none has a look. */
export function mainType(r: RollRecord): string | undefined {
  let best: { key: string; n: number } | undefined;
  for (const [label, n] of Object.entries(r.byType ?? {})) {
    const key = damageKey(label);
    if (key && n > 0 && (!best || n > best.n)) best = { key, n };
  }
  // Your own dice entered as a total: no split by type, so the weapon's (first) type.
  return best?.key ?? (r.physical ? damageKey(r.mainType) : undefined);
}

const level = (c: Character) => c.classes.reduce((t, k) => t + k.level, 0);

/** A recorded operation: what actually changed. `school` looks a spell's school up (never guessed from its name). */
export function opFx(type: string, payload: unknown, before: Character, after: Character, school?: (spell: string) => string | undefined, info?: SpellLookup, feature?: FeatureLookup): FxEvent[] {
  const out: FxEvent[] = [];
  const p = (payload ?? {}) as Record<string, unknown>;
  // Damage and healing on a summoned creature or companion aren't yours.
  const onYou = !p.companion && !p.summon;
  const hb = before.hp ?? { current: 0, temp: 0 };
  const ha = after.hp ?? { current: 0, temp: 0 };

  // Hit points that actually came back (capped at the maximum by the rules already); setting HP by hand and levelling aren't healing.
  const beaconOn = (effects: { effect: string }[] | undefined) => !!effects?.some((e) => e.effect === "effect:beacon-of-hope");
  if (onYou && type !== "levelUp" && type !== "levelDown" && type !== "setHp" && ha.current > hb.current)
    out.push(beaconOn(after.effects) ? { kind: "beacon-heal", amount: ha.current - hb.current } : { kind: "heal", amount: ha.current - hb.current });
  // A companion or a summoned creature under Beacon of Hope, healed.
  if (type === "heal" && typeof p.companion === "string") {
    const b = before.companions?.[p.companion]?.hp?.current;
    const a = after.companions?.[p.companion]?.hp?.current;
    if (beaconOn(after.companions?.[p.companion]?.effects) && a !== undefined && (b === undefined || a > b)) out.push({ kind: "beacon-heal", amount: b === undefined ? Number(p.amount) || 0 : a - b, other: p.companion });
  }
  if (type === "summonHp" && typeof p.id === "string") {
    const b = before.summons?.find((m) => m.id === p.id);
    const a = after.summons?.find((m) => m.id === p.id);
    if (a && b && a.hp > b.hp && beaconOn(a.effects)) out.push({ kind: "beacon-heal", amount: a.hp - b.hp, other: a.name ?? "summon" });
  }
  if (onYou && ha.temp > hb.temp) out.push({ kind: "temp", amount: ha.temp - hb.temp });

  if (type === "damage" && onYou && !before.shape && hb.current > 0) {
    const dealt = Number(p.amount) || 0;
    const tempLost = hb.temp - ha.temp;
    const hpLost = hb.current - ha.current;
    if (dealt > 0) {
      if (tempLost + hpLost === 0) out.push({ kind: "defend", how: tempLost > 0 ? "absorbed" : "prevented", amount: dealt });
      else if (tempLost > 0) out.push({ kind: "defend", how: "absorbed", amount: tempLost });
      else if (hpLost < dealt && ha.current > 0) out.push({ kind: "defend", how: "reduced", amount: dealt - hpLost });
      // All of it got through: the damage type's look on the HP box (untyped damage: nothing, as before).
      else {
        const type = damageKey(typeof p.damageType === "string" ? p.damageType : undefined);
        if (type && hpLost > 0) out.push({ kind: "hurt", type, amount: hpLost });
      }
    }
  }
  // Durable's Hit Die against damage: the reduction is the result.
  if (type === "spendHitDie" && p.reduce) out.push({ kind: "defend", how: "reduced", amount: Number(p.roll) || 0 });

  // A ritual or long casting takes effect when it's finished: its cast look plays then, never when it's started.
  const cast = type === "castSpell" ? p : type === "finishTimed" && before.timed?.cast ? (before.timed.cast as Record<string, unknown>) : undefined;
  if (cast && typeof cast.spell === "string") {
    // A spell with its own cast look plays that; any other gets the arcane circle in its school's colour.
    const def = spellFxOf(cast.spell);
    // The mode picked when casting (Control Water: Whirlpool), or the casting time picked (Plant Growth: 8 hours);
    // a mode the effects don't know is left out, so the neutral look plays.
    const picked = [cast.choice, cast.castingTime].find((m): m is string => typeof m === "string" && !!def?.modes?.[m.toLowerCase()]);
    // Spirit Guardians: by the caster's alignment.
    const mode = def?.byAlignment ? alignmentSide(after.alignment) : picked?.toLowerCase();
    const gi = def?.cast ? undefined : info?.(cast.spell);
    if (def?.cast) out.push({ kind: "spell", spell: cast.spell, phase: "cast", ...(mode ? { mode } : {}) });
    // Its generated look, bigger with the spell's level; a higher slot adds rings and sparks.
    else if (gi) out.push({ kind: "gen", g: genLook(gi, "cast", typeof cast.level === "number" ? { slot: cast.level } : {}) });
    else {
      const s = school?.(cast.spell)?.toLowerCase();
      out.push(s ? { kind: "cast", school: s } : { kind: "cast" });
    }
  }

  if (type === "deathSave" && p.result !== "critSuccess") {
    const ds = (c: Character) => c.deathSaves ?? { successes: 0, failures: 0 };
    const sb = ds(before), sa = ds(after);
    // The third success makes you stable and clears the saves: that's the final success.
    const nowStable = !before.effects.some((e) => e.effect === "other:stable") && after.effects.some((e) => e.effect === "other:stable");
    if (nowStable) out.push({ kind: "death-save", result: "success", final: true });
    else if (sa.successes > sb.successes) out.push({ kind: "death-save", result: "success", final: sa.successes >= 3 });
    else if (sa.failures > sb.failures) out.push({ kind: "death-save", result: "failure", final: sa.failures >= 3 });
  }

  // A feature used (its action, resource or state): its class's look, bigger the later the class gives it.
  const used = feature && ["useAction", "spendResource", "usePool", "toggle"].includes(type) ? feature(type, payload) : undefined;
  if (used) out.push({ kind: "gen", g: featureLook(used) });

  if (type === "useAction") {
    if (p.action === "flurry-of-blows") out.push({ kind: "flurry" });
    if (p.action === "hand-of-healing") out.push({ kind: "mercy", hand: "healing" });
    if (p.action === "hand-of-harm") out.push({ kind: "mercy", hand: "harm" });
  }

  // The Charmed condition, only when it's new on you (not on a summoned creature, not when it was already there).
  const charmed = (c: Character) => c.effects.some((e) => e.effect === CHARMED);
  if (!charmed(before) && charmed(after)) out.push({ kind: "charmed" });

  // A transformation's state turned on (Necrotic Shroud, Form of Dread), whatever turned it on.
  for (const t of after.toggles ?? []) if (FORM_FX[t] && !(before.toggles ?? []).includes(t)) out.push({ kind: "form", form: t });

  const ib = before.inspirations ?? (before.inspiration ? 1 : 0);
  const ia = after.inspirations ?? (after.inspiration ? 1 : 0);
  if (ia !== ib) out.push({ kind: "inspiration", gained: ia > ib });

  if (type === "levelUp" && level(after) > level(before)) out.push({ kind: "level-up", level: level(after) });
  return out;
}

/** Unarmed strikes, by their attack ids in the content (Martial Arts, Tavern Brawler, Unarmed Fighting). */
export const isUnarmed = (attackId: string) => attackId.startsWith("martial-arts") || attackId === "tavern-unarmed" || attackId.startsWith("unarmed-");

/** The player's call on an attack (Hit, Critical damage or Miss): an unarmed strike gets its impact or its air-slice. */
export function strikeFx(attackId: string, outcome: "hit" | "crit" | "miss", options: string[] = []): FxEvent[] {
  const out: FxEvent[] = isUnarmed(attackId) ? [{ kind: "unarmed", result: outcome }] : [];
  // Reckless Attack: an impact only when the attack is a hit (advantage isn't a hit, and it adds no damage).
  if (outcome !== "miss" && options.includes(RECKLESS)) out.push({ kind: "reckless", hit: true });
  return out;
}

/** The option's label on attack rolls, from the barbarian content. */
const RECKLESS = "Reckless Attack";

/** The quiet loop to show now: only while the engine says you're concentrating on a spell that has one. */
export function ongoingFx(c: Character | undefined): { spell: string; look: string } | undefined {
  const spell = c?.concentration?.spell;
  const def = spellFxOf(spell);
  if (!spell || !def) return undefined;
  // The mode picked for it, from its effect's choice (Control Weather: Rain).
  const choice = def.byAlignment ? alignmentSide(c?.alignment) : c?.effects.find((e) => e.effect === spell.replace(/^spell:/, "effect:"))?.choice?.toLowerCase();
  const look = (choice && def.modes?.[choice]?.ongoing) || def.ongoing;
  return look ? { spell, look } : undefined;
}

/** The transformation loops to show now: one per feature state that's on and has a look. */
export function formFx(c: Character | undefined): { form: string; look: string }[] {
  return (c?.toggles ?? []).filter((t) => FORM_FX[t]).map((t) => ({ form: t, look: FORM_FX[t]!.ongoing }));
}

/** Known damage types (for tests and the effects list). */
export const DAMAGE_TYPES = Object.keys(DAMAGE_FX);
