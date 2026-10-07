import { maxSpellLevel } from "./build.js";
import {
  ABILITIES,
  ABILITY_NAMES,
  SKILLS,
  SKILL_ABILITY,
  SKILL_NAMES,
  type Ability,
  type AttackDef,
  type Character,
  type Condition,
  type Modifier,
  type Proficiency,
  type Skill,
  type SpellcastingDef,
  type ValueExpr,
} from "@dnd/schema";
import { sum, signed, signedDice, type Breakdown, type DicePart, type Part, type RollBreakdown, type Suggestion } from "./breakdown.js";
import { evalExpr, evalFlat, type ExprContext } from "./expr.js";
import type { ContentRegistry } from "./registry.js";
import { collectSources, type Source } from "./sources.js";
import { deriveCompanion, type CompanionResult } from "./companions.js";
import { spellSlots } from "./spellSlots.js";

export interface AbilityResult {
  score: Breakdown;
  modifier: number;
}

export interface SaveResult extends RollBreakdown {
  proficient: boolean;
}

export interface SkillResult extends RollBreakdown {
  ability: Ability;
  /** 0 none, 1 proficient, 2 expertise. */
  proficiency: 0 | 1 | 2;
}

export interface WeaponAttack {
  /** Item definition id or feature attack id; selectors "attack.<id>" target it. */
  attackId: string;
  /** Inventory instance, when the attack comes from an item. */
  itemInstanceId?: string;
  name: string;
  /** "thrown" is a melee weapon thrown at range. */
  mode: "melee" | "ranged" | "thrown";
  action: "attack" | "bonus";
  ability: Ability;
  proficient: boolean;
  attack: RollBreakdown;
  damage: {
    dice: string;
    versatileDice?: string;
    type: string;
    bonus: RollBreakdown;
    /** Flat damage only on a critical hit / natural 20, e.g. Vicious +7. */
    onCrit: Part[];
    /** Extra weapon dice rolled on a critical hit, e.g. Brutal Critical. */
    critExtraDice: Part[];
  };
  properties: string[];
  range?: [number, number];
  /** The second weapon of two-weapon fighting, attacked with a bonus action. */
  offHand?: boolean;
  /** Only after attacking with another attack this turn (the second Psychic Blade). */
  requires?: { attack: string; text: string };
}

export interface SpellcastingResult {
  id: string;
  label: string;
  ability: Ability;
  saveDc: Breakdown;
  attack: Breakdown;
  /** Prepared casters: how many spells are prepared and the most allowed. */
  prepared?: { count: number; max: number };
}

/** A spell this character can cast, with every number already worked out. */
export interface SpellResult {
  id: string;
  name: string;
  level: number;
  school: string;
  castingTime: string;
  range: string;
  components: string[];
  material?: string;
  duration: string;
  concentration: boolean;
  ritual: boolean;
  text: string[];
  higherLevels: string[];
  summary?: string;
  /** The pack has only its numbers, not its text yet. */
  placeholder: boolean;
  source: string;
  list: { id: string; label: string };
  /** Feature, feat or race it comes from, when not a class list (Infernal Legacy, Fey Touched). */
  fromFeature?: string;
  /** Separate attacks per cast (Eldritch Blast beams by character level, Scorching Ray rays by slot). */
  beams?: { byLevel: Record<number, number>; what: string };
  /** The spell's duration as a timer: rounds up to 1 minute, minutes beyond. */
  timer?: { rounds?: number; minutes?: number };
  /** "always": cantrips, known casters and granted spells; otherwise whether it is prepared today. */
  ready: "always" | "prepared" | "not prepared";
  attack?: RollBreakdown;
  save?: { ability: Ability; dc: number; onSuccess: "half" | "none" | "other" };
  /** Damage or healing dice by the slot level it's cast at (cantrips: key 0). */
  damage?: { type?: string; byLevel: Record<number, string> };
  heal?: { byLevel: Record<number, string> };
  damageBonus?: RollBreakdown;
  /** How it can be cast right now. */
  cast: {
    slotLevels: number[];
    pact?: { level: number; remaining: number };
    free?: { resource: string; name: string; remaining: number };
  };
}

/** A rolled amount resolved for this character: dice plus a flat number, e.g. 1d10 + 1. */
export interface Amount {
  dice: string[];
  flat: number;
  text: string;
}

export interface ActionResult {
  id: string;
  name: string;
  economy: "action" | "bonus" | "reaction" | "free";
  source: string;
  note?: string;
  cost?: { resource: string; name: string; amount: number; remaining: number };
  toggles: string[];
  /** The feature or feat this comes from, for showing its text. */
  featureId?: string;
  /** Dice rolled when used and what the number means (Spirit Shield: damage prevented). */
  roll?: Amount & { label: string };
  duration?: { rounds?: number; minutes?: number; fromRoll?: "rounds" | "minutes" | "hours" };
  notAfterMoving?: boolean;
  stopsMovement?: boolean;
  restores?: { resource: string; amount: number };
  /** Spells this use casts for free (Haunted: Invisibility): using it opens the spell. */
  spells?: { id: string; list: string }[];
  tempHp?: Amount;
  heal?: Amount;
  /** One of the actions anyone can take (Dash, Dodge, Grapple): listed in their own section. */
  common?: boolean;
  check?: { skills: string[]; dc?: number };
  choose?: { label: string; options: string[] };
  extraAction?: boolean;
  spendAmount?: { label: string; heals?: boolean };
  asAttack?: boolean;
  dash?: boolean;
  untilTurnStart?: boolean;
  endsConcentration?: boolean;
  infoOnly?: boolean;
}

/** A trait, feature, feat or rule on the character, for reading. */
export interface FeatureEntry {
  id: string;
  name: string;
  kind: "race" | "background" | "feature" | "feat";
  summary?: string;
  text?: string[];
  source: string;
  /** One of the actions anyone can take: shown in the Actions tab's own section, not with the features. */
  common?: boolean;
}

/** An active effect or condition, for the status strip. */
export interface EffectResult {
  instanceId: string;
  id: string;
  name: string;
  category: "condition" | "spell" | "other";
  summary?: string;
  rounds?: number;
  /** Minutes left on a long effect (Mage Armor). */
  minutes?: number;
  level?: number;
  maxLevel?: number;
  concentration: boolean;
  reminders: string[];
  from?: string;
  /** What can be chosen for it (Hex: an ability) and what was. */
  choice?: { label: string; options: string[]; value?: string };
  /** Upcast effects: the lowest level and the level it was cast at. */
  upcast?: { baseLevel: number; castLevel: number };
  /** What each level does (Exhaustion). */
  levelNotes?: string[];
  /** Conditions it brings with it (Hold Person: Paralyzed; Invisibility: Invisible). */
  includes: { id: string; name: string }[];
  /** Ends when you attack or cast a spell (Invisibility). */
  endsOn?: ("attack" | "cast")[];
  /** Gone once its bonus is used in a roll (Bardic Inspiration): the label to look for. */
  usedUp?: string;
  /** Something readied with the Ready action, taken with your reaction; a spell when it's a readied spell. */
  release?: { spell?: { id: string; list: string; level: number } };
  /** Lasts until your next turn starts (Dodge, Ready): one round, no countdown to adjust. */
  untilTurnStart?: boolean;
}

