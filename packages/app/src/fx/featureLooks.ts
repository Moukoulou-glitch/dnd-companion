import type { CdGlyph, CdMotion } from "./divinity";

/**
 * Class and subclass features with a look of their own (22k): a sigil in the feature's colours, its symbol,
 * and a motion, drawn by the Channel Divinity stage (FxLayer) and made grander by the level the feature comes
 * at: from 17th level a veil, a pillar of light, an outer ring of runes, a shockwave and a shake; 14th–16th
 * the rings and more light; lower levels smaller and quicker. Features are added here in batches, highest
 * levels first; any not here still play their class's generated look (fx/features.ts).
 */
export interface FeatLook {
  name: string;
  /** The class, and subclass if any, shown under the name. */
  from: string;
  /** The class level it comes at: picks how grand it is. */
  level: number;
  c1: string;
  c2: string;
  glyph: CdGlyph;
  motion: CdMotion;
  /** The class it belongs to, for `grows` and `alt`. */
  cls?: string;
  /** A feature that grows later (Protective Bond into Expansive Bond at 17th): from that class level, this level and line. */
  grows?: { level: number; from: string };
  /** The same action from another class's feature (the Ascendant Dragon monk's Draconic Presence, 3rd level). */
  alt?: { cls: string; level: number; from: string };
}

/** The level and line a character's use shows: grown, or another class's version of the same action. */
export function featFor(l: FeatLook, classes: { class: string; level: number }[] | undefined): { level: number; from: string } {
  const lv = (cls?: string) => (cls ? classes?.find((x) => x.class === cls)?.level : undefined);
  if (l.alt && lv(l.alt.cls) !== undefined && lv(l.cls) === undefined) return { level: l.alt.level, from: l.alt.from };
  if (l.grows && (lv(l.cls) ?? 0) >= l.grows.level) return { level: l.grows.level, from: l.grows.from };
  return { level: l.level, from: l.from };
}

const f = (name: string, from: string, level: number, c1: string, c2: string, glyph: CdGlyph, motion: CdMotion): FeatLook => ({ name, from, level, c1, c2, glyph, motion });

/** 0 (1st–5th) to 4 (17th–20th). */
export const featTier = (level: number): 0 | 1 | 2 | 3 | 4 => (level >= 17 ? 4 : level >= 14 ? 3 : level >= 10 ? 2 : level >= 6 ? 1 : 0);
export const FEAT_LOOK_MS = [1400, 1800, 2200, 2600, 3200] as const;

