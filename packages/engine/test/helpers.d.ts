import { Character } from "@dnd/schema";
import { ContentRegistry } from "../src/registry.js";
export declare function loadJson(relativePath: string): unknown;
/** Loads a pack kept as a folder: pack.json is the header, every other .json holds definitions. */
export declare function loadPackDir(relativeDir: string): unknown;
export declare function tableRegistry(): ContentRegistry;
export declare function loadCharacter(name: string): Character;
