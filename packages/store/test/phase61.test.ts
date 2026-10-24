import { describe, expect, it } from "vitest";
import { derive, newCharacter } from "@dnd/engine";
import { composeDamage, rollComposed } from "@dnd/dice";
import { tableRegistry } from "../../engine/test/helpers.js";
import { CharacterLog } from "../src/log.js";
import { HybridClock } from "../src/clock.js";

const reg = tableRegistry();
let t = 1_799_000_000_000;
const book = (c: ReturnType<typeof newCharacter>) => {
  for (const sp of ["fireball", "fire-bolt", "meteor-swarm"]) c.spells.push({ spell: `spell:${sp}`, list: "wizard", prepared: true });
};
const make = (cls: string, level: number, subclass?: string, extra: (c: ReturnType<typeof newCharacter>) => void = () => {}) => {
  const c = newCharacter({ id: "p", name: "Test", race: "race:human", class: cls, abilities: { str: 16, dex: 14, con: 14, int: 16, wis: 14, cha: 16 } }, reg);
  c.classes[0] = { ...c.classes[0]!, level, ...(subclass ? { subclass } : {}) };
  extra(c);
  return new CharacterLog(c, reg, new HybridClock("t", () => (t += 1000)), "player");
};
const spell = (l: CharacterLog, id: string) => derive(l.character, reg).spells.find((s) => s.id === id)!;

describe("11c: barbarians", () => {
  it("Frenzy: a level of exhaustion when the rage ends", () => {
    const l = make("class:barbarian", 3, "subclass:berserker");
    l.record("useAction", { action: "rage" });
    l.record("useAction", { action: "frenzy" });
    expect(l.character.toggles).toEqual(expect.arrayContaining(["raging", "frenzied"]));
    expect(l.record("toggle", { name: "raging", on: false }).join(" ")).toMatch(/Frenzy: .*exhaustion/);
    expect(l.character.effects.find((e) => e.effect === "condition:exhaustion")?.level).toBe(1);
    expect(l.character.toggles).not.toContain("frenzied");
  });
  it("Rage Beyond Death: conscious at 0 while raging; the rage ending there kills", () => {
    const l = make("class:barbarian", 14, "subclass:path-of-the-zealot", (c) => {
      c.toggles.push("raging");
      c.hp.current = 3;
    });
    expect(l.record("damage", { amount: 10 }).join(" ")).toMatch(/Rage Beyond Death/);
    expect(derive(l.character, reg).featureTags.find((x) => x.name === "Rage Beyond Death")).toBeTruthy();
    l.record("toggle", { name: "raging", on: false });
    expect(l.character.deathSaves.failures).toBe(3);
    expect(l.lastPrompts.some((p) => p.kind === "dead")).toBe(true);
  });
  it("totem and storm tags while raging", () => {
    const l = make("class:barbarian", 14, "subclass:path-of-the-totem-warrior", (c) => {
      c.choices["feature:path-of-the-totem-warrior-totem-spirit"] = { totem: ["feature:path-of-the-totem-warrior-totem-spirit-wolf"] };
      c.choices["feature:path-of-the-totem-warrior-totemic-attunement"] = { attunement: ["feature:path-of-the-totem-warrior-attunement-bear"] };
    });
    expect(derive(l.character, reg).featureTags.map((x) => x.name)).not.toContain("Wolf Spirit");
    l.record("useAction", { action: "rage" });
    expect(derive(l.character, reg).featureTags.map((x) => x.name)).toEqual(expect.arrayContaining(["Wolf Spirit", "Bear Attunement"]));
  });
});

describe("11c: casters", () => {
  it("Empowered Evocation on evocation damage; Potent Cantrip's note", () => {
    const l = make("class:wizard", 10, "subclass:evocation", book);
    expect(spell(l, "spell:fireball").damageBonus?.suggestions.find((x) => x.label === "Empowered Evocation")?.apply.flat).toBe(3);
    expect(spell(l, "spell:fire-bolt").damageBonus?.notes?.join(" ")).toMatch(/Potent Cantrip/);
    expect(spell(l, "spell:fire-bolt").damageBonus?.suggestions.some((x) => x.label === "Empowered Evocation")).toBe(true);
  });
  it("Overchannel: maximum dice, free the first time, then the backlash is named", () => {
    const l = make("class:wizard", 14, "subclass:evocation", book);
    const fb = spell(l, "spell:fireball").damageBonus!;
    const oc = fb.suggestions.find((x) => x.label === "Overchannel")!;
    expect(oc.reason).toMatch(/costs nothing/);
    const r = rollComposed(composeDamage("8d6", "fire", fb, { enabled: ["Overchannel"], manual: "none", extra: 0 }));
    expect(r.result.total).toBe(48);
    expect(spell(l, "spell:meteor-swarm")?.damageBonus?.suggestions.some((x) => x.label === "Overchannel") ?? false).toBe(false);
    l.record("spendResource", { resource: "overchannel", amount: 1 });
    expect(spell(l, "spell:fireball").damageBonus!.suggestions.find((x) => x.label === "Overchannel")!.reason).toMatch(/2d12 necrotic per spell level/);
  });
  it("Dark One's Blessing temp HP; Hurl Through Hell's 10d10", () => {
    const s = derive(make("class:warlock", 14, "subclass:fiend").character, reg);
    expect(s.actions.find((a) => a.id === "dark-ones-blessing")?.tempHp?.flat).toBe(17);
    expect(s.actions.find((a) => a.id === "hurl-through-hell")?.roll?.text).toBe("10d10");
  });
  it("Draconic Presence costs 5 sorcery points with a Wisdom DC", () => {
    const a = derive(make("class:sorcerer", 18, "subclass:draconic").character, reg).actions.find((x) => x.id === "draconic-presence")!;
    expect(a.cost?.amount).toBe(5);
    expect(a.dc?.save).toMatch(/Wisdom/);
  });
});

