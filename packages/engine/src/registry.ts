import type { ContentPack, Definition } from "@dnd/schema";
import { ContentPack as ContentPackSchema } from "@dnd/schema";

type ByKind<K extends Definition["kind"]> = Extract<Definition, { kind: K }>;
type ClassDef = ByKind<"class">;

/**
 * The table's version of a class (Tasha's ranger, a barbarian up to level 9)
 * over the SRD one: the table decides every level it lists; levels it doesn't
 * list keep the SRD features, minus any it `replaces`. Level tables, choices
 * and multiclass rules come from the SRD unless the table gives its own.
 */
export function mergeClass(base: ClassDef, over: ClassDef): ClassDef {
  const levels = new Set(over.features.map((f) => f.level));
  const dropped = new Set(over.replaces ?? []);
  const kept = base.features.filter((f) => !levels.has(f.level) && !dropped.has(f.feature));
  const merged: ClassDef = {
    ...base,
    ...over,
    features: [...over.features, ...kept].sort((a, b) => a.level - b.level),
  };
  for (const k of ["choices", "multiclassChoices", "asiLevels", "progression", "multiclassPrereq", "subclassTitle", "startingGrant", "multiclassGrant", "spellcasting", "spellPreparation", "spellcastingFromLevel", "text"] as const) {
    if (over[k] === undefined && base[k] !== undefined) (merged as Record<string, unknown>)[k] = base[k];
  }
  return merged;
}

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
    for (const d of parsed.definitions) {
      const old = this.defs.get(d.id);
      this.defs.set(d.id, old?.kind === "class" && d.kind === "class" ? mergeClass(old, d) : d);
    }
  }

  /**
   * Joins a pack kept as several files (a header plus files of definitions)
   * into one pack object. Duplicate ids across files are an error.
   */
  static mergePack(header: object, parts: { definitions: unknown[] }[]): unknown {
    const definitions = parts.flatMap((p) => p.definitions);
    const seen = new Set<string>();
    for (const d of definitions as { id?: string }[]) {
      if (d.id && seen.has(d.id)) throw new Error(`Duplicate definition id "${d.id}"`);
      if (d.id) seen.add(d.id);
    }
    return { ...header, definitions };
  }

  /** The definition if it exists and is of this kind; never throws. */
  find<K extends Definition["kind"]>(id: string, kind: K): ByKind<K> | undefined {
    const d = this.defs.get(id);
    return d && d.kind === kind ? (d as ByKind<K>) : undefined;
  }

  /**
   * Effect ids saved by older versions used "spell:bless"; spells now own
   * those ids and their effects are "effect:bless". This maps old to new.
   */
  effectId(id: string): string {
    if (this.find(id, "effect")) return id;
    const moved = id.replace(/^spell:/, "effect:");
    return this.find(moved, "effect") ? moved : id;
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

  /** Every definition of one kind, sorted by name. */
  list<K extends Definition["kind"]>(kind: K): ByKind<K>[] {
    return [...this.defs.values()]
      .filter((d): d is ByKind<K> => d.kind === kind)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  listPacks(): readonly ContentPack[] {
    return this.packs;
  }
}
