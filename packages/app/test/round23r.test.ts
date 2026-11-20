import { describe, expect, it } from "vitest";
import { derive, newCharacter } from "@dnd/engine";
import { composeDamage, formatFormula } from "@dnd/dice";
import { tableRegistry } from "../../engine/test/helpers.js";
import { damageFor } from "../src/crit.js";
import { relicsOf } from "../src/fx/relics.js";

const reg = tableRegistry();
const fighter = (attuned: boolean) => {
  const c = newCharacter({ id: "r", name: "R", race: "race:human", class: "class:fighter", abilities: { str: 16, dex: 12, con: 14, int: 10, wis: 10, cha: 10 } }, reg);
  c.classes = [{ class: "class:fighter", level: 5 }];
  c.inventory.push({ id: "ax", item: "item:battleaxe-of-regina-lapsa", quantity: 1, equipped: true, attuned });
  return c;
};

describe("23r: Battleaxe of Regina Lapsa", () => {
  it("is a battleaxe you can attack with, attuned or not", () => {
    const s = derive(fighter(false), reg);
    const a = s.attacks.find((x) => x.itemInstanceId === "ax")!;
    expect(a.damage.dice).toBe("1d8");
    expect(a.damage.type).toBe("slashing");
  });
  it("attuned: Second Wind heals 1d12 + fighter level; not attuned: 1d10", () => {
    expect(derive(fighter(true), reg).actions.find((x) => x.id === "second-wind")!.heal!.text).toBe("1d12 + 5");
    expect(derive(fighter(false), reg).actions.find((x) => x.id === "second-wind")!.heal!.text).toBe("1d10 + 5");
  });
  it("a critical hit adds the first d4 and another 1d4, neither doubled", () => {
    const a = derive(fighter(false), reg).attacks.find((x) => x.itemInstanceId === "ax")!;
    const withD4 = { ...a, damage: { ...a.damage, critAnyAdd: [{ label: "its d4", flat: 3 }, { label: "another 1d4", dice: { count: 1, sides: 4 } }] } };
    const hit = composeDamage(a.damage.dice, a.damage.type, a.damage.bonus);
    expect(formatFormula(damageFor(hit, withD4, false).terms)).toBe(formatFormula(hit.terms));
    expect(formatFormula(damageFor(hit, withD4, true).terms)).toBe("2d8[slashing]+3+3[slashing]+1d4[slashing]");
  });
  it("its token shows while it's wielded, brighter when attuned", () => {
    expect(relicsOf(fighter(false))).toMatchObject([{ motif: "lapsa", active: false }]);
    expect(relicsOf(fighter(true))).toMatchObject([{ motif: "lapsa", active: true }]);
  });
});

describe("23s: its critical hit has its own look", () => {
  it("a crit on the axe's attack roll plays the axe's look, not the plain crit", async () => {
    const { rollFx } = await import("../src/fx/triggers.js");
    const r = { id: "r", at: 0, title: "Battleaxe of Regina Lapsa", kind: "d20" as const, total: 25, crit: true, fumble: false, physical: false, lines: [], attack: true, natural: 20 };
    expect(rollFx(r)).toEqual([{ kind: "lapsa" }]);
    expect(rollFx({ ...r, crit: false, natural: 12 })).toEqual([]);
  });
});

describe("23y: the Hound of Ill Omen's critter", () => {
  it("is a shadow wolf that howls", async () => {
    const { companionCritter, HOUND_OF_ILL_OMEN } = await import("../src/fx/critters.js");
    expect(companionCritter({ id: "hound-of-ill-omen", name: "Hound of Ill Omen", form: { id: "hound", name: "Hound of Ill Omen" } }, 0)).toBe(HOUND_OF_ILL_OMEN);
    expect(HOUND_OF_ILL_OMEN).toMatchObject({ plan: "quad", trick: "howl" });
  });
  it("its stat block says how it hunts", () => {
    const f = reg.find("feature:shadow-magic-hound-of-ill-omen", "feature")!;
    const names = f.grant!.companions![0]!.forms[0]!.traits!.map((t) => t.name);
    expect(names).toEqual(expect.arrayContaining(["One Quarry", "Ill Omen", "Fleeting"]));
  });
});

describe("24g: Aleriasa's loop and mark", () => {
  it("follows its own exhaustion level while it's active, nothing while it's held back", async () => {
    const { stateLoops, aleriasaLevel } = await import("../src/fx/triggers.js");
    const c = fighter(false);
    expect(stateLoops(c, [{ id: "other:aleriasa", exhaustion: 3 }]).aleriasa).toBe("sfx-st sfx-ongoing-aler sfx-aler-3");
    expect(stateLoops(c, [{ id: "other:aleriasa", exhaustion: 6 }]).aleriasa).toBe("sfx-st sfx-ongoing-aler sfx-aler-5");
    expect(stateLoops(c, [{ id: "other:aleriasa", exhaustion: 3, suppressed: true }]).aleriasa).toBeUndefined();
    expect(aleriasaLevel([])).toBeUndefined();
  });
});
