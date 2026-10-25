import { describe, expect, it } from "vitest";
import { Character } from "@dnd/schema";
import { derive } from "../src/derive.js";
import { tableRegistry } from "./helpers.js";

const reg = tableRegistry();
const pc = (classes: { class: string; level: number; subclass?: string }[], extra: Record<string, unknown> = {}, abilities = { str: 16, dex: 14, con: 14, int: 10, wis: 10, cha: 16 }) =>
  derive(Character.parse({ id: "p", schemaVersion: 1, ruleset: "5e-2014", name: "P", abilities, race: "race:human", classes, hp: { current: 30, temp: 0 }, ...extra }), reg);
const inv = (...items: string[]) => ({ inventory: items.map((item, i) => ({ id: `i${i}`, item, quantity: 1, equipped: i === 0, attuned: false })) });

describe("13c fixes: critical range by hand", () => {
  it("set by hand: every attack crits from there, the sheet says why", () => {
    const s = pc([{ class: "class:fighter", level: 2 }], { ...inv("item:longsword"), critAdjust: { at: 19, note: "Boon" } });
    const ls = s.attacks.find((a) => a.name === "Longsword")!;
    expect(ls.attack.critAt).toBe(19);
    expect(ls.attack.notes?.join(" ")).toMatch(/Critical hit on 19–20, set by hand \(Boon\)/);
    expect(s.critRange).toEqual({ at: 19, from: [{ label: "Set by hand (Boon)", at: 19 }] });
    expect(pc([{ class: "class:fighter", level: 2 }], inv("item:longsword")).critRange).toEqual({ at: 20, from: [] });
  });
  it("Improved Critical shows on the sheet; a feature giving more wins over the hand", () => {
    const champ = pc([{ class: "class:fighter", level: 15, subclass: "subclass:champion" }], { ...inv("item:longsword"), critAdjust: { at: 19 } });
    expect(champ.critRange.at).toBe(18);
    expect(champ.attacks.find((a) => a.name === "Longsword")!.attack.critAt).toBe(18);
    expect(pc([{ class: "class:fighter", level: 3, subclass: "subclass:champion" }]).critRange.from.map((f) => f.at)).toEqual([19]);
  });
});

describe("13c fixes: Piercer, Elven Accuracy through the swap", () => {
  const feat = (id: string, more: Record<string, unknown>, cls = "class:fighter", sub?: string, abilities?: Record<string, number>) =>
    pc([{ class: cls, level: 4, ...(sub ? { subclass: sub } : {}) }], { feats: [{ feat: id, from: "Level 4 Ability Score Improvement" }], choices: { [id]: { ability: [id === "feat:elven-accuracy" ? "cha" : "str"] } }, ...more }, abilities as never);
  it("Piercer: one die rolled again after the damage, on piercing weapons only", () => {
    const s = feat("feat:piercer", inv("item:rapier", "item:maul"));
    expect(s.attacks.find((a) => a.name === "Rapier")!.damage.bonus.rerollOne).toEqual({ label: "Piercer", oncePerTurn: true });
    expect(s.attacks.find((a) => a.name === "Maul")!.damage.bonus.rerollOne).toBeUndefined();
  });
  it("Elven Accuracy: Hex Warrior on a Strength weapon carries the third d20", () => {
    const s = feat("feat:elven-accuracy", inv("item:longsword"), "class:warlock", "subclass:the-hexblade", { str: 14, dex: 10, con: 14, int: 10, wis: 10, cha: 18 });
    const ls = s.attacks.find((a) => a.name === "Longsword")!;
    expect(ls.attack.tripleAdvantage).toBeUndefined();
    expect(ls.attack.suggestions.find((x) => x.label === "Hex Warrior")?.apply.tripleAdvantage).toBe("Elven Accuracy");
  });
});
