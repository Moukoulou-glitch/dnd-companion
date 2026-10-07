/**
 * The phone's flashlight, blinked when a light spell is cast: once briefly
 * for a cantrip, once per spell level otherwise (Daylight: 3 blinks). Only
 * browsers that expose the camera torch can do it (Chrome on Android);
 * iPhones don't allow it. Off unless the player switches it on, per device.
 */

/** Spells that make light, and features that count as one (Charm of Sunlight: a 5th-level Daylight). */
export const LIGHT_SPELLS = new Set([
  "spell:light",
  "spell:dancing-lights",
  "spell:produce-flame",
  "spell:faerie-fire",
  "spell:continual-flame",
  "spell:flame-blade",
  "spell:daylight",
  "spell:sunbeam",
  "spell:sunburst",
]);
export const LIGHT_FEATURES: Record<string, number> = { "charm-of-sunlight": 5 };

const KEY = "flash-light-spells";

export function flashEnabled(): boolean {
  try {
    return localStorage.getItem(KEY) === "on";
  } catch {
    return false;
  }
}

export function setFlashEnabled(on: boolean) {
  try {
    if (on) localStorage.setItem(KEY, "on");
    else localStorage.removeItem(KEY);
  } catch {
    /* storage blocked: the setting just won't stick */
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Blinks the torch: `level` 0 is one brief flash, otherwise that many blinks.
 * Resolves false when this phone or browser can't control the flashlight.
 */
export async function flashTorch(level: number): Promise<boolean> {
  if (!navigator.mediaDevices?.getUserMedia) return false;
  let stream: MediaStream | undefined;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } } });
    const track = stream.getVideoTracks()[0];
    const caps = track?.getCapabilities?.() as { torch?: boolean } | undefined;
    if (!track || !caps?.torch) return false;
    const set = (on: boolean) => track.applyConstraints({ advanced: [{ torch: on } as MediaTrackConstraintSet] });
    const blinks = Math.max(1, level);
    for (let i = 0; i < blinks; i++) {
      await set(true);
      await sleep(level === 0 ? 150 : 350);
      await set(false);
      if (i < blinks - 1) await sleep(250);
    }
    return true;
  } catch {
    return false;
  } finally {
    stream?.getTracks().forEach((t) => t.stop());
  }
}

/** After a cast: blink for a light spell when the player has it on. */
export function flashForSpell(spellId: string, level: number) {
  if (flashEnabled() && LIGHT_SPELLS.has(spellId)) void flashTorch(level);
}

/** After using a feature that makes light (Charm of Sunlight). */
export function flashForFeature(actionId: string) {
  const level = LIGHT_FEATURES[actionId];
  if (level !== undefined && flashEnabled()) void flashTorch(level);
}
