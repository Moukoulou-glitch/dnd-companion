import { ABILITIES, ABILITY_NAMES, Character, SKILL_NAMES, SKILLS, type Ability, type ChoiceDef, type ClassDef, type Skill } from "@dnd/schema";
import type { ContentRegistry } from "./registry.js";
import { collectSources } from "./sources.js";
import { derive } from "./derive.js";

/**
 * Building and levelling a character: what's still to choose, what each
 * choice can be, what a level brings, and a fresh level 1 character.
 * Everything here only reads; the choices are recorded as operations.
 */

export const LANGUAGES = [
  "Common",
  "Dwarvish",
  "Elvish",
  "Giant",
  "Gnomish",
  "Goblin",
  "Halfling",
  "Orc",
  "Abyssal",
  "Celestial",
  "Draconic",
  "Deep Speech",
  "Infernal",
  "Primordial",
  "Sylvan",
  "Undercommon",
];

export const TOOLS = [
  "Alchemist's supplies",
  "Brewer's supplies",
  "Calligrapher's supplies",
  "Carpenter's tools",
  "Cartographer's tools",
  "Cobbler's tools",
  "Cook's utensils",
  "Glassblower's tools",
  "Jeweler's tools",
  "Leatherworker's tools",
  "Mason's tools",
  "Painter's supplies",
  "Potter's tools",
  "Smith's tools",
  "Tinker's tools",
  "Weaver's tools",
  "Woodcarver's tools",
  "Disguise kit",
  "Forgery kit",
  "Herbalism kit",
  "Navigator's tools",
  "Poisoner's kit",
  "Thieves' tools",
  "Dice set",
  "Playing card set",
  "Bagpipes",
  "Drum",
  "Dulcimer",
  "Flute",
  "Lute",
  "Lyre",
  "Horn",
  "Pan flute",
  "Shawm",
  "Viol",
];

/** The standard array and point-buy costs (PHB p. 13). */
export const STANDARD_ARRAY = [15, 14, 13, 12, 10, 8];
export const POINT_BUY_COST: Record<number, number> = { 8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9 };
export const POINT_BUY_BUDGET = 27;

/** Highest spell level a single class can cast at this class level. */
export function maxSpellLevel(def: ClassDef, level: number): number {
  const p = def.spellcasting?.progression;
  if (!p || p === "none" || level < (def.spellcastingFromLevel ?? 1)) return 0;
  if (p === "full") return Math.min(9, Math.ceil(level / 2));
  if (p === "pact") return Math.min(5, Math.ceil(level / 2));
  if (p === "half") return Math.min(5, Math.ceil(level / 4));
  return Math.min(4, Math.ceil((level - 2) / 4));
}

export interface ChoiceOption {
  value: string;
  label: string;
  /** A short line under the option (a feature's summary, a spell's level). */
  detail?: string;
}

/** One thing to choose while building or levelling: a choice, a subclass, an ASI, or spells to learn. */
export interface BuildItem {
  key: string;
  kind: "choice" | "subclass" | "asi" | "spells";
  /** Where it comes from: "Half-Elf", "Rogue", "Expertise", "Fighter 4". */
  sourceName: string;
  label: string;
  done: boolean;
  /** How many to pick and how many are picked. */
  need: number;
  picked: string[];
  /**
   * Tables bend the rules, so skills, expertise, languages, tools and spells
   * can be picked past the limit (with a warning). What feats give stays
   * strict: `strict` items can't go over.
   */
  strict?: boolean;
  /** More picked than the rules give. */
  over?: boolean;
  // For "choice":
  source?: string;
  choice?: ChoiceDef;
  // For "subclass", "asi" and "spells":
  class?: string;
  level?: number;
  // For "spells": which list and whether cantrips, known spells or a spellbook.
  list?: string;
  spellKind?: "cantrips" | "known" | "spellbook";
  maxLevel?: number;
}

