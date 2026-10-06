import { Character, type Operation } from "@dnd/schema";
import { derive, type ContentRegistry } from "@dnd/engine";

/** What changed, in words the UI can show as a toast or reminder. */
export interface ApplyResult {
  character: Character;
  notes: string[];
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
  const sheet = derive(c, reg);
  const maxHp = sheet.hpMax.total;

  switch (op.type) {
    case "damage": {
      const { amount, damageType } = op.payload;
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
        notes.push("Long rest: HP full, spell slots and long-rest features restored, half your Hit Dice regained.");
      }
      if (restored.length) notes.push(`Restored: ${restored.join(", ")}.`);
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
      return { character: Character.parse(c), notes };
    }
  }

  return { character: c, notes };
}
