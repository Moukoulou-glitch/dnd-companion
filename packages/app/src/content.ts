import { ContentRegistry } from "@dnd/engine";
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

/** The four reference characters, used to fill a new device. */
export const starterCharacters: Character[] = Object.values(fixtureFiles).map((data) => Character.parse(data));
