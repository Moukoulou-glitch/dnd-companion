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
  type ChoiceDef,
} from "@dnd/schema";
import { sum, signed, signedDice, type Breakdown, type DicePart, type Part, type RollBreakdown, type Suggestion } from "./breakdown.js";
import { evalExpr, evalFlat, type ExprContext } from "./expr.js";
import { ACTION_DCS, FEATURE_DCS, type DcSpec } from "./dcs.js";
import { FEATURE_TAGS, TOGGLE_LABELS, TOGGLE_REMINDERS } from "./tags.js";
import { customActionDc, customFeatureId, withCustom } from "./custom.js";
import { maneuverGrant } from "./maneuvers.js";
import type { ContentRegistry } from "./registry.js";
import { collectSources, type Source } from "./sources.js";
import { deriveCompanion, type CompanionResult } from "./companions.js";
import { spellSlots } from "./spellSlots.js";
import { materialNeed } from "./materials.js";
import { deriveShape, wildShapeLimits, type ShapeResult, type WildShapeLimits } from "./shapes.js";

export interface AbilityResult {
  score: Breakdown;
  modifier: number;
  /** The highest the score may normally go: 20, or more from a permanent change (Manual of Gainful Exercise: 22). */
  max: number;
  /** Ability Score Improvements took the score above 20, which they can't do. */
  asiOver?: boolean;
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
  /** Shown with the attack (Shillelagh on a weapon that isn't a club or quarterstaff). */
  note?: string;
}

/** Spell scroll save DC and attack bonus by the scroll's level (DMG p. 200). */
const SCROLL_DC: Record<number, [number, number]> = { 0: [13, 5], 1: [13, 5], 2: [13, 5], 3: [15, 7], 4: [15, 7], 5: [17, 9], 6: [17, 9], 7: [18, 10], 8: [18, 10], 9: [19, 11] };

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
  /**
   * Ways to change its damage type: the spell's own choice (Chromatic Orb),
   * Transmuted Spell (1 sorcery point), Awakened Spellbook (a type from
   * another spellbook spell of the slot's level, so options by slot level).
   */
  typeChoices?: { kind: "spell" | "transmuted" | "awakened"; label: string; options: string[]; byLevel?: Record<number, string[]>; cost?: { resource: string; amount: number } }[];
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
    /** Cast without a slot whenever you like (an invocation's at-will spell). */
    atWill?: boolean;
    /** Given by the table beyond the rules: castable without a slot, with how often it's been cast since each rest. */
    extra?: { tag: string; sinceShort: number; sinceLong: number };
    /**
     * Read from a spell scroll (used up): its level, the save DC and attack bonus the scroll sets,
     * whether the spell is on one of your class lists, and the check to cast one above your level.
     */
    scroll?: { instanceId: string; level: number; dc: number; attack: number; onList: boolean; check?: { dc: number; ability: Ability; bonus: number } };
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
  /** Its own extra action once per turn (Haste), not your action. */
  limited?: boolean;
  spendAmount?: { label: string; heals?: boolean };
  flexibleCasting?: "toSlot" | "toPoints";
  asAttack?: boolean;
  dash?: boolean;
  untilTurnStart?: boolean;
  endsConcentration?: boolean;
  infoOnly?: boolean;
  /** The DC a creature saves against (Stunning Strike: your ki save DC). */
  dc?: FeatureDc;
}

export interface SpeedResult {
  mode: "fly" | "swim" | "climb";
  total: Breakdown;
  hover?: boolean;
}

/** A feature that's on by itself, shown as a tag. */
export interface FeatureTag {
  id: string;
  name: string;
  active: boolean;
  /** Why it's off right now. */
  why?: string;
  reminders: string[];
}

