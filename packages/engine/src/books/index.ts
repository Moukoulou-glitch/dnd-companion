import type { BackgroundDef, ContentPack, Definition, FeatureDef, ItemDef, RaceDef, SubclassDef } from "@dnd/schema";
import type { ContentRegistry } from "../registry.js";
import { entryFileKind, looksLikeClassPage, parseClassPageParts, parseEntries, parseRaceTraits, type ClassPageParts, type TextEntry } from "./entries.js";
import { parseBackgrounds, type BookBackground } from "./backgrounds.js";
import { parseBookRaces, type BookRace } from "./races.js";
import { looksLikeBestiary, parseBestiary } from "./bestiary.js";
import { looksLikeItems, parseItems } from "./items.js";
import { looksLikeSpells, parseSpells } from "./spells.js";
import { slug } from "./text.js";

export { slug } from "./text.js";

export const BOOK_PACK_ID = "books-local";

/** A file the player loaded on their device. */
export interface BookFile {
  name: string;
  text: string;
}

export type BookFileKind = "spells" | "items" | "feats" | "races" | "backgrounds" | "class page" | "actions" | "options" | "bestiary" | "unknown";

export interface BookReport {
  files: { name: string; kind: BookFileKind; entries: number }[];
  /** New definitions, by kind. */
  added: Record<string, number>;
  /** Existing definitions that got their book text. */
  textAdded: number;
  /** Table entries the book versions were not allowed to change (house rules, remastered feats, homebrew). */
  kept: string[];
  /** How many third-party entries (Grim Hollow and other publishers) were left out. */
  excluded: number;
}

export function bookFileKind(text: string): BookFileKind {
  if (looksLikeSpells(text)) return "spells";
  if (looksLikeItems(text)) return "items";
  if (looksLikeClassPage(text)) return "class page";
  if (looksLikeBestiary(text)) return "bestiary";
  if (/^## Dash\s*$/m.test(text) && /^## (Dodge|Disengage)\s*$/m.test(text)) return "actions";
  // Optional features (Eldritch Invocations, Metamagic, Fighting Styles...): text for those features, never new feats.
  if (/^\*Type: (Eldritch Invocation|Metamagic|Fighting Style|Pact Boon|Maneuver|Artificer Infusion|Rune)/im.test(text)) return "options";
  return entryFileKind(text) ?? "unknown";
}

/**
 * The table's own versions always win: house rules, rulings, campaign items
 * and homebrew (the remastered feats) are never changed by a book. SRD
 * entries already have their text.
 */
export function isProtected(def: Definition): boolean {
  if (def.source.pack === "srd-5.1") return true;
  return /homebrew|table ruling|campaign/i.test(def.source.book ?? "");
}

const norm = (s: string) => s.toLowerCase().replace(/['’]/g, "").replace(/\s+/g, " ").trim();

/** Names a definition can be matched by: "Deft Explorer: Canny" also matches "Deft Explorer"; "Ντόπιος Ήρωας (Folk Hero)" matches "Folk Hero". */
function namesOf(def: Definition): string[] {
  const out = [norm(def.name)];
  const paren = /\(([^)]+)\)\s*$/.exec(def.name)?.[1];
  if (paren) out.push(norm(paren));
  if (def.name.includes(":")) {
    out.push(norm(def.name.split(":")[0]!));
    // "Eldritch Invocation: Agonizing Blast" also matches "Agonizing Blast".
    out.push(norm(def.name.slice(def.name.indexOf(":") + 1)));
  }
  out.push(norm(def.name.replace(/\s*\([^)]*\)\s*$/, "")));
  return [...new Set(out)];
}

/** Official books whose subclasses a class page may add (third-party ones are never loaded). */
const OFFICIAL_BOOKS = new Set(["PHB'14", "PHB", "XGE", "TCE", "SCAG", "DMG'14", "DMG", "EGW", "VRGR", "FTD", "MOT", "GGR", "ERLW", "SCC", "AAG", "BMT", "MTF", "VGM", "AI", "LLK", "SatO", "TDCSR"].filter((b) => b !== "TDCSR"));

const BOOK_NAMES: Record<string, string> = { "PHB'14": "PHB", XGE: "XGE", TCE: "TCE", SCAG: "SCAG", EGW: "EGW", VRGR: "VRGR" };
const bookName = (tag?: string) => (tag ? BOOK_NAMES[tag] ?? tag : "Book");

/** "College of Lore", "Lore", "The Fiend", "Life Domain", "Draconic Bloodline" all compare by their core name. */
function subclassKey(name: string): string {
  return norm(name)
    .replace(/\s*\([^)]*\)\s*$/, "")
    .replace(/^(the|college of( the)?|circle of( the)?|way of( the)?|oath of( the)?|path of( the)?|school of|order of( the)?)\s+/, "")
    .replace(/\s+(domain|bloodline)$/, "")
    .trim();
}

