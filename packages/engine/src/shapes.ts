import { ABILITIES, ABILITY_NAMES, SKILLS, SKILL_NAMES, type Ability, type Character, type CreatureDef, type Modifier, type Skill, type SpellDef } from "@dnd/schema";
import type { Part, RollBreakdown } from "./breakdown.js";
import type { ContentRegistry } from "./registry.js";
import { evalExpr, type ExprContext } from "./expr.js";
import { signed as signedN, signedDice } from "./breakdown.js";
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
export type ShapeKind = "wildshape" | "polymorph" | "truepolymorph";

export function shapeIssues(d: CreatureDef, kind: ShapeKind, limits: WildShapeLimits | undefined, polymorphMax: number): string[] {
  const out: string[] = [];
  const crText = (n: number) => (n === 0.125 ? "1/8" : n === 0.25 ? "1/4" : n === 0.5 ? "1/2" : String(n));
  if (kind === "polymorph" || kind === "truepolymorph") {
    if (kind === "polymorph" && d.type !== "beast") out.push("Polymorph turns you into a beast.");
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
  kind: ShapeKind;
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
  /** Attacks per Attack action, from its Multiattack. */
  attacksPerAction: number;
  /** Walking speed in feet. */
  walk?: number;
  /** Summoned creatures with effects: plain ability checks, initiative, spell attacks. */
  checks?: Record<Ability, RollBreakdown>;
  initiative?: RollBreakdown;
  spellAttack?: RollBreakdown;
  /** Wild Shape: hours it can last. */
  hours?: number;
  notes: string[];
}

const DMG = "acid|bludgeoning|cold|fire|force|lightning|necrotic|piercing|poison|psychic|radiant|slashing|thunder";

/**
 * Extra damage an attack always deals ("plus 7 (2d6) poison damage") is
 * rolled with it; a trait that adds dice to one of the creature's attacks
 * (the boar's Charge: +2d6 after moving 20 ft) is offered to turn on.
 */
function riderBonus(d: CreatureDef, a: { name: string; text: string }, flat: number): RollBreakdown {
  const r = flatRoll(flat ? [{ label: `${d.name}'s damage bonus`, value: flat }] : []);
  const plus = new RegExp(`plus \\d+ \\((\\d+d\\d+(?:\\s*[+-]\\s*\\d+)?)\\) (${DMG}) damage`, "gi");
  for (const m of a.text.matchAll(plus)) r.dice.push({ label: `${a.name}: extra ${m[2]!.toLowerCase()}`, dice: m[1]!.replace(/\s/g, ""), damageType: m[2]!.toLowerCase() });
  const attackWord = a.name.toLowerCase().replace(/s$/, "");
  for (const t of d.traits) {
    const m = new RegExp(`extra \\d+ \\((\\d+d\\d+)\\)(?: (${DMG}))? damage`, "i").exec(t.text);
    if (!m || !new RegExp(`\\b${attackWord}`, "i").test(t.text)) continue;
    r.suggestions.push({ label: t.name, effect: `+${m[1]}`, reason: t.text.split(/(?<=\.)\s/)[0]!, apply: { flat: 0, dice: [m[1]!], ...(m[2] ? { damageType: m[2].toLowerCase() } : {}) } });
  }
  return r;
}

type AttackLine = NonNullable<CreatureDef["actions"][number]["attack"]> & { variant?: string };

/** "8 (1d8 + 4)" or a flat "1": dice and the flat part. */
function dmg(diceText: string | undefined, flatText: string | undefined, sign?: string, n?: string): { damage: string; damageBonus: number } {
  if (diceText) return { damage: diceText, damageBonus: n ? (sign === "-" ? -1 : 1) * Number(n) : 0 };
  return { damage: String(flatText ?? "0"), damageBonus: 0 };
}

const shortCond = (cond: string) =>
  /two hands/i.test(cond) ? "two-handed" : cond.replace(/^(?:if|when|while|with)\s+(?:used\s+)?(?:with\s+)?/i, "").replace(/\s+to make a (?:melee|ranged) attack$/i, "").trim();

/**
 * An attack read from its text, with the variants its stat block gives
 * ("+6 to hit with shillelagh", "or 8 (1d10 + 3) … if used with two hands").
 */
export function attackVariants(a: { name: string; text: string; attack?: CreatureDef["actions"][number]["attack"] }): AttackLine[] {
  const text = a.text;
  const head = /(Melee|Ranged)(?: or Ranged)? (?:Weapon|Spell) Attack:/i.exec(text);
  const hit = /\+(\d+) to hit/i.exec(text);
  const D = `(?:\\d+\\s*\\((\\d+d\\d+)(?:\\s*([+-])\\s*(\\d+))?\\)|(\\d+))\\s*(${DMG}) damage`;
  const main = new RegExp(`Hit:\\s*${D}`, "i").exec(text);
  let base: AttackLine | undefined = a.attack ? { ...a.attack } : undefined;
  if (!base && head && hit && main) {
    const reach = /(?:reach|range) ([^,]+?)(?:,|\s+one\b)/i.exec(text)?.[1]?.trim();
    base = {
      kind: head[1]!.toLowerCase() === "melee" ? "melee" : "ranged",
      toHit: Number(hit[1]),
      ...(reach ? { reach } : {}),
      ...dmg(main[1], main[4], main[2], main[3]),
      damageType: main[5]!.toLowerCase() as AttackLine["damageType"],
    };
  }
  if (!base) return [];
  const out: AttackLine[] = [base];
  const alt = new RegExp(`,?\\s*or ${D}\\s+((?:if|when|while|with)[^,.;]+)`, "i").exec(text);
  if (alt) {
    const cond = alt[6]!.trim();
    const altHit = /\(\+(\d+) to hit ((?:with|while|when|if)[^)]+)\)/i.exec(text);
    const words = (x: string) => x.toLowerCase().split(/\W+/).filter((w) => w.length > 3 && !["with", "when", "while", "used"].includes(w));
    const sameCond = altHit && words(altHit[2]!).some((w) => words(cond).includes(w));
    out.push({ ...base, ...dmg(alt[1], alt[4], alt[2], alt[3]), damageType: alt[5]!.toLowerCase() as AttackLine["damageType"], toHit: sameCond ? Number(altHit![1]) : base.toHit, variant: shortCond(cond) });
  }
  return out;
}