describe("11c: others", () => {
  it("Combat Inspiration gives the Valor die, which also goes on weapon damage", () => {
    const s = derive(make("class:bard", 3, "subclass:college-of-valor").character, reg);
    expect(s.actions.find((a) => a.id === "bardic-inspiration")?.gives?.effect).toBe("other:bardic-inspiration-valor");
    const l = make("class:fighter", 3, undefined, (c) => c.effects.push({ id: "v", effect: "other:bardic-inspiration-valor", choice: "d8", minutes: 10 }));
    l.character.inventory.push({ id: "ls", item: "item:longsword", quantity: 1, equipped: true, attuned: false });
    const ls = derive(l.character, reg).attacks.find((a) => a.name === "Longsword")!;
    expect(ls.damage.bonus.suggestions.find((x) => x.label === "Bardic Inspiration")?.apply.dice).toEqual(["1d8"]);
  });
  it("Rapid Strike gives one more attack; Scornful Rebuke rolls Charisma", () => {
    const l = make("class:fighter", 15, "subclass:samurai");
    l.record("startCombat", {});
    l.record("startTurn", {});
    l.record("useEconomy", { kind: "attack" });
    const before = l.character.combat!.attacks;
    l.record("useAction", { action: "rapid-strike" });
    expect(l.character.combat!.attacks).toBe(before - 1);
    expect(derive(make("class:paladin", 15, "subclass:oath-of-conquest").character, reg).actions.find((a) => a.id === "scornful-rebuke")?.roll?.flat).toBe(3);
  });
  it("Holy Nimbus: a 1-minute switch with advantage on saves against fiends' and undead's spells", () => {
    const l = make("class:paladin", 20, "subclass:devotion");
    l.record("useAction", { action: "holy-nimbus" });
    const s = derive(l.character, reg);
    expect(s.saves.wis.suggestions.some((x) => x.label === "Holy Nimbus")).toBe(true);
    expect(s.toggles.find((x) => x.name === "holy-nimbus")?.reminders?.join(" ")).toMatch(/10 radiant/);
  });
  it("Supreme Sneak, Fungal Body, Magic Arrow, Order's Wrath", () => {
    expect(derive(make("class:rogue", 9, "subclass:thief").character, reg).skills.stealth.suggestions.some((x) => x.label === "Supreme Sneak")).toBe(true);
    expect(derive(make("class:druid", 14, "subclass:circle-of-spores").character, reg).defenses.immune).toEqual(expect.arrayContaining(["blinded", "poisoned"]));
    const aa = make("class:fighter", 7, "subclass:arcane-archer");
    aa.character.inventory.push({ id: "lb", item: "item:longbow", quantity: 1, equipped: true, attuned: false });
    expect(derive(aa.character, reg).attacks.find((a) => a.name === "Longbow")?.attack.notes?.join(" ")).toMatch(/Magic Arrow/);
    expect(reg.find("other:orders-wrath", "effect")?.modifiers?.[0]?.value).toBe("2d8");
  });
  it("Starry Form: the constellation picked; Twinkling Constellations' Dragon flight and change", () => {
    const l = make("class:druid", 10, "subclass:circle-of-stars");
    l.record("useAction", { action: "starry-form", choice: "Dragon" });
    let s = derive(l.character, reg);
    expect(l.character.toggles).toContain("starry-form-dragon");
    expect(s.speeds.find((x) => x.mode === "fly")).toMatchObject({ hover: true });
    expect(s.skills.arcana.minD20).toBe(10);
    l.record("useAction", { action: "starry-form-change", choice: "Archer" });
    s = derive(l.character, reg);
    expect(l.character.toggles).toContain("starry-form-archer");
    expect(l.character.toggles).not.toContain("starry-form-dragon");
    expect(s.speeds.find((x) => x.mode === "fly")).toBeUndefined();
  });
});
