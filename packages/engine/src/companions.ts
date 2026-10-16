import { ABILITIES, ABILITY_NAMES, type Ability, type CompanionDef, type CompanionState, type CreatureDef, type CustomCompanion, type TurnUsed } from "@dnd/schema";
import type { Breakdown, Part, RollBreakdown } from "./breakdown.js";
import { evalExpr, type ExprContext } from "./expr.js";
import type { SpellcastingResult, WeaponAttack } from "./derive.js";

/** A companion with every number worked out for its current form. */
export interface CompanionResult {
  id: string;
  name: string;
  /** The feature it comes from, e.g. "Primal Companion". */
  source: string;
  forms: { id: string; name: string }[];
  combatNote?: string;
  reviveNote?: string;
  /** Tags for what it's doing until your next turn starts (Dodge, Ready: Attack). */
  states: { id: string; name: string }[];
  /** When it takes its turn: its own initiative, on your turn, or right after yours. */
  turn: "own" | "yours" | "after";
  /** Its initiative this combat (one with its own). */
  initiative?: number;
  /** What it has used of its turn. */
  used: TurnUsed;
  /** One the player made (Companion Builder): its own id, notes, and the creature it started from. */
  custom?: {
    id: string;
    notes: string;
    kind: string;
    from?: string;
    /** Bonded through a feature (Ranger's Companion); `active` while that feature is in use. */
    bond?: { name: string; active: boolean };
  };
  /** Out only while the timer of this action runs (Hound of Ill Omen); `out`: it's here now. */
  summonedBy?: { action: string; out: boolean };
  /** Summoned with an action: free once per `resource`, or with a slot of `slotMin`+ (the drake). */
  summon?: { resource: string; slotMin: number; note: string };
  /** What commanding it costs you, when it can be commanded (Primal Companion: bonus action; Ranger's Companion: action). */
  command?: { economy: "action" | "bonus"; attackInstead: boolean };
  /** Missing until the player picks a form. */
  form?: {
    id: string;
    name: string;
    size: string;
    type: string;
    ac: Breakdown;
    hpMax: Breakdown;
    hp: { current: number; temp: number };
    speed: string;
    /** Feet by kind of movement (walk, fly, swim, climb, burrow), read from `speed`. */
    speeds: Record<string, number>;
    /** Attacks its Attack action makes (Multiattack: two or more). */
    attacksPerAction: number;
    senses?: string;
    languages?: string;
    abilities: Record<Ability, { score: number; modifier: number; check: RollBreakdown; save: RollBreakdown }>;
    traits: { name: string; summary: string }[];
    /** Shaped like weapon attacks so the roll composer handles them the same way. */
    attacks: (WeaponAttack & { note?: string })[];
    /** Save DC for its effects (the owner's spell save DC), if it uses one. */
    saveDc?: number;
  };
}

/** Nothing used yet this turn. */
export const NO_TURN_USED: TurnUsed = { action: false, bonus: false, reaction: false, attacks: 0, moved: 0, dashes: 0 };

/** "40 ft., swim 30 ft., fly 60 ft. (hover)" → { walk: 40, swim: 30, fly: 60 }. */
export function speedsOf(speed: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const part of speed.split(",")) {
    const m = /(?:(walk|fly|swim|climb|burrow)\s+)?(\d+)\s*ft/i.exec(part.trim());
    if (m) out[(m[1] ?? "walk").toLowerCase()] = Number(m[2]);
  }
  if (out.walk === undefined) out.walk = 0;
  return out;
}

/** A Multiattack trait or action ("makes two attacks") gives that many; otherwise one. */
export function attacksPerAction(entries: { name: string; summary: string }[]): number {
  const m = entries.find((t) => /multiattack/i.test(t.name));
  if (!m) return 1;
  const n = /\b(two|three|four|five|2|3|4|5)\b/i.exec(m.summary)?.[1]?.toLowerCase();
  return n ? ({ two: 2, three: 3, four: 4, five: 5 } as Record<string, number>)[n] ?? Number(n) : 2;
}

const roll = (parts: Part[]): RollBreakdown => ({ total: parts.reduce((t, p) => t + p.value, 0), parts, dice: [], advantage: [], disadvantage: [], suggestions: [] });

