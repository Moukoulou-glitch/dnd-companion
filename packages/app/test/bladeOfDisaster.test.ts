import { describe, expect, it } from "vitest";
import { derive, newCharacter } from "@dnd/engine";
import { composeD20, composeDamage, formatFormula } from "@dnd/dice";
import { tableRegistry } from "../../engine/test/helpers.js";
import { damageFor } from "../src/crit.js";
import { spellAsAttack } from "../src/components/SpellsTab.js";

const reg = tableRegistry();

describe("24l: Blade of Disaster", () => {
  const c = newCharacter({ id: "bd", name: "Bd", race: "race:human", class: "class:wizard", abilities: { str: 8, dex: 14, con: 14, int: 20, wis: 10, cha: 10 } }, reg);
  c.classes = [{ class: "class:wizard", level: 17 }];
  c.spells = [{ spell: "spell:blade-of-disaster", list: "wizard", prepared: true }];
  const sp = derive(c, reg).spells.find((s) => s.id === "spell:blade-of-disaster")!;
  it("two attacks a casting, a critical hit on 18–20", () => {
    expect(sp.beams?.byLevel[9]).toBe(2);
    expect(sp.attack?.critAt).toBe(18);
    expect(composeD20(sp.attack!).terms.find((t) => t.kind === "dice")).toMatchObject({ critAtOrAbove: 18 });
  });
  it("4d12 force on a hit, 12d12 on a critical hit", () => {
    const a = spellAsAttack(sp, 9);
    const hit = composeDamage(a.damage.dice, a.damage.type, a.damage.bonus);
    expect(formatFormula(hit.terms)).toBe("4d12[force]");
    expect(formatFormula(damageFor(hit, a, true).terms)).toMatch(/^12d12\[force\]$|^8d12\[force\]\+4d12/);
  });
  it("its tag has the bonus action attack", () => {
    const e = reg.get("effect:blade-of-disaster", "effect");
    expect(e.actions?.[0]).toMatchObject({ economy: "bonus", rollsSpell: "spell:blade-of-disaster" });
  });
});
