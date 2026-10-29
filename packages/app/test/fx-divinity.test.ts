import { describe, expect, it } from "vitest";
import { Character } from "@dnd/schema";
import { tableRegistry } from "../../engine/test/helpers.js";
import { opFx } from "../src/fx/triggers.js";
import { specOf } from "../src/fx/FxLayer.js";
import { CD_LOOKS, GLYPHS } from "../src/fx/divinity.js";

const reg = tableRegistry();
const pc = (race: string, level = 5, choices: Record<string, Record<string, string[]>> = {}) =>
  Character.parse({ id: "x", schemaVersion: 1, ruleset: "5e-2014", name: "X", abilities: { str: 10, dex: 14, con: 12, int: 10, wis: 14, cha: 16 }, race, classes: [{ class: "class:cleric", level }], choices, hp: { current: 30, temp: 0 } });

describe("Channel Divinity: each option its own look", () => {
  it("every Channel Divinity action in the content has one (Destructive Wrath and Preserve Life have hand-made ones)", () => {
    const ids = new Set<string>();
    const walk = (o: unknown): void => {
      if (Array.isArray(o)) return o.forEach(walk);
      if (o && typeof o === "object") {
        const r = o as { id?: string; economy?: string; cost?: { resource?: string } };
        if (r.economy && r.id && r.cost?.resource?.startsWith("channel-divinity")) ids.add(r.id);
        Object.values(o).forEach(walk);
      }
    };
    for (const kind of ["feature"] as const) walk(reg.list(kind));
    const missing = [...ids].filter((id) => !CD_LOOKS[id] && id !== "destructive-wrath" && id !== "preserve-life");
    expect(missing).toEqual([]);
    expect(ids.size).toBeGreaterThan(25);
    // No two looks alike: colours, symbol and motion together.
    const keys = Object.values(CD_LOOKS).map((l) => `${l.c1}|${l.c2}|${l.glyph}|${l.motion}`);
    expect(new Set(keys).size).toBe(keys.length);
    for (const l of Object.values(CD_LOOKS)) expect(GLYPHS[l.glyph]).toBeTruthy();
  });
  it("using one plays it, with its name", () => {
    const c = pc("race:human");
    const [e] = opFx("useAction", { action: "radiance-of-the-dawn" }, c, c);
    expect(e).toEqual({ kind: "divinity", action: "radiance-of-the-dawn" });
    expect(specOf(e!)).toMatchObject({ look: "fx-cd fx-cd-rays", label: "Channel Divinity · Radiance of the Dawn", cd: { glyph: "sun" } });
    expect(opFx("useAction", { action: "radiance-of-the-dawn", free: true }, c, c)).toEqual([]);
  });
});

describe("heritage features on screen", () => {
  it("the features arriving at 10th level, by race", () => {
    const before = pc("race:half-elf", 9);
    const after = pc("race:half-elf", 10);
    expect(opFx("levelUp", {}, before, after)).toContainEqual({ kind: "heritage", motif: "adama", label: "Heritage: Adama" });
    expect(opFx("levelUp", {}, pc("race:human", 9), pc("race:human", 10)).some((e) => e.kind === "heritage")).toBe(false);
  });
  it("Adama spent, a Thinking Stone spell, a season's spell", () => {
    const c = pc("race:eladrin", 10, { "race:eladrin": { season: ["Titanspring"] } });
    expect(opFx("spendResource", { resource: "adama", amount: 1 }, c, c)).toContainEqual({ kind: "heritage", motif: "adama", label: "Adama · two wholes" });
    expect(opFx("castSpell", { spell: "spell:shield", list: "thinking-stone", level: 1, using: "extra" }, c, c)).toContainEqual({ kind: "heritage", motif: "stone", label: "Thinking Stone" });
    const e = opFx("castSpell", { spell: "spell:aura-of-vitality", list: "unbridled-seasons", level: 3, using: "free" }, c, c).find((x) => x.kind === "heritage")!;
    expect(specOf(e)).toMatchObject({ look: "fx-her fx-her-seasons fx-her-spring", label: "Unbridled Seasons · Titanspring", heritage: { motif: "seasons", season: "spring" } });
  });
  it("Fey Step as a reaction: the bigger look", () => {
    const c = pc("race:eladrin", 10, { "race:eladrin": { season: ["Heammer"] } });
    const [e] = opFx("useAction", { action: "fey-step-reaction" }, c, c);
    expect(specOf(e!)).toMatchObject({ look: "fx-fey fx-fey-summer fx-fey-unbridled", label: "Fey Step (reaction) · Heammer" });
  });
});
