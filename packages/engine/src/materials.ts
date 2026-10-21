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

export interface CopyCost {
  gp: number;
  /** Time it takes, in minutes. */
  minutes: number;
  /** Why it's half (the school's Savant feature). */
  savant?: string;
  /** Why it's quick (the Order of Scribes' Wizardly Quill). */
  quill?: string;
}

/**
 * Copying a spell into the spellbook (PHB p. 114): 2 hours and 50 gp per
 * spell level; your school's Savant feature halves both; the Wizardly Quill
 * (Order of Scribes) makes it 2 minutes per level, the gold unchanged.
 */
export function copyCost(c: Character, reg: ContentRegistry, spellId: string): CopyCost | undefined {
  const sp = reg.find(spellId, "spell");
  if (!sp || sp.level === 0) return undefined;
  let gp = 50 * sp.level;
  let minutes = 120 * sp.level;
  const out: CopyCost = { gp, minutes };
  const wiz = c.classes.find((x) => x.class === "class:wizard");
  const sub = wiz?.subclass ? reg.find(wiz.subclass, "subclass") : undefined;
  const school = sp.school.toLowerCase();
  if (sub && wiz) {
    const names = sub.features.filter((f) => f.level <= wiz.level).map((f) => reg.find(f.feature, "feature")?.name ?? "");
    const savant = names.find((n) => new RegExp(`^${school} savant$`, "i").test(n));
    const byName = new RegExp(`\\b${school}\\b`, "i").test(sub.name) && wiz.level >= 2;
    if (savant || byName) {
      gp /= 2;
      minutes /= 2;
      out.savant = savant || `${sub.name}: half for ${school} spells`;
    }
    const quill = names.find((n) => /^wizardly quill$/i.test(n));
    if (quill) {
      minutes = 2 * sp.level;
      out.quill = quill;
    }
  }
  out.gp = gp;
  out.minutes = minutes;
  return out;
}

/** A backup of the spellbook (PHB p. 114): 1 hour and 10 gp per level of each spell in it. */
export function backupCost(c: Character, reg: ContentRegistry, list = "wizard"): { gp: number; minutes: number; spells: number } {
  let levels = 0;
  let spells = 0;
  for (const x of c.spells) {
    if (x.list !== list || x.notInBook) continue;
    const lvl = reg.find(x.spell, "spell")?.level ?? 0;
    if (lvl < 1) continue;
    levels += lvl;
    spells += 1;
  }
  return { gp: 10 * levels, minutes: 60 * levels, spells };
}
