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
