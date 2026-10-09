import { ABILITY_NAMES, type Ability, type Character, type CustomAction, type CustomSpell, type Definition, type FeatureDef, type Modifier, type SpellDef } from "@dnd/schema";
import { ContentRegistry } from "./registry.js";
import type { DcSpec } from "./dcs.js";

export const customFeatureId = (id: string) => `feature:custom-${id}`;
export const customSpellId = (id: string) => `spell:custom-${id}`;

const ECON: Record<CustomAction["economy"], string> = { action: "Action", bonus: "Bonus action", reaction: "Reaction", free: "No action" };

/** The character's first spellcasting ability, for "spellcasting ability" attacks. */
function castingAbility(c: Character, reg: ContentRegistry): Ability {
  for (const cl of c.classes) {
    const a = reg.find(cl.class, "class")?.spellcasting?.ability;
    if (typeof a === "string") return a;
  }
  return "int";
}

/** Dice that add up: "2d6" + "1d6" → "3d6"; different dice stay side by side. */
export function addDice(a: string, b: string, times = 1): string {
  if (!b || times <= 0) return a;
  const ma = /^(\d*)d(\d+)$/.exec(a.trim());
  const mb = /^(\d*)d(\d+)$/.exec(b.trim());
  if (ma && mb && ma[2] === mb[2]) return `${Number(ma[1] || 1) + Number(mb[1] || 1) * times}d${ma[2]}`;
  return [a, ...Array.from({ length: times }, () => b)].join(" + ");
}

/** A dice table from a level up to 9th, adding `per` for every level above the first. */
function slotTable(level: number, dice: string, per?: string, mod?: boolean): Record<string, string> {
  const out: Record<string, string> = {};
  const from = Math.max(1, level);
  for (let l = from; l <= 9; l++) out[String(l)] = `${addDice(dice, per ?? "", per ? l - from : 0)}${mod ? " + MOD" : ""}`;
  return out;
}

/** What a custom action says about itself, for its note and summary. */
function describe(a: CustomAction): string {
  const bits: string[] = [];
  if (a.target) bits.push(`Target: ${a.target}`);
  if (a.range) bits.push(`Range: ${a.range}`);
  if (a.save) {
    const dc = typeof a.save.dc === "number" ? `DC ${a.save.dc}` : a.save.dc === "spell" ? "your spell save DC" : `8 + proficiency + ${ABILITY_NAMES[a.save.dc]}`;
    bits.push(
      `${ABILITY_NAMES[a.save.ability]} save (${dc})${a.save.damage ? `: ${a.save.damage}${a.save.damageType ? ` ${a.save.damageType}` : ""} damage${a.save.onSuccess === "half" ? ", half on a success" : a.save.onSuccess === "none" ? ", none on a success" : ""}` : ""}`,
    );
    if (a.save.condition) bits.push(`On a failure: ${a.save.condition.replace(/^condition:/, "").replace(/^./, (x) => x.toUpperCase())}`);
  }
  if (a.heal) bits.push(`${a.heal.temp ? "Temporary hit points" : "Heals"} ${a.heal.amount}`);
  if (a.duration) bits.push(`Lasts ${a.duration.rounds ? `${a.duration.rounds} rounds` : `${a.duration.minutes} minutes`}${a.concentration ? " (concentration)" : ""}`);
  if (a.uses) bits.push(`${a.uses.max} per ${a.uses.reset === "dawn" ? "dawn" : `${a.uses.reset} rest`}`);
  return bits.join(". ");
}

