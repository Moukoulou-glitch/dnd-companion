import { describe, expect, it } from "vitest";
import { derive, newCharacter } from "@dnd/engine";
import { CharacterLog } from "../../store/src/log.js";
import { HybridClock } from "../../store/src/clock.js";
import { tableRegistry } from "../../engine/test/helpers.js";
import { liveAttack, usedUpBy, withoutUsedUp } from "../src/oneTime.js";

const reg = tableRegistry();
let t = 1_805_000_000_000;
/** A 5th-level paladin (Extra Attack) with Searing Smite waiting on the next hit. */
const smiting = () => {
  const c = newCharacter({ id: "p", name: "P", race: "race:human", class: "class:paladin", abilities: { str: 16, dex: 10, con: 14, int: 10, wis: 10, cha: 16 } }, reg);
  c.classes[0] = { ...c.classes[0]!, level: 5 };
  c.inventory.push({ id: "w", item: "item:longsword", quantity: 1, equipped: true, attuned: false });
  const l = new CharacterLog(c, reg, new HybridClock("t", () => (t += 1000)), "player");
  l.record("setPrepared", { spell: "spell:searing-smite", list: "paladin", prepared: true } as never);
  l.record("castSpell", { spell: "spell:searing-smite", list: "paladin", level: 1, using: "slot", selfEffect: true });
  return l;
};
const sword = (l: CharacterLog) => derive(l.character, reg).attacks.find((a) => a.itemInstanceId === "w")!;

describe("Smites on Extra Attack: used once, not again", () => {
  it("the smite waits on the first hit (ticked), and the roll panel knows which effect it ends", () => {
    const l = smiting();
    expect(derive(l.character, reg).attacksPerAction).toBe(2);
    const sg = sword(l).damage.bonus.suggestions.find((x) => x.label === "Searing Smite")!;
    expect(sg).toMatchObject({ preset: "always" });
    expect(sg.endsEffect).toBeTruthy();
    expect(usedUpBy(sword(l).damage.bonus.suggestions, ["Searing Smite"])).toEqual([{ label: "Searing Smite", effect: sg.endsEffect }]);
  });

  it("after the hit the smite is gone: the panel's next attack reads the live sheet, not the attack it opened with", () => {
    const l = smiting();
    const opened = sword(l);
    const used = usedUpBy(opened.damage.bonus.suggestions, ["Searing Smite"]);
    // What the roll does when its damage is rolled: the tag goes (concentration stays for the burning).
    l.record("removeEffect", { instanceId: used[0]!.effect });
    expect(l.character.concentration?.spell).toBe("spell:searing-smite");
    const now = liveAttack(derive(l.character, reg), opened);
    expect(now.damage.bonus.suggestions.some((x) => x.label === "Searing Smite")).toBe(false);
    // The attack it was opened with still has it: that was the bug ("Next attack" re-ticked it).
    expect(opened.damage.bonus.suggestions.some((x) => x.label === "Searing Smite")).toBe(true);
    // And even with a stale breakdown, the used-up option is taken out.
    expect(withoutUsedUp(opened.damage.bonus, used).suggestions.some((x) => x.label === "Searing Smite")).toBe(false);
    // Other options are kept.
    expect(withoutUsedUp(opened.damage.bonus, used).suggestions.length).toBe(opened.damage.bonus.suggestions.length - 1);
  });

  it("a new smite cast later is a new effect: it isn't blocked by the old one", () => {
    const l = smiting();
    const first = usedUpBy(sword(l).damage.bonus.suggestions, ["Searing Smite"]);
    l.record("removeEffect", { instanceId: first[0]!.effect });
    l.record("castSpell", { spell: "spell:searing-smite", list: "paladin", level: 1, using: "slot", selfEffect: true });
    const again = sword(l);
    expect(withoutUsedUp(again.damage.bonus, first).suggestions.some((x) => x.label === "Searing Smite")).toBe(true);
  });

  it("liveAttack falls back to the attack it was given when the sheet doesn't have it", () => {
    const l = smiting();
    const a = { ...sword(l), attackId: "nowhere" };
    expect(liveAttack(derive(l.character, reg), a)).toBe(a);
    expect(liveAttack(undefined, a)).toBe(a);
  });
});
