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
export function parseItems(texts: string[], pack: string, known: Map<string, ItemDef> = new Map(), excluded: string[] = [], spellIds: Map<string, string> = new Map()): ItemDef[] {
  const every = texts.flatMap(rawItems);
  // A generic variant ("Frost Brand", "Sword of Sharpness") lists the items made from it: "- *Greatsword* (*Frost Brand Greatsword*)".
  // Each of those works like the app's own item of that name, when there is one.
  const variantOf = new Map<string, string>();
  for (const g of every.filter((r) => /^Generic Variant/i.test(r.type)))
    for (const m of g.raw.matchAll(/^\s*[-*] \*[^*]+\* \(\*([^*]+)\*\)/gm)) variantOf.set(slug(m[1]!), g.name);
  const knownList = [...known.values()];
  const appItem = (generic: string): ItemDef | undefined => {
    const s = slug(generic);
    return known.get(s) ?? knownList.find((d) => d.id === `item:${s}` || d.id.startsWith(`item:${s}-`));
  };
  const all = every.filter((r) => !/^Generic Variant/i.test(r.type));
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
      if (bonus && (def.weapon || def.armor || def.category === "shield" || def.category === "ammunition")) def.magic.bonus = Number(bonus[1]);
    }
    const mods = [...bonusModifiers(all, r.name), ...(def.weapon ? weaponModifiers(r.text, r.name) : [])];
    if (mods.length) def.grant = { modifiers: mods };
    // What else its text gives that the app can track (charges, spells, resistances, speeds, darkvision, scores, advantage).
    const more = textMechanics(r.text, r.name, spellIds, def.id);
    if (more.charges) def.charges = more.charges;
    if (more.modifiers.length || more.spells.length || more.resources.length || more.abilityBonuses) {
      const g: NonNullable<ItemDef["grant"]> = def.grant ?? {};
      const have = new Set((g.modifiers ?? []).map((m) => `${m.selector}|${m.op}`));
      const add = more.modifiers.filter((m) => !have.has(`${m.selector}|${m.op}`));
      if (add.length) g.modifiers = [...(g.modifiers ?? []), ...add];
      if (more.spells.length) g.spells = more.spells;
      if (more.resources.length) g.resources = more.resources;
      if (more.abilityBonuses) g.abilityBonuses = more.abilityBonuses;
      def.grant = g;
    }
    // Made from a generic variant the app has (Frost Brand Greatsword, Vorpal Longsword): it works like that one.
    const generic = variantOf.get(slug(r.name));
    const same = generic ? appItem(generic) : undefined;
    if (same && def.weapon && same.weapon) {
      if (same.grant) def.grant = same.grant;
      if (same.magic?.bonus !== undefined) def.magic = { ...def.magic, bonus: same.magic.bonus };
      def.requiresAttunement = same.requiresAttunement;
    }
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
  // "You have resistance to fire damage while you wear this armor" (Breastplate of Fire Resistance),
  // or "while you hold the sword, you have resistance to fire damage" (Frost Brand).
  const resist =
    /you have resistance to (acid|cold|fire|force|lightning|necrotic|poison|psychic|radiant|thunder|bludgeoning|piercing|slashing) damage while you (?:wear|hold)/i.exec(text) ??
    /while you (?:wear|hold) [^,.]{1,40}, you have resistance to (acid|cold|fire|force|lightning|necrotic|poison|psychic|radiant|thunder|bludgeoning|piercing|slashing) damage/i.exec(text);
  if (resist) out.push({ selector: `defense.resist.${resist[1]!.toLowerCase()}`, op: "resist", label } as Mod);
  return out;
}

/**
 * What a magic weapon's text adds to its attacks:
 * - "When you hit with an attack using this magic sword, the target takes an extra 1d6 cold damage" (Frost Brand): on every hit.
 * - "When you hit an undead with it, that target takes an extra 1d8 radiant damage": a tick-box on the damage roll.
 * - "roll a 20 on the attack roll, that target takes an extra 14 slashing damage" (Sword of Sharpness, Vicious): added on a
 *   critical hit; the rest of what a 20 does is shown with it, and "Then roll another d20. If you roll a 20, ..." offers that d20.
 */
