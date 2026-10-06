import {
  ABILITIES,
  ABILITY_NAMES,
  SKILLS,
  SKILL_ABILITY,
  SKILL_NAMES,
  type Ability,
  type Character,
  type Condition,
  type ItemDef,
  type Modifier,
  type Proficiency,
  type Skill,
  type SpellcastingDef,
} from "@dnd/schema";
import { sum, signed, type Breakdown, type DicePart, type Part, type RollBreakdown, type Suggestion } from "./breakdown.js";
import { evalExpr, evalFlat, type ExprContext } from "./expr.js";
import type { ContentRegistry } from "./registry.js";
import { collectSources, type Source } from "./sources.js";
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
  itemInstanceId: string;
  name: string;
  kind: "melee" | "ranged";
  ability: Ability;
  proficient: boolean;
  attack: RollBreakdown;
  damage: {
    dice: string;
    versatileDice?: string;
    type: string;
    bonus: RollBreakdown;
    /** Extra damage only on a critical hit, e.g. Vicious +7. */
    onCrit: Part[];
  };
  properties: string[];
  range?: [number, number];
}

export interface SpellcastingResult {
  id: string;
  label: string;
  ability: Ability;
  saveDc: Breakdown;
  attack: Breakdown;
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
  spellcasting: SpellcastingResult[];
  spellSlots: { level: number; total: number }[];
  pactSlots?: { count: number; level: number };
  resources: ResourceResult[];
  proficiencies: { armor: string[]; weapons: string[]; tools: string[]; languages: string[] };
  defenses: { resist: string[]; immune: string[]; vulnerable: string[] };
  senses: Record<string, number>;
  /** Data problems found while deriving (missing choices, too many attuned items). */
  warnings: string[];
}

interface ActiveMod {
  mod: Modifier;
  source: Source;
}

