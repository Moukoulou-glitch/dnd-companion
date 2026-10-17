import { rollComposed, secureRng, type Composed, type ComposedRoll, type Rng } from "@dnd/dice";
import type { DieLook } from "./dice/themes";

/**
 * 3D dice: the faces the thrown dice land on are the roll. The app's dice
 * engine still does everything else: which dice a roll needs, keeping the
 * higher or lower d20, crits, rerolls, minimums, modifiers and the total.
 *
 * This part is pure: what to throw, and the roll those faces make. The
 * throwing itself (fx/DiceBox3d.ts) is given as a function, so tests can use
 * fixed faces.
 */

/** The dice the 3D set has. Any other die (a d2, a d3, a d100) is rolled by the app, as before. */
export const THROWN_SIDES = [4, 6, 8, 10, 12, 20];
export const canThrow = (sides: number) => THROWN_SIDES.includes(sides);

/** How a throw is made: a critical hit's stronger throw. */
export interface ThrowOptions {
  strong?: boolean;
  /** Settle fast whatever the motion setting (death saves: nothing to wait for). */
  quick?: boolean;
}

/** Throws dice of these sides (in these looks, when given), in this order, and returns their faces in the same order. */
export type Thrower = (sides: number[], looks?: (DieLook | undefined)[], options?: ThrowOptions) => Promise<number[]>;

/** A die's look from its group: the term's label (a damage type, or none), its sides, and what it comes from in the roll ("Sneak Attack"). */
export type DieLookOf = (label: string | undefined, sides: number, source?: string) => DieLook | undefined;

/**
 * Plays a roll with thrown faces. First rolls come from the first throw, in
 * order. A die the rules roll again (Great Weapon Fighting's 1s and 2s) gets
 * a second throw for all of them at once; they never chain, so there are at
 * most two throws. Dice the 3D set doesn't have are rolled by the app.
 */
export async function rollThrown(c: Composed, toss: Thrower, appRng: Rng = secureRng, colourOf?: DieLookOf, options?: ThrowOptions): Promise<ComposedRoll & { thrown: number }> {
  // Each die's group, in the order the dice are rolled (term by term), for its colour.
  const groups: { sides: number; label: string | undefined; source: string | undefined }[] = [];
  c.terms.forEach((t, ti) => {
    if (t.kind === "dice") for (let i = 0; i < t.count; i++) groups.push({ sides: t.sides, label: t.label, source: c.sources[ti] });
  });
  // Which first rolls the roll needs: a dry run that never asks for a reroll.
  const first: number[] = [];
  const firstColours: (DieLook | undefined)[] = [];
  let g = 0;
  rollComposed(c, undefined, (sides, reroll) => {
    if (reroll) return sides;
    const group = groups[g++];
    if (canThrow(sides)) {
      first.push(sides);
      firstColours.push(colourOf && group?.sides === sides ? colourOf(group.label, sides, group.source) : undefined);
    }
    return sides;
  });
  const firstFaces = first.length ? check(first, await (colourOf ? toss(first, firstColours, options) : options ? toss(first, undefined, options) : toss(first))) : [];
  // The app's dice (no 3D model) keep their value between runs.
  const own: number[] = [];
  const play = (rerollFaces: number[] | undefined, wanted: number[]) => {
    let f = 0;
    let r = 0;
    let o = 0;
    return rollComposed(c, undefined, (sides, reroll) => {
      if (!canThrow(sides)) {
        if (o >= own.length) own.push(appRng(sides));
        return own[o++]!;
      }
      if (!reroll) return firstFaces[f++]!;
      if (rerollFaces) return rerollFaces[r++]!;
      wanted.push(sides);
      // Not thrown yet: any value; this run only counts which rerolls are needed.
      return sides;
    });
  };
  const wanted: number[] = [];
  const once = play(undefined, wanted);
  if (!wanted.length) return { ...once, thrown: first.length };
  // Rerolled dice (Great Weapon Fighting) keep the colour of the dice they replace: the first die of that size thrown.
  const again = check(wanted, await (colourOf ? toss(wanted, wanted.map((s) => firstColours[first.indexOf(s)])) : toss(wanted)));
  return { ...play(again, []), thrown: first.length + wanted.length };
}

/** A thrown face that isn't on that die (a d10's 0 counts as 10): fixed, or refused. */
function check(sides: number[], faces: number[]): number[] {
  if (faces.length !== sides.length) throw new Error(`Threw ${sides.length} dice, read ${faces.length}`);
  return faces.map((v, i) => {
    const s = sides[i]!;
    const n = s === 10 && v === 0 ? 10 : v;
    if (!Number.isInteger(n) || n < 1 || n > s) throw new Error(`${v} isn't a face of a d${s}`);
    return n;
  });
}

/** How many dice a roll throws (for the button's words). */
export function diceToThrow(c: Composed): number {
  let n = 0;
  rollComposed(c, undefined, (sides, reroll) => {
    if (!reroll && canThrow(sides)) n++;
    return sides;
  });
  return n;
}