/** A feature's save DC, worked out, with what the save is. */
export interface FeatureDc {
  value: number;
  save: string;
  name: string;
  breakdown: Breakdown;
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
  dc?: FeatureDc;
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
  /** How the proficiency bonus adds up (level, and changes by hand). */
  proficiencyBreakdown: Breakdown;
  /** Fly, swim and climb speeds the character has now. */
  speeds: SpeedResult[];
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
  /** Tasha's optional class features within the character's levels, and whether each is in use. */
  optionalFeatures: { id: string; name: string; className: string; level: number; summary?: string; on: boolean }[];
  spellSlots: { level: number; total: number; used: number }[];
  pactSlots?: { count: number; level: number };
  resources: ResourceResult[];
  proficiencies: { armor: string[]; weapons: string[]; tools: string[]; languages: string[] };
  defenses: { resist: string[]; immune: string[]; vulnerable: string[] };
  senses: Record<string, number>;
  /** On/off states some active feature reads (Rage, Mage Armor, a lit Flame Tongue), for the UI to offer as switches. */
  toggles: { name: string; label: string; on: boolean; reminders?: string[] }[];
  /** Features that are on by themselves (Aura of Protection), with what they do; off while unconscious and so on. */
  featureTags: FeatureTag[];
  /** Race traits, background, class and subclass features, feats and table rules, in sheet order, with their text when loaded. */
  features: FeatureEntry[];
  /** Companions from features (Primal Companion), with their stat blocks. */
  companions: CompanionResult[];
  /** A druid's Wild Shape limits (CR, flying and swimming, hours, bonus action). */
  wildShape?: WildShapeLimits;
  /** The stat block in use while in Wild Shape or polymorphed. */
  shape?: ShapeResult;
  /** What the table gave beyond the rules, with a readable name and why. */
  extras: { id: string; kind: Character["extras"][number]["kind"]; value: string; name: string; tag: string; reason: string }[];
  /**
   * Material components a focus can't replace, for the spells the character
   * has (known, prepared, in the spellbook or granted), and whether they have them.
   */
  components: { spell: string; spellName: string; material: string; costly: boolean; consumed: boolean; have: boolean; count: number }[];
  /** Attacks per Attack action: 2 with Extra Attack. */
  attacksPerAction: number;
  /** Rule permissions: two-weapon fighting with non-light weapons (Dual Wielder), ability modifier on off-hand damage (the style). */
  rules: { twoWeaponNonLight: boolean; twoWeaponAbility: boolean; durable: boolean; heavyArmorMaster: boolean };
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
export function derive(c: Character, baseReg: ContentRegistry): DerivedSheet {
  // The character's own actions and spells join the content for this character.
  const reg = withCustom(baseReg, c);
  const warnings: string[] = [];
  const sources = collectSources(c, reg);
  const level = c.classes.reduce((t, cl) => t + cl.level, 0);
  // Proficiency bonus: by level, then changed by hand (at least +1... or whatever the DM says: never below 0).
  const pbAdj = c.pbAdjust ?? { bonus: 0, penalty: 0 };
  const pbWhy = pbAdj.note ? ` (${pbAdj.note})` : "";
  const pbBreakdown = sum([
    { label: `Level ${level}`, value: proficiencyBonus(level) },
    ...(pbAdj.bonus ? [{ label: `Bonus by hand${pbWhy}`, value: pbAdj.bonus }] : []),
    ...(pbAdj.penalty ? [{ label: `Penalty by hand${pbWhy}`, value: -pbAdj.penalty }] : []),
  ]);
  const pb = Math.max(0, pbBreakdown.total);
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
    let fromAsi = 0;
    for (const a of c.asi) {
      const n = a.abilities?.[ab];
      if (n) parts.push({ label: `Ability Score Improvement (${reg.find(a.class, "class")?.name ?? a.class} ${a.level})`, value: n });
      fromAsi += n ?? 0;
    }
    // "You can't increase an ability score above 20 using this feature" (PHB p. 15).
    const beforeHand = parts.reduce((t, p) => t + p.value, 0);
    const asiOver = fromAsi > 0 && beforeHand > 20;
    if (asiOver) warnings.push(`${ABILITY_NAMES[ab]} is ${beforeHand} from Ability Score Improvements, but they can't raise a score above 20. Take ${Math.min(fromAsi, beforeHand - 20)} back, or put it in another ability.`);
    // Permanent changes (Manual of Gainful Exercise: +2, and the maximum becomes 22; a curse: -1).
    const adj = c.abilityAdjust?.[ab];
    let max = 20;
    for (const p of adj?.permanent ?? []) {
      parts.push({ label: `${p.amount > 0 ? "Permanent bonus" : "Permanent penalty"}${p.from ? ` (${p.from})` : ""}`, value: p.amount });
      if (p.newMax) max = Math.max(max, p.newMax);
    }
    // Changed by hand: a bonus, a penalty (Strength drain), then "becomes N" (Amulet of Health) if that's higher.
    if (adj?.bonus) parts.push({ label: "Bonus (by hand)", value: adj.bonus });
    if (adj?.penalty) parts.push({ label: adj.penaltyEndsOnRest ? "Penalty (until a rest)" : "Penalty (by hand)", value: -adj.penalty });
    if (adj?.setTo !== undefined) {
      const now = parts.reduce((t, p) => t + p.value, 0);
      if (adj.setTo > now) parts.push({ label: `Becomes ${adj.setTo}${adj.setNote ? ` (${adj.setNote})` : ""}`, value: adj.setTo - now });
    }
    const score = sum(parts);
    if (score.total <= 0) warnings.push(`${ABILITY_NAMES[ab]} is ${score.total}: at 0 the character dies (Strength drain) or worse. Check with your DM.`);
    if (score.total > max && adj?.setTo === undefined && !asiOver) warnings.push(`${ABILITY_NAMES[ab]} is ${score.total}, above ${max === 20 ? "the usual maximum of 20" : `its maximum of ${max}`}.`);
    abilities[ab] = { score, modifier: Math.floor((score.total - 10) / 2), max, ...(asiOver ? { asiOver } : {}) };
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
  // Maneuvers: each known maneuver shows up where it's used, spending a die from its pool.
  {
    const pools = [
      { src: "feature:battle-master-combat-superiority", choice: "maneuvers", resource: "superiority-dice", die: "scale.die" },
      { src: "feat:martial-adept", choice: "maneuvers", resource: "martial-adept-superiority", die: "1d6" },
      { src: "feature:style-superior-technique", choice: "maneuver", resource: "superiority-dice-technique", die: "1d6" },
    ];
    const done = new Set<string>();
    const dc = 8 + pb + Math.max(mods.str, mods.dex);
    for (const p of pools) {
      const s = sources.find((x) => x.id === p.src);
      if (!s) continue;
      const names = (s.choices[p.choice] ?? []).filter((n) => !done.has(n));
      names.forEach((n) => done.add(n));
      if (!names.length) continue;
      const g = maneuverGrant(names, p.die, p.resource, dc);
      sources.push({ id: `${s.id}#maneuvers`, label: s.label, grant: g, choices: {}, ...(s.scaling ? { scaling: s.scaling } : {}) });
    }
  }
  const active: ActiveMod[] = sources.flatMap((source) => (source.grant.modifiers ?? []).map((mod) => ({ mod, source })));

  // Conditions on you, with what they include (Paralyzed includes Incapacitated); 0 HP counts as unconscious.
  const onYou = new Set<string>();
  const addCond = (id: string) => {
    if (onYou.has(id)) return;
    onYou.add(id);
    for (const inc of reg.find(id, "effect")?.includes ?? []) addCond(inc);
  };
  for (const e of c.effects) addCond(e.effect);
  const unconscious = onYou.has("condition:unconscious") || (c.hp.current <= 0 && !c.shape);
  const incapacitated = unconscious || onYou.has("condition:incapacitated");
  const paladinLevel = classLevels["class:paladin"] ?? 0;
  const fillTag = (t: string) =>
    t
      .replace(/\{cha\}/g, String(Math.max(1, mods.cha)))
      .replace(/\{wis\}/g, String(Math.max(1, mods.wis)))
      .replace(/\{pb\}/g, String(pb))
      .replace(/\{cleric\}/g, String(classLevels["class:cleric"] ?? 0))
      .replace(/\{range\}/g, paladinLevel >= 18 ? "30 ft" : "10 ft");

  const conditionState = (when: Condition | undefined): "pass" | "fail" | "unknown" => {
    if (!when) return "pass";
    if (when.conscious && unconscious) return "fail";
    if (when.notIncapacitated && incapacitated) return "fail";
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
    // Nothing added, something done (Stunning Strike: 1 ki on a hit).
    if (m.value === 0) return "on a hit";
    return evalExpr(m.value, ctxFor(a.source))
      .map((t) => (t.kind === "dice" ? signedDice(t.dice) : signed(t.value)))
      .join(" ");
  };

  // Your spell save DC, for reminders like a smite's save (the best one if you cast with several abilities).
  const spellDcText = (() => {
    const abs = c.classes.map((cl) => reg.find(cl.class, "class")?.spellcasting?.ability).filter((a): a is Ability => typeof a === "string");
    return abs.length ? `DC ${8 + pb + Math.max(...abs.map((a) => mods[a]))}` : "your spell save DC";
  })();
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
        if (mod.when?.text) s.reason = mod.when.text.replace(/\{spelldc\}/g, spellDcText);
        if (mod.oncePerTurn) s.oncePerTurn = true;
        if (mod.spends) s.spends = mod.spends;
        if (mod.group) s.group = mod.group;
        if (mod.preset) s.preset = mod.preset;
        if (a.source.effectInstanceId && mod.preset === "always") s.endsEffect = a.source.effectInstanceId;
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
    // Inspiration: advantage on an attack roll, saving throw or ability check, spent when used.
    if ((c.inspirations ?? 0) > 0 && keys.some((k) => /^roll\.(attack|save|check|initiative)/.test(k)) && !keys.some((k) => /^roll\.damage/.test(k)))
      suggestions.push({ label: "Inspiration", effect: "advantage", reason: `${c.inspirations} on hand; one is spent`, apply: { flat: 0, dice: [], mode: "advantage" } });
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

  /** Bonuses and penalties by hand ("save.all", "skill.stealth"), as breakdown lines. */
  const handParts = (key: string, what: string): Part[] => {
    const a = c.rollAdjust?.[key];
    if (!a) return [];
    const why = a.note ? ` (${a.note})` : "";
    return [...(a.bonus ? [{ label: `Bonus by hand, ${what}${why}`, value: a.bonus }] : []), ...(a.penalty ? [{ label: `Penalty by hand, ${what}${why}`, value: -a.penalty }] : [])];
  };

  // Saving throws.
  const saves = {} as Record<Ability, SaveResult>;
  for (const ab of ABILITIES) {
    const proficient = profs.save.has(ab);
    const base = [abilityPart(ab), ...(proficient ? [pbPart()] : []), ...handParts("save.all", "all saves"), ...handParts(`save.${ab}`, "this save")];
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
    const base = [abilityPart(ab), ...(proficiency > 0 ? [pbPart(proficiency)] : []), ...handParts("skill.all", "all skills"), ...handParts(`skill.${sk}`, "this skill")];
    skills[sk] = { ...roll([`roll.check.skill.${sk}`, `roll.check.${ab}`], base), ability: ab, proficiency };
  }

  const passive = (sk: Skill): Breakdown => {
    const s = skills[sk];
    const parts: Part[] = [{ label: "Base", value: 10 }, ...s.parts, ...statAdds(`stat.passive.${sk}`), ...handParts("passive.all", "all passives"), ...handParts(`passive.${sk}`, "this passive")];
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
  /** Swim, fly and climb speeds from features and effects: the best of each kind, then the same changes as walking (Grappled: 0). */
  const otherSpeeds = (walk: Breakdown): SpeedResult[] => {
    const out: SpeedResult[] = [];
    for (const mode of ["fly", "swim", "climb"] as const) {
      let best: { value: number; label: string; hover: boolean } | undefined;
      for (const a of modsFor([`stat.speed.${mode}`])) {
        if (a.mod.op !== "grantSpeed" || conditionState(a.mod.when) !== "pass" || a.mod.mode === "suggested") continue;
        const v = a.mod.value === "walk" ? walk.total : flatOf(a);
        const label = `${labelOf(a)}${a.mod.value === "walk" ? " (equal to walking)" : ""}`;
        if (!best || v > best.value) best = { value: v, label, hover: !!a.mod.hover || !!best?.hover };
        else if (a.mod.hover) best.hover = true;
      }
      if (best) out.push({ mode, total: statWith(`stat.speed.${mode}`, [{ label: best.label, value: best.value }]), ...(best.hover ? { hover: true } : {}) });
    }
    return out;
  };

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
  // Changed by hand (a vampire's bite); back to normal when both are 0.
  if (c.maxHpAdjust?.increase) hpParts.push({ label: "Increase (by hand)", value: c.maxHpAdjust.increase });
  if (c.maxHpAdjust?.reduce) hpParts.push({ label: "Reduction (by hand)", value: -c.maxHpAdjust.reduce });
  const hpMaxRaw = statWith("stat.hp.max", hpParts);
  const hpMax = hpMaxRaw.total >= 1 ? hpMaxRaw : { ...hpMaxRaw, parts: [...hpMaxRaw.parts, { label: "At least 1", value: 1 - hpMaxRaw.total }], total: 1 };

  // Rule permissions (Dual Wielder, Two-Weapon Fighting style).
  const allowed = (key: string) => modsFor([key]).some((a) => a.mod.op === "allow" && conditionState(a.mod.when) === "pass");
  const rules = { twoWeaponNonLight: allowed("rule.twoWeapon.nonLight"), twoWeaponAbility: allowed("rule.twoWeapon.ability"), durable: allowed("rule.durable"), heavyArmorMaster: allowed("rule.heavyArmorMaster") && armorWorn?.def.armor?.category === "heavy" };

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
    // Shillelagh: an option on melee weapon attacks (tick it when the spell is on that weapon): the spellcasting
    // ability instead of Strength, and a d8 damage die. The table allows it on any weapon, flagged when not a club or quarterstaff.
    let shillelagh: { ability: Ability; diff: number; flag: string } | undefined;
    if (o.itemInstanceId && w.kind === "melee" && c.effects.some((e) => e.effect === "effect:shillelagh")) {
      const casting = c.classes
        .map((cl) => reg.find(cl.class, "class")?.spellcasting?.ability)
        .filter((a): a is Ability => typeof a === "string");
      const best = (casting.length ? casting : (["wis"] as Ability[])).reduce((b, a) => (mods[a] > mods[b] ? a : b));
      const plain = /club|quarterstaff/i.test(`${o.name} ${o.attackId}`);
      shillelagh = {
        ability: best,
        diff: Math.max(0, mods[best] - mods[ability]),
        flag: plain ? `${ABILITY_NAMES[best]} instead of ${ABILITY_NAMES[ability]}; magical` : `Not a club or quarterstaff: your DM's call. ${ABILITY_NAMES[best]} instead of ${ABILITY_NAMES[ability]}`,
      };
    }
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
      if (shillelagh && !thrown) {
        const sh = shillelagh;
        const sg = (flat: number, weaponDice?: string) => ({
          label: "Shillelagh",
          effect: [flat ? signed(flat) : "", weaponDice ? weaponDice : ""].filter(Boolean).join(", ") || "magical",
          reason: sh.flag,
          apply: { flat, dice: [], ...(weaponDice ? { weaponDice } : {}) },
        });
        entry.attack.suggestions.push(sg(sh.diff));
        entry.damage.bonus.suggestions.push(sg(offHandAbility || sh.diff === 0 ? sh.diff : 0, /^1d\d+$/.test(w.damage) ? "1d8" : undefined));
        entry.note = /^Not/.test(sh.flag) ? "Shillelagh: not a club or quarterstaff" : "Shillelagh: tick it on the roll";
      }
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
    // Ritual Caster: the class picked gives the ability.
    if (picked && "map" in sc.ability) return sc.ability.map[picked];
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
    // A subclass caster (Eldritch Knight, Arcane Trickster): slots from its class's levels.
    const lvl = sc.levelsOf ? c.classes.find((x) => x.class === sc.levelsOf)?.level : undefined;
    if (lvl) casterLevels.push({ progression: sc.progression, level: lvl });
  }
  const spellcasting: SpellcastingResult[] = casters.map((sc) => ({
    id: sc.id,
    label: sc.label,
    ability: sc.ability,
    saveDc: sum([{ label: "Base", value: 8 }, pbPart(), abilityPart(sc.ability), ...statAdds("stat.spell.dc")]),
    attack: sum([pbPart(), abilityPart(sc.ability), ...statAdds("stat.spell.attack")]),
  }));
  const slots = spellSlots(casterLevels);
  /** A custom action's DC, by its feature id. */
  const customDc = (featureId: string): DcSpec | undefined => {
    const a = c.customActions?.find((x) => customFeatureId(x.id) === featureId);
    return a ? customActionDc(a) : undefined;
  };
  /** A feature's DC: a class's spell save DC, or 8 + proficiency + the best of some abilities. */
  const dcOf = (spec: DcSpec | undefined): FeatureDc | undefined => {
    if (!spec) return undefined;
    let breakdown: Breakdown | undefined;
    if (typeof spec.by === "number") breakdown = sum([{ label: "Set by hand", value: spec.by }]);
    else if (typeof spec.by === "string") {
      const cls = spec.by.slice(6);
      breakdown = cls === "*" ? [...spellcasting].sort((a, b) => b.saveDc.total - a.saveDc.total)[0]?.saveDc : spellcasting.find((x) => x.id === cls)?.saveDc;
      if (!breakdown) return undefined;
    } else {
      const best = [...spec.by].sort((a, b) => mods[b] - mods[a])[0]!;
      breakdown = sum([{ label: "Base", value: 8 }, pbPart(), abilityPart(best)]);
    }
    return { value: breakdown.total, save: spec.save, name: spec.name, breakdown };
  };

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
  type GrantedSpellRef = { resource?: string; from?: string; atWill?: boolean; extra?: string; scroll?: { instanceId: string; level: number } };
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
      if (g.atWill) granted.atWill = true;
      if (g.extra) granted.extra = g.extra;
      if (g.scroll) granted.scroll = g.scroll;
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
  // Spells that must mostly come from some schools (Eldritch Knight: abjuration and evocation).
  for (const s of sources) {
    if (!reg.has(s.id) || !/^(feature|feat):/.test(s.id)) continue;
    const d = reg.get(s.id, s.id.startsWith("feat:") ? "feat" : "feature") as { choices?: ChoiceDef[] };
    for (const ch of d.choices ?? []) {
      const lim = ch.spells?.schoolLimit;
      if (!lim) continue;
      const free = schoolFreePicks(c, reg, lim.freeBy);
      const outside = (s.choices[ch.id] ?? []).filter((id) => {
        const sp = reg.find(id, "spell");
        return sp && sp.level > 0 && !lim.schools.includes(sp.school.toLowerCase());
      });
      if (outside.length > free)
        warnings.push(`${s.label}: ${outside.length} spells outside ${lim.schools.join(" and ")}; you may have ${free} from any school at your level.`);
    }
  }
  const preparedLists = new Set(
    c.classes.map((cl) => reg.get(cl.class, "class")).filter((d) => d.spellPreparation === "prepared" && d.spellcasting).map((d) => d.spellcasting!.id),
  );
  const classLists = new Set(c.classes.map((cl) => reg.get(cl.class, "class").spellcasting?.id).filter(Boolean) as string[]);
  const pactList = c.classes.map((cl) => reg.get(cl.class, "class")).find((d) => d.spellcasting?.progression === "pact")?.spellcasting?.id;
  const slotsTotal = slots.slots.map((n, i) => n + (c.extraSlots[String(i + 1)] ?? 0));
  const modFor = (list: string) => {
    const sc = spellcasting.find((x) => x.id === list);
    return sc ? mods[sc.ability] : 0;
  };
  const pickByLevel = (table: Record<string, string>, level: number) => {
    const keys = Object.keys(table).map(Number).filter((k) => k <= level).sort((a, b) => a - b);
    const k = keys.at(-1) ?? Math.min(...Object.keys(table).map(Number));
    return table[String(k)]!;
  };
  // Changing a spell's damage type.
  const DAMAGE_TYPES = ["acid", "bludgeoning", "cold", "fire", "force", "lightning", "necrotic", "piercing", "poison", "psychic", "radiant", "slashing", "thunder"];
  const TRANSMUTABLE = ["acid", "cold", "fire", "lightning", "poison", "thunder"];
  const hasTransmuted = sources.some((s) => s.id === "feature:metamagic-transmuted-spell");
  const hasAwakened = sources.some((s) => /awakened spellbook/i.test(s.label));
  const awakenedByLevel: Record<number, string[]> = {};
  if (hasAwakened) {
    for (const x of c.spells.filter((x) => x.list === "wizard")) {
      const d = reg.find(x.spell, "spell");
      const t = d?.damage?.type;
      if (d && t && d.level > 0) awakenedByLevel[d.level] = [...new Set([...(awakenedByLevel[d.level] ?? []), t])];
    }
  }
  const damageTypeChoices = (def: { id: string; text: string[]; summary?: string; level: number }, type: string | undefined, list: string): NonNullable<SpellResult["typeChoices"]> => {
    const out: NonNullable<SpellResult["typeChoices"]> = [];
    // The spell's own choice: a list of three or more damage types joined with "or", where the caster chooses.
    const T = DAMAGE_TYPES.join("|");
    const re = new RegExp(`\\b((?:${T})(?:(?:,\\s+(?:or\\s+)?|\\s+or\\s+)(?:${T})){2,})\\b`, "i");
    for (const p of [...def.text, ...(def.summary ? [def.summary] : [])]) {
      const m = re.exec(p);
      if (m && /choose|choice|of your choosing/i.test(p)) {
        // "(acid, cold, fire...)" in a summary reads the same.
        out.push({ kind: "spell", label: "the spell's choice", options: m[1]!.split(/,\s+(?:or\s+)?|\s+or\s+/).map((x) => x.toLowerCase()).filter(Boolean) });
        break;
      }
    }
    if (hasTransmuted && type && TRANSMUTABLE.includes(type)) {
      const pts = resources.find((r) => r.id === "sorcery-points") ?? resources.find((r) => /metamagic/i.test(r.name));
      out.push({ kind: "transmuted", label: "Transmuted Spell, 1 sorcery point", options: TRANSMUTABLE, ...(pts ? { cost: { resource: pts.id, amount: 1 } } : {}) });
    }
    if (hasAwakened && list === "wizard" && def.level > 0 && type) {
      const byLevel: Record<number, string[]> = {};
      for (let l = def.level; l <= 9; l++) {
        const others = (awakenedByLevel[l] ?? []).filter((t) => t !== type);
        if (others.length) byLevel[l] = others;
      }
      if (Object.keys(byLevel).length) out.push({ kind: "awakened", label: "Awakened Spellbook", options: [], byLevel });
    }
    return out;
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
      cast: granted?.atWill ? { slotLevels: [], atWill: true } : { slotLevels: list === pactList ? [] : castLevels.filter((l) => l > 0) },
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
      r.attack = roll([`roll.attack.spell.${def.attack}`, `roll.attack.spell.${def.id.replace(/^spell:/, "")}`], [pbPart(), abilityPart(sc.ability), ...statAdds("stat.spell.attack")]);
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
      // Spell-specific modifiers too (Agonizing Blast: "roll.damage.spell.eldritch-blast").
      r.damageBonus = roll(["roll.damage.spell", `roll.damage.spell.${def.id.replace(/^spell:/, "")}`], []);
      // Elemental Adept (remastered): dice of the chosen type count as at least your proficiency bonus.
      const adeptTypes = sources.filter((x) => x.id === "feat:elemental-adept").flatMap((x) => x.choices.type ?? []);
      if (adeptTypes.length && def.damage?.type && adeptTypes.includes(def.damage.type)) r.damageBonus.minDie = { value: pb, types: adeptTypes, label: "Elemental Adept" };
    }
    if (def.heal) r.heal = { byLevel: levelsFor(def.heal.atSlot)! };
    const typeChoices = r.damage ? damageTypeChoices(def, r.damage.type, list) : [];
    if (typeChoices.length) r.typeChoices = typeChoices;
    if (!granted?.atWill && list === pactList && slots.pact && def.level > 0 && def.level <= slots.pact.level) {
      r.cast.pact = { level: slots.pact.level, remaining: Math.max(0, slots.pact.count - c.pactSlotsUsed) };
    }
    if (granted?.resource) {
      const res = resources.find((x) => x.id === granted.resource);
      if (res) r.cast.free = { resource: res.id, name: res.name, remaining: res.remaining };
    }
    if (granted?.extra) {
      const n = c.extraCasts?.[`${list}|${def.id}`];
      r.cast.extra = { tag: granted.extra, sinceShort: n?.short ?? 0, sinceLong: n?.long ?? 0 };
    }
    if (granted?.scroll) {
      // The scroll sets the DC and attack bonus by its level (DMG p. 200), not your spellcasting.
      const [dc, attack] = SCROLL_DC[granted.scroll.level] ?? [13, 5];
      const myLists = c.classes.flatMap((cl) => {
        const d = reg.find(cl.class, "class");
        return d?.spellcasting && def.classes.includes(d.id.replace(/^class:/, "")) ? [d] : [];
      });
      // Above what you can cast: a check with your spellcasting ability, DC 10 + the spell's level.
      const highest = Math.max(0, ...slotsTotal.map((n, i) => (n > 0 ? i + 1 : 0)), slots.pact?.level ?? 0);
      const abilities = (myLists.length ? myLists : c.classes.map((cl) => reg.find(cl.class, "class")).filter((d) => d?.spellcasting))
        .map((d) => spellcasting.find((x) => x.id === d!.spellcasting!.id)?.ability)
        .filter((a): a is Ability => !!a);
      const ability = abilities.reduce<Ability | undefined>((b, a) => (b === undefined || mods[a] > mods[b] ? a : b), undefined) ?? "int";
      r.cast = { slotLevels: [], scroll: { instanceId: granted.scroll.instanceId, level: granted.scroll.level, dc, attack, onList: myLists.length > 0 } };
      if (def.level > highest) r.cast.scroll!.check = { dc: 10 + def.level, ability, bonus: mods[ability] };
      r.list = { id: list, label: "Spell scroll" };
      r.ready = "always";
      r.fromFeature = `Spell scroll (${granted.scroll.level === 0 ? "cantrip" : `level ${granted.scroll.level}`})`;
      if (def.attack) r.attack = roll([`roll.attack.spell.${def.attack}`], [{ label: "Spell scroll", value: attack }]);
      if (def.save) r.save = { ability: def.save.ability, dc, onSuccess: def.save.onSuccess };
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
      else if (!a.untilTurnStart && !NO_TIMER.has(a.id)) {
        // "for 1 minute", "Lasts 8 hours": a timer tag when it's used, read from the note (or the feature's summary when it has one action).
        const single = (s.grant.actions ?? []).length === 1;
        const summary = single && reg.has(s.id) ? (reg.find(s.id, "feature") ?? reg.find(s.id, "feat"))?.summary : undefined;
        const d = statedDuration(a.note ?? "") ?? (summary ? statedDuration(summary) : undefined);
        if (d) entry.duration = d;
      }
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
      if (a.limited) entry.limited = true;
      if (a.flexibleCasting) {
        // Font of Magic: the slots you could make (2/3/5/6/7 points for 1st-5th) or turn into points.
        const points = resources.find((r) => r.id === a.cost?.resource)?.remaining ?? 0;
        const options =
          a.flexibleCasting === "toSlot"
            ? [1, 2, 3, 4, 5].map((l) => `Level ${l} slot for ${FLEX_COST[l]} points${FLEX_COST[l]! > points ? " (not enough)" : ""}`)
            : slotsTotal.flatMap((n, i) => (n - (c.slotsUsed[String(i + 1)] ?? 0) > 0 ? [`Level ${i + 1} slot into ${i + 1} points`] : []));
        entry.choose = { label: a.flexibleCasting === "toSlot" ? "Which slot to create?" : "Which slot to turn into points?", options };
        entry.flexibleCasting = a.flexibleCasting;
        delete entry.cost;
      }
      if (a.spendAmount) entry.spendAmount = a.spendAmount;
      // Defensive Duelist (remastered): proficiency bonus + half Dexterity (rounded up, at least 1).
      if (a.id === "defensive-duelist") {
        const half = Math.max(1, Math.ceil(mods.dex / 2));
        entry.note = `+${pb + half} AC against that attack (proficiency ${pb} + half Dexterity ${half}); +${pb + Math.max(1, mods.dex)} if you took the Dodge action. ${a.note ?? ""}`.trim();
      }
      // Harness Divine Power: which expended slot comes back (up to half the proficiency bonus, rounded up).
      if (a.id === "harness-divine-power") {
        const top = Math.ceil(pb / 2);
        const options = slotsTotal.flatMap((n, i) => (i + 1 <= top && (c.slotsUsed[String(i + 1)] ?? 0) > 0 ? [`Level ${i + 1} slot`] : []));
        const harness = resources.find((r) => r.id === "harness-divine-power");
        entry.choose = { label: options.length ? `Which slot comes back? (up to level ${top})` : `No expended slot of level ${top} or lower`, options: options.length ? options : ["Nothing to restore"] };
        if (harness && harness.remaining <= 0) entry.note = `${entry.note ?? ""} No Harness Divine Power uses left until a long rest.`.trim();
      }
      const dc = dcOf(ACTION_DCS[a.id] ?? (entry.featureId ? FEATURE_DCS[entry.featureId] ?? customDc(entry.featureId) : undefined));
      if (dc) entry.dc = dc;
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
  // Given by hand.
  for (const k of ["resist", "immune", "vulnerable"] as const) for (const v of c.defenseAdjust?.[k] ?? []) if (!defenses[k].includes(v)) defenses[k].push(v);
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
  // Switched-on features with reminders show as switches even without a modifier (Twilight Sanctuary).
  for (const a of actions)
    for (const name of a.toggles)
      if (TOGGLE_REMINDERS[name] && !toggles.some((t) => t.name === name)) toggles.push({ name, label: TOGGLE_LABELS[name] ?? a.name, on: c.toggles.includes(name), reminders: TOGGLE_REMINDERS[name]!.map(fillTag) });
  for (const a of active) {
    const name = a.mod.when?.toggle;
    if (!name || toggles.some((t) => t.name === name)) continue;
    // The action that switches it on names it best ("Form of Dread"); a note's label is a sentence, so fall back to the source.
    const switcher = actions.find((x) => x.toggles.includes(name));
    // Dodge shows as its own effect chip while it lasts, not as a switch.
    if (switcher?.common) continue;
    const byAction = switcher?.name;
    const label = byAction ?? (a.mod.op === "note" ? a.source.label : labelOf(a));
    toggles.push({ name, label, on: c.toggles.includes(name), ...(TOGGLE_REMINDERS[name] ? { reminders: TOGGLE_REMINDERS[name]!.map(fillTag) } : {}) });
  }

  // Features that are on by themselves (a paladin's auras), off while you're unconscious or incapacitated.
  const featureTags: FeatureTag[] = [];
  for (const s of sources) {
    const t = FEATURE_TAGS[s.id];
    if (!t || featureTags.some((x) => x.id === s.id)) continue;
    if (t.whileToggle && !c.toggles.includes(t.whileToggle)) continue;
    const why = t.needs === "conscious" && unconscious ? "You're unconscious." : t.needs === "notIncapacitated" && incapacitated ? "You're incapacitated." : undefined;
    featureTags.push({ id: s.id, name: t.name, active: !why, ...(why ? { why } : {}), reminders: t.reminders.map(fillTag) });
  }

  const sheet: DerivedSheet = {
    toggles,
    featureTags,
    level,
    proficiencyBonus: pb,
    proficiencyBreakdown: pbBreakdown,
    abilities,
    saves,
    skills,
    passives: { perception: passive("perception"), investigation: passive("investigation"), insight: passive("insight") },
    ac,
    initiative,
    speed,
    speeds: otherSpeeds(speed),
    hpMax,
    hitDice,
    attacks,
    actions,
    spells,
    effects,
    spellcasting,
    optionalFeatures: c.classes.flatMap((cl) => {
      const d = reg.find(cl.class, "class");
      return (d?.features ?? [])
        .filter((f) => f.optional && f.level <= cl.level)
        .flatMap((f) => {
          const fd = reg.find(f.feature, "feature");
          if (!fd) return [];
          return [{ id: fd.id, name: fd.name, className: d!.name, level: f.level, ...(fd.summary ? { summary: fd.summary } : {}), on: !c.optionalOff?.includes(fd.id) }];
        });
    }),
    spellSlots: slotsTotal.map((total, i) => ({ level: i + 1, total, used: Math.min(total, c.slotsUsed[String(i + 1)] ?? 0) })),
    resources,
    proficiencies: {
      armor: [...profs.armor],
      weapons: [...profs.weapon],
      tools: [...profs.tool],
      languages: [...profs.language],
    },
    defenses,
    senses,
    features: [
      ...featureEntries(sources, reg).map((f) => {
        const dc = dcOf(FEATURE_DCS[f.id] ?? customDc(f.id));
        return dc ? { ...f, dc } : f;
      }),
      // A custom background's feature written by the player.
      ...(c.background === "background:custom" && c.customBackground?.featureName
        ? [{ id: "background:custom-feature", name: c.customBackground.featureName, kind: "background" as const, source: "Your own background", ...(c.customBackground.featureText ? { summary: c.customBackground.featureText } : {}) }]
        : []),
    ],
    extras: c.extras.map((x) => ({
      id: x.id,
      kind: x.kind,
      value: x.value,
      name:
        x.kind === "feat" || x.kind === "spell"
          ? reg.find(x.value, x.kind)?.name ?? x.value
          : x.kind === "skill" || x.kind === "expertise"
            ? SKILL_NAMES[x.value as Skill] ?? x.value
            : x.value,
      tag: x.tag,
      reason: x.reason,
    })),
    components: (() => {
      const mine = new Set(c.spells.map((x) => x.spell));
      const seen = new Set<string>();
      const out: DerivedSheet["components"] = [];
      for (const sp of spells) {
        if (seen.has(sp.id) || !(mine.has(sp.id) || sp.ready !== "not prepared")) continue;
        const need = materialNeed(sp.material);
        if (!need) continue;
        seen.add(sp.id);
        out.push({ spell: sp.id, spellName: sp.name, material: sp.material!, ...need, have: componentCount(c.components[sp.id]) > 0, count: componentCount(c.components[sp.id]) });
      }
      return out.sort((a, b) => a.spellName.localeCompare(b.spellName));
    })(),
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
  // Wild Shape and Polymorph.
  const limits = wildShapeLimits(c, sheet.features.map((f) => f.name));
  if (limits) sheet.wildShape = limits;
  // Combat Wild Shape: transforming is a bonus action.
  if (limits?.bonusAction) for (const a of sheet.actions) if (a.id === "wild-shape") a.economy = "bonus";
  const shape = deriveShape(
    c,
    reg,
    {
      abilities: Object.fromEntries(ABILITIES.map((a) => [a, sheet.abilities[a].score.total])) as Record<Ability, number>,
      pb,
      saves: Object.fromEntries(ABILITIES.map((a) => [a, sheet.saves[a].proficient ? 1 : 0])) as Record<Ability, number>,
      skills: Object.fromEntries(SKILLS.map((k) => [k, Number(sheet.skills[k].proficiency) || 0])) as Record<Skill, number>,
    },
    limits,
  );
  if (shape) {
    sheet.shape = shape;
    // In a form, initiative uses its Dexterity (Wild Shape keeps your other bonuses, like Alert); its Multiattack sets the attacks.
    const dexMod = shape.abilities.dex.modifier;
    const kept = shape.kind === "wildshape" ? sheet.initiative.parts.filter((p) => !/dexterity/i.test(p.label)) : [];
    const parts = [{ label: `${shape.name}'s Dexterity modifier`, value: dexMod }, ...kept];
    sheet.initiative = { ...sheet.initiative, parts, total: parts.reduce((t, p) => t + p.value, 0) };
    sheet.attacksPerAction = shape.attacksPerAction;
    // Its walking speed replaces yours (Haste and the like still apply).
    if (shape.walk !== undefined) sheet.speed = statWith("stat.speed.walk", [{ label: `${shape.name}'s speed`, value: shape.walk }]);
    // A form's own speeds come with its stat block; yours don't carry over.
    sheet.speeds = [];
  }
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

/** Uses whose stated duration belongs to someone else or to a spell (Bardic Inspiration's die, Extended Spell). */
const NO_TIMER = new Set(["bardic-inspiration", "shadow-touched-invisibility", "extended-spell", "chef-treat"]);

/** "for 1 minute", "Lasts 8 hours", ", up to 1 hour" → a timer; nothing when no duration is stated. */
export function statedDuration(text: string): { rounds?: number; minutes?: number } | undefined {
  const m = /\b(?:for|lasts?|,)\s+(?:up to\s+)?(1|one|an?|10|ten|8|eight|24)\s+(minute|hour|round)s?\b/i.exec(text);
  if (!m) return undefined;
  const n = { one: 1, a: 1, an: 1, ten: 10, eight: 8 }[m[1]!.toLowerCase() as "one"] ?? Number(m[1]);
  const unit = m[2]!.toLowerCase();
  if (unit === "round") return { rounds: n };
  const minutes = unit === "hour" ? n * 60 : n;
  return minutes <= 1 ? { rounds: minutes * 10 } : { minutes };
}

/** How many of a component you have: older saves kept yes/no (yes is one). */
export const componentCount = (v: boolean | number | undefined): number => (v === true ? 1 : typeof v === "number" ? v : 0);

/** Sorcery points to create a spell slot (PHB p. 101). */
export const FLEX_COST: Record<number, number> = { 1: 2, 2: 3, 3: 5, 4: 6, 5: 7 };

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

/** How many spells may come from any school (a class table, e.g. "ekFreeSchool"), at the class's level. */
export function schoolFreePicks(c: Character, reg: ContentRegistry, table: string): number {
  for (const cl of c.classes) {
    const t = reg.find(cl.class, "class")?.progression?.[table];
    if (t) return t[cl.level - 1] ?? 0;
  }
  return 0;
}
