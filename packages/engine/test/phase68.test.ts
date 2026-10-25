import { describe, expect, it } from "vitest";
import { Character } from "@dnd/schema";
import { derive } from "../src/derive.js";
import { buildItems } from "../src/build.js";
import { tableRegistry } from "./helpers.js";

const reg = tableRegistry();
const pc = (classes: { class: string; level: number; subclass?: string }[], extra: Record<string, unknown> = {}, abilities = { str: 10, dex: 16, con: 14, int: 10, wis: 14, cha: 18 }) =>
  Character.parse({ id: "p", schemaVersion: 1, ruleset: "5e-2014", name: "P", abilities, race: "race:human", classes, hp: { current: 30, temp: 0 }, ...extra });
const sheet = (...a: Parameters<typeof pc>) => derive(pc(...a), reg);
const weapon = (item: string) => ({ inventory: [{ id: "w", item, quantity: 1, equipped: true, attuned: false }] });

describe("13c: Magical Secrets", () => {
  const bard = (level: number, choices: Record<string, unknown> = {}) => pc([{ class: "class:bard", level }], { choices });
  const asks = (c: Character) => buildItems(c, reg).filter((i) => /Magical Secrets/.test(i.label)).map((i) => [i.label, i.need, i.slotMax]);
  it("two picks at 10th, two more at 14th and at 18th, any class's spells up to the highest slot", () => {
    expect(asks(bard(9))).toEqual([]);
    expect(asks(bard(10))).toEqual([["Magical Secrets (10th)", 2, 5]]);
    expect(asks(bard(18)).map((x) => x[0])).toEqual(["Magical Secrets (10th)", "Magical Secrets (14th)", "Magical Secrets (18th)"]);
  });
  it("a picked spell is a bard spell, and the picks are among the spells known", () => {
    const c = bard(10, { "feature:magical-secrets-1": { spells: ["spell:fireball", "spell:counterspell"] } });
    const s = derive(c, reg);
    expect(s.spells.filter((x) => x.list?.id === "bard" && ["spell:fireball", "spell:counterspell"].includes(x.id)).length).toBe(2);
    // The bard table's 14 known at 10th: 12 left to pick there.
    expect(buildItems(c, reg).find((i) => i.key === "class:bard|known")?.need).toBe(12);
  });
  it("Additional Magical Secrets (Lore 6th): two more, not counted among the spells known", () => {
    const c = pc([{ class: "class:bard", level: 6, subclass: "subclass:lore" }]);
    expect(asks(c)).toEqual([["Additional Magical Secrets", 2, 3]]);
    expect(buildItems(c, reg).find((i) => i.key === "class:bard|known")?.need).toBe(9);
  });
});

describe("13c: bard features", () => {
  it("Peerless Skill: the Bardic Inspiration die on any ability check, spending a use", () => {
    const s = sheet([{ class: "class:bard", level: 15, subclass: "subclass:lore" }]);
    expect(s.skills.arcana.suggestions.find((x) => x.label === "Peerless Skill")).toMatchObject({ apply: { dice: ["1d12"] }, spends: { resource: "bardic-inspiration", amount: 1 } });
    expect(sheet([{ class: "class:bard", level: 13, subclass: "subclass:lore" }]).skills.arcana.suggestions.some((x) => x.label === "Peerless Skill")).toBe(false);
  });
  it("Countercharm: an action that switches on advantage against charm and fright for a round", () => {
    const off = sheet([{ class: "class:bard", level: 6 }]);
    expect(off.actions.find((a) => a.id === "countercharm")).toMatchObject({ economy: "action", toggles: ["countercharm"] });
    expect(off.saves.wis.suggestions.some((x) => x.label === "Countercharm")).toBe(false);
    const on = sheet([{ class: "class:bard", level: 6 }], { toggles: ["countercharm"] });
    expect(on.saves.wis.suggestions.find((x) => x.label === "Countercharm")).toMatchObject({ apply: { mode: "advantage" } });
    expect(on.toggles.find((t) => t.name === "countercharm")?.reminders?.[0]).toMatch(/frightened or charmed/);
  });
});

