import { describe, expect, it } from "vitest";
import { bookFileKind, bookPack, derive, newCharacter } from "../src/index.js";
import { tableRegistry } from "./helpers.js";

// Invented sample text in the same layout as the files a player loads; no book text is used here.
const SPELLS = `#### Frost Needle
*Level 1 Evocation*
___
- **Casting Time:** Action
- **Range:** 60 feet
- **Components:** V, S, M (a sliver of ice)
- **Duration:** Instantaneous
---
A needle of ice flies at a creature. Make a ranged spell attack. On a hit, the target takes 2d6 cold damage.
***At Higher Levels.*** When you cast this spell using a spell slot of 2nd level or higher, the damage increases by 1d6 for each slot level above 1st.

**Classes:** Sorcerer, Apothecary, Wizard

---

#### Grave Chime
*Necromancy Cantrip*
___
- **Casting Time:** Action
- **Range:** 30 feet
- **Components:** V
- **Duration:** Instantaneous
---
The target must succeed on a Wisdom saving throw or take 1d8 necrotic damage.

This spell's damage increases by 1d8 when you reach 5th level (2d8), 11th level (3d8), and 17th level (4d8).

---

#### Quiet Ward
*Level 2 Abjuration*
___
- **Casting Time:** 10 minutes or Ritual
- **Range:** Touch
- **Components:** V, S
- **Duration:** Concentration, up to 1 hour
---
Each creature in a 20-foot sphere must make a Dexterity saving throw, taking 3d6 thunder damage on a failed save, or half as much damage on a successful one.

---

#### Hex
*Level 1 Enchantment*
___
- **Casting Time:** Bonus action
- **Range:** 90 feet
- **Components:** V, S, M (a test material)
- **Duration:** Concentration, up to 1 hour
---
Sample paragraph standing in for the printed text.
***At Higher Levels.*** Sample higher-level paragraph.
`;

const FEATS = `## Dual Wielder

Sample book text that must not replace the table's remastered version.

---

## Lucky Charm

- Sample benefit one.
- Sample benefit two.

---

## Sharpshooter

Sample sharpshooter text.
`;

const ITEMS = `#### Longbow

Weapon, Martial Weapon, Ranged Weapon, 50 GP, 2 lb.

1d8 Piercing

ammunition (150/600 ft.), heavy, two‑handed

---

#### Glaive

Weapon, Martial Weapon, Melee Weapon, 20 GP, 6 lb.

1d10 Slashing

heavy, reach, two‑handed

---

#### +2 Glaive

Weapon (*Glaive*), Rare, Martial Weapon, Melee Weapon

1d10 Slashing

heavy, reach, two‑handed

---

You have a +2 bonus to attack and damage rolls made with this magic weapon.

#### Half Plate Armor

Medium Armor, 750 GP, 40 lb.

AC 15 + Dex (max 2)

---

Sample armor text.

#### Chain of Elsewhere

Weapon (*Fighting Chain*), Advanced Weapon, Melee Weapon, 3 lb.

1d4 Bludgeoning

---

*The base item can be found in Grim Hollow: The Player's Guide, page 1.*

#### Silvered Worg Jaws

Weapon (*Worg Jaws*), Martial Weapon, Melee Weapon, 2 lb.

2d6 Piercing

---

Sample text for a variant whose base item isn't in the files.

#### Lantern of Testing

Wondrous Item, Rare (Requires Attunement), Major Tier, 2 lb.

---

Sample lantern text.
`;

const CLASS_PAGE = `Rogue
Level 1: Sneak Attack PHB'14 p94

Sample sneak attack text.
Second sample paragraph.
Soulknife TCE p63

Sample subclass text.
Level 3: Psychic Blades TCE p63

3rd-level Soulknife feature

Sample psychic blades text.

Reprinted as Soulknife in PHB'24.
`;

