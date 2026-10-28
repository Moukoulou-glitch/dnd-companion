import { describe, expect, it } from "vitest";
import { Character } from "@dnd/schema";
import { derive } from "../src/derive.js";
import { tableRegistry } from "./helpers.js";

const reg = tableRegistry();
const pc = (race: string, level = 5, extra: Record<string, unknown> = {}) =>
  derive(Character.parse({ id: "p", schemaVersion: 1, ruleset: "5e-2014", name: "P", abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 }, race, classes: [{ class: "class:fighter", level }], hp: { current: 30, temp: 0 }, ...extra }), reg);

describe("13f: the races picked", () => {
  it("the four Genasi: their scores, and what each gets", () => {
    const water = pc("race:water-genasi");
    expect([water.abilities.con.score.total, water.abilities.wis.score.total]).toEqual([12, 11]);
    expect(water.defenses.resist).toContain("acid");
    expect(water.speeds.find((s) => s.mode === "swim")?.total.total).toBe(30);
    const cdw = water.spells.find((s) => s.id === "spell:create-or-destroy-water");
    expect([cdw?.cast.free?.level, cdw?.cast.free?.remaining]).toEqual([2, 1]);
    expect(pc("race:water-genasi", 2).spells.some((s) => s.id === "spell:create-or-destroy-water")).toBe(false);
    const fire = pc("race:fire-genasi", 3);
    expect([fire.defenses.resist.includes("fire"), fire.senses.darkvision, fire.abilities.int.score.total]).toEqual([true, 60, 11]);
    expect(fire.spells.find((s) => s.id === "spell:burning-hands")?.cast.free).toBeDefined();
    expect(pc("race:air-genasi").spells.some((s) => s.id === "spell:levitate")).toBe(true);
    expect(pc("race:earth-genasi").abilities.str.score.total).toBe(11);
  });
  it("Duergar: 120 ft darkvision, poison resistance, its magic by level, heavy armor doesn't slow it", () => {
    const d = pc("race:duergar", 5, { inventory: [{ id: "a", item: "item:plate-armor", quantity: 1, equipped: true, attuned: false }] });
    expect([d.senses.darkvision, d.defenses.resist.includes("poison"), d.speed.total]).toEqual([120, true, 25]);
    expect(d.spells.filter((s) => ["spell:enlarge-reduce", "spell:invisibility"].includes(s.id)).length).toBe(2);
    expect(pc("race:duergar", 4).spells.some((s) => s.id === "spell:invisibility")).toBe(false);
  });
  it("Sea Elf and Shadar-kai", () => {
    const sea = pc("race:sea-elf");
    expect([sea.speeds.find((s) => s.mode === "swim")?.total.total, sea.skills.perception.proficiency]).toEqual([30, 1]);
    const sk = pc("race:shadar-kai", 3, { toggles: ["raven-queen-ghostly"] });
    expect(sk.defenses.resist).toEqual(expect.arrayContaining(["necrotic", "fire", "slashing"]));
    expect(pc("race:shadar-kai", 2).actions.some((a) => a.id === "raven-queen-ghostly")).toBe(false);
  });
});