export interface CreatureSpellGroup {
  /** "At will", "3/day each", "1st level (4 slots)". */
  label: string;
  /** Uses each (N/day each) or for the group (N/day). */
  perDay?: number;
  shared?: boolean;
  /** Spell slots of this level. */
  slots?: number;
  level?: number;
  spells: { name: string; id?: string }[];
}

export interface CreatureSpells {
  trait: string;
  ability?: string;
  dc?: number;
  attack?: number;
  /** Caster level, for cantrip damage. */
  casterLevel?: number;
  groups: CreatureSpellGroup[];
}

/** The spells in a stat block's Spellcasting or Innate Spellcasting trait, matched to the spells the app knows. */
export function creatureSpells(reg: ContentRegistry, d: Pick<CreatureDef, "traits">): CreatureSpells[] {
  const byName = new Map(reg.list("spell").map((sp) => [sp.name.toLowerCase(), sp.id]));
  const out: CreatureSpells[] = [];
  for (const t of d.traits) {
    if (!/spellcasting/i.test(t.name)) continue;
    const r: CreatureSpells = { trait: t.name, groups: [] };
    const ab = /ability is (\w+)/i.exec(t.text)?.[1];
    if (ab) r.ability = ab;
    const dc = /spell save DC (\d+)/i.exec(t.text)?.[1];
    if (dc) r.dc = Number(dc);
    const atk = /([+-]\d+) to hit with spell attacks/i.exec(t.text)?.[1];
    if (atk) r.attack = Number(atk);
    const lvl = /(\d+)(?:st|nd|rd|th)-level spellcaster/i.exec(t.text)?.[1];
    if (lvl) r.casterLevel = Number(lvl);
    for (const raw of t.text.split(/\n+/)) {
      const line = raw.replace(/^[-*•]\s*/, "").replace(/\*/g, "").trim();
      const m = /^(At will|Cantrips(?: \(at will\))?|\d+\/day(?: each)?|(\d+)(?:st|nd|rd|th) level \((\d+) slots?\))\s*:\s*(.+)$/i.exec(line);
      if (!m) continue;
      const g: CreatureSpellGroup = { label: m[1]!, spells: [] };
      const per = /^(\d+)\/day( each)?/i.exec(m[1]!);
      if (per) {
        g.perDay = Number(per[1]);
        if (!per[2]) g.shared = true;
      }
      if (m[2]) {
        g.level = Number(m[2]);
        g.slots = Number(m[3]);
      }
      for (const part of m[4]!.split(/,(?![^(]*\))/)) {
        const name = part.replace(/\([^)]*\)/g, "").trim();
        if (!name) continue;
        const id = byName.get(name.toLowerCase());
        g.spells.push(id ? { name, id } : { name });
      }
      r.groups.push(g);
    }
    out.push(r);
  }
  return out;
}

