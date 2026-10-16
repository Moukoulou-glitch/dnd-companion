import { describe, expect, it } from "vitest";
import { ContentPack } from "@dnd/schema";
import { bookPack, ContentRegistry, derive, newCharacter, warCasterSpells } from "../src/index.js";
import { singleTargetFromText } from "../src/books/spells.js";
import { loadPackDir, tableRegistry } from "./helpers.js";

// Invented spells in the layout of a loaded book file; no book text is used.
const spell = (name: string, time: string, range: string, text: string) => `#### ${name}
*Level 1 Evocation*
___
- **Casting Time:** ${time}
- **Range:** ${range}
- **Components:** V, S
- **Duration:** Instantaneous
---
${text}

**Classes:** Wizard

---
`;
const SPELLS = [
  spell("Ember Lance", "Action", "60 feet", "Make a ranged spell attack against a creature within range. On a hit, the target takes 2d8 fire damage."),
  spell("Sour Word", "Action", "30 feet", "Choose one creature you can see within range. It must succeed on a Wisdom saving throw or take 2d6 psychic damage."),
  spell("Gale Ring", "Action", "Self (15-foot cone)", "Each creature in the cone must make a Strength saving throw, taking 2d8 force damage on a failed save."),
  spell("Hail Spray", "Action", "90 feet", "Each creature in a 10-foot-radius sphere centred on a point within range must make a Dexterity saving throw. A creature takes 3d6 cold damage on a failed save."),
  spell("Twin Sparks", "Action", "60 feet", "Up to three creatures of your choice that you can see within range must make a Dexterity saving throw or take 1d10 lightning damage."),
  spell("Kind Touch", "Action", "Touch", "You touch a creature and it regains 1d8 hit points."),
  spell("Quick Jab", "Bonus action", "30 feet", "Make a ranged spell attack against a creature. On a hit it takes 1d6 force damage."),
].join("\n");

describe("War Caster: book spells aimed at one creature", () => {
  it("reads single-target from the words, conservatively", () => {
    expect(singleTargetFromText("60 feet", ["Make a ranged spell attack against a creature within range."])).toBe(true);
    expect(singleTargetFromText("Self (15-foot cone)", ["Make a melee spell attack."])).toBe(false);
    expect(singleTargetFromText("90 feet", ["Each creature in a 20-foot-radius sphere must make a Dexterity saving throw."])).toBe(false);
    // A buff on one creature is not something you'd cast at the creature leaving your reach.
    expect(singleTargetFromText("Touch", ["You touch a creature. Its speed increases by 10 feet."])).toBe(false);
  });

  it("marks the parsed book spells and War Caster offers only the right ones", () => {
    const reg = tableRegistry();
    const { pack } = bookPack([{ name: "spells.md", text: SPELLS }], reg);
    const flag = (id: string) => (pack.definitions.find((d) => d.id === id) as { singleTarget?: boolean } | undefined)?.singleTarget ?? false;
    expect(["ember-lance", "sour-word", "gale-ring", "hail-spray", "twin-sparks", "kind-touch", "quick-jab"].map((s) => [s, flag(`spell:${s}`)])).toEqual([
      ["ember-lance", true],
      ["sour-word", true],
      ["gale-ring", false],
      ["hail-spray", false],
      ["twin-sparks", false],
      ["kind-touch", false],
      ["quick-jab", true],
    ]);
    reg.add(pack);
    const c = newCharacter({ id: "w", name: "W", race: "race:human", class: "class:wizard", abilities: { str: 8, dex: 14, con: 14, int: 16, wis: 10, cha: 10 } }, reg);
    c.classes[0] = { ...c.classes[0]!, level: 5 };
    c.feats.push({ feat: "feat:war-caster", from: "Level 4 ASI" });
    for (const s of ["ember-lance", "sour-word", "gale-ring", "hail-spray", "twin-sparks", "kind-touch", "quick-jab"]) c.spells.push({ spell: `spell:${s}`, list: "wizard", prepared: true });
    // Quick Jab is aimed at one creature but takes a bonus action, so War Caster can't use it.
    expect(warCasterSpells(derive(c, reg)).map((s) => s.id).sort()).toEqual(["spell:ember-lance", "spell:sour-word"]);
  });
});

describe("Start-up: the app's packs are checked at build time, not on every start", () => {
  const raw = [loadPackDir("content/packs/srd-5.1"), loadPackDir("content/packs/table-2014")];
  const parsed = raw.map((p) => ContentPack.parse(p));

  it("a registry from already-checked packs holds exactly what checking them at start gave", () => {
    const checked = new ContentRegistry(raw);
    const trusted = ContentRegistry.fromValidated(parsed);
    for (const kind of ["spell", "class", "subclass", "feature", "item", "race", "feat", "effect", "creature", "background"] as const) {
      expect(trusted.list(kind)).toEqual(checked.list(kind));
    }
  });

  it("loading book text on top never changes the shared pack data", () => {
    const before = structuredClone(parsed);
    const reg = ContentRegistry.fromValidated(parsed);
    const book = spell("Fire Bolt", "Action", "120 feet", "Make a ranged spell attack against a creature. On a hit, the target takes 1d10 fire damage.").replace("**Classes:** Wizard", "**Classes:** Druid");
    const { pack } = bookPack([{ name: "spells.md", text: SPELLS + "\n" + book }], reg);
    reg.add(pack);
    ContentRegistry.fromValidated(parsed).add(bookPack([{ name: "spells.md", text: SPELLS }], reg).pack);
    expect(parsed).toEqual(before);
    // The book's class went on a copy: the SRD spell in the shared data is as it was.
    expect(reg.get("spell:fire-bolt", "spell").classes).toContain("druid");
    expect(ContentRegistry.fromValidated(parsed).get("spell:fire-bolt", "spell").classes).not.toContain("druid");
  });
});
