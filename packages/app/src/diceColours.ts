import { useEffect, useState } from "react";

/**
 * The colours of the 3D dice, all in one place.
 *
 * - Damage dice take their damage type's colour, group by group (Ice Storm's
 *   2d8 bludgeoning and 4d6 cold land as two colours).
 * - Your own dice (the d20, and dice without a damage type: Bless, Guidance,
 *   Bardic Inspiration) take your colour: the colour of the class you have the
 *   most levels in (the first one on a tie), unless you picked a colour on this
 *   device. A picked colour wins until you switch back to following your class.
 *
 * Colours are dark or saturated enough for the white numbers on the dice.
 */

export const DAMAGE_DICE_COLOURS: Record<string, string> = {
  acid: "#5c940d",
  bludgeoning: "#8d6e4f",
  cold: "#3b8fd0",
  fire: "#d9480f",
  force: "#4c6ef5",
  lightning: "#1c7ed6",
  necrotic: "#4b2a5e",
  piercing: "#5f6670",
  poison: "#2b8a3e",
  psychic: "#c2255c",
  radiant: "#d4a017",
  slashing: "#868e96",
  thunder: "#7048e8",
  healing: "#37b24d",
};

export const CLASS_DICE_COLOURS: Record<string, { name: string; colour: string }> = {
  "class:barbarian": { name: "Barbarian", colour: "#a51111" },
  "class:bard": { name: "Bard", colour: "#d6336c" },
  "class:cleric": { name: "Cleric", colour: "#c99a06" },
  "class:druid": { name: "Druid", colour: "#2f7d32" },
  "class:fighter": { name: "Fighter", colour: "#6c757d" },
  "class:monk": { name: "Monk", colour: "#1098ad" },
  "class:paladin": { name: "Paladin", colour: "#e67700" },
  "class:ranger": { name: "Ranger", colour: "#4a6b12" },
  "class:rogue": { name: "Rogue", colour: "#343a40" },
  "class:sorcerer": { name: "Sorcerer", colour: "#e03131" },
  "class:warlock": { name: "Warlock", colour: "#6741d9" },
  "class:wizard": { name: "Wizard", colour: "#1971c2" },
};

/** The dice's colour before this round (and for a class the table doesn't list). */
export const DEFAULT_DICE_COLOUR = "#c8902e";

/** The class with the most levels; the first one listed on a tie. */
export function mainClass(classes: { class: string; level: number }[]): string | undefined {
  let best: { class: string; level: number } | undefined;
  for (const c of classes) if (!best || c.level > best.level) best = c;
  return best?.class;
}

/** Your class's colour (the class with the most levels). */
export function classDiceColour(classes: { class: string; level: number }[]): string {
  const main = mainClass(classes);
  return (main && CLASS_DICE_COLOURS[main]?.colour) || DEFAULT_DICE_COLOUR;
}

/** One die's colour: its damage type's, or yours. */
export function dieColour(label: string | undefined, mine: string): string {
  const type = label?.toLowerCase();
  return (type && DAMAGE_DICE_COLOURS[type]) || mine;
}

// --- This device's choice: follow my class (default) or a picked colour. ---

const KEY = "dnd-dice-colour";
const EVENT = "dnd-dice-colour";
let memory: string | null | undefined;

/** The colour picked on this device, or null when following your class. */
export function pickedDiceColour(): string | null {
  if (memory !== undefined) return memory;
  try {
    const v = localStorage.getItem(KEY);
    return v && /^#[0-9a-f]{6}$/i.test(v) ? v : null;
  } catch {
    return null;
  }
}

/** Pick a colour (it wins), or null to follow your class again. */
export function setPickedDiceColour(colour: string | null) {
  memory = colour;
  try {
    if (colour) localStorage.setItem(KEY, colour);
    else localStorage.removeItem(KEY);
  } catch {
    // Storage not available: it lasts for this visit only.
  }
  if (typeof window !== "undefined") window.dispatchEvent(new Event(EVENT));
}

export function usePickedDiceColour(): [string | null, (c: string | null) => void] {
  const [v, setV] = useState(pickedDiceColour);
  useEffect(() => {
    const h = () => setV(pickedDiceColour());
    window.addEventListener(EVENT, h);
    return () => window.removeEventListener(EVENT, h);
  }, []);
  return [v, setPickedDiceColour];
}

// The character on screen, so a throw knows whose class to follow.
let current: { class: string; level: number }[] = [];
export function setDiceClasses(classes: { class: string; level: number }[]) {
  current = classes.map((c) => ({ class: c.class, level: c.level }));
}

/** Your dice's colour right now: the picked one, or your class's. */
export function myDiceColour(): string {
  return pickedDiceColour() ?? classDiceColour(current);
}