const pbForCr = (cr: number) => (cr < 5 ? 2 : cr < 9 ? 3 : cr < 13 ? 4 : cr < 17 ? 5 : cr < 21 ? 6 : cr < 25 ? 7 : cr < 29 ? 8 : 9);
const ABILITY_WORD: Record<string, Ability> = { strength: "str", dexterity: "dex", constitution: "con", intelligence: "int", wisdom: "wis", charisma: "cha" };

/** How a creature casts: its stat block's DC and attack, else 8 + proficiency by CR + its best mental ability. */
export function creatureCasting(d: CreatureDef, info?: CreatureSpells): { ability: Ability; dc: number; attack: number; casterLevel: number } {
  const mod = (a: Ability) => Math.floor(((d.abilities[a] ?? 10) - 10) / 2);
  const named = info?.ability ? ABILITY_WORD[info.ability.toLowerCase()] : undefined;
  const ability = named ?? (["int", "wis", "cha"] as Ability[]).reduce((best, a) => (mod(a) > mod(best) ? a : best), "cha" as Ability);
  const pb = pbForCr(d.cr);
  return {
    ability,
    dc: info?.dc ?? 8 + pb + mod(ability),
    attack: info?.attack ?? (info?.dc !== undefined ? info.dc - 8 : pb + mod(ability)),
    casterLevel: info?.casterLevel ?? Math.max(1, Math.ceil(d.cr)),
  };
}

/** A spell a creature casts, as a roll: its spell attack, the damage at this level, and the save to note. */
export function creatureSpellRoll(d: CreatureDef, sp: SpellDef, level: number, info?: CreatureSpells): WeaponAttack & { saveNote?: string } {
  const cast = creatureCasting(d, info);
  const mod = Math.floor(((d.abilities[cast.ability] ?? 10) - 10) / 2);
  const table = sp.damage?.atSlot ?? sp.damage?.atCharacterLevel ?? sp.heal?.atSlot;
  const key = sp.damage?.atCharacterLevel && !sp.damage.atSlot ? cast.casterLevel : level;
  const keys = table ? Object.keys(table).map(Number).filter((k) => k <= key).sort((a, b) => b - a) : [];
  const raw = table && keys.length ? table[String(keys[0])]! : table ? Object.values(table)[0]! : "0";
  const dice = raw.replace(/\s+/g, "").replace(/MOD/g, String(mod)).replace(/\+-/g, "-");
  const a: WeaponAttack & { saveNote?: string } = {
    attackId: `creature-spell:${d.id}:${sp.id}`,
    name: sp.name,
    mode: sp.attack === "melee" ? "melee" : "ranged",
    action: "attack",
    ability: cast.ability,
    proficient: true,
    attack: flatRoll([{ label: `${d.name}'s spell attack`, value: cast.attack }]),
    damage: { dice, type: sp.damage?.type ?? (sp.heal ? "healing" : ""), bonus: flatRoll([]), onCrit: [], critExtraDice: [] },
    properties: [],
  };
  if (sp.save) a.saveNote = `DC ${cast.dc} ${ABILITY_NAMES[sp.save.ability]} saving throw${sp.save.onSuccess === "half" ? ": half damage on a success" : sp.save.onSuccess === "none" ? ": no damage on a success" : ""}.`;
  return a;
}

/** Dice a trait deals on its own (Heated Body: 1d10 fire to whoever hits it), to roll from its stat block. */
export function traitDice(text: string): { dice: string; type?: string } | undefined {
  const m = new RegExp(`\\d+ \\((\\d+d\\d+(?:\\s*[+-]\\s*\\d+)?)\\)(?: (${DMG}))? damage`, "i").exec(text);
  return m ? { dice: m[1]!.replace(/\s/g, ""), ...(m[2] ? { type: m[2].toLowerCase() } : {}) } : undefined;
}

