import { roll as rollDice } from "@dnd/dice";
import { throwDice } from "../diceBox";
import { dice3dOn } from "../dice3dSetting";
import { myDieLook } from "./mine";

/**
 * Rolls made outside the roll screen (a companion's initiative, Combat Wild
 * Shape's healing): thrown as 3D dice when they're on and the app rolls for
 * this character, otherwise rolled by the app as before. A 3D failure or a
 * skip never loses the roll: the app rolls instead.
 */
export async function rollOrThrow(formula: string, use3d: boolean, label?: string): Promise<{ total: number }> {
  const m = /^(\d+)d(\d+)$/.exec(formula);
  if (use3d && dice3dOn() && m) {
    const n = Number(m[1]);
    const sides = Number(m[2]);
    try {
      const faces = await throwDice(Array(n).fill(sides), Array.from({ length: n }, () => myDieLook(label)));
      // A d10's 0 counts as 10.
      return { total: faces.reduce((a, f) => a + (f === 0 && sides === 10 ? 10 : f), 0) };
    } catch {
      // fall through to the app's roll
    }
  }
  return { total: rollDice(formula).total };
}

/** Several d20s at once (initiatives at the start of a fight), one throw, each labelled with whose it is. */
export async function d20s(labels: string[], use3d: boolean): Promise<number[]> {
  if (!labels.length) return [];
  if (use3d && dice3dOn()) {
    try {
      return await throwDice(labels.map(() => 20), labels.map((l) => myDieLook(l)));
    } catch {
      // the app rolls them
    }
  }
  return labels.map(() => rollDice("1d20").total);
}
