import type { DiceTheme } from "../dice/themes";

/**
 * Sentient weapons: their own dice for their attacks and damage, and a look (with a line in their voice) on a hit,
 * a critical hit or a miss, from their personality. Keyed by the item's id, the app's own or a loaded book's.
 */
export type SentientMotif = "whelm" | "wave" | "blackrazor" | "moonblade" | "kas" | "orcus";

export interface SentientWeapon {
  name: string;
  motif: SentientMotif;
  dice: Omit<DiceTheme, "id" | "label">;
  /** What it says (or does) on a hit, a critical hit and a miss: our own words, from its personality. */
  lines: { hit: string; crit: string; miss: string };
  /** The colour of its words. */
  ink: string;
}

export const SENTIENT_WEAPONS: Record<string, SentientWeapon> = {
  // Dwarven, hates giants and goblinoids, shouts battle cries: stone and a war cry.
  "item:whelm": {
    name: "Whelm",
    motif: "whelm",
    dice: { material: "tc-bludgeoning", color: "#7a4e24", glow: 1, impact: "thud", particles: "dust", haptic: [40] },
    lines: { hit: "Whelm bellows a Dwarvish war cry!", crit: "Whelm's war cry shakes the stone!", miss: "Whelm grumbles in Dwarvish." },
    ink: "#ffd29a",
  },
  // Devoted to the sea gods, hums chanteys and hymns: tide, ripples and a tune.
  "item:wave": {
    name: "Wave",
    motif: "wave",
    dice: { material: "tc-cold", color: "#13608f", glow: 1, impact: "ripple", particles: "droplets", haptic: [12, 30, 12] },
    lines: { hit: "Wave hums a sea chantey.", crit: "Wave sings a hymn to the deep!", miss: "Wave sighs like the ebbing tide." },
    ink: "#b5ecff",
  },
  // A shard of starry night that devours souls, imperious and nihilist: a void with stars.
  "item:blackrazor": {
    name: "Blackrazor",
    motif: "blackrazor",
    dice: { material: "tc-necrotic", color: "#170f2e", glow: 2, impact: "drain", particles: "smoke", haptic: [20, 40, 20] },
    lines: { hit: "Blackrazor tastes the soul. More.", crit: "Blackrazor: “Feed me!”", miss: "Blackrazor hungers." },
    ink: "#d9c8ff",
  },
  // Elven, moonlight, courage, beauty and music; speaks through a tingle in the hand: silver light.
  "item:moonblade": {
    name: "Moonblade",
    motif: "moonblade",
    dice: { material: "tc-radiant", color: "#5b6f9e", glow: 2, impact: "bloom", particles: "light", haptic: [10, 20, 10] },
    lines: { hit: "The moonblade tingles in your hand.", crit: "The moonblade blazes with moonlight!", miss: "The moonblade waits, patient." },
    ink: "#e6ecff",
  },
  // Kas's bloodthirsty blade: crimson and dark flame.
  "item:sword-of-kas": {
    name: "Sword of Kas",
    motif: "kas",
    dice: { material: "tc-slashing", color: "#7d0a12", glow: 1, impact: "cut", particles: "embers", haptic: [30] },
    lines: { hit: "The Sword of Kas drinks deep.", crit: "The sword screams for more blood!", miss: "The sword seethes." },
    ink: "#ffb3b3",
  },
  // The demon prince of undeath's wand: grave-green smoke and a skull's glare.
  "item:wand-of-orcus": {
    name: "Wand of Orcus",
    motif: "orcus",
    dice: { material: "tc-necrotic", color: "#2f4a1f", glow: 1, impact: "drain", particles: "vapour", haptic: [25] },
    lines: { hit: "The wand whispers of death.", crit: "Orcus laughs through the wand!", miss: "The wand mutters curses." },
    ink: "#c8f5a0",
  },
};

/** The sentient weapon an attack is made with, by its item id. */
export const sentientOf = (attackId: string | undefined): SentientWeapon | undefined => (attackId ? SENTIENT_WEAPONS[attackId] : undefined);

/** The dice-theme key for a sentient weapon's own dice. */
export const sentientDiceKey = (attackId: string) => `weapon:${attackId}`;
