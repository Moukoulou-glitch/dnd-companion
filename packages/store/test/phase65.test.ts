import { describe, expect, it } from "vitest";
import { derive, newCharacter, artifactProperty, withCustom } from "@dnd/engine";
import { tableRegistry } from "../../engine/test/helpers.js";
import { CharacterLog } from "../src/log.js";
import { HybridClock } from "../src/clock.js";

const reg = tableRegistry();
let t = 1_802_000_000_000;
const make = (extra: (c: ReturnType<typeof newCharacter>) => void = () => {}) => {
  const c = newCharacter({ id: "p", name: "Test", race: "race:human", class: "class:fighter", abilities: { str: 16, dex: 12, con: 14, int: 10, wis: 12, cha: 10 } }, reg);
  extra(c);
  return new CharacterLog(c, reg, new HybridClock("t", () => (t += 1000)), "player");
};

describe("11e-3: curses", () => {
  it("Demon Armor: no curse until attuned; then a tag, its disadvantages, warnings on taking it off, lifted by Remove Curse", () => {
    const l = make((c) => c.inventory.push({ id: "da", item: "item:demon-armor", quantity: 1, equipped: true, attuned: false }));
    expect(derive(l.character, reg).featureTags.some((x) => x.curse)).toBe(false);
    l.record("setItem", { instanceId: "da", attuned: true });
    const s = derive(l.character, reg);
    const tag = s.featureTags.find((x) => x.curse)!;
    expect(tag.name).toBe("Curse: Demon Armor");
    expect(tag.reminders[0]).toMatch(/disadvantage on attack rolls against demons/);
    expect(s.ac.total).toBe(19);
    expect(s.attacks.some((a) => a.name === "Demon Armor claws")).toBe(true);
    expect(l.record("setItem", { instanceId: "da", equipped: false }).join(" ")).toMatch(/is cursed: you can't let it go/);
    l.record("setItem", { instanceId: "da", equipped: true });
    expect(l.record("liftCurse", { instanceId: "da" }).join(" ")).toMatch(/curse is lifted/);
    expect(l.character.inventory[0]?.attuned).toBe(false);
    expect(derive(l.character, reg).featureTags.some((x) => x.curse)).toBe(false);
    expect(l.record("setItem", { instanceId: "da", equipped: false }).join(" ")).not.toMatch(/cursed/);
  });
  it("Armor of Vulnerability: the resistance and the vulnerabilities", () => {
    const s = derive(make((c) => c.inventory.push({ id: "av", item: "item:armor-of-vulnerability-slashing", quantity: 1, equipped: true, attuned: true })).character, reg);
    expect(s.defenses.resist).toContain("slashing");
    expect(s.defenses.vulnerable).toEqual(expect.arrayContaining(["bludgeoning", "piercing"]));
  });
});

describe("11e-3: charges", () => {
  it("Horn of Silent Alarm: 4 charges, used and back; a long rest reminds of the dawn roll", () => {
    const l = make((c) => c.inventory.push({ id: "h", item: "item:horn-of-silent-alarm", quantity: 1, equipped: false, attuned: false }));
    expect(l.record("useCharge", { instanceId: "h", amount: 1 }).join(" ")).toMatch(/3 of 4 charges left/);
    expect(l.record("rest", { kind: "long" }).join(" ")).toMatch(/Horn of Silent Alarm \(1d4\)/);
    l.record("useCharge", { instanceId: "h", amount: -3 });
    expect(l.character.inventory[0]?.chargesUsed).toBeUndefined();
  });
  it("Chime of Opening cracks with its last charge", () => {
    const l = make((c) => c.inventory.push({ id: "ch", item: "item:chime-of-opening", quantity: 1, equipped: false, attuned: false, chargesUsed: 9 }));
    expect(l.record("useCharge", { instanceId: "ch", amount: 1 }).join(" ")).toMatch(/cracks and is useless/);
  });
});

describe("11e-3: artifacts of your own", () => {
  it("rolled and picked properties apply while attuned; their text is on the item; attuning damage is listed", () => {
    expect(artifactProperty("minor-good", 15)?.pick).toBe("skill");
    expect(artifactProperty("major-bad", 100)?.text).toMatch(/avatar/);
    const l = make((c) => {
      c.customItems.push({
        id: "art",
        name: "Crown of Ash",
        category: "wondrous",
        description: "",
        requiresAttunement: false,
        source: "",
        modifiers: [],
        rarity: "artifact",
        artifact: [
          { table: "minor-good", roll: 10, pick: "arcana" },
          { table: "minor-good", roll: 45, pick: "fire" },
          { table: "minor-good", roll: 95 },
          { table: "major-good", roll: 45 },
          { table: "minor-bad", roll: 38 },
          { table: "major-bad", roll: 63 },
        ],
      });
      c.inventory.push({ id: "ai", item: "item:custom-art", quantity: 1, equipped: true, attuned: true });
    });
    const s = derive(l.character, reg);
    expect(s.skills.arcana.proficiency).toBe(1);
    expect(s.defenses.resist).toContain("fire");
    expect(s.ac.parts.some((p) => p.label === "Crown of Ash" && p.value === 1)).toBe(true);
    expect(s.speed.total).toBe(40);
    expect(s.saves.con.disadvantage).toContain("Crown of Ash");
    const def = withCustom(reg, l.character).find("item:custom-art", "item")!;
    expect(def.requiresAttunement).toBe(true);
    expect(def.onAttune).toEqual([{ damage: { dice: "4d10", type: "psychic" } }]);
    expect(def.text?.join(" ")).toMatch(/Proficiency in one skill .*\(arcana\)/);
  });
});
