import { FORM_FX } from "./looks";
import { SKIP_AFTER, type GenLook, type Tier } from "./generated";

/**
 * Feature animations (12c): a feature you use (its action, its resource, its
 * on/off state) plays its class's look, bigger the later the class gives it.
 * Built on the generated spell framework (GenLook, GenSpell): same pieces,
 * title, tap to skip and reduced motion; no shake (that's for 7th-level spells
 * and up). Looks only: which feature was used is read from the derived sheet,
 * never decided here. Passive features play nothing.
 */

export type ClassKey =
  | "barbarian" | "bard" | "cleric" | "druid" | "fighter" | "monk" | "paladin" | "ranger" | "rogue" | "sorcerer" | "warlock" | "wizard" | "artificer"
  | "race" | "feat" | "other";

const CLASSES = ["barbarian", "bard", "cleric", "druid", "fighter", "monk", "paladin", "ranger", "rogue", "sorcerer", "warlock", "wizard", "artificer"] as const;

/** Colours (r, g, b) per class, the second for highlights. */
export const CLASS_COLOURS: Record<ClassKey, { rgb: string; rgb2: string }> = {
  barbarian: { rgb: "220, 50, 40", rgb2: "255, 160, 80" },
  bard: { rgb: "255, 120, 180", rgb2: "255, 215, 120" },
  cleric: { rgb: "255, 220, 120", rgb2: "255, 255, 240" },
  druid: { rgb: "110, 200, 90", rgb2: "200, 170, 100" },
  fighter: { rgb: "180, 200, 225", rgb2: "255, 255, 255" },
  monk: { rgb: "90, 220, 200", rgb2: "240, 255, 250" },
  paladin: { rgb: "255, 210, 110", rgb2: "150, 190, 255" },
  ranger: { rgb: "120, 190, 100", rgb2: "240, 190, 90" },
  rogue: { rgb: "160, 100, 230", rgb2: "60, 40, 90" },
  sorcerer: { rgb: "255, 90, 170", rgb2: "255, 170, 60" },
  warlock: { rgb: "150, 70, 220", rgb2: "120, 255, 170" },
  wizard: { rgb: "110, 150, 255", rgb2: "220, 230, 255" },
  artificer: { rgb: "240, 170, 80", rgb2: "140, 220, 255" },
  race: { rgb: "220, 210, 180", rgb2: "255, 240, 200" },
  feat: { rgb: "255, 190, 90", rgb2: "255, 240, 200" },
  other: { rgb: "190, 190, 220", rgb2: "240, 240, 255" },
};

export interface FeatureInfo {
  id: string;
  name: string;
  cls: ClassKey;
  /** The class level it comes at (race traits, feats and background: 1). */
  level: number;
}

/** "Fighter 3", "Battle Master (Fighter 3)", "Race (Elf)", "Feat (Lucky)", "Fighter 3 · Fighting Style" → class and level. */
export function originOf(origin: string | undefined): { cls: ClassKey; level: number } {
  const o = (origin ?? "").toLowerCase();
  const m = /\b([a-z]+) (\d{1,2})\b/.exec(o);
  if (m && (CLASSES as readonly string[]).includes(m[1]!)) return { cls: m[1] as ClassKey, level: Number(m[2]) };
  if (o.startsWith("race")) return { cls: "race", level: 1 };
  if (o.startsWith("feat")) return { cls: "feat", level: 1 };
  return { cls: "other", level: 1 };
}

/** 1st–2nd level: small; 3rd–5th; 6th–10th; 11th–16th the whole screen and a title; 17th–20th the biggest. */
export const featureTier = (level: number): Tier => (level <= 2 ? 0 : level <= 5 ? 1 : level <= 10 ? 2 : level <= 16 ? 3 : 4);
export const FEAT_MS: Record<Tier, number> = { 0: 650, 1: 900, 2: 1200, 3: 1700, 4: 2400 };
const BUZZ: Record<Tier, number[]> = { 0: [12], 1: [18, 25, 18], 2: [25, 35, 25], 3: [40, 40, 40, 40, 60], 4: [60, 40, 60, 40, 100, 50, 160] };
const PARTS: Record<Tier, number> = { 0: 6, 1: 9, 2: 12, 3: 18, 4: 24 };

