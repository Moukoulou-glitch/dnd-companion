import { describe, expect, it } from "vitest";
import { Character } from "@dnd/schema";
import { derive } from "../src/derive.js";
import { expandedSpellLists } from "../src/expanded.js";
import { buildItems } from "../src/build.js";
import { tableRegistry } from "./helpers.js";

const reg = tableRegistry();
const pc = (classes: { class: string; level: number; subclass?: string }[], extra: Record<string, unknown> = {}, abilities = { str: 16, dex: 12, con: 14, int: 10, wis: 16, cha: 16 }) =>
  Character.parse({ id: "p", schemaVersion: 1, ruleset: "5e-2014", name: "P", abilities, race: "race:human", classes, hp: { current: 30, temp: 0 }, ...extra });
const granted = (c: Character) => derive(c, reg).spells.filter((s) => s.fromFeature).map((s) => s.id);

describe("13a: Circle of the Land, one land", () => {
  const land = (level: number, pick?: string, more: Record<string, unknown> = {}) =>
    pc([{ class: "class:druid", level, subclass: "subclass:land" }], { choices: { ...(pick ? { "feature:circle-of-the-land": { option: [pick] } } : {}), ...more } });
  it("only the chosen land's spells, as the druid's level reaches them", () => {
    const arctic9 = granted(land(9, "feature:circle-of-the-land-arctic"));
    expect(arctic9.sort()).toEqual(["spell:commune-with-nature", "spell:cone-of-cold", "spell:freedom-of-movement", "spell:hold-person", "spell:ice-storm", "spell:sleet-storm", "spell:slow", "spell:spike-growth"].sort());
    // Not another land's (Coast's Misty Step).
    expect(arctic9).not.toContain("spell:misty-step");
    expect(granted(land(5, "feature:circle-of-the-land-arctic")).sort()).toEqual(["spell:hold-person", "spell:sleet-storm", "spell:slow", "spell:spike-growth"]);
    expect(granted(land(3, "feature:circle-of-the-land-underdark")).sort()).toEqual(["spell:spider-climb", "spell:web"]);
  });
  it("no land picked: no circle spells, and the sheet asks for the pick", () => {
    const c = land(9);
    expect(granted(c)).toEqual([]);
    expect(buildItems(c, reg).some((i) => !i.done && /land/i.test(i.label))).toBe(true);
    expect(buildItems(land(9, "feature:circle-of-the-land-arctic"), reg).some((i) => !i.done && /land/i.test(i.label))).toBe(false);
  });
  it("the bonus cantrip is a pick from the druid cantrips", () => {
    const c = land(2, "feature:circle-of-the-land-forest", { "feature:bonus-cantrip": { cantrip: ["spell:shillelagh"] } });
    expect(derive(c, reg).spells.some((s) => s.id === "spell:shillelagh")).toBe(true);
  });
});

describe("13a: warlock patrons' expanded spell lists", () => {
  const wl = (sub: string, choices: Record<string, unknown> = {}) => expandedSpellLists(pc([{ class: "class:warlock", level: 5, subclass: sub }], { choices }), reg).get("warlock") ?? new Set<string>();
  it("each patron's spells join the warlock list", () => {
    expect(wl("subclass:the-archfey").has("spell:faerie-fire")).toBe(true);
    expect(wl("subclass:fiend").has("spell:burning-hands")).toBe(true);
    expect(wl("subclass:the-celestial").has("spell:cure-wounds")).toBe(true);
    expect(wl("subclass:the-hexblade").has("spell:shield")).toBe(true);
    expect(wl("subclass:the-great-old-one").has("spell:hideous-laughter")).toBe(true);
    expect(wl("subclass:the-undead").has("spell:false-life")).toBe(true);
    expect(wl("subclass:the-fathomless").has("spell:thunderwave")).toBe(true);
    expect(wl("subclass:the-archfey").has("spell:burning-hands")).toBe(false);
  });
  it("the Genie's spells: shared, plus the picked kind's", () => {
    expect(wl("subclass:the-genie").has("spell:wish")).toBe(true);
    expect(wl("subclass:the-genie").has("spell:fireball")).toBe(false);
    expect(wl("subclass:the-genie", { "feature:genie-expanded-spells": { kind: ["feature:genie-kind-efreeti"] } }).has("spell:fireball")).toBe(true);
  });
  it("a patron's list doesn't bring in Tasha's book variants (only the optional feature does)", () => {
    const local = reg.overlay([{ kind: "spell", id: "spell:test-variant", name: "Test Variant", source: { pack: "test" }, level: 1, school: "Evocation", castingTime: "1 action", range: "Self", components: ["V"], duration: "Instantaneous", concentration: false, ritual: false, classes: ["wizard"], optionalClasses: ["warlock"] } as never]);
    const c = pc([{ class: "class:warlock", level: 5, subclass: "subclass:the-archfey" }], { optionalOff: ["feature:warlock-additional-warlock-spells"] });
    expect(expandedSpellLists(c, local).get("warlock")?.has("spell:faerie-fire")).toBe(true);
    expect(expandedSpellLists(c, local).get("warlock")?.has("spell:test-variant")).toBe(false);
  });
});