export interface ResourceResult {
  id: string;
  name: string;
  max: number;
  used: number;
  remaining: number;
  reset: string;
  die?: string;
  source: string;
  /** Rolls made in advance (Portent): the dice size and the values kept so far. */
  pool?: { sides: number; values: number[] };
}

export interface DerivedSheet {
  level: number;
  proficiencyBonus: number;
  abilities: Record<Ability, AbilityResult>;
  saves: Record<Ability, SaveResult>;
  skills: Record<Skill, SkillResult>;
  passives: { perception: Breakdown; investigation: Breakdown; insight: Breakdown };
  ac: Breakdown;
  initiative: RollBreakdown;
  speed: Breakdown;
  hpMax: Breakdown;
  hitDice: { die: string; total: number; used: number }[];
  attacks: WeaponAttack[];
  /** Features the character can use (Rage, Form of Dread, Fey Step...). */
  actions: ActionResult[];
  /** Spells the character can cast, sorted by level then name. */
  spells: SpellResult[];
  /** The spell being concentrated on, if any. */
  concentration?: { spell: string; name: string; level?: number; rounds?: number; minutes?: number };
  /** Conditions and effects on the character, in the order they were added. */
  effects: EffectResult[];
  spellcasting: SpellcastingResult[];
  spellSlots: { level: number; total: number; used: number }[];
  pactSlots?: { count: number; level: number };
  resources: ResourceResult[];
  proficiencies: { armor: string[]; weapons: string[]; tools: string[]; languages: string[] };
  defenses: { resist: string[]; immune: string[]; vulnerable: string[] };
  senses: Record<string, number>;
  /** On/off states some active feature reads (Rage, Mage Armor, a lit Flame Tongue), for the UI to offer as switches. */
  toggles: { name: string; label: string; on: boolean }[];
  /** Race traits, background, class and subclass features, feats and table rules, in sheet order, with their text when loaded. */
  features: FeatureEntry[];
  /** Companions from features (Primal Companion), with their stat blocks. */
  companions: CompanionResult[];
  /** Attacks per Attack action: 2 with Extra Attack. */
  attacksPerAction: number;
  /** Rule permissions: two-weapon fighting with non-light weapons (Dual Wielder), ability modifier on off-hand damage (the style). */
  rules: { twoWeaponNonLight: boolean; twoWeaponAbility: boolean };
  /** Data problems found while deriving (missing choices, too many attuned items). */
  warnings: string[];
}

interface ActiveMod {
  mod: Modifier;
  source: Source;
}

type WeaponLike = {
  category: "simple" | "martial";
  kind: "melee" | "ranged";
  group?: string;
  damage: string;
  damageType: string;
  versatileDamage?: string;
  properties: string[];
  range?: [number, number];
};

function proficiencyBonus(level: number): number {
  return 2 + Math.floor((level - 1) / 4);
}

/** "roll.attack.*" matches "roll.attack.weapon.ranged"; an exact selector matches only itself. */
export function selectorMatches(selector: string, key: string): boolean {
  if (selector === key) return true;
  if (selector.endsWith(".*")) return key.startsWith(selector.slice(0, -1));
  return false;
}

/**
 * Computes the full derived sheet. Pure: the same character and content
 * always give the same result, and nothing is stored back on the character.
 */
