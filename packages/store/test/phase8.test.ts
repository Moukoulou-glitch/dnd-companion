import { describe, expect, it } from "vitest";
import { derive, newCharacter, turnWarnings } from "@dnd/engine";
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

describe("extras: what the table gives beyond the rules", () => {
  it("a skill, a feat and a spell, each with a tag and a reason", async () => {
    const { choiceOptions } = await import("@dnd/engine");
    const log = logOf(loadCharacter("agaklis"));
    const before = sheetOf(log);
    const sk = (["persuasion", "arcana", "history", "religion"] as const).find((s) => before.skills[s].proficiency === 0)!;
    log.record("addExtra", { id: "x1", kind: "skill", value: sk, tag: "Roleplay", reason: "Talked the duke down." });
    let sheet = sheetOf(log);
    expect(sheet.skills[sk].proficiency).toBe(1);
    expect(sheet.extras[0]).toMatchObject({ name: expect.any(String), tag: "Roleplay", reason: "Talked the duke down." });

    log.record("addExtra", { id: "x2", kind: "feat", value: "feat:durable", tag: "Reward", reason: "Survived the ambush." });
    sheet = sheetOf(log);
    expect(sheet.features.some((f) => f.id === "feat:durable")).toBe(true);

    log.record("addExtra", { id: "x3", kind: "spell", value: "spell:light", ability: "wis", tag: "Backstory", reason: "Raised in a temple." });
    sheet = sheetOf(log);
    expect(sheet.spells.find((s) => s.id === "spell:light")).toBeTruthy();
    expect(sheet.spellcasting.find((s) => s.id === "extra-x3")?.ability).toBe("wis");

    log.record("updateExtra", { id: "x1", tag: "DM allows", reason: "The DM said so." });
    expect(sheetOf(log).extras.find((x) => x.id === "x1")).toMatchObject({ tag: "DM allows", reason: "The DM said so." });
    log.record("removeExtra", { id: "x1" });
    expect(sheetOf(log).skills[sk].proficiency).toBe(0);

    log.record("setExtraNote", { key: "race:x|skills", tag: "House rule", reason: "Everyone gets one more." });
    expect(log.character.extraNotes["race:x|skills"]).toEqual({ tag: "House rule", reason: "Everyone gets one more." });
    log.record("setExtraNote", { key: "race:x|skills" });
    expect(log.character.extraNotes["race:x|skills"]).toBeUndefined();

    // Book of Ancient Secrets offers only rituals.
    const ritualChoice = reg.get("feature:eldritch-invocation-book-of-ancient-secrets", "feature").choices![0]!;
    const opts = choiceOptions(ritualChoice, reg);
    expect(opts.length).toBeGreaterThan(0);
    expect(opts.every((o) => reg.get(o.value, "spell").ritual && reg.get(o.value, "spell").level === 1)).toBe(true);
  });
});

describe("material components and the spellbook", () => {
  it("a costly component is asked about; a consumed one can be used up", async () => {
    const { materialNeed } = await import("@dnd/engine");
    expect(materialNeed("A pearl worth at least 100gp and an owl feather.")).toEqual({ costly: true, consumed: false });
    expect(materialNeed("Holy water or powdered silver and iron, which the spell consumes.")).toEqual({ costly: false, consumed: true });
    expect(materialNeed("A bit of fleece.")).toBeUndefined();

    const log = logOf(loadCharacter("agaklis"));
    log.record("addExtra", { id: "r", kind: "spell", value: "spell:revivify", ability: "wis", tag: "DM allows", reason: "Temple blessing." });
    const comp = sheetOf(log).components.find((x) => x.spell === "spell:revivify")!;
    expect(comp).toMatchObject({ consumed: true, costly: true, have: false });
    const sp = sheetOf(log).spells.find((s) => s.id === "spell:revivify")!;
    const cast = (consume?: boolean) =>
      log.record("castSpell", { spell: sp.id, list: sp.list.id, level: 3, using: "none", selfEffect: false, ...(consume ? { consumeComponent: true } : {}) }).join(" ");
    expect(cast()).toMatch(/don't have the material component/);
    log.record("setComponent", { spell: sp.id, have: true });
    expect(cast()).not.toMatch(/material component/);
    expect(sheetOf(log).components[0]!.have).toBe(true);
    expect(cast(true)).toMatch(/used up/);
    expect(sheetOf(log).components.find((x) => x.spell === sp.id)!.have).toBe(false);
  });

  it("copying into a spellbook costs 50 gp a level, half for the school's savant", async () => {
    const { copyCost } = await import("@dnd/engine");
    const wiz = newWizard();
    expect(copyCost(wiz, reg, "spell:fireball")).toEqual({ gp: 150 });
    wiz.classes[0] = { ...wiz.classes[0]!, level: 2, subclass: "subclass:evocation" };
    expect(copyCost(wiz, reg, "spell:fireball")?.gp).toBe(75);
    expect(copyCost(wiz, reg, "spell:fire-bolt")).toBeUndefined();
    const log = logOf(wiz);
    log.record("setSpellbookFunds", { gp: 100 });
    expect(log.record("learnSpell", { spell: "spell:fireball", list: "wizard", cost: 75 }).join(" ")).toMatch(/25 gp left/);
    expect(log.character.spellbookFunds).toBe(25);
  });

  it("a spent Hit Die can come back by hand", () => {
    const log = logOf(loadCharacter("agaklis"));
    const die = sheetOf(log).hitDice[0]!.die;
    log.record("spendHitDie", { die, roll: 5 });
    expect(log.character.hitDiceUsed[die]).toBe(1);
    log.record("restoreHitDie", { die });
    expect(log.character.hitDiceUsed[die]).toBe(0);
  });
});

function newWizard(): Character {
  return newCharacter({ id: "w", name: "Wiz", race: "race:human", class: "class:wizard", abilities: { str: 8, dex: 14, con: 12, int: 15, wis: 13, cha: 10 } }, reg);
}
