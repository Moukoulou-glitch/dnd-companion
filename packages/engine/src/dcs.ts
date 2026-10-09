import type { Ability } from "@dnd/schema";

/**
 * Features that make a creature save against your DC, and how that DC is
 * worked out: a class's spell save DC, or 8 + proficiency + the best of some
 * abilities (Stunning Strike: Wisdom, a maneuver: Strength or Dexterity).
 */
export interface DcSpec {
  /** What the save is ("Constitution", "Strength or Dexterity"). */
  save: string;
  /** "spell:<class>" for that class's spell save DC ("spell:*": the best one), the abilities whose best modifier is added, or a fixed number. */
  by: `spell:${string}` | Ability[] | number;
  /** The DC's own name: "Ki save DC", "Maneuver save DC". */
  name: string;
}

const KI = (save: string): DcSpec => ({ save, by: ["wis"], name: "Ki save DC" });
const SPELL = (cls: string, save: string): DcSpec => ({ save, by: `spell:${cls}`, name: "Spell save DC" });

export const FEATURE_DCS: Record<string, DcSpec> = {
  // Monk
  "feature:stunning-strike": KI("Constitution"),
  "feature:open-hand-technique": KI("Dexterity (prone) or Strength (pushed)"),
  "feature:quivering-palm": KI("Constitution"),
  "feature:way-of-the-sun-soul-searing-sunburst": KI("Constitution"),
  "feature:way-of-the-sun-soul-searing-arc-strike": KI("Dexterity (Burning Hands)"),
  "feature:way-of-the-four-elements-disciple-of-the-elements": KI("as the discipline says"),
  "feature:way-of-shadow-shadow-arts": KI("as the spell says"),
  // Cleric
  "feature:channel-divinity-turn-undead": SPELL("cleric", "Wisdom"),
  "feature:destroy-undead-cr-1-2-or-below": SPELL("cleric", "Wisdom (Turn Undead)"),
  "feature:light-domain-channel-divinity-radiance-of-the-dawn": SPELL("cleric", "Constitution"),
  "feature:nature-domain-channel-divinity-charm-animals-and-plants": SPELL("cleric", "Wisdom"),
  "feature:knowledge-domain-channel-divinity-read-thoughts": SPELL("cleric", "Wisdom"),
  "feature:order-domain-channel-divinity-orders-demand": SPELL("cleric", "Wisdom"),
  "feature:tempest-domain-wrath-of-the-storm": SPELL("cleric", "Dexterity"),
  "feature:tempest-domain-thunderbolt-strike": SPELL("cleric", "none (pushes Large or smaller)"),
  // Paladin
  "feature:channel-divinity-turn-the-unholy": SPELL("paladin", "Wisdom"),
  "feature:oath-of-vengeance-abjure-enemy": SPELL("paladin", "Wisdom"),
  "feature:oath-of-the-ancients-natures-wrath": SPELL("paladin", "Strength or Dexterity"),
  "feature:oath-of-the-watchers-abjure-the-extraplanar": SPELL("paladin", "Wisdom"),
  "feature:oath-of-conquest-conquering-presence": SPELL("paladin", "Wisdom"),
  "feature:oath-of-redemption-rebuke-the-violent": SPELL("paladin", "Wisdom"),
  "feature:oath-of-redemption-emissary-of-peace": SPELL("paladin", "none (+5 Persuasion)"),
  "feature:oath-of-the-ancients-elder-champion": SPELL("paladin", "against your spells and Channel Divinity, at disadvantage"),
  // Druid, bard, sorcerer, warlock, wizard, ranger
  "feature:circle-of-spores-halo-of-spores": SPELL("druid", "Constitution"),
  "feature:college-of-glamour-mantle-of-majesty": SPELL("bard", "Wisdom (Command)"),
  "feature:college-of-glamour-unbreakable-majesty": SPELL("bard", "Charisma"),
  "feature:storm-sorcery-storms-fury": SPELL("sorcerer", "Strength"),
  "feature:aberrant-mind-warping-implosion": SPELL("sorcerer", "Strength"),
  "feature:shadow-magic-hound-of-ill-omen": SPELL("sorcerer", "disadvantage on saves against your spells"),
  "feature:archfey-fey-presence": SPELL("warlock", "Wisdom"),
  "feature:archfey-beguiling-defenses": SPELL("warlock", "Wisdom"),
  "feature:eldritch-invocation-dreadful-word": SPELL("warlock", "Wisdom (Confusion)"),
  "feature:enchantment-hypnotic-gaze": SPELL("wizard", "Wisdom"),
  "feature:enchantment-instinctive-charm": SPELL("wizard", "Wisdom"),
  "feature:monster-slayer-magic-users-nemesis": SPELL("ranger", "Wisdom"),
  "feature:fey-wanderer-beguiling-twist": SPELL("ranger", "Wisdom"),
  // Fighter, rogue (subclass casters and their own DCs)
  "feature:arcane-trickster-spell-thief": SPELL("arcane-trickster", "its spellcasting ability"),
  "feature:battle-master-combat-superiority": { save: "as the maneuver says", by: ["str", "dex"], name: "Maneuver save DC" },
  "feature:cavalier-ferocious-charger": { save: "Strength (knocked prone)", by: ["str"], name: "Save DC" },
  "feature:arcane-archer-arcane-shot": { save: "as the Arcane Shot says", by: ["int"], name: "Arcane Shot save DC" },
  "feature:rune-knight-rune-carver": { save: "as the rune says", by: ["con"], name: "Rune save DC" },
  "feature:psi-warrior-psionic-power": { save: "Strength (Telekinetic Thrust)", by: ["int"], name: "Psionic save DC" },
  "feature:assassin-death-strike": { save: "Constitution", by: ["dex"], name: "Save DC" },
  // Barbarian
  "feature:intimidating-presence": { save: "Wisdom", by: ["cha"], name: "Save DC" },
  "feature:path-of-wild-magic-wild-surge": { save: "as the surge says", by: ["con"], name: "Wild Magic save DC" },
  "feature:path-of-the-storm-herald-storm-aura": { save: "Dexterity (Sea)", by: ["con"], name: "Storm Aura save DC" },
  // Races
  "feature:trait-breath-weapon": { save: "Dexterity or Constitution (by your ancestry)", by: ["con"], name: "Breath Weapon DC" },
};

/** Actions (by id) that take the DC of a feature. */
export const ACTION_DCS: Record<string, DcSpec> = {
  maneuver: FEATURE_DCS["feature:battle-master-combat-superiority"]!,
};
