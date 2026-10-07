import { ABILITIES, ABILITY_NAMES, type Ability, type CompanionDef, type CompanionState } from "@dnd/schema";
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

const roll = (parts: Part[]): RollBreakdown => ({ total: parts.reduce((t, p) => t + p.value, 0), parts, dice: [], advantage: [], disadvantage: [], suggestions: [] });

/** Builds a companion's sheet from its definition, the player's choices and the owner's numbers. */
export function deriveCompanion(
  def: CompanionDef,
  source: string,
  state: CompanionState | undefined,
  ctx: ExprContext,
  spellcasting: SpellcastingResult[],
): CompanionResult {
  const r: CompanionResult = { id: def.id, name: state?.name ?? def.name, source, forms: def.forms.map((f) => ({ id: f.id, name: f.name })) };
  if (def.combatNote) r.combatNote = def.combatNote;
  if (def.revive) r.reviveNote = def.revive.note;
  const f = def.forms.find((x) => x.id === state?.form);
  if (!f) return r;

  const sc = spellcasting.find((s) => s.id === def.spellcasting);
  const exprParts = (expr: string | number, label: string): Part[] =>
    evalExpr(expr, ctx).flatMap((t) => (t.kind === "flat" ? [{ label: t.label ?? label, value: t.value }] : []));

  const acParts = exprParts(f.ac, "Base");
  const levels = ctx.classLevels[f.hp.class] ?? 0;
  const hpParts: Part[] = [
    { label: "Base", value: f.hp.base },
    { label: `${f.hp.perLevel} × ${levels} class levels`, value: f.hp.perLevel * levels },
  ];
  const hpMax = hpParts.reduce((t, p) => t + p.value, 0);
  const hp = state?.hp ?? { current: hpMax, temp: 0 };

  const bonus = f.checkBonus !== undefined ? exprParts(f.checkBonus, "Bonus") : [];
  const abilities = {} as NonNullable<CompanionResult["form"]>["abilities"];
  for (const ab of ABILITIES) {
    const score = f.abilities[ab] ?? 10;
    const modifier = Math.floor((score - 10) / 2);
    const base: Part[] = [{ label: `${ABILITY_NAMES[ab]} modifier`, value: modifier }, ...bonus.map((p) => ({ ...p, label: `${p.label} (${def.name})` }))];
    abilities[ab] = { score, modifier, check: roll(base), save: roll(base) };
  }

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
    if (a.note) w.note = a.note;
    return w;
  });

  r.form = {
    id: f.id,
    name: f.name,
    size: f.size,
    type: f.type,
    ac: { total: acParts.reduce((t, p) => t + p.value, 0), parts: acParts },
    hpMax: { total: hpMax, parts: hpParts },
    hp: { current: Math.min(hp.current, hpMax), temp: hp.temp },
    speed: f.speed,
    abilities,
    traits: f.traits,
    attacks,
  };
  if (f.senses) r.form.senses = f.senses;
  if (f.languages) r.form.languages = f.languages;
  if (sc) r.form.saveDc = sc.saveDc.total;
  return r;
}
