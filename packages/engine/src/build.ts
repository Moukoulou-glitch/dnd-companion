import { ABILITIES, ABILITY_NAMES, Character, SKILL_NAMES, SKILLS, type Ability, type ChoiceDef, type ClassDef, type ItemDef, type Skill } from "@dnd/schema";
import type { ContentRegistry } from "./registry.js";
import { collectSources } from "./sources.js";
import { derive, schoolFreePicks } from "./derive.js";

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
  /** Spell choices limited to the slots the character has (Eldritch Knight): the highest slot level. */
  slotMax?: number;
  /** Spell choices with a school limit: how many may come from any school now. */
  freeSchool?: number;
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
  for (const f of [...c.feats, ...c.extras.filter((x) => x.kind === "feat").map((x) => ({ feat: x.value }))]) {
    fromFeats.add(f.feat);
    const def = reg.find(f.feat, "feat");
    for (const id of def?.features ?? []) fromFeats.add(id);
    for (const ch of def?.choices ?? []) if (ch.kind === "feature") for (const v of c.choices[f.feat]?.[ch.id] ?? []) fromFeats.add(v);
  }
  const OVER_OK = new Set(["skill", "language", "tool", "spell"]);
  let sheet: ReturnType<typeof derive> | undefined;
  for (const s of collectSources(c, reg)) {
    if (s.common || seen.has(s.id) || !/^(race|class|background|feature|feat):/.test(s.id)) continue;
    seen.add(s.id);
    for (const ch of defChoices(c, reg, s.id)) {
      if (ch.newOnly && !c.builtInApp) continue;
      let need = countOf(c, reg, ch);
      // A custom background: two tools or languages in any mix, and a feature written by hand counts as chosen.
      if (s.id === "background:custom") {
        const cb = c.customBackground ?? { languages: 1 };
        if (ch.id === "languages") need = cb.languages;
        if (ch.id === "tools") need = 2 - cb.languages;
        if (ch.id === "feature" && c.customBackground?.featureName) continue;
        if (!need) continue;
      }
      const picked = c.choices[s.id]?.[ch.id] ?? [];
      const strict = fromFeats.has(s.id) || !OVER_OK.has(ch.kind);
      const item: BuildItem = { key: `${s.id}|${ch.id}`, kind: "choice", sourceName: s.label, label: ch.label, done: picked.length >= need, need, picked, source: s.id, choice: ch, ...(strict ? { strict } : {}), ...(picked.length > need ? { over: true } : {}) };
      if (ch.spells?.upToSlots || ch.orSpells?.upToSlots) {
        const slots = (sheet ??= derive(c, reg)).spellSlots.filter((x) => x.total > 0).map((x) => x.level);
        item.slotMax = slots.length ? Math.max(...slots) : 1;
      }
      if (ch.spells?.schoolLimit) item.freeSchool = schoolFreePicks(c, reg, ch.spells.schoolLimit.freeBy);
      out.push(item);
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
        const asiOver = Object.keys(rec?.abilities ?? {}).some((a) => (sheet ??= derive(c, reg)).abilities[a as Ability]?.asiOver);
        out.push({
          ...(asiOver ? { over: true, strict: true } : {}),
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
export function choiceOptions(ch: ChoiceDef, reg: ContentRegistry, slotMax?: number): ChoiceOption[] {
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
      if (!from && ch.featuresOf === "background") {
        // Every background's feature, named with the background it comes from.
        return reg
          .list("background")
          .filter((b) => b.id !== "background:custom")
          .flatMap((b) =>
            b.features.map((id) => {
              const f = reg.find(id, "feature");
              return { value: id, label: f?.name ?? id, detail: `${b.name}${f?.summary ? ` · ${f.summary}` : ""}` };
            }),
          )
          .filter((o, i, all) => all.findIndex((x) => x.value === o.value) === i)
          .sort((a, b) => a.label.localeCompare(b.label));
      }
      return (from ?? []).map((id) => {
        const f = reg.find(id, "feature");
        return { value: id, label: f?.name ?? id, ...(f?.summary ? { detail: f.summary } : {}) };
      });
    case "spell": {
      if (from) {
        // A fixed list (Divine affinity), and what it may be swapped for later.
        const fixed = from.map((id) => {
          const d = reg.find(id, "spell");
          return { value: id, label: d?.name ?? id, ...(d ? { detail: `${d.level === 0 ? "Cantrip" : `Level ${d.level}`}, ${d.school.toLowerCase()}` } : {}) };
        });
        const or = ch.orSpells;
        if (!or) return fixed;
        const max = or.upToSlots && slotMax !== undefined ? slotMax : 9;
        const more = spellOptions(reg, or.classes, or.minLevel ?? 1, max)
          .filter((o) => !from.includes(o.value))
          .map((o) => ({ ...o, detail: `${o.detail} · ${or.note}` }));
        return [...fixed, ...more];
      }
      const lvl = ch.spells?.level;
      const max = Math.min(ch.spells?.maxLevel ?? 9, ch.spells?.upToSlots && slotMax !== undefined ? slotMax : 9);
      return spellOptions(reg, ch.spells?.classes, lvl ?? ch.spells?.minLevel ?? 0, lvl ?? max, ch.spells?.schools, ch.spells?.ritual);
    }
  }
}

/** Spells from these class lists, between two levels, by level then name. */
export function spellOptions(reg: ContentRegistry, classes: string[] | undefined, minLevel: number, maxLevel: number, schools?: string[], ritual?: boolean): ChoiceOption[] {
  return reg
    .list("spell")
    .filter(
      (s) =>
        s.level >= minLevel &&
        s.level <= maxLevel &&
        (!classes || s.classes.some((x) => classes.includes(x))) &&
        (!schools || schools.includes(s.school.toLowerCase())) &&
        (!ritual || s.ritual),
    )
    .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name))
    .map((s) => ({ value: s.id, label: s.name, detail: `${s.level === 0 ? "Cantrip" : `Level ${s.level}`}, ${s.school.toLowerCase()}` }));
}

/**
 * The classes whose spells make up a class's list for this character, and the
 * list's name: a Divine Soul sorcerer's list is sorcerer and cleric spells.
 */
export function spellListOf(c: Character | undefined, reg: ContentRegistry, classId: string): { classes: string[]; name: string } {
  const own = classId.replace(/^class:/, "");
  const name = `${reg.find(classId, "class")?.name ?? own} spell list`;
  if (!c) return { classes: [own], name };
  for (const s of collectSources(c, reg)) {
    const add = s.grant.spellListAdds;
    if (add && add.list === own) return { classes: [own, ...add.classes.filter((x) => x !== own)], name: add.name };
  }
  return { classes: [own], name };
}

/** The spells a class can learn now: its list, up to the highest level it can cast. With several classes' spells, each says whose it is. */
export function classSpellOptions(reg: ContentRegistry, classId: string, kind: "cantrips" | "known" | "spellbook", maxLevel: number, c?: Character): ChoiceOption[] {
  const { classes } = spellListOf(c, reg, classId);
  const opts = kind === "cantrips" ? spellOptions(reg, classes, 0, 0) : spellOptions(reg, classes, 1, Math.max(1, maxLevel));
  if (classes.length < 2) return opts;
  const cap = (x: string) => x.replace(/^./, (ch) => ch.toUpperCase());
  return opts.map((o) => {
    const on = reg.find(o.value, "spell")?.classes.filter((x) => classes.includes(x)) ?? [];
    return { ...o, detail: `${o.detail} · ${on.map(cap).join(", ")}` };
  });
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
  let sheet: ReturnType<typeof derive> | undefined;
  const check = (id: string) => {
    const def = reg.find(id, "class");
    const p = def?.multiclassPrereq;
    if (!def || !p) return;
    const entries = Object.entries(p.abilities) as [Ability, number][];
    // Your scores as they stand: race, Ability Score Improvements, items and changes by hand all count.
    const ok = (a: Ability, n: number) => (scores?.[a] ?? (sheet ??= derive(c, reg)).abilities[a].score.total) >= n;
    const met = p.any ? entries.some(([a, n]) => ok(a, n)) : entries.every(([a, n]) => ok(a, n));
    if (!met) out.push(`${def.name} needs ${entries.map(([a, n]) => `${ABILITY_NAMES[a]} ${n}`).join(p.any ? " or " : " and ")}.`);
  };
  check(classId);
  for (const cl of c.classes) check(cl.class);
  return [...new Set(out)];
}

/** A new level 1 character, at full hit points (the hit die plus Constitution, and any race bonus). */
/** Items for "any martial weapon" and the like: tagged by the SRD, or (for book items) known by their stats. */
export function itemsForTag(reg: ContentRegistry, tag: string): ItemDef[] {
  const byStats = (d: ItemDef): boolean => {
    const w = d.weapon;
    if (!w || d.magic) return false;
    const m = /^(simple|martial)(?:-(melee|ranged))?-weapons$/.exec(tag);
    if (m) return w.category === m[1] && (!m[2] || w.kind === m[2]);
    if (tag === "melee-weapons" || tag === "ranged-weapons") return w.kind === tag.split("-")[0];
    return false;
  };
  return reg
    .list("item")
    .filter((d) => d.tags?.includes(tag) || byStats(d))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Packs (Explorer's Pack) become what they hold, so rations and torches can be used one by one. */
export function unpack(reg: ContentRegistry, items: { item: string; quantity: number }[]): { item: string; quantity: number }[] {
  const out = new Map<string, number>();
  const add = (id: string, q: number) => out.set(id, (out.get(id) ?? 0) + q);
  for (const x of items) {
    const d = reg.find(x.item, "item");
    if (d?.contents?.length) for (const y of d.contents) add(y.item, y.quantity * x.quantity);
    else add(x.item, x.quantity);
  }
  return [...out].map(([item, quantity]) => ({ item, quantity }));
}

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
  /** Starting equipment picked in the builder (packs are unpacked). */
  equipment?: { item: string; quantity: number }[];
  /** Things with no item in the content ("a letter from a dead colleague"), kept by name. */
  gear?: string[];
  gold?: number;
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
  // Starting equipment: armor and a shield are put on; everything else is carried.
  let n = 0;
  let armorOn = false;
  let shieldOn = false;
  for (const x of unpack(reg, input.equipment ?? [])) {
    const d = reg.find(x.item, "item");
    if (!d) continue;
    const wear = (d.category === "armor" && !armorOn) || (d.category === "shield" && !shieldOn);
    if (d.category === "armor" && wear) armorOn = true;
    if (d.category === "shield" && wear) shieldOn = true;
    c.inventory.push({ id: `start-${++n}`, item: d.id, quantity: x.quantity, equipped: wear, attuned: false });
  }
  if (input.gear?.length && reg.find("item:other-gear", "item"))
    for (const g of input.gear) c.inventory.push({ id: `start-${++n}`, item: "item:other-gear", quantity: 1, equipped: false, attuned: false, name: g.replace(/^./, (x) => x.toUpperCase()) });
  if (input.gold) c.currency.gp = (c.currency.gp ?? 0) + input.gold;
  c.hp.current = derive(c, reg).hpMax.total;
  return c;
}
