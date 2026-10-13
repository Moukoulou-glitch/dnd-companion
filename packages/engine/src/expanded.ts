import type { Character, SpellDef } from "@dnd/schema";
import type { ContentRegistry } from "./registry.js";
import { collectSources, type Source } from "./sources.js";

/**
 * Tasha's expanded spell lists (Additional Druid Spells, ...): while a class's
 * feature is on, its listed spells join that class's spell list, and so does any
 * spell whose book entry names the class under "Optional/Variant Classes". Off
 * (Sheet → Tasha's optional class features), they don't: unless the spell is on
 * the list anyway, or comes from another source (a feat, a subclass).
 *
 * Returns class name ("druid") → spell ids it gains.
 */
export function expandedFromSources(sources: Source[], reg: ContentRegistry): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  for (const s of sources) {
    const x = s.grant.expandedSpells;
    if (!x) continue;
    const set = out.get(x.class) ?? new Set<string>();
    for (const id of x.spells) set.add(id);
    out.set(x.class, set);
  }
  if (out.size) {
    for (const d of reg.list("spell")) for (const cls of d.optionalClasses ?? []) out.get(cls)?.add(d.id);
  }
  return out;
}

export function expandedSpellLists(c: Character | undefined, reg: ContentRegistry): Map<string, Set<string>> {
  return c ? expandedFromSources(collectSources(c, reg), reg) : new Map();
}

/** Whether a spell is on any of these class lists, counting the expanded lists that are on. */
export function onClassList(d: Pick<SpellDef, "id" | "classes">, classes: string[], expanded: Map<string, Set<string>>): boolean {
  return d.classes.some((x) => classes.includes(x)) || classes.some((cls) => expanded.get(cls)?.has(d.id));
}
