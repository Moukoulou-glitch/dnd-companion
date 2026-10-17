import { useEffect, useState } from "react";

/**
 * Whether this device throws 3D dice when the app rolls. A device setting,
 * not the character's: 3D dice cost a phone more than a laptop. It's kept in
 * this browser's storage; when that isn't available it's simply off.
 */
const KEY = "dnd-dice-3d";
const EVENT = "dnd-dice-3d";

export function dice3dOn(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function setDice3d(on: boolean) {
  try {
    if (on) localStorage.setItem(KEY, "1");
    else localStorage.removeItem(KEY);
  } catch {
    // Storage not available: it lasts for this visit only.
  }
  memory = on;
  window.dispatchEvent(new Event(EVENT));
}

let memory: boolean | undefined;

export function useDice3d(): [boolean, (on: boolean) => void] {
  const [on, setOn] = useState(() => memory ?? dice3dOn());
  useEffect(() => {
    const h = () => setOn(memory ?? dice3dOn());
    window.addEventListener(EVENT, h);
    return () => window.removeEventListener(EVENT, h);
  }, []);
  return [on, setDice3d];
}

/**
 * How the 3D dice move, on this device:
 * - full: the whole throw and its effects;
 * - reduced: the dice still roll, with calmer effects and no shadows (the start when the device asks for reduced motion);
 * - fast: heavier, quicker dice that settle in about a second.
 * The result is the same in every mode: only the motion changes.
 */
export type DiceMode = "full" | "reduced" | "fast";
const MODE_KEY = "dnd-dice-mode";
const MODE_EVENT = "dnd-dice-mode";
let modeMemory: DiceMode | undefined;

const prefersReduced = () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

export function diceMode(): DiceMode {
  if (modeMemory) return modeMemory;
  try {
    const v = localStorage.getItem(MODE_KEY);
    if (v === "full" || v === "reduced" || v === "fast") return v;
  } catch {
    // no storage: the default below
  }
  return prefersReduced() ? "reduced" : "full";
}

export function setDiceMode(mode: DiceMode) {
  modeMemory = mode;
  try {
    localStorage.setItem(MODE_KEY, mode);
  } catch {
    // Storage not available: it lasts for this visit only.
  }
  window.dispatchEvent(new Event(MODE_EVENT));
}

export function useDiceMode(): [DiceMode, (m: DiceMode) => void] {
  const [m, setM] = useState(diceMode);
  useEffect(() => {
    const h = () => setM(diceMode());
    window.addEventListener(MODE_EVENT, h);
    return () => window.removeEventListener(MODE_EVENT, h);
  }, []);
  return [m, setDiceMode];
}