/** Every proficiency target resolved from fixed values and the player's choices. */
interface Profs {
  save: Set<string>;
  skill: Set<string>;
  expertise: Set<string>;
  armor: Set<string>;
  weapon: Set<string>;
  tool: Set<string>;
  language: Set<string>;
}

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

  // Ability scores.
  const abilities = {} as Record<Ability, AbilityResult>;
  for (const ab of ABILITIES) {
    const parts: Part[] = [{ label: "Base score", value: c.abilities[ab] ?? 10 }];
    for (const s of sources) {
      const bonus = s.grant.abilityBonuses?.[ab];
      if (bonus) parts.push({ label: s.label, value: bonus });
    }
    const score = sum(parts);
    abilities[ab] = { score, modifier: Math.floor((score.total - 10) / 2) };
  }
  const mods = Object.fromEntries(ABILITIES.map((a) => [a, abilities[a].modifier])) as Record<Ability, number>;
  const ctx: ExprContext = { pb, mods, level, classLevels };

  // Proficiencies.
  const profs: Profs = {
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
  for (const s of sources) {
    for (const p of s.grant.proficiencies ?? []) {
      for (const t of resolveTargets(p, s)) profs[p.kind].add(t);
    }
  }

  // Modifiers.
  const active: ActiveMod[] = sources.flatMap((source) => (source.grant.modifiers ?? []).map((mod) => ({ mod, source })));

  const conditionState = (when: Condition | undefined): "pass" | "fail" | "unknown" => {
    if (!when) return "pass";
    if (when.noArmor && armorWorn) return "fail";
    if (when.noHeavyArmor && armorWorn?.def.armor?.category === "heavy") return "fail";
    if (when.noShield && shieldHeld) return "fail";
    if (when.toggle && !c.toggles.includes(when.toggle)) return "fail";
    if (when.text) return "unknown";
    return "pass";
  };

  const labelOf = (a: ActiveMod) => a.mod.label ?? a.source.label;

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
    for (const a of found) {
      const key = a.mod.stackingKey;
      if (!key) {
        rest.push(a);
        continue;
      }
      const current = best.get(key);
      const strength = (m: ActiveMod) => {
        try {
          return m.mod.value === undefined ? 0 : evalFlat(m.mod.value, ctx);
        } catch {
          return 0;
        }
      };
      if (!current || strength(a) > strength(current)) best.set(key, a);
    }
    return [...rest, ...best.values()];
  };

  const describeEffect = (m: Modifier): string => {
    if (m.op === "advantage") return "advantage";
    if (m.op === "disadvantage") return "disadvantage";
    if (m.value === undefined) return m.op;
    return typeof m.value === "number" ? signed(m.value) : `+${m.value}`;
  };

  /** Builds a d20-roll breakdown from base parts plus every matching modifier. */
  const roll = (keys: string[], base: Part[], itemInstanceId?: string): RollBreakdown => {
    const parts = [...base];
    const dice: DicePart[] = [];
    const advantage: string[] = [];
    const disadvantage: string[] = [];
    const suggestions: Suggestion[] = [];

    for (const a of modsFor(keys, itemInstanceId)) {
      const { mod } = a;
      if (!["add", "advantage", "disadvantage"].includes(mod.op)) continue;
      const state = conditionState(mod.when);
      if (state === "fail") continue;
      if (state === "unknown" || mod.mode === "suggested") {
        const s: Suggestion = { label: labelOf(a), effect: describeEffect(mod) };
        if (mod.when?.text) s.reason = mod.when.text;
        suggestions.push(s);
        continue;
      }
      if (mod.op === "advantage") advantage.push(labelOf(a));
      else if (mod.op === "disadvantage") disadvantage.push(labelOf(a));
      else if (mod.value !== undefined) {
        for (const term of evalExpr(mod.value, ctx)) {
          if (term.kind === "dice") dice.push({ label: labelOf(a), dice: term.dice });
          else parts.push({ label: term.label ? `${labelOf(a)} (${term.label})` : labelOf(a), value: term.value });
        }
      }
    }
    return { ...sum(parts), dice, advantage, disadvantage, suggestions };
  };

  /** Flat additions to a stat (AC, speed, HP max); dice are not allowed here. */
  const statAdds = (key: string): Part[] => {
    const parts: Part[] = [];
    for (const a of modsFor([key])) {
      if (a.mod.op !== "add" || a.mod.value === undefined) continue;
      if (conditionState(a.mod.when) !== "pass" || a.mod.mode === "suggested") continue;
      parts.push({ label: labelOf(a), value: evalFlat(a.mod.value, ctx) });
    }
    return parts;
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
    const dex = a.category === "light" ? mods.dex : a.category === "medium" ? Math.min(mods.dex, 2) : 0;
    const parts: Part[] = [{ label: armorWorn.inst.name ?? armorWorn.def.name, value: a.base }];
    if (armorWorn.def.magic?.bonus) parts.push({ label: "Magic armor", value: armorWorn.def.magic.bonus });
    if (a.category !== "heavy") parts.push(abilityPart("dex"));
    if (a.category === "medium" && mods.dex > 2) parts[parts.length - 1] = { label: "Dexterity modifier (max 2)", value: dex };
    acCandidates.push(parts);
  } else {
    acCandidates.push([{ label: "Unarmored", value: 10 }, abilityPart("dex")]);
  }
  for (const a of modsFor(["stat.ac"])) {
    if (a.mod.op !== "acBase" || a.mod.value === undefined) continue;
    if (conditionState(a.mod.when) !== "pass" || a.mod.mode === "suggested") continue;
    acCandidates.push(
      evalExpr(a.mod.value, ctx).map((t) => {
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
  const speed = sum([{ label: race.name, value: race.speed }, ...statAdds("stat.speed.walk")]);

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
      hpParts.push({ label: `${def.name} ${levelsLeft} more level${levelsLeft > 1 ? "s" : ""} (${how})`, value: total });
    }
    const die = `d${def.hitDie}`;
    const existing = hitDice.find((h) => h.die === die);
    if (existing) existing.total += cl.level;
    else hitDice.push({ die, total: cl.level, used: c.hitDiceUsed[die] ?? 0 });
  });
  hpParts.push({ label: `Constitution modifier × ${level} levels`, value: mods.con * level });
  hpParts.push(...statAdds("stat.hp.max"));
  const hpMax = sum(hpParts);

  // Weapon attacks: every weapon carried, so switching weapons needs no edit.
  const weaponProficient = (w: NonNullable<ItemDef["weapon"]>) => profs.weapon.has(w.category) || profs.weapon.has(w.group);
  const attacks: WeaponAttack[] = [];
  for (const inst of c.inventory) {
    const def = reg.get(inst.item, "item");
    const w = def.weapon;
    if (!w) continue;
    const ability: Ability =
      w.kind === "ranged" ? "dex" : w.properties.includes("finesse") && mods.dex > mods.str ? "dex" : "str";
    const proficient = weaponProficient(w);
    const magic = def.magic?.bonus ? [{ label: "Magic weapon", value: def.magic.bonus }] : [];

    const attack = roll(
      [`roll.attack.weapon.${w.kind}`, "item.attack"],
      [abilityPart(ability), ...(proficient ? [pbPart()] : []), ...magic],
      inst.id,
    );
    const bonus = roll([`roll.damage.weapon.${w.kind}`, "item.damage"], [abilityPart(ability), ...magic], inst.id);
    const onCrit: Part[] = modsFor([`roll.damage.weapon.${w.kind}`, "item.damage"], inst.id)
      .filter((a) => a.mod.op === "critBonusDamage" && a.mod.value !== undefined && conditionState(a.mod.when) === "pass")
      .map((a) => ({ label: labelOf(a), value: evalFlat(a.mod.value!, ctx) }));

    if (!proficient) warnings.push(`${inst.name ?? def.name}: not proficient, so no proficiency bonus on attacks.`);

    const entry: WeaponAttack = {
      itemInstanceId: inst.id,
      name: inst.name ?? def.name,
      kind: w.kind,
      ability,
      proficient,
      attack,
      damage: { dice: w.damage, type: w.damageType, bonus, onCrit },
      properties: w.properties,
    };
    if (w.versatileDamage) entry.damage.versatileDice = w.versatileDamage;
    if (w.range) entry.range = w.range;
    attacks.push(entry);
  }

  // Spellcasting: classes that have reached their casting level, plus feats and features.
  const casters: SpellcastingDef[] = [];
  const casterLevels: { progression: SpellcastingDef["progression"]; level: number }[] = [];
  for (const cl of c.classes) {
    const def = reg.get(cl.class, "class");
    if (!def.spellcasting) continue;
    casterLevels.push({ progression: def.spellcasting.progression, level: cl.level });
    if (cl.level >= (def.spellcastingFromLevel ?? 1)) casters.push(def.spellcasting);
  }
  for (const s of sources) {
    if (s.grant.spellcasting && !casters.some((x) => x.id === s.grant.spellcasting!.id)) casters.push(s.grant.spellcasting);
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
      const max = evalFlat(r.max, ctx);
      const used = Math.min(c.resourcesUsed[r.id] ?? 0, max);
      const entry: ResourceResult = { id: r.id, name: r.name, max, used, remaining: max - used, reset: r.reset, source: s.label };
      if (r.die) entry.die = r.die;
      resources.push(entry);
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

  const sheet: DerivedSheet = {
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
    spellcasting,
    spellSlots: slots.slots.map((total, i) => ({ level: i + 1, total })),
    resources,
    proficiencies: {
      armor: [...profs.armor],
      weapons: [...profs.weapon],
      tools: [...profs.tool],
      languages: [...profs.language],
    },
    defenses,
    senses,
    warnings,
  };
  if (slots.pact) sheet.pactSlots = slots.pact;
  return sheet;
}
