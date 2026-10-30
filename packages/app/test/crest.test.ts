import { describe, expect, it } from "vitest";
import { crestFor, drawCrest, glimpseChance, raceCrest, rollsGlimpse, RACE_CRESTS, PAD, type Motif } from "../src/fx/crest";

const ch = (race: string, levels: number[], choices: Record<string, Record<string, string[]>> = {}) => ({ race, classes: levels.map((level) => ({ level })), choices });

describe("heritage crest", () => {
  it("comes at character level 10, counting every class", () => {
    expect(crestFor(ch("race:shadar-kai", [9]))).toBeUndefined();
    expect(crestFor(ch("race:shadar-kai", [5, 5]))).toMatchObject({ motif: "wings", variant: "raven" });
  });
  it("fits the race and subrace", () => {
    expect(crestFor(ch("race:tiefling", [10]))?.motif).toBe("horns");
    expect(crestFor(ch("race:drow", [10]))?.motif).toBe("web");
    expect(crestFor(ch("race:wood-elf", [10]))?.motif).toBe("vines");
    expect(crestFor(ch("race:high-elf", [10]))?.motif).toBe("stars");
    expect(crestFor(ch("race:rock-gnome", [10]))?.motif).toBe("gears");
    expect(crestFor(ch("race:deep-gnome", [10]))?.motif).toBe("crystals");
    // Half-elf: Adama's two whole rings, not the human laurel.
    expect(crestFor(ch("race:half-elf", [10]))).toMatchObject({ motif: "adama", label: "Two wholes" });
    expect(crestFor(ch("race:human", [10]))?.motif).toBe("laurel");
  });
  it("an eladrin's season, a dragonborn's ancestry colour", () => {
    expect(crestFor(ch("race:eladrin", [10], { "race:eladrin": { season: ["Nocter"] } }))?.motif).toBe("frost");
    expect(crestFor(ch("race:eladrin", [10], { "race:eladrin": { season: ["Heammer"] } }))?.motif).toBe("sun");
    expect(crestFor(ch("race:eladrin", [10]))?.motif).toBe("stars");
    const gem = crestFor(ch("race:gem-dragonborn", [12], { "race:gem-dragonborn": { ancestry: ["feature:ftd-gem-ancestry-emerald"] } }));
    expect(gem).toMatchObject({ motif: "wings", variant: "dragon", label: "Emerald dragon wings" });
  });
  it("a race from a book file by its name, anything else a filigree", () => {
    expect(crestFor(ch("race:aarakocra", [10]), "Aarakocra")?.motif).toBe("wings");
    expect(crestFor(ch("race:mystery", [10]), "Mystery Folk")).toMatchObject({ motif: "laurel", variant: "filigree" });
  });
  it("every motif draws both layers without errors, at narrow and wide boxes", () => {
    const motifs = new Set<Motif>(Object.values(RACE_CRESTS).map((s) => s.motif));
    for (const s of Object.values(RACE_CRESTS))
      for (const w of [120, 260]) {
        const parts = drawCrest(s, { x: PAD.l, y: PAD.t, w, h: 64 });
        expect(parts.back).toBeTruthy();
      }
    expect(motifs.size).toBeGreaterThan(15);
  });
});

describe("a glimpse of the crest after a natural 20, below level 10", () => {
  it("5% per character level, none from 10th", () => {
    expect(glimpseChance(1)).toBeCloseTo(0.05);
    expect(glimpseChance(9)).toBeCloseTo(0.45);
    expect(glimpseChance(10)).toBe(0);
    expect(glimpseChance(15)).toBe(0);
  });
  it("shows when the random number is under the chance", () => {
    // A d100 as 0.00–0.99: a 1st-level character shows it on 0.00–0.04, five in a hundred.
    const shows = (level: number) => Array.from({ length: 100 }, (_, i) => rollsGlimpse(level, i / 100)).filter(Boolean).length;
    expect(shows(1)).toBe(5);
    expect(shows(9)).toBe(45);
    expect(shows(10)).toBe(0);
  });
  it("the glimpse is the race's own crest", () => {
    expect(raceCrest(ch("race:shadar-kai", [3]))).toMatchObject({ motif: "wings", variant: "raven" });
  });
});