const BARD_PAGE = `Bard
Level	Proficiency Bonus	Features
3rd	+2	Bard College,
Expertise
Level 1: Bardic Inspiration PHB'14 p51

Sample inspiration text.
Level 3: Bard College PHB'14 p51

Sample college text.
College of Whispers XGE p16

Sample whispers text.
Level 3: Psychic Blades XGE p16

Sample whispers blades text.
College of Testing XGE p99

Sample testing text.
Testing SpellsBard Level	Spells
3rd	bless, shield
5th	fireball
Level 3: Test Trick XGE p99

Sample trick text.
Trick Option XGE p99

Sample option text.
Level 3: Expertise PHB'14 p51

Sample expertise text.
College of Whispers: Level 6: Mantle of Whispers XGE p16

Sample mantle text.
College of Testing: Level 6: Extra Attack XGE p99

Sample extra attack text.
College of Elsewhere GHPG p12

Sample third-party text.
Level 3: Odd Gift GHPG p12

Sample odd text.
College of Elsewhere: Level 6: Odd Song GHPG p12

Sample odd song text.
`;

const BACKGROUNDS = `## Test Wanderer

- **Skill Proficiencies:** Athletics, plus one from among Arcana, History, or Nature
- **Tool Proficiencies:** One type of musical instrument, vehicles (land)
- **Languages:** Two of your choice
- **Equipment:** A staff.

#### Feature: Long Road

Sample road text.

#### Suggested Characteristics

Sample characteristics.
`;

const RACES = `## Elf

- **Ability Scores:** Dexterity +2
- **Size:** Medium

***Fey Ancestry.*** Sample fey ancestry text.

***Trance.*** Sample trance text.

## Testfolk

- **Ability Scores:** Choose one of: (a) Choose any +2; choose any other +1 (b) Choose three different +1
- **Creature Type:** Fey
- **Size:** Small
- **Speed:** 35 feet

***Darkvision.*** Sample darkvision text, 60 feet.

***Odd Gift.*** Sample gift text.

***Languages.*** Sample: Common and one other language.

## Elf (Moon)

- **Ability Scores:** Dexterity +2; Wisdom +1
- **Size:** Medium
- **Speed:** 30 feet

***Fey Ancestry.*** Sample fey ancestry text.

***Moonlit.*** Sample moon text.

***Languages.*** Sample: Common and Elvish.
`;