/** Attacks per Attack action: what Multiattack says ("makes two attacks"), else one. */
export function multiattackCount(d: CreatureDef): number {
  const m = d.actions.find((a) => /^multiattack/i.test(a.name));
  if (!m) return 1;
  const words: Record<string, number> = { two: 2, three: 3, four: 4, five: 5 };
  const n = /makes (two|three|four|five) /i.exec(m.text)?.[1];
  return n ? words[n.toLowerCase()]! : 2;
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
  const attacks = [...d.actions, ...(d.bonusActions ?? [])].flatMap((a) =>
    attackVariants(a).map((at) => {
      const name = at.variant ? `${a.name} (${at.variant})` : a.name;
      const w: WeaponAttack & { note?: string } = {
        attackId: `shape:${d.id}:${name}`,
        name,
        mode: at.kind,
        action: (d.bonusActions ?? []).includes(a) ? "bonus" : "attack",
        ability: "str",
        proficient: true,
        attack: flatRoll([{ label: `${d.name}'s attack bonus`, value: at.toHit }]),
        damage: { dice: at.damage, type: at.damageType, bonus: riderBonus(d, a, at.damageBonus), onCrit: [], critExtraDice: [] },
        properties: [],
      };
      if (at.reach) w.note = `${at.kind === "melee" ? "Reach" : "Range"} ${at.reach}`;
      return w;
    }),
  );
  const notes = wild
    ? [
        "You can't cast spells" + (limits?.beastSpells ? " except with Beast Spells (no material components with a cost)." : ", but concentration on a spell you already cast holds."),
        "You keep your features if the beast's body can use them; special senses only if the beast has them too.",
        "At 0 HP you change back, and extra damage carries over to your normal form.",
      ]
    : [
        s.kind === "truepolymorph" ? "Your game statistics, mind included, are the creature's; you keep your alignment and personality." : "Your game statistics, mind included, are the beast's. You can't speak or cast spells.",
        "At 0 HP you change back, and extra damage carries over to your normal form.",
      ];
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
    walk: d.speed.walk ?? 0,
    abilities,
    saves,
    skills,
    defenses: { resist: d.resist ?? [], immune: d.immune ?? [], vulnerable: d.vulnerable ?? [], conditions: d.conditionImmune ?? [] },
    traits: d.traits,
    actions: [...d.actions, ...(d.bonusActions ?? []).map((a) => ({ ...a, name: `${a.name} (bonus action)` })), ...(d.reactions ?? []).map((a) => ({ ...a, name: `${a.name} (reaction)` }))].map((a) => ({ name: a.name, text: a.text })),
    attacks,
    attacksPerAction: multiattackCount(d),
    notes,
  };
  if (d.acNote) r.acNote = d.acNote;
  if (d.senses && Object.keys(d.senses).length) r.senses = Object.entries(d.senses).map(([k, v]) => `${k} ${v} ft`).join(", ");
  if (d.languages) r.languages = d.languages;
  if (wild && limits) r.hours = limits.hours;
  return r;
}

/** A creature's stat block on its own (a summoned creature), shaped like a form. */
export function creatureBlock(reg: ContentRegistry, creature: string, hp?: number): ShapeResult | undefined {
  const d = reg.find(creature, "creature");
  if (!d) return undefined;
  const fake = { shape: { kind: "polymorph", creature, hp: hp ?? d.hp } } as unknown as Character;
  const none = Object.fromEntries(ABILITIES.map((a) => [a, 0])) as Record<Ability, number>;
  const r = deriveShape(fake, reg, { abilities: none, pb: 0, saves: none, skills: Object.fromEntries(SKILLS.map((k) => [k, 0])) as Record<Skill, number> }, undefined);
  if (r) r.notes = [];
  return r;
}

/** What a summoning spell offers at a slot level: the creatures, and how many of which CR. */
export function summonOptions(reg: ContentRegistry, summon: string, slot: number): { creatures: CreatureDef[]; tiers: { maxCr: number; count: number }[]; count?: number } | undefined {
  const s = reg.find(summon, "summon");
  if (!s) return undefined;
  const pickCount = (table?: Record<string, number>) => {
    if (!table) return undefined;
    const keys = Object.keys(table).map(Number).filter((k) => k <= slot).sort((a, b) => b - a);
    return keys.length ? table[String(keys[0])] : undefined;
  };
  const mult = pickCount(s.multiplier) ?? 1;
  const tiers = (s.tiers ?? []).map((t) => ({ maxCr: t.maxCr, count: t.count * mult }));
  const maxCr = s.crBySlot ? slot : tiers.length ? Math.max(...tiers.map((t) => t.maxCr)) : Infinity;
  const creatures = s.creatures
    ? s.creatures.map((id) => reg.find(id, "creature")).filter((d): d is CreatureDef => !!d)
    : reg
        .list("creature")
        .filter((d) => (s.type ?? []).includes(d.type) && d.cr <= maxCr)
        .sort((a, b) => b.cr - a.cr || a.name.localeCompare(b.name));
  const count = pickCount(s.count);
  return { creatures, tiers, ...(count ? { count } : {}) };
}

