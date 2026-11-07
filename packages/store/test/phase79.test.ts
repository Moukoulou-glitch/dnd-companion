import { describe, expect, it } from "vitest";
import { derive, newCharacter } from "@dnd/engine";
import { tableRegistry } from "../../engine/test/helpers.js";
import { CharacterLog } from "../src/log.js";
import { HybridClock } from "../src/clock.js";

const reg = tableRegistry();
let t = 1_840_000_000_000;
const ranger = () => {
  const c = newCharacter({ id: "r", name: "Ranger", race: "race:human", class: "class:ranger", abilities: { str: 12, dex: 16, con: 14, int: 10, wis: 14, cha: 10 } }, reg);
  c.classes = [{ class: "class:ranger", level: 5, subclass: "subclass:beast-master" }];
  c.hp = { current: 40, temp: 0 };
  c.companions = { "primal-beast": { form: "land", states: [] } };
  return new CharacterLog(c, reg, new HybridClock("t", () => (t += 1000)), "player");
};
const beast = (l: CharacterLog) => derive(l.character, reg).companions.find((x) => x.id === "primal-beast")!;

describe("19a: Primal Companion: Dodge unless commanded", () => {
  it("the beast is there, commanded with a bonus action", () => {
    const b = beast(ranger());
    expect(b.command).toMatchObject({ economy: "bonus", attackInstead: true });
    expect(b.commanded).toBeUndefined();
  });
  it("not commanded: it takes the Dodge action when your turn ends", () => {
    const l = ranger();
    l.record("startCombat", {});
    l.record("startTurn", {});
    expect(l.record("endTurn", {}).join(" ")).toMatch(/wasn't commanded: it takes the Dodge action/);
    expect(beast(l).states.map((x) => x.name)).toEqual(["Dodge"]);
    expect(beast(l).used.action).toBe(true);
    // Its Dodge lasts until your next turn; the turn and the command come back then.
    l.record("startTurn", {});
    expect(beast(l).states).toEqual([]);
    expect(beast(l).used.action).toBe(false);
  });
  it("commanded: any action this turn, no Dodge at the end; the command lasts one turn", () => {
    const l = ranger();
    l.record("startCombat", {});
    l.record("startTurn", {});
    l.record("useAction", { action: "primal-companion" });
    l.record("companionEconomy", { companion: "primal-beast", commanded: "any" });
    expect(beast(l).commanded).toBe("any");
    expect(l.record("companionAction", { companion: "primal-beast", action: "common-dash" }).join(" ")).not.toMatch(/wasn't commanded/);
    expect(l.record("endTurn", {}).join(" ")).not.toMatch(/Dodge/);
    expect(beast(l).states).toEqual([]);
    l.record("startTurn", {});
    expect(beast(l).commanded).toBeUndefined();
  });
  it("an action it wasn't commanded to take is warned, never blocked; attacking in place of your attack allows the Attack only", () => {
    const l = ranger();
    l.record("startCombat", {});
    l.record("startTurn", {});
    expect(l.record("companionAction", { companion: "primal-beast", action: "common-dash" }).join(" ")).toMatch(/wasn't commanded.*Used anyway/);
    expect(beast(l).used.action).toBe(true);
    l.record("startTurn", {});
    l.record("useEconomy", { kind: "attack" });
    l.record("companionEconomy", { companion: "primal-beast", commanded: "attack" });
    expect(l.record("companionAction", { companion: "primal-beast", action: "common-dash" }).join(" ")).toMatch(/commanded to attack/);
  });
  it("you incapacitated: it acts as it likes, and doesn't Dodge by default", () => {
    const l = ranger();
    l.record("startCombat", {});
    l.record("startTurn", {});
    l.record("addEffect", { instanceId: "inc", effect: "condition:incapacitated" });
    expect(l.record("companionAction", { companion: "primal-beast", action: "common-dash" }).join(" ")).not.toMatch(/commanded/);
    expect(l.record("endTurn", {}).join(" ")).not.toMatch(/Dodge action/);
  });
});

describe("19b: items whose spells you pick", () => {
  const cleric = (inv: any[]) => {
    const c = newCharacter({ id: "c", name: "Cleric", race: "race:human", class: "class:cleric", abilities: { str: 10, dex: 12, con: 14, int: 10, wis: 16, cha: 10 } }, reg);
    c.classes = [{ class: "class:cleric", level: 5, subclass: "subclass:light-domain" }];
    c.hp = { current: 30, temp: 0 };
    c.inventory.push(...inv);
    return new CharacterLog(c, reg, new HybridClock("t", () => (t += 1000)), "player");
  };
  it("Necklace of Prayer Beads: the beads picked give their spells, each bead once until dawn, with your DC, as a bonus action", () => {
    const l = cleric([{ id: "neck", item: "item:necklace-of-prayer-beads", quantity: 1, equipped: true, attuned: true }]);
    expect(derive(l.character, reg).spells.filter((x) => x.list.id === "prayer-beads")).toEqual([]);
    l.record("setItem", { instanceId: "neck", picks: ["blessing", "curing", "curing", "smiting"] });
    const s = derive(l.character, reg);
    const beads = s.spells.filter((x) => x.list.id === "prayer-beads");
    expect(beads.map((x) => x.name).sort()).toEqual(["Bless", "Branding Smite", "Cure Wounds", "Lesser Restoration"]);
    expect(beads.every((x) => x.castingTime === "1 bonus action")).toBe(true);
    expect(s.resources.find((r) => r.id === "bead-curing")).toMatchObject({ max: 2, reset: "dawn" });
    expect(beads.find((x) => x.name === "Cure Wounds")!.cast.free).toMatchObject({ resource: "bead-curing", level: 2 });
    // From the bead only: not with your slots.
    expect(beads.every((x) => x.cast.slotLevels.length === 0)).toBe(true);
    const dc = s.spellcasting.find((x) => x.id === "cleric")!.saveDc.total;
    expect(s.spellcasting.find((x) => x.id === "prayer-beads")!.saveDc.total).toBe(dc);
    // The cleric's own Bless stays a cleric spell too.
    expect(s.spells.some((x) => x.id === "spell:bless" && x.list.id === "cleric")).toBe(true);
    // More than six beads: warned, kept.
    expect(l.record("setItem", { instanceId: "neck", picks: ["blessing", "blessing", "blessing", "favor", "favor", "summons", "wind-walking"] }).join(" ")).toMatch(/at most 6 beads/);
  });
  it("beads used are tracked: casting one uses that bead until dawn; the last one used warns; a long rest brings them back", () => {
    const l = cleric([{ id: "neck", item: "item:necklace-of-prayer-beads", quantity: 1, equipped: true, attuned: true, picks: ["curing", "curing"] }]);
    const bead = () => derive(l.character, reg).resources.find((r) => r.id === "bead-curing")!;
    l.record("castSpell", { spell: "spell:cure-wounds", list: "prayer-beads", level: 2, using: "free" });
    expect(bead()).toMatchObject({ used: 1, max: 2, remaining: 1 });
    // Lesser Restoration shares the Curing beads.
    l.record("castSpell", { spell: "spell:lesser-restoration", list: "prayer-beads", level: 2, using: "free" });
    expect(bead().remaining).toBe(0);
    expect(l.record("castSpell", { spell: "spell:cure-wounds", list: "prayer-beads", level: 2, using: "free" }).join(" ")).toMatch(/none left/);
    // Marked by hand on the necklace, and back again.
    l.record("restoreResource", { resource: "bead-curing", amount: 1 });
    expect(bead().remaining).toBe(1);
    l.record("rest", { kind: "long" });
    expect(bead().remaining).toBe(2);
  });
  it("Ring of Spell Storing: the spells it holds, cast once each with the caster's numbers; the ring stays", () => {
    const l = cleric([{ id: "ring", item: "item:ring-of-spell-storing", quantity: 1, equipped: true, attuned: true }]);
    l.record("setItem", { instanceId: "ring", storedSpells: [{ id: "a", spell: "spell:shield-of-faith", level: 1, dc: 15, attack: 7, by: "Mira" }, { id: "b", spell: "spell:hold-person", level: 2, dc: 15, attack: 7 }] });
    const sp = derive(l.character, reg).spells.find((x) => x.id === "spell:hold-person" && x.cast.scroll?.entry === "b")!;
    expect(sp.cast.scroll).toMatchObject({ dc: 15, level: 2, from: "Ring of Spell Storing" });
    expect(sp.save?.dc).toBe(15);
    l.record("castSpell", { spell: "spell:hold-person", list: sp.list.id, level: 2, using: "scroll" });
    const ring = l.character.inventory.find((i) => i.id === "ring")!;
    expect(ring.quantity).toBe(1);
    expect(ring.storedSpells?.map((x) => x.id)).toEqual(["a"]);
    // Over 5 levels: warned, kept.
    expect(l.record("setItem", { instanceId: "ring", storedSpells: [{ id: "c", spell: "spell:fireball", level: 3 }, { id: "d", spell: "spell:fireball", level: 3 }] }).join(" ")).toMatch(/up to 5 levels/);
  });
});

describe("19e: a shield guardian's Spell Storing, through the Master's Amulet", () => {
  const wizard = (withGuardian: boolean, equipped = true) => {
    const c = newCharacter({ id: "w", name: "Mage", race: "race:human", class: "class:wizard", abilities: { str: 8, dex: 14, con: 14, int: 18, wis: 12, cha: 10 } }, reg);
    c.classes = [{ class: "class:wizard", level: 9 }];
    c.hp = { current: 40, temp: 0 };
    c.inventory.push({ id: "am", item: "item:masters-amulet", quantity: 1, equipped, attuned: false } as any);
    if (withGuardian) c.customCompanions = [{ id: "g", name: "Guardian", kind: "Construct", from: "creature:shield-guardian", size: "Large", type: "construct", ac: 17, hpMax: 142, speed: "30 ft.", abilities: { str: 18, dex: 8, con: 18, int: 7, wis: 10, cha: 3 }, traits: [], attacks: [] } as any];
    return new CharacterLog(c, reg, new HybridClock("t", () => (t += 1000)), "player");
  };
  const fireball = { id: "s1", spell: "spell:fireball", level: 3, dc: 16, attack: 8, by: "Mage" };
  it("the amulet is a worn item, not a shield", () => {
    expect(reg.find("item:masters-amulet", "item")).toMatchObject({ category: "wondrous", storesSpells: { count: 1, maxSpellLevel: 4 } });
  });
  it("the stored spell is the guardian's, castable only with the guardian as a companion and the amulet worn", () => {
    for (const [g, eq, has] of [[true, true, true], [false, true, false], [true, false, false]] as const) {
      const l = wizard(g, eq);
      l.record("setItem", { instanceId: "am", storedSpells: [fireball] });
      const sp = derive(l.character, reg).spells.find((x) => x.cast.scroll?.entry === "s1");
      expect(!!sp).toBe(has);
      if (sp) expect(sp.cast.scroll).toMatchObject({ from: "Shield Guardian", dc: 16, level: 3 });
    }
  });
  it("one spell at a time; 4th level or lower; casting it loses it", () => {
    const l = wizard(true);
    l.record("setItem", { instanceId: "am", storedSpells: [fireball] });
    expect(l.record("setItem", { instanceId: "am", storedSpells: [fireball, { id: "s2", spell: "spell:fly", level: 3 }] }).join(" ")).toMatch(/holds one spell at a time/);
    expect(l.record("setItem", { instanceId: "am", storedSpells: [{ id: "s3", spell: "spell:cone-of-cold", level: 5 }] }).join(" ")).toMatch(/level 4 or lower/);
    l.record("setItem", { instanceId: "am", storedSpells: [fireball] });
    const sp = derive(l.character, reg).spells.find((x) => x.cast.scroll?.entry === "s1")!;
    l.record("castSpell", { spell: "spell:fireball", list: sp.list.id, level: 3, using: "scroll" });
    expect(l.character.inventory.find((i) => i.id === "am")!.storedSpells).toBeUndefined();
    expect(l.character.inventory.some((i) => i.id === "am")).toBe(true);
  });
});
