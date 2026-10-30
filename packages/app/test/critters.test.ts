import { describe, expect, it } from "vitest";
import { tableRegistry } from "../../engine/test/helpers.js";
import { CRITTERS, SPIRIT_CRITTERS, critterFor, generatedCritter } from "../src/fx/critters.js";

const reg = tableRegistry();

describe("summoned creatures on Play", () => {
  it("every Find Familiar, Find Steed and Find Greater Steed creature is hand-tuned, and every Summon spirit variant", () => {
    for (const id of ["summon:find-familiar", "summon:find-steed", "summon:find-greater-steed", "summon:animate-dead", "summon:create-undead", "summon:giant-insect", "summon:animate-objects"]) {
      for (const c of reg.get(id, "summon").creatures ?? []) expect(CRITTERS[c], c).toBeTruthy();
    }
    for (const sm of reg.list("summon")) {
      for (const v of sm.spirit?.variants ?? []) expect(SPIRIT_CRITTERS[`${sm.id.replace(/^summon:/, "")}/${v.id}`], `${sm.id} ${v.id}`).toBeTruthy();
    }
  });
  it("a spirit's id finds its variant; anything else gets a look from its stat block", () => {
    expect(critterFor("creature:spirit/summon-elemental/fire/4/7/15")).toBe(SPIRIT_CRITTERS["summon-elemental/fire"]);
    const wolf = reg.get("creature:wolf", "creature");
    expect(critterFor(wolf.id, wolf)).toMatchObject({ plan: "quad" });
    expect(generatedCritter({ name: "Giant Eagle", type: "beast", size: "Large", speed: { walk: 10, fly: 80 } })).toMatchObject({ plan: "bird", f: expect.arrayContaining(["big"]) });
    expect(generatedCritter({ name: "Vrock", type: "fiend (demon)", size: "Large", speed: { walk: 40, fly: 60 } })).toMatchObject({ plan: "fiend" });
    expect(generatedCritter({ name: "Fire Elemental", type: "elemental", size: "Large", speed: { walk: 50 } })).toMatchObject({ plan: "flame" });
  });
});

describe("a hidden one", () => {
  it("only a Beast of the Land named exactly Gwestel", async () => {
    const { hiddenCompanionCritter, GWESTEL } = await import("../src/fx/critters.js");
    expect(hiddenCompanionCritter("Gwestel", "Beast of the Land")).toBe(GWESTEL);
    expect(GWESTEL).toMatchObject({ plan: "quad", eye: "#3fb8ff" });
    expect(hiddenCompanionCritter("gwestel", "Beast of the Land")).toBeUndefined();
    expect(hiddenCompanionCritter("Gwestel", "Beast of the Sky")).toBeUndefined();
  });
});