type SummonMember = Character["summons"][number];

const selectorMatches = (selector: string, key: string) => selector === key || (selector.endsWith(".*") && (key === selector.slice(0, -2) || key.startsWith(selector.slice(0, -1))));

/** Every modifier from the effects on a summoned creature, with their context. */
function memberMods(reg: ContentRegistry, m: SummonMember, d: CreatureDef) {
  const mods = Object.fromEntries(ABILITIES.map((a) => [a, Math.floor(((d.abilities[a] ?? 10) - 10) / 2)])) as Record<Ability, number>;
  const out: { label: string; mod: CreatureDef["traits"] extends unknown ? NonNullable<ReturnType<typeof reg.find<"effect">>>["modifiers"][number] : never; ctx: ExprContext }[] = [];
  for (const e of m.effects ?? []) {
    const def = reg.find(e.effect, "effect");
    if (!def) continue;
    const ctx: ExprContext = { pb: pbForCr(d.cr), mods, level: Math.max(1, Math.ceil(d.cr)), classLevels: {}, slotLevel: e.slotLevel ?? def.upcast?.baseLevel ?? 1 };
    for (const mod of def.modifiers) {
      const value = typeof mod.value === "string" ? mod.value.replace(/\{choice\}/g, e.choice ?? "d6") : mod.value;
      out.push({ label: mod.label ?? def.name, mod: { ...mod, ...(value !== undefined ? { value } : {}) }, ctx });
    }
  }
  return out;
}

const safeTerms = (v: Parameters<typeof evalExpr>[0], ctx: ExprContext) => {
  try {
    return evalExpr(v, ctx);
  } catch {
    return [];
  }
};

/** Extra maximum hit points from effects on it (Aid). */
export function summonHpBonus(m: SummonMember, reg: ContentRegistry): number {
  const d = reg.find(m.creature, "creature");
  if (!d) return 0;
  let n = 0;
  for (const a of memberMods(reg, m, d)) {
    if (a.mod.selector !== "stat.hp.max" || a.mod.op !== "add" || a.mod.value === undefined) continue;
    for (const t of safeTerms(a.mod.value, a.ctx)) if (t.kind === "flat") n += t.value;
  }
  return n;
}

/**
 * A summoned creature's stat block with the effects on it applied: Bless and
 * Bardic Inspiration on its rolls, Poisoned's disadvantage, Haste's AC and
 * speed, Aid's hit points, resistances from spells.
 */
