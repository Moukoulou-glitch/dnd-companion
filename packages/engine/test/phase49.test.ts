import { describe, expect, it } from "vitest";
import { Character } from "@dnd/schema";
import { derive } from "../src/derive.js";
import { tableRegistry } from "./helpers.js";

const reg = tableRegistry();
const make = (o: Record<string, unknown>) =>
  Character.parse({ id: "j", schemaVersion: 1, ruleset: "5e-2014", name: "J", abilities: { str: 15, dex: 14, con: 12, int: 10, wis: 12, cha: 8 }, race: "race:human", classes: [{ class: "class:fighter", level: 1 }], hp: { current: 10, temp: 0 }, ...o });
const j = (o: Record<string, unknown> = {}) => derive(make(o), reg).jump;

describe("8j: jumping (a human: Strength 15 + 1 = 16)", () => {
  it("long jump: Strength score with a 10 ft run-up, half standing; high jump: 3 + Str modifier, half standing", () => {
    const x = j();
    expect([x.long.running.total, x.long.standing.total, x.high.running.total, x.high.standing.total]).toEqual([16, 8, 6, 3]);
    expect(x.runUp).toBe(10);
  });
  it("a weak character's high jump is never below 0", () => {
    const x = j({ abilities: { str: 3, dex: 14, con: 12, int: 10, wis: 12, cha: 8 } });
    expect(x.high.running.total).toBe(0);
  });
  it("Jump triples every jump", () => {
    const x = j({ effects: [{ id: "e", effect: "effect:jump" }] });
    expect([x.long.running.total, x.long.standing.total, x.high.running.total]).toEqual([48, 24, 18]);
  });
  it("Step of the Wind doubles, with Jump: six times", () => {
    const x = j({ classes: [{ class: "class:monk", level: 2 }], toggles: ["step-of-the-wind"], effects: [{ id: "e", effect: "effect:jump" }] });
    expect(x.long.running.total).toBe(96);
  });
  it("Boots of Striding and Springing (attuned) triple it", () => {
    const x = j({ inventory: [{ id: "b", item: "item:boots-of-striding-and-springing", equipped: true, attuned: true }] });
    expect(x.long.running.total).toBe(48);
  });
  it("Remarkable Athlete adds the Strength modifier to a running long jump only", () => {
    const x = j({ classes: [{ class: "class:fighter", level: 7, subclass: "subclass:champion" }] });
    expect([x.long.running.total, x.long.standing.total]).toEqual([19, 8]);
  });
  it("Athlete (remastered): proficiency bonus on every jump, a 5 ft run-up", () => {
    const x = j({ feats: [{ feat: "feat:athlete", from: "Ability Score Improvement" }], choices: { "feat:athlete": { ability: ["str"] } } });
    expect([x.long.running.total, x.long.standing.total, x.high.running.total]).toEqual([19, 10, 8]);
    expect(x.runUp).toBe(5);
  });
  it("Ring of Jumping (attuned): Jump at will, on yourself", () => {
    const sheet = derive(make({ inventory: [{ id: "r", item: "item:ring-of-jumping", equipped: true, attuned: true }] }), reg);
    const sp = sheet.spells.find((x) => x.id === "spell:jump");
    expect(sp).toBeDefined();
    expect(sp!.cast.atWill).toBe(true);
  });
  it("Peerless Athlete (while on): +10 ft on long and high jumps", () => {
    const x = j({ classes: [{ class: "class:paladin", level: 3, subclass: "subclass:oath-of-glory" }], toggles: ["peerless-athlete"] });
    expect([x.long.running.total, x.high.running.total]).toEqual([26, 16]);
  });
  it("Second-Story Work: the Dexterity modifier (+2) on a running long jump", () => {
    const x = j({ classes: [{ class: "class:rogue", level: 3, subclass: "subclass:thief" }] });
    expect(x.long.running.total).toBe(18);
  });
});
