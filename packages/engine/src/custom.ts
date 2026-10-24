import { ARTIFACT_TABLES, artifactProperty } from "./artifacts.js";
import { ABILITY_NAMES, type Ability, type Character, type CustomAction, type CustomItem, type CustomSpell, type Definition, type EffectDef, type FeatureDef, type ItemDef, type Modifier, type SpellDef } from "@dnd/schema";
import { ContentRegistry } from "./registry.js";
import type { DcSpec } from "./dcs.js";

export const customFeatureId = (id: string) => `feature:custom-${id}`;
export const customSpellId = (id: string) => `spell:custom-${id}`;
export const customItemId = (id: string) => `item:custom-${id}`;
export const isCustomItemId = (id: string) => id.startsWith("item:custom-");

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
  return [
    ...(c.customActions ?? []).map((a) => customActionFeature(a, c, reg)),
    ...(c.customSpells ?? []).map(customSpellDef),
    ...(c.customSpells ?? []).flatMap((s) => (customSpellEffect(s) ? [customSpellEffect(s)!] : [])),
    ...(c.customItems ?? []).map((i) => customItemDef(i, reg)),
  ];
}

export const customSpellEffectId = (id: string) => `effect:custom-${id}`;

/**
 * A custom spell's effect, as an ordinary effect (its tag when cast on yourself):
 * the modifiers the sheet applies, and the player's text as its summary, which
 * the app shows but doesn't apply. Its time comes from the spell's duration.
 */
export function customSpellEffect(s: CustomSpell): EffectDef | undefined {
  const e = s.effect;
  if (!e || (!e.modifiers.length && !e.text?.trim())) return undefined;
  const def: EffectDef = {
    kind: "effect",
    id: customSpellEffectId(s.id),
    name: s.name,
    category: "spell",
    source: { pack: "custom", book: s.source || "Your own" },
    modifiers: e.modifiers.map((m) => ({ ...m, label: m.label ?? s.name })),
    reminders: [],
    includes: [],
    concentration: s.concentration,
  } as EffectDef;
  if (e.text?.trim()) def.summary = e.text.trim();
  if (e.untilRest) def.untilRest = e.untilRest;
  return def;
}

/**
 * A custom item as an item definition: what it says is only shown; its
 * modifiers become the item's grant, which the sheet applies while it's
 * equipped (and attuned, if it needs attunement), like any magic item's.
 */
export function customItemDef(i: CustomItem, reg?: ContentRegistry): ItemDef {
  const text = i.description.split(/\n{2,}/).map((x) => x.trim()).filter(Boolean);
  const def: ItemDef = {
    kind: "item",
    id: customItemId(i.id),
    name: i.name,
    source: { pack: "custom", book: i.source || "Your own" },
    category: i.category,
    requiresAttunement: i.requiresAttunement,
    text,
  } as ItemDef;
  if (i.weight !== undefined) def.weight = i.weight;
  if (i.value) def.cost = { amount: i.value.amount, unit: i.value.unit };
  if (i.modifiers.length) def.grant = { modifiers: i.modifiers.map((m) => ({ ...m, label: m.label ?? i.name })) } as ItemDef["grant"];
  // A weapon: its own numbers, over the weapon it started from (its group, so proficiency follows it).
  if (i.category === "weapon" && i.weapon) {
    const base = i.weapon.base ? reg?.find(i.weapon.base, "item")?.weapon : undefined;
    const w = i.weapon;
    def.weapon = {
      category: w.category,
      kind: w.kind,
      group: base?.group ?? i.name.toLowerCase(),
      damage: w.damage,
      damageType: w.damageType,
      properties: w.properties,
      ...(w.versatileDamage ? { versatileDamage: w.versatileDamage } : {}),
      ...(w.range ? { range: w.range } : base?.range ? { range: base.range } : {}),
    };
    if (i.weight === undefined && i.weapon.base) {
      const bw = reg?.find(i.weapon.base, "item")?.weight;
      if (bw !== undefined) def.weight = bw;
    }
  }
  if (i.category === "ammunition" && i.ammoFor?.length) def.ammoFor = i.ammoFor;
  if (i.bonus || i.rarity) def.magic = { ...(i.bonus ? { bonus: i.bonus } : {}), ...(i.rarity ? { rarity: i.rarity } : {}) };
  if (i.curse?.trim()) def.curse = { text: i.curse.trim() };
  if (i.charges) def.charges = { max: i.charges.max, ...(i.charges.regain ? { regain: i.charges.regain } : {}) };
  // An artifact's properties: what the app can apply joins its grant (while attuned); every one is listed in its text.
  if (i.rarity === "artifact" && i.artifact?.length) {
    def.requiresAttunement = true;
    const g: NonNullable<ItemDef["grant"]> = { ...(def.grant ?? {}) };
    const lines: string[] = [];
    for (const a of i.artifact) {
      const p = artifactProperty(a.table, a.roll);
      if (!p) continue;
      const tableName = ARTIFACT_TABLES.find((t) => t.id === a.table)?.name ?? a.table;
      lines.push(`**${tableName} (${a.roll === 100 ? "00" : String(a.roll).padStart(2, "0")}).** ${p.text}${a.pick ? ` (${a.pick.replace(/^spell:/, "").replace(/-/g, " ")})` : p.pick ? " (not picked yet)" : ""}`);
      const add = p.grant?.(a.pick, i.name);
      if (add) {
        if (add.modifiers) g.modifiers = [...(g.modifiers ?? []), ...add.modifiers];
        if (add.proficiencies) g.proficiencies = [...(g.proficiencies ?? []), ...add.proficiencies];
        if (add.resources) g.resources = [...(g.resources ?? []), ...add.resources];
        if (add.actions) g.actions = [...(g.actions ?? []), ...add.actions];
        if (add.spells) g.spells = [...(g.spells ?? []), ...add.spells.map((s) => ({ ...s, name: reg?.find(s.spell, "spell")?.name ?? s.name }))];
        if (add.abilityBonuses) {
          g.abilityBonuses = { ...(g.abilityBonuses ?? {}) };
          for (const [ab, n] of Object.entries(add.abilityBonuses)) g.abilityBonuses[ab as keyof typeof g.abilityBonuses] = (g.abilityBonuses[ab as keyof typeof g.abilityBonuses] ?? 0) + (n ?? 0);
        }
      }
      if (p.onAttune) def.onAttune = [...(def.onAttune ?? []), p.onAttune];
    }
    def.grant = g;
    def.text = [...(def.text ?? []), "**Artifact properties.**", ...lines];
  }
  return def;
}

const cache = new WeakMap<ContentRegistry, { key: string; reg: ContentRegistry }>();

/** The content with the character's own actions and spells added; the same content when there are none. */
export function withCustom(given: ContentRegistry, c: Character): ContentRegistry {
  const reg = given.base ?? given;
  if (!c.customActions?.length && !c.customSpells?.length && !c.customItems?.length) return reg;
  const key = JSON.stringify([c.customActions, c.customSpells, c.customItems, c.classes.map((x) => x.class)]);
  const hit = cache.get(reg);
  if (hit && hit.key === key) return hit.reg;
  const out = reg.overlay(customDefinitions(c, reg));
  cache.set(reg, { key, reg: out });
  return out;
}
