import { ABILITIES, ABILITY_NAMES, SKILLS, SKILL_NAMES, type Ability, type Character, type CreatureDef, type Skill } from "@dnd/schema";
import type { Part, RollBreakdown } from "./breakdown.js";
import type { ContentRegistry } from "./registry.js";
import type { WeaponAttack } from "./derive.js";

/** What a druid's Wild Shape allows right now (PHB p. 66; Circle of the Moon p. 69). */
export interface WildShapeLimits {
  druidLevel: number;
  moon: boolean;
  maxCr: number;
  noFly: boolean;
  noSwim: boolean;
  /** Circle of the Moon at 10th: two uses for an air, earth, fire or water elemental. */
  elemental: boolean;
  hours: number;
  /** Combat Wild Shape: a bonus action instead of an action. */
  bonusAction: boolean;
  /** Beast Spells (18th): cast in beast form. */
  beastSpells: boolean;
}

const ELEMENTALS = new Set(["creature:air-elemental", "creature:earth-elemental", "creature:fire-elemental", "creature:water-elemental"]);

export function wildShapeLimits(c: Character, featureNames: string[]): WildShapeLimits | undefined {
  const druid = c.classes.find((x) => x.class === "class:druid");
  if (!druid || druid.level < 2) return undefined;
  const L = druid.level;
  const has = (re: RegExp) => featureNames.some((n) => re.test(n));
  const moon = has(/^(Combat Wild Shape|Circle Forms)$/i) || /moon/i.test(druid.subclass ?? "");
  // Beast Shapes table, and the Moon's own (CR 1 from 2nd, then level ÷ 3 from 6th).
  const baseCr = L >= 8 ? 1 : L >= 4 ? 0.5 : 0.25;
  const maxCr = moon ? Math.max(1, L >= 6 ? Math.floor(L / 3) : 1) : baseCr;
  return {
    druidLevel: L,
    moon,
    maxCr,
    noFly: L < 8,
    noSwim: L < 4,
    elemental: moon && L >= 10,
    hours: Math.floor(L / 2),
    bonusAction: moon || has(/^Combat Wild Shape$/i),
    beastSpells: has(/^Beast Spells$/i),
  };
}

/** Why a creature is outside the limits (empty when it's fine). Warned about, never blocked. */
export function shapeIssues(d: CreatureDef, kind: "wildshape" | "polymorph", limits: WildShapeLimits | undefined, polymorphMax: number): string[] {
  const out: string[] = [];
  const crText = (n: number) => (n === 0.125 ? "1/8" : n === 0.25 ? "1/4" : n === 0.5 ? "1/2" : String(n));
  if (kind === "polymorph") {
    if (d.type !== "beast") out.push("Polymorph turns you into a beast.");
    if (d.cr > polymorphMax) out.push(`CR ${crText(d.cr)} is above ${crText(polymorphMax)} (the caster's level, by your table's rule).`);
    return out;
  }
  if (!limits) return ["Only druids have Wild Shape."];
  if (ELEMENTALS.has(d.id)) {
    if (!limits.elemental) out.push("Elementals need Elemental Wild Shape (Circle of the Moon, 10th level).");
    return out;
  }
  if (d.type !== "beast") out.push("Wild Shape turns you into a beast.");
  if (d.cr > limits.maxCr) out.push(`CR ${crText(d.cr)} is above your ${crText(limits.maxCr)}.`);
  if (limits.noFly && d.speed.fly) out.push("No flying speed yet (8th level).");
  if (limits.noSwim && d.speed.swim) out.push("No swimming speed yet (4th level).");
  return out;
}

export interface ShapeResult {
  kind: "wildshape" | "polymorph";
  id: string;
  name: string;
  size: string;
  type: string;
  cr: number;
  ac: number;
  acNote?: string;
  hp: { current: number; max: number };
  speed: string;
  abilities: Record<Ability, { score: number; modifier: number; mine: boolean }>;
  saves: Record<Ability, RollBreakdown>;
  skills: Record<Skill, RollBreakdown>;
  senses?: string;
  languages?: string;
  defenses: { resist: string[]; immune: string[]; vulnerable: string[]; conditions: string[] };
  traits: { name: string; text: string }[];
  actions: { name: string; text: string }[];
  attacks: (WeaponAttack & { note?: string })[];
  /** Wild Shape: hours it can last. */
  hours?: number;
  notes: string[];
}

const flatRoll = (parts: Part[]): RollBreakdown => ({ total: parts.reduce((t, p) => t + p.value, 0), parts, dice: [], advantage: [], disadvantage: [], suggestions: [] });

/**
 * The stat block you use while transformed. Wild Shape keeps your Intelligence,
 * Wisdom and Charisma and your skill and save proficiencies (the higher of
 * yours and the beast's); Polymorph replaces everything.
 */
