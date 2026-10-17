import { useEffect, useState } from "react";

/**
 * Dice sound and vibration: both off until the player turns them on (this
 * device). The sound is made in the browser (a short knock, its pitch by the
 * die's material), so there are no sound files; it plays at most once per
 * frame, however many dice land together.
 */
const KEYS = { sound: "dnd-dice-sound", vibrate: "dnd-dice-vibrate" } as const;
const EVENT = "dnd-dice-feedback";
type Kind = keyof typeof KEYS;
const memory: Partial<Record<Kind, boolean>> = {};

export function feedbackOn(kind: Kind): boolean {
  if (memory[kind] !== undefined) return memory[kind]!;
  try {
    return localStorage.getItem(KEYS[kind]) === "1";
  } catch {
    return false;
  }
}

export function setFeedback(kind: Kind, on: boolean) {
  memory[kind] = on;
  try {
    if (on) localStorage.setItem(KEYS[kind], "1");
    else localStorage.removeItem(KEYS[kind]);
  } catch {
    // Storage not available: it lasts for this visit only.
  }
  window.dispatchEvent(new Event(EVENT));
}

export function useFeedback(kind: Kind): [boolean, (on: boolean) => void] {
  const [on, setOn] = useState(() => feedbackOn(kind));
  useEffect(() => {
    const h = () => setOn(feedbackOn(kind));
    window.addEventListener(EVENT, h);
    return () => window.removeEventListener(EVENT, h);
  }, [kind]);
  return [on, (v) => setFeedback(kind, v)];
}

/** How a material knocks: heavier materials lower. */
export const KNOCK_HZ: Record<string, number> = {
  "tc-bludgeoning": 140, "tc-thunder": 120, "tc-slashing": 900, "tc-piercing": 1100, "tc-cold": 1300, "tc-force": 700,
  "tc-lightning": 1500, "tc-fire": 500, "tc-acid": 400, "tc-poison": 380, "tc-necrotic": 260, "tc-psychic": 600, "tc-radiant": 1000,
};

let ctx: AudioContext | undefined;
let last = 0;

/** One short knock (a die landing). Never throws: no audio, no sound. */
export function knock(material: string | undefined, loud = false): void {
  if (!feedbackOn("sound")) return;
  const now = typeof performance !== "undefined" ? performance.now() : Date.now();
  if (now - last < 60) return;
  last = now;
  try {
    const AC = (window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext);
    if (!AC) return;
    ctx ??= new AC();
    if (ctx.state === "suspended") void ctx.resume();
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "triangle";
    const hz = KNOCK_HZ[material ?? ""] ?? 600;
    osc.frequency.setValueAtTime(hz, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(60, hz * 0.55), t + 0.09);
    gain.gain.setValueAtTime(loud ? 0.22 : 0.12, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.13);
  } catch {
    // no audio here
  }
}

/** A short vibration (a die landing), when the player turned it on and the phone has it. */
export function buzz(pattern: number[] | undefined): void {
  if (!pattern?.length || !feedbackOn("vibrate")) return;
  try {
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") navigator.vibrate(pattern);
  } catch {
    // no vibration here
  }
}