const titleCase = (s: string) => s.replace(/\b([a-z])/g, (m) => m.toUpperCase()).replace(/\b(Of|The|And|From|To)\b/g, (m) => m.toLowerCase()).replace(/^./, (m) => m.toUpperCase());

/** Spell tables in a subclass's text, by class level; a feature with several tables (Circle of the Land's terrains) is left as text. */
function subclassSpellTables(text: string[]): { level: number; spells: string[] }[][] {
  const tables: { level: number; spells: string[] }[][] = [];
  let cur: { level: number; spells: string[] }[] | undefined;
  for (const line of text) {
    if (/(Bard|Cleric|Druid|Paladin|Ranger|Sorcerer|Warlock|Wizard|Fighter|Rogue|Monk|Barbarian) Level · (Spells|.*Spells)$/.test(line)) {
      cur = [];
      tables.push(cur);
      continue;
    }
    const m = /^(\d+)(?:st|nd|rd|th) · (.+)$/.exec(line);
    if (cur && m) {
      cur.push({ level: Number(m[1]), spells: m[2]!.split(/,\s*/).map((x) => x.trim()).filter(Boolean) });
      continue;
    }
    cur = undefined;
  }
  return tables.length === 1 ? tables.filter((t) => t.length > 0) : [];
}

/**
 * Reads the player's book files and returns a pack that adds their text to
 * the existing content (and new spells, feats, backgrounds and items),
 * leaving every protected table entry exactly as it is.
 */
