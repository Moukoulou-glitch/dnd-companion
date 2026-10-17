import { describe, expect, it } from "vitest";
import { airParticles, MAX_PARTICLES, naturalOf } from "../src/dice/DiceStrip";

describe("The result strip: natural 20s and 1s in words, a capped number of particles", () => {
  it("only a d20's 20 or 1 is called natural, and only once it has landed", () => {
    expect(naturalOf({ sides: 20, value: 20 })).toBe("nat20");
    expect(naturalOf({ sides: 20, value: 1 })).toBe("nat1");
    expect(naturalOf({ sides: 20, value: 7 })).toBeUndefined();
    expect(naturalOf({ sides: 20 })).toBeUndefined();
    // A d6's 1 or a d10's 10 is nothing special.
    expect(naturalOf({ sides: 6, value: 1 })).toBeUndefined();
    expect(naturalOf({ sides: 10, value: 10 })).toBeUndefined();
  });

  it("a mixed roll's particles are its main (first) part's; none when no die has any", () => {
    expect(airParticles([{ particles: "embers" }, { particles: "dust" }])).toBe("embers");
    expect(airParticles([{}, { particles: "snow" }])).toBe("snow");
    expect(airParticles([{}, {}])).toBeUndefined();
    expect(MAX_PARTICLES).toBeLessThanOrEqual(12);
  });
});
