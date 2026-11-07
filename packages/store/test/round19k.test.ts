import { describe, expect, it } from "vitest";
import { derive, newCharacter } from "@dnd/engine";
import { tableRegistry } from "../../engine/test/helpers.js";
import { CharacterLog } from "../src/log.js";
import { HybridClock } from "../src/clock.js";

const reg = tableRegistry();
let t = 1_860_000_000_000;
const holding = (item: string, picks?: string[]) => {
  const c = newCharacter({ id: "f", name: "F", race: "race:high-elf", class: "class:fighter", abilities: { str: 16, dex: 14, con: 14, int: 10, wis: 10, cha: 10 } }, reg);
  c.classes = [{ class: "class:fighter", level: 5 }];
  c.hp = { current: 44, temp: 0 };
  c.inventory.push({ id: "w", item, quantity: 1, equipped: true, attuned: true, ...(picks ? { picks } : {}) } as never);
  return new CharacterLog(c, reg, new HybridClock("t", () => (t += 1000)), "player");
};
const sheet = (l: CharacterLog) => derive(l.character, reg);
const own = (l: CharacterLog, mode = "melee") => sheet(l).attacks.find((a) => a.itemInstanceId === "w" && a.mode === mode && !a.offHand)!;

describe("19k: Blackrazor", () => {
  it("+3 greatsword; can't be charmed or frightened; the undead note on its damage; Haste once a dawn, no concentration", () => {
    const l = holding("item:blackrazor");
    const s = sheet(l);
    expect(own(l).attack.parts.some((p) => p.label === "Magic weapon" && p.value === 3)).toBe(true);
    expect(s.defenses.immune).toEqual(expect.arrayContaining(["charmed", "frightened"]));
    expect((own(l).damage.bonus.notes ?? []).join(" ")).toMatch(/undead/);
    expect(s.spells.find((x) => x.id === "spell:haste")).toBeTruthy();
  });
  it("devour a soul: its hit point maximum as temporary HP, and advantage while they last", () => {
    const l = holding("item:blackrazor");
    expect(l.record("useAction", { action: "blackrazor-devour", amount: 60 }).join(" ")).toMatch(/60 temporary HP/);
    expect(l.character.hp.temp).toBe(60);
    expect(sheet(l).saves.wis.advantage).toContain("Blackrazor: a devoured soul");
    expect(own(l).attack.advantage).toContain("Blackrazor: a devoured soul");
    // Damage eats some: still on.
    l.record("damage", { amount: 30 });
    expect(l.character.toggles).toContain("blackrazor-soul");
    // All of them gone: the advantage goes too.
    expect(l.record("damage", { amount: 40 }).join(" ")).toMatch(/temporary hit points are gone/);
    expect(l.character.toggles).not.toContain("blackrazor-soul");
    expect(l.character.hp.current).toBe(34);
  });
});

describe("19k: Moonblade", () => {
  it("first rune +1; each +1 rune adds up; finesse and thrown runes; crit on 19; extra 1d6 slashing", () => {
    const l = holding("item:moonblade", ["bonus", "bonus", "finesse", "thrown", "crit19", "slashing"]);
    const a = own(l);
    const bonus = a.attack.parts.filter((p) => /Magic weapon|Moonblade rune/.test(p.label)).reduce((n, p) => n + p.value, 0);
    expect(bonus).toBe(3);
    expect(a.properties).toEqual(expect.arrayContaining(["finesse", "thrown"]));
    expect(own(l, "thrown").range).toEqual([20, 60]);
    expect(a.attack.critAt ?? a.attack.suggestions.find((x) => x.apply.critAt)?.apply.critAt).toBe(19);
    expect(a.damage.bonus.dice).toEqual(expect.arrayContaining([expect.objectContaining({ dice: "1d6", damageType: "slashing" })]));
  });
  it("no runes beyond the first: just +1; the flash rune gives a bonus action once a short rest", () => {
    expect(own(holding("item:moonblade")).attack.parts.find((p) => p.label === "Magic weapon")?.value).toBe(1);
    const f = sheet(holding("item:moonblade", ["flash"]));
    expect(f.resources.find((r) => r.id === "moonblade-flash")).toMatchObject({ max: 1 });
    expect(f.actions.find((x) => x.id === "moonblade-flash")?.economy).toBe("bonus");
  });
});
