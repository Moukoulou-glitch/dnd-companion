import type { ContentPack, Definition } from "@dnd/schema";
type ByKind<K extends Definition["kind"]> = Extract<Definition, {
    kind: K;
}>;
/** Loads content packs and resolves definition ids. Later packs override earlier ones. */
export declare class ContentRegistry {
    private readonly defs;
    private readonly packs;
    constructor(packs?: unknown[]);
    /** Validates a pack and adds its definitions. Throws with the failing path on bad data. */
    add(pack: unknown): void;
    /**
     * Joins a pack kept as several files (a header plus files of definitions)
     * into one pack object. Duplicate ids across files are an error.
     */
    static mergePack(header: object, parts: {
        definitions: unknown[];
    }[]): unknown;
    has(id: string): boolean;
    get<K extends Definition["kind"]>(id: string, kind: K): ByKind<K>;
    listPacks(): readonly ContentPack[];
}
export {};
