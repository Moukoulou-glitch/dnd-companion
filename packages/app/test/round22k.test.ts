import { describe, expect, it } from "vitest";
import { Character } from "@dnd/schema";
import { derive } from "@dnd/engine";
import { tableRegistry } from "../../engine/test/helpers.js";
import { opFx, stateLoops } from "../src/fx/triggers.js";
import { specOf } from "../src/fx/FxLayer.js";
import { featureFor } from "../src/fx/features.js";
import { FEAT_LOOKS, featFor, featTier } from "../src/fx/featureLooks.js";
import { GLYPHS } from "../src/fx/divinity.js";

const reg = tableRegistry();
const pc = (cls: string, level: number, subclass?: string, extra: Partial<Record<string, unknown>> = {}) =>
  Character.parse({ id: "x", schemaVersion: 1, ruleset: "5e-2014", name: "X", abilities: { str: 14, dex: 14, con: 14, int: 12, wis: 16, cha: 14 }, race: "race:human", classes: [{ class: cls, level, ...(subclass ? { subclass } : {}) }], hp: { current: 60, temp: 0 }, ...extra });

describe("22k: feature looks by level", () => {
  it("every look names a real action, a known symbol, and no two look the same", () => {
    const actions = new Set<string>();
    for (const f of reg.list("feature")) for (const a of f.grant?.actions ?? []) actions.add(a.id);
    for (const [id, l] of Object.entries(FEAT_LOOKS)) {
      expect(actions.has(id), id).toBe(true);
      expect(GLYPHS[l.glyph], id).toBeTruthy();
    }
    // One look per feature (a feature's variants, like the sorcery-point ones, share its look).
    const byName = new Map(Object.values(FEAT_LOOKS).map((l) => [l.name, `${l.c1}|${l.c2}|${l.glyph}|${l.motion}`]));
    expect(new Set(byName.values()).size).toBe(byName.size);
  });
  it("17th–20th: the grandest, with a veil, a pillar and a shake", () => {
    const c = pc("class:paladin", 20, "subclass:oath-of-devotion");
    const e = opFx("useAction", { action: "holy-nimbus" }, c, c).find((x) => x.kind === "feat-look")!;
    expect(specOf(e)).toMatchObject({ look: "fx-cd fx-cd-rays fx-feat fx-feat-t4", label: "Holy Nimbus", feat: { tier: 4, from: "Paladin 20 · Oath of Devotion" }, shake: 380, ms: 3200 });
    expect(opFx("useAction", { action: "holy-nimbus", free: true }, c, c).some((x) => x.kind === "feat-look")).toBe(false);
  });
  it("a feature that grows looks its size: Protective Bond at 6th, Expansive Bond at 17th; Draconic Presence for a monk", () => {
    const l = FEAT_LOOKS["protective-bond"]!;
    expect(featFor(l, [{ class: "class:cleric", level: 6 }])).toEqual({ level: 6, from: "Cleric 6 · Peace Domain" });
    expect(featTier(featFor(l, [{ class: "class:cleric", level: 17 }]).level)).toBe(4);
    expect(featFor(FEAT_LOOKS["draconic-presence"]!, [{ class: "class:monk", level: 5 }])).toEqual({ level: 3, from: "Monk 3 · Way of the Ascendant Dragon" });
    expect(featFor(FEAT_LOOKS["giants-might"]!, [{ class: "class:fighter", level: 18 }]).level).toBe(18);
  });
  it("they replace the generic class look", () => {
    const c = pc("class:monk", 18);
    const sheet = derive(c, reg);
    expect(featureFor(sheet, "useAction", { action: "empty-body" })).toBeUndefined();
  });
});

describe("22k: Twilight Domain", () => {
  it("Twilight Sanctuary: the sphere; from 17th level, the shroud", () => {
    const c = pc("class:cleric", 6, "subclass:twilight-domain");
    expect(opFx("useAction", { action: "twilight-sanctuary" }, c, c).find((x) => x.kind === "moment")).toMatchObject({ motif: "twilight-sanctuary" });
    const c17 = pc("class:cleric", 17, "subclass:twilight-domain");
    const e = opFx("useAction", { action: "twilight-sanctuary" }, c17, c17).find((x) => x.kind === "moment")!;
    expect(specOf(e)).toMatchObject({ look: "fx-mo fx-mo-twilight-shroud", label: "Twilight Sanctuary · Twilight Shroud", ms: 3600 });
    // No Channel Divinity sigil on top.
    expect(opFx("useAction", { action: "twilight-sanctuary" }, c, c).some((x) => x.kind === "divinity")).toBe(false);
  });
  it("loops while they last: the sphere (and the shroud), Steps of Night", () => {
    expect(stateLoops(pc("class:cleric", 6, "subclass:twilight-domain", { toggles: ["twilight-sanctuary", "steps-of-night"] }))).toEqual({ twilight: "sfx-ongoing-twilight", steps: "sfx-ongoing-steps" });
    expect(stateLoops(pc("class:cleric", 17, "subclass:twilight-domain", { toggles: ["twilight-sanctuary"] })).twilight).toBe("sfx-ongoing-twilight sfx-ongoing-shroud17");
  });
  it("the sanctuary's temporary hit points come at the end of a turn, not when it starts", () => {
    const sheet = derive(pc("class:cleric", 6, "subclass:twilight-domain"), reg);
    expect(sheet.actions.find((a) => a.id === "twilight-sanctuary")?.roll).toBeUndefined();
    const turn = sheet.actions.find((a) => a.id === "twilight-sanctuary-turn")!;
    expect(turn.economy).toBe("free");
    expect(turn.tempHp?.text).toBe("1d6 + 6");
  });
  it("Steps of Night", () => {
    const c = pc("class:cleric", 6, "subclass:twilight-domain");
    expect(specOf(opFx("useAction", { action: "steps-of-night" }, c, c).find((x) => x.kind === "moment")!).label).toBe("Steps of Night");
  });
});

describe("22k: exhaustion", () => {
  const withEx = (level: number) => pc("class:fighter", 5, undefined, level ? { effects: [{ id: "ex", effect: "condition:exhaustion", level }] } : {});
  it("each level its own look as it comes on; relief as it eases", () => {
    const up = opFx("addEffect", {}, withEx(2), withEx(3)).find((x) => x.kind === "moment")!;
    expect(specOf(up)).toMatchObject({ look: "fx-mo fx-mo-exhaustion fx-mo-exh-3", label: "Exhaustion 3 · disadvantage on attacks and saves" });
    expect(specOf(opFx("addEffect", {}, withEx(5), withEx(6)).find((x) => x.kind === "moment")!)).toMatchObject({ label: "Exhaustion 6 · death", shake: 500 });
    expect(specOf(opFx("rest", {}, withEx(2), withEx(1)).find((x) => x.kind === "moment")!).label).toBe("Exhaustion eases · level 1");
    expect(specOf(opFx("rest", {}, withEx(1), withEx(0)).find((x) => x.kind === "moment")!).label).toBe("Exhaustion gone");
  });
  it("a loop heavier with each level", () => {
    expect(stateLoops(withEx(4)).exhaustion).toBe("sfx-ongoing-exh sfx-ongoing-exh-4");
    expect(stateLoops(withEx(0)).exhaustion).toBeUndefined();
  });
});
