import { describe, expect, it } from "vitest";
import { derive, newCharacter } from "@dnd/engine";
import { tableRegistry } from "../../engine/test/helpers.js";

const reg = tableRegistry();
const make = (classes: { class: string; level: number; subclass?: string }[], race = "race:hill-dwarf") => {
  const c = newCharacter({ id: "x", name: "X", race, class: classes[0]!.class, abilities: { str: 16, dex: 14, con: 14, int: 10, wis: 14, cha: 8 } }, reg);
  c.classes = classes as never;
  return c;
};
const res = (c: ReturnType<typeof make>, id: string) => derive(c, reg).resources.find((r) => r.id === id);

describe("Resource dice on Play", () => {
  it("Second Wind shows its d10 and what a use does (from the feature that spends it)", () => {
    const c = make([{ class: "class:fighter", level: 3 }]);
    expect(res(c, "second-wind")).toMatchObject({ die: "d10", effect: "heals 1d10 + 3", remaining: 1 });
  });

  it("Superiority Dice keep their own die, growing with level; Psionic Energy too", () => {
    expect(res(make([{ class: "class:fighter", level: 3, subclass: "subclass:battle-master" }]), "superiority-dice")).toMatchObject({ die: "d8", max: 4 });
    expect(res(make([{ class: "class:fighter", level: 10, subclass: "subclass:battle-master" }]), "superiority-dice")).toMatchObject({ die: "d10", max: 5 });
    expect(res(make([{ class: "class:fighter", level: 3, subclass: "subclass:psi-warrior" }]), "psionic-energy-psi-warrior")?.die).toBe("d6");
    expect(res(make([{ class: "class:fighter", level: 5, subclass: "subclass:psi-warrior" }]), "psionic-energy-psi-warrior")?.die).toBe("d8");
  });

  it("a resource with no die stays without one", () => {
    expect(res(make([{ class: "class:fighter", level: 3 }]), "action-surge")?.die).toBeUndefined();
  });
});

describe("Where each feature comes from, and at which class level", () => {
  // A Ranger 3 / Fighter 3 (Battle Master): character level 6.
  const c = make([
    { class: "class:ranger", level: 3, subclass: "subclass:hunter" },
    { class: "class:fighter", level: 3, subclass: "subclass:battle-master" },
  ]);
  c.background = "background:acolyte";
  c.feats.push({ feat: "feat:alert" } as never);
  c.choices["feature:fighter-fighting-style"] = { option: ["feature:style-defense"] };
  const s = derive(c, reg);
  const origin = (name: string) => s.features.find((f) => f.name === name)?.origin;

  it("class features say the class and the class level they're gained at, not the total level", () => {
    expect(s.level).toBe(6);
    expect(origin("Second Wind")).toBe("Fighter 1");
    expect(origin("Action Surge")).toBe("Fighter 2");
    expect(origin("Favored Foe")).toBe("Ranger 1");
  });

  it("subclass features name the subclass, the class and its level", () => {
    expect(origin("Combat Superiority")).toBe("Battle Master (Fighter 3)");
  });

  it("race, background, feat, and a feature picked in another one", () => {
    expect(origin("Darkvision")).toBe("Race (Hill Dwarf)");
    expect(s.features.find((f) => f.kind === "background")?.origin).toBe("Background");
    expect(origin("Alert")).toBe("Feat");
    expect(origin("Defense")).toBe("Fighter 1 · Fighting Style");
  });
});
