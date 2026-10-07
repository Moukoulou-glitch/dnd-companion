import type { ContentPack, Definition, ItemDef } from "@dnd/schema";
import type { ContentRegistry } from "../registry.js";
import { entryFileKind, looksLikeClassPage, parseClassPage, parseEntries, parseRaceTraits, type TextEntry } from "./entries.js";
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

export type BookFileKind = "spells" | "items" | "feats" | "races" | "backgrounds" | "class page" | "unknown";

export interface BookReport {
  files: { name: string; kind: BookFileKind; entries: number }[];
  /** New definitions, by kind. */
  added: Record<string, number>;
  /** Existing definitions that got their book text. */
  textAdded: number;
  /** Table entries the book versions were not allowed to change (house rules, remastered feats, homebrew). */
  kept: string[];
}

export function bookFileKind(text: string): BookFileKind {
  if (looksLikeSpells(text)) return "spells";
  if (looksLikeItems(text)) return "items";
  if (looksLikeClassPage(text)) return "class page";
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
  if (def.name.includes(":")) out.push(norm(def.name.split(":")[0]!));
  out.push(norm(def.name.replace(/\s*\([^)]*\)\s*$/, "")));
  return [...new Set(out)];
}

/**
 * Reads the player's book files and returns a pack that adds their text to
 * the existing content (and new spells, feats, backgrounds and items),
 * leaving every protected table entry exactly as it is.
 */
export function bookPack(files: BookFile[], base: ContentRegistry): { pack: ContentPack; report: BookReport } {
  const report: BookReport = { files: [], added: {}, textAdded: 0, kept: [] };
  const out = new Map<string, Definition>();
  const kept = new Set<string>();

  const spells = [];
  const itemTexts: string[] = [];
  const named: { kind: "feat" | "background" | "trait" | "feature"; entries: TextEntry[] }[] = [];

  for (const f of files) {
    const kind = bookFileKind(f.text);
    let count = 0;
    if (kind === "spells") {
      const s = parseSpells(f.text, BOOK_PACK_ID);
      spells.push(...s);
      count = s.length;
    } else if (kind === "items") {
      itemTexts.push(f.text);
      count = (f.text.match(/^#### /gm) ?? []).length;
    } else if (kind === "feats" || kind === "backgrounds") {
      const e = parseEntries(f.text);
      named.push({ kind: kind === "feats" ? "feat" : "background", entries: e });
      count = e.length;
    } else if (kind === "races") {
      const e = parseRaceTraits(f.text);
      named.push({ kind: "trait", entries: e });
      count = e.length;
    } else if (kind === "class page") {
      const e = parseClassPage(f.text);
      named.push({ kind: "feature", entries: e });
      count = e.length;
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

  // Named text: matched to existing definitions by name; new feats and backgrounds are added.
  const byName = new Map<string, Definition[]>();
  for (const kind of ["feature", "subclass", "feat", "background"] as const) {
    for (const d of base.list(kind)) for (const n of namesOf(d)) byName.set(n, [...(byName.get(n) ?? []), d]);
  }
  for (const group of named) {
    for (const e of group.entries) {
      const keys = [norm(e.name), norm(e.name.replace(/\s*\([^)]*\)\s*$/, ""))];
      const matches = keys.flatMap((k) => byName.get(k) ?? []).filter((d) => {
        if (group.kind === "feat") return d.kind === "feat";
        if (group.kind === "background") return d.kind === "background";
        return d.kind === "feature" || d.kind === "subclass";
      });
      for (const d of new Set(matches)) attach(d, e.text);
      if (matches.length || (group.kind !== "feat" && group.kind !== "background")) continue;
      const id = `${group.kind}:${slug(e.name)}`;
      if (base.has(id) || out.has(id)) continue;
      out.set(id, { kind: group.kind, id, name: e.name, source: { pack: BOOK_PACK_ID }, features: [], text: e.text } as Definition);
      added(group.kind);
    }
  }

  // Items: existing ones get their text; the rest are added, with weapon and armor stats when the text gives them.
  if (itemTexts.length) {
    const known = new Map(base.list("item").map((d) => [slug(d.name), d as ItemDef]));
    for (const item of parseItems(itemTexts, BOOK_PACK_ID, known)) {
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
