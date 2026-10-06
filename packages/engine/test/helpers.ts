import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Character } from "@dnd/schema";
import { ContentRegistry } from "../src/registry.js";

const root = fileURLToPath(new URL("../../../", import.meta.url));

export function loadJson(relativePath: string): unknown {
  return JSON.parse(readFileSync(root + relativePath, "utf8"));
}

/** Loads a pack kept as a folder: pack.json is the header, every other .json holds definitions. */
export function loadPackDir(relativeDir: string): unknown {
  const files = readdirSync(root + relativeDir).filter((f) => f.endsWith(".json") && f !== "pack.json").sort();
  const parts = files.map((f) => loadJson(`${relativeDir}/${f}`) as { definitions: unknown[] });
  return ContentRegistry.mergePack(loadJson(`${relativeDir}/pack.json`) as object, parts);
}

export function tableRegistry(): ContentRegistry {
  return new ContentRegistry([loadPackDir("content/packs/table-2014")]);
}

export function loadCharacter(name: string): Character {
  return Character.parse(loadJson(`content/fixtures/${name}.json`));
}
