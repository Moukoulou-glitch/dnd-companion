import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Character } from "@dnd/schema";
import { ContentRegistry } from "../src/registry.js";

const root = fileURLToPath(new URL("../../../", import.meta.url));

export function loadJson(relativePath: string): unknown {
  return JSON.parse(readFileSync(root + relativePath, "utf8"));
}

export function tableRegistry(): ContentRegistry {
  return new ContentRegistry([loadJson("content/packs/table-2014.json")]);
}

export function loadCharacter(name: string): Character {
  return Character.parse(loadJson(`content/fixtures/${name}.json`));
}
