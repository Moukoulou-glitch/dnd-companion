import { describe, expect, it } from "vitest";
import { Character } from "@dnd/schema";
import { derive, newCharacter } from "@dnd/engine";
import { tableRegistry } from "../../engine/test/helpers.js";
import { opFx } from "../src/fx/triggers.js";
import { specOf } from "../src/fx/FxLayer.js";
import { featureFor } from "../src/fx/features.js";
import { NameFx } from "../src/fx/NameFx.js";
import { FEATURE_ASSIGNMENTS, FEATURE_PRESETS } from "../src/dice/featureThemes.js";

const reg = tableRegistry();
const pc = (cls: string, level = 5) =>
  Character.parse({ id: "x", schemaVersion: 1, ruleset: "5e-2014", name: "X", abilities: { str: 14, dex: 14, con: 12, int: 16, wis: 12, cha: 14 }, race: "race:human", classes: [{ class: cls, level }], hp: { current: 30, temp: 0 } });

describe("22i: class moments", () => {
  it("each feature plays its own moment, with its words", () => {
    const c = pc("class:fighter");
    const one = (action: string, extra: Record<string, unknown> = {}) => opFx("useAction", { action, ...extra }, c, c).filter((e) => e.kind === "moment");
    expect(one("second-wind")).toEqual([{ kind: "moment", motif: "second-wind" }]);
    expect(specOf(one("action-surge")[0]!)).toMatchObject({ look: "fx-mo fx-mo-action-surge", label: "Action Surge · one more action" });
    expect(specOf(one("arcane-recovery", { slots: [2, 1] })[0]!).label).toBe("Arcane Recovery · levels 2 and 1 slots");
    expect(specOf(one("divine-sense")[0]!).label).toBe("Divine Sense");
    expect(specOf(one("lay-on-hands", { amount: 15 })[0]!).label).toBe("Lay on Hands · 15");
    expect(specOf(one("charm-of-sunlight")[0]!)).toMatchObject({ look: "fx-mo fx-mo-sunlight", label: "Charm of Sunlight" });
    expect(specOf(one("charm-of-sunlight-join")[0]!).label).toBe("Charm of Sunlight · your crown joins");
    // "Just activate" (nothing really used): no moment.
    expect(one("action-surge", { free: true })).toEqual([]);
  });
  it("Portent: foretold after a long rest, and used", () => {
    const before = pc("class:wizard", 2);
    const e = opFx("setPool", { resource: "portent", values: [17, 4] }, before, before).find((x) => x.kind === "moment")!;
    expect(specOf(e)).toMatchObject({ look: "fx-mo fx-mo-portent-roll", label: "Portent · 17 and 4 foretold", moment: { motif: "portent-roll", values: [17, 4] } });
    const held = { ...before, pools: { portent: [17, 4] } } as Character;
    const used = opFx("usePool", { resource: "portent", index: 1 }, held, { ...held, pools: { portent: [17] } } as Character).find((x) => x.kind === "moment")!;
    expect(specOf(used).label).toBe("Portent · 4, as foretold");
  });
  it("they replace the class's generic look (no two looks for one use)", () => {
    const fighter = newCharacter({ id: "f", name: "F", race: "race:human", class: "class:fighter", abilities: { str: 15, dex: 14, con: 13, int: 10, wis: 12, cha: 8 } }, reg);
    fighter.classes = [{ class: "class:fighter", level: 2 }];
    const sheet = derive(fighter, reg);
    expect(featureFor(sheet, "useAction", { action: "second-wind" })).toBeUndefined();
    expect(featureFor(sheet, "useAction", { action: "action-surge" })).toBeUndefined();
    expect(featureFor(sheet, "usePool", { resource: "portent", index: 0 })).toBeUndefined();
  });
  it("Portent's dice have their own look", () => {
    expect(FEATURE_PRESETS.portent).toMatchObject({ id: "feature-portent", label: "Portent" });
    expect(FEATURE_ASSIGNMENTS).toContainEqual(["resource:portent", "portent"]);
  });
  it("Charm of Sunlight: a crown on the name while it lasts", () => {
    const fx = (effects: { id: string }[]) => NameFx({ name: "Ilya", sheet: { effects } as never }) as unknown as { props: { className: string; children: unknown[] } };
    expect(fx([]).props.className).toBe("who-name");
    const on = fx([{ id: "other:charm-of-sunlight" }]);
    expect(on.props.className).toBe("who-name name-crowned");
    expect(on.props.children[2]).toBeTruthy();
  });
});