/** Builds a companion's sheet from its definition, the player's choices and the owner's numbers. */
export function deriveCompanion(
  def: CompanionDef,
  source: string,
  state: CompanionState | undefined,
  ctx: ExprContext,
  spellcasting: SpellcastingResult[],
): CompanionResult {
  const r: CompanionResult = {
    id: def.id,
    name: state?.name ?? def.name,
    source,
    forms: def.forms.map((f) => ({ id: f.id, name: f.name })),
    states: (state?.states ?? []).map((x) => ({ id: x.id, name: x.name })),
    turn: def.turn ?? "own",
    used: { ...NO_TURN_USED, ...state?.used },
  };
  if (state?.initiative !== undefined) r.initiative = state.initiative;
  if (def.combatNote) r.combatNote = def.combatNote;
  if (def.revive) r.reviveNote = def.revive.note;
  if (def.summon) r.summon = def.summon;
  const f = def.forms.find((x) => x.id === state?.form);
  if (!f) return r;

  const sc = spellcasting.find((s) => s.id === def.spellcasting);
  const exprParts = (expr: string | number, label: string): Part[] =>
    evalExpr(expr, ctx).flatMap((t) => (t.kind === "flat" ? [{ label: t.label ?? label, value: t.value }] : []));

  const acParts = exprParts(f.ac, "Base");
  const levels = ctx.classLevels[f.hp.class] ?? 0;
  const hpParts: Part[] = [
    ...(f.hp.base || !f.hp.perLevel ? [{ label: "Base", value: f.hp.base }] : []),
    ...(f.hp.perLevel ? [{ label: `${f.hp.perLevel} × ${levels} class levels`, value: f.hp.perLevel * levels }] : []),
  ];
  const hpMax = hpParts.reduce((t, p) => t + p.value, 0);
  const hp = state?.hp ?? { current: hpMax, temp: 0 };

  const bonus = f.checkBonus !== undefined ? exprParts(f.checkBonus, "Bonus") : [];
  const abilities = {} as NonNullable<CompanionResult["form"]>["abilities"];
  for (const ab of ABILITIES) {
    const score = f.abilities[ab] ?? 10;
    const modifier = Math.floor((score - 10) / 2);
    const base: Part[] = [{ label: `${ABILITY_NAMES[ab]} modifier`, value: modifier }, ...bonus.map((p) => ({ ...p, label: `${p.label} (${def.name})` }))];
    // A save written in the stat block (proficient saves) is its total.
    const save =
      f.saves?.[ab] !== undefined
        ? [...exprParts(f.saves[ab]!, `${ABILITY_NAMES[ab]} save (stat block)`).map((p) => (p.label === "Proficiency bonus" ? p : { ...p, label: `${ABILITY_NAMES[ab]} save (stat block)` })), ...bonus.map((p) => ({ ...p, label: `${p.label} (${def.name})` }))]
        : base;
    abilities[ab] = { score, modifier, check: roll(base), save: roll(save) };
  }

  // What it has grown into at the owner's level (the drake: wings at 7th, Large at 15th).
  const grown = (f.growth ?? []).filter((g) => (ctx.classLevels[g.class] ?? 0) >= g.level);
  const size = grown.reduce((x, g) => g.size ?? x, f.size);
  const speed = grown.reduce((x, g) => g.speed ?? x, f.speed);
  const traits = [...f.traits, ...grown.flatMap((g) => g.traits ?? [])];

  const attacks = f.attacks.map((a) => {
    const hit =
      a.toHit === "spell"
        ? [{ label: sc ? `Your spell attack modifier (${sc.label})` : "Your spell attack modifier", value: sc?.attack.total ?? 0 }]
        : exprParts(a.toHit, "To hit");
    const dmgParts = a.damageBonus !== undefined ? exprParts(a.damageBonus, "Bonus") : [];
    const w: WeaponAttack & { note?: string } = {
      attackId: `companion:${def.id}:${a.name}`,
      name: a.name,
      mode: a.kind,
      action: "attack",
      ability: "str",
      proficient: true,
      attack: roll(hit),
      damage: { dice: a.damage, type: a.damageType, bonus: roll(dmgParts), onCrit: [], critExtraDice: [] },
      properties: [],
    };
    for (const g of grown) for (const x of g.extraDamage ?? []) if (x.attack === a.name) w.damage.bonus.dice.push({ label: g.label, dice: x.dice, damageType: x.damageType });
    if (a.note) w.note = a.note;
    return w;
  });

  r.form = {
    id: f.id,
    name: f.name,
    size,
    type: f.type,
    ac: { total: acParts.reduce((t, p) => t + p.value, 0), parts: acParts },
    hpMax: { total: hpMax, parts: hpParts },
    hp: { current: Math.min(hp.current, hpMax), temp: hp.temp },
    speed,
    speeds: speedsOf(speed),
    attacksPerAction: attacksPerAction([...traits, ...(f.attacks ?? []).map((a) => ({ name: a.name, summary: a.note ?? "" }))]),
    abilities,
    traits,
    attacks,
  };
  if (f.senses) r.form.senses = f.senses;
  if (f.languages) r.form.languages = f.languages;
  if (sc) r.form.saveDc = sc.saveDc.total;
  return r;
}

