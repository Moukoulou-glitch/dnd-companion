import type { Character } from "@dnd/schema";
import type { ContentRegistry } from "./registry.js";

/**
 * A material component a focus or component pouch can't replace (PHB p. 203):
 * one with a cost given, or one the spell consumes.
 */
export function materialNeed(material: string | undefined): { costly: boolean; consumed: boolean } | undefined {
  if (!material) return undefined;
  const costly = /\d[\d,]*\s*gp\b/i.test(material);
  const consumed = /\bconsume[sd]?\b/i.test(material);
  return costly || consumed ? { costly, consumed } : undefined;
}

/**
 * Gold to copy a spell into a wizard's spellbook: 50 gp per spell level
 * (PHB p. 114), halved for the school a "Savant" feature names (School of
 * Evocation: evocation spells). Cantrips aren't copied.
 */
export function copyCost(c: Character, reg: ContentRegistry, spellId: string): { gp: number; savant?: string } | undefined {
  const sp = reg.find(spellId, "spell");
  if (!sp || sp.level === 0) return undefined;
  const full = 50 * sp.level;
  const wiz = c.classes.find((x) => x.class === "class:wizard");
  const sub = wiz?.subclass ? reg.find(wiz.subclass, "subclass") : undefined;
  const school = sp.school.toLowerCase();
  if (sub && wiz) {
    const savant = sub.features
      .filter((f) => f.level <= wiz.level)
      .map((f) => reg.find(f.feature, "feature")?.name ?? "")
      .find((n) => new RegExp(`^${school} savant$`, "i").test(n));
    const byName = new RegExp(`\\b${school}\\b`, "i").test(sub.name) && wiz.level >= 2;
    if (savant || byName) return { gp: full / 2, savant: savant || `${sub.name}: half for ${school} spells` };
  }
  return { gp: full };
}
