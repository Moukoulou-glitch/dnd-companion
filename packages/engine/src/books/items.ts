import type { ArmorStats, ItemDef, WeaponProperty, WeaponStats } from "@dnd/schema";
import { clean, isThirdParty, paragraphs, slug, splitHeadings } from "./text.js";

const PROPERTIES: WeaponProperty[] = ["ammunition", "finesse", "heavy", "light", "loading", "reach", "special", "thrown", "two-handed", "versatile"];
const DAMAGE_TYPES = ["acid", "bludgeoning", "cold", "fire", "force", "lightning", "necrotic", "piercing", "poison", "psychic", "radiant", "slashing", "thunder"];
const RARITIES = ["very rare", "uncommon", "common", "rare", "legendary", "artifact"] as const;

/** True when the file looks like an item list ("#### Name" then a type line such as "Weapon, ..."). */
export function looksLikeItems(text: string): boolean {
  return /^#### .+\n\n(Adventuring Gear|Weapon|Wondrous Item|Potion|Ring|Light Armor|Medium Armor|Heavy Armor|Armor|Treasure|Ammunition|Scroll|Wand|Rod|Staff)\b/m.test(
    text.replace(/\r/g, ""),
  );
}

/** How an item's type line starts ("Weapon (*Maul*), Uncommon", "Wondrous Item, Rare"); anything else is prose. */
const TYPE_LINE = /^(Adventuring Gear|Weapon|Wondrous|Potion|Ring|Light Armor|Medium Armor|Heavy Armor|Armor|Shield|Treasure|Ammunition|Scroll|Wand|Rod|Staff|Generic Variant|Tool|Artisan|Gaming Set|Instrument|Mount|Vehicle|Food|Trade Good|Spellcasting Focus|Explosive|Firearm|Tack|Poison|Siege|Ship|Common|Uncommon|Rare|Very Rare|Legendary|Artifact)\b/i;

interface RawItem {
  name: string;
  /** The whole entry as loaded, for spotting third-party material. */
  raw: string;
  type: string;
  base?: string;
  stats: string[];
  text: string[];
}

function rawItems(text: string): RawItem[] {
  const out: RawItem[] = [];
  for (const e of splitHeadings(text, "####")) {
    // Header block: type line and stat lines up to the first rule; text after it.
    const rule = e.lines.findIndex((l) => /^-{3,}\s*$/.test(l.trim()));
    const head = (rule >= 0 ? e.lines.slice(0, rule) : e.lines).map((l) => l.trim()).filter(Boolean);
    const body = rule >= 0 ? e.lines.slice(rule + 1) : [];
    if (!head.length) continue;
    // No type line at all, the text straight after the name (Master's Amulet, Hag Eye): the whole block is its text,
    // and it's a wondrous item (an amulet is worn, not a shield, whatever its text mentions).
    const first = head[0]!.trim();
    if (!TYPE_LINE.test(first) && (/^\S.{80,}[.!?]$/.test(first) || /\*\*/.test(first))) {
      const text = paragraphs([...(rule >= 0 ? e.lines.slice(0, rule) : e.lines), ...body]).filter((l) => !/^Mastery:/i.test(l));
      out.push({ name: e.name, raw: e.lines.join("\n"), type: "Wondrous Item", stats: [], text });
      continue;
    }
    const typeRaw = head[0]!;
    const base = /\(\*([^*]+)\*\)/.exec(typeRaw)?.[1];
    const stats = head.slice(1).map(clean).filter((l) => !/^Mastery:/i.test(l));
    const text = paragraphs(body).filter((l) => !/^Mastery:/i.test(l));
    const item: RawItem = { name: e.name, raw: e.lines.join("\n"), type: clean(typeRaw), stats, text };
    if (base) item.base = base;
    out.push(item);
  }
  return out;
}

