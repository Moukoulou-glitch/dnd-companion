import { Character, CombatState, type Operation } from "@dnd/schema";
import { castingEconomy, derive, type ContentRegistry } from "@dnd/engine";

/** Something the player should do next, e.g. roll a concentration check. */
export type Prompt = { kind: "concentration"; dc: number; spell: string };

/** What changed, in words the UI can show as a toast or reminder. */
export interface ApplyResult {
  character: Character;
  notes: string[];
  prompts: Prompt[];
}

/** Ends concentration and every effect that depended on it. */
function endConcentration(c: Character, notes: string[], why: string) {
  if (!c.concentration) return;
  notes.push(`${why} Concentration on ${c.concentration.name} ended.`);
  delete c.concentration;
  c.effects = c.effects.filter((e) => !e.concentration);
}

const clone = <T>(v: T): T => structuredClone(v);

/**
 * Applies one operation to a character and returns the new character.
 * Pure: the input is never modified. Nothing is ever refused: impossible
 * requests (spending a use you don't have) are clamped and explained in
 * `notes`, because the player and DM always have the final say.
 */
export function applyOperation(input: Character, op: Operation, reg: ContentRegistry): ApplyResult {
  const c = clone(input);
  const notes: string[] = [];
  const prompts: Prompt[] = [];
  const sheet = derive(c, reg);
  const maxHp = sheet.hpMax.total;

  /** The companion an HP operation targets, with its current HP filled in. */
  const companionTarget = (id: string | undefined) => {
    if (!id) return undefined;
    const comp = sheet.companions.find((x) => x.id === id);
    if (!comp?.form) {
      notes.push(comp ? `${comp.name} has no form yet: choose one first.` : `No companion "${id}".`);
      return null;
    }
    const state = (c.companions[id] ??= {});
    state.hp ??= { current: comp.form.hpMax.total, temp: 0 };
    return { comp, state: state as typeof state & { hp: { current: number; temp: number } }, max: comp.form.hpMax.total };
  };

  /** Marks part of the turn as used when in combat; the Play screen already warned if it was spent. */
  const spendTurn = (economy: string, extra?: (cb: NonNullable<Character["combat"]>) => void) => {
    const cb = c.combat;
    if (!cb) return;
    if (economy === "action") cb.action += 1;
    else if (economy === "bonus") cb.bonus += 1;
    else if (economy === "reaction") cb.reaction += 1;
    extra?.(cb);
  };

  switch (op.type) {
    case "damage": {
      const { amount, damageType } = op.payload;
      if (op.payload.companion) {
        const t = companionTarget(op.payload.companion);
        if (!t) break;
        const absorbed = Math.min(t.state.hp.temp, amount);
        t.state.hp.temp -= absorbed;
        t.state.hp.current = Math.max(0, t.state.hp.current - (amount - absorbed));
        notes.push(`${t.comp.name}: ${t.state.hp.current} of ${t.max} HP.`);
        if (t.state.hp.current === 0) notes.push(`${t.comp.name} drops to 0 HP and dies.${t.comp.reviveNote ? ` ${t.comp.reviveNote}` : ""}`);
        break;
      }
      let dmg = amount;
      if (damageType) {
        if (sheet.defenses.immune.includes(damageType)) {
          dmg = 0;
          notes.push(`Immune to ${damageType}: no damage.`);
        } else {
          if (sheet.defenses.resist.includes(damageType)) {
            dmg = Math.floor(dmg / 2);
            notes.push(`Resistant to ${damageType}: ${amount} halved to ${dmg}.`);
          }
          if (sheet.defenses.vulnerable.includes(damageType)) {
            dmg *= 2;
            notes.push(`Vulnerable to ${damageType}: doubled to ${dmg}.`);
          }
        }
      }
      if (dmg === 0) break;

      const wasAtZero = c.hp.current === 0;
      const concentrating = c.concentration;
      const absorbed = Math.min(c.hp.temp, dmg);
      c.hp.temp -= absorbed;
      const rest = dmg - absorbed;
      if (absorbed > 0) notes.push(`Temporary HP absorbed ${absorbed}.`);

      if (wasAtZero && rest > 0) {
        if (rest >= maxHp) {
          notes.push(`${rest} damage at 0 HP is at least your HP maximum (${maxHp}): instant death.`);
          c.deathSaves.failures = 3;
        } else {
          c.deathSaves.failures = Math.min(3, c.deathSaves.failures + 1);
          notes.push("Damage at 0 HP: one death save failure (two if it was a critical hit).");
        }
        break;
      }

      const before = c.hp.current;
      c.hp.current = Math.max(0, before - rest);
      if (concentrating) {
        if (c.hp.current === 0) endConcentration(c, notes, "Dropped to 0 HP.");
        // 2014: DC 10 or half the damage taken, whichever is higher. Temp HP still count as damage taken.
        else prompts.push({ kind: "concentration", dc: Math.max(10, Math.floor(dmg / 2)), spell: concentrating.name });
      }
      if (c.hp.current === 0 && before > 0) {
        const overflow = rest - before;
        if (overflow >= maxHp) {
          notes.push(`Massive damage: ${overflow} left over is at least your HP maximum (${maxHp}): instant death.`);
          c.deathSaves.failures = 3;
        } else {
          notes.push("Dropped to 0 HP: unconscious. Death saves start on your turn.");
        }
      }
      break;
    }

    case "heal": {
      if (op.payload.companion) {
        const t = companionTarget(op.payload.companion);
        if (!t) break;
        if (t.state.hp.current === 0) notes.push(`${t.comp.name} is dead: healing doesn't bring it back. Revive it instead.`);
        else t.state.hp.current = Math.min(t.max, t.state.hp.current + op.payload.amount);
        break;
      }
      const before = c.hp.current;
      c.hp.current = Math.min(maxHp, before + op.payload.amount);
      if (before === 0 && c.hp.current > 0) {
        c.deathSaves = { successes: 0, failures: 0 };
        notes.push("Back on your feet: death saves cleared.");
      }
      if (before + op.payload.amount > maxHp) notes.push(`Healing capped at your maximum of ${maxHp}.`);
      break;
    }

    case "setTempHp": {
      if (op.payload.companion) {
        const t = companionTarget(op.payload.companion);
        if (!t) break;
        if (op.payload.amount === 0 || op.payload.amount > t.state.hp.temp) t.state.hp.temp = op.payload.amount;
        else notes.push(`Temporary HP don't stack: keeping ${t.state.hp.temp}.`);
        break;
      }
      const { amount } = op.payload;
      if (amount === 0) c.hp.temp = 0;
      else if (amount > c.hp.temp) c.hp.temp = amount;
      else notes.push(`Temporary HP don't stack: keeping ${c.hp.temp}, the higher value.`);
      break;
    }

    case "setHp":
      c.hp.current = Math.max(0, Math.min(maxHp, op.payload.current));
      break;

    case "spendResource": {
      const r = sheet.resources.find((x) => x.id === op.payload.resource);
      if (!r) {
        notes.push(`Unknown resource "${op.payload.resource}".`);
        break;
      }
      const used = c.resourcesUsed[r.id] ?? 0;
      const next = Math.min(r.max, used + op.payload.amount);
      if (used + op.payload.amount > r.max) notes.push(`${r.name}: no uses left (${r.max} maximum). Recorded as fully used.`);
      c.resourcesUsed[r.id] = next;
      break;
    }

    case "restoreResource": {
      const id = op.payload.resource;
      c.resourcesUsed[id] = Math.max(0, (c.resourcesUsed[id] ?? 0) - op.payload.amount);
      break;
    }

    case "spendSlot": {
      const { level, pact } = op.payload;
      if (pact) {
        const total = sheet.pactSlots?.level === level ? sheet.pactSlots.count : 0;
        if (c.pactSlotsUsed >= total) notes.push(`No Pact Magic slots of level ${level} left.`);
        else c.pactSlotsUsed += 1;
      } else {
        const total = sheet.spellSlots.find((s) => s.level === level)?.total ?? 0;
        const used = c.slotsUsed[String(level)] ?? 0;
        if (used >= total) notes.push(`No level ${level} slots left.`);
        else c.slotsUsed[String(level)] = used + 1;
      }
      break;
    }

    case "restoreSlot": {
      const { level, pact } = op.payload;
      if (pact) c.pactSlotsUsed = Math.max(0, c.pactSlotsUsed - 1);
      else c.slotsUsed[String(level)] = Math.max(0, (c.slotsUsed[String(level)] ?? 0) - 1);
      break;
    }

    case "spendHitDie": {
      const { die, roll } = op.payload;
      const pool = sheet.hitDice.find((h) => h.die === die);
      const used = c.hitDiceUsed[die] ?? 0;
      if (!pool || used >= pool.total) {
        notes.push(`No ${die} Hit Dice left.`);
        break;
      }
      c.hitDiceUsed[die] = used + 1;
      const healed = Math.max(0, roll + sheet.abilities.con.modifier);
      const before = c.hp.current;
      c.hp.current = Math.min(maxHp, before + healed);
      notes.push(`Hit Die ${die}: ${roll} + Constitution ${sheet.abilities.con.modifier} = ${healed} HP.`);
      break;
    }

    case "rest": {
      const kind = op.payload.kind;
      const resets = kind === "short" ? ["short"] : ["short", "long", "dawn"];
      const restored = sheet.resources.filter((r) => resets.includes(r.reset) && r.used > 0).map((r) => r.name);
      for (const r of sheet.resources) if (resets.includes(r.reset)) delete c.resourcesUsed[r.id];
      if (c.pactSlotsUsed > 0) restored.push("Pact Magic slots");
      c.pactSlotsUsed = 0;

      if (kind === "long") {
        if (Object.values(c.slotsUsed).some((n) => n > 0)) restored.push("Spell slots");
        c.slotsUsed = {};
        c.hp.current = maxHp;
        c.hp.temp = 0;
        c.deathSaves = { successes: 0, failures: 0 };
        // Regain spent Hit Dice up to half the character's total (minimum 1), largest dice first.
        let regain = Math.max(1, Math.floor(sheet.level / 2));
        const pools = [...sheet.hitDice].sort((a, b) => Number(b.die.slice(1)) - Number(a.die.slice(1)));
        for (const p of pools) {
          const spent = c.hitDiceUsed[p.die] ?? 0;
          const back = Math.min(spent, regain);
          if (back > 0) c.hitDiceUsed[p.die] = spent - back;
          regain -= back;
        }
        for (const comp of sheet.companions) if (c.companions[comp.id]) delete c.companions[comp.id]!.hp;
        notes.push("Long rest: HP full, spell slots and long-rest features restored, half your Hit Dice regained.");
      }
      if (restored.length) notes.push(`Restored: ${restored.join(", ")}.`);
      break;
    }

    case "useAction": {
      const a = sheet.actions.find((x) => x.id === op.payload.action);
      if (!a) {
        notes.push(`Unknown feature "${op.payload.action}".`);
        break;
      }
      if (a.cost) {
        const used = c.resourcesUsed[a.cost.resource] ?? 0;
        const max = sheet.resources.find((r) => r.id === a.cost!.resource)?.max ?? 0;
        if (a.cost.remaining < a.cost.amount) notes.push(`${a.cost.name}: none left. Used anyway.`);
        c.resourcesUsed[a.cost.resource] = Math.min(max, used + a.cost.amount);
      }
      if (a.toggles.length) c.toggles = [...new Set([...c.toggles, ...a.toggles])];
      spendTurn(a.economy);
      const rolled = op.payload.rolled;
      if (a.tempHp && rolled !== undefined) {
        if (rolled > c.hp.temp) {
          c.hp.temp = rolled;
          notes.push(`${rolled} temporary HP.`);
        } else notes.push(`Temporary HP don't stack: keeping ${c.hp.temp}, the higher value.`);
      }
      if (a.heal && rolled !== undefined) {
        const before = c.hp.current;
        c.hp.current = Math.min(maxHp, before + rolled);
        if (before === 0 && c.hp.current > 0) c.deathSaves = { successes: 0, failures: 0 };
        notes.push(`Healed ${c.hp.current - before}.`);
      }
      break;
    }

    case "addItem": {
      const { instanceId, item, quantity, name } = op.payload;
      if (c.inventory.some((i) => i.id === instanceId)) break;
      const entry: Character["inventory"][number] = { id: instanceId, item, quantity, equipped: false, attuned: false };
      if (name) entry.name = name;
      c.inventory.push(entry);
      break;
    }

    case "removeItem": {
      c.inventory = c.inventory.filter((i) => i.id !== op.payload.instanceId);
      break;
    }

    case "setItem": {
      const { instanceId, quantity, equipped, attuned, name } = op.payload;
      const inst = c.inventory.find((i) => i.id === instanceId);
      if (!inst) {
        notes.push("That item is no longer in the inventory.");
        break;
      }
      const def = reg.get(inst.item, "item");
      if (quantity !== undefined) inst.quantity = quantity;
      if (name !== undefined) inst.name = name || undefined;
      if (equipped !== undefined) {
        inst.equipped = equipped;
        // Only one suit of armor and one shield at a time: wearing a new one takes the old one off.
        if (equipped && (def.category === "armor" || def.category === "shield")) {
          for (const other of c.inventory) {
            if (other === inst || !other.equipped) continue;
            if (reg.get(other.item, "item").category === def.category) {
              other.equipped = false;
              notes.push(`${other.name ?? reg.get(other.item, "item").name} taken off.`);
            }
          }
        }
        if (!equipped && inst.attuned && def.requiresAttunement) notes.push("Still attuned, but its magic works only while equipped.");
      }
      if (attuned !== undefined) {
        inst.attuned = attuned;
        if (attuned && !def.requiresAttunement) notes.push(`${def.name} doesn't need attunement.`);
        const count = c.inventory.filter((i) => i.attuned).length;
        if (attuned && count > 3) notes.push(`${count} items attuned; the limit is 3.`);
      }
      break;
    }

    case "adjustCurrency": {
      const { coin, delta } = op.payload;
      const before = c.currency[coin] ?? 0;
      if (before + delta < 0) notes.push(`Only ${before} ${coin}. Set to 0.`);
      c.currency[coin] = Math.max(0, before + delta);
      break;
    }

    case "castSpell": {
      const { spell, list, level, using, selfEffect } = op.payload;
      const sp = sheet.spells.find((x) => x.id === spell && x.list.id === list);
      if (!sp) {
        notes.push("That spell isn't on this character's lists.");
        break;
      }
      if (using === "slot") {
        const total = sheet.spellSlots.find((x) => x.level === level)?.total ?? 0;
        const used = c.slotsUsed[String(level)] ?? 0;
        if (used >= total) notes.push(`No level ${level} slots left. Cast anyway.`);
        else c.slotsUsed[String(level)] = used + 1;
      } else if (using === "pact") {
        if (!sp.cast.pact || sp.cast.pact.remaining <= 0) notes.push("No Pact Magic slots left. Cast anyway.");
        else c.pactSlotsUsed += 1;
      } else if (using === "free") {
        const f = sp.cast.free;
        if (!f) notes.push(`${sp.name} has no free use here. Cast anyway.`);
        else {
          const max = sheet.resources.find((r) => r.id === f.resource)?.max ?? 0;
          if (f.remaining <= 0) notes.push(`${f.name}: none left. Cast anyway.`);
          c.resourcesUsed[f.resource] = Math.min(max, (c.resourcesUsed[f.resource] ?? 0) + 1);
        }
      } else if (using === "ritual" && !sp.ritual) {
        notes.push(`${sp.name} isn't a ritual.`);
      }
      if (sp.ready === "not prepared") notes.push(`${sp.name} isn't prepared today.`);
      if (sp.concentration) {
        if (c.concentration && c.concentration.spell !== sp.id) endConcentration(c, notes, `Casting ${sp.name}.`);
        else if (c.concentration) c.effects = c.effects.filter((e) => !e.concentration);
        c.concentration = { spell: sp.id, name: sp.name };
      }
      const economy = using === "ritual" ? "free" : castingEconomy(sp.castingTime);
      spendTurn(economy, (cb) => {
        if (economy === "bonus") cb.bonusSpell = true;
        if (economy === "action" && sp.level > 0) cb.leveledActionSpell = true;
      });
      const effectId = sp.id.replace(/^spell:/, "effect:");
      const selfDef = reg.find(effectId, "effect");
      if (selfEffect && selfDef) {
        const def = selfDef;
        const entry: Character["effects"][number] = { id: `${op.id}-effect`, effect: effectId, from: "Your own spell" };
        if (def.rounds) entry.rounds = def.rounds;
        if (sp.concentration) entry.concentration = true;
        c.effects.push(entry);
      }
      break;
    }

    case "endConcentration": {
      endConcentration(c, notes, "");
      if (notes.length) notes[notes.length - 1] = notes[notes.length - 1]!.trim();
      break;
    }

    case "setPrepared": {
      const { spell, list, prepared } = op.payload;
      const inst = c.spells.find((x) => x.spell === spell && x.list === list);
      if (!inst) {
        notes.push("That spell isn't on this character's lists.");
        break;
      }
      inst.prepared = prepared;
      const sc = sheet.spellcasting.find((x) => x.id === list);
      if (prepared && sc?.prepared && sc.prepared.count + 1 > sc.prepared.max) {
        notes.push(`${sc.prepared.count + 1} spells prepared; ${sc.label} can prepare ${sc.prepared.max}.`);
      }
      break;
    }

    case "addEffect": {
      const { instanceId, custom, rounds, level, from } = op.payload;
      const effect = op.payload.effect === "custom" ? "custom" : reg.effectId(op.payload.effect);
      if (c.effects.some((e) => e.id === instanceId)) break;
      const def = effect !== "custom" ? reg.find(effect, "effect") : undefined;
      const existing = def ? c.effects.find((e) => e.effect === effect) : undefined;
      if (def && existing && def.levels) {
        // Exhaustion stacks as levels rather than copies.
        existing.level = Math.min(def.levels.length, (existing.level ?? 1) + (level ?? 1));
        notes.push(`${def.name} is now level ${existing.level}.`);
        if (existing.level >= def.levels.length && def.id === "condition:exhaustion") notes.push("Exhaustion 6: the character dies.");
        break;
      }
      if (def?.category === "condition" && existing) {
        notes.push(`Already ${def.name.toLowerCase()}.`);
        break;
      }
      const entry: Character["effects"][number] = { id: instanceId, effect };
      if (custom) entry.custom = custom;
      const r = rounds ?? def?.rounds;
      if (r !== undefined) entry.rounds = r;
      if (def?.levels) entry.level = Math.min(def.levels.length, level ?? 1);
      if (from) entry.from = from;
      c.effects.push(entry);
      // Incapacitating conditions break concentration.
      const incapacitates = def && (def.id === "condition:incapacitated" || def.includes.includes("condition:incapacitated"));
      if (incapacitates) endConcentration(c, notes, `${def!.name}.`);
      break;
    }

    case "removeEffect": {
      c.effects = c.effects.filter((e) => e.id !== op.payload.instanceId);
      break;
    }

    case "updateEffect": {
      const e = c.effects.find((x) => x.id === op.payload.instanceId);
      if (!e) break;
      const { rounds, level } = op.payload;
      if (rounds === null) delete e.rounds;
      else if (rounds !== undefined) e.rounds = rounds;
      if (level !== undefined) e.level = level;
      break;
    }

    case "endTurn": {
      const ended: string[] = [];
      c.effects = c.effects.filter((e) => {
        if (e.rounds === undefined) return true;
        e.rounds -= 1;
        if (e.rounds > 0) return true;
        ended.push(e.custom?.name ?? reg.find(reg.effectId(e.effect), "effect")?.name ?? e.effect);
        return false;
      });
      if (ended.length) notes.push(`Ended: ${ended.join(", ")}.`);
      if (c.combat) c.combat.myTurn = false;
      if (c.toggles.includes("raging")) notes.push("Still raging? It ends if you didn't attack a hostile creature or take damage since your last turn.");
      break;
    }

    case "startCombat": {
      if (c.combat) notes.push("Already in combat.");
      else c.combat = CombatState.parse({});
      notes.push("Roll initiative.");
      break;
    }

    case "startTurn": {
      const prev = c.combat;
      const round = !prev ? 1 : prev.hadTurn && !prev.myTurn ? prev.round + 1 : prev.round;
      if (prev?.myTurn) notes.push("Your turn had already started: everything is back for a fresh turn.");
      c.combat = CombatState.parse({ round, myTurn: true, hadTurn: true });
      notes.push(`Round ${round}: action, bonus action, reaction and movement are back.`);
      break;
    }

    case "endCombat": {
      if (!c.combat) notes.push("Not in combat.");
      delete c.combat;
      const timed = c.effects.filter((e) => e.rounds !== undefined);
      if (timed.length) notes.push(`Still running: ${timed.map((e) => e.custom?.name ?? reg.find(reg.effectId(e.effect), "effect")?.name ?? e.effect).join(", ")}.`);
      break;
    }

    case "useEconomy": {
      const { kind, amount, dash } = op.payload;
      const cb = c.combat;
      if (!cb) {
        notes.push("Not in combat: nothing to track.");
        break;
      }
      const add = (n: number) => Math.max(0, n + amount);
      if (kind === "attack") {
        // The first attack of the turn uses the action; taking the last one back returns it.
        const before = cb.attacks;
        cb.attacks = add(cb.attacks);
        if (before === 0 && cb.attacks > 0) cb.action += 1;
        if (before > 0 && cb.attacks === 0) cb.action = Math.max(0, cb.action - 1);
      } else if (kind === "move") cb.moved = add(cb.moved);
      else cb[kind] = add(cb[kind]);
      if (dash) cb.dashes = Math.max(0, cb.dashes + Math.sign(amount));
      break;
    }

    case "setCompanion": {
      const { companion, form, name } = op.payload;
      const comp = sheet.companions.find((x) => x.id === companion);
      if (!comp) {
        notes.push(`No companion "${companion}".`);
        break;
      }
      const state = (c.companions[companion] ??= {});
      if (form !== undefined && form !== state.form) {
        state.form = form;
        delete state.hp;
        notes.push(`${comp.forms.find((f) => f.id === form)?.name ?? form} arrives with full hit points.`);
      }
      if (name !== undefined) state.name = name;
      break;
    }

    case "reviveCompanion": {
      const { companion, level, pact } = op.payload;
      const t = companionTarget(companion);
      if (!t) break;
      if (pact) {
        if (!sheet.pactSlots || c.pactSlotsUsed >= sheet.pactSlots.count) notes.push("No Pact Magic slots left. Revived anyway.");
        else c.pactSlotsUsed += 1;
      } else {
        const total = sheet.spellSlots.find((x) => x.level === level)?.total ?? 0;
        const used = c.slotsUsed[String(level)] ?? 0;
        if (used >= total) notes.push(`No level ${level} slots left. Revived anyway.`);
        else c.slotsUsed[String(level)] = used + 1;
      }
      spendTurn("action");
      t.state.hp = { current: t.max, temp: 0 };
      notes.push(`${t.comp.name} returns after 1 minute with all ${t.max} hit points.`);
      break;
    }

    case "deathSave": {
      const ds = c.deathSaves;
      switch (op.payload.result) {
        case "success":
          ds.successes = Math.min(3, ds.successes + 1);
          break;
        case "failure":
          ds.failures = Math.min(3, ds.failures + 1);
          break;
        case "critFailure":
          ds.failures = Math.min(3, ds.failures + 2);
          break;
        case "critSuccess":
          c.hp.current = 1;
          c.deathSaves = { successes: 0, failures: 0 };
          notes.push("Natural 20: back up with 1 HP.");
          break;
      }
      if (c.deathSaves.successes === 3) notes.push("Three successes: stable at 0 HP.");
      if (c.deathSaves.failures === 3) notes.push("Three failures: the character dies.");
      break;
    }

    case "toggle": {
      const { name, on } = op.payload;
      const set = new Set(c.toggles);
      if (on) set.add(name);
      else set.delete(name);
      c.toggles = [...set];
      break;
    }

    case "setField": {
      const { path, value } = op.payload;
      let target: Record<string | number, unknown> = c as unknown as Record<string, unknown>;
      for (const key of path.slice(0, -1)) {
        const next = target[key];
        if (next === null || typeof next !== "object") throw new Error(`Path ${path.join(".")} does not exist`);
        target = next as Record<string | number, unknown>;
      }
      target[path.at(-1)!] = value;
      // Edits must still produce a valid character.
      return { character: Character.parse(c), notes, prompts };
    }
  }

  // A lower HP maximum (Exhaustion 4, Aid ending) pulls current HP down with it.
  if (["addEffect", "removeEffect", "updateEffect", "endTurn", "setItem", "removeItem"].includes(op.type)) {
    const newMax = derive(c, reg).hpMax.total;
    if (c.hp.current > newMax) {
      c.hp.current = newMax;
      notes.push(`HP lowered to the new maximum of ${newMax}.`);
    }
  }

  return { character: c, notes, prompts };
}