/** A custom action as a feature: its use, attack, uses and what it says. */
export function customActionFeature(a: CustomAction, c: Character, reg: ContentRegistry): FeatureDef {
  const id = customFeatureId(a.id);
  const info = describe(a);
  const note = [a.description.trim(), info].filter(Boolean).join(" ");
  const grant: NonNullable<FeatureDef["grant"]> = {};
  const res = `custom-${a.id}`;
  if (a.uses) grant.resources = [{ id: res, name: a.name, max: a.uses.max, reset: a.uses.reset }];
  if (a.kind === "attack" && a.attack) {
    const at = a.attack;
    // The engine works out weapon-like attacks with Strength (melee) or Dexterity (ranged); the rest is adjusted here.
    const auto: Ability = at.mode === "ranged" ? "dex" : "str";
    const ab: Ability | undefined = at.ability === "none" ? undefined : at.ability === "spell" ? castingAbility(c, reg) : at.ability;
    const swap = ab ? (ab === auto ? "" : `mod.${ab} - mod.${auto}`) : `- mod.${auto}`;
    const attackExpr = [swap, at.proficient ? "" : "- pb", at.bonus ? (at.bonus > 0 ? `+ ${at.bonus}` : `- ${-at.bonus}`) : ""].filter(Boolean).join(" ").replace(/^\+ /, "");
    const damageAbility = at.addAbility && ab ? swap : `- mod.${auto}`;
    const damageExpr = [damageAbility, at.damageBonus ? (at.damageBonus > 0 ? `+ ${at.damageBonus}` : `- ${-at.damageBonus}`) : ""].filter(Boolean).join(" ").replace(/^\+ /, "");
    grant.attacks = [{ id: `custom-${a.id}`, name: a.name, category: "simple", kind: at.mode, damage: at.damage || "1", damageType: at.damageType, properties: [], action: a.economy === "bonus" ? "bonus" : "attack" }];
    const mods: Modifier[] = [];
    const label = `${a.name} (${ab ? ABILITY_NAMES[ab] : "no ability"}${at.proficient ? "" : ", not proficient"}${at.bonus ? `, ${at.bonus > 0 ? "+" : ""}${at.bonus}` : ""})`;
    if (attackExpr) mods.push({ selector: `attack.custom-${a.id}`, op: "add", value: attackExpr, mode: "auto", label });
    if (damageExpr) mods.push({ selector: `damage.custom-${a.id}`, op: "add", value: damageExpr, mode: "auto", label });
    grant.modifiers = mods;
    // Uses and economy other than the Attack action still get a "use" entry to spend them.
    if (a.uses || a.economy === "reaction" || a.economy === "free") grant.actions = [{ id: `custom-${a.id}`, name: a.name, economy: a.economy, toggles: [], ...(a.uses ? { cost: { resource: res, amount: 1 } } : {}), note: note || `${ECON[a.economy]}: attack.` }];
  } else {
    grant.actions = [
      {
        id: `custom-${a.id}`,
        name: a.name,
        economy: a.economy,
        toggles: [],
        ...(a.uses ? { cost: { resource: res, amount: 1 } } : {}),
        ...(a.duration ? { duration: a.duration } : {}),
        ...(a.kind === "heal" && a.heal ? (a.heal.temp ? { tempHp: a.heal.amount } : { heal: a.heal.amount }) : {}),
        ...(a.kind === "save" && a.save?.damage ? { roll: { dice: a.save.damage, label: `${a.save.damageType ?? ""} damage`.trim() } } : {}),
        ...(note ? { note } : {}),
      },
    ];
  }
  return {
    kind: "feature",
    id,
    name: a.name,
    summary: note || `${ECON[a.economy]}${a.source ? `, from ${a.source}` : ""}.`,
    source: { pack: "custom", book: a.source || "Your own" },
    grant,
  };
}

/** The DC of a custom action that forces a save. */
export function customActionDc(a: CustomAction): DcSpec | undefined {
  if (!a.save) return undefined;
  const save = `${ABILITY_NAMES[a.save.ability]}`;
  if (typeof a.save.dc === "number") return { save, by: a.save.dc, name: "Save DC" };
  if (a.save.dc === "spell") return { save, by: "spell:*", name: "Spell save DC" };
  return { save, by: [a.save.dc], name: "Save DC" };
}

/** A custom spell as a spell definition the rest of the app understands. */
export function customSpellDef(s: CustomSpell): SpellDef {
  const text = s.description.split(/\n{2,}/).map((x) => x.trim()).filter(Boolean);
  const def: SpellDef = {
    kind: "spell",
    id: customSpellId(s.id),
    name: s.name,
    summary: text[0]?.slice(0, 200) ?? "",
    source: { pack: "custom", book: s.source || "Your own" },
    level: s.level,
    school: s.school,
    castingTime: s.castingTime,
    range: s.range,
    components: s.components,
    duration: s.duration,
    concentration: s.concentration,
    ritual: s.ritual,
    classes: [],
    text,
    higherLevels: s.higherLevels ? [s.higherLevels] : [],
  };
  if (!def.summary) delete def.summary;
  if (s.material) def.material = s.material;
  if (s.attack) def.attack = s.attack;
  if (s.save) def.save = s.save;
  if (s.area) def.area = s.area;
  if (s.damage?.dice) {
    const d = s.damage;
    def.damage = {
      ...(d.type ? { type: d.type } : {}),
      ...(s.level === 0
        ? d.cantripScaling
          ? { atCharacterLevel: { "1": `${d.dice}${d.addMod ? " + MOD" : ""}`, "5": `${addDice(d.dice, d.dice)}${d.addMod ? " + MOD" : ""}`, "11": `${addDice(d.dice, d.dice, 2)}${d.addMod ? " + MOD" : ""}`, "17": `${addDice(d.dice, d.dice, 3)}${d.addMod ? " + MOD" : ""}` } }
          : { atCharacterLevel: { "1": `${d.dice}${d.addMod ? " + MOD" : ""}` } }
        : { atSlot: slotTable(s.level, d.dice, d.perSlot, d.addMod) }),
    };
  }
  if (s.heal?.dice) def.heal = { atSlot: slotTable(s.level || 1, s.heal.dice, s.heal.perSlot, s.heal.addMod) };
  return def;
}

/** Everything the character wrote, as definitions. */
export function customDefinitions(c: Character, reg: ContentRegistry): Definition[] {
  return [...(c.customActions ?? []).map((a) => customActionFeature(a, c, reg)), ...(c.customSpells ?? []).map(customSpellDef)];
}

const cache = new WeakMap<ContentRegistry, { key: string; reg: ContentRegistry }>();

/** The content with the character's own actions and spells added; the same content when there are none. */
export function withCustom(given: ContentRegistry, c: Character): ContentRegistry {
  const reg = given.base ?? given;
  if (!c.customActions?.length && !c.customSpells?.length) return reg;
  const key = JSON.stringify([c.customActions, c.customSpells, c.classes.map((x) => x.class)]);
  const hit = cache.get(reg);
  if (hit && hit.key === key) return hit.reg;
  const out = reg.overlay(customDefinitions(c, reg));
  cache.set(reg, { key, reg: out });
  return out;
}