const defChoices = (c: Character, reg: ContentRegistry, id: string): ChoiceDef[] => {
  const kind = id.split(":")[0];
  if (kind === "class") {
    const def = reg.find(id, "class");
    const first = c.classes[0]?.class === id;
    return (first ? def?.choices : def?.multiclassChoices) ?? [];
  }
  if (kind === "race") return reg.find(id, "race")?.choices ?? [];
  if (kind === "background") return reg.find(id, "background")?.choices ?? [];
  if (kind === "feat") return reg.find(id, "feat")?.choices ?? [];
  if (kind === "feature") return reg.find(id, "feature")?.choices ?? [];
  return [];
};

/** How many a choice asks for, for "countBy" choices read from the class table (invocations known). */
function countOf(c: Character, reg: ContentRegistry, ch: ChoiceDef): number {
  if (!ch.countBy) return ch.count;
  for (const cl of c.classes) {
    const table = reg.find(cl.class, "class")?.progression?.[ch.countBy];
    if (table) return table[cl.level - 1] ?? ch.count;
  }
  return ch.count;
}

/**
 * Everything to choose for this character as it stands: race, class,
 * background, feature and feat choices; subclasses due; ASIs due; spells to
 * learn. Each item says whether it's done, so the builder can show both.
 */
export function buildItems(c: Character, reg: ContentRegistry): BuildItem[] {
  const out: BuildItem[] = [];
  const seen = new Set<string>();
  // Feats and the features they bring (Magic Initiate's class pick) keep their numbers.
  const fromFeats = new Set<string>();
  for (const f of c.feats) {
    fromFeats.add(f.feat);
    const def = reg.find(f.feat, "feat");
    for (const id of def?.features ?? []) fromFeats.add(id);
    for (const ch of def?.choices ?? []) if (ch.kind === "feature") for (const v of c.choices[f.feat]?.[ch.id] ?? []) fromFeats.add(v);
  }
  const OVER_OK = new Set(["skill", "language", "tool", "spell"]);
  for (const s of collectSources(c, reg)) {
    if (s.common || seen.has(s.id) || !/^(race|class|background|feature|feat):/.test(s.id)) continue;
    seen.add(s.id);
    for (const ch of defChoices(c, reg, s.id)) {
      if (ch.newOnly && !c.builtInApp) continue;
      const need = countOf(c, reg, ch);
      const picked = c.choices[s.id]?.[ch.id] ?? [];
      const strict = fromFeats.has(s.id) || !OVER_OK.has(ch.kind);
      out.push({ key: `${s.id}|${ch.id}`, kind: "choice", sourceName: s.label, label: ch.label, done: picked.length >= need, need, picked, source: s.id, choice: ch, ...(strict ? { strict } : {}), ...(picked.length > need ? { over: true } : {}) });
    }
  }

  c.classes.forEach((cl) => {
    const def = reg.find(cl.class, "class");
    if (!def) return;
    if (cl.level >= def.subclassLevel && reg.list("subclass").some((x) => x.class === def.id)) {
      out.push({
        key: `${def.id}|subclass`,
        kind: "subclass",
        sourceName: `${def.name} ${def.subclassLevel}`,
        label: def.subclassTitle ?? "Subclass",
        done: !!cl.subclass,
        need: 1,
        picked: cl.subclass ? [cl.subclass] : [],
        class: def.id,
        level: def.subclassLevel,
      });
    }
    if (c.asiBaseline) {
      const settled = c.asiBaseline[def.id] ?? 0;
      for (const lvl of def.asiLevels ?? []) {
        if (lvl > cl.level || lvl <= settled) continue;
        const rec = c.asi.find((a) => a.class === def.id && a.level === lvl);
        out.push({
          key: `${def.id}|asi|${lvl}`,
          kind: "asi",
          sourceName: `${def.name} ${lvl}`,
          label: "Ability Score Improvement or a feat",
          done: !!rec,
          need: 1,
          picked: rec ? [rec.feat ?? Object.entries(rec.abilities ?? {}).map(([a, n]) => `${a}+${n}`).join(", ")] : [],
          class: def.id,
          level: lvl,
        });
      }
    }
    const sc = def.spellcasting;
    if (!sc || cl.level < (def.spellcastingFromLevel ?? 1)) return;
    const mine = c.spells.filter((x) => x.list === sc.id);
    const levelOf = (id: string) => reg.find(id, "spell")?.level ?? 1;
    const cantrips = mine.filter((x) => levelOf(x.spell) === 0).map((x) => x.spell);
    const leveled = mine.filter((x) => levelOf(x.spell) > 0).map((x) => x.spell);
    const maxLevel = maxSpellLevel(def, cl.level);
    const cantripCount = def.progression?.cantrips?.[cl.level - 1] ?? 0;
    if (cantripCount > 0) {
      out.push({ key: `${def.id}|cantrips`, kind: "spells", sourceName: def.name, label: "Cantrips known", done: cantrips.length >= cantripCount, need: cantripCount, picked: cantrips, class: def.id, list: sc.id, spellKind: "cantrips", maxLevel: 0, ...(cantrips.length > cantripCount ? { over: true } : {}) });
    }
    const known = def.progression?.spellsKnown?.[cl.level - 1] ?? 0;
    if (known > 0) {
      out.push({ key: `${def.id}|known`, kind: "spells", sourceName: def.name, label: "Spells known", done: leveled.length >= known, need: known, picked: leveled, class: def.id, list: sc.id, spellKind: "known", maxLevel, ...(leveled.length > known ? { over: true } : {}) });
    } else if (def.id === "class:wizard") {
      const book = 6 + 2 * (cl.level - 1);
      out.push({ key: `${def.id}|spellbook`, kind: "spells", sourceName: def.name, label: "Spellbook", done: leveled.length >= book, need: book, picked: leveled, class: def.id, list: sc.id, spellKind: "spellbook", maxLevel });
    }
  });
  return out;
}

