import type { ContentPack, Definition } from "@dnd/schema";
import { ContentPack as ContentPackSchema } from "@dnd/schema";

type ByKind<K extends Definition["kind"]> = Extract<Definition, { kind: K }>;

/** Loads content packs and resolves definition ids. Later packs override earlier ones. */
export class ContentRegistry {
  private readonly defs = new Map<string, Definition>();
  private readonly packs: ContentPack[] = [];

  constructor(packs: unknown[] = []) {
    for (const p of packs) this.add(p);
  }

  /** Validates a pack and adds its definitions. Throws with the failing path on bad data. */
  add(pack: unknown): void {
    const parsed = ContentPackSchema.parse(pack);
    this.packs.push(parsed);
    for (const d of parsed.definitions) this.defs.set(d.id, d);
  }

  has(id: string): boolean {
    return this.defs.has(id);
  }

  get<K extends Definition["kind"]>(id: string, kind: K): ByKind<K> {
    const d = this.defs.get(id);
    if (!d) throw new Error(`Unknown definition "${id}"`);
    if (d.kind !== kind) throw new Error(`Definition "${id}" is a ${d.kind}, expected ${kind}`);
    return d as ByKind<K>;
  }

  listPacks(): readonly ContentPack[] {
    return this.packs;
  }
}
