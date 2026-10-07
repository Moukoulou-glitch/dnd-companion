import { describe, expect, it } from "vitest";
import { derive } from "@dnd/engine";
import { CharacterLog } from "../src/log.js";
import { HybridClock } from "../src/clock.js";
import { loadCharacter, tableRegistry } from "../../engine/test/helpers.js";

const reg = tableRegistry();
function logFor(name: string) {
  let t = 1_700_000_000_000;
  return new CharacterLog(loadCharacter(name), reg, new HybridClock("test", () => (t += 1000)), "player");
}
const sheetOf = (log: CharacterLog) => derive(log.character, reg);

describe("using features", () => {
  it("each character's usable features are listed with cost and uses left", () => {
    const names = (n: string) => sheetOf(logFor(n)).actions.map((a) => a.name);
    expect(names("agaklis")).toEqual(
      expect.arrayContaining(["Rage", "Ancestral Protectors", "Spirit Shield", "Ignite Flame Tongue"]),
    );
    expect(names("beren")).toEqual(expect.arrayContaining(["Fey Step", "Favored Foe", "Command companion", "Magic Initiate spell (free)"]));
    const dread = sheetOf(logFor("elissaios")).actions.find((a) => a.id === "form-of-dread")!;
    expect(dread.cost).toEqual({ resource: "form-of-dread", name: "Form of Dread", amount: 1, remaining: 3 });
    expect(dread.tempHp).toEqual({ dice: ["1d10"], flat: 1, text: "1d10 + 1" });
  });

  it("Rage spends a use and switches raging on, so the damage bonus appears", () => {
    const log = logFor("agaklis");
    log.record("useAction", { action: "rage" });
    const s = sheetOf(log);
    expect(log.character.resourcesUsed["rage"]).toBe(1);
    expect(log.character.toggles).toContain("raging");
    expect(s.attacks.find((a) => a.name === "Warhammer")!.damage.bonus.total).toBe(7);
  });

  it("Form of Dread records its rolled temp HP, so replay and undo are exact", () => {
    const log = logFor("elissaios");
    expect(log.record("useAction", { action: "form-of-dread", rolled: 8 })).toEqual(["8 temporary HP."]);
    expect(log.character.hp.temp).toBe(8);
    expect(log.character.resourcesUsed["form-of-dread"]).toBe(2);
    log.undo();
    expect(log.character.hp.temp).toBe(0);
    expect(log.character.resourcesUsed["form-of-dread"]).toBe(1);
  });

  it("using a feature with no uses left warns but still records it", () => {
    const log = logFor("beren");
    log.record("useAction", { action: "fey-step" });
    expect(log.record("useAction", { action: "fey-step" })).toEqual(["Fey Step: none left. Used anyway."]);
    expect(log.character.resourcesUsed["fey-step"]).toBe(1);
  });

  it("Favored Foe marks a target and then offers +1d4 on damage", () => {
    const log = logFor("beren");
    const bow = () => sheetOf(log).attacks.find((a) => a.name === "Vicious Longbow")!;
    expect(bow().damage.bonus.suggestions.map((s) => s.label)).not.toContain("Favored Foe");
    log.record("useAction", { action: "favored-foe" });
    expect(bow().damage.bonus.suggestions).toContainEqual(expect.objectContaining({ label: "Favored Foe", effect: "+1d4" }));
  });

  it("igniting the Flame Tongue costs nothing and adds its fire", () => {
    const log = logFor("agaklis");
    log.record("useAction", { action: "ignite-flame-tongue" });
    const sword = sheetOf(log).attacks.find((a) => a.name === "Flame Tongue Shortsword")!;
    expect(sword.damage.bonus.dice).toEqual([{ label: "Flame Tongue (lit)", dice: "2d6", damageType: "fire" }]);
  });
});

describe("inventory", () => {
  it("taking off armor changes AC; wearing other armor takes the first off", () => {
    const log = logFor("elissaios");
    expect(sheetOf(log).ac.total).toBe(15);
    log.record("setItem", { instanceId: "i5", equipped: false });
    expect(sheetOf(log).ac.total).toBe(14);
    log.record("addItem", { instanceId: "new-armor", item: "item:leather-armor" });
    log.record("setItem", { instanceId: "i5", equipped: true });
    expect(log.record("setItem", { instanceId: "new-armor", equipped: true })).toEqual(["Leather Armor taken off."]);
    expect(log.character.inventory.filter((i) => i.equipped && i.item === "item:leather-armor")).toHaveLength(1);
  });

  it("Stefanor's Shield raises AC by 2 when equipped", () => {
    const log = logFor("agaklis");
    log.record("setItem", { instanceId: "i5", equipped: true });
    expect(sheetOf(log).ac.total).toBe(17);
  });

  it("unattuning the Stone of Good Luck removes its +1 everywhere", () => {
    const log = logFor("aristotelis");
    log.record("setItem", { instanceId: "i5", attuned: false });
    const s = sheetOf(log);
    expect(s.saves.int.total).toBe(6);
    expect(s.skills.arcana.total).toBe(6);
  });

  it("a fourth attunement is allowed with a warning", () => {
    const log = logFor("elissaios");
    log.record("addItem", { instanceId: "a", item: "item:stone-of-good-luck" });
    log.record("addItem", { instanceId: "b", item: "item:natures-mantle" });
    log.record("setItem", { instanceId: "a", attuned: true, equipped: true });
    expect(log.record("setItem", { instanceId: "b", attuned: true })).toEqual(["4 items attuned; the limit is 3."]);
    expect(sheetOf(log).warnings).toContain("4 items attuned; the limit is 3.");
  });

  it("quantities and removal", () => {
    const log = logFor("beren");
    log.record("setItem", { instanceId: "i4", quantity: 50 });
    expect(log.character.inventory.find((i) => i.id === "i4")!.quantity).toBe(50);
    log.record("removeItem", { instanceId: "i7" });
    expect(log.character.inventory.some((i) => i.id === "i7")).toBe(false);
  });

  it("currency can't go below zero", () => {
    const log = logFor("beren");
    log.record("adjustCurrency", { coin: "gp", delta: 25 });
    expect(log.character.currency.gp).toBe(34);
    expect(log.record("adjustCurrency", { coin: "sp", delta: -10 })).toEqual(["Only 7 sp. Set to 0."]);
    expect(log.character.currency.sp).toBe(0);
  });
});
