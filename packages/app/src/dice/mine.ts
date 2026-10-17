import { currentDiceClasses, pickedDiceColour } from "../diceColours";
import { lookOf, resolveTheme, type DicePrefs, type DieLook } from "./themes";

/** This device's dice choices now: the picked colour, the character's classes, themes on. */
export function myDicePrefs(): DicePrefs {
  return { picked: pickedDiceColour(), classes: currentDiceClasses(), damageThemes: true, featureThemes: true };
}

/** One die's look for a roll: its group's label (a damage type or a bonus's name) and what's rolling it. */
export function myDieLook(label: string | undefined, source?: string): DieLook {
  return lookOf(resolveTheme({ label, source }, myDicePrefs()), label);
}
