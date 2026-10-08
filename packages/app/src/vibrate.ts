/**
 * The phone's vibration for the character's hit points (Android browsers;
 * iPhones don't allow it): one buzz below half, a heartbeat for 3 seconds at
 * 0 HP, and a fading buzz for 2 seconds at death.
 */
const can = () => typeof navigator !== "undefined" && typeof navigator.vibrate === "function";

export function vibrateBloodied() {
  if (can()) navigator.vibrate(250);
}

/** Lub-dub, lub-dub: three beats over 3 seconds. */
export function vibrateHeartbeat() {
  if (can()) navigator.vibrate([120, 120, 180, 580, 120, 120, 180, 580, 120, 120, 180, 580]);
}

/** Long pulses getting shorter and further apart: about 2 seconds. */
export function vibrateFading() {
  if (can()) navigator.vibrate([500, 90, 350, 140, 230, 190, 140, 240, 70, 0]);
}

export interface HpState {
  id: string;
  hp: number;
  max: number;
  failures: number;
}

/** Compares before and after and buzzes when a threshold is crossed (the same character only). */
export function vibrateFor(prev: HpState | undefined, now: HpState) {
  if (!prev || prev.id !== now.id) return;
  if (now.failures >= 3 && prev.failures < 3) return vibrateFading();
  if (now.hp === 0 && prev.hp > 0) return vibrateHeartbeat();
  if (now.hp > 0 && now.hp < now.max / 2 && prev.hp >= prev.max / 2) vibrateBloodied();
}
