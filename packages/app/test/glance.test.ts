import { describe, expect, it } from "vitest";
import { SKILLS } from "@dnd/schema";
import { topSkills } from "../src/glance";

const sheet = { skills: Object.fromEntries(SKILLS.map((s, i) => [s, { total: s === "stealth" ? 9 : s === "perception" ? 7 : i % 3 }])) } as never;

describe("25e: the skills shown on Play", () => {
  it("the ones rolled most first, then the best ones", () => {
    const rolls = [{ title: "Athletics" }, { title: "Athletics (DC 15)" }, { title: "Arcana" }, { title: "Dagger" }];
    expect(topSkills(sheet, rolls)).toEqual(["athletics", "arcana", "stealth"]);
  });
  it("nothing rolled yet: the best three", () => {
    expect(topSkills(sheet, []).slice(0, 2)).toEqual(["stealth", "perception"]);
  });
});
