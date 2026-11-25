import { useEffect, useState } from "react";

/**
 * iPhones and iPads (every browser there is Safari underneath). An iPad asking
 * for the desktop site says it's a Mac, but has a touch screen.
 */
export function isAppleTouch(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && (navigator.maxTouchPoints ?? 0) > 1);
}

const KEY = "dnd-light-fx";
const EVENT = "dnd-light-fx";

/**
 * Lighter effects (25b): no blur or glow filters, one ongoing loop at a time
 * with fewer pieces, loops hidden while 3D dice are in the air. On by default
 * on iPhones and iPads, where those effects slow the page and push the dice's
 * WebGL out; the player can switch it either way (kept on this device).
 */
export function lightFx(): boolean {
  try {
    const v = localStorage.getItem(KEY);
    if (v === "1") return true;
    if (v === "0") return false;
  } catch {
    /* no storage: the default */
  }
  return isAppleTouch();
}

export function applyLightFx(): void {
  if (typeof document !== "undefined") document.documentElement.classList.toggle("light-fx", lightFx());
}

export function setLightFx(on: boolean): void {
  try {
    localStorage.setItem(KEY, on ? "1" : "0");
  } catch {
    /* kept for this visit only */
  }
  applyLightFx();
  window.dispatchEvent(new Event(EVENT));
}

export function useLightFx(): boolean {
  const [on, setOn] = useState(lightFx);
  useEffect(() => {
    const h = () => setOn(lightFx());
    window.addEventListener(EVENT, h);
    return () => window.removeEventListener(EVENT, h);
  }, []);
  return on;
}