export function bookPack(files: BookFile[], base: ContentRegistry): { pack: ContentPack; report: BookReport } {
  const report: BookReport = { files: [], added: {}, textAdded: 0, kept: [], excluded: 0 };
  const excluded: string[] = [];
  const out = new Map<string, Definition>();
  const kept = new Set<string>();

  const spells = [];
  const itemTexts: string[] = [];
  const named: { kind: "feat" | "background" | "trait" | "feature" | "action"; entries: TextEntry[]; classId?: string }[] = [];
  const pages: { parts: ClassPageParts; classId: string }[] = [];
  const bookBackgrounds = new Map<string, BookBackground>();
  const bookRaces: BookRace[] = [];
  // Which class or subclass lists each feature, so a class page's text stays with its own class.
  const owner = new Map<string, string>();
  for (const d of [...base.list("class"), ...base.list("subclass")]) {
    for (const r of (d as { features: { feature: string }[] }).features) if (!owner.has(r.feature)) owner.set(r.feature, d.id);
  }
  const classByName = new Map<string, string>();
  for (const c of base.list("class")) for (const n of namesOf(c)) classByName.set(n, c.id);

  for (const f of files) {
    const kind = bookFileKind(f.text);
    let count = 0;
    if (kind === "spells") {
      const s = parseSpells(f.text, BOOK_PACK_ID, excluded);
      spells.push(...s);
      count = s.length;
    } else if (kind === "items") {
      itemTexts.push(f.text);
      count = (f.text.match(/^#### /gm) ?? []).length;
    } else if (kind === "backgrounds") {
      const b = parseBackgrounds(f.text, excluded);
      for (const x of b) if (!bookBackgrounds.has(x.name)) bookBackgrounds.set(x.name, x);
      named.push({ kind: "background", entries: b.map((x) => ({ name: x.name, text: x.text })) });
      count = b.length;
    } else if (kind === "feats") {
      const e = parseEntries(f.text, excluded);
      named.push({ kind: kind === "feats" ? "feat" : "background", entries: e });
      count = e.length;
    } else if (kind === "races") {
      const e = parseRaceTraits(f.text);
      named.push({ kind: "trait", entries: e });
      bookRaces.push(...parseBookRaces(f.text, excluded));
      count = e.length;
    } else if (kind === "options") {
      const e = parseEntries(f.text, excluded).map((x) => ({ ...x, text: x.text.filter((p) => !/^Type: /.test(p)) }));
      named.push({ kind: "feature", entries: e });
      count = e.length;
    } else if (kind === "actions") {
      const e = parseEntries(f.text);
      named.push({ kind: "action", entries: e });
      count = e.length;
    } else if (kind === "bestiary") {
      // Creatures the content doesn't have are added; the SRD's own keep theirs (and get no book text).
      const cs = parseBestiary(f.text, BOOK_PACK_ID, excluded);
      for (const cdef of cs) {
        if (base.has(cdef.id) || out.has(cdef.id)) continue;
        out.set(cdef.id, cdef);
        report.added.creature = (report.added.creature ?? 0) + 1;
      }
      count = cs.length;
    } else if (kind === "class page") {
      const parts = parseClassPageParts(f.text, [...classByName.keys()]);
      const classId = parts.className ? classByName.get(norm(parts.className)) : undefined;
      if (classId) {
        named.push({ kind: "feature", entries: parts.classEntries, classId });
        pages.push({ parts, classId });
      } else named.push({ kind: "feature", entries: parts.entries });
      count = parts.entries.length;
    }
    report.files.push({ name: f.name, kind, entries: count });
  }

  const added = (kind: string) => (report.added[kind] = (report.added[kind] ?? 0) + 1);

  /** Gives an existing definition its book text, keeping all its mechanics. */
  const attach = (def: Definition, text: string[], extra?: (d: Definition) => void): void => {
    if (isProtected(def)) {
      if (def.source.pack !== "srd-5.1") kept.add(def.name);
      return;
    }
    if (out.has(def.id)) return;
    const copy = structuredClone(def) as Definition;
    copy.text = text;
    if (copy.summary && /Placeholder/i.test(copy.summary)) delete copy.summary;
    extra?.(copy);
    out.set(copy.id, copy);
    report.textAdded++;
  };

  // Spells: the book's version, but placeholders keep their checked numbers.
  for (const s of spells) {
    const existing = base.find(s.id, "spell");
    if (!existing) {
      if (!out.has(s.id)) {
        out.set(s.id, s);
        added("spell");
      }
      continue;
    }
    attach(existing, s.text, (d) => {
      const sp = d as typeof s;
      sp.higherLevels = s.higherLevels;
      if (!sp.classes.length) sp.classes = s.classes;
      if (!sp.material && s.material) sp.material = s.material;
      if (!sp.attack && !sp.save && !sp.damage && !sp.heal) Object.assign(sp, { attack: s.attack, save: s.save, damage: s.damage, heal: s.heal });
      for (const k of ["attack", "save", "damage", "heal"] as const) if (sp[k] === undefined) delete sp[k];
    });
  }

  // A book background's Equipment line: linked names the app has an item for become items, the rest stay as words.
  const itemBySlug = new Map(base.list("item").map((i) => [slug(i.name), i.id]));
  const equipmentOf = (bg: BookBackground): BackgroundDef["equipment"] | undefined => {
    if (!bg.equipment) return undefined;
    const find = (n: string) => itemBySlug.get(slug(n)) ?? itemBySlug.get(slug(n).replace(/s$/, "")) ?? itemBySlug.get(`${slug(n)}s`);
    const fixed: { item: string; quantity: number }[] = [];
    const other: string[] = [];
    for (const p of bg.equipment.pieces) {
      const id = p.links.length === 1 && !/\bor\b|of your choice/i.test(p.text) ? find(p.links[0]!) : undefined;
      if (id) fixed.push({ item: id, quantity: Number(/^(\d+)\s/.exec(p.text)?.[1] ?? 1) });
      else other.push(p.text);
    }
    return { fixed, options: [], ...(bg.equipment.gold ? { gold: String(bg.equipment.gold) } : {}), ...(other.length ? { other } : {}) };
  };

  // Named text: matched to existing definitions by name; new feats and backgrounds are added.
  const byName = new Map<string, Definition[]>();
  for (const kind of ["feature", "subclass", "feat", "background"] as const) {
    for (const d of base.list(kind)) for (const n of namesOf(d)) byName.set(n, [...(byName.get(n) ?? []), d]);
  }
  for (const group of named) {
    for (const e of group.entries) {
      const keys = [norm(e.name), norm(e.name.replace(/\s*\([^)]*\)\s*$/, ""))];
      const isCommon = (d: Definition) => d.kind === "feature" && (d as { common?: boolean }).common === true;
      const matches = keys.flatMap((k) => byName.get(k) ?? []).filter((d) => {
        // The actions anyone can take only get text from the actions file, and only they do.
        if (group.kind === "action") return isCommon(d);
        if (isCommon(d)) return false;
        if (group.kind === "feat") return d.kind === "feat";
        if (group.kind === "background") return d.kind === "background";
        if (d.kind !== "feature" && d.kind !== "subclass") return false;
        // A class page's own features: never another class's or subclass's feature of the same name.
        if (group.classId && d.kind === "feature") {
          const o = owner.get(d.id);
          return !o || o === group.classId;
        }
        return group.classId ? false : true;
      });
      const bgBook = group.kind === "background" ? bookBackgrounds.get(e.name) : undefined;
      for (const d of new Set(matches))
        attach(d, e.text, (copy) => {
          // A table background without its starting equipment takes the book's.
          const eq = bgBook && copy.kind === "background" && !copy.equipment ? equipmentOf(bgBook) : undefined;
          if (eq && copy.kind === "background") copy.equipment = eq;
        });
      if (matches.length || (group.kind !== "feat" && group.kind !== "background")) continue;
      const id = `${group.kind}:${slug(e.name)}`;
      if (base.has(id) || out.has(id)) continue;
      const def = { kind: group.kind, id, name: e.name, source: { pack: BOOK_PACK_ID }, features: [] as string[], text: e.text } as Definition & { features: string[] };
      const bg = group.kind === "background" ? bookBackgrounds.get(e.name) : undefined;
      if (bg) {
        // A new background works in the builder: its skills, tools and languages, and its feature.
        const d = def as BackgroundDef;
        if (bg.proficiencies.length) d.grant = { proficiencies: bg.proficiencies };
        const eq = equipmentOf(bg);
        if (eq) d.equipment = eq;
        if (bg.choices.length) d.choices = bg.choices;
        if (bg.feature) {
          const fid = `feature:${slug(bg.feature.name)}`;
          if (!base.has(fid) && !out.has(fid)) {
            out.set(fid, { kind: "feature", id: fid, name: bg.feature.name, source: { pack: BOOK_PACK_ID }, text: bg.feature.text.length ? bg.feature.text : [bg.feature.name] } as Definition);
            added("feature");
          }
          d.features = [fid];
        }
      }
      out.set(id, def);
      added(group.kind);
    }
  }

  // Races the content doesn't have become playable: their ability scores, size, speed, languages and traits.
  const raceNames = bookRaces.map((r) => r.name);
  const raceTraitIds = new Set(base.list("race").flatMap((r) => r.features));
  const traitByName = new Map<string, string>();
  for (const id of raceTraitIds) {
    const f = base.find(id, "feature");
    if (f && !traitByName.has(norm(f.name))) traitByName.set(norm(f.name), id);
  }
  for (const br of bookRaces) {
    if (/\(Base\)$/i.test(br.name) || raceNames.some((n) => n.startsWith(`${br.name} (`))) continue;
    const paren = /^(.+?) \((.+)\)$/.exec(br.name);
    const cands = [br.name, ...(paren ? [paren[2]!, `${paren[2]} ${paren[1]}`, `${paren[1]} ${paren[2]}`] : [])].map(norm);
    if (base.list("race").some((r) => namesOf(r).some((n) => cands.includes(n)))) continue;
    const id = `race:${slug(paren ? `${paren[2]} ${paren[1]}` : br.name)}`;
    if (base.has(id) || out.has(id)) continue;
    const raceSlug = id.replace(/^race:/, "");
    const features: string[] = [];
    for (const t of br.traits) {
      const known = traitByName.get(norm(t.name));
      if (known) {
        features.push(known);
        continue;
      }
      const fid = `feature:${raceSlug}-${slug(t.name)}`;
      if (!out.has(fid) && !base.has(fid)) {
        out.set(fid, { kind: "feature", id: fid, name: t.name, source: { pack: BOOK_PACK_ID }, text: t.text } as Definition);
        added("feature");
      }
      features.push(fid);
    }
    const grant: NonNullable<RaceDef["grant"]> = {
      proficiencies: [...br.languages.map((l) => ({ kind: "language" as const, target: l })), ...(br.languageChoice ? [{ kind: "language" as const, target: { choice: "language" } }] : [])],
    };
    const choices: NonNullable<RaceDef["choices"]> = [];
    if (br.languageChoice) choices.push({ id: "language", label: "Language", kind: "language", count: br.languageChoice });
    if (br.abilities === "choose") {
      // Choose +2/+1 or +1/+1/+1: two +1s here, and one more from the lineage feature (repeat one for +2).
      grant.abilityChoice = { choice: "abilities", amount: 1 };
      choices.push({ id: "abilities", label: "Ability scores (+1 each)", kind: "ability", count: 2, newOnly: true });
      if (base.has("feature:lineage-ability-scores")) features.unshift("feature:lineage-ability-scores");
    } else if (Object.keys(br.abilities).length) grant.abilityBonuses = br.abilities;
    if (br.darkvision) grant.senses = { darkvision: br.darkvision };
    const race = {
      kind: "race",
      id,
      name: paren ? `${paren[2]} ${paren[1]}` : br.name,
      source: { pack: BOOK_PACK_ID },
      size: br.size,
      speed: br.speed,
      ...(br.creatureType ? { creatureType: br.creatureType } : {}),
      ...(paren ? { group: paren[1] } : {}),
      grant,
      ...(choices.length ? { choices } : {}),
      features,
    };
    out.set(id, race as Definition);
    added("race");
  }

  // Class pages: subclasses the content already has get their text; the others are added, feature by feature.
  for (const { parts, classId } of pages) {
    const existing = base.list("subclass").filter((d) => (d as { class: string }).class === classId) as SubclassDef[];
    for (const sc of parts.subclasses) {
      if (!sc.features.length) continue;
      if (sc.book && !OFFICIAL_BOOKS.has(sc.book)) {
        excluded.push(sc.name);
        continue;
      }
      const key = subclassKey(sc.name);
      const known = existing.find((d) => namesOf(d).some((n) => subclassKey(n) === key));
      if (known) {
        if (sc.text.length) attach(known, sc.text);
        const feats = known.features.map((r) => base.find(r.feature, "feature")).filter((d) => !!d) as Definition[];
        for (const f of sc.features) {
          const d = feats.find((x) => namesOf(x).includes(norm(f.name)) || namesOf(x).includes(norm(f.name.replace(/\s*\([^)]*\)\s*$/, ""))));
          if (d && f.text.length) attach(d, f.text);
        }
        continue;
      }
      const sid = `subclass:${slug(sc.name)}`;
      if (base.has(sid) || out.has(sid)) continue;
      const refs: { level: number; feature: string }[] = [];
      const source = { pack: BOOK_PACK_ID, book: bookName(sc.book), ...(sc.page ? { page: sc.page } : {}) };
      const listOf = classId.replace(/^class:/, "");
      const prepared = /cleric|druid|paladin|wizard|artificer/.test(listOf);
      const addFeature = (level: number, name: string, text: string[], extra: Partial<FeatureDef> = {}) => {
        let fid = `feature:${slug(sc.name)}-${slug(name)}`;
        if (base.has(fid) || out.has(fid)) fid = `${fid}-${level}`;
        if (base.has(fid) || out.has(fid)) return;
        out.set(fid, { kind: "feature", id: fid, name, source, text, ...extra } as Definition);
        refs.push({ level, feature: fid });
        added("feature");
      };
      // Domain, oath and circle spells: "1st · bless, cure wounds" rows under a "Cleric Level · Spells" header.
      for (const block of [sc.text, ...sc.features.map((f) => f.text)]) {
        for (const t of subclassSpellTables(block)) {
          for (const row of t) {
            const spells = row.spells.map((n) => {
              const id = `spell:${slug(n)}`;
              const d = base.find(id, "spell") ?? out.get(id);
              return { spell: id, name: d?.name ?? titleCase(n), casting: prepared ? "always prepared" : "always known", list: listOf };
            });
            addFeature(row.level, `${sc.name} spells (${row.level})`, [`${prepared ? "Always prepared" : "Always known"}, and they don't count against your spells: ${spells.map((x) => x.name).join(", ")}.`], { grant: { spells } });
          }
        }
      }
      for (const f of sc.features) {
        const extra: Partial<FeatureDef> = /^Extra Attack$/i.test(f.name) ? { grant: { extraAttacks: 2 } } : {};
        addFeature(f.level, f.name, f.text.length ? f.text : [f.name], extra);
      }
      refs.sort((a, b) => a.level - b.level);
      out.set(sid, { kind: "subclass", id: sid, name: sc.name, source, class: classId, features: refs, text: sc.text } as Definition);
      added("subclass");
    }
  }

  // Items: existing ones get their text; the rest are added, with weapon and armor stats when the text gives them.
  if (itemTexts.length) {
    const known = new Map(base.list("item").map((d) => [slug(d.name), d as ItemDef]));
    for (const item of parseItems(itemTexts, BOOK_PACK_ID, known, excluded)) {
      const existing = base.find(item.id, "item") ?? (known.get(slug(item.name)) as ItemDef | undefined);
      if (existing) {
        if (item.text) attach(existing, item.text);
        continue;
      }
      if (out.has(item.id)) continue;
      out.set(item.id, item);
      added("item");
    }
  }

  report.kept = [...kept].sort();
  report.excluded = new Set(excluded).size;
  const pack: ContentPack = {
    id: BOOK_PACK_ID,
    title: "Book text loaded on this device",
    ruleset: "5e-2014",
    license: "Private: the player's own copy, kept on this device only",
    visibility: "private",
    definitions: [...out.values()],
  };
  return { pack, report };
}
