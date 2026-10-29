import { describe, expect, it } from "vitest";
import { derive, newCharacter } from "@dnd/engine";
import { tableRegistry } from "../../engine/test/helpers.js";
import { CharacterLog } from "../src/log.js";
import { HybridClock } from "../src/clock.js";

const reg = tableRegistry();
let t = 1_810_000_000_000;
const make = (cls: string, level: number, subclass: string, extra: (c: ReturnType<typeof newCharacter>) => void = () => {}) => {
  const c = newCharacter({ id: "p", name: "Test", race: "race:human", class: cls, abilities: { str: 10, dex: 14, con: 14, int: 16, wis: 14, cha: 10 } }, reg);
  c.classes = [{ class: cls, level, subclass }];
  c.hp = { current: 60, temp: 0 };
  extra(c);
  return new CharacterLog(c, reg, new HybridClock("t", () => (t += 1000)), "player");
};

describe("14c in play", () => {
  it("Master Scrivener: a scroll one level higher, gone at the next long rest", () => {
    const l = make("class:wizard", 10, "subclass:order-of-scribes", (c) => {
      c.spells = [{ spell: "spell:misty-step", list: "wizard", prepared: false }];
    });
    expect(l.record("useAction", { action: "master-scrivener", choice: "Misty Step" }).join(" ")).toMatch(/scroll of Misty Step at level 3/);
    const scroll = l.character.inventory.find((i) => i.untilLongRest)!;
    expect(scroll).toMatchObject({ item: "item:spell-scroll-3rd-level", scroll: { spell: "spell:misty-step", level: 3 } });
    expect(l.character.resourcesUsed["master-scrivener"]).toBe(1);
    expect(l.record("rest", { kind: "long" }).join(" ")).toMatch(/Gone with the long rest: Misty Step scroll/);
    expect(l.character.inventory.some((i) => i.untilLongRest)).toBe(false);
  });
  it("Emissary of Redemption: after a long rest, all damage halved and the retaliation reminded", () => {
    const l = make("class:paladin", 20, "subclass:oath-of-redemption");
    l.record("rest", { kind: "long" });
    const hp = l.character.hp.current;
    expect(l.record("damage", { amount: 20, damageType: "slashing" }).join(" ")).toMatch(/radiant damage equal to half/);
    expect(l.character.hp.current).toBe(hp - 10);
    expect(l.character.effects.some((e) => e.effect === "effect:emissary-of-redemption")).toBe(true);
  });
  it("Master Scrivener's scroll uses your wizard spell save DC and attack bonus, with no check", () => {
    const l = make("class:wizard", 10, "subclass:order-of-scribes", (c) => {
      c.spells = [{ spell: "spell:hold-person", list: "wizard", prepared: false }];
    });
    l.record("useAction", { action: "master-scrivener", choice: "Hold Person" });
    const s = derive(l.character, reg);
    const wiz = s.spellcasting.find((x) => x.id === "wizard")!;
    const sp = s.spells.find((x) => x.cast.scroll && x.id === "spell:hold-person")!;
    expect(sp.cast.scroll).toMatchObject({ level: 3, dc: wiz.saveDc.total, attack: wiz.attack.total });
    expect(sp.cast.scroll?.check).toBeUndefined();
  });
  it("Guardian Spirit: Spirit Totem's tag carries its aura switch, which goes when the tag does", () => {
    const l = make("class:druid", 10, "subclass:circle-of-the-shepherd");
    l.record("useAction", { action: "spirit-totem", choice: "Bear" });
    const tag = l.character.effects.find((e) => e.effect === "other:spirit-totem-guardian")!;
    expect(tag).toMatchObject({ choice: "Bear", minutes: 1, toggles: ["spirit-totem"] });
    expect(l.character.toggles).toContain("spirit-totem");
    l.record("removeEffect", { instanceId: tag.id });
    expect(l.character.toggles).not.toContain("spirit-totem");
  });
});
