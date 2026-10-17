import { useEffect, useState } from "react";

/**
 * The player's dice-look choices on this device (looks only, never what's
 * rolled), with sensible defaults so nothing needs setting:
 * - the material of their own dice (the classic one until they pick another);
 * - damage-type looks and feature looks (both on).
 */
const KEYS = { material: "dnd-dice-material", damage: "dnd-dice-damage-themes", feature: "dnd-dice-feature-themes" } as const;
const EVENT = "dnd-dice-prefs";

/** Materials for your own dice, by name: the classic one and a few of the damage types' surfaces. */
export const OWN_MATERIALS: { id: string; label: string }[] = [
  { id: "default", label: "Classic" },
  { id: "tc-bludgeoning", label: "Stone" },
  { id: "tc-slashing", label: "Steel" },
  { id: "tc-cold", label: "Crystal" },
  { id: "tc-fire", label: "Ember" },
  { id: "tc-radiant", label: "Pearl" },
  { id: "tc-necrotic", label: "Shadow" },
  { id: "tc-force", label: "Arcane" },
];

const read = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
const write = (key: string, v: string | null) => {
  try {
    if (v === null) localStorage.removeItem(key);
    else localStorage.setItem(key, v);
  } catch {
    // Storage not available: it lasts for this visit only.
  }
  if (typeof window !== "undefined") window.dispatchEvent(new Event(EVENT));
};
const memory: { material?: string; damage?: boolean; feature?: boolean } = {};

export function ownMaterial(): string {
  const v = memory.material ?? read(KEYS.material);
  return v && OWN_MATERIALS.some((m) => m.id === v) ? v : "default";
}
export function setOwnMaterial(id: string) {
  memory.material = id;
  write(KEYS.material, id === "default" ? null : id);
}
export function damageThemesOn(): boolean {
  return memory.damage ?? read(KEYS.damage) !== "0";
}
export function featureThemesOn(): boolean {
  return memory.feature ?? read(KEYS.feature) !== "0";
}
export function setThemesOn(kind: "damage" | "feature", on: boolean) {
  memory[kind] = on;
  write(KEYS[kind], on ? null : "0");
}

/** All three, kept current. */
export function useDicePrefs() {
  const get = () => ({ material: ownMaterial(), damage: damageThemesOn(), feature: featureThemesOn() });
  const [v, setV] = useState(get);
  useEffect(() => {
    const h = () => setV(get());
    window.addEventListener(EVENT, h);
    return () => window.removeEventListener(EVENT, h);
  }, []);
  return v;
}