export function derive(c: Character, reg: ContentRegistry): DerivedSheet {
  const warnings: string[] = [];
  const sources = collectSources(c, reg);
  const level = c.classes.reduce((t, cl) => t + cl.level, 0);
  const pb = proficiencyBonus(level);
  const classLevels = Object.fromEntries(c.classes.map((cl) => [cl.class, cl.level]));

  // Equipment state the conditions need.
  const equipped = c.inventory
    .filter((i) => i.equipped)
    .map((i) => ({ inst: i, def: reg.get(i.item, "item") }));
  const armorWorn = equipped.find((e) => e.def.category === "armor" && e.def.armor);
  const shieldHeld = equipped.find((e) => e.def.category === "shield");

  const attunedCount = c.inventory.filter((i) => i.attuned).length;
  if (attunedCount > 3) warnings.push(`${attunedCount} items attuned; the limit is 3.`);

  // Ability scores: base, fixed bonuses, then bonuses to abilities the player picked.
  const chosenBonus = (s: Source, ab: Ability): number => {
    const ch = s.grant.abilityChoice;
    if (!ch) return 0;
    const picked = s.choices[ch.choice] ?? [];
    return picked.includes(ab) ? ch.amount : 0;
  };
  for (const s of sources) {
    const ch = s.grant.abilityChoice;
    const def = ch && reg.has(s.id) ? (reg.find(s.id, "race") ?? reg.find(s.id, "feat") ?? reg.find(s.id, "feature")) : undefined;
    const newOnly = (def as { choices?: { id: string; newOnly?: boolean }[] } | undefined)?.choices?.find((x) => x.id === ch?.choice)?.newOnly;
    if (newOnly && !c.builtInApp) continue;
    if (ch && !(s.choices[ch.choice]?.length)) warnings.push(`${s.label}: choice "${ch.choice}" has not been made.`);
  }
  const abilities = {} as Record<Ability, AbilityResult>;
  for (const ab of ABILITIES) {
    const parts: Part[] = [{ label: "Base score", value: c.abilities[ab] ?? 10 }];
    for (const s of sources) {
      const bonus = (s.grant.abilityBonuses?.[ab] ?? 0) + chosenBonus(s, ab);
      if (bonus) parts.push({ label: s.label, value: bonus });
    }
    for (const a of c.asi) {
      const n = a.abilities?.[ab];
      if (n) parts.push({ label: `Ability Score Improvement (${reg.find(a.class, "class")?.name ?? a.class} ${a.level})`, value: n });
    }
    const score = sum(parts);
    if (score.total > 20) warnings.push(`${ABILITY_NAMES[ab]} is ${score.total}, above the usual maximum of 20.`);
    abilities[ab] = { score, modifier: Math.floor((score.total - 10) / 2) };
  }
  const mods = Object.fromEntries(ABILITIES.map((a) => [a, abilities[a].modifier])) as Record<Ability, number>;
  const ctx: ExprContext = { pb, mods, level, classLevels };

  /** Expression context for one source: its level tables resolved at the character's class level. */
  const ctxCache = new Map<Source, ExprContext>();
  const ctxFor = (s: Source): ExprContext => {
    if (s.slotLevel !== undefined) return { ...ctx, slotLevel: s.slotLevel };
    if (!s.scaling) return ctx;
    const cached = ctxCache.get(s);
    if (cached) return cached;
    const scale: Record<string, ValueExpr> = {};
    for (const [name, sc] of Object.entries(s.scaling)) {
      const lvl = classLevels[sc.class] ?? 0;
      const row = [...sc.table].sort((a, b) => a[0] - b[0]).filter(([at]) => at <= lvl).at(-1);
      scale[name] = row ? row[1] : 0;
    }
    const result = { ...ctx, scale };
    ctxCache.set(s, result);
    return result;
  };

  // Proficiencies.
  const profs: Record<Exclude<Proficiency["kind"], "skillOrExpertise">, Set<string>> = {
    save: new Set(),
    skill: new Set(),
    expertise: new Set(),
    armor: new Set(),
    weapon: new Set(),
    tool: new Set(),
    language: new Set(),
  };
  const resolveTargets = (p: Proficiency, s: Source): string[] => {
    if (typeof p.target === "string") return [p.target];
    const chosen = s.choices[p.target.choice];
    if (!chosen || chosen.length === 0) {
      warnings.push(`${s.label}: choice "${p.target.choice}" has not been made.`);
      return [];
    }
    return chosen;
  };
  const upgrades: string[] = [];
  for (const s of sources) {
    for (const p of s.grant.proficiencies ?? []) {
      for (const t of resolveTargets(p, s)) {
        if (p.kind === "skillOrExpertise") upgrades.push(t);
        else profs[p.kind].add(t);
      }
    }
  }
  // Proficiency, or expertise when another source already gives proficiency.
  for (const t of upgrades) {
    if (profs.skill.has(t)) profs.expertise.add(t);
    else profs.skill.add(t);
  }

  // Modifiers.
  const active: ActiveMod[] = sources.flatMap((source) => (source.grant.modifiers ?? []).map((mod) => ({ mod, source })));

  const conditionState = (when: Condition | undefined): "pass" | "fail" | "unknown" => {
    if (!when) return "pass";
    if (when.noArmor && armorWorn) return "fail";
    if (when.withArmor && !armorWorn) return "fail";
    if (when.noHeavyArmor && armorWorn?.def.armor?.category === "heavy") return "fail";
    if (when.noShield && shieldHeld) return "fail";
    if (when.withShield && !shieldHeld) return "fail";
    for (const [ab, min] of Object.entries(when.minScore ?? {})) {
      if (abilities[ab as Ability].score.total < (min ?? 0)) return "fail";
    }
    if (when.toggle && !c.toggles.includes(when.toggle)) return "fail";
    if (when.text) return "unknown";
    return "pass";
  };

  const labelOf = (a: ActiveMod) => a.mod.label ?? a.source.label;
  const flatOf = (a: ActiveMod) => (a.mod.value === undefined ? 0 : evalFlat(a.mod.value, ctxFor(a.source)));

  /** Modifiers that touch any of `keys`. Item-scoped selectors only count for that item. */
  const modsFor = (keys: string[], itemInstanceId?: string): ActiveMod[] => {
    const found = active.filter((a) => {
      if (a.mod.selector.startsWith("item.")) {
        if (!itemInstanceId || a.source.itemInstanceId !== itemInstanceId) return false;
      }
      return keys.some((k) => selectorMatches(a.mod.selector, k));
    });
    // Same stacking key: keep the strongest flat value, else the first.
    const best = new Map<string, ActiveMod>();
    const rest: ActiveMod[] = [];
    const strength = (m: ActiveMod) => {
      try {
        return flatOf(m);
      } catch {
        return 0;
      }
    };
    for (const a of found) {
      const key = a.mod.stackingKey;
      if (!key) {
        rest.push(a);
        continue;
      }
      const current = best.get(key);
      if (!current || strength(a) > strength(current)) best.set(key, a);
    }
    return [...rest, ...best.values()];
  };

  const describeEffect = (a: ActiveMod): string => {
    const m = a.mod;
    if (m.op === "advantage" || m.op === "disadvantage") return m.op;
    if (m.value === undefined) return m.op;
    return evalExpr(m.value, ctxFor(a.source))
      .map((t) => (t.kind === "dice" ? signedDice(t.dice) : signed(t.value)))
      .join(" ");
  };

  /** Builds a d20-roll (or damage) breakdown from base parts plus every matching modifier. */
  const roll = (keys: string[], base: Part[], itemInstanceId?: string): RollBreakdown => {
    const parts = [...base];
    const dice: DicePart[] = [];
    const advantage: string[] = [];
    const disadvantage: string[] = [];
    const suggestions: Suggestion[] = [];

    let critAt: number | undefined;
    let minD20: number | undefined;
    const autoFail: string[] = [];
    const notes: string[] = [];
    for (const a of modsFor(keys, itemInstanceId)) {
      const { mod } = a;
      if (mod.op === "autoFail") {
        if (conditionState(mod.when) === "pass") autoFail.push(labelOf(a));
        continue;
      }
      if ((mod.op === "critRange" || mod.op === "minD20") && mod.value !== undefined && conditionState(mod.when) === "pass") {
        const v = flatOf(a);
        if (mod.op === "critRange") critAt = Math.min(critAt ?? 20, v);
        else minD20 = Math.max(minD20 ?? 1, v);
        continue;
      }
      if (mod.op === "note") {
        if (conditionState(mod.when) !== "fail" && mod.label) notes.push(mod.label);
        continue;
      }
      if (!["add", "advantage", "disadvantage"].includes(mod.op)) continue;
      const state = conditionState(mod.when);
      if (state === "fail") continue;
      if (state === "unknown" || mod.mode === "suggested") {
        const apply: Suggestion["apply"] = { flat: 0, dice: [] };
        if (mod.op === "advantage" || mod.op === "disadvantage") apply.mode = mod.op;
        else if (mod.value !== undefined) {
          for (const term of evalExpr(mod.value, ctxFor(a.source))) {
            if (term.kind === "dice") apply.dice.push(term.dice);
            else apply.flat += term.value;
          }
        }
        if (mod.damageType) apply.damageType = mod.damageType;
        const s: Suggestion = { label: labelOf(a), effect: describeEffect(a), apply };
        if (mod.when?.text) s.reason = mod.when.text;
        if (mod.oncePerTurn) s.oncePerTurn = true;
        suggestions.push(s);
        continue;
      }
      if (mod.op === "advantage") advantage.push(labelOf(a));
      else if (mod.op === "disadvantage") disadvantage.push(labelOf(a));
      else if (mod.value !== undefined) {
        for (const term of evalExpr(mod.value, ctxFor(a.source))) {
          if (term.kind === "dice") {
            const d: DicePart = { label: labelOf(a), dice: term.dice };
            if (mod.damageType) d.damageType = mod.damageType;
            dice.push(d);
          } else parts.push({ label: term.label ? `${labelOf(a)} (${term.label})` : labelOf(a), value: term.value });
        }
      }
    }
    const result: RollBreakdown = { ...sum(parts), dice, advantage, disadvantage, suggestions };
    if (critAt !== undefined && critAt < 20) result.critAt = critAt;
    if (minD20 !== undefined && minD20 > 1) result.minD20 = minD20;
    if (autoFail.length) result.autoFail = autoFail;
    if (notes.length) result.notes = notes;
    return result;
  };

  /** Flat additions to a stat (AC, speed, HP max); dice are not allowed here. */
  const statAdds = (key: string): Part[] => {
    const parts: Part[] = [];
    for (const a of modsFor([key])) {
      if (a.mod.op !== "add" || a.mod.value === undefined) continue;
      if (conditionState(a.mod.when) !== "pass" || a.mod.mode === "suggested") continue;
      parts.push({ label: labelOf(a), value: flatOf(a) });
    }
    return parts;
  };

  /**
   * A stat with every rule applied in order: base parts and additions, then
   * multipliers (rounded down), then caps ("set": the value becomes at most N).
   * Each step shows up as a line, so "Exhaustion 2: speed halved" reads as -20.
   */
  const statWith = (key: string, base: Part[]): Breakdown => {
    const parts = [...base, ...statAdds(key)];
    const applicable = modsFor([key]).filter((a) => a.mod.value !== undefined && a.mod.mode !== "suggested" && conditionState(a.mod.when) === "pass");
    for (const a of applicable.filter((x) => x.mod.op === "multiply")) {
      const before = sum(parts).total;
      const factor = Number(a.mod.value);
      const after = Math.floor(before * factor);
      parts.push({ label: `${labelOf(a)} (×${factor})`, value: after - before });
    }
    for (const a of applicable.filter((x) => x.mod.op === "set")) {
      const before = sum(parts).total;
      const cap = flatOf(a);
      if (before > cap) parts.push({ label: `${labelOf(a)} (${cap})`, value: cap - before });
    }
    return sum(parts);
  };

  const abilityPart = (ab: Ability): Part => ({ label: `${ABILITY_NAMES[ab]} modifier`, value: mods[ab] });
  const pbPart = (times = 1): Part =>
    times === 2 ? { label: "Expertise (2 × proficiency)", value: pb * 2 } : { label: "Proficiency bonus", value: pb };

  // Saving throws.
  const saves = {} as Record<Ability, SaveResult>;
  for (const ab of ABILITIES) {
    const proficient = profs.save.has(ab);
    const base = [abilityPart(ab), ...(proficient ? [pbPart()] : [])];
    saves[ab] = { ...roll([`roll.save.${ab}`], base), proficient };
  }

  // Skills.
  const skills = {} as Record<Skill, SkillResult>;
  for (const sk of SKILLS) {
    const ab = SKILL_ABILITY[sk];
    const proficiency: 0 | 1 | 2 = profs.expertise.has(sk) ? 2 : profs.skill.has(sk) ? 1 : 0;
    if (profs.expertise.has(sk) && !profs.skill.has(sk)) {
      warnings.push(`${SKILL_NAMES[sk]}: expertise without proficiency.`);
    }
    const base = [abilityPart(ab), ...(proficiency > 0 ? [pbPart(proficiency)] : [])];
    skills[sk] = { ...roll([`roll.check.skill.${sk}`, `roll.check.${ab}`], base), ability: ab, proficiency };
  }

  const passive = (sk: Skill): Breakdown => {
    const s = skills[sk];
    const parts: Part[] = [{ label: "Base", value: 10 }, ...s.parts, ...statAdds(`stat.passive.${sk}`)];
    if (s.advantage.length && !s.disadvantage.length) parts.push({ label: `Advantage (${s.advantage.join(", ")})`, value: 5 });
    if (s.disadvantage.length && !s.advantage.length) parts.push({ label: `Disadvantage (${s.disadvantage.join(", ")})`, value: -5 });
    return sum(parts);
  };

  // Armor Class: the best base formula, then shield and flat bonuses.
  const acCandidates: Part[][] = [];
  if (armorWorn?.def.armor) {
    const a = armorWorn.def.armor;
    const parts: Part[] = [{ label: armorWorn.inst.name ?? armorWorn.def.name, value: a.base }];
    if (armorWorn.def.magic?.bonus) parts.push({ label: "Magic armor", value: armorWorn.def.magic.bonus });
    if (a.category === "light") parts.push(abilityPart("dex"));
    if (a.category === "medium") {
      const caps = modsFor(["stat.ac"]).filter(
        (m) => m.mod.op === "mediumArmorDexCap" && m.mod.value !== undefined && conditionState(m.mod.when) === "pass",
      );
      const cap = Math.max(2, ...caps.map(flatOf));
      parts.push(mods.dex > cap ? { label: `Dexterity modifier (max ${cap})`, value: cap } : abilityPart("dex"));
    }
    acCandidates.push(parts);
  } else {
    acCandidates.push([{ label: "Unarmored", value: 10 }, abilityPart("dex")]);
  }
  for (const a of modsFor(["stat.ac"])) {
    if (a.mod.op !== "acBase" || a.mod.value === undefined) continue;
    if (conditionState(a.mod.when) !== "pass" || a.mod.mode === "suggested") continue;
    acCandidates.push(
      evalExpr(a.mod.value, ctxFor(a.source)).map((t) => {
        if (t.kind === "dice") throw new Error(`AC formula cannot contain dice (${labelOf(a)})`);
        return { label: t.label ?? labelOf(a), value: t.value };
      }),
    );
  }
  const bestAc = acCandidates.reduce((best, cand) => (sum(cand).total > sum(best).total ? cand : best));
  const acParts = [...bestAc];
  if (shieldHeld) {
    acParts.push({ label: shieldHeld.inst.name ?? shieldHeld.def.name, value: shieldHeld.def.shieldBonus ?? 2 });
    if (shieldHeld.def.magic?.bonus) acParts.push({ label: "Magic shield", value: shieldHeld.def.magic.bonus });
  }
  acParts.push(...statAdds("stat.ac"));
  const ac = sum(acParts);

  // Initiative is a Dexterity check, so check bonuses apply too.
  const initiative = roll(["roll.initiative", "roll.check.dex"], [abilityPart("dex")]);

  // Speed.
  const race = reg.get(c.race, "race");
  const speed = statWith("stat.speed.walk", [{ label: race.name, value: race.speed }]);

  // Hit points.
  const hpParts: Part[] = [];
  const hitDice: DerivedSheet["hitDice"] = [];
  c.classes.forEach((cl, index) => {
    const def = reg.get(cl.class, "class");
    const avg = def.hitDie / 2 + 1;
    let levelsLeft = cl.level;
    if (index === 0) {
      hpParts.push({ label: `${def.name} level 1 (d${def.hitDie} maximum)`, value: def.hitDie });
      levelsLeft -= 1;
    }
    if (levelsLeft > 0) {
      const rolls = cl.hpRolls ?? [];
      const total = Array.from({ length: levelsLeft }, (_, i) => rolls[i] ?? avg).reduce((t, v) => t + v, 0);
      const how = rolls.length >= levelsLeft ? "rolled" : rolls.length === 0 ? `average ${avg} each` : "rolled and average";
      const more = index === 0 ? ` ${levelsLeft} more level${levelsLeft > 1 ? "s" : ""}` : ` ${levelsLeft} level${levelsLeft > 1 ? "s" : ""}`;
      hpParts.push({ label: `${def.name}${more} (${how})`, value: total });
    }
    const die = `d${def.hitDie}`;
    const existing = hitDice.find((h) => h.die === die);
    if (existing) existing.total += cl.level;
    else hitDice.push({ die, total: cl.level, used: c.hitDiceUsed[die] ?? 0 });
  });
  hpParts.push({ label: `Constitution modifier × ${level} levels`, value: mods.con * level });
  const hpMax = statWith("stat.hp.max", hpParts);

  // Rule permissions (Dual Wielder, Two-Weapon Fighting style).
  const allowed = (key: string) => modsFor([key]).some((a) => a.mod.op === "allow" && conditionState(a.mod.when) === "pass");
  const rules = { twoWeaponNonLight: allowed("rule.twoWeapon.nonLight"), twoWeaponAbility: allowed("rule.twoWeapon.ability") };

  // Attacks: every weapon carried (switching weapons needs no edit), plus attacks features grant.
  const attacks: WeaponAttack[] = [];
  const buildAttacks = (
    w: WeaponLike,
    o: {
      attackId: string;
      name: string;
      proficient: boolean;
      magicBonus?: number;
      itemInstanceId?: string;
      action: "attack" | "bonus";
      offHand?: boolean;
      requires?: { attack: string; text: string };
    },
  ) => {
    const ability: Ability = w.kind === "ranged" ? "dex" : w.properties.includes("finesse") && mods.dex > mods.str ? "dex" : "str";
    const magic = o.magicBonus ? [{ label: "Magic weapon", value: o.magicBonus }] : [];
    const modes: WeaponAttack["mode"][] = [w.kind];
    if (w.kind === "melee" && w.properties.includes("thrown")) modes.push("thrown");

    for (const mode of modes) {
      const thrown = mode === "thrown";
      const attackKeys = [`roll.attack.weapon.${mode}`, "item.attack", `attack.${o.attackId}`];
      const damageKeys = [`roll.damage.weapon.${mode}`, "item.damage", `damage.${o.attackId}`];
      if (o.offHand) {
        attackKeys.push("roll.attack.weapon.offhand");
        damageKeys.push("roll.damage.weapon.offhand");
      }
      if (thrown) {
        attackKeys.push(`attack.${o.attackId}.thrown`);
        damageKeys.push(`damage.${o.attackId}.thrown`);
      }
      const attack = roll(attackKeys, [abilityPart(ability), ...(o.proficient ? [pbPart()] : []), ...magic], o.itemInstanceId);
      // Two-weapon fighting: no ability modifier on the off-hand damage unless it's negative, or with the Two-Weapon Fighting style.
      const offHandAbility = !o.offHand || mods[ability] < 0 || rules.twoWeaponAbility;
      const bonus = roll(damageKeys, [...(offHandAbility ? [abilityPart(ability)] : []), ...magic], o.itemInstanceId);
      const critMods = modsFor(damageKeys, o.itemInstanceId).filter((a) => conditionState(a.mod.when) === "pass");
      const onCrit = critMods.filter((a) => a.mod.op === "critBonusDamage").map((a) => ({ label: labelOf(a), value: flatOf(a) }));
      const critExtraDice = critMods.filter((a) => a.mod.op === "extraCritDice").map((a) => ({ label: labelOf(a), value: flatOf(a) }));

      const entry: WeaponAttack = {
        attackId: o.attackId,
        name: o.offHand ? `${o.name} (off-hand${thrown ? ", thrown" : ""})` : thrown ? `${o.name} (thrown)` : o.name,
        mode,
        action: o.action,
        ability,
        proficient: o.proficient,
        attack,
        damage: { dice: w.damage, type: w.damageType, bonus, onCrit, critExtraDice },
        properties: w.properties,
      };
      if (o.itemInstanceId) entry.itemInstanceId = o.itemInstanceId;
      if (w.versatileDamage && !thrown) entry.damage.versatileDice = w.versatileDamage;
      if (w.range && mode !== "melee") entry.range = w.range;
      if (o.offHand) entry.offHand = true;
      if (o.requires) entry.requires = o.requires;
      attacks.push(entry);
    }
  };

  for (const inst of c.inventory) {
    const def = reg.get(inst.item, "item");
    const w = def.weapon;
    if (!w) continue;
    const proficient = profs.weapon.has(w.category) || profs.weapon.has(w.group);
    if (!proficient) warnings.push(`${inst.name ?? def.name}: not proficient, so no proficiency bonus on attacks.`);
    const o: Parameters<typeof buildAttacks>[1] = { attackId: def.id, name: inst.name ?? def.name, proficient, itemInstanceId: inst.id, action: "attack" };
    if (def.magic?.bonus) o.magicBonus = def.magic.bonus;
    buildAttacks(w, o);
    // Every one-handed melee weapon can be the off-hand weapon of two-weapon fighting (bonus action).
    if (w.kind === "melee" && !w.properties.includes("two-handed")) buildAttacks(w, { ...o, action: "bonus", offHand: true });
  }
  for (const s of sources) {
    for (const a of s.grant.attacks ?? []) {
      // Damage can grow with level (Martial Arts: "scale.die" is 1d4, then 1d6 at 5th...).
      const dice = a.damage.startsWith("scale.") ? evalExpr(a.damage, ctxFor(s)).find((x) => x.kind === "dice") : undefined;
      const w: AttackDef = dice && dice.kind === "dice" ? { ...a, damage: dice.dice } : a;
      const o: Parameters<typeof buildAttacks>[1] = { attackId: a.id, name: a.name, proficient: true, action: a.action };
      if (a.requires) o.requires = a.requires;
      buildAttacks(w, o);
    }
  }

  // Spellcasting: classes that have reached their casting level, plus feats and features.
  const casters: { id: string; label: string; ability: Ability }[] = [];
  const casterLevels: { progression: SpellcastingDef["progression"]; level: number }[] = [];
  const resolveAbility = (sc: SpellcastingDef, s?: Source): Ability | undefined => {
    if (typeof sc.ability === "string") return sc.ability;
    const picked = s?.choices[sc.ability.choice]?.[0];
    if (!picked) warnings.push(`${s?.label ?? sc.label}: choose the spellcasting ability ("${sc.ability.choice}").`);
    return picked as Ability | undefined;
  };
  for (const cl of c.classes) {
    const def = reg.get(cl.class, "class");
    if (!def.spellcasting) continue;
    casterLevels.push({ progression: def.spellcasting.progression, level: cl.level });
    const ability = resolveAbility(def.spellcasting);
    if (ability && cl.level >= (def.spellcastingFromLevel ?? 1)) casters.push({ ...def.spellcasting, ability });
  }
  for (const s of sources) {
    const sc = s.grant.spellcasting;
    if (!sc || casters.some((x) => x.id === sc.id)) continue;
    const ability = resolveAbility(sc, s);
    if (ability) casters.push({ id: sc.id, label: sc.label, ability });
  }
  const spellcasting: SpellcastingResult[] = casters.map((sc) => ({
    id: sc.id,
    label: sc.label,
    ability: sc.ability,
    saveDc: sum([{ label: "Base", value: 8 }, pbPart(), abilityPart(sc.ability), ...statAdds("stat.spell.dc")]),
    attack: sum([pbPart(), abilityPart(sc.ability), ...statAdds("stat.spell.attack")]),
  }));
  const slots = spellSlots(casterLevels);

  // Resources.
  const resources: ResourceResult[] = [];
  for (const s of sources) {
    for (const r of s.grant.resources ?? []) {
      const max = Math.max(r.min ?? 0, evalFlat(r.max, ctxFor(s)));
      const used = Math.min(c.resourcesUsed[r.id] ?? 0, max);
      const shortNow = r.shortFrom && (c.classes.find((x) => x.class === r.shortFrom!.class)?.level ?? 0) >= r.shortFrom.level;
      const entry: ResourceResult = { id: r.id, name: r.name, max, used, remaining: max - used, reset: shortNow ? "short" : r.reset, source: s.label };
      if (r.die) {
        const terms = evalExpr(r.die, ctxFor(s));
        const die = terms[0];
        entry.die = die && die.kind === "dice" ? die.dice.replace(/^1d/, "d") : r.die;
      }
      if (r.pool) entry.pool = { sides: r.pool.sides, values: c.pools[r.id] ?? [] };
      resources.push(entry);
    }
  }

  // Spells: class lists from the character, plus spells features grant or let the player pick.
  const spellDefs = new Map<string, { def: ReturnType<typeof reg.get<"spell">> | undefined; list: string; prepared: boolean; granted?: GrantedSpellRef }>();
  type GrantedSpellRef = { resource?: string; from?: string };
  for (const inst of c.spells) {
    spellDefs.set(`${inst.list}|${inst.spell}`, { def: reg.has(inst.spell) ? reg.get(inst.spell, "spell") : undefined, list: inst.list, prepared: inst.prepared });
    if (!reg.has(inst.spell)) warnings.push(`Spell "${inst.spell}" isn't in any content pack.`);
  }
  // Prepared casters other than wizards (cleric, druid, paladin) prepare from their whole class list.
  for (const cl of c.classes) {
    const def = reg.find(cl.class, "class");
    const sc = def?.spellcasting;
    if (!def || !sc || def.spellPreparation !== "prepared" || def.id === "class:wizard") continue;
    const max = maxSpellLevel(def, cl.level);
    const listName = def.id.replace(/^class:/, "");
    for (const sp of reg.list("spell")) {
      if (sp.level < 1 || sp.level > max || !sp.classes.includes(listName)) continue;
      const key = `${sc.id}|${sp.id}`;
      if (!spellDefs.has(key)) spellDefs.set(key, { def: sp, list: sc.id, prepared: false });
    }
  }
  for (const s of sources) {
    const ownList = s.grant.spellcasting?.id;
    for (const g of s.grant.spells ?? []) {
      const list = g.list ?? ownList ?? casters[0]?.id ?? "innate";
      const granted: GrantedSpellRef = { from: s.label };
      if (g.resource) granted.resource = g.resource;
      spellDefs.set(`${list}|${g.spell}`, { def: reg.has(g.spell) ? reg.get(g.spell, "spell") : undefined, list, prepared: true, granted });
    }
    // Spells picked through a feature's spell choices (Magic Initiate, Fey Touched).
    if (ownList && reg.has(s.id)) {
      const d = reg.get(s.id, s.id.startsWith("feat:") ? "feat" : "feature") as { choices?: { id: string; kind: string; resource?: string }[] };
      for (const ch of d.choices ?? []) {
        if (ch.kind !== "spell") continue;
        for (const id of s.choices[ch.id] ?? []) {
          const def = reg.has(id) ? reg.get(id, "spell") : undefined;
          const granted: GrantedSpellRef = {};
          if (def && def.level > 0 && ch.resource) {
            granted.resource = ch.resource;
            // "Magic Initiate: free 1st-level spell" becomes "Magic Initiate: Guiding Bolt".
            const res = resources.find((r) => r.id === ch.resource);
            if (res) res.name = `${res.name.split(":")[0]}: ${def.name}`;
          }
          spellDefs.set(`${ownList}|${id}`, { def, list: ownList, prepared: true, granted });
        }
      }
    }
  }
  const preparedLists = new Set(
    c.classes.map((cl) => reg.get(cl.class, "class")).filter((d) => d.spellPreparation === "prepared" && d.spellcasting).map((d) => d.spellcasting!.id),
  );
  const classLists = new Set(c.classes.map((cl) => reg.get(cl.class, "class").spellcasting?.id).filter(Boolean) as string[]);
  const pactList = c.classes.map((cl) => reg.get(cl.class, "class")).find((d) => d.spellcasting?.progression === "pact")?.spellcasting?.id;
  const slotsTotal = slots.slots;
  const modFor = (list: string) => {
    const sc = spellcasting.find((x) => x.id === list);
    return sc ? mods[sc.ability] : 0;
  };
  const pickByLevel = (table: Record<string, string>, level: number) => {
    const keys = Object.keys(table).map(Number).filter((k) => k <= level).sort((a, b) => a - b);
    const k = keys.at(-1) ?? Math.min(...Object.keys(table).map(Number));
    return table[String(k)]!;
  };
  const spells: SpellResult[] = [];
  for (const { def, list, prepared, granted } of spellDefs.values()) {
    if (!def) continue;
    const sc = spellcasting.find((x) => x.id === list);
    const listLabel = sc?.label ?? list;
    const mod = modFor(list);
    const withMod = (dice: string) => dice.replace(/\bMOD\b/g, String(mod)).replace(/\+\s*-/g, "- ").replace(/\s+/g, "");
    const castLevels = def.level === 0 ? [0] : slotsTotal.map((n, i) => (n > 0 ? i + 1 : 0)).filter((l) => l >= def.level);
    const r: SpellResult = {
      id: def.id,
      name: def.name,
      level: def.level,
      school: def.school,
      castingTime: def.castingTime,
      range: def.range,
      components: def.components,
      duration: def.duration,
      concentration: def.concentration,
      ritual: def.ritual,
      text: def.text,
      higherLevels: def.higherLevels,
      placeholder: def.text.length === 0,
      source: def.source.book ?? def.source.pack,
      list: { id: list, label: listLabel },
      ready: def.level === 0 || granted || !preparedLists.has(list) ? "always" : prepared ? "prepared" : "not prepared",
      cast: { slotLevels: list === pactList ? [] : castLevels.filter((l) => l > 0) },
    };
    if (def.material) r.material = def.material;
    if (def.summary) r.summary = def.summary;
    if (granted?.from && granted.from !== listLabel) r.fromFeature = granted.from;
    else if (!classLists.has(list) && sc) r.fromFeature = listLabel;
    const beams = BEAMS[def.id];
    if (beams) {
      const byLevel: Record<number, number> = {};
      if (beams.byCharacterLevel) byLevel[0] = beams.byCharacterLevel(level);
      else for (let l = def.level; l <= 9; l++) byLevel[l] = beams.bySlot!(l);
      r.beams = { byLevel, what: beams.what };
    }
    const timer = durationTimer(def.duration);
    if (timer) r.timer = timer;
    if (sc && def.attack) {
      r.attack = roll([`roll.attack.spell.${def.attack}`], [pbPart(), abilityPart(sc.ability), ...statAdds("stat.spell.attack")]);
    }
    if (sc && def.save) r.save = { ability: def.save.ability, dc: sc.saveDc.total, onSuccess: def.save.onSuccess };
    const levelsFor = (table?: Record<string, string>, byCharacter = false) => {
      if (!table) return undefined;
      const out: Record<number, string> = {};
      if (byCharacter || def.level === 0) out[0] = withMod(pickByLevel(table, level));
      else for (let l = def.level; l <= 9; l++) out[l] = withMod(pickByLevel(table, l));
      return out;
    };
    if (def.damage) {
      const byLevel = levelsFor(def.damage.atSlot ?? def.damage.atCharacterLevel, !def.damage.atSlot);
      if (byLevel) r.damage = def.damage.type ? { type: def.damage.type, byLevel } : { byLevel };
      r.damageBonus = roll(["roll.damage.spell"], []);
    }
    if (def.heal) r.heal = { byLevel: levelsFor(def.heal.atSlot)! };
    if (list === pactList && slots.pact && def.level > 0 && def.level <= slots.pact.level) {
      r.cast.pact = { level: slots.pact.level, remaining: Math.max(0, slots.pact.count - c.pactSlotsUsed) };
    }
    if (granted?.resource) {
      const res = resources.find((x) => x.id === granted.resource);
      if (res) r.cast.free = { resource: res.id, name: res.name, remaining: res.remaining };
    }
    spells.push(r);
  }
  spells.sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));
  for (const sc of spellcasting) {
    if (!preparedLists.has(sc.id)) continue;
    const cl = c.classes.find((x) => reg.get(x.class, "class").spellcasting?.id === sc.id)!;
    const count = spells.filter((x) => x.list.id === sc.id && x.ready === "prepared").length;
    sc.prepared = { count, max: Math.max(1, mods[sc.ability] + cl.level) };
  }

  // Usable features, with their cost resolved against the resources above.
  const amountOf = (expr: ValueExpr, src: Source): Amount => {
    const terms = evalExpr(expr, ctxFor(src));
    const dice = terms.flatMap((t) => (t.kind === "dice" ? [t.dice] : []));
    const flat = terms.reduce((n, t) => n + (t.kind === "flat" ? t.value : 0), 0);
    const text = [...dice, ...(flat || !dice.length ? [String(flat)] : [])].join(" + ");
    return { dice, flat, text };
  };
  const actions: ActionResult[] = [];
  for (const s of sources) {
    for (const a of s.grant.actions ?? []) {
      const entry: ActionResult = { id: a.id, name: a.name, economy: a.economy, source: s.label, toggles: a.toggles };
      if (/^(feature|feat|race|background):/.test(s.id)) entry.featureId = s.id;
      if (a.roll) entry.roll = { ...amountOf(a.roll.dice, s), label: a.roll.label };
      if (a.duration) entry.duration = a.duration;
      if (a.notAfterMoving) entry.notAfterMoving = true;
      if (a.restores) entry.restores = a.restores;
      if (a.cost) {
        const free = spells.filter((sp) => sp.cast.free?.resource === a.cost!.resource).map((sp) => ({ id: sp.id, list: sp.list.id }));
        if (free.length) entry.spells = free;
        // "Magic Initiate spell (free)" becomes "Guiding Bolt (free)" once the spell is picked.
        const only = free.length === 1 ? spells.find((sp) => sp.id === free[0]!.id) : undefined;
        if (only && / spell \(free\)$/.test(a.name)) entry.name = `${only.name} (free)`;
      }
      if (a.stopsMovement) entry.stopsMovement = true;
      if (a.note) entry.note = a.note;
      if (a.cost) {
        const r = resources.find((x) => x.id === a.cost!.resource);
        if (!r) warnings.push(`${a.name}: its resource "${a.cost.resource}" doesn't exist.`);
        entry.cost = { resource: a.cost.resource, name: r?.name ?? a.cost.resource, amount: a.cost.amount, remaining: r?.remaining ?? 0 };
      }
      if (a.tempHp !== undefined) entry.tempHp = amountOf(a.tempHp, s);
      if (a.heal !== undefined) entry.heal = amountOf(a.heal, s);
      if (s.common) entry.common = true;
      for (const k of ["asAttack", "dash", "untilTurnStart", "endsConcentration", "infoOnly"] as const) if (a[k]) entry[k] = true;
      if (a.check) entry.check = a.check;
      if (a.choose) entry.choose = a.choose;
      if (a.extraAction) entry.extraAction = true;
      if (a.spendAmount) entry.spendAmount = a.spendAmount;
      actions.push(entry);
    }
  }

  // Defenses and senses.
  const defenses: DerivedSheet["defenses"] = { resist: [], immune: [], vulnerable: [] };
  for (const a of active) {
    const m = /^defense\.(resist|immune|vulnerable)\.(.+)$/.exec(a.mod.selector);
    if (!m || conditionState(a.mod.when) !== "pass" || a.mod.mode === "suggested") continue;
    const list = defenses[m[1] as keyof typeof defenses];
    if (!list.includes(m[2]!)) list.push(m[2]!);
  }
  const senses: Record<string, number> = {};
  for (const s of sources) {
    for (const [sense, range] of Object.entries(s.grant.senses ?? {})) senses[sense] = Math.max(senses[sense] ?? 0, range);
  }

  const effects: EffectResult[] = c.effects.map((e) => {
    const base = { instanceId: e.id, reminders: [] as string[], concentration: false, includes: [] as { id: string; name: string }[] };
    let r: EffectResult;
    const def = e.effect === "custom" ? undefined : reg.find(reg.effectId(e.effect), "effect");
    if (!def) {
      r = { ...base, id: e.effect, name: e.custom?.name ?? e.effect, category: "other" };
      if (!e.custom) warnings.push(`Effect "${e.effect}" isn't in the content pack.`);
    } else {
      const reminders = [...def.reminders];
      for (const inc of def.includes) reminders.push(...reg.get(inc, "effect").reminders);
      r = { ...base, id: def.id, name: def.name, category: def.category, concentration: def.concentration, reminders };
      if (def.summary) r.summary = def.summary;
      if (def.levels) {
        r.level = e.level ?? 1;
        r.maxLevel = def.levels.length;
      }
    }
    if (e.rounds !== undefined) r.rounds = e.rounds;
    if (e.minutes !== undefined) r.minutes = e.minutes;
    if (e.from) r.from = e.from;
    if (def?.choice) {
      r.choice = { label: def.choice.label, options: def.choice.options };
      if (e.choice) r.choice.value = e.choice;
    }
    if (def?.upcast) r.upcast = { baseLevel: def.upcast.baseLevel, castLevel: e.castLevel ?? def.upcast.baseLevel };
    if (def?.levelNotes) r.levelNotes = def.levelNotes;
    if (def?.endsOn) r.endsOn = def.endsOn;
    if (e.untilTurnStart) r.untilTurnStart = true;
    if (e.untilTurnStart && e.custom?.name.startsWith("Ready")) r.release = e.readied ? { spell: { id: e.readied.spell, list: e.readied.list, level: e.readied.level } } : {};
    if (def?.usedUp) {
      const label = def.modifiers.find((m) => m.label)?.label;
      if (label) r.usedUp = label;
    }
    if (def) {
      const walk = (ids: string[]) => {
        for (const id of ids) {
          const inc = reg.find(id, "effect");
          if (!inc || r.includes.some((x) => x.id === id)) continue;
          r.includes.push({ id, name: inc.name });
          walk(inc.includes);
        }
      };
      walk(def.includes);
    }
    return r;
  });

  const toggles: DerivedSheet["toggles"] = [];
  for (const a of active) {
    const name = a.mod.when?.toggle;
    if (!name || toggles.some((t) => t.name === name)) continue;
    // The action that switches it on names it best ("Form of Dread"); a note's label is a sentence, so fall back to the source.
    const switcher = actions.find((x) => x.toggles.includes(name));
    // Dodge shows as its own effect chip while it lasts, not as a switch.
    if (switcher?.common) continue;
    const byAction = switcher?.name;
    const label = byAction ?? (a.mod.op === "note" ? a.source.label : labelOf(a));
    toggles.push({ name, label, on: c.toggles.includes(name) });
  }

  const sheet: DerivedSheet = {
    toggles,
    level,
    proficiencyBonus: pb,
    abilities,
    saves,
    skills,
    passives: { perception: passive("perception"), investigation: passive("investigation"), insight: passive("insight") },
    ac,
    initiative,
    speed,
    hpMax,
    hitDice,
    attacks,
    actions,
    spells,
    effects,
    spellcasting,
    spellSlots: slots.slots.map((total, i) => ({ level: i + 1, total, used: Math.min(total, c.slotsUsed[String(i + 1)] ?? 0) })),
    resources,
    proficiencies: {
      armor: [...profs.armor],
      weapons: [...profs.weapon],
      tools: [...profs.tool],
      languages: [...profs.language],
    },
    defenses,
    senses,
    features: featureEntries(sources, reg),
    companions: sources.flatMap((s) => (s.grant.companions ?? []).map((d) => deriveCompanion(d, s.label, c.companions[d.id], ctxFor(s), spellcasting))),
    rules,
    attacksPerAction: Math.max(
      sources.some((s) => /^feature:extra-attack/.test(s.id)) ? 2 : 1,
      ...sources.map((s) => (s.grant.extraAttacks !== undefined ? evalFlat(s.grant.extraAttacks, ctxFor(s)) : 1)),
    ),
    warnings,
  };
  if (slots.pact) sheet.pactSlots = slots.pact;
  if (c.concentration) sheet.concentration = c.concentration;
  return sheet;
}

