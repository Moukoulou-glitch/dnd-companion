import { ContentRegistry } from "@dnd/engine";
import { Character } from "@dnd/schema";

// Content and reference characters are bundled into the app, so it works offline.
const packFiles = import.meta.glob("../../../content/packs/table-2014/*.json", { eager: true, import: "default" });
const fixtureFiles = import.meta.glob("../../../content/fixtures/*.json", { eager: true, import: "default" });

function buildRegistry(): ContentRegistry {
  let header: object | undefined;
  const parts: { definitions: unknown[] }[] = [];
  for (const [path, data] of Object.entries(packFiles).sort(([a], [b]) => a.localeCompare(b))) {
    if (path.endsWith("/pack.json")) header = data as object;
    else parts.push(data as { definitions: unknown[] });
  }
  if (!header) throw new Error("Content pack header (pack.json) is missing");
  return new ContentRegistry([ContentRegistry.mergePack(header, parts)]);
}

export const registry = buildRegistry();

/** The four reference characters, used to fill a new device. */
export const starterCharacters: Character[] = Object.values(fixtureFiles).map((data) => Character.parse(data));