/** What a choice can be: skills, abilities, languages, tools, options, features or spells. */
export function choiceOptions(ch: ChoiceDef, reg: ContentRegistry): ChoiceOption[] {
  const from = ch.from && ch.from.length ? ch.from : undefined;
  switch (ch.kind) {
    case "skill":
      return (from ?? SKILLS).map((s) => ({ value: s, label: SKILL_NAMES[s as Skill] ?? s }));
    case "ability":
      return (from ?? [...ABILITIES]).map((a) => ({ value: a, label: ABILITY_NAMES[a as Ability] ?? a }));
    case "language":
      return (from ?? LANGUAGES).map((l) => ({ value: l, label: l }));
    case "tool":
      return (from ?? TOOLS).map((t) => ({ value: t, label: t }));
    case "option":
      return (from ?? []).map((o) => ({ value: o, label: o.replace(/^./, (x) => x.toUpperCase()) }));
    case "feature":
      return (from ?? []).map((id) => {
        const f = reg.find(id, "feature");
        return { value: id, label: f?.name ?? id, ...(f?.summary ? { detail: f.summary } : {}) };
      });
    case "spell": {
      const lvl = ch.spells?.level;
      return spellOptions(reg, ch.spells?.classes, lvl ?? 0, lvl ?? ch.spells?.maxLevel ?? 9, ch.spells?.schools);
    }
  }
}

/** Spells from these class lists, between two levels, by level then name. */
export function spellOptions(reg: ContentRegistry, classes: string[] | undefined, minLevel: number, maxLevel: number, schools?: string[]): ChoiceOption[] {
  return reg
    .list("spell")
    .filter(
      (s) =>
        s.level >= minLevel &&
        s.level <= maxLevel &&
        (!classes || s.classes.some((x) => classes.includes(x))) &&
        (!schools || schools.includes(s.school.toLowerCase())),
    )
    .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name))
    .map((s) => ({ value: s.id, label: s.name, detail: `${s.level === 0 ? "Cantrip" : `Level ${s.level}`}, ${s.school.toLowerCase()}` }));
}