function weaponStats(r: RawItem): WeaponStats | undefined {
  const dmg = /^(\d+(?:d\d+)?) (\w+)/.exec(r.stats[0] ?? "");
  if (!dmg || !DAMAGE_TYPES.includes(dmg[2]!.toLowerCase())) return undefined;
  const props = (r.stats[1] ?? "").toLowerCase();
  const properties = PROPERTIES.filter((p) => new RegExp(`(^|, )${p}\\b`).test(props));
  const w: WeaponStats = {
    category: /Martial Weapon/i.test(r.type) ? "martial" : "simple",
    kind: /Ranged Weapon/i.test(r.type) ? "ranged" : "melee",
    // A staff is a quarterstaff unless it says otherwise (DMG), a rod that works as a mace a mace: proficiency with that weapon covers it.
    group: (/^Staff\b/i.test(r.type) || /magic quarterstaff|as a quarterstaff/i.test(r.text.join(" ")) ? "quarterstaff" : /functions as a magic mace/i.test(r.text.join(" ")) ? "mace" : slug(r.base ?? r.name)).replace(/-/g, " "),
    damage: dmg[1]!,
    damageType: dmg[2]!.toLowerCase() as WeaponStats["damageType"],
    properties,
  };
  const range = /\((\d+)\/(\d+) ft\.\)/.exec(props);
  if (range) w.range = [Number(range[1]), Number(range[2])];
  const versatile = /versatile \((\d+d\d+)\)/.exec(props);
  if (versatile) w.versatileDamage = versatile[1]!;
  return w;
}

function armorStats(r: RawItem): ArmorStats | undefined {
  const ac = /^AC (\d+)/.exec(r.stats[0] ?? "");
  const cat = /^(Light|Medium|Heavy) Armor/i.exec(r.type)?.[1]?.toLowerCase() as ArmorStats["category"] | undefined;
  if (!ac || !cat) return undefined;
  const a: ArmorStats = { category: cat, base: Number(ac[1]), stealthDisadvantage: r.stats.some((s) => /stealth/i.test(s)) };
  const str = /Strength (\d+)/i.exec(r.stats.join(" "));
  if (str) a.strengthRequired = Number(str[1]);
  return a;
}

function category(type: string): ItemDef["category"] {
  // "Staff, Weapon, Rare": a staff that's also a quarterstaff (Staff of the Woodlands).
  if (/^Weapon|^(?:Staff|Rod|Wand), Weapon\b/i.test(type)) return "weapon";
  if (/Shield/i.test(type)) return "shield";
  if (/^(Light|Medium|Heavy) Armor/i.test(type)) return "armor";
  if (/^Ammunition/i.test(type)) return "ammunition";
  if (/^(Potion|Scroll|Food)/i.test(type)) return "consumable";
  if (/Tools|^Tool|Gaming Set|Instrument/i.test(type)) return "tool";
  if (/Spellcasting Focus/i.test(type) && !/Wondrous/i.test(type)) return "focus";
  if (/^(Wondrous|Ring|Rod|Staff|Wand)/i.test(type)) return "wondrous";
  // Only a rarity for a type ("Very Rare": Heartstone, Soul Bag): a magic item, worn or carried.
  if (/^(common|uncommon|rare|very rare|legendary|artifact)\b/i.test(type)) return "wondrous";
  return "gear";
}

/**
 * Parses item lists. Magic weapons and armor take their stats from the base
 * item when it's in the same files. Third-party material is left out, and so
 * is any variant of a base item that isn't an official one.
 */
