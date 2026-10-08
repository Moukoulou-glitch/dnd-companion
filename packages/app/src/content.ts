import { bookPack, ContentRegistry, type BookReport } from "@dnd/engine";
import { Character } from "@dnd/schema";

// Content and reference characters are bundled into the app, so it works offline.
const srdFiles = import.meta.glob("../../../content/packs/srd-5.1/*.json", { eager: true, import: "default" });
const tableFiles = import.meta.glob("../../../content/packs/table-2014/*.json", { eager: true, import: "default" });
const fixtureFiles = import.meta.glob("../../../content/fixtures/*.json", { eager: true, import: "default" });

function pack(files: Record<string, unknown>): unknown {
  let header: object | undefined;
  const parts: { definitions: unknown[] }[] = [];
  for (const [path, data] of Object.entries(files).sort(([a], [b]) => a.localeCompare(b))) {
    if (path.endsWith("/pack.json")) header = data as object;
    else parts.push(data as { definitions: unknown[] });
  }
  if (!header) throw new Error("Content pack header (pack.json) is missing");
  return ContentRegistry.mergePack(header, parts);
}

/** SRD first; the table's pack loads second and can override it. */
function buildRegistry(): ContentRegistry {
  return new ContentRegistry([pack(srdFiles), pack(tableFiles)]);
}

export const registry = buildRegistry();

/** What the book files on this device added, once they're loaded. */
export let bookReport: BookReport | undefined;

/**
 * Adds the book text the player loaded on this device. It's read fresh from
 * the stored files at every start, so the table pack always decides what's
 * protected (house rules, remastered feats).
 */
export function addBooks(files: { name: string; text: string }[]): BookReport | undefined {
  if (!files.length) return undefined;
  const { pack, report } = bookPack(files, buildRegistry());
  registry.add(pack);
  bookReport = report;
  return report;
}

/** The four reference characters, used to fill a new device. */
export const starterCharacters: Character[] = Object.values(fixtureFiles).map((data) => Character.parse(data));

/**
 * Things a character uses whose definition is gone (book text removed from
 * this device, or never loaded on it): items, book subclasses, backgrounds and
 * feats get a plain stand-in, so the character still opens.
 */
let stubPacks = 0;
export function stubMissing(refs: Iterable<{ id: string; class?: string }>): void {
  const seen = new Map<string, { id: string; class?: string }>();
  for (const r of refs) if (!registry.has(r.id) && !seen.has(r.id)) seen.set(r.id, r);
  const missing = [...seen.values()].filter((r) => /^(item|subclass|background|feat):/.test(r.id) && (!r.id.startsWith("subclass:") || r.class));
  if (!missing.length) return;
  const nameOf = (id: string) => id.replace(/^[a-z]+:/, "").replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase());
  const summary = "This came from book text that isn't loaded on this device. Load the book files again to see its details.";
  registry.add({
    id: `missing-${++stubPacks}`,
    title: "Stand-ins for book entries whose text isn't on this device",
    ruleset: "5e-2014",
    license: "none",
    visibility: "private",
    definitions: missing.map((r) => {
      const base = { id: r.id, name: nameOf(r.id), summary, source: { pack: "missing-items" } };
      if (r.id.startsWith("item:")) return { ...base, kind: "item" as const, category: "gear" as const };
      if (r.id.startsWith("subclass:")) return { ...base, kind: "subclass" as const, class: r.class!, features: [] };
      if (r.id.startsWith("background:")) return { ...base, kind: "background" as const, features: [] };
      return { ...base, kind: "feat" as const, features: [] };
    }),
  });
}

/** Every book-dependent thing a stored character refers to, in its snapshot and its recorded changes. */
export function referencesOf(snapshot: Character, ops: { type: string; payload: unknown }[]): { id: string; class?: string }[] {
  const out: { id: string; class?: string }[] = [];
  out.push(...(snapshot.inventory ?? []).map((i) => ({ id: i.item })));
  for (const cl of snapshot.classes ?? []) if (cl.subclass) out.push({ id: cl.subclass, class: cl.class });
  if (snapshot.background) out.push({ id: snapshot.background });
  for (const f of snapshot.feats ?? []) out.push({ id: f.feat });
  for (const x of snapshot.extras ?? []) if (x.kind === "feat") out.push({ id: x.value });
  const walk = (v: unknown, cls?: string): void => {
    if (typeof v === "string") {
      if (/^(item|subclass|background|feat):/.test(v)) out.push({ id: v, class: cls });
    } else if (Array.isArray(v)) v.forEach((x) => walk(x, cls));
    else if (v && typeof v === "object") {
      const o = v as Record<string, unknown>;
      const c = typeof o.class === "string" ? o.class : cls;
      Object.values(o).forEach((x) => walk(x, c));
    }
  };
  for (const o of ops) walk(o.payload);
  return out;
}

/** Items only: kept for callers that only know an inventory. */
export function stubMissingItems(ids: Iterable<string>): void {
  stubMissing([...ids].map((id) => ({ id })));
}
