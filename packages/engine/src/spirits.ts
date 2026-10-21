import type { CreatureDef, SummonDef } from "@dnd/schema";

/**
 * A spirit summoned at a level (Summon Beast at 4th: AC 15, 40 HP, two
 * attacks), built from its summon's template for the variant picked and the
 * caster's spell attack and save DC. Its id carries all of that, so the
 * summoned creature finds the same stat block every time it's looked up:
 * "creature:spirit/<summon>/<variant>/<level>/<attack>/<dc>".
 */
export const SPIRIT_PREFIX = "creature:spirit/";

export function spiritId(summonId: string, variant: string, level: number, attack: number, dc: number): string {
  return `${SPIRIT_PREFIX}${summonId.replace(/^summon:/, "")}/${variant}/${level}/${attack}/${dc}`;
}

export function parseSpiritId(id: string): { summon: string; variant: string; level: number; attack: number; dc: number } | undefined {
  if (!id.startsWith(SPIRIT_PREFIX)) return undefined;
  const [summon, variant, level, attack, dc] = id.slice(SPIRIT_PREFIX.length).split("/");
  const n = (x: string | undefined) => (x !== undefined && /^-?\d+$/.test(x) ? Number(x) : NaN);
  if (!summon || !variant || [n(level), n(attack), n(dc)].some(Number.isNaN)) return undefined;
  return { summon: `summon:${summon}`, variant, level: n(level), attack: n(attack), dc: n(dc) };
}

const WORDS = ["", "one", "two", "three", "four", "five"];

export function spiritCreature(s: SummonDef, variant: string, level: number, attack: number, dc: number): CreatureDef | undefined {
  const t = s.spirit;
  if (!t) return undefined;
  const v = t.variants.find((x) => x.id === variant);
  if (!v) return undefined;
  const lvl = Math.max(t.minLevel, Math.min(9, level));
  const has = (x: { variants?: string[] | undefined }) => !x.variants || x.variants.includes(variant);
  const fill = (text: string) => text.replace(/\{dc\}/g, String(dc)).replace(/\{level\}/g, String(lvl)).replace(/\{multi\}/g, WORDS[Math.floor(lvl / 2)] ?? String(Math.floor(lvl / 2)));
  const speed: CreatureDef["speed"] = { walk: 0 };
  for (const sp of t.speed.filter(has)) {
    const { variants: _v, ...rest } = sp;
    Object.assign(speed, rest);
  }
  const avg = (dice: string) => {
    const m = /^(\d+)d(\d+)$/.exec(dice);
    return m ? Math.floor((Number(m[1]) * (Number(m[2]) + 1)) / 2) : 0;
  };
  const actions: CreatureDef["actions"] = t.actions.filter(has).map((a) => {
    if (!a.attack) return { name: a.name, text: fill(a.text) };
    const bonus = a.attack.damageBonus + lvl;
    const type = a.attack.damageTypeFor?.[variant] ?? a.attack.damageType;
    const kind = a.attack.kind === "melee" ? "Melee" : "Ranged";
    const where = a.attack.reach ?? (a.attack.kind === "melee" ? "reach 5 ft." : "range 150 ft.");
    const hit = `${kind} Attack: +${attack} to hit, ${where}, one target. Hit: ${avg(a.attack.damage) + bonus} (${a.attack.damage} + ${bonus}) ${type} damage${a.text ? `${/^plus /.test(a.text) ? " " : ". "}${fill(a.text)}` : "."}`;
    return { name: a.name, text: hit, attack: { kind: a.attack.kind, toHit: attack, reach: where.replace(/^(reach|range) /, ""), damage: a.attack.damage, damageBonus: bonus, damageType: type } };
  });
  // Multiattack: half the spell's level; none below two attacks (Summon Beast at 2nd or 3rd: one).
  const many = Math.floor(lvl / 2);
  if (many < 2) {
    const i = actions.findIndex((a) => /^multiattack/i.test(a.name) && !/Breath/.test(a.text));
    if (i >= 0) actions.splice(i, 1);
  } else if (!actions.some((a) => /^multiattack/i.test(a.name))) actions.unshift({ name: "Multiattack", text: `It makes ${WORDS[many] ?? many} attacks.` });
  const d: CreatureDef = {
    kind: "creature",
    id: spiritId(s.id, variant, lvl, attack, dc),
    name: `${t.name} (${v.name})`,
    source: s.source,
    summary: `Summoned at level ${lvl}: AC ${t.ac.base + lvl + (v.acBonus ?? 0)}, its attacks use your spell attack (+${attack}), your save DC ${dc}.`,
    size: t.size,
    type: t.type,
    ac: t.ac.base + lvl + (v.acBonus ?? 0),
    acNote: "natural armor",
    hp: Math.max(1, (v.hp ?? t.hp.base) + t.hp.perLevel * (lvl - t.minLevel)),
    speed,
    abilities: { ...t.abilities },
    cr: 0,
    traits: t.traits.filter(has).map((x) => ({ name: x.name, text: fill(x.text) })),
    actions,
  };
  if (t.senses) d.senses = { ...t.senses };
  if (t.languages) d.languages = t.languages;
  const resist = (t.resist ?? []).filter(has).map((x) => x.type);
  const immune = (t.immune ?? []).filter(has).map((x) => x.type);
  if (resist.length) d.resist = resist;
  if (immune.length) d.immune = immune;
  if (t.conditionImmune?.length) d.conditionImmune = [...t.conditionImmune];
  const bonus = (t.bonusActions ?? []).filter(has).map((x) => ({ name: x.name, text: fill(x.text) }));
  const reactions = (t.reactions ?? []).filter(has).map((x) => ({ name: x.name, text: fill(x.text) }));
  if (bonus.length) d.bonusActions = bonus;
  if (reactions.length) d.reactions = reactions;
  return d;
}
