import type { Grant, Modifier } from "@dnd/schema";

/**
 * Artifact properties (DMG p. 219), in our own short words: an artifact can have up to
 * four minor and two major beneficial properties, and up to four minor and two major
 * detrimental ones. Each table is rolled on with a d100 (or the property is picked).
 * Some ask for a pick (the DM's choice: a skill, a damage type, a spell); what the app
 * can apply becomes part of the item's grant while you're attuned, the rest is a reminder.
 */
export type ArtifactTable = "minor-good" | "major-good" | "minor-bad" | "major-bad";

export const ARTIFACT_TABLES: { id: ArtifactTable; name: string; max: number }[] = [
  { id: "minor-good", name: "Minor beneficial", max: 4 },
  { id: "major-good", name: "Major beneficial", max: 2 },
  { id: "minor-bad", name: "Minor detrimental", max: 4 },
  { id: "major-bad", name: "Major detrimental", max: 2 },
];

/** What a property asks the DM to pick. */
export type ArtifactPick = "skill" | "damage" | "ability" | "cantrip" | `spell${1 | 2 | 3 | 4 | 5 | 6 | 7}` | "creature";

export interface ArtifactProperty {
  table: ArtifactTable;
  /** d100 range, inclusive (100 is "00"). */
  from: number;
  to: number;
  /** Our own wording. */
  text: string;
  pick?: ArtifactPick;
  /** What the app applies while you're attuned (with the pick). */
  grant?: (pick: string | undefined, name: string) => Grant;
  /** Something the app does once, when you attune (damage to roll and take, an ability score lowered). */
  onAttune?: { damage?: { dice: string; type: string }; note?: string };
}

const mod = (m: Omit<Modifier, "mode"> & { mode?: Modifier["mode"] }): Modifier => ({ mode: "auto", ...m }) as Modifier;
const immune = (name: string, ...conds: string[]): Grant => ({ modifiers: conds.map((c) => mod({ selector: `defense.immune.${c}`, op: "immune", label: name })) });
const castOnce = (level: number): Omit<ArtifactProperty, "table" | "from" | "to" | "text"> => ({
  pick: `spell${level}` as ArtifactPick,
  grant: (pick, name) =>
    pick
      ? {
          resources: [{ id: `artifact-spell-${pick}`, name: `${name}: spell`, max: 1, reset: "dawn" }],
          spells: [{ spell: pick, name: pick, casting: "an action; then roll a d6: on 1 to 5, not again until dawn", resource: `artifact-spell-${pick}`, list: "innate" }],
        }
      : {},
});