describe("13c: rogue and ranger", () => {
  const soulknife = (level: number) => sheet([{ class: "class:rogue", level, subclass: "subclass:soulknife" }]);
  it("Soul Blades: Homing Strikes on Psychic Blade attacks, and Psychic Teleportation", () => {
    const s = soulknife(9);
    const blade = s.attacks.find((a) => a.attackId === "attack:psychic-blade" && a.mode === "melee")!;
    expect(blade.attack.suggestions.find((x) => x.label === "Homing Strikes")).toMatchObject({ apply: { dice: ["1d8"] }, spends: { resource: "psionic-energy" } });
    expect(s.actions.find((a) => a.id === "psychic-teleportation")).toMatchObject({ economy: "bonus", cost: { resource: "psionic-energy", amount: 1 } });
    expect(soulknife(8).actions.some((a) => a.id === "psychic-teleportation")).toBe(false);
  });
  it("Primeval Awareness and Hide in Plain Sight (+10 Stealth while it's on)", () => {
    const opt = { optionalOff: ["feature:primal-awareness", "feature:natures-veil"] };
    expect(sheet([{ class: "class:ranger", level: 3 }], opt).actions.some((a) => a.id === "primeval-awareness")).toBe(true);
    const base = sheet([{ class: "class:ranger", level: 10 }], opt).skills.stealth.total;
    expect(sheet([{ class: "class:ranger", level: 10 }], { ...opt, toggles: ["hide-in-plain-sight"] }).skills.stealth.total).toBe(base + 10);
  });
});

describe("13c: Hex Warrior", () => {
  const hex = (item: string, extra: Record<string, unknown> = {}) =>
    sheet([{ class: "class:warlock", level: 3, subclass: "subclass:the-hexblade" }], { ...weapon(item), ...extra }, { str: 12, dex: 10, con: 14, int: 10, wis: 10, cha: 18 });
  it("Charisma instead of Strength as an option on the weapon's attack and damage", () => {
    const ls = hex("item:longsword").attacks.find((a) => a.name === "Longsword")!;
    expect(ls.attack.suggestions.find((x) => x.label === "Hex Warrior")).toMatchObject({ apply: { flat: 3 } });
    expect(ls.damage.bonus.suggestions.find((x) => x.label === "Hex Warrior")).toMatchObject({ apply: { flat: 3 } });
    // The old note is gone.
    expect(ls.attack.notes?.some((n) => /Hex Warrior/.test(n)) ?? false).toBe(false);
  });
  it("not on a two-handed weapon, unless it's your pact weapon", () => {
    expect(hex("item:greatsword").attacks.find((a) => a.name === "Greatsword")!.attack.suggestions.some((x) => x.label === "Hex Warrior")).toBe(false);
    const blade = hex("item:greatsword", { choices: { "feature:pact-boon": { option: ["feature:pact-of-the-blade"] } } });
    expect(blade.attacks.find((a) => a.name === "Greatsword")!.attack.suggestions.find((x) => x.label === "Hex Warrior")?.reason).toMatch(/pact weapon/);
  });
});

