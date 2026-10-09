import { Character, CombatState, type Operation, type ValueExpr } from "@dnd/schema";
import { componentCount, withCustom, customSpellId, FLEX_COST, castingEconomy, derive, evalFlat, levelGains, damageAfterDefenses, materialNeed, multiclassIssues, shapeIssues, summonBlock, summonHpBonus, type ContentRegistry } from "@dnd/engine";

/** Effects a summoned creature holds with its own concentration (Barkskin on itself) end with it. */
function dropSummonConcentration(x: Character["summons"][number], spell: string) {
  const name = spell.toLowerCase();
  x.effects = (x.effects ?? []).filter((e) => !(e.effect.replace(/^[a-z]+:/, "").replace(/-/g, " ") === name.replace(/[^a-z ]/g, "").replace(/\s+/g, " ")));
}

/** A number from an expression, or 0 when it can't be worked out here. */
const evalFlatSafe = (v: ValueExpr, ctx: Parameters<typeof evalFlat>[1]): number => {
  try {
    return evalFlat(v, ctx);
  } catch {
    return 0;
  }
};

/** Something the player should do next, e.g. roll a concentration check. */
/** A follow-up the app should open: a concentration save (yours, or a summoned creature's when `summon` is set). */
/** A question for the player: a concentration save, or news of instant death (`reason`). */
export type Prompt = { kind: "concentration" | "dead"; dc: number; spell: string; summon?: string; reason?: string };

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
  const conjured = c.summons.filter((s) => s.concentration);
  if (conjured.length) {
    c.summons = c.summons.filter((s) => !s.concentration);
    notes.push(`${conjured.length === 1 ? "The summoned creature disappears" : `${conjured.length} summoned creatures disappear`}.`);
  }
  if (c.shape?.ownSpell) {
    delete c.shape;
    notes.push("Polymorph ends: you're back in your normal form.");
  }
}

const clone = <T>(v: T): T => structuredClone(v);

/**
 * Applies one operation to a character and returns the new character.
 * Pure: the input is never modified. Nothing is ever refused: impossible
 * requests (spending a use you don't have) are clamped and explained in
 * `notes`, because the player and DM always have the final say.
 */
