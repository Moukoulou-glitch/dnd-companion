import { describe, expect, it } from "vitest";
import { Character } from "@dnd/schema";
import { ContentRegistry } from "@dnd/engine";
import { loadPackDir } from "../../engine/test/helpers.js";
import { rosterLines } from "../src/components/Roster";
import { subclassPattern } from "../src/components/CharacterToken";

const reg = new ContentRegistry([loadPackDir("content/packs/srd-5.1"), loadPackDir("content/packs/table-2014")]);
const ch = (race: string, classes: { class: string; level: number; subclass?: string }[]) =>
  Character.parse({ id: "x", schemaVersion: 1, ruleset: "5e-2014", name: "X", abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 }, race, classes, hp: { current: 10, temp: 0 } });

describe("Characters page", () => {
  it("classes with levels and subclasses, highest first, and the race", () => {
    const l = rosterLines(ch("race:rock-gnome", [{ class: "class:wizard", level: 10, subclass: "subclass:order-of-scribes" }]), reg);
    expect(l.classes).toBe("Wizard 10 · Order of Scribes");
    expect(l.race).toBe("Rock Gnome");
    const m = rosterLines(ch("race:half-elf", [{ class: "class:paladin", level: 3 }, { class: "class:cleric", level: 6, subclass: "subclass:light-domain" }]), reg);
    expect(m.classes).toBe("Cleric 6 · Light Domain / Paladin 3");
    expect(m.words.toLowerCase()).toContain("light domain");
  });
  it("each subclass its own ring pattern, the same every time", () => {
    const a = subclassPattern("subclass:order-of-scribes")!;
    expect(subclassPattern("subclass:order-of-scribes")).toEqual(a);
    expect(subclassPattern("subclass:light-domain")).not.toEqual(a);
    expect(a.segments).toBeGreaterThanOrEqual(3);
    expect(subclassPattern(undefined)).toBeUndefined();
  });
});