export function weaponModifiers(paras: string[], label: string): Mod[] {
  const out: Mod[] = [];
  const text = paras.join(" ");
  const onHit = /When you hit with an attack using this (?:magic )?[\w-]+, the target takes an extra (\d+d\d+) (\w+) damage/i.exec(text);
  if (onHit && DAMAGE_TYPES.includes(onHit[2]!.toLowerCase())) out.push({ selector: "item.damage", op: "add", value: onHit[1]!, damageType: onHit[2]!.toLowerCase(), label } as Mod);
  for (const m of text.matchAll(/When you hit (an? [\w -]{2,30}?) with (?:it|this (?:magic )?[\w-]+), (?:that|the) target takes an extra (\d+d\d+) (\w+) damage/gi))
    if (DAMAGE_TYPES.includes(m[3]!.toLowerCase()))
      out.push({ selector: "item.damage", op: "add", value: m[2]!, damageType: m[3]!.toLowerCase(), label, mode: "suggested", when: { text: `against ${m[1]!}` } } as Mod);
  const twenty = paras.find((p) => /\broll a 20\b/i.test(p) && !/^\*?Note:/i.test(p));
  if (twenty) {
    const flat = /roll a 20\b[^.]*?,? (?:that |the )?target takes an extra (\d+) (\w+) damage/i.exec(twenty);
    if (flat) {
      const type = flat[2]!.toLowerCase();
      out.push({ selector: "item.damage", op: "critBonusDamage", value: Number(flat[1]), label: `${label} (a 20)`, ...(DAMAGE_TYPES.includes(type) ? { damageType: type } : {}) } as Mod);
    }
    const again = /Then roll another d20\. If you roll a 20, (.+)$/i.exec(twenty);
    if (again) out.push({ selector: "item.damage", op: "critD20", value: again[1]!.charAt(0).toUpperCase() + again[1]!.slice(1), label } as Mod);
    // Temporary hit points on a 20 (Life Stealing): given when the damage is rolled.
    const temp = /you (?:also )?gain (\d+) temporary hit points/i.exec(twenty);
    if (temp) out.push({ selector: "item.damage", op: "critTempHp", value: Number(temp[1]), label } as Mod);
    // Anything more a 20 does (temporary hit points, a head cut off, who it doesn't work on): shown with it.
    const sentences = twenty.split(/(?<=\.)\s+/);
    const plain = flat && !again && sentences.length === 1 && /damage\.$/.test(twenty.trim());
    if (!again && !plain) out.push({ selector: "item.damage", op: "critNote", value: twenty, label } as Mod);
  }
  return out;
}

function eval0(frac: string): number {
  const [a, b] = frac.split("/").map(Number);
  return a! / b!;
}

type Spell = NonNullable<NonNullable<ItemDef["grant"]>["spells"]>[number];
type Res = NonNullable<NonNullable<ItemDef["grant"]>["resources"]>[number];
const ABILITY_OF: Record<string, string> = { strength: "str", dexterity: "dex", constitution: "con", intelligence: "int", wisdom: "wis", charisma: "cha" };
const SKILL_OF: Record<string, string> = {
  acrobatics: "acrobatics", "animal handling": "animalHandling", arcana: "arcana", athletics: "athletics", deception: "deception", history: "history", insight: "insight", intimidation: "intimidation",
  investigation: "investigation", medicine: "medicine", nature: "nature", perception: "perception", performance: "performance", persuasion: "persuasion", religion: "religion",
  "sleight of hand": "sleightOfHand", stealth: "stealth", survival: "survival",
};

/**
 * The mechanics an item's text states plainly, for book items (its text stays on the device):
 * - charges: "has 3 charges, and it regains 1d3 expended charges daily at dawn";
 * - spells cast from it, by the app's spell names: at will, with charges ("expend 1 charge to cast", "fireball (3 charges)"),
 *   or once until the next dawn; its save DC when it gives one;
 * - while worn or held: resistance or immunity to a damage type, a flying, swimming or climbing speed, darkvision,
 *   "your Constitution score increases by 2, to a maximum of 20", "your Strength score is 19";
 * - advantage on a check or save: a tick-box with the text's condition (always on when it has none).
 * An activated effect (for 1 minute, until your next turn, as a reaction) isn't read as always on.
 */