/**
 * What a companion gives its owner while it's out, at the owner's levels
 * (Bond of Fang and Scale: resistance to the drake's essence).
 */
export function companionOwnerResist(def: CompanionDef, state: CompanionState | undefined, classLevels: Record<string, number>): { type: string; label: string }[] {
  const f = def.forms.find((x) => x.id === state?.form);
  if (!f || state?.hp?.current === 0) return [];
  return (f.growth ?? []).filter((g) => g.ownerResist && (classLevels[g.class] ?? 0) >= g.level).map((g) => ({ type: g.ownerResist!, label: g.label }));
}

/** Companions the player made get ids of their own, never a feature's. */
export const customCompanionId = (id: string) => `custom-${id}`;

/** A companion the player made, as a companion with one stat block (always chosen). */
export function customCompanionDef(cc: CustomCompanion): CompanionDef {
  const form: CompanionDef["forms"][number] = {
    id: "custom",
    name: cc.kind.trim() || cc.type.replace(/^./, (x) => x.toUpperCase()),
    size: cc.size,
    type: cc.type,
    ac: cc.ac,
    hp: { base: cc.hpMax, perLevel: 0, class: "class:none" },
    speed: cc.speed,
    abilities: cc.abilities,
    traits: cc.traits,
    attacks: cc.attacks.map((a) => ({
      name: a.name,
      kind: a.kind,
      toHit: a.toHit,
      damage: a.damage || "0",
      ...(a.damageBonus ? { damageBonus: a.damageBonus } : {}),
      damageType: a.damageType,
      ...(a.reach ? { reach: a.reach } : {}),
      ...(a.note ? { note: a.note } : {}),
    })),
  };
  if (cc.saves && Object.keys(cc.saves).length) form.saves = cc.saves;
  if (cc.senses) form.senses = cc.senses;
  if (cc.languages) form.languages = cc.languages;
  return { id: customCompanionId(cc.id), name: cc.name, forms: [form] };
}

export const RANGERS_COMPANION = "Ranger's Companion";

/**
 * A companion the player made, worked out: its one stat block is always the one in use.
 * `bondActive`: it's the ranger's bonded beast and Ranger's Companion is in use, so it adds
 * the proficiency bonus to its AC, attacks, damage and proficient saves, and its hit point
 * maximum is its own or four times the ranger level, whichever is higher.
 */
