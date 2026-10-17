import type { ContentRegistry } from "@dnd/engine";
import { registerDiceTheme, type DiceTheme } from "./themes";

/**
 * Feature themes: a few presets (a feature's identity, not one look per
 * feature), and which features use them. A die is matched by keys:
 * - `name:<source>`: the name its dice come from in a roll ("Sneak Attack", "Second Wind");
 * - `resource:<id>`: the resource the option spends (every maneuver spends a superiority die);
 * - a trailing `*` matches the start ("resource:psionic-energy*").
 * Content can name a preset (or describe its own look) with `diceTheme` on an
 * action or a resource, so a new class feature, magic item or homebrew gets a
 * theme without touching the renderer (registerContentThemes).
 */
const preset = (id: string, label: string, t: Omit<DiceTheme, "id" | "label">): DiceTheme => ({ id: `feature-${id}`, label, ...t });

export const FEATURE_PRESETS: Record<string, DiceTheme> = {
  // Second Wind, Hit Dice: a warm, revitalising pulse.
  vital: preset("vital", "Revitalising", { material: "tc-radiant", color: "#c9822b", glow: 1, impact: "bloom", particles: "light", haptic: [12] }),
  // Psionic Energy dice: translucent psychic dice, mental-energy ripples.
  psionic: preset("psionic", "Psionic", { material: "tc-psychic", color: "#7048e8", glow: 2, impact: "ripple", particles: "motes", haptic: [10, 30, 10] }),
  // Superiority dice: polished martial steel, a decisive cut.
  martial: preset("martial", "Martial", { material: "tc-slashing", color: "#495057", glow: 0, impact: "cut", particles: "glints", haptic: [16] }),
  // Sneak Attack: shadow, a precise flash.
  shadow: preset("shadow", "Shadow", { material: "tc-necrotic", color: "#25262b", glow: 0, impact: "pin", particles: "smoke", haptic: [10] }),
  // Way of Mercy: healing and harm look different.
  "mercy-heal": preset("mercy-heal", "Hand of Healing", { material: "default", color: "#2f9e44", glow: 1, impact: "bloom", particles: "light", haptic: [12] }),
  "mercy-harm": preset("mercy-harm", "Hand of Harm", { material: "tc-necrotic", color: "#5f3dc4", glow: 1, impact: "drain", particles: "smoke", haptic: [20] }),
  // Channel Divinity, Divine Smite, Divine Strike: divine light.
  divine: preset("divine", "Divine", { material: "tc-radiant", color: "#d4a017", glow: 2, impact: "pulse", particles: "light", haptic: [16] }),
  // Rage: your own dice while raging, forceful, a red pulse.
  rage: preset("rage", "Rage", { material: "tc-bludgeoning", color: "#a51111", glow: 1, impact: "pulse", particles: "embers", haptic: [30] }),
  // Bardic Inspiration.
  inspiration: preset("inspiration", "Inspiration", { material: "tc-psychic", color: "#d6336c", glow: 1, impact: "ripple", particles: "motes", haptic: [10] }),
  // Death saves: restrained and quick, nothing to wait for.
  death: preset("death", "Death save", { material: "default", color: "#495057", glow: 0, haptic: [40] }),
};

/** Built-in assignments (more come from content: registerContentThemes). */
export const FEATURE_ASSIGNMENTS: [key: string, preset: keyof typeof FEATURE_PRESETS][] = [
  ["name:Sneak Attack", "shadow"],
  ["name:Psionic Strike", "psionic"],
  ["resource:psionic-energy*", "psionic"],
  ["resource:superiority-dice*", "martial"],
  ["resource:martial-adept-superiority", "martial"],
  ["name:Hand of Healing", "mercy-heal"],
  ["name:Hand of Harm", "mercy-harm"],
  ["name:Divine Strike", "divine"],
  ["name:Divine Smite", "divine"],
  ["name:Improved Divine Smite", "divine"],
  ["name:Divine Fury", "divine"],
  ["name:Divine Favor (radiant)", "divine"],
  ["name:Channel Divinity*", "divine"],
  ["name:Second Wind", "vital"],
  ["name:Hit Die", "vital"],
  ["name:Bardic Inspiration", "inspiration"],
  ["name:Death saving throw", "death"],
  ["state:raging", "rage"],
];

let registered = false;
export function registerFeatureThemes(): void {
  if (registered) return;
  registered = true;
  for (const [key, p] of FEATURE_ASSIGNMENTS) registerDiceTheme(key, FEATURE_PRESETS[p]!);
}

/** A content `diceTheme`: a preset's name, or a look of its own (built on a preset or the classic dice). */
export type DiceThemeSpec = string | { preset?: string; color?: string; material?: string; impact?: string; particles?: string; glow?: 0 | 1 | 2 };

export function themeFromSpec(spec: DiceThemeSpec, id: string, label: string): DiceTheme | undefined {
  if (typeof spec === "string") return FEATURE_PRESETS[spec];
  const base = (spec.preset && FEATURE_PRESETS[spec.preset]) || { id, label, material: "default", color: "#c8902e", glow: 0 as const };
  return {
    ...base,
    id: `content-${id}`,
    label,
    ...(spec.color && /^#[0-9a-f]{6}$/i.test(spec.color) ? { color: spec.color } : {}),
    ...(spec.material ? { material: spec.material } : {}),
    ...(spec.impact ? { impact: spec.impact } : {}),
    ...(spec.particles ? { particles: spec.particles } : {}),
    ...(spec.glow !== undefined ? { glow: spec.glow } : {}),
  };
}

/** Actions and resources in the content (the table's, the books', homebrew) that name a dice theme. */
export function registerContentThemes(reg: ContentRegistry): number {
  let n = 0;
  for (const kind of ["feature", "feat", "item"] as const) {
    for (const def of reg.list(kind)) {
      const g = (def as { grant?: { actions?: { id: string; name: string; diceTheme?: DiceThemeSpec }[]; resources?: { id: string; name: string; diceTheme?: DiceThemeSpec }[] } }).grant;
      for (const a of g?.actions ?? []) {
        const t = a.diceTheme && themeFromSpec(a.diceTheme, a.id, a.name);
        if (t) (registerDiceTheme(`name:${a.name}`, t), n++);
      }
      for (const r of g?.resources ?? []) {
        const t = r.diceTheme && themeFromSpec(r.diceTheme, r.id, r.name);
        if (t) (registerDiceTheme(`resource:${r.id}`, t), n++);
      }
    }
  }
  return n;
}