export function summonBlock(reg: ContentRegistry, m: SummonMember): ShapeResult | undefined {
  const d = reg.find(m.creature, "creature");
  const b = creatureBlock(reg, m.creature, m.hp);
  if (!d || !b) return b;
  const all = memberMods(reg, m, d);
  const applyTo = (r: RollBreakdown, keys: string[]): RollBreakdown => {
    const out: RollBreakdown = { ...r, parts: [...r.parts], dice: [...r.dice], advantage: [...r.advantage], disadvantage: [...r.disadvantage], suggestions: [...r.suggestions] };
    for (const a of all) {
      if (!keys.some((k) => selectorMatches(a.mod.selector, k))) continue;
      const { mod } = a;
      if (mod.op === "autoFail") {
        out.autoFail = [...(out.autoFail ?? []), a.label];
        continue;
      }
      if (!["add", "advantage", "disadvantage"].includes(mod.op)) continue;
      const terms = mod.value !== undefined ? safeTerms(mod.value, a.ctx) : [];
      if (mod.mode === "suggested" || mod.when?.text || mod.when?.toggle) {
        const apply: { flat: number; dice: string[]; mode?: "advantage" | "disadvantage" } = { flat: 0, dice: [] };
        if (mod.op === "advantage" || mod.op === "disadvantage") apply.mode = mod.op;
        for (const t of terms) t.kind === "dice" ? apply.dice.push(t.dice) : (apply.flat += t.value);
        const effect = mod.op !== "add" ? mod.op : terms.map((t) => (t.kind === "dice" ? signedDice(t.dice) : signedN(t.value))).join(" ");
        out.suggestions.push({ label: a.label, effect, ...(mod.when?.text ? { reason: mod.when.text } : {}), apply });
        continue;
      }
      if (mod.op === "advantage") out.advantage.push(a.label);
      else if (mod.op === "disadvantage") out.disadvantage.push(a.label);
      else
        for (const t of terms) {
          if (t.kind === "dice") out.dice.push({ label: a.label, dice: t.dice });
          else out.parts.push({ label: a.label, value: t.value });
        }
    }
    out.total = out.parts.reduce((s, p) => s + p.value, 0);
    return out;
  };
  const SKILL_AB: Record<string, Ability> = {
    athletics: "str", acrobatics: "dex", sleightOfHand: "dex", stealth: "dex", arcana: "int", history: "int", investigation: "int", nature: "int", religion: "int",
    animalHandling: "wis", insight: "wis", medicine: "wis", perception: "wis", survival: "wis", deception: "cha", intimidation: "cha", performance: "cha", persuasion: "cha",
  };
  const r: ShapeResult = { ...b, defenses: { ...b.defenses, resist: [...b.defenses.resist], immune: [...b.defenses.immune], vulnerable: [...b.defenses.vulnerable] } };
  r.saves = Object.fromEntries(ABILITIES.map((ab) => [ab, applyTo(b.saves[ab], [`roll.save.${ab}`])])) as ShapeResult["saves"];
  r.skills = Object.fromEntries(SKILLS.map((sk) => [sk, applyTo(b.skills[sk], [`roll.check.${SKILL_AB[sk] ?? "wis"}`, `roll.check.skill.${sk}`])])) as ShapeResult["skills"];
  r.checks = Object.fromEntries(ABILITIES.map((ab) => [ab, applyTo(flatRoll([{ label: `${ABILITY_NAMES[ab]} modifier`, value: b.abilities[ab].modifier }]), [`roll.check.${ab}`])])) as ShapeResult["saves"];
  r.initiative = applyTo(flatRoll([{ label: `${d.name}'s Dexterity modifier`, value: b.abilities.dex.modifier }]), ["roll.initiative", "roll.check.dex"]);
  r.attacks = b.attacks.map((a) => ({
    ...a,
    attack: applyTo(a.attack, [`roll.attack.weapon.${a.mode === "melee" ? "melee" : "ranged"}`]),
    damage: { ...a.damage, bonus: applyTo(a.damage.bonus, [`roll.damage.weapon.${a.mode === "melee" ? "melee" : "ranged"}`]) },
  }));
  r.spellAttack = applyTo(flatRoll([]), ["roll.attack.spell.ranged", "roll.attack.spell.melee"]);
  // Stats: AC, speed, hit points, defenses.
  let ac = b.ac;
  let walk = d.speed.walk ?? 0;
  const multipliers: number[] = [];
  let cap: number | undefined;
  for (const a of all) {
    const flat = a.mod.value !== undefined ? safeTerms(a.mod.value, a.ctx).reduce((s, t) => s + (t.kind === "flat" ? t.value : 0), 0) : 0;
    if (a.mod.selector === "stat.ac" && a.mod.op === "add") ac += flat;
    if (a.mod.selector === "stat.speed.walk") {
      if (a.mod.op === "add") walk += flat;
      if (a.mod.op === "multiply") multipliers.push(flat || 1);
      if (a.mod.op === "set") cap = Math.min(cap ?? Infinity, flat);
    }
    const def = /^defense\.(resist|immune|vulnerable)\.(.+)$/.exec(a.mod.selector);
    if (def && !r.defenses[def[1] as "resist"].includes(def[2]!)) r.defenses[def[1] as "resist"].push(def[2]!);
  }
  for (const x of multipliers) walk = Math.floor(walk * x);
  if (cap !== undefined) walk = Math.min(walk, cap);
  r.ac = ac;
  r.walk = walk;
  r.hp = { current: m.hp, max: d.hp + summonHpBonus(m, reg) };
  if (walk !== (d.speed.walk ?? 0)) r.speed = r.speed.replace(/^\d+ ft/, `${walk} ft`);
  return r;
}
