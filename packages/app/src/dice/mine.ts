import { currentDiceClasses, currentDiceState, pickedDiceColour } from "../diceColours";
import { registerFeatureThemes } from "./featureThemes";
import { lookOf, resolveTheme, type DicePrefs, type DieLook } from "./themes";

registerFeatureThemes();

/** This device's dice choices now: the picked colour, the character's classes and state, themes on. */
export function myDicePrefs(): DicePrefs {
  return { picked: pickedDiceColour(), classes: currentDiceClasses(), damageThemes: true, featureThemes: true, raging: currentDiceState().raging };
}

/**
 * One die's look for a roll: its group's label (a damage type or a bonus's name), what it comes from in the roll
 * (`source`, "Sneak Attack"), and more keys (the resource the option spends, the feature rolling it).
 */
export function myDieLook(label: string | undefined, source?: string, keys: string[] = []): DieLook {
  const all = [...keys, ...(source ? [`name:${source}`] : [])];
  const theme = resolveTheme({ label, keys: all }, myDicePrefs());
  // A feature's own dice are shown under its name ("Sneak Attack"), not their damage type.
  const featureDie = source && (theme.id.startsWith("feature-") || theme.id.startsWith("content-")) && theme.id !== "feature-rage";
  return lookOf(theme, featureDie ? source : label);
}
