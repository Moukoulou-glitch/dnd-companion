import { describe, expect, it } from "vitest";
import { formFx } from "../src/fx/triggers.js";
import { STATE_ONGOING } from "../src/fx/looks.js";
import type { Character } from "@dnd/schema";
import { tableRegistry } from "../../engine/test/helpers.js";

const c = (extra: Partial<Character>) => ({ toggles: [], effects: [], classes: [], ...extra }) as unknown as Character;

describe("23k: each transformation its own loop while it's on", () => {
  it("every state with a loop is a real state some feature switches on", () => {
    const reg = tableRegistry();
    const toggles = new Set<string>();
    for (const kind of ["feature", "feat", "item", "race"] as const)
      for (const d of reg.list(kind) as unknown as { grant?: { actions?: { toggles?: string[]; choiceToggles?: Record<string, string[]> }[] } }[])
        for (const a of d.grant?.actions ?? []) {
          for (const t of a.toggles ?? []) toggles.add(t);
          for (const ts of Object.values(a.choiceToggles ?? {})) for (const t of ts) toggles.add(t);
        }
    for (const t of Object.keys(STATE_ONGOING)) expect(toggles.has(t), t).toBe(true);
  });
  it("Floar burns, or shines in its radiant form; Starry Form shows its constellation", () => {
    expect(formFx(c({ toggles: ["floar"] }))[0]!.look).toBe("sfx-st sfx-ongoing-floar");
    expect(formFx(c({ toggles: ["floar"], effects: [{ id: "f", effect: "other:floar", choice: "Radiant", from: "x" }] as Character["effects"] }))[0]!.look).toContain("sfx-floar-radiant");
    expect(formFx(c({ toggles: ["starry-form", "starry-form-dragon"] })).map((x) => x.look)).toEqual(["sfx-st sfx-ongoing-starry", "sfx-st sfx-ongoing-starry-dragon"]);
  });
});

describe("23l: the Whistle of the Ashen Gale on Play", async () => {
  const { relicsOf } = await import("../src/fx/relics.js");
  const { stateLoops } = await import("../src/fx/triggers.js");
  it("its token while attuned, bright while the wind blows, and the wind's loop", () => {
    const base = c({ inventory: [{ id: "wh", item: "item:whistle-of-the-ashen-gale", quantity: 1, equipped: true, attuned: true }] as Character["inventory"] });
    expect(relicsOf(base)).toMatchObject([{ motif: "whistle", active: false }]);
    const windy = { ...base, effects: [{ id: "e", effect: "effect:whistle-ashen-gale", from: "x" }] } as Character;
    expect(relicsOf(windy)[0]!.active).toBe(true);
    expect(stateLoops(windy).gale).toBe("sfx-st sfx-ongoing-gale");
    expect(relicsOf({ ...base, inventory: [{ ...base.inventory[0]!, attuned: false }] } as Character)).toEqual([]);
  });
});
