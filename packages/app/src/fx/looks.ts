/**
 * Looks for damage types, charm and transformations. Data only: which CSS look
 * (styles.css, "Damage types, charm and forms") goes with a damage type, a
 * condition or a feature's on/off state. Nothing here knows how damage, the
 * Charmed condition or a feature works; the triggers (triggers.ts) only read
 * what the engine already recorded.
 */

/** One look per damage type: its colour (r, g, b), the piece it uses, and a name so colour isn't the only signal. */
export interface DamageLook {
  rgb: string;
  /** Which drawn piece (FxLayer): a burst, a jagged bolt, a cut, shards... */
  shape: "embers" | "frost" | "bolt" | "shock" | "drip" | "cloud" | "wisps" | "rays" | "waves" | "force" | "cut" | "stab" | "impact";
  label: string;
  buzz?: number[];
}

export const DAMAGE_FX: Record<string, DamageLook> = {
  fire: { rgb: "255, 130, 50", shape: "embers", label: "Fire" },
  cold: { rgb: "170, 220, 255", shape: "frost", label: "Cold" },
  lightning: { rgb: "190, 200, 255", shape: "bolt", label: "Lightning", buzz: [25] },
  thunder: { rgb: "200, 190, 255", shape: "shock", label: "Thunder", buzz: [40, 30, 20] },
  acid: { rgb: "150, 230, 70", shape: "drip", label: "Acid" },
  poison: { rgb: "140, 200, 90", shape: "cloud", label: "Poison" },
  necrotic: { rgb: "120, 70, 150", shape: "wisps", label: "Necrotic" },
  radiant: { rgb: "255, 225, 130", shape: "rays", label: "Radiant" },
  psychic: { rgb: "240, 130, 210", shape: "waves", label: "Psychic" },
  force: { rgb: "150, 160, 255", shape: "force", label: "Force" },
  slashing: { rgb: "230, 230, 240", shape: "cut", label: "Slashing" },
  piercing: { rgb: "225, 225, 235", shape: "stab", label: "Piercing" },
  bludgeoning: { rgb: "215, 205, 190", shape: "impact", label: "Bludgeoning", buzz: [20] },
};

/** A damage type's name as the content writes it ("Fire", "fire damage") → its key, or undefined for one without a look. */
export function damageKey(label: string | undefined): string | undefined {
  if (!label) return undefined;
  const words = label.toLowerCase().split(/[^a-z]+/);
  return words.find((w) => w in DAMAGE_FX);
}

/**
 * Spells that put the Charmed condition on their target, by content id: they
 * get the charm look when cast. A spell from a book file with the same id
 * (Charm Monster) gets it too.
 */
export const CHARM_SPELLS = [
  "spell:animal-friendship",
  "spell:charm-person",
  "spell:charm-monster",
  "spell:dominate-beast",
  "spell:dominate-person",
  "spell:dominate-monster",
  "spell:hypnotic-pattern",
  "spell:geas",
  "spell:modify-memory",
];

/** The condition that earns the charm look when it lands on you. */
export const CHARMED = "condition:charmed";

/**
 * Transformations, by the state (toggle) the feature turns on in the content:
 * a look when it starts, and a quiet loop at the screen's edges while it's on.
 * The loop follows the toggle only, so it ends when the engine ends the feature.
 */
export interface FormLook {
  label: string;
  /** CSS look of the start, and how long it plays. */
  start: string;
  ms: number;
  buzz?: number[];
  /** CSS look of the loop while it's on. */
  ongoing: string;
}

/**
 * Loops while a feature's state is on, for those whose start already has its own look (a feature look): the state,
 * and its loop at the screen's edges (23k). A pick's state can add its own piece (Starry Form's Archer: its
 * constellation).
 */
export const STATE_ONGOING: Record<string, string> = {
  floar: "sfx-st sfx-ongoing-floar",
  "starry-form": "sfx-st sfx-ongoing-starry",
  "starry-form-archer": "sfx-st sfx-ongoing-starry-archer",
  "starry-form-chalice": "sfx-st sfx-ongoing-starry-chalice",
  "starry-form-dragon": "sfx-st sfx-ongoing-starry-dragon",
  "avenging-angel": "sfx-st sfx-ongoing-angel",
  "elder-champion": "sfx-st sfx-ongoing-elder",
  "astral-arms": "sfx-st sfx-ongoing-astral",
  "astral-visage": "sfx-st sfx-ongoing-visage",
  "awakened-astral-self": "sfx-st sfx-ongoing-awakened",
  "beast-bite": "sfx-st sfx-ongoing-beast sfx-ongoing-beast-bite",
  "beast-claws": "sfx-st sfx-ongoing-beast sfx-ongoing-beast-claws",
  "beast-tail": "sfx-st sfx-ongoing-beast sfx-ongoing-beast-tail",
  "umbral-form": "sfx-st sfx-ongoing-umbral",
  "radiant-soul": "sfx-st sfx-ongoing-radiant-soul",
  "radiant-consumption": "sfx-st sfx-ongoing-consumption",
  "holy-nimbus": "sfx-st sfx-ongoing-nimbus",
  "corona-of-light": "sfx-st sfx-ongoing-corona",
  bladesong: "sfx-st sfx-ongoing-bladesong",
  "trance-of-order": "sfx-st sfx-ongoing-order",
  "symbiotic-entity": "sfx-st sfx-ongoing-spores",
  "revelation-in-flesh": "sfx-st sfx-ongoing-flesh",
  "giants-might": "sfx-st sfx-ongoing-giant",
  "otherworldly-wings": "sfx-st sfx-ongoing-wings sfx-ongoing-wings-feathered",
  "wings-unfurled": "sfx-st sfx-ongoing-wings sfx-ongoing-wings-wyrm",
  "gem-flight": "sfx-st sfx-ongoing-wings sfx-ongoing-wings-gem",
  "elemental-gift-flight": "sfx-st sfx-ongoing-wings sfx-ongoing-wings-elemental",
  "ghost-walk": "sfx-st sfx-ongoing-ghost",
  "mantle-of-majesty": "sfx-st sfx-ongoing-majesty",
  "aspect-of-the-wyrm": "sfx-st sfx-ongoing-wyrm",
};

export const FORM_FX: Record<string, FormLook> = {
  // Aasimar (Fallen): eyes like pools of darkness, ghostly wings that don't fly.
  "necrotic-shroud": { label: "Necrotic Shroud", start: "fx-form fx-form-shroud", ms: 1100, buzz: [30, 60, 30], ongoing: "sfx-ongoing-shroud" },
  // Undead patron: a horrific, deathly shape.
  "form-of-dread": { label: "Form of Dread", start: "fx-form fx-form-dread", ms: 1000, buzz: [50, 40, 20], ongoing: "sfx-ongoing-dread" },
};
