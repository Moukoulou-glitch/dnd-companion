import type { Character } from "@dnd/schema";
import type { RollRecord } from "../rolls";
import { spellFxOf, type SpellPhase } from "./spells";

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
  | { kind: "temp"; amount: number }
  /** Damage that never reached you: "prevented" (none got through), "reduced" (less than dealt), "absorbed" (temporary HP took it). */
  | { kind: "defend"; how: "prevented" | "reduced" | "absorbed"; amount: number }
  | { kind: "cast"; school?: string }
  | { kind: "sneak" }
  | { kind: "concentration"; kept: boolean }
  | { kind: "death-save"; result: "success" | "failure"; final: boolean }
  | { kind: "inspiration"; gained: boolean }
  | { kind: "level-up"; level: number }
  /** A phase of a spell with its own look (fx/spells.ts). */
  | { kind: "spell"; spell: string; phase: SpellPhase }
  /** An unarmed strike the player marked as a hit, a critical hit or a miss. */
  | { kind: "unarmed"; result: "hit" | "crit" | "miss" };

/** A saved roll: crit and natural 1 on attack rolls only; Sneak Attack when its dice are in the damage. */
export function rollFx(r: RollRecord): FxEvent[] {
  if (r.kind === "d20") {
    if (!r.attack) return [];
    // The roll's own crit flag: a natural 20, or the crit range a feature gives (Champion's 19).
    if (r.crit) return [{ kind: "crit" }];
    if (r.natural === 1) return [{ kind: "fumble" }];
    return [];
  }
  const out: FxEvent[] = r.lines.some((l) => /sneak attack/i.test(l.source) && l.detail !== "") ? [{ kind: "sneak" }] : [];
  // A spell's damage: right after casting it resolves; from the concentration chip it's a later use.
  const phase: SpellPhase = r.again ? "again" : "resolve";
  if (r.spell && spellFxOf(r.spell)?.[phase]) out.push({ kind: "spell", spell: r.spell, phase });
  return out;
}

const level = (c: Character) => c.classes.reduce((t, k) => t + k.level, 0);

/** A recorded operation: what actually changed. `school` looks a spell's school up (never guessed from its name). */
export function opFx(type: string, payload: unknown, before: Character, after: Character, school?: (spell: string) => string | undefined): FxEvent[] {
  const out: FxEvent[] = [];
  const p = (payload ?? {}) as Record<string, unknown>;
  // Damage and healing on a summoned creature or companion aren't yours.
  const onYou = !p.companion && !p.summon;
  const hb = before.hp ?? { current: 0, temp: 0 };
  const ha = after.hp ?? { current: 0, temp: 0 };

  // Hit points that actually came back (capped at the maximum by the rules already); setting HP by hand and levelling aren't healing.
  if (onYou && type !== "levelUp" && type !== "levelDown" && type !== "setHp" && ha.current > hb.current) out.push({ kind: "heal", amount: ha.current - hb.current });
  if (onYou && ha.temp > hb.temp) out.push({ kind: "temp", amount: ha.temp - hb.temp });

  if (type === "damage" && onYou && !before.shape && hb.current > 0) {
    const dealt = Number(p.amount) || 0;
    const tempLost = hb.temp - ha.temp;
    const hpLost = hb.current - ha.current;
    if (dealt > 0) {
      if (tempLost + hpLost === 0) out.push({ kind: "defend", how: tempLost > 0 ? "absorbed" : "prevented", amount: dealt });
      else if (tempLost > 0) out.push({ kind: "defend", how: "absorbed", amount: tempLost });
      else if (hpLost < dealt && ha.current > 0) out.push({ kind: "defend", how: "reduced", amount: dealt - hpLost });
    }
  }
  // Durable's Hit Die against damage: the reduction is the result.
  if (type === "spendHitDie" && p.reduce) out.push({ kind: "defend", how: "reduced", amount: Number(p.roll) || 0 });

  if (type === "castSpell" && typeof p.spell === "string") {
    // A spell with its own cast look plays that; any other gets the arcane circle in its school's colour.
    if (spellFxOf(p.spell)?.cast) out.push({ kind: "spell", spell: p.spell, phase: "cast" });
    else {
      const s = school?.(p.spell)?.toLowerCase();
      out.push(s ? { kind: "cast", school: s } : { kind: "cast" });
    }
  }

  if (type === "deathSave" && p.result !== "critSuccess") {
    const ds = (c: Character) => c.deathSaves ?? { successes: 0, failures: 0 };
    const sb = ds(before), sa = ds(after);
    if (sa.successes > sb.successes) out.push({ kind: "death-save", result: "success", final: sa.successes >= 3 });
    else if (sa.failures > sb.failures) out.push({ kind: "death-save", result: "failure", final: sa.failures >= 3 });
  }

  const ib = before.inspirations ?? (before.inspiration ? 1 : 0);
  const ia = after.inspirations ?? (after.inspiration ? 1 : 0);
  if (ia !== ib) out.push({ kind: "inspiration", gained: ia > ib });

  if (type === "levelUp" && level(after) > level(before)) out.push({ kind: "level-up", level: level(after) });
  return out;
}

/** Unarmed strikes, by their attack ids in the content (Martial Arts, Tavern Brawler, Unarmed Fighting). */
export const isUnarmed = (attackId: string) => attackId.startsWith("martial-arts") || attackId === "tavern-unarmed" || attackId.startsWith("unarmed-");

/** The player's call on an attack (Hit, Critical damage or Miss): an unarmed strike gets its impact or its air-slice. */
export function strikeFx(attackId: string, outcome: "hit" | "crit" | "miss"): FxEvent[] {
  return isUnarmed(attackId) ? [{ kind: "unarmed", result: outcome }] : [];
}

/** The quiet loop to show now: only while the engine says you're concentrating on a spell that has one. */
export function ongoingFx(c: Character | undefined): { spell: string; look: string } | undefined {
  const spell = c?.concentration?.spell;
  const look = spellFxOf(spell)?.ongoing;
  return spell && look ? { spell, look } : undefined;
}
