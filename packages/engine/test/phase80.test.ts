import { describe, expect, it } from "vitest";
import { Character } from "@dnd/schema";
import { derive } from "../src/derive.js";
import { tableRegistry } from "./helpers.js";

const reg = tableRegistry();
const storm = (sorc = 5, extra: Record<string, unknown> = {}) =>
  derive(
    Character.parse({
      id: "p", schemaVersion: 1, ruleset: "5e-2014", name: "P", abilities: { str: 16, dex: 14, con: 14, int: 12, wis: 18, cha: 18 }, race: "race:human",
      classes: [{ class: "class:cleric", level: 6, subclass: "subclass:tempest-domain" }, { class: "class:sorcerer", level: sorc, subclass: "subclass:storm-sorcery" }],
      choices: { "feature:metamagic-1": { option: ["feature:metamagic-transmuted-spell", "feature:metamagic-empowered-spell"] } },
      spells: ["spell:shatter", "spell:fireball", "spell:fire-bolt"].map((spell) => ({ spell, list: "sorcerer", prepared: false })),
      inventory: [{ id: "m", item: "item:mace", quantity: 1, equipped: true, attuned: false }],
      hp: { current: 60, temp: 0 }, ...extra,
    }),
    reg,
  );
const sp = (s: ReturnType<typeof derive>, id: string) => s.spells.find((x) => x.id === id)!;

describe("Destructive Wrath, Transmuted Spell and the storm", () => {
  it("Destructive Wrath is offered on spell and weapon damage, for lightning and thunder, spending Channel Divinity", () => {
    const s = storm();
    for (const b of [sp(s, "spell:shatter").damageBonus!, sp(s, "spell:fireball").damageBonus!, s.attacks.find((a) => a.name === "Mace")!.damage.bonus])
      expect(b.suggestions.find((x) => x.label === "Destructive Wrath")).toMatchObject({ forTypes: ["lightning", "thunder"], apply: { maximize: true }, spends: { resource: "channel-divinity", amount: 1 } });
  });
  it("Thunderbolt Strike: a reminder on lightning damage", () => {
    expect(sp(storm(), "spell:shatter").damageBonus!.typedNotes).toEqual([expect.objectContaining({ types: ["lightning"], text: expect.stringMatching(/push it up to 10 ft/) })]);
  });
  it("Wrath of the Storm's 2d8 can be maxed by Destructive Wrath", () => {
    expect(storm().actions.find((a) => a.id === "wrath-of-the-storm")?.roll?.maxWith).toEqual({ label: "Destructive Wrath", spends: { resource: "channel-divinity", amount: 1 } });
  });
  it("casting reminders: Tempestuous Magic; Heart of the Storm from sorcerer 6 with half the sorcerer level", () => {
    expect(storm(5).castReminders.map((r) => r.from)).toEqual(["Tempestuous Magic"]);
    const six = storm(6).castReminders.find((r) => r.from === "Heart of the Storm")!;
    expect(six).toMatchObject({ minLevel: 1, damageTypes: ["lightning", "thunder"] });
    expect(six.text).toMatch(/take 3 lightning or thunder/);
  });
  it("Empowered Spell: after the damage, up to the Charisma modifier dice again, for a sorcery point", () => {
    expect(sp(storm(), "spell:fireball").damageBonus!.rerollOne).toEqual({ label: "Empowered Spell", count: 4, spends: { resource: "sorcery-points", amount: 1 } });
  });
});

describe("Elemental Affinity, and bonuses that follow a changed type", () => {
  const red = (level: number, meta: string[] = []) =>
    derive(
      Character.parse({
        id: "r", schemaVersion: 1, ruleset: "5e-2014", name: "R", abilities: { str: 8, dex: 14, con: 14, int: 10, wis: 10, cha: 18 }, race: "race:human",
        classes: [{ class: "class:sorcerer", level, subclass: "subclass:draconic" }],
        choices: { "feature:dragon-ancestor": { option: ["feature:dragon-ancestor-red---fire-damage"] }, ...(meta.length ? { "feature:metamagic-1": { option: meta } } : {}) },
        spells: ["spell:fire-bolt", "spell:fireball", "spell:ray-of-frost"].map((spell) => ({ spell, list: "sorcerer", prepared: false })),
        hp: { current: 30, temp: 0 },
      }),
      reg,
    );
  it("+Charisma to fire spells from 6th level, not before, not on cold", () => {
    expect(sp(red(6), "spell:fire-bolt").damageBonus!.parts).toEqual(expect.arrayContaining([expect.objectContaining({ label: expect.stringMatching(/^Elemental Affinity/), value: 4 })]));
    expect(sp(red(5), "spell:fire-bolt").damageBonus!.parts.some((p) => p.label.startsWith("Elemental Affinity"))).toBe(false);
    expect(sp(red(6), "spell:ray-of-frost").damageBonus!.parts.some((p) => p.label.startsWith("Elemental Affinity"))).toBe(false);
  });
  it("with Transmuted Spell: an option for fire only, on by default (off once the type is changed)", () => {
    const s = red(6, ["feature:metamagic-transmuted-spell", "feature:metamagic-quickened-spell"]);
    const fb = sp(s, "spell:fireball").damageBonus!;
    expect(fb.parts.some((p) => p.label.startsWith("Elemental Affinity"))).toBe(false);
    expect(fb.suggestions.find((x) => x.label.startsWith("Elemental Affinity"))).toMatchObject({ forTypes: ["fire"], preset: "always", apply: { flat: 4 } });
    // Ray of Frost made fire: the same option, for fire.
    expect(sp(s, "spell:ray-of-frost").damageBonus!.suggestions.find((x) => x.label.startsWith("Elemental Affinity"))).toMatchObject({ forTypes: ["fire"] });
  });
});