describe("13a: Channel Divinity from two classes", () => {
  it("one pool, with the uses of the class that grants more; the other class's actions spend it", () => {
    const s = derive(pc([{ class: "class:cleric", level: 2 }, { class: "class:paladin", level: 3, subclass: "subclass:devotion" }]), reg);
    const cd = s.resources.filter((r) => /channel-divinity/.test(r.id));
    expect(cd.map((r) => [r.id, r.max])).toEqual([["channel-divinity", 1]]);
    expect(s.resourceAliases).toEqual({ "channel-divinity-paladin": "channel-divinity" });
    const sacred = s.actions.find((a) => a.id === "sacred-weapon" || /Sacred Weapon/.test(a.name));
    expect(sacred?.cost?.resource).toBe("channel-divinity");
    const six = derive(pc([{ class: "class:cleric", level: 6 }, { class: "class:paladin", level: 3, subclass: "subclass:devotion" }]), reg);
    expect(six.resources.find((r) => r.id === "channel-divinity")?.max).toBe(2);
  });
  it("uses already recorded under the paladin's pool count in the shared one", () => {
    const s = derive(pc([{ class: "class:cleric", level: 6 }, { class: "class:paladin", level: 3, subclass: "subclass:devotion" }], { resourcesUsed: { "channel-divinity-paladin": 1 } }), reg);
    expect(s.resources.find((r) => r.id === "channel-divinity")?.remaining).toBe(1);
  });
  it("one class alone keeps its own pool", () => {
    const s = derive(pc([{ class: "class:paladin", level: 3, subclass: "subclass:devotion" }]), reg);
    expect(s.resources.some((r) => r.id === "channel-divinity-paladin")).toBe(true);
    expect(s.resourceAliases).toBeUndefined();
  });
});

describe("13a: Primal Champion", () => {
  it("+4 Strength and Constitution at barbarian 20th, up to 24, no warning", () => {
    const s = derive(pc([{ class: "class:barbarian", level: 20 }], {}, { str: 19, dex: 12, con: 17, int: 10, wis: 10, cha: 10 }), reg);
    // Human: +1 to each; Primal Champion: +4.
    expect([s.abilities.str.score.total, s.abilities.con.score.total, s.abilities.str.max]).toEqual([24, 22, 24]);
    expect(s.warnings.some((w) => /Strength is|Constitution is/.test(w))).toBe(false);
    expect(derive(pc([{ class: "class:barbarian", level: 19 }], {}, { str: 19, dex: 12, con: 17, int: 10, wis: 10, cha: 10 }), reg).abilities.str.score.total).toBe(20);
  });
});

describe("13a-2: Genie's Wrath takes the genie kind's damage type", () => {
  const genie = (kind?: string) =>
    derive(
      pc([{ class: "class:warlock", level: 3, subclass: "subclass:the-genie" }], {
        inventory: [{ id: "d", item: "item:dagger", quantity: 1, equipped: true, attuned: false }],
        ...(kind ? { choices: { "feature:genie-expanded-spells": { kind: [`feature:genie-kind-${kind}`] } } } : {}),
      }),
      reg,
    );
  const wrath = (s: ReturnType<typeof derive>) => s.attacks.flatMap((a) => a.damage.bonus.suggestions).find((x) => /Genie's Wrath/.test(x.label));
  it("fire for an efreeti, cold for a marid; offered once per turn on a hit", () => {
    expect(wrath(genie("efreeti"))?.apply.damageType).toBe("fire");
    expect(wrath(genie("marid"))?.apply.damageType).toBe("cold");
    expect(wrath(genie("dao"))?.apply.damageType).toBe("bludgeoning");
    expect(wrath(genie("djinni"))?.apply.damageType).toBe("thunder");
  });
  it("no kind picked yet: no Genie's Wrath (the Choices list asks for the kind)", () => {
    expect(wrath(genie())).toBeUndefined();
  });
});
