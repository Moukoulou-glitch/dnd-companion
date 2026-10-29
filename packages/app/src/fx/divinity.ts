/**
 * Channel Divinity and heritage looks. Each Channel Divinity option has its own: a holy sigil in its colours,
 * its symbol in the middle, and a motion of its own (light pushing out, leaves, sparks, shadow...).
 * Destructive Wrath and Preserve Life have hand-made ones (FxLayer: fx-wrath, fx-preserve).
 */

/** How the pieces move: "repel" rings pushing out, "rays" from the centre, "rise" motes going up, "fall" ash coming down,
 * "leaves" drifting, "sparks" flying, "smoke" spreading low, "ripple" rings out from the eye, "reticle" closing in,
 * "mirror" a second sigil sliding off, "stars" twinkling, "converge" motes drawn in. */
export type CdMotion = "repel" | "rays" | "rise" | "fall" | "leaves" | "sparks" | "smoke" | "ripple" | "reticle" | "mirror" | "stars" | "converge";
export type CdGlyph = "sun" | "book" | "eye" | "leaf" | "mask" | "moon" | "sword" | "shield" | "hammer" | "skull" | "scales" | "heart" | "star" | "crown" | "chain" | "target" | "laurel" | "hourglass";

export interface CdLook {
  name: string;
  /** Two colours as "r, g, b": the light, and the glow. */
  c1: string;
  c2: string;
  glyph: CdGlyph;
  motion: CdMotion;
}

const look = (name: string, c1: string, c2: string, glyph: CdGlyph, motion: CdMotion): CdLook => ({ name, c1, c2, glyph, motion });

/** By action id. */
export const CD_LOOKS: Record<string, CdLook> = {
  // Cleric
  "turn-undead": look("Turn Undead", "255, 244, 200", "255, 200, 90", "sun", "repel"),
  "knowledge-of-the-ages": look("Knowledge of the Ages", "220, 236, 255", "110, 160, 255", "book", "rise"),
  "read-thoughts": look("Read Thoughts", "236, 220, 255", "170, 110, 255", "eye", "ripple"),
  "radiance-of-the-dawn": look("Radiance of the Dawn", "255, 236, 210", "255, 150, 110", "sun", "rays"),
  "charm-animals-and-plants": look("Charm Animals and Plants", "220, 255, 210", "90, 190, 90", "leaf", "leaves"),
  "invoke-duplicity": look("Invoke Duplicity", "220, 250, 245", "150, 90, 220", "mask", "mirror"),
  "cloak-of-shadows": look("Cloak of Shadows", "200, 190, 240", "60, 40, 110", "moon", "smoke"),
  "guided-strike": look("Guided Strike", "255, 235, 200", "230, 90, 60", "target", "reticle"),
  "war-gods-blessing": look("War God's Blessing", "255, 225, 200", "200, 50, 50", "shield", "reticle"),
  "artisans-blessing": look("Artisan's Blessing", "255, 230, 190", "255, 130, 40", "hammer", "sparks"),
  "path-to-the-grave": look("Path to the Grave", "225, 220, 235", "120, 100, 140", "skull", "fall"),
  "orders-demand": look("Order's Demand", "235, 235, 255", "90, 110, 230", "scales", "repel"),
  "balm-of-peace": look("Balm of Peace", "235, 255, 250", "120, 220, 200", "heart", "rise"),
  "twilight-sanctuary": look("Twilight Sanctuary", "255, 225, 200", "150, 90, 200", "moon", "stars"),
  "harness-divine-power": look("Harness Divine Power", "255, 250, 230", "255, 210, 120", "star", "converge"),
  // Paladin
  "sacred-weapon": look("Sacred Weapon", "255, 248, 220", "255, 215, 110", "sword", "rays"),
  "turn-the-unholy": look("Turn the Unholy", "255, 250, 235", "255, 230, 160", "sun", "repel"),
  "natures-wrath": look("Nature's Wrath", "215, 245, 200", "70, 140, 60", "leaf", "leaves"),
  "turn-the-faithless": look("Turn the Faithless", "235, 255, 215", "150, 210, 90", "star", "repel"),
  "abjure-enemy": look("Abjure Enemy", "255, 215, 210", "150, 30, 40", "chain", "ripple"),
  "vow-of-enmity": look("Vow of Enmity", "255, 205, 195", "190, 20, 30", "target", "reticle"),
  "conquering-presence": look("Conquering Presence", "230, 220, 220", "120, 20, 30", "crown", "smoke"),
  "guided-strike-paladin": look("Guided Strike", "240, 225, 225", "150, 40, 50", "sword", "reticle"),
  "emissary-of-peace": look("Emissary of Peace", "235, 245, 255", "140, 190, 255", "heart", "rise"),
  "rebuke-the-violent": look("Rebuke the Violent", "255, 240, 235", "240, 90, 80", "scales", "rays"),
  "peerless-athlete": look("Peerless Athlete", "255, 240, 210", "220, 160, 60", "laurel", "sparks"),
  "inspiring-smite": look("Inspiring Smite", "255, 245, 215", "240, 190, 70", "laurel", "rise"),
  "watchers-will": look("Watcher's Will", "225, 240, 255", "120, 170, 220", "eye", "ripple"),
  "abjure-the-extraplanar": look("Abjure the Extraplanar", "235, 230, 255", "160, 140, 240", "star", "repel"),
};

