import { describe, expect, it } from "vitest";
import { bookPack, classSpellOptions, derive, newCharacter, spellListOf } from "@dnd/engine";
import { tableRegistry } from "../../engine/test/helpers.js";
import { CharacterLog } from "../src/log.js";
import { HybridClock } from "../src/clock.js";

const reg = tableRegistry();
let t = 1_797_000_000_000;
const log = (c: ReturnType<typeof newCharacter>, r = reg) => new CharacterLog(c, r, new HybridClock("t", () => (t += 1000)), "player");
const make = (cls: string, level: number) => {
  const c = newCharacter({ id: cls, name: "X", race: "race:human", class: `class:${cls}`, abilities: { str: 10, dex: 14, con: 14, int: 16, wis: 16, cha: 10 } }, reg);
  c.classes[0] = { ...c.classes[0]!, level };
  return c;
};

describe("Tasha's expanded spell lists", () => {
  it("Additional Druid Spells puts Revivify on the druid list while it's on, and takes it off when it's off", () => {
    const l = log(make("druid", 5));
    const has = () => derive(l.character, reg).spells.some((s) => s.id === "spell:revivify" && s.list.id === "druid");
    expect(has()).toBe(true);
    expect(spellListOf(l.character, reg, "class:druid").extra).toContain("spell:revivify");
    l.record("setOptionalFeature", { feature: "feature:druid-additional-druid-spells", on: false });
    expect(has()).toBe(false);
    expect(spellListOf(l.character, reg, "class:druid").extra).toEqual([]);
  });

  it("a spell from another source stays when the option is off", () => {
    const l = log(make("druid", 5));
    l.record("setOptionalFeature", { feature: "feature:druid-additional-druid-spells", on: false });
    l.record("addExtra", { id: "x", kind: "spell", value: "spell:revivify", list: "druid", tag: "DM allows", reason: "a gift" } as never);
    expect(derive(l.character, reg).spells.some((s) => s.id === "spell:revivify")).toBe(true);
  });

  it("it's on the list to prepare, not prepared by itself; a cleric has Revivify anyway", () => {
    const sp = derive(make("druid", 5), reg).spells.find((s) => s.id === "spell:revivify")!;
    expect(sp.ready).toBe("not prepared");
    expect(derive(make("cleric", 5), reg).spells.some((s) => s.id === "spell:revivify")).toBe(true);
  });

  it("known and spellbook casters can pick from it (wizard: Augury from the expanded list)", () => {
    const c = make("wizard", 3);
    const pick = () => classSpellOptions(reg, "class:wizard", "spellbook", 2, c).map((o) => o.value);
    expect(pick()).toContain("spell:augury");
    c.optionalOff = ["feature:wizard-additional-wizard-spells"];
    expect(pick()).not.toContain("spell:augury");
  });

  it("a book's “Optional/Variant Classes” line works the same way (sample text, not the book's)", () => {
    const text = [
      "#### Sample Bloom",
      "*Level 2 Conjuration*",
      "___",
      "- **Casting Time:** 1 action",
      "- **Range:** 30 feet",
      "- **Components:** V, S",
      "- **Duration:** Instantaneous",
      "---",
      "Invented words for a test.",
      "",
      "**Classes:** Wizard",
      "**Optional/Variant Classes:** Druid",
    ].join("\n");
    const { pack } = bookPack([{ name: "spells_test.md", text }], reg);
    expect(pack.definitions.find((d) => d.id === "spell:sample-bloom")).toMatchObject({ classes: ["wizard"], optionalClasses: ["druid"] });
    // The app adds book packs to the content like any pack.
    const r2 = tableRegistry();
    r2.add(pack);
    const c = make("druid", 3);
    expect(derive(c, r2).spells.some((s) => s.id === "spell:sample-bloom")).toBe(true);
    c.optionalOff = ["feature:druid-additional-druid-spells"];
    expect(derive(c, r2).spells.some((s) => s.id === "spell:sample-bloom")).toBe(false);
  });
});

describe("Custom effects: several changes, rests, minutes, text", () => {
  it("applies each change only where it belongs, and ends at the right rest", () => {
    const l = log(make("fighter", 3));
    const base = derive(l.character, reg);
    l.record("addEffect", {
      instanceId: "e1",
      effect: "custom",
      untilRest: "short",
      custom: {
        name: "Blessing of the grove",
        text: "Smells of pine.",
        modifiers: [
          { selector: "roll.save.dex", op: "add", value: 2, mode: "auto" },
          { selector: "roll.check.*", op: "add", value: -1, mode: "auto" },
          { selector: "stat.ac", op: "add", value: 1, mode: "auto" },
          { selector: "roll.save.wis", op: "advantage", mode: "auto" },
        ],
      },
    });
    const s = derive(l.character, reg);
    expect(s.saves.dex.total).toBe(base.saves.dex.total + 2);
    expect(s.saves.str.total).toBe(base.saves.str.total);
    expect(s.skills.athletics.total).toBe(base.skills.athletics.total - 1);
    expect(s.skills.stealth.total).toBe(base.skills.stealth.total - 1);
    expect(s.ac.total).toBe(base.ac.total + 1);
    expect(s.saves.wis.advantage.length).toBe(1);
    expect(s.effects.find((e) => e.instanceId === "e1")).toMatchObject({ summary: "Smells of pine.", untilRest: "short" });
    l.record("addEffect", { instanceId: "e2", effect: "custom", untilRest: "long", custom: { name: "Long one", modifiers: [] } });
    l.record("addEffect", { instanceId: "e3", effect: "custom", minutes: 120, custom: { name: "Two hours", modifiers: [] } });
    l.record("rest", { kind: "short" });
    // The short rest's hour leaves the two-hour one with an hour; the "until a long rest" one stays.
    expect(l.character.effects.map((e) => e.id)).toEqual(["e2", "e3"]);
    l.record("rest", { kind: "long" });
    expect(l.character.effects).toEqual([]);
  });
});

describe("Custom spells with an effect", () => {
  it("cast on yourself: AC and advantage apply, with concentration; saved, reopened and deleted", () => {
    const l = log(make("wizard", 3));
    const base = derive(l.character, reg);
    const spell = {
      id: "w1",
      name: "Warding Bark",
      level: 1,
      school: "Abjuration",
      duration: "Concentration, up to 1 minute",
      concentration: true,
      description: "Bark covers you.",
      effect: { modifiers: [{ selector: "stat.ac", op: "add", value: 2, mode: "auto" }, { selector: "roll.save.con", op: "advantage", mode: "auto" }], text: "Plants hear you." },
    };
    l.record("setCustomSpell", { list: "wizard", spell });
    expect(l.character.customSpells[0]?.effect?.modifiers).toHaveLength(2);
    l.record("castSpell", { spell: "spell:custom-w1", list: "wizard", level: 1, using: "slot", selfEffect: true });
    const s = derive(l.character, reg);
    expect(s.ac.total).toBe(base.ac.total + 2);
    expect(s.saves.con.advantage).toContain("Warding Bark");
    expect(s.effects.find((e) => e.id === "effect:custom-w1")).toMatchObject({ summary: "Plants hear you.", concentration: true, rounds: 10 });
    l.record("endConcentration", {});
    expect(derive(l.character, reg).ac.total).toBe(base.ac.total);
    l.record("removeCustomSpell", { id: "w1" });
    expect(l.character.customSpells).toEqual([]);
  });
});
