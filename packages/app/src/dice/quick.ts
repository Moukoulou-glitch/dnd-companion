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
export async function rollOrThrow(formula: string, use3d: boolean, label?: string, theme: { source?: string; keys?: string[]; quick?: boolean } = {}): Promise<{ total: number }> {
  const m = /^(\d+)d(\d+)$/.exec(formula);
  if (use3d && dice3dOn() && m) {
    const n = Number(m[1]);
    const sides = Number(m[2]);
    try {
      const look = myDieLook(label, theme.source, theme.keys);
      const faces = await throwDice(Array(n).fill(sides), Array.from({ length: n }, () => look), theme.quick ? { quick: true } : undefined);
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

/** Several dice of one size, each face kept (Portent's d20s, a resource die): thrown in one go when 3D dice are on. */
export async function facesOrRoll(n: number, sides: number, use3d: boolean, theme: { source?: string; keys?: string[]; quick?: boolean } = {}): Promise<number[]> {
  if (n <= 0) return [];
  if (use3d && dice3dOn()) {
    try {
      const look = myDieLook(undefined, theme.source, theme.keys);
      const faces = await throwDice(Array(n).fill(sides), Array.from({ length: n }, () => look), theme.quick ? { quick: true } : undefined);
      return faces.map((f) => (f === 0 && sides === 10 ? 10 : f));
    } catch {
      // the app rolls them
    }
  }
  return Array.from({ length: n }, () => rollDice(`1d${sides}`).total);
}
