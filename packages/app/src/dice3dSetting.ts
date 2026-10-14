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