/** The readable list of traits and features, one per definition. */
function featureEntries(sources: Source[], reg: ContentRegistry): FeatureEntry[] {
  const out: FeatureEntry[] = [];
  const seen = new Set<string>();
  for (const s of sources) {
    const kind = /^(race|background|feature|feat):/.exec(s.id)?.[1] as FeatureEntry["kind"] | undefined;
    if (!kind || seen.has(s.id)) continue;
    seen.add(s.id);
    const def = reg.find(s.id, kind);
    if (!def) continue;
    const e: FeatureEntry = { id: def.id, name: def.name, kind, source: [def.source.book, def.source.page ? `p. ${def.source.page}` : ""].filter(Boolean).join(" ") || def.source.pack };
    if (def.summary) e.summary = def.summary;
    if (def.text?.length) e.text = def.text;
    if (s.common) e.common = true;
    out.push(e);
  }
  return out;
}

/** Spells that make several separate attacks. */
const BEAMS: Record<string, { what: string; byCharacterLevel?: (lvl: number) => number; bySlot?: (slot: number) => number }> = {
  "spell:eldritch-blast": { what: "beams", byCharacterLevel: (l) => 1 + (l >= 5 ? 1 : 0) + (l >= 11 ? 1 : 0) + (l >= 17 ? 1 : 0) },
  "spell:scorching-ray": { what: "rays", bySlot: (s) => 3 + (s - 2) },
};

/** "Concentration, up to 1 minute" → 10 rounds; "8 hours" → 480 minutes; "Instantaneous" → nothing. */
export function durationTimer(duration: string): { rounds?: number; minutes?: number } | undefined {
  const m = /(\d+)\s*(round|minute|hour|day)s?/i.exec(duration);
  if (!m) return undefined;
  const n = Number(m[1]);
  const unit = m[2]!.toLowerCase();
  if (unit === "round") return { rounds: n };
  const minutes = unit === "minute" ? n : unit === "hour" ? n * 60 : n * 1440;
  return minutes <= 1 ? { rounds: minutes * 10 } : { minutes };
}
