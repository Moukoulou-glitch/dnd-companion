import { describe, expect, it } from "vitest";
import { derive, turnWarnings } from "@dnd/engine";
import type { Character } from "@dnd/schema";
import { CharacterLog } from "../src/log.js";
import { HybridClock } from "../src/clock.js";
import { loadCharacter, tableRegistry } from "../../engine/test/helpers.js";

const reg = tableRegistry();
let t = 1_700_000_000_000;
const logOf = (c: Character) => new CharacterLog(c, reg, new HybridClock("test", () => (t += 1000)), "player");
const sheetOf = (log: CharacterLog) => derive(log.character, reg);

describe("Haste", () => {
  const hasted = () => {
    const log = logOf(loadCharacter("agaklis"));
    log.record("addEffect", { instanceId: "haste", effect: "effect:haste" });
    log.record("startCombat", {});
    log.record("startTurn", {});
    return log;
  };

  it("gives its own extra action while it lasts", () => {
    const log = hasted();
    const a = sheetOf(log).actions.find((x) => x.id === "haste-action");
    expect(a).toMatchObject({ limited: true, choose: { options: ["Attack (one weapon attack)", "Dash", "Disengage", "Hide", "Use an Object"] } });
    log.record("removeEffect", { instanceId: "haste" });
    expect(sheetOf(log).actions.find((x) => x.id === "haste-action")).toBeUndefined();
  });

  it("the extra Attack is one weapon attack that doesn't use your Attack action", () => {
    const log = hasted();
    const sheet = sheetOf(log);
    const w = sheet.attacks[0]!;
    const attackWith = { attackId: w.attackId, melee: true, light: false };
    // Your own Attack action, all of it.
    for (let i = 0; i < sheet.attacksPerAction; i++) log.record("useEconomy", { kind: "attack", attackWith });
    expect(turnWarnings(log.character, sheetOf(log), { name: w.name, economy: "action", attack: true, weapon: { attackId: w.attackId, light: false } })).not.toEqual([]);
    log.record("useAction", { action: "haste-action", choice: "Attack (one weapon attack)" });
    expect(log.character.combat!.hasteAttack).toBe(true);
    expect(turnWarnings(log.character, sheetOf(log), { name: w.name, economy: "action", attack: true, weapon: { attackId: w.attackId, light: false } })).toEqual([]);
    const before = { ...log.character.combat! };
    const notes = log.record("useEconomy", { kind: "attack", attackWith });
    expect(notes.join(" ")).toMatch(/Haste's extra action/);
    expect(log.character.combat).toMatchObject({ hasteAttack: false, action: before.action, attacks: before.attacks });
  });

  it("Dash adds your speed; a second use this turn is flagged", () => {
    const log = hasted();
    log.record("useAction", { action: "haste-action", choice: "Dash" });
    expect(log.character.combat!.dashes).toBe(1);
    expect(log.record("useAction", { action: "haste-action", choice: "Hide" }).join(" ")).toMatch(/already used Hasted action/);
  });

  it("says what happens when it ends", () => {
    const log = hasted();
    expect(log.record("removeEffect", { instanceId: "haste" }).join(" ")).toMatch(/Haste ends: you can't move or take actions until after your next turn/);
  });
});

describe("picking more than the rules give", () => {
  it("skills, languages and spells can go over, with a flag; feats stay strict", async () => {
    const { buildItems } = await import("@dnd/engine");
    const log = logOf(loadCharacter("beren"));
    const items = buildItems(log.character, reg);
    const feat = items.filter((i) => i.source?.startsWith("feat:") || i.source === "feature:magic-initiate-cleric");
    expect(feat.length).toBeGreaterThan(0);
    expect(feat.every((i) => i.strict)).toBe(true);
    const skills = items.find((i) => i.kind === "choice" && i.choice?.kind === "skill" && !i.source?.startsWith("feat"))!;
    expect(skills.strict).toBeUndefined();
    const extra = ["acrobatics", "arcana", "history", "nature", "religion"].filter((s) => !skills.picked.includes(s));
    log.record("setChoice", { source: skills.source!, choice: skills.choice!.id, values: [...skills.picked, ...extra].slice(0, skills.need + 1) });
    const again = buildItems(log.character, reg).find((i) => i.key === skills.key)!;
    expect(again).toMatchObject({ over: true, done: true });
    const added = [...skills.picked, ...extra].slice(0, skills.need + 1).at(-1)!;
    expect(sheetOf(log).skills[added as "arcana"].proficiency).toBeGreaterThan(0);
  });
});