describe("book text loaded on the device", () => {
  const base = tableRegistry();
  const files = [
    { name: "spells.md", text: SPELLS },
    { name: "feats.md", text: FEATS },
    { name: "items.md", text: ITEMS },
    { name: "rogue.txt", text: CLASS_PAGE },
    { name: "bard.txt", text: BARD_PAGE },
    { name: "backgrounds.md", text: BACKGROUNDS },
    { name: "races.md", text: RACES },
  ];
  const { pack, report } = bookPack(files, base);
  const def = (id: string) => pack.definitions.find((d) => d.id === id);

  it("recognizes each kind of file", () => {
    expect(files.map((f) => bookFileKind(f.text))).toEqual(["spells", "feats", "items", "class page", "class page", "backgrounds", "races"]);
  });

  it("reads a new spell's details and mechanics from its text", () => {
    expect(def("spell:frost-needle")).toMatchObject({
      level: 1,
      school: "Evocation",
      castingTime: "1 action",
      components: ["V", "S", "M"],
      material: "a sliver of ice",
      classes: ["sorcerer", "wizard"],
      attack: "ranged",
      damage: { type: "cold", atSlot: { "1": "2d6", "2": "3d6", "9": "10d6" } },
      higherLevels: [expect.stringMatching(/^When you cast/)],
    });
    expect(def("spell:grave-chime")).toMatchObject({
      level: 0,
      save: { ability: "wis", onSuccess: "none" },
      damage: { type: "necrotic", atCharacterLevel: { "1": "1d8", "5": "2d8", "11": "3d8", "17": "4d8" } },
    });
    expect(def("spell:quiet-ward")).toMatchObject({
      castingTime: "10 minutes",
      ritual: true,
      concentration: true,
      save: { ability: "dex", onSuccess: "half" },
      area: "20-foot sphere",
    });
  });

  it("a placeholder spell gets the text but keeps its checked numbers", () => {
    const hex = def("spell:hex");
    expect(hex).toMatchObject({ text: ["Sample paragraph standing in for the printed text."], higherLevels: ["Sample higher-level paragraph."] });
    expect(hex?.summary).toBeUndefined();
    expect(hex?.source.book).toBe("PHB");
  });

  it("never changes the remastered feats; book feats only add text or new feats", () => {
    expect(def("feat:dual-wielder")).toBeUndefined();
    expect(report.kept).toContain("Dual Wielder");
    expect(def("feat:sharpshooter")).toMatchObject({ text: ["Sample sharpshooter text."] });
    expect(def("feat:sharpshooter")).toHaveProperty("grant");
    expect(def("feat:lucky-charm")).toMatchObject({ kind: "feat", text: ["• Sample benefit one.", "• Sample benefit two."] });
  });

  it("class pages and race traits give existing features their text, keeping mechanics", () => {
    expect(def("feature:sneak-attack")).toMatchObject({ text: ["Sample sneak attack text.", "Second sample paragraph."] });
    expect(def("feature:sneak-attack")).toHaveProperty("grant");
    expect(def("feature:psychic-blades")?.text).toEqual(["Sample psychic blades text."]);
    expect(def("subclass:soulknife")?.text).toEqual(["Sample subclass text."]);
    expect(def("feature:fey-ancestry")?.text).toEqual(["Sample fey ancestry text."]);
  });

  it("class pages add the subclasses the content doesn't have, with their features by level", () => {
    const sub = def("subclass:college-of-whispers") as { class: string; features: { level: number; feature: string }[]; text: string[] };
    expect(sub).toMatchObject({ class: "class:bard", text: ["Sample whispers text."] });
    expect(sub.features).toEqual([
      { level: 3, feature: "feature:college-of-whispers-psychic-blades" },
      { level: 6, feature: "feature:college-of-whispers-mantle-of-whispers" },
    ]);
    expect(def("feature:college-of-whispers-psychic-blades")?.text).toEqual(["Sample whispers blades text."]);
    // The bard's Psychic Blades never overwrite the Soulknife's.
    expect(def("feature:psychic-blades")?.text).toEqual(["Sample psychic blades text."]);
    // Expertise is in the class table, so it is the class's feature, not the subclass's.
    const testing = def("subclass:college-of-testing") as { features: { level: number; feature: string }[] };
    expect(testing.features.map((f) => f.feature)).not.toContain("feature:college-of-testing-expertise");
    expect(def("feature:college-of-testing-test-trick")?.text).toEqual(["Sample trick text.", "Trick Option:", "Sample option text."]);
    expect(def("feature:college-of-testing-extra-attack")).toMatchObject({ grant: { extraAttacks: 2 } });
    // Subclass spell tables become always-known spells at their levels.
    expect(testing.features.filter((f) => f.feature.includes("spells")).map((f) => f.level)).toEqual([3, 5]);
    expect(def("feature:college-of-testing-college-of-testing-spells-3")).toMatchObject({
      grant: { spells: [{ spell: "spell:bless", name: "Bless", list: "bard" }, { spell: "spell:shield", name: "Shield" }] },
    });
    // Third-party subclasses are left out.
    expect(def("subclass:college-of-elsewhere")).toBeUndefined();
  });

  it("new backgrounds come with their skills, tools, languages and feature", () => {
    expect(def("background:test-wanderer")).toMatchObject({
      grant: {
        proficiencies: [
          { kind: "skill", target: "athletics" },
          { kind: "skill", target: { choice: "skills" } },
          { kind: "tool", target: { choice: "tools" } },
          { kind: "tool", target: "Vehicles (land)" },
          { kind: "language", target: { choice: "languages" } },
        ],
      },
      choices: [
        { id: "skills", kind: "skill", count: 1, from: ["arcana", "history", "nature"] },
        { id: "tools", kind: "tool", count: 1 },
        { id: "languages", kind: "language", count: 2 },
      ],
      features: ["feature:long-road"],
    });
    expect(def("feature:long-road")?.text).toEqual(["Sample road text."]);
  });

  it("races the content doesn't have become playable", () => {
    expect(def("race:testfolk")).toMatchObject({
      size: "small",
      speed: 35,
      creatureType: "fey",
      grant: { abilityChoice: { choice: "abilities", amount: 1 }, senses: { darkvision: 60 } },
      choices: [{ id: "language" }, { id: "abilities", count: 2 }],
    });
    expect((def("race:testfolk") as { features: string[] }).features).toContain("feature:testfolk-odd-gift");
    expect(def("race:moon-elf")).toMatchObject({ name: "Moon Elf", group: "Elf", grant: { abilityBonuses: { dex: 2, wis: 1 } } });
    // A trait the content already has keeps its mechanics.
    expect((def("race:moon-elf") as { features: string[] }).features).toContain("feature:fey-ancestry");
  });

  it("a character with a book subclass gets its features", () => {
    const reg = tableRegistry();
    reg.add(pack);
    const c = newCharacter({ id: "w", name: "Whisper", race: "race:human", class: "class:bard", background: "background:test-wanderer", abilities: { str: 8, dex: 14, con: 12, int: 10, wis: 13, cha: 15 } }, reg);
    c.classes[0] = { ...c.classes[0]!, level: 6, subclass: "subclass:college-of-whispers" };
    const sheet = derive(c, reg);
    const names = sheet.features.map((f) => f.name);
    expect(names).toEqual(expect.arrayContaining(["Psychic Blades", "Mantle of Whispers", "Long Road"]));
    expect(sheet.skills.athletics.proficiency).toBeGreaterThan(0);
  });

  it("items: weapons and armor get stats, magic versions take their base's stats", () => {
    // The SRD pack has the glaive already; the book only adds magic versions.
    expect(def("item:glaive") ?? base.find("item:glaive", "item")).toMatchObject({ category: "weapon", weapon: { category: "martial", kind: "melee", damage: "1d10", damageType: "slashing", properties: ["heavy", "reach", "two-handed"] } });
    expect(def("item:2-glaive")).toMatchObject({ name: "+2 Glaive", weapon: { damage: "1d10" }, magic: { rarity: "rare", bonus: 2 } });
    expect(def("item:half-plate-armor") ?? base.find("item:half-plate-armor", "item")).toMatchObject({ category: "armor", armor: { category: "medium", base: 15 }, weight: 40 });
    expect(def("item:lantern-of-testing")).toMatchObject({ category: "wondrous", requiresAttunement: true, magic: { rarity: "rare" }, weight: 2 });
  });

  it("leaves out third-party material and classes", () => {
    expect(def("item:chain-of-elsewhere")).toBeUndefined();
    expect(def("item:silvered-worg-jaws")).toBeUndefined();
    expect(report.excluded).toBe(3);
    expect(def("spell:frost-needle")).toMatchObject({ classes: ["sorcerer", "wizard"] });
  });

  it("the pack is valid and loads over the table pack", () => {
    const reg = tableRegistry();
    reg.add(pack);
    expect(reg.get("spell:frost-needle", "spell").name).toBe("Frost Needle");
    expect(reg.get("feat:dual-wielder", "feat").source.book).toMatch(/Homebrew/);
  });
});

describe("the actions file", () => {
  const ACTIONS = `## Dash

Sample text: you go twice as far.

---

## Dodge

Sample text: you are hard to hit.

---

## Two-Weapon Fighting

Sample text: a second weapon.
`;
  it("is recognized, and gives its text only to the actions anyone can take", () => {
    const reg = tableRegistry();
    expect(bookFileKind(ACTIONS)).toBe("actions");
    const { pack } = bookPack([{ name: "actions.md", text: ACTIONS }], reg);
    const byId = new Map(pack.definitions.map((d) => [d.id, d]));
    expect(byId.get("feature:action-dash")?.text).toEqual(["Sample text: you go twice as far."]);
    expect(byId.get("feature:action-two-weapon-fighting")?.text).toEqual(["Sample text: a second weapon."]);
    expect([...byId.keys()].filter((id) => !id.startsWith("feature:action-"))).toEqual([]);
  });
});
