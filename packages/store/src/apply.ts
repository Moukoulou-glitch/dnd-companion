import { Character, CombatState, type Operation } from "@dnd/schema";
import { castingEconomy, derive, evalFlat, type ContentRegistry } from "@dnd/engine";

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

  const effectName = (e: Character["effects"][number]) => e.custom?.name ?? reg.find(reg.effectId(e.effect), "effect")?.name ?? e.effect;

  /** Removes effects, switching off the states they kept on (Rage's "raging"). */
  const removeEffects = (gone: Character["effects"]) => {
    if (!gone.length) return;
    // Temporary HP that came with the effect (Armor of Agathys) go when it ends.
    for (const e of gone) {
      const def = e.effect === "custom" ? undefined : reg.find(reg.effectId(e.effect), "effect");
      if (def?.tempHpGain === undefined || c.hp.temp === 0) continue;
      const amount = atLevel(def.tempHpGain, e.castLevel ?? def.upcast?.baseLevel ?? 1);
      if (c.hp.temp <= amount) {
        notes.push(`${def.name} ends: its ${c.hp.temp} temporary HP go with it.`);
        c.hp.temp = 0;
      }
    }
    const ids = new Set(gone.map((e) => e.id));
    c.effects = c.effects.filter((e) => !ids.has(e.id));
    const off = new Set(gone.flatMap((e) => e.toggles ?? []));
    if (off.size) c.toggles = c.toggles.filter((t) => !off.has(t));
  };

  /** Current HP gained when an effect starts (Aid), worked out at its cast level. */
  const atLevel = (expr: string | number, slotLevel: number) =>
    evalFlat(expr, { pb: sheet.proficiencyBonus, mods: Object.fromEntries(Object.entries(sheet.abilities).map(([k, v]) => [k, v.modifier])) as never, level: sheet.level, classLevels: {}, slotLevel });

  /**
   * The same spell's effects don't combine (PHB p. 205): a second casting
   * replaces the first, keeping the more potent level and the newer duration.
   */
  const combineSame = (entry: Character["effects"][number], name: string) => {
    const same = c.effects.filter((e) => e.effect === entry.effect);
    if (!same.length) return;
    const higher = Math.max(entry.castLevel ?? 0, ...same.map((e) => e.castLevel ?? 0));
    if (higher > 0 && (entry.castLevel ?? 0) < higher) entry.castLevel = higher;
    const ids = new Set(same.map((e) => e.id));
    c.effects = c.effects.filter((e) => !ids.has(e.id));
    notes.push(`${name} was already on you: the same spell's effects don't combine, so you keep one${higher > 0 ? `, at level ${higher}` : ""}, with the new duration.`);
  };

  const gainHp = (def: { hpGain?: string | number; tempHpGain?: string | number; upcast?: { baseLevel: number }; name: string }, castLevel?: number) => {
    const slotLevel = castLevel ?? def.upcast?.baseLevel ?? 1;
    if (def.hpGain !== undefined) {
      const amount = atLevel(def.hpGain, slotLevel);
      if (amount > 0 && c.hp.current > 0) {
        c.hp.current += amount;
        notes.push(`${def.name}: +${amount} current HP.`);
      }
    }
    if (def.tempHpGain !== undefined) {
      const amount = atLevel(def.tempHpGain, slotLevel);
      if (amount > c.hp.temp) {
        c.hp.temp = amount;
        notes.push(`${def.name}: ${amount} temporary HP.`);
      } else notes.push(`${def.name}: temporary HP don't stack, keeping ${c.hp.temp}.`);
    }
  };

  /** Effects that remind you of something when you take damage (Armor of Agathys). */
  const damageReminders = (tempBefore: number) => {
    for (const e of [...c.effects]) {
      const def = reg.find(reg.effectId(e.effect), "effect");
      const od = def?.onDamage;
      if (!def || !od) continue;
      if (od.whileTempHp && tempBefore <= 0) continue;
      const lvl = e.castLevel ?? def.upcast?.baseLevel ?? 1;
      notes.push(od.text.replace("{amount}", od.amount !== undefined ? String(atLevel(od.amount, lvl)) : ""));
      if (od.whileTempHp && c.hp.temp === 0) {
        c.effects = c.effects.filter((x) => x.id !== e.id);
        notes.push(`${def.name}'s temporary HP are gone: it ends.`);
      }
    }
  };

  /** Time passes: long effects and concentration count down; anything reaching 0 ends. */
  const passMinutes = (minutes: number) => {
    const ended: Character["effects"] = [];
    for (const e of c.effects) {
      if (e.minutes !== undefined) {
        e.minutes = Math.max(0, e.minutes - minutes);
        if (e.minutes === 0) ended.push(e);
      } else if (e.rounds !== undefined) {
        e.rounds = Math.max(0, e.rounds - minutes * 10);
        if (e.rounds === 0) ended.push(e);
      }
    }
    if (ended.length) notes.push(`Ended: ${ended.map(effectName).join(", ")}.`);
    removeEffects(ended);
    const conc = c.concentration;
    if (conc && (conc.minutes !== undefined || conc.rounds !== undefined)) {
      if (conc.minutes !== undefined) conc.minutes = Math.max(0, conc.minutes - minutes);
      if (conc.rounds !== undefined) conc.rounds = Math.max(0, conc.rounds - minutes * 10);
      if ((conc.minutes ?? conc.rounds) === 0) endConcentration(c, notes, `${conc.name} has run its course.`);
    }
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
      const tempBefore = c.hp.temp;
      const absorbed = Math.min(c.hp.temp, dmg);
      c.hp.temp -= absorbed;
      const rest = dmg - absorbed;
      if (absorbed > 0) notes.push(`Temporary HP absorbed ${absorbed}.`);
      damageReminders(tempBefore);

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
      passMinutes(kind === "short" ? 60 : 480);
      const resets = kind === "short" ? ["short"] : ["short", "long", "dawn"];
      const restored = sheet.resources.filter((r) => resets.includes(r.reset) && r.used > 0).map((r) => r.name);
      for (const r of sheet.resources) if (resets.includes(r.reset)) delete c.resourcesUsed[r.id];
      // Rolls kept in advance (Portent) are lost when their resource comes back.
      for (const r of sheet.resources) if (r.pool && resets.includes(r.reset)) delete c.pools[r.id];
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
      const free = op.payload.free === true;
      if (a.cost && !free) {
        const used = c.resourcesUsed[a.cost.resource] ?? 0;
        const max = sheet.resources.find((r) => r.id === a.cost!.resource)?.max ?? 0;
        if (a.cost.remaining < a.cost.amount) notes.push(`${a.cost.name}: none left. Used anyway.`);
        c.resourcesUsed[a.cost.resource] = Math.min(max, used + a.cost.amount);
      }
      if (a.toggles.length) c.toggles = [...new Set([...c.toggles, ...a.toggles])];
      if (a.restores) {
        const target = sheet.resources.find((r) => r.id === a.restores!.resource);
        const used = c.resourcesUsed[a.restores.resource] ?? 0;
        if (!target || used === 0) notes.push(`${target?.name ?? a.restores.resource}: none spent, nothing to regain.`);
        else {
          c.resourcesUsed[a.restores.resource] = Math.max(0, used - a.restores.amount);
          notes.push(`${target.name}: ${Math.min(used, a.restores.amount)} regained.`);
        }
      }
      if (!free) spendTurn(a.asAttack ? "attack" : a.economy, (cb) => {
        // Grapple and Shove take the place of one attack of the Attack action.
        if (a.asAttack) {
          if (cb.attacks === 0) cb.action += 1;
          cb.attacks += 1;
          if (cb.attacks > sheet.attacksPerAction) notes.push(`That's attack ${cb.attacks} of ${sheet.attacksPerAction} for your Attack action.`);
        }
        if (a.dash) {
          cb.dashes += 1;
          notes.push(`Dash: ${sheet.speed.total * (1 + cb.dashes)} ft of movement this turn.`);
        }
        if (a.notAfterMoving && cb.moved > 0) notes.push(`You had moved ${cb.moved} ft this turn: ${a.name} needs you not to have moved.`);
        if (a.stopsMovement) cb.speedZero = a.name;
        cb.usedThisTurn = [...cb.usedThisTurn, a.id];
      });
      if (a.endsConcentration) {
        if (c.concentration) endConcentration(c, notes, "");
        else notes.push("You weren't concentrating on anything.");
      }
      if (a.untilTurnStart) {
        // One round: it ends when your next turn starts (Dodge, Ready: Attack).
        const name = op.payload.choice ? `${a.name}: ${op.payload.choice}` : a.name;
        const entry: Character["effects"][number] = { id: `${op.id}-turn`, effect: "custom", custom: { name, modifiers: [] }, from: a.source, untilTurnStart: true, rounds: 1 };
        if (a.toggles.length) entry.toggles = a.toggles;
        removeEffects(c.effects.filter((e) => e.effect === "custom" && (e.custom?.name === a.name || e.custom?.name.startsWith(`${a.name}: `))));
        c.effects.push(entry);
      }
      if (a.duration) {
        const rolledN = op.payload.rolled;
        const d = a.duration;
        const entry: Character["effects"][number] = { id: `${op.id}-timer`, effect: "custom", custom: { name: a.name, modifiers: [] }, from: a.source };
        if (d.fromRoll && rolledN !== undefined) {
          if (d.fromRoll === "rounds") entry.rounds = rolledN;
          else entry.minutes = d.fromRoll === "hours" ? rolledN * 60 : rolledN;
        } else if (d.rounds) entry.rounds = d.rounds;
        else if (d.minutes) entry.minutes = d.minutes;
        if (a.toggles.length) entry.toggles = a.toggles;
        // Using it again restarts the timer instead of stacking a second one.
        removeEffects(c.effects.filter((e) => e.effect === "custom" && e.custom?.name === a.name));
        c.effects.push(entry);
      }
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
        c.concentration = { spell: sp.id, name: sp.name, level };
        if (sp.timer?.rounds) c.concentration.rounds = sp.timer.rounds;
        if (sp.timer?.minutes) c.concentration.minutes = sp.timer.minutes;
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
        const timer = def.rounds ? { rounds: def.rounds } : def.minutes ? { minutes: def.minutes } : sp.timer;
        if (timer?.rounds) entry.rounds = timer.rounds;
        else if (timer?.minutes) entry.minutes = timer.minutes;
        if (def.upcast && level > 0) entry.castLevel = level;
        combineSame(entry, def.name);
        gainHp(def, entry.castLevel);
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
      const minutes = op.payload.minutes ?? (rounds === undefined ? def?.minutes : undefined);
      const r = rounds ?? (minutes === undefined ? def?.rounds : undefined);
      if (r !== undefined) entry.rounds = r;
      if (minutes !== undefined) entry.minutes = minutes;
      if (def?.levels) entry.level = Math.min(def.levels.length, level ?? 1);
      if (from) entry.from = from;
      if (op.payload.choice) entry.choice = op.payload.choice;
      if (op.payload.castLevel) entry.castLevel = op.payload.castLevel;
      if (def && def.category !== "condition") combineSame(entry, def.name);
      c.effects.push(entry);
      if (def?.choice && !entry.choice) notes.push(`${def.name}: choose the ${def.choice.label.toLowerCase()} on its card.`);
      if (def?.upcast && !entry.castLevel) notes.push(`Cast at a higher level? Set it on ${def.name}'s card.`);
      if (def) gainHp(def, entry.castLevel);
      // Incapacitating conditions break concentration.
      const brings = (id: string, seen = new Set<string>()): boolean => {
        if (id === "condition:incapacitated") return true;
        if (seen.has(id)) return false;
        seen.add(id);
        return (reg.find(id, "effect")?.includes ?? []).some((x) => brings(x, seen));
      };
      const incapacitates = def && brings(def.id);
      if (incapacitates) endConcentration(c, notes, `${def!.name}.`);
      break;
    }

    case "removeEffect": {
      removeEffects(c.effects.filter((e) => e.id === op.payload.instanceId));
      break;
    }

    case "updateEffect": {
      const e = c.effects.find((x) => x.id === op.payload.instanceId);
      if (!e) break;
      const { rounds, minutes, level, choice, castLevel } = op.payload;
      if (rounds === null) delete e.rounds;
      else if (rounds !== undefined) e.rounds = rounds;
      if (minutes === null) delete e.minutes;
      else if (minutes !== undefined) e.minutes = minutes;
      // An effect from your own concentration spell (Invisibility on yourself) shares the spell's clock.
      if (e.concentration && c.concentration && (rounds !== undefined || minutes !== undefined)) {
        if (rounds === null) delete c.concentration.rounds;
        else if (rounds !== undefined) c.concentration.rounds = rounds;
        if (minutes === null) delete c.concentration.minutes;
        else if (minutes !== undefined) c.concentration.minutes = minutes;
      }
      if (level !== undefined) e.level = level;
      if (choice !== undefined) e.choice = choice;
      if (castLevel !== undefined) {
        const def = reg.find(reg.effectId(e.effect), "effect");
        const before = e.castLevel ?? def?.upcast?.baseLevel ?? castLevel;
        e.castLevel = castLevel;
        // Changing Aid's level after the fact moves current HP by the difference.
        if (def?.hpGain !== undefined && def.upcast) {
          const ctxBase = { pb: sheet.proficiencyBonus, mods: Object.fromEntries(Object.entries(sheet.abilities).map(([k, v]) => [k, v.modifier])) as never, level: sheet.level, classLevels: {} };
          const diff = evalFlat(def.hpGain, { ...ctxBase, slotLevel: castLevel }) - evalFlat(def.hpGain, { ...ctxBase, slotLevel: before });
          if (diff && c.hp.current > 0) c.hp.current = Math.max(1, c.hp.current + diff);
        }
        // Armor of Agathys: its temporary HP follow the level too.
        if (def?.tempHpGain !== undefined) {
          const diff = atLevel(def.tempHpGain, castLevel) - atLevel(def.tempHpGain, before);
          if (diff) {
            c.hp.temp = Math.max(0, c.hp.temp + diff);
            notes.push(`${def.name} at level ${castLevel}: ${c.hp.temp} temporary HP.`);
          }
        }
      }
      break;
    }

    case "markOnce": {
      if (c.combat) c.combat.onceUsed = [...new Set([...c.combat.onceUsed, ...op.payload.labels])];
      break;
    }

    case "setConcentration": {
      const conc = c.concentration;
      if (!conc) {
        notes.push("Not concentrating on anything.");
        break;
      }
      const { rounds, minutes } = op.payload;
      if (rounds === null) delete conc.rounds;
      else if (rounds !== undefined) conc.rounds = rounds;
      if (minutes === null) delete conc.minutes;
      else if (minutes !== undefined) conc.minutes = minutes;
      for (const e of c.effects.filter((x) => x.concentration)) {
        if (conc.rounds !== undefined) e.rounds = conc.rounds;
        if (conc.minutes !== undefined) e.minutes = conc.minutes;
      }
      if (conc.rounds === 0 || conc.minutes === 0) endConcentration(c, notes, `${conc.name} has run its course.`);
      break;
    }

    case "passTime": {
      passMinutes(op.payload.minutes);
      break;
    }

    case "setInitiative": {
      if (!c.combat) c.combat = CombatState.parse({});
      c.combat.initiative = op.payload.value;
      break;
    }

    case "setPool": {
      c.pools[op.payload.resource] = op.payload.values;
      break;
    }

    case "usePool": {
      const { resource, index } = op.payload;
      const pool = c.pools[resource] ?? [];
      const value = pool[index];
      if (value === undefined) {
        notes.push("That roll isn't there any more.");
        break;
      }
      c.pools[resource] = pool.filter((_, i) => i !== index);
      const r = sheet.resources.find((x) => x.id === resource);
      if (r) c.resourcesUsed[resource] = Math.min(r.max, (c.resourcesUsed[resource] ?? 0) + 1);
      notes.push(`${r?.name ?? resource}: ${value} used.`);
      break;
    }

    case "endTurn": {
      const ended = c.effects.filter((e) => {
        // Dodge and Ready last until your next turn starts, not to the end of this one.
        if (e.rounds === undefined || e.untilTurnStart) return false;
        e.rounds -= 1;
        return e.rounds <= 0;
      });
      if (ended.length) notes.push(`Ended: ${ended.map(effectName).join(", ")}.`);
      removeEffects(ended);
      const conc = c.concentration;
      if (conc?.rounds !== undefined) {
        conc.rounds -= 1;
        if (conc.rounds <= 0) endConcentration(c, notes, `${conc.name} has run its course.`);
      }
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
      const ending = c.effects.filter((e) => e.untilTurnStart);
      if (ending.length) notes.push(`${ending.map(effectName).join(", ")} ended: your turn has started.`);
      removeEffects(ending);
      const round = !prev ? 1 : prev.hadTurn && !prev.myTurn ? prev.round + 1 : prev.round;
      if (prev?.myTurn) notes.push("Your turn had already started: everything is back for a fresh turn.");
      c.combat = CombatState.parse({ round, myTurn: true, hadTurn: true, ...(prev?.initiative !== undefined ? { initiative: prev.initiative } : {}) });
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
      } else if (kind === "move") {
        cb.moved = add(cb.moved);
        if (amount > 0 && cb.speedZero) notes.push(`Your speed is 0 for the rest of this turn (${cb.speedZero}).`);
      }
      else cb[kind] = add(cb[kind]);
      if (dash) cb.dashes = Math.max(0, cb.dashes + Math.sign(amount));
      if (op.payload.attackWith && amount > 0) cb.attackedWith = [...cb.attackedWith, op.payload.attackWith];
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
      if (!on) c.effects = c.effects.filter((e) => !e.toggles?.includes(name));
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