/** By action id. */
export const FEAT_LOOKS: Record<string, FeatLook> = {
  // 20th level
  "stroke-of-luck": f("Stroke of Luck", "Rogue 20", 20, "255, 220, 130", "110, 210, 140", "coin", "sparks"),
  "eldritch-master": f("Eldritch Master", "Warlock 20", 20, "200, 140, 255", "110, 255, 170", "eye", "converge"),
  "holy-nimbus": f("Holy Nimbus", "Paladin 20 · Oath of Devotion", 20, "255, 250, 225", "255, 210, 110", "sun", "rays"),
  "invincible-conqueror": f("Invincible Conqueror", "Paladin 20 · Oath of Conquest", 20, "255, 120, 110", "150, 0, 20", "crown", "repel"),
  "living-legend": f("Living Legend", "Paladin 20 · Oath of Glory", 20, "255, 225, 140", "255, 150, 60", "laurel", "rise"),
  "emissary-of-redemption": f("Emissary of Redemption", "Paladin 20 · Oath of Redemption", 20, "225, 240, 255", "140, 200, 255", "scales", "ripple"),
  "elder-champion": f("Elder Champion", "Paladin 20 · Oath of the Ancients", 20, "200, 255, 170", "80, 190, 90", "leaf", "leaves"),
  "mortal-bulwark": f("Mortal Bulwark", "Paladin 20 · Oath of the Watchers", 20, "225, 232, 255", "110, 130, 255", "eye", "reticle"),
  "avenging-angel": f("Avenging Angel", "Paladin 20 · Oath of Vengeance", 20, "255, 240, 240", "200, 40, 70", "wings", "fall"),
  // 18th level
  "empty-body": f("Empty Body", "Monk 18", 18, "210, 240, 255", "110, 150, 200", "mask", "smoke"),
  "warping-implosion": f("Warping Implosion", "Sorcerer 18 · Aberrant Mind", 18, "210, 130, 255", "60, 220, 180", "vortex", "converge"),
  "warping-implosion-points": f("Warping Implosion", "Sorcerer 18 · Aberrant Mind", 18, "210, 130, 255", "60, 220, 180", "vortex", "converge"),
  "clockwork-cavalcade": f("Clockwork Cavalcade", "Sorcerer 18 · Clockwork Soul", 18, "255, 225, 150", "110, 190, 255", "gear", "rays"),
  "clockwork-cavalcade-points": f("Clockwork Cavalcade", "Sorcerer 18 · Clockwork Soul", 18, "255, 225, 150", "110, 190, 255", "gear", "rays"),
  "unearthly-recovery": f("Unearthly Recovery", "Sorcerer 18 · Divine Soul", 18, "255, 250, 235", "255, 205, 120", "heart", "rise"),
  "draconic-presence": { ...f("Draconic Presence", "Sorcerer 18 · Draconic Bloodline", 18, "255, 150, 90", "200, 40, 30", "wings", "repel"), cls: "class:sorcerer", alt: { cls: "class:monk", level: 3, from: "Monk 3 · Way of the Ascendant Dragon" } },
  "improved-war-magic": f("Improved War Magic", "Fighter 18 · Eldritch Knight", 18, "185, 205, 255", "140, 90, 255", "sword", "sparks"),
  "telekinetic-master-attack": f("Telekinetic Master", "Fighter 18 · Psi Warrior", 18, "165, 225, 255", "110, 90, 255", "fist", "ripple"),
  "giants-might": { ...f("Giant's Might", "Fighter 3 · Rune Knight", 3, "255, 195, 120", "150, 95, 60", "rune", "repel"), cls: "class:fighter", grows: { level: 18, from: "Fighter 18 · Rune Knight (Runic Juggernaut)" } },
  "strength-before-death": f("Strength before Death", "Fighter 18 · Samurai", 18, "255, 110, 100", "255, 225, 200", "sword", "rays"),
  "umbral-form": f("Umbral Form", "Sorcerer 18 · Shadow Magic", 18, "150, 140, 190", "25, 15, 45", "moon", "smoke"),
  "wind-soul": f("Wind Soul", "Sorcerer 18 · Storm Sorcery", 18, "205, 240, 255", "110, 190, 255", "wind", "rise"),
  // 17th level
  "spell-thief": f("Spell Thief", "Rogue 17 · Arcane Trickster", 17, "205, 175, 255", "120, 90, 220", "book", "converge"),
  "keeper-of-souls": f("Keeper of Souls", "Cleric 17 · Grave Domain", 17, "225, 232, 245", "140, 100, 180", "skull", "rise"),
  "visions-of-the-past": f("Visions of the Past", "Cleric 17 · Knowledge Domain", 17, "232, 232, 255", "170, 150, 255", "hourglass", "mirror"),
  "corona-of-light": f("Corona of Light", "Cleric 17 · Light Domain", 17, "255, 248, 215", "255, 180, 70", "sun", "repel"),
  "master-of-nature": f("Master of Nature", "Cleric 17 · Nature Domain", 17, "205, 255, 185", "115, 175, 75", "leaf", "rise"),
  "protective-bond": { ...f("Protective Bond", "Cleric 6 · Peace Domain", 6, "220, 255, 240", "110, 215, 195", "chain", "ripple"), cls: "class:cleric", grows: { level: 17, from: "Cleric 17 · Peace Domain (Expansive Bond)" } },
  "sudden-strike": f("Sudden Strike", "Rogue 17 · Scout", 17, "220, 255, 215", "110, 185, 115", "target", "sparks"),
  "master-duelist": f("Master Duelist", "Rogue 17 · Swashbuckler", 17, "255, 232, 205", "225, 75, 90", "sword", "mirror"),
  "hand-of-ultimate-mercy": f("Hand of Ultimate Mercy", "Monk 17 · Way of Mercy", 17, "240, 255, 240", "110, 215, 135", "heart", "converge"),
  opportunist: f("Opportunist", "Monk 17 · Way of Shadow", 17, "185, 175, 215", "55, 35, 90", "target", "smoke"),
  "explosive-fury": f("Explosive Fury", "Monk 17 · Way of the Ascendant Dragon", 17, "255, 175, 95", "255, 85, 35", "flame", "sparks"),
  "awakened-astral-self": f("Awakened Astral Self", "Monk 17 · Way of the Astral Self", 17, "185, 222, 255", "130, 110, 255", "fist", "stars"),
  "sun-shield-light": f("Sun Shield", "Monk 17 · Way of the Sun Soul", 17, "255, 238, 165", "255, 160, 55", "sun", "rise"),
  "sun-shield": f("Sun Shield", "Monk 17 · Way of the Sun Soul", 17, "255, 238, 165", "255, 120, 40", "shield", "sparks"),
};
