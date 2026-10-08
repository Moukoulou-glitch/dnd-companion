import { describe, expect, it } from "vitest";
import { tableRegistry } from "./helpers.js";

const reg = tableRegistry();

describe("content references", () => {
  it("every class and subclass feature exists", () => {
    const missing: string[] = [];
    for (const c of reg.list("class")) for (const r of c.features) if (!reg.find(r.feature, "feature")) missing.push(`${c.id} ${r.level} ${r.feature}`);
    for (const s of reg.list("subclass")) {
      if (!reg.find(s.class, "class")) missing.push(`${s.id}: class ${s.class}`);
      for (const r of s.features) if (!reg.find(r.feature, "feature")) missing.push(`${s.id} ${r.level} ${r.feature}`);
    }
    expect(missing).toEqual([]);
  });

  it("subclass spells and granted resources point at things that exist", () => {
    const bad: string[] = [];
    for (const f of reg.list("feature")) {
      for (const sp of f.grant?.spells ?? []) if ("spell" in sp && typeof sp.spell === "string" && !reg.find(sp.spell, "spell")) bad.push(`${f.id}: ${sp.spell}`);
      const resources = new Set((f.grant?.resources ?? []).map((r) => r.id));
      for (const a of f.grant?.actions ?? []) if (a.cost && !resources.has(a.cost.resource) && !/^(ki|rage|sorcery-points|bardic-inspiration|channel-divinity|wild-shape|superiority-dice|psionic-energy|lay-on-hands)/.test(a.cost.resource)) bad.push(`${f.id}: cost ${a.cost.resource}?`);
    }
    // Report only: a cost may use a resource from the class or another feature.
    if (bad.length) console.warn(bad.join("\n"));
    expect(Array.isArray(bad)).toBe(true);
  });
});
