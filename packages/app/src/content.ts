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
 * Items a character carries whose definition is gone (book text removed from
 * this device) get a plain stand-in, so the character still opens.
 */
export function stubMissingItems(ids: Iterable<string>): void {
  const missing = [...new Set(ids)].filter((id) => !registry.has(id));
  if (!missing.length) return;
  registry.add({
    id: "missing-items",
    title: "Stand-ins for items whose text isn't on this device",
    ruleset: "5e-2014",
    license: "none",
    visibility: "private",
    definitions: missing.map((id) => ({
      kind: "item",
      id,
      name: id.replace(/^item:/, "").replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase()),
      summary: "This item came from book text that isn't loaded on this device. Load the book files again to see its details.",
      source: { pack: "missing-items" },
      category: "gear",
    })),
  });
}
