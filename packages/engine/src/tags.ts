/**
 * Tags for features that are "on" without being switched on (a paladin's
 * auras, Eyes of Night), and reminders for features that are switched on
 * (Twilight Sanctuary): what they do for you and what you can do with them.
 *
 * Text is our own summary. "{cha}" is the Charisma modifier (at least +1),
 * "{range}" the aura's range (10 ft, 30 ft from paladin level 18), "{pb}" the
 * proficiency bonus, "{cleric}" the cleric level, "{wis}" the Wisdom modifier (at least 1).
 */
export interface FeatureTagDef {
  name: string;
  reminders: string[];
  /** When it stops working: while unconscious (Aura of Protection) or incapacitated (Aura of Alacrity). */
  needs?: "conscious" | "notIncapacitated";
  /** Only while this switch is on (Storm Aura while raging). */
  whileToggle?: string;
}

export const FEATURE_TAGS: Record<string, FeatureTagDef> = {
  "feature:aura-of-protection": {
    name: "Aura of Protection",
    needs: "conscious",
    reminders: ["You and friendly creatures within {range} add +{cha} to saving throws.", "Allies with the app: add “Aura of Protection” from Add an effect → Other."],
  },
  "feature:aura-of-courage": {
    name: "Aura of Courage",
    needs: "conscious",
    reminders: ["You and friendly creatures within {range} can't be frightened."],
  },
  "feature:aura-of-devotion": {
    name: "Aura of Devotion",
    needs: "conscious",
    reminders: ["You and friendly creatures within {range} can't be charmed."],
  },
  "feature:oath-of-the-ancients-aura-of-warding": {
    name: "Aura of Warding",
    reminders: ["You and friendly creatures within {range} have resistance to damage from spells."],
  },
  "feature:oath-of-conquest-aura-of-conquest": {
    name: "Aura of Conquest",
    needs: "notIncapacitated",
    reminders: ["A creature frightened of you has speed 0 while it's within {range}.", "It takes psychic damage equal to half your paladin level when it starts its turn there."],
  },
  "feature:oath-of-glory-aura-of-alacrity": {
    name: "Aura of Alacrity",
    needs: "notIncapacitated",
    reminders: ["Your walking speed is 10 ft faster.", "An ally who starts its turn within 5 ft of you (10 ft at 18th) gets +10 ft walking speed until the end of that turn."],
  },
  "feature:oath-of-the-watchers-aura-of-the-sentinel": {
    name: "Aura of the Sentinel",
    needs: "notIncapacitated",
    reminders: ["You and creatures of your choice within {range} add +{pb} to initiative."],
  },
  "feature:oath-of-redemption-aura-of-the-guardian": {
    name: "Aura of the Guardian",
    needs: "notIncapacitated",
    reminders: ["Reaction: when a creature within {range} takes damage, you take that damage instead (it can't be reduced)."],
  },
  "feature:path-of-the-storm-herald-storm-aura": {
    name: "Storm Aura",
    whileToggle: "raging",
    reminders: ["While raging, a 10-ft aura: on rage and as a bonus action on later turns, its effect (desert, sea or tundra) triggers."],
  },
  "feature:twilight-domain-eyes-of-night": {
    name: "Eyes of Night",
    reminders: ["You see in dim light and darkness out to 300 ft (darkvision).", "Action: share it for 1 hour with up to {wis} willing creatures within 10 ft; once per long rest, or again for a spell slot."],
  },
};

/** What a switched-on feature does, under its chip. */
export const TOGGLE_REMINDERS: Record<string, string[]> = {
  "twilight-sanctuary": [
    "A 30-ft sphere of twilight around you for 1 minute.",
    "When a creature of your choice (you too) ends its turn inside, pick one: it gains 1d6 + {cleric} temporary hit points, or one charm or fright on it ends.",
    "Ends early if you're incapacitated or die.",
  ],
  "vigilant-blessing": ["Advantage on your next initiative roll; it ends after that roll.", "Using it again (on anyone) ends the last one."],
  "eyes-of-night-shared": ["Your darkvision (300 ft) is shared for 1 hour with the creatures you picked."],
};

/** Names for switches when the action's own name would clash with a tag (Eyes of Night shared vs the darkvision). */
export const TOGGLE_LABELS: Record<string, string> = {
  "eyes-of-night-shared": "Eyes of Night (shared)",
};
