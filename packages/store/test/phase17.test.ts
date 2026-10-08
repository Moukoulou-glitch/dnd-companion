import { describe, expect, it } from "vitest";
import { composeDamage } from "@dnd/dice";
import { derive, newCharacter } from "@dnd/engine";
import type { Character } from "@dnd/schema";
import { CharacterLog } from "../src/log.js";
import { HybridClock } from "../src/clock.js";
import { tableRegistry } from "../../engine/test/helpers.js";

const reg = tableRegistry();
let t = 2_500_000_000_000;
const logOf = (c: Character) => new CharacterLog(c, reg, new HybridClock("test", () => (t += 1000)), "player");
const monk = () => {
  const c = newCharacter({ id: "m", name: "Tsiki", race: "race:human", class: "class:monk", abilities: { str: 10, dex: 16, con: 14, int: 10, wis: 16, cha: 8 } }, reg);
  c.classes[0] = { ...c.classes[0]!, level: 8, subclass: "subclass:way-of-mercy" };
  c.hp.current = derive(c, reg).hpMax.total;
  return logOf(c);
};

describe("monk: Way of Mercy, Stunning Strike, Step of the Wind; background", () => {
  it("unarmed strikes offer Hand of Harm (once per turn) and Stunning Strike as options", () => {
    const s = derive(monk().character, reg);
    const ua = s.attacks.find((a) => a.attackId === "martial-arts")!;
    const harm = ua.damage.bonus.suggestions.find((x) => x.label === "Hand of Harm")!;
    expect(harm).toMatchObject({ oncePerTurn: true, apply: { dice: ["1d6"], flat: 3, damageType: "necrotic" } });
    const stun = ua.damage.bonus.suggestions.find((x) => x.label === "Stunning Strike")!;
    expect(stun.effect).toBe("on a hit");
    expect(s.actions.find((a) => a.id === "hand-of-healing")).toMatchObject({ economy: "action", heal: { dice: ["1d6"], flat: 3 } });
    expect(s.skills.medicine.total).toBe(3 + 3);
  });

  it("Step of the Wind: Disengage doesn't add a Dash", () => {
    const log = monk();
    log.record("startCombat", {});
    log.record("startTurn", {});
    log.record("useAction", { action: "step-of-the-wind", choice: "Disengage" });
    expect(log.character.combat!.dashes).toBe(0);
    log.record("useAction", { action: "step-of-the-wind", choice: "Dash" });
    expect(log.character.combat!.dashes).toBe(1);
  });

  it("an option can swap the weapon's die (Shillelagh's d8)", () => {
    const base = { total: 2, parts: [{ label: "Str", value: 2 }], dice: [], advantage: [], disadvantage: [], suggestions: [{ label: "Shillelagh", effect: "d8", apply: { flat: 1, dice: [], weaponDice: "1d8" } }] };
    const c = composeDamage("1d6", "bludgeoning", base, { enabled: ["Shillelagh"], manual: "none", extra: 0 });
    expect(c.terms[0]).toMatchObject({ kind: "dice", count: 1, sides: 8 });
  });

  it("changing background drops the old one's picks", () => {
    const log = monk();
    log.record("setDetails", { background: "background:acolyte" });
    log.character.choices["background:acolyte"] = { languages: ["Elvish"] } as never;
    log.record("setDetails", { background: "background:folk-hero" });
    expect(log.character.background).toBe("background:folk-hero");
    expect(log.character.choices["background:acolyte"]).toBeUndefined();
  });
});
