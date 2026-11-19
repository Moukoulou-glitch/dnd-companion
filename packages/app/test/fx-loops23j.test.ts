import { describe, expect, it } from "vitest";
import { formFx, isInvisible, stateLoops } from "../src/fx/triggers.js";
import type { Character } from "@dnd/schema";

const c = (extra: Partial<Character>) => ({ toggles: [], effects: [], classes: [], ...extra }) as unknown as Character;

describe("loops while Form of Dread lasts and while you're invisible", () => {
  it("Form of Dread keeps its own loop while it's on", () => {
    expect(formFx(c({ toggles: ["form-of-dread"] }))).toEqual([{ form: "form-of-dread", look: "sfx-ongoing-dread" }]);
  });
  it("invisible: the condition, Invisibility, Greater Invisibility, a potion, the Phantom's tale, Hidden Step", () => {
    for (const effect of ["condition:invisible", "effect:invisibility", "effect:greater-invisibility", "other:potion-invisibility", "other:spirit-tale-phantom"])
      expect(stateLoops(c({ effects: [{ id: "e", effect, from: "x" }] as Character["effects"] })).invisible).toBe("sfx-ongoing-invis");
    expect(isInvisible(c({ toggles: ["hidden-step"] }))).toBe(true);
    expect(stateLoops(c({})).invisible).toBeUndefined();
  });
});
