import { describe, expect, it } from "vitest";
import { Character } from "@dnd/schema";
import { derive } from "@dnd/engine";
import { ownFeatureOf } from "../src/ownFeature";
import { tableRegistry } from "../../engine/test/helpers.js";
const registry = () => reg;
const reg = tableRegistry();

const char = (classes: { class: string; level: number; subclass?: string }[]) =>
  Character.parse({ id: "t", schemaVersion: 1, ruleset: "5e-2014", name: "T", abilities: { str: 14, dex: 14, con: 14, int: 10, wis: 14, cha: 14 }, race: "race:human", classes, hp: { current: 10, temp: 0 } });

describe("8b: a feature's own uses spent from the Play page use the feature", () => {
  it("Second Wind's pips open Second Wind (its 1d10 + level heals)", () => {
    const sheet = derive(char([{ class: "class:fighter", level: 3 }]), registry());
    const a = ownFeatureOf(sheet.actions, "second-wind");
    expect(a?.name).toBe("Second Wind");
    expect(a?.heal).toBeDefined();
  });
  it("a shared pool (superiority dice, used by many maneuvers) stays a die to spend", () => {
    const sheet = derive(char([{ class: "class:fighter", level: 3, subclass: "subclass:battle-master" }]), registry());
    expect(ownFeatureOf(sheet.actions, "superiority-dice")).toBeUndefined();
  });
  it("a feature that doesn't roll (Action Surge) is still spent at once", () => {
    const sheet = derive(char([{ class: "class:fighter", level: 3 }]), registry());
    expect(ownFeatureOf(sheet.actions, "action-surge")).toBeUndefined();
  });
});