export function textMechanics(paras: string[], label: string, spellIds: Map<string, string>, itemId: string): { modifiers: Mod[]; spells: Spell[]; resources: Res[]; charges?: NonNullable<ItemDef["charges"]>; abilityBonuses?: Record<string, number> } {
  const modifiers: Mod[] = [];
  const spells: Spell[] = [];
  const resources: Res[] = [];
  const text = paras.join(" ");
  const sentences = text.split(/(?<=[.!?])\s+(?=[A-Z•*])|\s*•\s*/).map((x) => x.trim()).filter(Boolean);
  // A thing you do for a while, or only in some way: not always on.
  const activated = (t: string) => /\b(for \d+ (minute|hour|round)s?|until (the start|the end|you|it)|as an action|bonus action|reaction|when you|if you|whenever|expend|command word|can use|while (?:you are )?in (?:the )?form)/i.test(t);
  let charges: { max: number; regain?: string } | undefined;
  const ch = /\b(?:has|have|starts with) (\d+) charges/i.exec(text) ?? /\bexpend \d+ of its (\d+) charges/i.exec(text);
  if (ch) {
    charges = { max: Number(ch[1]) };
    const back = /regains? (all|\d+d\d+(?:\s*\+\s*\d+)?|\d+) (?:of its )?(?:expended )?charges (?:daily )?at dawn/i.exec(text);
    if (back) charges.regain = back[1]!.replace(/\s+/g, "");
  }
  // Spells by name: in a sentence that casts with it (not "as if you had cast", "a spell", "try to cast").
  const names = [...spellIds.keys()].sort((a, b) => b.length - a.length);
  const seen = new Set<string>();
  sentences.forEach((sen, si) => {
    // Once until the next dawn: said in this sentence or the next one. "That spell": each spell once; otherwise one use for all.
    const limit = `${sen} ${sentences[si + 1] ?? ""}`;
    // Or said once for the item: "you can't use it to cast that spell again until the next dawn" (Instrument of the Bards).
    const eachAll = /cast (?:that|the same) spell (?:from it )?again until the next dawn/i.test(text);
    const dawn = eachAll || /until the next dawn|once per day|once each day|regains? (?:this|the) (?:ability|use|property) (?:daily )?at dawn/i.test(limit);
    const each = eachAll || (dawn && /that spell|each spell|that same spell/i.test(limit));
    if (!/\bcast\b/i.test(sen) || /as if (?:you had|it had) cast|if you cast|try to cast|cast a spell|spells? cast (?:from|with)|when it was cast|you cast the spell|attack or cast/i.test(sen)) return;
    const lower = sen.toLowerCase().replace(/[*_]/g, "");
    // Only names after "cast" ("in dim light or darkness, you can cast dancing lights": not darkness).
    const castAt = lower.search(/\bcast\b/);
    // Longer names first; a name found is blanked out, so a shorter one inside it isn't found too ("fireball" in "delayed blast fireball").
    let hay = lower.replace(/-/g, " ");
    for (const n of names) {
      // Hyphens as spaces on both sides ("Mordenkainen's faithful hound", "half-orc"), whole words only.
      const re = new RegExp(`(?<![a-z'])${n.replace(/-/g, " ").replace(/[/\\^$*+?.()|[\]{}]/g, "\\$&")}(?![a-z'])`, "gi");
      re.lastIndex = Math.max(0, castAt);
      const m = re.exec(hay);
      if (!m) continue;
      hay = hay.slice(0, m.index) + " ".repeat(m[0].length) + hay.slice(m.index + m[0].length);
      const id = spellIds.get(n)!;
      if (seen.has(id)) continue;
      seen.add(id);
      const near = lower.slice(m.index, m.index + n.length + 40);
      const sp: Spell = { spell: id, name: n.replace(/\b\w/g, (c) => c.toUpperCase()), casting: `from ${label}` };
      const dc = /save dc (\d+)/.exec(lower);
      if (dc) sp.dc = Number(dc[1]);
      const lvl = /(\d)(?:st|nd|rd|th)[- ]level/.exec(near);
      if (lvl) sp.castAt = Number(lvl[1]);
      const cost = /\((\d+) charges?\b/.exec(near) ?? /expend (\d+) (?:of its \d+ )?(?:of its )?charges?/.exec(lower);
      if (charges && cost) {
        sp.charges = { cost: Number(cost[1]) };
        // "1 charge per spell level, up to 4th" (Staff of Healing's cure wounds).
        const per = /per spell level(?:, up to (\d))?/.exec(near);
        if (per) {
          sp.charges.perLevel = true;
          if (per[1]) sp.charges.maxLevel = Number(per[1]);
        }
        sp.casting = `from ${label}: ${cost[1]} charge${cost[1] === "1" ? "" : "s"}${per ? " a level" : ""}`;
      } else if (/at will/.test(lower)) {
        sp.atWill = true;
        sp.casting = `at will, from ${label}`;
      } else if (dawn) {
        const rid = `${itemId.replace(/^item:/, "")}-${each ? id.replace(/^spell:/, "") : "spell"}`;
        if (!resources.some((r) => r.id === rid)) resources.push({ id: rid, name: each ? `${label}: ${sp.name}` : `${label}: its spell`, max: 1, reset: "dawn" } as Res);
        sp.resource = rid;
        sp.casting = `from ${label}, once until the next dawn`;
      } else {
        sp.atWill = true;
        sp.casting = `from ${label}`;
      }
      spells.push(sp);
    }
  });
  // Always on while you wear or hold it.
  for (const sen of sentences) {
    if (activated(sen)) continue;
    for (const m of sen.matchAll(/(resistance|immunity) (?:to|against) ((?:\w+(?:, | or | and |, and |, or ))*\w+) damage/gi)) {
      for (const t of m[2]!.toLowerCase().split(/, and |, or |, | and | or /)) {
        if (!DAMAGE_TYPES.includes(t)) continue;
        modifiers.push({ selector: `defense.${m[1]!.toLowerCase() === "immunity" ? "immune" : "resist"}.${t}`, op: m[1]!.toLowerCase() === "immunity" ? "immune" : "resist", label } as Mod);
      }
    }
    for (const m of sen.matchAll(/you (?:are|become) immune to (\w+) damage/gi)) {
      const t = m[1]!.toLowerCase();
      if (DAMAGE_TYPES.includes(t)) modifiers.push({ selector: `defense.immune.${t}`, op: "immune", label } as Mod);
    }
    if (/\byou\b/i.test(sen)) {
      for (const m of sen.matchAll(/(flying|swimming|climbing) speed (?:equal to your walking speed|of (\d+) feet)/gi)) {
        const kind = { flying: "fly", swimming: "swim", climbing: "climb" }[m[1]!.toLowerCase() as "flying"];
        modifiers.push({ selector: `stat.speed.${kind}`, op: "grantSpeed", value: m[2] ? Number(m[2]) : "walk", label } as Mod);
      }
      const dv = /you (?:have|gain) darkvision (?:out )?to a range of (\d+) feet/i.exec(sen);
      if (dv) modifiers.push({ selector: "sense.darkvision", op: "grantSense", value: Number(dv[1]), label } as Mod);
    }
  }
  // Ability scores while worn: "increases by 2, to a maximum of 20"; "your Strength score is 19" (no effect if it's already higher).
  let abilityBonuses: Record<string, number> | undefined;
  for (const sen of sentences) {
    const inc = /your (strength|dexterity|constitution|intelligence|wisdom|charisma) score increases by (\d), to a maximum of 20/i.exec(sen);
    if (inc && !/studying|practicing|consume|drink/i.test(text)) (abilityBonuses ??= {})[ABILITY_OF[inc[1]!.toLowerCase()]!] = Number(inc[2]);
    const set = /your (strength|dexterity|constitution|intelligence|wisdom|charisma) score (?:is|becomes|changes to) (\d+)/i.exec(sen);
    if (set && !activated(sen)) modifiers.push({ selector: `stat.ability.${ABILITY_OF[set[1]!.toLowerCase()]}`, op: "setMin", value: Number(set[2]), label } as Mod);
  }
  // Advantage: on a skill check, an ability's checks or saves, saves against something, initiative.
  for (const sen of sentences) {
    if (/\breaction|until|for \d+ (minute|hour|round)|as an action|bonus action/i.test(sen)) continue;
    // Each "you have advantage on …" in it; "on Wisdom (Perception) checks and on rolls for initiative": each part.
    const found = [...sen.matchAll(/you (?:have|gain) advantage on ((?:(?!,? and you\b)[^.;])+)/gi)].flatMap((m) => m[1]!.split(/,? and on /i));
    for (const part of found) {
    const what = part.trim().replace(/[.]$/, "").replace(/,? and you\b.*$/i, "").replace(/^rolls for initiative/i, "initiative rolls");
    const qual = (rest: string) => rest.replace(/^\s*(checks?|saving throws?|rolls?)\b/i, "").trim();
    let selector: string | undefined;
    let rest = "";
    const skill = /^(?:strength|dexterity|constitution|intelligence|wisdom|charisma) \(([a-z ]+)\) checks?(.*)$/i.exec(what);
    const abil = /^(strength|dexterity|constitution|intelligence|wisdom|charisma) (checks?|saving throws?)(.*)$/i.exec(what);
    if (skill && SKILL_OF[skill[1]!.toLowerCase()]) {
      selector = `roll.check.skill.${SKILL_OF[skill[1]!.toLowerCase()]}`;
      rest = skill[2]!;
    } else if (abil) {
      selector = `roll.${/sav/i.test(abil[2]!) ? "save" : "check"}.${ABILITY_OF[abil[1]!.toLowerCase()]}`;
      rest = abil[3]!;
    } else if (/^initiative rolls?(.*)$/i.test(what)) {
      selector = "roll.initiative";
      rest = /^initiative rolls?(.*)$/i.exec(what)![1]!;
    } else if (/^saving throws? (.+)$/i.test(what)) {
      selector = "roll.save.*";
      rest = /^saving throws? (.+)$/i.exec(what)![1]!;
    }
    if (!selector) continue;
    const cond = qual(rest).replace(/^[,\s]+/, "");
    modifiers.push({ selector, op: "advantage", label, ...(cond ? { mode: "suggested", when: { text: cond } } : {}) } as Mod);
    }
  }
  return { modifiers, spells, resources, ...(charges ? { charges } : {}), ...(abilityBonuses ? { abilityBonuses } : {}) };
}