export function deriveCustomCompanion(cc: CustomCompanion, state: CompanionState | undefined, ctx: ExprContext, bondActive = false): CompanionResult {
  const def = customCompanionDef(cc);
  const bonded = !!cc.bond && bondActive;
  const rangerLevels = ctx.classLevels["class:ranger"] ?? 0;
  if (bonded && 4 * rangerLevels > cc.hpMax) def.forms[0]!.hp = { base: 0, perLevel: 4, class: "class:ranger" };
  const r = deriveCompanion(def, bonded ? RANGERS_COMPANION : "your own companion", { states: [], ...state, form: "custom" }, ctx, []);
  // Its own initiative unless the player said otherwise; the bonded Ranger's Companion acts on your initiative (PHB).
  r.turn = cc.turn ?? (bonded ? "yours" : "own");
  r.custom = {
    id: cc.id,
    notes: cc.notes,
    kind: cc.kind,
    ...(cc.from ? { from: cc.from } : {}),
    ...(cc.bond ? { bond: { name: RANGERS_COMPANION, active: bonded } } : {}),
  };
  const f = r.form;
  if (bonded && f) {
    const pb: Part = { label: `Proficiency bonus (${RANGERS_COMPANION})`, value: ctx.pb };
    const add = (b: { total: number; parts: Part[] }) => {
      b.parts.push(pb);
      b.total += pb.value;
    };
    add(f.ac);
    for (const a of f.attacks) {
      add(a.attack);
      add(a.damage.bonus);
    }
    // Only the saves it's proficient in: the ones its stat block lists.
    for (const ab of Object.keys(cc.saves ?? {}) as (keyof typeof f.abilities)[]) add(f.abilities[ab].save);
    if (def.forms[0]!.hp.perLevel) f.hpMax.parts = [{ label: `${RANGERS_COMPANION}: 4 × ${rangerLevels} ranger levels (more than its own ${cc.hpMax})`, value: 4 * rangerLevels }];
    r.command = { economy: "action", attackInstead: false };
  }
  return r;
}

const SIZES = ["Tiny", "Small", "Medium", "Large", "Huge", "Gargantuan"] as const;

/** "40 ft., swim 30 ft., fly 60 ft. (hover)" from a stat block's speeds. */
export function speedText(sp: CreatureDef["speed"]): string {
  const parts = [`${sp.walk ?? 0} ft.`];
  for (const k of ["burrow", "climb", "fly", "swim"] as const) if (sp[k]) parts.push(`${k} ${sp[k]} ft.${k === "fly" && sp.hover ? " (hover)" : ""}`);
  return parts.join(", ");
}

/**
 * A companion started from a creature in the content (the Mastiff, a Riding
 * Horse): its numbers, traits and attack actions, all editable afterwards.
 * Actions that aren't attack rolls become traits, so nothing is lost.
 */
export function companionFromCreature(d: CreatureDef): Omit<CustomCompanion, "id" | "name" | "kind" | "notes"> {
  const senses = Object.entries(d.senses ?? {})
    .map(([k, v]) => `${k.replace(/_/g, " ")} ${v}${/passive/.test(k) ? "" : " ft."}`)
    .join(", ");
  const size = SIZES.find((x) => x.toLowerCase() === d.size.toLowerCase()) ?? "Medium";
  const out: Omit<CustomCompanion, "id" | "name" | "kind" | "notes"> = {
    from: d.id,
    size,
    type: d.type,
    ac: d.ac,
    hpMax: d.hp,
    speed: speedText(d.speed),
    abilities: { ...d.abilities },
    traits: [
      ...d.traits.map((t) => ({ name: t.name, summary: t.text })),
      ...[...d.actions, ...(d.bonusActions ?? []), ...(d.reactions ?? [])].filter((a) => !a.attack && a.text).map((a) => ({ name: a.name, summary: a.text })),
    ],
    attacks: d.actions
      .filter((a) => a.attack)
      .map((a) => ({
        name: a.name,
        kind: a.attack!.kind,
        toHit: a.attack!.toHit,
        ...(a.attack!.reach ? { reach: a.attack!.reach } : {}),
        damage: a.attack!.damage,
        damageBonus: a.attack!.damageBonus,
        damageType: a.attack!.damageType,
        // The rest of the attack's text (a save, knocking prone) as a reminder.
        ...(/Hit:.*?damage\.\s*(.+)$/s.exec(a.text)?.[1] ? { note: /Hit:.*?damage\.\s*(.+)$/s.exec(a.text)![1]!.slice(0, 400) } : {}),
      })),
  };
  if (d.saves && Object.keys(d.saves).length) out.saves = { ...d.saves };
  if (senses) out.senses = senses;
  if (d.languages) out.languages = d.languages;
  return out;
}