/** The feature's look, as a generated effect with its class's emblem. */
export function featureLook(f: FeatureInfo): GenLook {
  const tier = featureTier(f.level);
  const c = CLASS_COLOURS[f.cls];
  const ms = FEAT_MS[tier];
  return {
    spell: f.id,
    name: f.name,
    phase: "cast",
    tier,
    level: f.level,
    up: 0,
    school: "arcane",
    shape: "motif",
    rgb: c.rgb,
    rgb2: c.rgb2,
    ms,
    at: tier >= 3 ? "center" : "tap",
    buzz: BUZZ[tier],
    particles: PARTS[tier],
    rings: 1 + tier,
    shake: 0,
    skippable: ms > SKIP_AFTER,
    sig: `cls-${f.cls}`,
    noSigil: true,
    label: f.name,
  };
}

/** What the lookup reads from the derived sheet (a small part of it). */
export interface FeatureSheet {
  actions: { id: string; name: string; featureId?: string; source: string; common?: boolean; toggles: string[]; cost?: { resource: string }; rollsSpell?: string; spells?: unknown[] }[];
  resources: { id: string; name: string; source: string }[];
  features: { id: string; name: string; origin?: string }[];
}

/**
 * Uses with their own look already (fx/triggers.ts, components/Fx.tsx): Flurry of Blows' afterimages, Way of
 * Mercy's hands, Rage's veins, the transformations' forms. They keep theirs and get nothing more.
 */
const OWN_LOOK = new Set(["flurry-of-blows", "hand-of-healing", "hand-of-harm"]);
const OWN_TOGGLES = new Set(["raging", ...Object.keys(FORM_FX)]);

/**
 * The feature a recorded use belongs to: useAction (its action), spendResource or usePool (the resource;
 * the action that spends it, or the resource's source), toggle on (the action that turns it on). Common
 * actions (Dash, Dodge), actions that roll or cast a spell (the spell plays its own look), "just activate"
 * and uses with their own look: undefined.
 */
export function featureFor(sheet: FeatureSheet | undefined, type: string, payload: unknown): FeatureInfo | undefined {
  if (!sheet) return undefined;
  const p = (payload ?? {}) as Record<string, unknown>;
  // Only the character's features, race traits and feats (an item's or a spell's use isn't one): by id, or by the
  // source's name (a resource names the feature it comes from). The name shown is the use's own (Action Surge).
  const byFeature = (key: string | undefined, name: string): FeatureInfo | undefined => {
    if (!key) return undefined;
    const f = sheet.features.find((x) => x.id === key) ?? sheet.features.find((x) => x.name === key);
    return f ? { id: f.id, name, ...originOf(f.origin) } : undefined;
  };
  const ofAction = (a: FeatureSheet["actions"][number] | undefined) => {
    if (!a || a.common || a.rollsSpell || a.spells?.length) return undefined;
    if (OWN_LOOK.has(a.id) || a.toggles.some((t) => OWN_TOGGLES.has(t))) return undefined;
    return byFeature(a.featureId ?? a.source, a.name);
  };
  if (type === "useAction" && typeof p.action === "string" && !p.free) return ofAction(sheet.actions.find((a) => a.id === p.action));
  if ((type === "spendResource" || type === "usePool") && typeof p.resource === "string") {
    const act = sheet.actions.find((a) => a.cost?.resource === p.resource);
    if (act) return ofAction(act);
    const r = sheet.resources.find((x) => x.id === p.resource);
    return r ? byFeature(r.source, r.name) : undefined;
  }
  if (type === "toggle" && p.on === true && typeof p.name === "string" && !OWN_TOGGLES.has(p.name)) return ofAction(sheet.actions.find((a) => a.toggles.includes(p.name as string)));
  return undefined;
}