export function deriveShape(
  c: Character,
  reg: ContentRegistry,
  mine: { abilities: Record<Ability, number>; pb: number; saves: Record<Ability, number>; skills: Record<Skill, number> },
  limits: WildShapeLimits | undefined,
): ShapeResult | undefined {
  const s = c.shape;
  if (!s) return undefined;
  const d = reg.find(s.creature, "creature");
  if (!d) return undefined;
  const wild = s.kind === "wildshape";
  const abilities = {} as ShapeResult["abilities"];
  for (const a of ABILITIES) {
    const keepMine = wild && (a === "int" || a === "wis" || a === "cha");
    const score = keepMine ? mine.abilities[a] : d.abilities[a] ?? 10;
    abilities[a] = { score, modifier: Math.floor((score - 10) / 2), mine: keepMine };
  }
  const saves = {} as ShapeResult["saves"];
  for (const a of ABILITIES) {
    const mod = abilities[a].modifier;
    const own = wild && mine.saves[a] ? mod + mine.pb * mine.saves[a] : undefined;
    const beast = d.saves?.[a];
    const parts: Part[] =
      own !== undefined && (beast === undefined || own >= beast)
        ? [{ label: `${ABILITY_NAMES[a]} modifier (${abilities[a].mine ? "yours" : d.name})`, value: mod }, { label: "Your proficiency", value: own - mod }]
        : beast !== undefined
          ? [{ label: `${d.name}'s save`, value: beast }]
          : [{ label: `${ABILITY_NAMES[a]} modifier (${abilities[a].mine ? "yours" : d.name})`, value: mod }];
    saves[a] = flatRoll(parts);
  }
  const skills = {} as ShapeResult["skills"];
  const SKILL_AB: Record<string, Ability> = {
    athletics: "str", acrobatics: "dex", sleightOfHand: "dex", stealth: "dex", arcana: "int", history: "int", investigation: "int", nature: "int", religion: "int",
    animalHandling: "wis", insight: "wis", medicine: "wis", perception: "wis", survival: "wis", deception: "cha", intimidation: "cha", performance: "cha", persuasion: "cha",
  };
  for (const sk of SKILLS) {
    const ab = SKILL_AB[sk] ?? "wis";
    const mod = abilities[ab].modifier;
    const own = wild && mine.skills[sk] ? mod + Math.floor(mine.pb * mine.skills[sk]) : undefined;
    const beast = d.skills?.[sk];
    const parts: Part[] =
      own !== undefined && (beast === undefined || own >= beast)
        ? [{ label: `${ABILITY_NAMES[ab]} modifier`, value: mod }, { label: "Your proficiency", value: own - mod }]
        : beast !== undefined
          ? [{ label: `${d.name}'s ${SKILL_NAMES[sk]}`, value: beast }]
          : [{ label: `${ABILITY_NAMES[ab]} modifier`, value: mod }];
    skills[sk] = flatRoll(parts);
  }
  const sp = d.speed;
  const speed = [sp.walk ? `${sp.walk} ft` : "", ...(["climb", "swim", "fly", "burrow"] as const).filter((k) => sp[k]).map((k) => `${k} ${sp[k]} ft${k === "fly" && sp.hover ? " (hover)" : ""}`)]
    .filter(Boolean)
    .join(", ");
  const attacks = [...d.actions, ...(d.bonusActions ?? [])]
    .filter((a) => a.attack)
    .map((a) => {
      const at = a.attack!;
      const w: WeaponAttack & { note?: string } = {
        attackId: `shape:${d.id}:${a.name}`,
        name: a.name,
        mode: at.kind,
        action: (d.bonusActions ?? []).includes(a) ? "bonus" : "attack",
        ability: "str",
        proficient: true,
        attack: flatRoll([{ label: `${d.name}'s attack bonus`, value: at.toHit }]),
        damage: { dice: at.damage, type: at.damageType, bonus: flatRoll(at.damageBonus ? [{ label: `${d.name}'s damage bonus`, value: at.damageBonus }] : []), onCrit: [], critExtraDice: [] },
        properties: [],
      };
      if (at.reach) w.note = `${at.kind === "melee" ? "Reach" : "Range"} ${at.reach}`;
      return w;
    });
  const notes = wild
    ? [
        "You can't cast spells" + (limits?.beastSpells ? " except with Beast Spells (no material components with a cost)." : ", but concentration on a spell you already cast holds."),
        "You keep your features if the beast's body can use them; special senses only if the beast has them too.",
        "At 0 HP you change back, and extra damage carries over to your normal form.",
      ]
    : ["Your game statistics, mind included, are the beast's. You can't speak or cast spells.", "At 0 HP you change back, and extra damage carries over to your normal form."];
  const r: ShapeResult = {
    kind: s.kind,
    id: d.id,
    name: d.name,
    size: d.size,
    type: d.type,
    cr: d.cr,
    ac: d.ac,
    hp: { current: Math.min(s.hp, d.hp), max: d.hp },
    speed,
    abilities,
    saves,
    skills,
    defenses: { resist: d.resist ?? [], immune: d.immune ?? [], vulnerable: d.vulnerable ?? [], conditions: d.conditionImmune ?? [] },
    traits: d.traits,
    actions: [...d.actions, ...(d.bonusActions ?? []).map((a) => ({ ...a, name: `${a.name} (bonus action)` })), ...(d.reactions ?? []).map((a) => ({ ...a, name: `${a.name} (reaction)` }))].map((a) => ({ name: a.name, text: a.text })),
    attacks,
    notes,
  };
  if (d.acNote) r.acNote = d.acNote;
  if (d.senses && Object.keys(d.senses).length) r.senses = Object.entries(d.senses).map(([k, v]) => `${k} ${v} ft`).join(", ");
  if (d.languages) r.languages = d.languages;
  if (wild && limits) r.hours = limits.hours;
  return r;
}
