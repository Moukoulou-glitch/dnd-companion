import { ContentPack as ContentPackSchema } from "@dnd/schema";
/** Loads content packs and resolves definition ids. Later packs override earlier ones. */
export class ContentRegistry {
    defs = new Map();
    packs = [];
    constructor(packs = []) {
        for (const p of packs)
            this.add(p);
    }
    /** Validates a pack and adds its definitions. Throws with the failing path on bad data. */
    add(pack) {
        const parsed = ContentPackSchema.parse(pack);
        this.packs.push(parsed);
        for (const d of parsed.definitions)
            this.defs.set(d.id, d);
    }
    /**
     * Joins a pack kept as several files (a header plus files of definitions)
     * into one pack object. Duplicate ids across files are an error.
     */
    static mergePack(header, parts) {
        const definitions = parts.flatMap((p) => p.definitions);
        const seen = new Set();
        for (const d of definitions) {
            if (d.id && seen.has(d.id))
                throw new Error(`Duplicate definition id "${d.id}"`);
            if (d.id)
                seen.add(d.id);
        }
        return { ...header, definitions };
    }
    has(id) {
        return this.defs.has(id);
    }
    get(id, kind) {
        const d = this.defs.get(id);
        if (!d)
            throw new Error(`Unknown definition "${id}"`);
        if (d.kind !== kind)
            throw new Error(`Definition "${id}" is a ${d.kind}, expected ${kind}`);
        return d;
    }
    listPacks() {
        return this.packs;
    }
}