export const ARTIFACT_PROPERTIES: ArtifactProperty[] = [
  // Minor beneficial
  { table: "minor-good", from: 1, to: 20, text: "Proficiency in one skill (the DM's choice).", pick: "skill", grant: (p) => (p ? { proficiencies: [{ kind: "skill", target: p }] } : {}) },
  { table: "minor-good", from: 21, to: 30, text: "Immune to disease.", grant: (_, n) => immune(n, "disease") },
  { table: "minor-good", from: 31, to: 40, text: "Can't be charmed or frightened.", grant: (_, n) => immune(n, "charmed", "frightened") },
  { table: "minor-good", from: 41, to: 50, text: "Resistance to one damage type (the DM's choice).", pick: "damage", grant: (p, n) => (p ? { modifiers: [mod({ selector: `defense.resist.${p}`, op: "resist", label: n })] } : {}) },
  {
    table: "minor-good",
    from: 51,
    to: 60,
    text: "Cast one cantrip from it as an action (the DM's choice).",
    pick: "cantrip",
    grant: (p) => (p ? { spells: [{ spell: p, name: p, casting: "an action, at will", list: "innate", atWill: true }] } : {}),
  },
  { table: "minor-good", from: 61, to: 70, text: "Cast one 1st-level spell from it as an action; then roll a d6: on 1 to 5, not again until the next dawn.", ...castOnce(1) },
  { table: "minor-good", from: 71, to: 80, text: "As above, a 2nd-level spell.", ...castOnce(2) },
  { table: "minor-good", from: 81, to: 90, text: "As above, a 3rd-level spell.", ...castOnce(3) },
  { table: "minor-good", from: 91, to: 100, text: "+1 to AC.", grant: (_, n) => ({ modifiers: [mod({ selector: "stat.ac", op: "add", value: 1, label: n })] }) },
  // Major beneficial
  {
    table: "major-good",
    from: 1,
    to: 20,
    text: "One ability score (the DM's choice) goes up by 2, to no more than 24.",
    pick: "ability",
    grant: (p) => (p ? { abilityBonuses: { [p]: 2 } } : {}),
  },
  {
    table: "major-good",
    from: 21,
    to: 30,
    text: "At the start of your turn, with at least 1 hit point, you regain 1d6 hit points.",
    grant: (_, n) => ({ actions: [{ id: `artifact-regain-${n}`, name: `${n}: regain 1d6`, economy: "free", heal: "1d6", toggles: [], note: "At the start of your turn, if you have at least 1 hit point." }] }),
  },
  {
    table: "major-good",
    from: 31,
    to: 40,
    text: "A weapon attack that hits deals an extra 1d6 damage of the weapon's type.",
    grant: (_, n) => ({ modifiers: [mod({ selector: "roll.damage.weapon.*", op: "add", value: "1d6", label: n })] }),
  },
  { table: "major-good", from: 41, to: 50, text: "Walking speed +10 ft.", grant: (_, n) => ({ modifiers: [mod({ selector: "stat.speed.walk", op: "add", value: 10, label: n })] }) },
  { table: "major-good", from: 51, to: 60, text: "Cast one 4th-level spell from it as an action; then roll a d6: on 1 to 5, not again until the next dawn.", ...castOnce(4) },
  { table: "major-good", from: 61, to: 70, text: "As above, a 5th-level spell.", ...castOnce(5) },
  { table: "major-good", from: 71, to: 80, text: "As above, a 6th-level spell.", ...castOnce(6) },
  { table: "major-good", from: 81, to: 90, text: "As above, a 7th-level spell.", ...castOnce(7) },
  { table: "major-good", from: 91, to: 100, text: "Can't be blinded, deafened, petrified or stunned.", grant: (_, n) => immune(n, "blinded", "deafened", "petrified", "stunned") },
  // Minor detrimental
  {
    table: "minor-bad",
    from: 1,
    to: 5,
    text: "Disadvantage on saving throws against spells.",
    grant: (_, n) => ({ modifiers: [mod({ selector: "roll.save.*", op: "disadvantage", mode: "suggested", label: n, when: { text: "against a spell" } })] }),
  },
  { table: "minor-bad", from: 6, to: 10, text: "The first time you touch a gem or a piece of jewelry, its value is halved." },
  { table: "minor-bad", from: 11, to: 15, text: "You're blinded while more than 10 ft from the artifact." },
  {
    table: "minor-bad",
    from: 16,
    to: 20,
    text: "Disadvantage on saving throws against poison.",
    grant: (_, n) => ({ modifiers: [mod({ selector: "roll.save.*", op: "disadvantage", mode: "suggested", label: n, when: { text: "against poison" } })] }),
  },
  { table: "minor-bad", from: 21, to: 30, text: "A sour smell comes off you, noticeable within 10 ft." },
  { table: "minor-bad", from: 31, to: 35, text: "Holy water within 10 ft of you is destroyed." },
  {
    table: "minor-bad",
    from: 36,
    to: 40,
    text: "You're ill: disadvantage on ability checks and saving throws that use Strength or Constitution.",
    grant: (_, n) => ({ modifiers: ["roll.check.str", "roll.save.str", "roll.check.con", "roll.save.con"].map((s) => mod({ selector: s, op: "disadvantage", label: n })) }),
  },
  { table: "minor-bad", from: 41, to: 45, text: "You weigh 1d4 × 10 lb. more." },
  { table: "minor-bad", from: 46, to: 50, text: "Your appearance changes, as the DM decides." },
  { table: "minor-bad", from: 51, to: 55, text: "You're deafened while more than 10 ft from the artifact." },
  { table: "minor-bad", from: 56, to: 60, text: "You weigh 1d4 × 5 lb. less." },
  { table: "minor-bad", from: 61, to: 65, text: "You lose your sense of smell." },
  { table: "minor-bad", from: 66, to: 70, text: "Nonmagical flames within 30 ft of you go out." },
  { table: "minor-bad", from: 71, to: 80, text: "Other creatures within 300 ft of you can't finish a short or long rest." },
  { table: "minor-bad", from: 81, to: 85, text: "Plants (not creatures) you touch take 1d6 necrotic damage." },
  { table: "minor-bad", from: 86, to: 90, text: "Animals within 30 ft of you are hostile toward you." },
  { table: "minor-bad", from: 91, to: 95, text: "You need six times the usual food and drink each day." },
  { table: "minor-bad", from: 96, to: 100, text: "Your flaw grows stronger, as the DM decides." },
  // Major detrimental
  { table: "major-bad", from: 1, to: 5, text: "Your body rots over four days (hair, then fingertips and toes, lips and nose, ears); regenerate restores what's lost." },
  { table: "major-bad", from: 6, to: 10, text: "Each dawn your alignment is rolled again: a d6 for law to chaos, a d6 for good to evil." },
  { table: "major-bad", from: 11, to: 15, text: "When you first attune, it sets you a quest (as geas) until it's done." },
  { table: "major-bad", from: 16, to: 20, text: "A hostile spirit lives in it: each time you use one of its properties as an action, half the time it tries to possess you (DC 20 Charisma save)." },
  { table: "major-bad", from: 21, to: 25, text: "CR 0 creatures and plants (not creatures) within 10 ft of it drop to 0 hit points." },
  { table: "major-bad", from: 26, to: 30, text: "A death slaad is trapped in it: each time you use one of its properties as an action, a 10% chance it escapes and attacks you." },
  { table: "major-bad", from: 31, to: 35, text: "Creatures of one type other than humanoid (the DM's choice) are always hostile toward you.", pick: "creature" },
  { table: "major-bad", from: 36, to: 40, text: "Potions within 10 ft of it lose their magic." },
  { table: "major-bad", from: 41, to: 45, text: "Scrolls within 10 ft of it lose their magic." },
  { table: "major-bad", from: 46, to: 50, text: "Before using one of its properties as an action, a bonus action to draw blood (1d4 piercing or slashing) from yourself or a willing or helpless creature within reach." },
  { table: "major-bad", from: 51, to: 60, text: "When you attune, you gain a long-term madness.", onAttune: { note: "A long-term madness: the DM rolls or picks it." } },
  { table: "major-bad", from: 61, to: 65, text: "You take 4d10 psychic damage when you attune.", onAttune: { damage: { dice: "4d10", type: "psychic" } } },
  { table: "major-bad", from: 66, to: 70, text: "You take 8d10 psychic damage when you attune.", onAttune: { damage: { dice: "8d10", type: "psychic" } } },
  { table: "major-bad", from: 71, to: 75, text: "Before you can attune, you must kill a creature of your alignment." },
  {
    table: "major-bad",
    from: 76,
    to: 80,
    text: "When you attune, one ability score (rolled at random) drops by 2; greater restoration restores it.",
    pick: "ability",
    grant: (p) => (p ? { abilityBonuses: { [p]: -2 } } : {}),
  },
  { table: "major-bad", from: 81, to: 85, text: "Each time you attune, you age 3d10 years and make a DC 10 Constitution save or die of the shock.", onAttune: { note: "Age 3d10 years, then a DC 10 Constitution save." } },
  { table: "major-bad", from: 86, to: 90, text: "You can't speak." },
  {
    table: "major-bad",
    from: 91,
    to: 95,
    text: "Vulnerability to all damage.",
    grant: (_, n) => ({
      modifiers: ["acid", "bludgeoning", "cold", "fire", "force", "lightning", "necrotic", "piercing", "poison", "psychic", "radiant", "slashing", "thunder"].map((t) => mod({ selector: `defense.vulnerable.${t}`, op: "vulnerable", label: n })),
    }),
  },
  { table: "major-bad", from: 96, to: 100, text: "When you attune, a 10% chance a god sends an avatar to take it from you." },
];

/** The property a d100 roll gives on a table. */
export function artifactProperty(table: ArtifactTable, roll: number): ArtifactProperty | undefined {
  const r = roll === 0 ? 100 : roll;
  return ARTIFACT_PROPERTIES.find((p) => p.table === table && r >= p.from && r <= p.to);
}
