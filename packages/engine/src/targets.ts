import type { Character } from "@dnd/schema";
import type { ContentRegistry } from "./registry.js";
import type { DerivedSheet } from "./derive.js";
import { summonHpBonus } from "./shapes.js";

/**
 * Who a spell or feature can be used on, as its rules say. The app warns when
 * a pick doesn't fit and never blocks it (the DM may rule otherwise).
 */
export interface TargetRule {
  /** Creature types it does nothing to (Cure Wounds: undead and constructs). */
  notTypes?: string[];
  /** It must hear you (Bardic Inspiration). */
  hear?: boolean;
  /** It must understand you. */
  understand?: boolean;
  /** It must be willing (Haste, Polymorph on a friend). */
  willing?: boolean;
  /** Not on yourself (Bardic Inspiration). */
  notSelf?: boolean;
  /** How many creatures at most (Mass Healing Word: 6); 1 when left out. */
  max?: number;
}

const LIVING = ["undead", "construct"];

/** Spells, by id. */
export const SPELL_TARGETS: Record<string, TargetRule> = {
  "spell:cure-wounds": { notTypes: LIVING },
  "spell:healing-word": { notTypes: LIVING },
  "spell:mass-cure-wounds": { notTypes: LIVING, max: 6 },
  "spell:mass-healing-word": { notTypes: LIVING, max: 6 },
  "spell:prayer-of-healing": { notTypes: LIVING, max: 6 },
  "spell:mass-heal": { notTypes: LIVING, max: 99 },
  "spell:healing-spirit": { notTypes: LIVING, max: 99 },
  "spell:heal": {},
  "spell:regenerate": {},
  "spell:aid": { max: 3 },
  "spell:bless": { max: 3 },
  "spell:beacon-of-hope": { max: 99 },
  "spell:haste": { willing: true },
  "spell:fly": { willing: true, max: 9 },
  "spell:mage-armor": { willing: true },
  "spell:polymorph": { willing: true },
  "spell:true-polymorph": { willing: true },
  "spell:enlarge-reduce": { willing: true },
  "spell:protection-from-energy": { willing: true },
  "spell:protection-from-evil-and-good": { willing: true },
  "spell:stoneskin": { willing: true },
  "spell:foresight": { willing: true },
  "spell:mind-blank": { willing: true },
  "spell:barkskin": { willing: true },
  "spell:warding-bond": { willing: true },
  "spell:darkvision": { willing: true },
  "spell:water-breathing": { willing: true, max: 10 },
  "spell:resistance": { willing: true },
  "spell:guidance": { willing: true },
  "spell:heroism": { willing: true },
  "spell:longstrider": {},
  "spell:jump": {},
  "spell:death-ward": {},
  "spell:freedom-of-movement": {},
  "spell:greater-invisibility": {},
  "spell:invisibility": {},
  "spell:shield-of-faith": {},
  "spell:fizbans-platinum-shield": {},
};

/** Features' actions, by action id. */
export const ACTION_TARGETS: Record<string, TargetRule> = {
  "bardic-inspiration": { hear: true, notSelf: true },
  "lay-on-hands": { notTypes: LIVING },
  "healing-hands": {},
};

/** Someone a spell or feature can be used on: you, a companion, a summoned creature. */
export interface FriendlyTarget {
  /** "me", the companion's id, or "summon:<id>". */
  id: string;
  kind: "me" | "companion" | "summon";
  name: string;
  /** Its creature type, lower case ("humanoid", "dragon", "undead"). */
  type: string;
  /** Conditions and effects on it, by id ("condition:deafened"). */
  effects: string[];
  languages?: string;
  hp: number;
  max: number;
}

const typeOf = (t: string | undefined) => (t ?? "humanoid").toLowerCase().replace(/\s*\(.*$/, "").trim();

/** You, your companions out now, and the creatures you summoned that still stand. */
export function friendlyTargets(c: Character, sheet: DerivedSheet, reg: ContentRegistry): FriendlyTarget[] {
  const out: FriendlyTarget[] = [];
  const shape = c.shape ? reg.find(c.shape.creature, "creature") : undefined;
  const race = reg.find(c.race, "race");
  out.push({
    id: "me",
    kind: "me",
    name: c.name,
    type: typeOf(shape?.type ?? c.creatureType ?? race?.creatureType),
    effects: [...c.effects.map((e) => reg.effectId(e.effect)), ...(c.hp.current === 0 ? ["condition:unconscious"] : [])],
    hp: c.hp.current,
    max: sheet.hpMax.total,
  });
  for (const comp of sheet.companions) {
    if (!comp.form || comp.away || (comp.summonedBy && !comp.summonedBy.out)) continue;
    out.push({
      id: comp.id,
      kind: "companion",
      name: comp.name,
      type: typeOf(comp.form.type),
      effects: comp.effects.map((e) => reg.effectId(e.effect)),
      ...(comp.form.languages ? { languages: comp.form.languages } : {}),
      hp: comp.form.hp.current,
      max: comp.form.hpMax.total,
    });
  }
  for (const m of c.summons) {
    const def = reg.find(m.creature, "creature");
    if (!def || m.hp <= 0) continue;
    out.push({
      id: `summon:${m.id}`,
      kind: "summon",
      name: m.name ?? def.name,
      type: typeOf(def.type),
      effects: (m.effects ?? []).map((e) => reg.effectId(e.effect)),
      ...(def.languages ? { languages: def.languages } : {}),
      hp: m.hp,
      max: (def.hp ?? m.hp) + summonHpBonus(m, reg),
    });
  }
  return out;
}

const TYPE_NAMES: Record<string, string> = { undead: "undead", construct: "constructs" };

/** Why a pick may not work, in words ("Cure Wounds has no effect on undead"); empty when it fits. */
export function targetWarnings(t: FriendlyTarget, rule: TargetRule | undefined, what: string): string[] {
  if (!rule) return [];
  const out: string[] = [];
  if (rule.notSelf && t.kind === "me") out.push(`${what} is for someone other than you.`);
  if (rule.notTypes?.includes(t.type)) out.push(`${what} has no effect on ${TYPE_NAMES[t.type] ?? t.type}: ${t.name} is ${/^[aeiou]/.test(t.type) ? "an" : "a"} ${t.type}.`);
  const has = (id: string) => t.effects.includes(id);
  if (rule.hear && (has("condition:deafened") || has("condition:unconscious"))) out.push(`${t.name} must be able to hear you, and is ${has("condition:deafened") ? "deafened" : "unconscious"}.`);
  if (rule.understand && t.kind !== "me" && (!t.languages || /^[—–-]$/.test(t.languages.trim()) || /^none$/i.test(t.languages.trim())))
    out.push(`${t.name} must understand you, and has no language listed.`);
  if (rule.willing && t.kind !== "me" && (has("condition:unconscious") || has("condition:charmed")))
    out.push(`${t.name} must be willing, and is ${has("condition:unconscious") ? "unconscious" : "charmed"}: your DM's call.`);
  if (t.hp === 0 && t.kind !== "me") out.push(`${t.name} is at 0 hit points: healing a summoned creature or a companion doesn't bring it back.`);
  return out;
}