export function parseItems(texts: string[], pack: string, known: Map<string, ItemDef> = new Map(), excluded: string[] = []): ItemDef[] {
  const all = texts.flatMap(rawItems).filter((r) => !/^Generic Variant/i.test(r.type));
  const thirdParty = all.filter((r) => isThirdParty(r.raw));
  excluded.push(...thirdParty.map((r) => r.name));
  const official = all.filter((r) => !isThirdParty(r.raw));
  const baseNames = new Set([...known.keys(), ...official.filter((r) => !r.base).map((r) => slug(r.name))]);
  const raws = official.filter((r) => {
    if (!r.base || baseNames.has(slug(r.base))) return true;
    excluded.push(r.name);
    return false;
  });
  const bases = new Map(known);
  const out: ItemDef[] = [];
  const build = (r: RawItem): ItemDef => {
    let cat = category(r.type);
    const def: ItemDef = { kind: "item", id: `item:${slug(r.name)}`, name: r.name, source: { pack }, category: cat, requiresAttunement: /Requires Attunement/i.test(r.type) };
    const weight = /([\d.]+|\d+\/\d+) lb\./.exec(r.type);
    if (weight) def.weight = weight[1]!.includes("/") ? eval0(weight[1]!) : Number(weight[1]);
    const baseDef = r.base ? bases.get(slug(r.base)) : undefined;
    if (cat === "weapon") {
      const w = weaponStats(r) ?? baseDef?.weapon;
      if (w) def.weapon = w;
      else cat = def.category = /^(Staff|Rod|Wand)\b/i.test(r.type) ? "wondrous" : "gear";
    }
    if (cat === "armor") {
      const a = armorStats(r) ?? baseDef?.armor;
      if (a) def.armor = a;
      else def.category = "wondrous";
    }
    if (cat === "shield") def.shieldBonus = Number(/^AC \+(\d+)/.exec(r.stats[0] ?? "")?.[1] ?? baseDef?.shieldBonus ?? 2);
    if (def.weight === undefined && baseDef?.weight !== undefined) def.weight = baseDef.weight;
    const lower = r.type.toLowerCase();
    const rarity = RARITIES.find((x) => new RegExp(`(^|, |\\()${x}\\b`).test(lower));
    const all = r.text.join(" ");
    const bonus = /\+(\d) bonus to (?:attack and damage rolls?|AC)/i.exec(all);
    if (rarity || bonus) {
      def.magic = {};
      if (rarity) def.magic.rarity = rarity;
      if (bonus && (def.weapon || def.armor || def.category === "shield")) def.magic.bonus = Number(bonus[1]);
    }
    const mods = bonusModifiers(all, r.name);
    if (mods.length) def.grant = { modifiers: mods };
    if (r.text.length) def.text = r.text;
    return def;
  };
  // Mundane items first so magic versions can find their base.
  const ordered = [...raws.filter((r) => !r.base), ...raws.filter((r) => r.base)];
  const seen = new Set<string>();
  for (const r of ordered) {
    const def = build(r);
    if (seen.has(def.id)) continue;
    seen.add(def.id);
    if (!r.base) bases.set(slug(r.name), def);
    out.push(def);
  }
  return out;
}

type Mod = NonNullable<NonNullable<ItemDef["grant"]>["modifiers"]>[number];

/**
 * Bonuses an item's text gives while it's held or worn, read from its wording:
 * "+2 bonus to spell attack rolls" (Staff of the Woodlands), "...and the saving throw DCs of your artificer spells"
 * (All-Purpose Tool), "+1 bonus to saving throws while you wear it" (Robe of Stars). Bonuses that need
 * something more (a friend in the light) are left to the player.
 */
export function bonusModifiers(text: string, label: string): Mod[] {
  const out: Mod[] = [];
  const spell = /\+(\d) bonus to (?:the |your )?spell attack rolls(?: and (?:to )?the (?:spell )?saving throw DCs)?(?: of your (\w+) spells)?/i.exec(text);
  if (spell) {
    const n = Number(spell[1]);
    const cls = spell[2]?.toLowerCase();
    const suffix = cls ? `.${cls}` : "";
    out.push({ selector: `stat.spell.attack${suffix}`, op: "add", value: n, label } as Mod);
    if (/saving throw DCs/i.test(spell[0])) out.push({ selector: `stat.spell.dc${suffix}`, op: "add", value: n, label } as Mod);
  }
  const saves = /you (?:gain|have) a \+(\d) bonus to saving throws while you (?:wear|hold)/i.exec(text);
  if (saves) out.push({ selector: "roll.save.*", op: "add", value: Number(saves[1]), label } as Mod);
  // "You have resistance to fire damage while you wear this armor" (Breastplate of Fire Resistance).
  const resist = /you have resistance to (acid|cold|fire|force|lightning|necrotic|poison|psychic|radiant|thunder|bludgeoning|piercing|slashing) damage while you (?:wear|hold)/i.exec(text);
  if (resist) out.push({ selector: `defense.resist.${resist[1]!.toLowerCase()}`, op: "resist", label } as Mod);
  return out;
}

function eval0(frac: string): number {
  const [a, b] = frac.split("/").map(Number);
  return a! / b!;
}
