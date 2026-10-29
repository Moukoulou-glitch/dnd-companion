import { describe, expect, it } from "vitest";
import { Character } from "@dnd/schema";
import { derive } from "../src/derive.js";
import { tableRegistry } from "./helpers.js";

const reg = tableRegistry();
const heammer = (level: number, toggles: string[] = []) =>
  derive(Character.parse({ id: "h", schemaVersion: 1, ruleset: "5e-2014", name: "H", abilities: { str: 8, dex: 14, con: 14, int: 10, wis: 18, cha: 10 }, race: "race:human", classes: [{ class: "class:druid", level, subclass: "subclass:circle-of-the-heammer" }], toggles, hp: { current: 30, temp: 0 } }), reg);
const sp = (s: ReturnType<typeof derive>, name: string) => s.spells.find((x) => x.name === name);

describe("Circle of the Heammer (homebrew)", () => {
  it("Circle Spells by druid level, always prepared", () => {
    expect(sp(heammer(2), "Guiding Bolt")?.ready).toBe("always");
    expect(sp(heammer(4), "Lesser Restoration")?.ready).toBe("always");
    expect(sp(heammer(4), "Daylight")).toBeUndefined();
    expect(sp(heammer(9), "Flame Strike")?.ready).toBe("always");
  });
  it("Floar: a Wild Shape use; resistances, Fire Bolt and the fire/radiant swap only while it's on", () => {
    const off = heammer(2);
    expect(off.actions.find((a) => a.id === "floar")).toMatchObject({ economy: "bonus", cost: { resource: "wild-shape" }, selfEffect: "other:floar" });
    expect(off.defenses.resist).toEqual([]);
    expect(sp(off, "Fire Bolt")).toBeUndefined();
    const on = heammer(2, ["floar"]);
    expect(on.defenses.resist).toEqual(["fire", "radiant"]);
    expect(sp(on, "Fire Bolt")?.list.id).toBe("druid");
    expect(sp(on, "Burning Hands")?.typeChoices).toEqual([{ kind: "spell", label: "Floar", options: ["radiant"] }]);
    expect(sp(on, "Guiding Bolt")?.typeChoices).toEqual([{ kind: "spell", label: "Floar", options: ["fire"] }]);
  });
  it("Floar's 1d10 on fire and radiant spell damage, every roll; Zenith's d10 per spell level replaces it on leveled spells", () => {
    const opt = (s: ReturnType<typeof derive>, name: string, label: string) => sp(s, name)!.damageBonus!.suggestions.find((x) => x.label === label);
    expect(opt(heammer(2, ["floar"]), "Burning Hands", "Floar")).toMatchObject({ apply: { dice: ["1d10"] }, forTypes: ["fire", "radiant"], preset: "always" });
    const z = heammer(14, ["floar"]);
    expect(opt(z, "Burning Hands", "Floar")).toBeUndefined();
    expect(opt(z, "Burning Hands", "Zenith")?.apply.diceBySlot).toMatchObject({ 1: ["1d10"], 3: ["3d10"], 9: ["9d10"] });
    expect(opt(z, "Fire Bolt", "Floar")).toMatchObject({ apply: { dice: ["1d10"] } });
    expect(opt(heammer(14), "Burning Hands", "Zenith")).toBeUndefined();
  });
  it("Untamed Flame: Circle spells of 1 action get a bonus-action casting, up to the proficiency bonus; Zenith's +2 AC from 14th", () => {
    expect(sp(heammer(6), "Burning Hands")?.altCasts).toEqual([{ label: "Untamed Flame", time: "1 bonus action", maxLevel: 3, keepSlotOn: 10 }]);
    expect(sp(heammer(6), "Plant Growth")?.altCasts).toBeUndefined();
    expect(sp(heammer(5), "Burning Hands")?.altCasts).toBeUndefined();
    expect(sp(heammer(14), "Burning Hands")?.altCasts?.[0]?.effect).toBe("other:untamed-flame-ac");
  });
  it("Theros: once per long rest, opens the Heammer Wisps; a reminder on Plant Growth over 8 hours", () => {
    const s = heammer(10);
    expect(s.actions.find((a) => a.id === "theros")).toMatchObject({ opensSummon: { summon: "summon:heammer-wisps", onChoice: "Heammer Wisps" } });
    expect(s.castReminders.find((r) => r.from === "Theros")).toMatchObject({ spells: ["spell:plant-growth"], time: "8 hours" });
  });
  it("Zenith: advantage against creatures in the sunlight, and the cold ward", () => {
    const z = heammer(14, ["floar"]);
    expect(z.actions.find((a) => a.id === "zenith-ward")?.selfEffect).toBe("other:zenith-ward");
    expect(reg.find("creature:heammer-wisp", "creature")).toMatchObject({ cr: 2, hp: 40, ac: 19, type: "undead" });
  });
});

describe("Wrath of the Storm: lightning or thunder", () => {
  it("its roll offers both types", () => {
    const s = derive(Character.parse({ id: "t", schemaVersion: 1, ruleset: "5e-2014", name: "T", abilities: { str: 10, dex: 10, con: 14, int: 10, wis: 16, cha: 10 }, race: "race:human", classes: [{ class: "class:cleric", level: 1, subclass: "subclass:tempest-domain" }], hp: { current: 10, temp: 0 } }), reg);
    expect(s.actions.find((a) => a.id === "wrath-of-the-storm")?.roll?.types).toEqual(["lightning", "thunder"]);
  });
});