/** The symbols, as SVG paths in a 100 × 100 box (simple shapes: they're drawn as light). */
export const GLYPHS: Record<CdGlyph, string> = {
  sun: "M50 30a20 20 0 1 0 0.1 0Z M50 6v14 M50 80v14 M6 50h14 M80 50h14 M19 19l10 10 M71 71l10 10 M81 19l-10 10 M29 71l-10 10",
  book: "M50 28C38 22 24 22 14 26v50c10-4 24-4 36 2c12-6 26-6 36-2V26c-10-4-24-4-36 2Z M50 28v50",
  eye: "M8 50C24 26 76 26 92 50C76 74 24 74 8 50Z M50 38a12 12 0 1 0 0.1 0Z",
  leaf: "M20 80C20 40 46 18 84 16C82 54 60 80 20 80Z M20 80L64 36",
  mask: "M14 24c24 8 48 8 72 0c0 34-10 56-36 60C24 80 14 58 14 24Z M30 44h12 M58 44h12 M38 64c8 6 16 6 24 0",
  moon: "M64 12A38 38 0 1 0 88 66A30 30 0 1 1 64 12Z",
  sword: "M50 6l8 14v50H42V20Z M30 70h40 M50 70v16 M44 92h12",
  shield: "M50 8l34 12v26c0 24-16 40-34 48C32 86 16 70 16 46V20Z M50 24v52 M30 44h40",
  hammer: "M24 22h44v20H24Z M68 28h10v8H68 M42 42v46h8V42",
  skull: "M50 12c-22 0-34 14-34 34c0 12 6 20 14 24v12h40V70c8-4 14-12 14-24c0-20-12-34-34-34Z M36 48a7 7 0 1 0 0.1 0Z M64 48a7 7 0 1 0 0.1 0Z M42 82v-8 M50 82v-8 M58 82v-8",
  scales: "M50 10v76 M30 86h40 M18 26h64 M18 26L8 54h20Z M82 26L72 54h20Z M8 54c4 8 16 8 20 0 M72 54c4 8 16 8 20 0",
  heart: "M50 86C20 64 10 46 10 32c0-12 10-20 20-20c8 0 16 6 20 14c4-8 12-14 20-14c10 0 20 8 20 20c0 14-10 32-40 54Z",
  star: "M50 8l11 30h31l-25 19l10 31l-27-19l-27 19l10-31L8 38h31Z",
  crown: "M14 74L10 30l22 18L50 18l18 30l22-18l-4 44Z M14 84h72",
  chain: "M18 50a14 14 0 0 1 14-14h14a14 14 0 0 1 0 28H32a14 14 0 0 1-14-14Z M40 50a14 14 0 0 1 14-14h14a14 14 0 0 1 0 28H54a14 14 0 0 1-14-14Z",
  target: "M50 14a36 36 0 1 0 0.1 0Z M50 30a20 20 0 1 0 0.1 0Z M50 46a4 4 0 1 0 0.1 0Z M50 2v16 M50 82v16 M2 50h16 M82 50h16",
  laurel: "M50 90C26 78 16 54 22 24 M50 90C74 78 84 54 78 24 M22 34c8 0 12 4 14 10 M20 50c8 0 12 4 14 10 M26 66c8 0 10 4 12 10 M78 34c-8 0-12 4-14 10 M80 50c-8 0-12 4-14 10 M74 66c-8 0-10 4-12 10",
  hourglass: "M26 10h48 M26 90h48 M30 10c0 22 20 28 20 40c0 12-20 18-20 40 M70 10c0 22-20 28-20 40c0 12 20 18 20 40",
};

/** Heritage features (the table's homebrew, from 10th level): their looks, by race. */
export interface HeritageLook {
  name: string;
  /** "stone" Thinking Stone's runes, "ascend" Human Above All, "seasons" Unbridled Seasons' wheel, "adama" two wholes. */
  motif: "stone" | "ascend" | "seasons" | "adama";
}
export const HERITAGE_LOOKS: Record<string, HeritageLook> = {
  "race:rock-gnome": { name: "Thinking Stone", motif: "stone" },
  "race:variant-human": { name: "Human Above All", motif: "ascend" },
  "race:eladrin": { name: "Unbridled Seasons", motif: "seasons" },
  "race:half-elf": { name: "Adama", motif: "adama" },
};
/** The character level heritage features come at. */
export const HERITAGE_LEVEL = 10;