export function applyOperation(input: Character, op: Operation, baseReg: ContentRegistry): ApplyResult {
  // The character's own actions and spells are content too.
  const reg = withCustom(baseReg, input);
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
    const state = (c.companions[id] ??= { states: [] });
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

  /** Companions' Dodge and Ready end with yours. */
  const clearCompanionStates = (which: (x: { outOfCombat?: boolean | undefined }) => boolean) => {
    for (const [id, st] of Object.entries(c.companions)) {
      const gone = (st.states ?? []).filter(which);
      if (!gone.length) continue;
      st.states = st.states.filter((x) => !gone.includes(x));
      const name = sheet.companions.find((x) => x.id === id)?.name ?? "Companion";
      notes.push(`${name}: ${gone.map((x) => x.name).join(", ")} ended.`);
    }
  };

  /** Dodge and Ready end; a readied spell that was never released dissipates with its concentration. */
  const endTurnStartEffects = (ending: Character["effects"], why: string) => {
    if (!ending.length) return;
    notes.push(`${ending.map(effectName).join(", ")} ended: ${why}.`);
    removeEffects(ending);
    if (ending.some((e) => e.readied) && c.concentration?.name.startsWith("Readied ")) {
      notes.push(`${c.concentration.name.replace("Readied ", "")} wasn't released: it dissipates.`);
      delete c.concentration;
    }
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
    // The in-world clock moves too, unless the player keeps it by hand.
    if (c.story.calendar.followRests) c.story.calendar.minutes += minutes;
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
      let { amount, damageType } = op.payload;
      let concAsked = false;
      if (op.payload.companion) {
        const t = companionTarget(op.payload.companion);
        if (!t) break;
        const absorbed = Math.min(t.state.hp.temp, amount);
        t.state.hp.temp -= absorbed;
        t.state.hp.current = Math.max(0, t.state.hp.current - (amount - absorbed));
        notes.push(`${t.comp.name}: ${t.state.hp.current} of ${t.max} HP.`);
        if (t.state.hp.current === 0) {
          notes.push(`${t.comp.name} drops to 0 HP and dies.${t.comp.reviveNote ? ` ${t.comp.reviveNote}` : ""}`);
          t.state.states = [];
        }
        break;
      }
      // Wild Shape or Polymorph: the creature's hit points go first; at 0 you change back and the rest carries over.
      if (c.shape) {
        const d = reg.find(c.shape.creature, "creature");
        let sd = amount;
        if (damageType && d) {
          if (d.immune?.includes(damageType)) sd = 0;
          else {
            if (d.resist?.includes(damageType)) sd = Math.floor(sd / 2);
            if (d.vulnerable?.includes(damageType)) sd *= 2;
          }
          if (sd !== amount) notes.push(`${d.name} ${sd === 0 ? "is immune" : sd < amount ? "resists" : "is vulnerable"}: ${sd} damage.`);
        }
        if (c.concentration && sd > 0) {
          prompts.push({ kind: "concentration", dc: Math.max(10, Math.floor(sd / 2)), spell: c.concentration.name });
          concAsked = true;
        }
        c.shape.hp -= sd;
        const name = d?.name ?? "Your form";
        if (c.shape.hp > 0) {
          notes.push(`${name}: ${c.shape.hp} of ${d?.hp ?? "?"} HP.`);
          break;
        }
        const overflow = -c.shape.hp;
        const own = c.shape.ownSpell;
        delete c.shape;
        if (own && c.concentration?.spell === "spell:polymorph") {
          delete c.concentration;
          c.effects = c.effects.filter((e) => !e.concentration);
        }
        notes.push(`${name} drops to 0 HP: you're back in your normal form${overflow > 0 ? `, and ${overflow} damage carries over` : ""}.`);
        if (overflow === 0) break;
        amount = overflow;
        damageType = undefined;
      }
      let dmg = amount;
      // Heavy Armor Master: nonmagical bludgeoning, piercing and slashing reduced by 3 in heavy armor.
      if (sheet.rules.heavyArmorMaster && damageType && ["bludgeoning", "piercing", "slashing"].includes(damageType) && !op.payload.magical) {
        const cut = Math.min(3, dmg);
        dmg -= cut;
        amount = dmg;
        notes.push(`Heavy Armor Master: ${cut} less (nonmagical ${damageType}).`);
      }
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
      // Resistance to damage from spells (Aura of Warding): resistances don't stack, so not on top of a typed one.
      if (op.payload.fromSpell && sheet.defenses.resist.includes("spells") && dmg > 0 && !(damageType && sheet.defenses.resist.includes(damageType))) {
        const was = dmg;
        dmg = Math.floor(dmg / 2);
        notes.push(`Resistant to damage from spells: ${was} halved to ${dmg}.`);
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
          prompts.push({ kind: "dead", dc: 0, spell: "", reason: `${rest} damage while at 0 HP is at least your hit point maximum (${maxHp}).` });
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
        else if (!concAsked) prompts.push({ kind: "concentration", dc: Math.max(10, Math.floor(dmg / 2)), spell: concentrating.name });
      }
      if (c.hp.current === 0 && before > 0) {
        const overflow = rest - before;
        if (overflow >= maxHp) {
          notes.push(`Massive damage: ${overflow} left over is at least your HP maximum (${maxHp}): instant death.`);
          c.deathSaves.failures = 3;
          prompts.push({ kind: "dead", dc: 0, spell: "", reason: `Massive damage: ${rest} damage took you to 0 with ${overflow} left over, at least your hit point maximum (${maxHp}).` });
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
      if (c.shape) {
        const d = reg.find(c.shape.creature, "creature");
        const max = d?.hp ?? c.shape.hp;
        c.shape.hp = Math.min(max, c.shape.hp + op.payload.amount);
        notes.push(`${d?.name ?? "Your form"}: ${c.shape.hp} of ${max} HP.`);
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

    case "addExtra": {
      const x = op.payload;
      if (c.extras.some((e) => e.id === x.id)) notes.push("Already added.");
      else c.extras.push(x);
      break;
    }

    case "updateExtra": {
      const x = c.extras.find((e) => e.id === op.payload.id);
      if (!x) {
        notes.push("Nothing to update.");
        break;
      }
      if (op.payload.tag) x.tag = op.payload.tag;
      if (op.payload.reason !== undefined) x.reason = op.payload.reason;
      break;
    }

    case "removeExtra": {
      c.extras = c.extras.filter((e) => e.id !== op.payload.id);
      break;
    }

    case "setExtraNote": {
      const { key, tag, reason } = op.payload;
      if (tag) c.extraNotes[key] = { tag, reason };
      else delete c.extraNotes[key];
      break;
    }

    case "setComponent": {
      const n = op.payload.count ?? (op.payload.have ? Math.max(1, componentCount(c.components[op.payload.spell])) : 0);
      if (n > 0) c.components[op.payload.spell] = n;
      else delete c.components[op.payload.spell];
      break;
    }

    case "setSpellbookFunds": {
      c.spellbookFunds = Math.round(op.payload.gp * 100) / 100;
      break;
    }

    case "transform": {
      const { kind, creature, uses } = op.payload;
      const d = reg.find(creature, "creature");
      if (!d) {
        notes.push("That creature isn't in the content on this device.");
        break;
      }
      let ownSpell = false;
      if (kind === "wildshape") {
        const res = sheet.resources.find((r) => r.id === "wild-shape");
        if (!res) notes.push("No Wild Shape uses on this character. Done anyway.");
        else if (uses > 0) {
          if (res.remaining < uses) notes.push(`Wild Shape: ${res.remaining} use${res.remaining === 1 ? "" : "s"} left. Done anyway.`);
          c.resourcesUsed[res.id] = Math.min(res.max, (c.resourcesUsed[res.id] ?? 0) + uses);
        }
        for (const issue of shapeIssues(d, kind, sheet.wildShape, 0)) notes.push(`Beyond the rules: ${issue}`);
        spendTurn(sheet.wildShape?.bonusAction ? "bonus" : "action");
        notes.push(`${d.name}: ${d.hp} HP, AC ${d.ac}.${sheet.wildShape ? ` Up to ${sheet.wildShape.hours} hour${sheet.wildShape.hours === 1 ? "" : "s"}.` : ""}`);
      } else {
        ownSpell = c.concentration?.spell === (kind === "truepolymorph" ? "spell:true-polymorph" : "spell:polymorph");
        notes.push(`${kind === "truepolymorph" ? "True Polymorph" : "Polymorphed"}: ${d.name}, ${d.hp} HP, AC ${d.ac}.`);
      }
      c.shape = { kind, creature, hp: d.hp, ...(ownSpell ? { ownSpell } : {}), ...(op.payload.effect ? { effect: op.payload.effect } : {}) };
      break;
    }

    case "summon": {
      const { spell, group, creatures, concentration } = op.payload;
      let n = c.summons.length;
      for (const x of creatures) {
        const d = reg.find(x.creature, "creature");
        if (!d) {
          notes.push(`${x.creature} isn't in the content on this device.`);
          continue;
        }
        for (let i = 0; i < x.count; i++) c.summons.push({ id: `${group}-${++n}`, creature: d.id, hp: d.hp, spell, group, ...(concentration ? { concentration } : {}) });
      }
      notes.push(`${creatures.map((x) => `${x.count > 1 ? `${x.count} × ` : ""}${reg.find(x.creature, "creature")?.name ?? x.creature}`).join(", ")} ${creatures.reduce((t, x) => t + x.count, 0) > 1 ? "appear" : "appears"}.`);
      break;
    }

    case "summonHp": {
      const x = c.summons.find((s) => s.id === op.payload.id);
      if (!x) break;
      const def = reg.find(x.creature, "creature");
      const who = x.name ?? def?.name ?? "It";
      let target = op.payload.hp ?? x.hp;
      if (op.payload.damage !== undefined) {
        // Its stat block's defenses, plus any from effects on it (Protection from Energy, Stoneskin);
        // "from nonmagical weapons" ones don't count against a magical (silvered, adamantine) attack.
        const block = summonBlock(reg, x);
        const r = damageAfterDefenses(op.payload.damage, op.payload.type, block?.defenses ?? { resist: [], immune: [], vulnerable: [] }, {
          ...(op.payload.magical ? { magical: true } : {}),
          ...(op.payload.silvered ? { silvered: true } : {}),
          ...(op.payload.adamantine ? { adamantine: true } : {}),
        });
        for (const n of r.notes) notes.push(`${who}: ${n}`);
        const amount = r.amount;
        target = Math.max(0, x.hp - amount);
      }
      const max = (def?.hp ?? target) + summonHpBonus(x, reg);
      const lost = x.hp - Math.min(max, target);
      x.hp = Math.min(max, target);
      // Its own concentration: damage asks for a Constitution save (DC 10 or half the damage); at 0 HP it ends.
      if (x.concentrating && lost > 0) {
        if (x.hp === 0) {
          dropSummonConcentration(x, x.concentrating);
          delete x.concentrating;
        }
        else {
          const dc = Math.max(10, Math.floor(lost / 2));
          notes.push(`It's concentrating on ${x.concentrating}: Constitution save, DC ${dc}.`);
          prompts.push({ kind: "concentration", dc, spell: x.concentrating, summon: x.id });
        }
      }
      if (x.hp === 0 && lost > 0) notes.push(`${who} drops to 0 HP.`);
      break;
    }

    case "summonInitiative": {
      for (const x of c.summons) if (x.group === op.payload.group && (!op.payload.id || x.id === op.payload.id)) x.initiative = op.payload.value;
      break;
    }

    case "summonEconomy": {
      const x = c.summons.find((s) => s.id === op.payload.id);
      if (!x) break;
      const u = (x.used ??= { action: false, bonus: false, reaction: false, attacks: 0, moved: 0, dashes: 0 });
      if (op.payload.newTurn) {
        x.used = { action: false, bonus: false, reaction: false, attacks: 0, moved: 0, dashes: 0 };
        // Its timed effects count down at the start of its turn.
        const left = (x.effects ?? []).map((e) => (e.rounds !== undefined ? { ...e, rounds: e.rounds - 1 } : e));
        const gone = left.filter((e) => e.rounds === 0);
        x.effects = left.filter((e) => e.rounds !== 0);
        if (gone.length) notes.push(`Ended on it: ${gone.map((e) => reg.find(reg.effectId(e.effect), "effect")?.name ?? e.effect).join(", ")}.`);
        break;
      }
      if (op.payload.move !== undefined) {
        u.moved = Math.max(0, (u.moved ?? 0) + op.payload.move);
        // Switching speeds: what it has moved comes off the new speed (PHB p. 190).
        const speeds = summonBlock(reg, x)?.speeds ?? {};
        const mode = op.payload.mode ?? "walk";
        const speed = (speeds[mode] ?? 0) * (1 + (u.dashes ?? 0));
        if (op.payload.move > 0 && u.moved > speed) notes.push(`${u.moved} ft is beyond its ${mode} speed (${speed} ft) this turn.`);
      }
      if (op.payload.dash !== undefined) u.dashes = Math.max(0, (u.dashes ?? 0) + (op.payload.dash ? 1 : -1));
      const k = op.payload.kind;
      if (k === "attack") {
        if (op.payload.used) {
          if (u.attacks === 0) u.action = true;
          u.attacks += 1;
          const per = (() => {
            const d = reg.find(x.creature, "creature");
            const m = d?.actions.find((a) => /^multiattack/i.test(a.name));
            const n = m ? /makes (two|three|four|five) /i.exec(m.text)?.[1] : undefined;
            return n ? ({ two: 2, three: 3, four: 4, five: 5 } as Record<string, number>)[n.toLowerCase()]! : m ? 2 : 1;
          })();
          if (u.attacks > per) notes.push(`That's attack ${u.attacks} of ${per} for its Attack action.`);
        } else {
          u.attacks = Math.max(0, u.attacks - 1);
          if (u.attacks === 0) u.action = false;
        }
      } else if (k) {
        if (op.payload.used && u[k]) notes.push(`Its ${k === "bonus" ? "bonus action" : k} is already used this turn. Used anyway.`);
        u[k] = op.payload.used;
      }
      break;
    }

    case "summonEffect": {
      const x = c.summons.find((s) => s.id === op.payload.id);
      if (!x) break;
      const effect = reg.effectId(op.payload.effect);
      if (op.payload.add) {
        const ed = reg.find(effect, "effect");
        const cd = reg.find(x.creature, "creature");
        if (ed && ed.category === "condition" && (cd?.conditionImmune ?? []).some((k) => k.toLowerCase() === ed.name.toLowerCase()))
          notes.push(`${x.name ?? cd?.name ?? "It"} is immune to being ${ed.name.toLowerCase()}. Added anyway.`);
        // Flying creatures fall when knocked prone or unable to move, unless they hover (PHB p. 191).
        if (ed && cd?.speed.fly && !cd.speed.hover && /^(prone|grappled|restrained|paralyzed|petrified|stunned|unconscious)$/i.test(ed.name))
          notes.push(`If ${x.name ?? cd.name} is flying, it falls (it can't hover).`);
      }
      const def = reg.find(effect, "effect");
      const ctxFor = (slotLevel?: number) => ({ pb: 2, mods: { str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0 }, level: 1, classLevels: {}, slotLevel: slotLevel ?? def?.upcast?.baseLevel ?? 1 });
      // Aid: the maximum and the current hit points both go up, and come back down when it ends.
      const hpGain = (slotLevel?: number) => {
        let n = 0;
        for (const m of def?.modifiers ?? []) if (m.selector === "stat.hp.max" && m.op === "add" && m.value !== undefined) n += evalFlatSafe(m.value, ctxFor(slotLevel));
        return n;
      };
      if (op.payload.add) {
        const inst = {
          // The operation's own id: the same every time the log is replayed.
          id: op.id,
          effect,
          ...(op.payload.rounds ? { rounds: op.payload.rounds } : {}),
          ...(op.payload.choice ? { choice: op.payload.choice } : {}),
          ...(op.payload.slotLevel ? { slotLevel: op.payload.slotLevel } : {}),
        };
        x.effects = [...(x.effects ?? []), inst];
        const gain = hpGain(op.payload.slotLevel);
        if (gain > 0 && x.hp > 0) {
          x.hp += gain;
          notes.push(`+${gain} hit points (maximum and current).`);
        }
      } else {
        const gone = (x.effects ?? []).filter((e) => (op.payload.instance ? e.id === op.payload.instance : e.effect === effect || e.id === op.payload.effect));
        x.effects = (x.effects ?? []).filter((e) => !gone.includes(e));
        for (const g of gone) {
          const loss = hpGain(g.slotLevel);
          if (loss > 0) {
            const max = (reg.find(x.creature, "creature")?.hp ?? x.hp) + summonHpBonus(x, reg);
            x.hp = Math.min(x.hp, max);
          }
        }
        if (!gone.length) notes.push("That effect isn't on it.");
      }
      break;
    }

    case "summonEffectEdit": {
      const x = c.summons.find((s) => s.id === op.payload.id);
      const e = x?.effects?.find((y) => y.id === op.payload.instance);
      if (!x || !e) {
        notes.push("That effect isn't on it.");
        break;
      }
      if (op.payload.rounds === null) delete e.rounds;
      else if (op.payload.rounds !== undefined) e.rounds = op.payload.rounds;
      if (op.payload.choice !== undefined) e.choice = op.payload.choice;
      if (op.payload.slotLevel !== undefined && op.payload.slotLevel !== e.slotLevel) {
        // Aid cast higher: hit points follow the new level.
        const before = summonHpBonus(x, reg);
        e.slotLevel = op.payload.slotLevel;
        const after = summonHpBonus(x, reg);
        if (after !== before) {
          x.hp = Math.max(0, x.hp + (after - before));
          notes.push(`${after > before ? "+" : ""}${after - before} hit points (maximum and current).`);
        }
      }
      if (e.rounds === 0) {
        x.effects = x.effects!.filter((y) => y !== e);
        notes.push("Its time is up: removed.");
      }
      break;
    }

    case "summonMaxHpAdjust": {
      const x = c.summons.find((s) => s.id === op.payload.id);
      if (!x) break;
      const adj = (x.maxHpAdjust ??= { reduce: 0, increase: 0 });
      if (op.payload.reduce !== undefined) adj.reduce = op.payload.reduce;
      if (op.payload.increase !== undefined) adj.increase = op.payload.increase;
      if (!adj.reduce && !adj.increase) delete x.maxHpAdjust;
      const max = (reg.find(x.creature, "creature")?.hp ?? x.hp) + summonHpBonus(x, reg);
      // Like yours: the maximum moves; current hit points can't stay above it.
      x.hp = Math.max(0, Math.min(max, x.hp));
      notes.push(`Its maximum hit points: ${max}.`);
      break;
    }

    case "setInspiration": {
      const before = c.inspirations ?? 0;
      c.inspirations = op.payload.count;
      c.inspiration = op.payload.count > 0;
      if (op.payload.count < before) notes.push("Inspiration: advantage on one attack roll, saving throw or ability check.");
      break;
    }

    case "setMaxHpAdjust": {
      const adj = (c.maxHpAdjust ??= { reduce: 0, increase: 0 });
      if (op.payload.reduce !== undefined) adj.reduce = op.payload.reduce;
      if (op.payload.increase !== undefined) adj.increase = op.payload.increase;
      const max = derive(c, reg).hpMax.total;
      if (c.hp.current > max) c.hp.current = max;
      if (!adj.reduce && !adj.increase) notes.push("Back to your normal maximum hit points.");
      else notes.push(`Maximum hit points now ${max}.`);
      break;
    }

    case "setAbilityAdjust": {
      const { ability, ...rest } = op.payload;
      const cur = (c.abilityAdjust[ability] ??= { bonus: 0, penalty: 0, penaltyEndsOnRest: false });
      if (rest.bonus !== undefined) cur.bonus = rest.bonus;
      if (rest.penalty !== undefined) cur.penalty = rest.penalty;
      if (rest.penaltyEndsOnRest !== undefined) cur.penaltyEndsOnRest = rest.penaltyEndsOnRest;
      if (rest.setTo === null) delete cur.setTo;
      else if (rest.setTo !== undefined) cur.setTo = rest.setTo;
      if (rest.setNote !== undefined) {
        if (rest.setNote) cur.setNote = rest.setNote;
        else delete cur.setNote;
      }
      if (rest.addPermanent && rest.addPermanent.amount) (cur.permanent ??= []).push(rest.addPermanent);
      if (rest.removePermanent !== undefined) cur.permanent?.splice(rest.removePermanent, 1);
      if (cur.permanent && !cur.permanent.length) delete cur.permanent;
      if (!cur.bonus && !cur.penalty && cur.setTo === undefined && !cur.permanent) delete c.abilityAdjust[ability];
      const score = derive(c, reg).abilities[ability].score.total;
      if (score <= 0) notes.push(`${ability.toUpperCase()} is ${score}. A shadow's Strength drain kills at 0.`);
      break;
    }

    case "setHpRoll": {
      const cl = c.classes.find((x) => x.class === op.payload.class);
      if (!cl) {
        notes.push("No such class on this character.");
        break;
      }
      const def = reg.find(op.payload.class, "class");
      const avg = def ? def.hitDie / 2 + 1 : 1;
      const rolls = [...(cl.hpRolls ?? [])];
      while (rolls.length < op.payload.index) rolls.push(avg);
      rolls[op.payload.index] = op.payload.value;
      cl.hpRolls = rolls;
      if (def && op.payload.value > def.hitDie) notes.push(`${op.payload.value} is more than a d${def.hitDie} can roll.`);
      break;
    }

    case "summonCast": {
      const x = c.summons.find((s) => s.id === op.payload.id);
      if (!x) break;
      const who = x.name ?? reg.find(x.creature, "creature")?.name ?? "It";
      const { key, max, economy, spell } = op.payload;
      if (op.payload.restore) {
        if (key && x.spellUses?.[key]) x.spellUses[key] -= 1;
        break;
      }
      if (key) {
        const uses = (x.spellUses ??= {});
        uses[key] = (uses[key] ?? 0) + 1;
        if (max !== undefined && uses[key]! > max) notes.push(`Beyond its stat block: ${uses[key]} of ${max}${key.startsWith("slot:") ? ` level ${key.slice(5)} slots` : " a day"}.`);
      }
      if (economy !== "none") {
        const u = (x.used ??= { action: false, bonus: false, reaction: false, attacks: 0, moved: 0, dashes: 0 });
        if (u[economy]) notes.push(`Its ${economy === "bonus" ? "bonus action" : economy} was already used this turn.`);
        u[economy] = true;
      }
      if (op.payload.concentration) {
        if (x.concentrating && x.concentrating !== spell) {
          notes.push(`${x.concentrating} ends: ${who} now concentrates on ${spell}.`);
          dropSummonConcentration(x, x.concentrating);
        }
        x.concentrating = spell;
      }
      break;
    }

    case "summonConcentration": {
      const x = c.summons.find((s) => s.id === op.payload.id);
      if (!x) break;
      if (x.concentrating && x.concentrating !== op.payload.spell) dropSummonConcentration(x, x.concentrating);
      if (op.payload.spell) x.concentrating = op.payload.spell;
      else delete x.concentrating;
      break;
    }

    case "dismiss": {
      const before = c.summons.length;
      c.summons = c.summons.filter((s) => !(op.payload.id ? s.id === op.payload.id : s.group === op.payload.group));
      if (c.summons.length === before) notes.push("Nothing to dismiss.");
      break;
    }

    case "revert": {
      if (!c.shape) {
        notes.push("Already in your normal form.");
        break;
      }
      const d = reg.find(c.shape.creature, "creature");
      // Leaving Wild Shape early takes a bonus action; Polymorph ends when the spell does.
      if (c.shape.kind === "wildshape" && !op.payload.why) spendTurn("bonus");
      if (c.shape.ownSpell && c.concentration?.spell === "spell:polymorph") {
        delete c.concentration;
        c.effects = c.effects.filter((e) => !e.concentration);
      }
      delete c.shape;
      notes.push(`${op.payload.why ?? `No longer ${d?.name ?? "transformed"}`}: back in your normal form with ${c.hp.current} HP.`);
      break;
    }

    case "restoreHitDie": {
      const used = c.hitDiceUsed[op.payload.die] ?? 0;
      if (used === 0) notes.push(`No spent ${op.payload.die} Hit Dice.`);
      else c.hitDiceUsed[op.payload.die] = used - 1;
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
      const con = sheet.abilities.con.modifier;
      if (op.payload.reduce) {
        notes.push(`Durable: Hit Die ${die} spent, damage reduced by ${Math.max(3, roll + con)}.`);
        break;
      }
      // Durable: a Hit Die heals at least twice your Constitution modifier (minimum 2).
      const floor = sheet.rules.durable ? Math.max(2, 2 * con) : 0;
      const healed = Math.max(0, roll + con, floor);
      const before = c.hp.current;
      c.hp.current = Math.min(maxHp, before + healed);
      notes.push(`Hit Die ${die}: ${roll} + Constitution ${con} = ${roll + con}${healed > roll + con ? `, Durable makes it ${healed}` : ""} HP.`);
      break;
    }

    case "rest": {
      const kind = op.payload.kind;
      passMinutes(kind === "short" ? 60 : 480);
      // Penalties that last until a rest (a shadow's Strength drain) end.
      for (const [ab, adj] of Object.entries(c.abilityAdjust)) {
        if (!adj?.penalty || !adj.penaltyEndsOnRest) continue;
        adj.penalty = 0;
        notes.push(`${ab.toUpperCase()} penalty ends with the rest.`);
        if (!adj.bonus && adj.setTo === undefined && !adj.permanent) delete c.abilityAdjust[ab as keyof typeof c.abilityAdjust];
      }
      c.healerUsed = [];
      // Extra spells (beyond the rules): the "since short rest" count restarts on any rest, "since long rest" on a long one.
      for (const [k, n] of Object.entries(c.extraCasts ?? {})) {
        if (kind === "long") delete c.extraCasts[k];
        else c.extraCasts[k] = { ...n, short: 0 };
      }
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
        c.extraSlots = {};
        c.hp.current = maxHp;
        c.hp.temp = 0;
        if (c.shape) {
          delete c.shape;
          notes.push("A long rest is longer than a transformation lasts: back in your normal form.");
        }
        c.deathSaves = { successes: 0, failures: 0 };
        // Regain spent Hit Dice up to half the character's total (minimum 1), largest dice first; Durable regains them all.
        let regain = sheet.rules.durable ? sheet.level : Math.max(1, Math.floor(sheet.level / 2));
        const pools = [...sheet.hitDice].sort((a, b) => Number(b.die.slice(1)) - Number(a.die.slice(1)));
        for (const p of pools) {
          const spent = c.hitDiceUsed[p.die] ?? 0;
          const back = Math.min(spent, regain);
          if (back > 0) c.hitDiceUsed[p.die] = spent - back;
          regain -= back;
        }
        for (const comp of sheet.companions) if (c.companions[comp.id]) delete c.companions[comp.id]!.hp;
        notes.push(`Long rest: HP full, spell slots and long-rest features restored, ${sheet.rules.durable ? "all your Hit Dice regained (Durable)" : "half your Hit Dice regained"}.`);
        // Exhaustion drops one level after a long rest (with food and drink).
        const ex = c.effects.find((e) => e.effect === "condition:exhaustion");
        if (ex) {
          const lvl = (ex.level ?? 1) - 1;
          if (lvl <= 0) {
            removeEffects([ex]);
            notes.push("Exhaustion gone.");
          } else {
            ex.level = lvl;
            notes.push(`Exhaustion down to level ${lvl}.`);
          }
        }
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
      // Flexible Casting: sorcery points into a spell slot, or a slot into points.
      if (a.flexibleCasting) {
        const lvl = Number(/Level (\d)/.exec(op.payload.choice ?? "")?.[1] ?? 0);
        const pts = sheet.resources.find((r) => r.id === "sorcery-points");
        if (!lvl || !pts) {
          notes.push(lvl ? "No sorcery points." : "Choose a slot level.");
          break;
        }
        if (a.flexibleCasting === "toSlot") {
          const cost = FLEX_COST[lvl] ?? 0;
          if (pts.remaining < cost) notes.push(`That costs ${cost} sorcery points and you have ${pts.remaining}. Done anyway.`);
          c.resourcesUsed[pts.id] = Math.min(pts.max, pts.used + cost);
          c.extraSlots[String(lvl)] = (c.extraSlots[String(lvl)] ?? 0) + 1;
          notes.push(`A level ${lvl} spell slot created (it vanishes on a long rest). ${Math.max(0, pts.remaining - cost)} sorcery points left.`);
        } else {
          const slot = sheet.spellSlots.find((s) => s.level === lvl);
          if (!slot || slot.total - slot.used <= 0) notes.push(`No level ${lvl} slot left. Done anyway.`);
          c.slotsUsed[String(lvl)] = (c.slotsUsed[String(lvl)] ?? 0) + 1;
          const gained = Math.min(lvl, pts.used);
          c.resourcesUsed[pts.id] = pts.used - gained;
          notes.push(`+${gained} sorcery points${gained < lvl ? " (you can't go above your maximum)" : ""}: ${pts.remaining + gained} now.`);
        }
        spendTurn(a.economy, (cb) => {
          cb.usedThisTurn = [...cb.usedThisTurn, a.id];
        });
        break;
      }
      // Haste: its own extra action, once per turn: one weapon attack, Dash, Disengage, Hide or Use an Object.
      if (a.limited) {
        const cb = c.combat;
        const pick = op.payload.choice ?? "";
        if (cb?.usedThisTurn.includes(a.id)) notes.push(`You've already used ${a.name} this turn. Done anyway.`);
        if (/^Attack/.test(pick)) {
          if (cb) cb.hasteAttack = true;
          notes.push("Make one weapon attack: it doesn't use your Attack action.");
        } else if (pick === "Dash") {
          if (cb) cb.dashes += 1;
          notes.push(`Dash: ${sheet.speed.total * (1 + (cb?.dashes ?? 1))} ft of movement this turn.`);
        } else if (pick === "Disengage") notes.push("Disengage: your movement doesn't provoke opportunity attacks for the rest of this turn.");
        else if (pick === "Hide") notes.push("Hide: make a Dexterity (Stealth) check.");
        else if (pick) notes.push(`${pick}.`);
        if (cb) cb.usedThisTurn = [...cb.usedThisTurn, a.id];
        else notes.push("Not in combat: nothing to track.");
        break;
      }
      const free = op.payload.free === true;
      // Lay on Hands: as many points as the player chose.
      const amount = a.spendAmount && op.payload.amount ? op.payload.amount : a.cost?.amount ?? 1;
      if (a.cost && !free) {
        const used = c.resourcesUsed[a.cost.resource] ?? 0;
        const max = sheet.resources.find((r) => r.id === a.cost!.resource)?.max ?? 0;
        if (a.cost.remaining < amount) notes.push(`${a.cost.name}: ${a.cost.remaining > 0 ? `only ${a.cost.remaining} left` : "none left"}. Used anyway.`);
        c.resourcesUsed[a.cost.resource] = Math.min(max, used + amount);
        if (a.spendAmount) notes.push(`${a.cost.name}: ${Math.max(0, max - used - amount)} left.`);
      }
      if (a.spendAmount?.heals && op.payload.healSelf && op.payload.amount) {
        const before = c.hp.current;
        c.hp.current = Math.min(maxHp, before + op.payload.amount);
        if (before === 0 && c.hp.current > 0) c.deathSaves = { successes: 0, failures: 0 };
        notes.push(`Healed ${c.hp.current - before}.`);
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
        if (a.extraAction) {
          // Action Surge: one more action, with its own Attack action.
          cb.extraActions += 1;
          cb.attacks = 0;
          notes.push("One more action this turn.");
        }
        // Step of the Wind: Dash only when that's the pick; Disengage otherwise.
        if (a.dash && (!a.choose || /^dash/i.test(op.payload.choice ?? ""))) {
          cb.dashes += 1;
          notes.push(`Dash: ${sheet.speed.total * (1 + cb.dashes)} ft of movement this turn.`);
        } else if (/^disengage/i.test(op.payload.choice ?? "")) notes.push("Disengage: your movement doesn't provoke opportunity attacks for the rest of this turn.");
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
        if (!c.combat) entry.outOfCombat = true;
        if (a.toggles.length) entry.toggles = a.toggles;
        // Bait and Switch: the die rolled goes on AC until your next turn starts.
        if (a.id === "maneuver-bait-and-switch" && op.payload.rolled) entry.custom!.modifiers = [{ selector: "stat.ac", op: "add", value: op.payload.rolled, mode: "auto", label: `Bait and Switch (+${op.payload.rolled})` }];
        removeEffects(c.effects.filter((e) => e.effect === "custom" && (e.custom?.name === a.name || e.custom?.name.startsWith(`${a.name}: `))));
        c.effects.push(entry);
      }
      // Healer: once per creature until it finishes a short or long rest.
      if (a.id === "healer-kit" && op.payload.choice) {
        const who = op.payload.choice.trim();
        if (c.healerUsed.some((x) => x.toLowerCase() === who.toLowerCase())) notes.push(`${who} was already patched up since their last rest: your DM's call.`);
        else c.healerUsed.push(who);
      }
      if (a.id === "harness-divine-power") {
        const lvl = Number(/Level (\d)/.exec(op.payload.choice ?? "")?.[1] ?? 0);
        const top = Math.ceil(sheet.proficiencyBonus / 2);
        if (lvl && lvl <= top && (c.slotsUsed[String(lvl)] ?? 0) > 0) {
          c.slotsUsed[String(lvl)] = (c.slotsUsed[String(lvl)] ?? 0) - 1;
          notes.push(`Harness Divine Power: a level ${lvl} slot is back.`);
        } else notes.push(`No expended slot of level ${top} or lower to restore.`);
        const h = sheet.resources.find((r) => r.id === "harness-divine-power");
        if (h) {
          if (h.remaining <= 0) notes.push("No Harness Divine Power uses were left: used anyway.");
          c.resourcesUsed["harness-divine-power"] = (c.resourcesUsed["harness-divine-power"] ?? 0) + 1;
        }
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
      const { instanceId, quantity, equipped, attuned, name, scroll } = op.payload;
      const inst = c.inventory.find((i) => i.id === instanceId);
      if (!inst) {
        notes.push("That item is no longer in the inventory.");
        break;
      }
      const def = reg.get(inst.item, "item");
      if (quantity !== undefined) inst.quantity = quantity;
      if (name !== undefined) inst.name = name || undefined;
      if (scroll === null) delete inst.scroll;
      else if (scroll) inst.scroll = scroll.level === undefined ? { spell: scroll.spell } : { spell: scroll.spell, level: scroll.level };
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
      } else if (using === "extra") {
        const key = `${list}|${spell}`;
        const n = c.extraCasts[key] ?? { short: 0, long: 0 };
        c.extraCasts[key] = { short: n.short + 1, long: n.long + 1 };
        notes.push(`${sp.name} without a slot (${sp.cast.extra?.tag ?? "beyond the rules"}): ${n.short + 1} since your short rest, ${n.long + 1} since your long rest.`);
      } else if (using === "scroll") {
        const sc = sp.cast.scroll;
        const inst = sc && c.inventory.find((i) => i.id === sc.instanceId);
        if (!inst) notes.push("That scroll is no longer in the inventory.");
        else {
          // Read: the words fade and the scroll crumbles to dust, cast or not.
          inst.quantity -= 1;
          if (inst.quantity <= 0) c.inventory = c.inventory.filter((i) => i !== inst);
          notes.push(inst.quantity > 0 ? `The scroll crumbles to dust: ${inst.quantity} left.` : "The scroll crumbles to dust.");
        }
        if (sc && !sc.onList) notes.push(`${sp.name} isn't on your class's spell list: the scroll is unintelligible unless your DM says otherwise.`);
        if (op.payload.failed) {
          notes.push(`The check failed: ${sp.name} fades from the scroll with no effect. (Optional rule, DMG p. 140: a DC 10 Intelligence save, or a roll on the Scroll Mishap table.)`);
          spendTurn(castingEconomy(sp.castingTime), () => {});
          break;
        }
      }
      if (sp.ready === "not prepared") notes.push(`${sp.name} isn't prepared today.`);
      // A costly or consumed material component (PHB p. 203): the focus or pouch can't stand in for it.
      // A scroll needs no material components.
      const need = using === "scroll" ? undefined : materialNeed(sp.material);
      if (need) {
        const have = componentCount(c.components[sp.id]);
        if (!have) notes.push(`You don't have the material component (${sp.material}). Cast anyway: your DM decides.`);
        else if (op.payload.consumeComponent) {
          if (have - 1 > 0) c.components[sp.id] = have - 1;
          else delete c.components[sp.id];
          notes.push(`The material component is used up: ${have - 1} left.`);
        }
      }
      if (op.payload.readied) {
        // Cast now, held with concentration until released with your reaction (PHB p. 193).
        if (castingEconomy(sp.castingTime) !== "action") notes.push(`${sp.name} isn't cast with 1 action: only those can be readied.`);
        if (c.concentration) endConcentration(c, notes, `Holding ${sp.name} takes your concentration.`);
        c.concentration = { spell: sp.id, name: `Readied ${sp.name}`, level };
        removeEffects(c.effects.filter((e) => e.effect === "custom" && e.custom?.name.startsWith("Ready")));
        const entry: Character["effects"][number] = {
          id: `${op.id}-ready`,
          effect: "custom",
          custom: { name: `Ready: ${sp.name}`, modifiers: [] },
          from: "Ready",
          untilTurnStart: true,
          rounds: 1,
          concentration: true,
          readied: { spell: sp.id, list, level },
        };
        if (!c.combat) entry.outOfCombat = true;
        c.effects.push(entry);
        spendTurn("action", (cb) => {
          if (sp.level > 0) cb.leveledActionSpell = true;
        });
        notes.push(`${sp.name} is readied: release it with your reaction when the trigger happens, before your next turn starts.`);
        break;
      }
      if (sp.concentration) {
        if (c.concentration && c.concentration.spell !== sp.id) endConcentration(c, notes, `Casting ${sp.name}.`);
        else if (c.concentration) c.effects = c.effects.filter((e) => !e.concentration);
        c.concentration = { spell: sp.id, name: sp.name, level };
        if (sp.timer?.rounds) c.concentration.rounds = sp.timer.rounds;
        if (sp.timer?.minutes) c.concentration.minutes = sp.timer.minutes;
      }
      const economy = using === "ritual" ? "free" : castingEconomy(op.payload.castingTime ?? sp.castingTime);
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
        if (op.payload.choice) entry.choice = op.payload.choice;
        c.effects.push(entry);
      } else if (!selfDef && !sp.concentration && sp.timer && !op.payload.readied) {
        // A spell that lasts (Alarm, 8 hours) with nothing else to show it: a timer tag, one per casting.
        const entry: Character["effects"][number] = { id: `${op.id}-timer`, effect: "custom", custom: { name: sp.name, modifiers: [] }, from: "Your spell (timer)" };
        if (sp.timer.rounds) entry.rounds = sp.timer.rounds;
        else if (sp.timer.minutes) entry.minutes = sp.timer.minutes;
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
      let inst = c.spells.find((x) => x.spell === spell && x.list === list);
      if (!inst) {
        // Clerics, druids and paladins prepare from their whole class list: the spell is added as it's prepared.
        if (!sheet.spells.some((x) => x.id === spell && x.list.id === list)) {
          notes.push("That spell isn't on this character's lists.");
          break;
        }
        inst = { spell, list, prepared: false };
        c.spells.push(inst);
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
      // Immune to a condition (given by a feature or by hand): say so; the player decides.
      if (def?.category === "condition" && sheet.defenses.immune.some((x) => x.toLowerCase() === def.name.toLowerCase() || x === def.id)) notes.push(`You're immune to being ${def.name.toLowerCase()}: added anyway, remove it if it doesn't apply.`);
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

    case "releaseReadied": {
      const e = c.effects.find((x) => x.id === op.payload.instanceId);
      if (!e) break;
      c.effects = c.effects.filter((x) => x.id !== e.id);
      spendTurn("reaction");
      if (e.readied) {
        const sp = sheet.spells.find((x) => x.id === e.readied!.spell && x.list.id === e.readied!.list);
        if (c.concentration?.name.startsWith("Readied ")) delete c.concentration;
        // A concentration spell goes on as normal once it's released.
        if (sp?.concentration) {
          c.concentration = { spell: sp.id, name: sp.name, level: e.readied.level };
          if (sp.timer?.rounds) c.concentration.rounds = sp.timer.rounds;
          if (sp.timer?.minutes) c.concentration.minutes = sp.timer.minutes;
        }
        notes.push(`${sp?.name ?? "The spell"} released with your reaction.`);
      } else notes.push(`${effectName(e)}: done with your reaction.`);
      if (c.combat && c.combat.reaction > 1) notes.push("You had already used your reaction this round.");
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
      // Dodge or Ready taken outside combat: no next turn to wait for, so they end now.
      endTurnStartEffects(c.effects.filter((e) => e.untilTurnStart && (e.outOfCombat || !c.combat)), "your turn is over");
      clearCompanionStates((x) => !!x.outOfCombat || !c.combat);
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
      endTurnStartEffects(c.effects.filter((e) => e.untilTurnStart), "your turn has started");
      clearCompanionStates(() => true);
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
      if (kind === "attack" && amount > 0 && cb.hasteAttack && op.payload.attackWith) {
        // Haste's one weapon attack: not part of the Attack action.
        cb.hasteAttack = false;
        notes.push("That was Haste's extra action.");
      } else if (kind === "attack") {
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
      const state = (c.companions[companion] ??= { states: [] });
      if (form !== undefined && form !== state.form) {
        state.form = form;
        delete state.hp;
        notes.push(`${comp.forms.find((f) => f.id === form)?.name ?? form} arrives with full hit points.`);
      }
      if (name !== undefined) state.name = name;
      break;
    }

    case "companionAction": {
      const { companion, action, choice } = op.payload;
      const comp = sheet.companions.find((x) => x.id === companion);
      const a = sheet.actions.find((x) => x.id === action);
      if (!comp || !a) {
        notes.push(comp ? `Unknown action "${action}".` : `No companion "${companion}".`);
        break;
      }
      const name = choice ? `${a.name}: ${choice}` : a.name;
      if (a.untilTurnStart) {
        const state = (c.companions[companion] ??= { states: [] });
        // A new Dodge or Ready replaces the old one.
        state.states = [...(state.states ?? []).filter((x) => !x.name.startsWith(a.name)), { id: op.id, name, ...(c.combat ? {} : { outOfCombat: true }) }];
      }
      break;
    }

    case "endCompanionState": {
      const state = c.companions[op.payload.companion];
      const x = state?.states?.find((s) => s.id === op.payload.id);
      if (state && x) {
        state.states = state.states.filter((s) => s.id !== x.id);
        notes.push(`${x.name} ended.`);
      }
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

    case "setDeathSaves": {
      c.deathSaves = { successes: op.payload.successes, failures: op.payload.failures };
      if (op.payload.failures === 3) notes.push("Three failures: the character dies.");
      else if (op.payload.successes === 3) notes.push("Three successes: stable at 0 HP.");
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

    case "levelUp": {
      const { class: cls, hpRoll } = op.payload;
      const def = reg.find(cls, "class");
      if (!def) {
        notes.push(`Unknown class "${cls}".`);
        break;
      }
      // From now on the app asks for ASIs at new levels; the ones before are taken as settled.
      c.asiBaseline ??= Object.fromEntries(c.classes.map((x) => [x.class, x.level]));
      const gains = levelGains(c, reg, cls)!;
      const avg = def.hitDie / 2 + 1;
      const idx = c.classes.findIndex((x) => x.class === cls);
      if (idx < 0) {
        for (const p of multiclassIssues(c, reg, cls)) notes.push(`Multiclassing: ${p}`);
        c.classes.push({ class: cls, level: 1, ...(hpRoll !== undefined ? { hpRolls: [hpRoll] } : {}) });
      } else {
        const cl = c.classes[idx]!;
        if (cl.level >= 20) {
          notes.push(`${def.name} is already level 20.`);
          break;
        }
        const counted = idx === 0 ? cl.level - 1 : cl.level;
        if (hpRoll !== undefined || cl.hpRolls?.length) {
          const rolls = [...(cl.hpRolls ?? [])];
          while (rolls.length < counted) rolls.push(avg);
          rolls.push(hpRoll ?? avg);
          cl.hpRolls = rolls;
        }
        cl.level += 1;
      }
      const total = c.classes.reduce((n, x) => n + x.level, 0);
      if (total > 20) notes.push(`Character level ${total}: above 20.`);
      const gain = derive(c, reg).hpMax.total - maxHp;
      if (c.hp.current > 0) c.hp.current += Math.max(0, gain);
      notes.push(`${def.name} ${gains.newLevel}: ${gain >= 0 ? "+" : ""}${gain} HP maximum.`);
      if (gains.features.length) notes.push(`New: ${gains.features.map((f) => f.name).join(", ")}.`);
      if (gains.subclassDue) notes.push(`Choose your ${def.subclassTitle ?? "subclass"}.`);
      if (gains.asiDue) notes.push("Ability Score Improvement: +2 to one ability, +1 to two, or a feat.");
      break;
    }

    case "levelDown": {
      const idx = c.classes.findIndex((x) => x.class === op.payload.class);
      const cl = c.classes[idx];
      if (!cl) break;
      if (cl.level === 1) {
        if (c.classes.length === 1) {
          notes.push("A character needs at least one level.");
          break;
        }
        c.classes.splice(idx, 1);
      } else {
        cl.level -= 1;
        // Below the level that gives the subclass, it goes too.
        const sl = reg.find(cl.class, "class")?.subclassLevel ?? 99;
        if (cl.subclass && cl.level < sl) {
          notes.push(`${reg.find(cl.subclass, "subclass")?.name ?? "Subclass"} removed: it comes at level ${sl}.`);
          delete cl.subclass;
        }
        const counted = idx === 0 ? cl.level - 1 : cl.level;
        if (cl.hpRolls && cl.hpRolls.length > counted) cl.hpRolls = cl.hpRolls.slice(0, counted);
      }
      // ASIs above the level that's left go too, with a feat taken instead of one.
      const remaining = c.classes.find((x) => x.class === op.payload.class)?.level ?? 0;
      const gone = c.asi.filter((a) => a.class === op.payload.class && a.level > remaining);
      for (const g of gone) if (g.feat) c.feats = c.feats.filter((f) => !(f.feat === g.feat && f.from.endsWith(`${g.level} (Ability Score Improvement)`)));
      c.asi = c.asi.filter((a) => !gone.includes(a));
      const newMax = derive(c, reg).hpMax.total;
      if (c.hp.current > newMax) c.hp.current = newMax;
      notes.push(`${reg.find(op.payload.class, "class")?.name ?? op.payload.class} level taken back.`);
      break;
    }

    case "setSubclass": {
      const cl = c.classes.find((x) => x.class === op.payload.class);
      if (!cl) break;
      if (op.payload.subclass) cl.subclass = op.payload.subclass;
      else delete cl.subclass;
      break;
    }

    case "setChoice": {
      const { source, choice, values } = op.payload;
      const forSource = (c.choices[source] ??= {});
      if (values.length) forSource[choice] = values;
      else delete forSource[choice];
      if (!Object.keys(forSource).length) delete c.choices[source];
      break;
    }

    case "setAbilities": {
      c.abilities = { ...c.abilities, ...op.payload.abilities };
      break;
    }

    case "chooseAsi": {
      const { class: cls, level, abilities, feat, clear } = op.payload;
      const tag = `${reg.find(cls, "class")?.name ?? cls} ${level} (Ability Score Improvement)`;
      const old = c.asi.find((a) => a.class === cls && a.level === level);
      if (old?.feat) {
        const i = c.feats.findIndex((f) => f.feat === old.feat && f.from === tag);
        if (i >= 0) c.feats.splice(i, 1);
      }
      c.asi = c.asi.filter((a) => a !== old);
      if (clear) break;
      if (feat) {
        c.asi.push({ class: cls, level, feat });
        c.feats.push({ feat, from: tag });
      } else if (abilities) {
        const sum = Object.values(abilities).reduce((n, v) => n + v, 0);
        if (sum !== 2) notes.push(`That's +${sum}: an Ability Score Improvement is +2 to one ability or +1 to two.`);
        c.asi.push({ class: cls, level, abilities });
      }
      break;
    }

    case "setDetails": {
      const { name, player, alignment, race, background, size, creatureType } = op.payload;
      if (size === null) delete c.size;
      else if (size !== undefined) c.size = size;
      if (creatureType === null) delete c.creatureType;
      else if (creatureType !== undefined) c.creatureType = creatureType;
      if (name !== undefined) c.name = name;
      if (player !== undefined) c.player = player;
      if (alignment !== undefined) c.alignment = alignment;
      if (race !== undefined) c.race = race;
      if (background !== undefined && background !== (c.background ?? null)) {
        // A new background: the old one's picks (skills, languages, tools) go with it; its gear stays in the inventory.
        if (c.background) delete c.choices[c.background];
        if (background === null) delete c.background;
        else {
          c.background = background;
          const def = reg.find(background, "background");
          if (def && (def as { choices?: unknown[] }).choices?.length) notes.push("Make the new background's choices in Build.");
        }
      }
      break;
    }

    case "learnSpell": {
      const { spell, list } = op.payload;
      if (c.spells.some((x) => x.spell === spell && x.list === list)) {
        notes.push("Already on that list.");
        break;
      }
      c.spells.push({ spell, list, prepared: false });
      const cost = op.payload.cost;
      if (cost) {
        if (cost > c.spellbookFunds) notes.push(`Copying costs ${cost} gp and the spellbook fund has ${c.spellbookFunds} gp. Added anyway.`);
        c.spellbookFunds = Math.max(0, c.spellbookFunds - cost);
        notes.push(`${cost} gp from the spellbook fund: ${c.spellbookFunds} gp left.`);
      }
      break;
    }

    case "copyScroll": {
      const inst = c.inventory.find((i) => i.id === op.payload.instanceId);
      const spellId = inst?.scroll?.spell;
      if (!inst || !spellId) {
        notes.push("That scroll is no longer in the inventory, or has no spell on it.");
        break;
      }
      const def = reg.find(spellId, "spell");
      // Copied or not, the scroll is destroyed.
      inst.quantity -= 1;
      if (inst.quantity <= 0) c.inventory = c.inventory.filter((i) => i !== inst);
      if (!op.payload.success) {
        notes.push(`The Arcana check failed: ${def?.name ?? "the spell"} isn't copied, and the scroll is destroyed.`);
        break;
      }
      if (c.spells.some((x) => x.spell === spellId && x.list === "wizard")) {
        notes.push(`${def?.name ?? "That spell"} is already in your spellbook; the scroll is destroyed anyway.`);
        break;
      }
      c.spells.push({ spell: spellId, list: "wizard", prepared: false });
      const lvl = def?.level ?? 1;
      const cost = 50 * lvl;
      if (cost > c.spellbookFunds) notes.push(`Copying costs ${cost} gp and the spellbook fund has ${c.spellbookFunds} gp. Copied anyway.`);
      c.spellbookFunds = Math.max(0, c.spellbookFunds - cost);
      notes.push(`${def?.name ?? "The spell"} copied into your spellbook (${2 * lvl} hours, ${cost} gp): the scroll is destroyed.`);
      break;
    }

    case "forgetSpell": {
      c.spells = c.spells.filter((x) => !(x.spell === op.payload.spell && x.list === op.payload.list));
      break;
    }

    case "setRollAdjust": {
      const { key, bonus, penalty, note } = op.payload;
      const cur = (c.rollAdjust[key] ??= { bonus: 0, penalty: 0 });
      if (bonus !== undefined) cur.bonus = bonus;
      if (penalty !== undefined) cur.penalty = penalty;
      if (note !== undefined) {
        if (note) cur.note = note;
        else delete cur.note;
      }
      if (!cur.bonus && !cur.penalty) delete c.rollAdjust[key];
      break;
    }

    case "setCustomAction": {
      const a = op.payload.action;
      const i = c.customActions.findIndex((x) => x.id === a.id);
      if (i >= 0) c.customActions[i] = a;
      else c.customActions.push(a);
      notes.push(i >= 0 ? `${a.name} changed.` : `${a.name} added to your actions.`);
      break;
    }

    case "removeCustomAction": {
      c.customActions = c.customActions.filter((x) => x.id !== op.payload.id);
      delete c.resourcesUsed[`custom-${op.payload.id}`];
      break;
    }

    case "setCustomSpell": {
      const { spell, list } = op.payload;
      const i = c.customSpells.findIndex((x) => x.id === spell.id);
      if (i >= 0) c.customSpells[i] = spell;
      else c.customSpells.push(spell);
      const sid = customSpellId(spell.id);
      c.spells = c.spells.filter((x) => x.spell !== sid);
      c.spells.push({ spell: sid, list, prepared: true });
      notes.push(i >= 0 ? `${spell.name} changed.` : `${spell.name} added to your spells.`);
      break;
    }

    case "removeCustomSpell": {
      const sid = customSpellId(op.payload.id);
      c.customSpells = c.customSpells.filter((x) => x.id !== op.payload.id);
      c.spells = c.spells.filter((x) => x.spell !== sid);
      break;
    }

    case "setProfRemoved": {
      const { kind, target, removed, reason } = op.payload;
      c.profRemoved = (c.profRemoved ?? []).filter((x) => !(x.kind === kind && x.target === target));
      if (removed) c.profRemoved.push(reason ? { kind, target, reason } : { kind, target });
      break;
    }

    case "setOptionalFeature": {
      const { feature, on } = op.payload;
      const off = new Set(c.optionalOff ?? []);
      if (on) off.delete(feature);
      else off.add(feature);
      c.optionalOff = [...off];
      if (!on) notes.push("Its picks are kept in case you turn it back on.");
      break;
    }

    case "setPbAdjust": {
      const { bonus, penalty, note } = op.payload;
      if (bonus !== undefined) c.pbAdjust.bonus = bonus;
      if (penalty !== undefined) c.pbAdjust.penalty = penalty;
      if (note !== undefined) {
        if (note) c.pbAdjust.note = note;
        else delete c.pbAdjust.note;
      }
      break;
    }

    case "recharge": {
      const { summon, name, used } = op.payload;
      const holder = summon ? c.summons.find((m) => m.id === summon) : c.shape;
      if (!holder) break;
      const list = new Set(holder.recharge ?? []);
      if (used) list.add(name);
      else list.delete(name);
      if (list.size) holder.recharge = [...list];
      else delete holder.recharge;
      notes.push(used ? `${name}: used, recharging.` : `${name} is ready again.`);
      break;
    }

    case "setDefense": {
      const { kind, value, on, note } = op.payload;
      const list = c.defenseAdjust[kind];
      if (on && !list.includes(value)) list.push(value);
      if (!on) c.defenseAdjust[kind] = list.filter((x) => x !== value);
      if (note !== undefined) {
        if (note) c.defenseAdjust.note = note;
        else delete c.defenseAdjust.note;
      }
      break;
    }

    case "setStory": {
      Object.assign(c.story, op.payload);
      break;
    }

    case "setCalendar": {
      const cal = c.story.calendar;
      const { kind, custom, minutes, add, followRests } = op.payload;
      if (kind) cal.kind = kind;
      if (custom) cal.custom = custom;
      if (minutes !== undefined) cal.minutes = minutes;
      if (add) cal.minutes = Math.max(0, cal.minutes + add);
      if (followRests !== undefined) cal.followRests = followRests;
      break;
    }

    case "addNote": {
      const at = new Date(Number(op.at.slice(0, 13)) || Date.now()).toISOString();
      const { title, body, category, pinned, session, gameDate } = op.payload;
      c.notes.unshift({ id: op.id, title, body, category, pinned: !!pinned, createdAt: at, updatedAt: at, ...(session !== undefined ? { session } : {}), ...(gameDate ? { gameDate } : {}) });
      break;
    }

    case "updateNote": {
      const n = c.notes.find((x) => x.id === op.payload.id);
      if (!n) break;
      const { title, body, category, pinned, session } = op.payload;
      if (title !== undefined) n.title = title;
      if (body !== undefined) n.body = body;
      if (category !== undefined) n.category = category;
      if (pinned !== undefined) n.pinned = pinned;
      if (session === null) delete n.session;
      else if (session !== undefined) n.session = session;
      n.updatedAt = new Date(Number(op.at.slice(0, 13)) || Date.now()).toISOString();
      break;
    }

    case "removeNote": {
      c.notes = c.notes.filter((x) => x.id !== op.payload.id);
      break;
    }

    case "setCustomBackground": {
      const cur = (c.customBackground ??= { name: "", languages: 1 });
      const { name, languages, featureName, featureText } = op.payload;
      if (name !== undefined) cur.name = name;
      if (languages !== undefined) cur.languages = languages;
      if (featureName !== undefined) {
        if (featureName) cur.featureName = featureName;
        else delete cur.featureName;
      }
      if (featureText !== undefined) {
        if (featureText) cur.featureText = featureText;
        else delete cur.featureText;
      }
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

  // Dodge is lost if you're incapacitated or your speed drops to 0.
  const dodge = c.effects.find((e) => e.untilTurnStart && e.toggles?.includes("dodging"));
  if (dodge && !(op.type === "useAction" && op.payload.action === "common-dodge")) {
    const after = derive(c, reg);
    const states = after.effects.flatMap((e) => [e.id, ...e.includes.map((x) => x.id)]);
    const incapacitated = states.some((id) => /(incapacitated|paralyzed|petrified|stunned|unconscious)$/.test(id)) || c.hp.current === 0;
    const still = after.speed.total === 0 || !!c.combat?.speedZero;
    if (incapacitated || still) {
      removeEffects([dodge]);
      notes.push(`Dodge ends: ${incapacitated ? "you're incapacitated" : "your speed is 0"}.`);
    }
  }

  // Building at full HP (a Constitution bonus, a race's extra hit points): stay at full.
  if (["setChoice", "setAbilities", "chooseAsi", "setDetails", "setSubclass"].includes(op.type) && input.hp.current >= maxHp) {
    c.hp.current = derive(c, reg).hpMax.total;
  }

  // A lower HP maximum (Exhaustion 4, Aid ending) pulls current HP down with it.
  if (["addEffect", "removeEffect", "updateEffect", "endTurn", "setItem", "removeItem", "setChoice", "setAbilities", "chooseAsi", "setDetails", "setSubclass", "levelDown"].includes(op.type)) {
    const newMax = derive(c, reg).hpMax.total;
    if (c.hp.current > newMax) {
      c.hp.current = newMax;
      notes.push(`HP lowered to the new maximum of ${newMax}.`);
    }
  }

  // A form held by an effect (Polymorph): the effect gone ends the form, and the form ending ends the effect.
  if (c.shape?.effect && !c.effects.some((e) => e.id === c.shape!.effect)) {
    notes.push(`${reg.find(c.shape.creature, "creature")?.name ?? "The form"} ends with the spell: back in your normal form.`);
    delete c.shape;
  }
  if (input.shape?.effect && c.shape?.effect !== input.shape.effect && c.effects.some((e) => e.id === input.shape!.effect)) {
    c.effects = c.effects.filter((e) => e.id !== input.shape!.effect);
  }

  // Effects that say something when they end (Haste's lethargy), however they ended.
  const still = new Set(c.effects.map((e) => e.id));
  for (const e of input.effects) {
    if (still.has(e.id) || e.effect === "custom") continue;
    const def = reg.find(reg.effectId(e.effect), "effect");
    if (def?.endNote) notes.push(`${def.name} ends: ${def.endNote}`);
    // What follows it (Haste's lethargy), until after your next turn: ending on your turn, this turn's end doesn't count.
    if (def?.afterEffect && reg.find(def.afterEffect, "effect") && !c.effects.some((x) => x.effect === def.afterEffect)) {
      c.effects.push({ id: `${e.id}-after`, effect: def.afterEffect, rounds: c.combat?.myTurn ? 2 : 1 });
    }
  }
  if (c.combat?.hasteAttack && !c.effects.some((e) => reg.find(reg.effectId(e.effect), "effect")?.actions?.some((a) => a.limited))) c.combat.hasteAttack = false;

  return { character: c, notes, prompts };
}