/** The spells a class can learn now: its list, up to the highest level it can cast. */
export function classSpellOptions(reg: ContentRegistry, classId: string, kind: "cantrips" | "known" | "spellbook", maxLevel: number): ChoiceOption[] {
  const listName = classId.replace(/^class:/, "");
  return kind === "cantrips" ? spellOptions(reg, [listName], 0, 0) : spellOptions(reg, [listName], 1, Math.max(1, maxLevel));
}

/** What gaining a level in this class brings: features, subclass and ASI due, the hit die. */
export interface LevelGains {
  class: string;
  className: string;
  newLevel: number;
  hitDie: number;
  multiclass: boolean;
  features: { id: string; name: string; summary?: string }[];
  subclassDue: boolean;
  asiDue: boolean;
  /** Ability minimums not met, for multiclassing (a warning, never a block). */
  prerequisites: string[];
}

export function levelGains(c: Character, reg: ContentRegistry, classId: string): LevelGains | undefined {
  const def = reg.find(classId, "class");
  if (!def) return undefined;
  const cl = c.classes.find((x) => x.class === classId);
  const newLevel = (cl?.level ?? 0) + 1;
  const sub = cl?.subclass ? reg.find(cl.subclass, "subclass") : undefined;
  const refs = [...def.features, ...(sub?.features ?? [])].filter((f) => f.level === newLevel);
  const features = refs.map((r) => {
    const f = reg.find(r.feature, "feature");
    return { id: r.feature, name: f?.name ?? r.feature, ...(f?.summary ? { summary: f.summary } : {}) };
  });
  return {
    class: classId,
    className: def.name,
    newLevel,
    hitDie: def.hitDie,
    multiclass: !cl,
    features,
    subclassDue: newLevel === def.subclassLevel,
    asiDue: (def.asiLevels ?? []).includes(newLevel),
    prerequisites: cl ? [] : multiclassIssues(c, reg, classId),
  };
}

/** Multiclassing needs the minimum scores of the new class and of every class you already have (PHB p. 163). */
export function multiclassIssues(c: Character, reg: ContentRegistry, classId: string, scores?: Record<Ability, number>): string[] {
  const out: string[] = [];
  const check = (id: string) => {
    const def = reg.find(id, "class");
    const p = def?.multiclassPrereq;
    if (!def || !p) return;
    const entries = Object.entries(p.abilities) as [Ability, number][];
    const ok = (a: Ability, n: number) => (scores?.[a] ?? c.abilities[a] ?? 10) >= n;
    const met = p.any ? entries.some(([a, n]) => ok(a, n)) : entries.every(([a, n]) => ok(a, n));
    if (!met) out.push(`${def.name} needs ${entries.map(([a, n]) => `${ABILITY_NAMES[a]} ${n}`).join(p.any ? " or " : " and ")}.`);
  };
  check(classId);
  for (const cl of c.classes) check(cl.class);
  return [...new Set(out)];
}

/** A new level 1 character, at full hit points (the hit die plus Constitution, and any race bonus). */
export function newCharacter(
  input: {
  id: string;
  name: string;
  race: string;
  class: string;
  abilities: Record<Ability, number>;
  background?: string;
  alignment?: string;
  player?: string;
  },
  reg: ContentRegistry,
): Character {
  const c = Character.parse({
    id: input.id,
    schemaVersion: 1,
    ruleset: "5e-2014",
    name: input.name,
    ...(input.player ? { player: input.player } : {}),
    ...(input.alignment ? { alignment: input.alignment } : {}),
    abilities: input.abilities,
    race: input.race,
    ...(input.background ? { background: input.background } : {}),
    classes: [{ class: input.class, level: 1 }],
    hp: { current: 1, temp: 0 },
    asiBaseline: {},
    builtInApp: true,
  });
  c.hp.current = derive(c, reg).hpMax.total;
  return c;
}