describe("13c: feats", () => {
  const feat = (id: string, extra: Record<string, unknown> = {}, choices: Record<string, unknown> = {}) =>
    sheet([{ class: "class:fighter", level: 4 }], { feats: [{ feat: id, from: "Level 4 Ability Score Improvement" }], choices: { [id]: choices }, ...extra });
  it("Elven Accuracy: a flag for three d20s on attacks that don't use Strength", () => {
    const s = feat("feat:elven-accuracy", { ...weapon("item:rapier"), inventory: [{ id: "r", item: "item:rapier", quantity: 1, equipped: true, attuned: false }, { id: "m", item: "item:maul", quantity: 1, equipped: false, attuned: false }] }, { ability: ["dex"] });
    expect(s.attacks.find((a) => a.name === "Rapier")!.attack.tripleAdvantage).toBe("Elven Accuracy");
    expect(s.attacks.find((a) => a.name === "Maul")!.attack.tripleAdvantage).toBeUndefined();
    expect(sheet([{ class: "class:fighter", level: 4 }], weapon("item:rapier")).attacks.find((a) => a.name === "Rapier")!.attack.tripleAdvantage).toBeUndefined();
  });
  it("Piercer: an extra die on a critical hit with piercing weapons only", () => {
    const s = feat("feat:piercer", { inventory: [{ id: "r", item: "item:rapier", quantity: 1, equipped: true, attuned: false }, { id: "m", item: "item:maul", quantity: 1, equipped: false, attuned: false }] }, { ability: ["dex"] });
    expect(s.attacks.find((a) => a.name === "Rapier")!.damage.critExtraDice).toEqual([{ label: "Piercer", value: 1 }]);
    expect(s.attacks.find((a) => a.name === "Maul")!.damage.critExtraDice).toEqual([]);
  });
});

describe("13c: Gift of the Ever-Living Ones", () => {
  const gift = (on: boolean) =>
    sheet([{ class: "class:warlock", level: 3 }], { choices: { "feature:pact-boon": { option: ["feature:pact-of-the-chain"] }, "feature:eldritch-invocations": { invocations: ["feature:invocation-gift-of-the-ever-living-ones"] } }, toggles: on ? ["ever-living-near"] : [] });
  it("a switch for the familiar being near; on, your own healing of yourself is the maximum", () => {
    const off = gift(false);
    expect(off.toggles.find((t) => t.name === "ever-living-near")?.label).toBe("Familiar within 100 ft (Gift of the Ever-Living Ones)");
    expect(off.selfMaxHealing).toBeUndefined();
    expect(gift(true).selfMaxHealing).toBe("Gift of the Ever-Living Ones");
  });
});

describe("13c: Elven Accuracy on spells, and Flames of Phlegethos", () => {
  const wiz = (feat: string, choice: string) =>
    sheet([{ class: "class:wizard", level: 4 }], { feats: [{ feat, from: "Level 4 Ability Score Improvement" }], choices: { [feat]: { ability: [choice] } }, spells: [{ spell: "spell:fire-bolt", list: "wizard" }, { spell: "spell:ray-of-frost", list: "wizard" }] }, { str: 8, dex: 14, con: 14, int: 18, wis: 10, cha: 10 });
  it("a spell attack gets the three-d20 flag", () => {
    expect(wiz("feat:elven-accuracy", "int").spells.find((x) => x.id === "spell:fire-bolt")?.attack?.tripleAdvantage).toBe("Elven Accuracy");
  });
  it("rerolling 1s once on fire spell damage, not on other types", () => {
    const s = wiz("feat:flames-of-phlegethos", "int");
    expect(s.spells.find((x) => x.id === "spell:fire-bolt")?.damageBonus?.suggestions.find((x) => x.label === "Flames of Phlegethos")).toMatchObject({ apply: { rerollAtOrBelow: 1 } });
    expect(s.spells.find((x) => x.id === "spell:ray-of-frost")?.damageBonus?.suggestions.some((x) => x.label === "Flames of Phlegethos")).toBe(false);
  });
});

describe("13c: uses once every N days", () => {
  it("Divine Intervention: 7 days after it works (a roll at or under the cleric level); always at 20th", () => {
    const di = sheet([{ class: "class:cleric", level: 12 }]).actions.find((a) => a.id === "divine-intervention");
    expect([di?.everyDays, di?.everyDaysIfRollAtMost]).toEqual([7, 12]);
    const sure = sheet([{ class: "class:cleric", level: 20 }]).actions.find((a) => a.id === "divine-intervention-sure");
    expect([sure?.everyDays, sure?.everyDaysIfRollAtMost]).toEqual([7, undefined]);
  });
});
