import { describe, expect, it } from "vitest";
import { Character } from "@dnd/schema";
import { customItemId, derive, newCharacter } from "@dnd/engine";
import { tableRegistry } from "../../engine/test/helpers.js";
import { applyOperation } from "../src/apply.js";
import { CharacterLog } from "../src/log.js";
import { HybridClock } from "../src/clock.js";

const reg = tableRegistry();
let t = 1_798_000_000_000;
const make = () => newCharacter({ id: "x", name: "X", race: "race:human", class: "class:fighter", abilities: { str: 15, dex: 14, con: 14, int: 10, wis: 12, cha: 8 } }, reg);
const log = (c = make()) => new CharacterLog(c, reg, new HybridClock("t", () => (t += 1000)), "player");

/** What a reload does: the stored character read back, and the same changes played again from the start. */
const reloaded = (l: CharacterLog) => {
  const fromFile = Character.parse(JSON.parse(JSON.stringify(l.character)));
  const replayed = l.operations.reduce((c, op) => applyOperation(c, op, reg).character, l.base);
  return { fromFile, replayed };
};

const locket = {
  id: "lk1",
  name: "Grandmother's locket",
  category: "wondrous" as const,
  description: "A **silver** locket. It hums near the sea.",
  weight: 0.5,
  value: { amount: 25, unit: "gp" as const },
  requiresAttunement: false,
  modifiers: [],
  source: "Family",
};

describe("Custom items", () => {
  it("made on the Items page: in the inventory, with its name, type, description and quantity, and kept after a reload", () => {
    const l = log();
    l.record("setCustomItem", { item: locket, instanceId: "i1", quantity: 2 });
    expect(l.character.customItems).toHaveLength(1);
    const inst = l.character.inventory.find((i) => i.id === "i1")!;
    expect(inst).toMatchObject({ item: customItemId("lk1"), quantity: 2 });
    const { fromFile, replayed } = reloaded(l);
    for (const c of [fromFile, replayed]) {
      expect(c.customItems[0]).toMatchObject({ name: "Grandmother's locket", category: "wondrous", description: locket.description, weight: 0.5, value: { amount: 25, unit: "gp" } });
      expect(c.inventory.find((i) => i.id === "i1")?.quantity).toBe(2);
    }
  });

  it("descriptive only: it changes nothing on the sheet but its weight", () => {
    const l = log();
    const before = derive(l.character, reg);
    l.record("setCustomItem", { item: locket, instanceId: "i1", quantity: 2 });
    l.record("setItem", { instanceId: "i1", equipped: true });
    const after = derive(l.character, reg);
    expect(after.ac.total).toBe(before.ac.total);
    expect(after.saves).toEqual(before.saves);
    expect(after.skills).toEqual(before.skills);
  });

  it("its changes apply only while equipped, and attuned when it needs attunement", () => {
    const l = log();
    const base = derive(l.character, reg).ac.total;
    const ring = { ...locket, id: "r1", name: "Bark ring", requiresAttunement: true, modifiers: [{ selector: "stat.ac", op: "add" as const, value: 1, mode: "auto" as const, label: "Bark ring" }] };
    l.record("setCustomItem", { item: ring, instanceId: "i2" });
    expect(derive(l.character, reg).ac.total).toBe(base);
    l.record("setItem", { instanceId: "i2", equipped: true });
    expect(derive(l.character, reg).ac.total).toBe(base); // not attuned yet
    l.record("setItem", { instanceId: "i2", attuned: true });
    const s = derive(l.character, reg);
    expect(s.ac.total).toBe(base + 1);
    expect(JSON.stringify(s.ac)).toContain("Bark ring");
    l.record("setItem", { instanceId: "i2", equipped: false });
    expect(derive(l.character, reg).ac.total).toBe(base);
  });

  it("edited in place; no longer needing attunement takes the attunement off", () => {
    const l = log();
    l.record("setCustomItem", { item: { ...locket, requiresAttunement: true }, instanceId: "i1" });
    l.record("setItem", { instanceId: "i1", attuned: true });
    l.record("setCustomItem", { item: { ...locket, name: "Mother's locket", requiresAttunement: false } });
    expect(l.character.customItems).toHaveLength(1);
    expect(l.character.customItems[0]!.name).toBe("Mother's locket");
    expect(l.character.inventory.filter((i) => i.item === customItemId("lk1"))).toHaveLength(1);
    expect(l.character.inventory.find((i) => i.id === "i1")!.attuned).toBe(false);
  });

  it("removing one from the inventory keeps the item to add again; deleting it takes every copy away", () => {
    const l = log();
    l.record("setCustomItem", { item: locket, instanceId: "i1" });
    l.record("removeItem", { instanceId: "i1" });
    expect(l.character.customItems).toHaveLength(1);
    l.record("addItem", { instanceId: "i3", item: customItemId("lk1"), quantity: 1 });
    l.record("addItem", { instanceId: "i4", item: customItemId("lk1"), quantity: 1 });
    expect(derive(l.character, reg).ac.total).toBeGreaterThan(0);
    l.record("removeCustomItem", { id: "lk1" });
    expect(l.character.customItems).toEqual([]);
    expect(l.character.inventory.some((i) => i.item === customItemId("lk1"))).toBe(false);
    // Undo brings it back, copies and all.
    l.undo();
    expect(l.character.inventory.filter((i) => i.item === customItemId("lk1"))).toHaveLength(2);
  });

  it("a character saved before custom items opens as before", () => {
    const old = JSON.parse(JSON.stringify(make()));
    delete old.customItems;
    expect(Character.parse(old).customItems).toEqual([]);
  });
});

describe("Notes with an in-world date", () => {
  it("keeps the in-world moment, moves it, and clears it", () => {
    const l = log();
    l.record("addNote", { title: "Met the harbourmaster", body: "- paid **5 gp**", category: "none", session: 3, gameDate: "Day", gameMinutes: 1000 });
    const id = l.character.notes[0]!.id;
    expect(l.character.notes[0]).toMatchObject({ gameMinutes: 1000, gameDate: "Day", session: 3 });
    l.record("updateNote", { id, gameDate: "Later", gameMinutes: 5000 });
    expect(l.character.notes[0]).toMatchObject({ gameMinutes: 5000, gameDate: "Later", title: "Met the harbourmaster" });
    l.record("updateNote", { id, gameDate: null, gameMinutes: null });
    expect(l.character.notes[0]!.gameMinutes).toBeUndefined();
    expect(l.character.notes[0]!.gameDate).toBeUndefined();
    expect(reloaded(l).replayed.notes[0]).toEqual(l.character.notes[0]);
  });

  it("an older note (date as text only) still reads", () => {
    const c = JSON.parse(JSON.stringify(make()));
    c.notes = [{ id: "n", category: "none", title: "Old", body: "plain\ntext", pinned: false, gameDate: "Πέρια, 25 Δανάη 521 ΜΣ, 20:30" }];
    expect(Character.parse(c).notes[0]).toMatchObject({ body: "plain\ntext", gameDate: "Πέρια, 25 Δανάη 521 ΜΣ, 20:30" });
  });
});
