import { ABILITIES, ABILITY_NAMES, SKILLS, SKILL_ABILITY, SKILL_NAMES, } from "@dnd/schema";
import { sum, signed } from "./breakdown.js";
import { evalExpr, evalFlat } from "./expr.js";
import { collectSources } from "./sources.js";
import { spellSlots } from "./spellSlots.js";
function proficiencyBonus(level) {
    return 2 + Math.floor((level - 1) / 4);
}
/** "roll.attack.*" matches "roll.attack.weapon.ranged"; an exact selector matches only itself. */
export function selectorMatches(selector, key) {
    if (selector === key)
        return true;
    if (selector.endsWith(".*"))
        return key.startsWith(selector.slice(0, -1));
    return false;
}
/**
 * Computes the full derived sheet. Pure: the same character and content
 * always give the same result, and nothing is stored back on the character.
 */
export function derive(c, reg) {
    const warnings = [];
    const sources = collectSources(c, reg);
    const level = c.classes.reduce((t, cl) => t + cl.level, 0);
    const pb = proficiencyBonus(level);
    const classLevels = Object.fromEntries(c.classes.map((cl) => [cl.class, cl.level]));
    // Equipment state the conditions need.
    const equipped = c.inventory
        .filter((i) => i.equipped)
        .map((i) => ({ inst: i, def: reg.get(i.item, "item") }));
    const armorWorn = equipped.find((e) => e.def.category === "armor" && e.def.armor);
    const shieldHeld = equipped.find((e) => e.def.category === "shield");
    const attunedCount = c.inventory.filter((i) => i.attuned).length;
    if (attunedCount > 3)
        warnings.push(`${attunedCount} items attuned; the limit is 3.`);
    // Ability scores: base, fixed bonuses, then bonuses to abilities the player picked.
    const chosenBonus = (s, ab) => {
        const ch = s.grant.abilityChoice;
        if (!ch)
            return 0;
        const picked = s.choices[ch.choice] ?? [];
        return picked.includes(ab) ? ch.amount : 0;
    };
    for (const s of sources) {
        const ch = s.grant.abilityChoice;
        if (ch && !(s.choices[ch.choice]?.length))
            warnings.push(`${s.label}: choice "${ch.choice}" has not been made.`);
    }
    const abilities = {};
    for (const ab of ABILITIES) {
        const parts = [{ label: "Base score", value: c.abilities[ab] ?? 10 }];
        for (const s of sources) {
            const bonus = (s.grant.abilityBonuses?.[ab] ?? 0) + chosenBonus(s, ab);
            if (bonus)
                parts.push({ label: s.label, value: bonus });
        }
        const score = sum(parts);
        if (score.total > 20)
            warnings.push(`${ABILITY_NAMES[ab]} is ${score.total}, above the usual maximum of 20.`);
        abilities[ab] = { score, modifier: Math.floor((score.total - 10) / 2) };
    }
    const mods = Object.fromEntries(ABILITIES.map((a) => [a, abilities[a].modifier]));
    const ctx = { pb, mods, level, classLevels };
    /** Expression context for one source: its level tables resolved at the character's class level. */
    const ctxCache = new Map();
    const ctxFor = (s) => {
        if (!s.scaling)
            return ctx;
        const cached = ctxCache.get(s);
        if (cached)
            return cached;
        const scale = {};
        for (const [name, sc] of Object.entries(s.scaling)) {
            const lvl = classLevels[sc.class] ?? 0;
            const row = [...sc.table].sort((a, b) => a[0] - b[0]).filter(([at]) => at <= lvl).at(-1);
            scale[name] = row ? row[1] : 0;
        }
        const result = { ...ctx, scale };
        ctxCache.set(s, result);
        return result;
    };
    // Proficiencies.
    const profs = {
        save: new Set(),
        skill: new Set(),
        expertise: new Set(),
        armor: new Set(),
        weapon: new Set(),
        tool: new Set(),
        language: new Set(),
    };
    const resolveTargets = (p, s) => {
        if (typeof p.target === "string")
            return [p.target];
        const chosen = s.choices[p.target.choice];
        if (!chosen || chosen.length === 0) {
            warnings.push(`${s.label}: choice "${p.target.choice}" has not been made.`);
            return [];
        }
        return chosen;
    };
    const upgrades = [];
    for (const s of sources) {
        for (const p of s.grant.proficiencies ?? []) {
            for (const t of resolveTargets(p, s)) {
                if (p.kind === "skillOrExpertise")
                    upgrades.push(t);
                else
                    profs[p.kind].add(t);
            }
        }
    }
    // Proficiency, or expertise when another source already gives proficiency.
    for (const t of upgrades) {
        if (profs.skill.has(t))
            profs.expertise.add(t);
        else
            profs.skill.add(t);
    }
    // Modifiers.
    const active = sources.flatMap((source) => (source.grant.modifiers ?? []).map((mod) => ({ mod, source })));
    const conditionState = (when) => {
        if (!when)
            return "pass";
        if (when.noArmor && armorWorn)
            return "fail";
        if (when.noHeavyArmor && armorWorn?.def.armor?.category === "heavy")
            return "fail";
        if (when.noShield && shieldHeld)
            return "fail";
        if (when.withShield && !shieldHeld)
            return "fail";
        for (const [ab, min] of Object.entries(when.minScore ?? {})) {
            if (abilities[ab].score.total < (min ?? 0))
                return "fail";
        }
        if (when.toggle && !c.toggles.includes(when.toggle))
            return "fail";
        if (when.text)
            return "unknown";
        return "pass";
    };
    const labelOf = (a) => a.mod.label ?? a.source.label;
    const flatOf = (a) => (a.mod.value === undefined ? 0 : evalFlat(a.mod.value, ctxFor(a.source)));
    /** Modifiers that touch any of `keys`. Item-scoped selectors only count for that item. */
    const modsFor = (keys, itemInstanceId) => {
        const found = active.filter((a) => {
            if (a.mod.selector.startsWith("item.")) {
                if (!itemInstanceId || a.source.itemInstanceId !== itemInstanceId)
                    return false;
            }
            return keys.some((k) => selectorMatches(a.mod.selector, k));
        });
        // Same stacking key: keep the strongest flat value, else the first.
        const best = new Map();
        const rest = [];
        const strength = (m) => {
            try {
                return flatOf(m);
            }
            catch {
                return 0;
            }
        };
        for (const a of found) {
            const key = a.mod.stackingKey;
            if (!key) {
                rest.push(a);
                continue;
            }
            const current = best.get(key);
            if (!current || strength(a) > strength(current))
                best.set(key, a);
        }
        return [...rest, ...best.values()];
    };
    const describeEffect = (a) => {
        const m = a.mod;
        if (m.op === "advantage" || m.op === "disadvantage")
            return m.op;
        if (m.value === undefined)
            return m.op;
        return evalExpr(m.value, ctxFor(a.source))
            .map((t) => (t.kind === "dice" ? `+${t.dice}` : signed(t.value)))
            .join(" ");
    };
    /** Builds a d20-roll (or damage) breakdown from base parts plus every matching modifier. */
    const roll = (keys, base, itemInstanceId) => {
        const parts = [...base];
        const dice = [];
        const advantage = [];
        const disadvantage = [];
        const suggestions = [];
        let critAt;
        let minD20;
        for (const a of modsFor(keys, itemInstanceId)) {
            const { mod } = a;
            if ((mod.op === "critRange" || mod.op === "minD20") && mod.value !== undefined && conditionState(mod.when) === "pass") {
                const v = flatOf(a);
                if (mod.op === "critRange")
                    critAt = Math.min(critAt ?? 20, v);
                else
                    minD20 = Math.max(minD20 ?? 1, v);
                continue;
            }
            if (!["add", "advantage", "disadvantage"].includes(mod.op))
                continue;
            const state = conditionState(mod.when);
            if (state === "fail")
                continue;
            if (state === "unknown" || mod.mode === "suggested") {
                const apply = { flat: 0, dice: [] };
                if (mod.op === "advantage" || mod.op === "disadvantage")
                    apply.mode = mod.op;
                else if (mod.value !== undefined) {
                    for (const term of evalExpr(mod.value, ctxFor(a.source))) {
                        if (term.kind === "dice")
                            apply.dice.push(term.dice);
                        else
                            apply.flat += term.value;
                    }
                }
                if (mod.damageType)
                    apply.damageType = mod.damageType;
                const s = { label: labelOf(a), effect: describeEffect(a), apply };
                if (mod.when?.text)
                    s.reason = mod.when.text;
                suggestions.push(s);
                continue;
            }
            if (mod.op === "advantage")
                advantage.push(labelOf(a));
            else if (mod.op === "disadvantage")
                disadvantage.push(labelOf(a));
            else if (mod.value !== undefined) {
                for (const term of evalExpr(mod.value, ctxFor(a.source))) {
                    if (term.kind === "dice") {
                        const d = { label: labelOf(a), dice: term.dice };
                        if (mod.damageType)
                            d.damageType = mod.damageType;
                        dice.push(d);
                    }
                    else
                        parts.push({ label: term.label ? `${labelOf(a)} (${term.label})` : labelOf(a), value: term.value });
                }
            }
        }
        const result = { ...sum(parts), dice, advantage, disadvantage, suggestions };
        if (critAt !== undefined && critAt < 20)
            result.critAt = critAt;
        if (minD20 !== undefined && minD20 > 1)
            result.minD20 = minD20;
        return result;
    };
    /** Flat additions to a stat (AC, speed, HP max); dice are not allowed here. */
    const statAdds = (key) => {
        const parts = [];
        for (const a of modsFor([key])) {
            if (a.mod.op !== "add" || a.mod.value === undefined)
                continue;
            if (conditionState(a.mod.when) !== "pass" || a.mod.mode === "suggested")
                continue;
            parts.push({ label: labelOf(a), value: flatOf(a) });
        }
        return parts;
    };
    const abilityPart = (ab) => ({ label: `${ABILITY_NAMES[ab]} modifier`, value: mods[ab] });
    const pbPart = (times = 1) => times === 2 ? { label: "Expertise (2 × proficiency)", value: pb * 2 } : { label: "Proficiency bonus", value: pb };
    // Saving throws.
    const saves = {};
    for (const ab of ABILITIES) {
        const proficient = profs.save.has(ab);
        const base = [abilityPart(ab), ...(proficient ? [pbPart()] : [])];
        saves[ab] = { ...roll([`roll.save.${ab}`], base), proficient };
    }
    // Skills.
    const skills = {};
    for (const sk of SKILLS) {
        const ab = SKILL_ABILITY[sk];
        const proficiency = profs.expertise.has(sk) ? 2 : profs.skill.has(sk) ? 1 : 0;
        if (profs.expertise.has(sk) && !profs.skill.has(sk)) {
            warnings.push(`${SKILL_NAMES[sk]}: expertise without proficiency.`);
        }
        const base = [abilityPart(ab), ...(proficiency > 0 ? [pbPart(proficiency)] : [])];
        skills[sk] = { ...roll([`roll.check.skill.${sk}`, `roll.check.${ab}`], base), ability: ab, proficiency };
    }
    const passive = (sk) => {
        const s = skills[sk];
        const parts = [{ label: "Base", value: 10 }, ...s.parts, ...statAdds(`stat.passive.${sk}`)];
        if (s.advantage.length && !s.disadvantage.length)
            parts.push({ label: `Advantage (${s.advantage.join(", ")})`, value: 5 });
        if (s.disadvantage.length && !s.advantage.length)
            parts.push({ label: `Disadvantage (${s.disadvantage.join(", ")})`, value: -5 });
        return sum(parts);
    };
    // Armor Class: the best base formula, then shield and flat bonuses.
    const acCandidates = [];
    if (armorWorn?.def.armor) {
        const a = armorWorn.def.armor;
        const parts = [{ label: armorWorn.inst.name ?? armorWorn.def.name, value: a.base }];
        if (armorWorn.def.magic?.bonus)
            parts.push({ label: "Magic armor", value: armorWorn.def.magic.bonus });
        if (a.category === "light")
            parts.push(abilityPart("dex"));
        if (a.category === "medium") {
            const caps = modsFor(["stat.ac"]).filter((m) => m.mod.op === "mediumArmorDexCap" && m.mod.value !== undefined && conditionState(m.mod.when) === "pass");
            const cap = Math.max(2, ...caps.map(flatOf));
            parts.push(mods.dex > cap ? { label: `Dexterity modifier (max ${cap})`, value: cap } : abilityPart("dex"));
        }
        acCandidates.push(parts);
    }
    else {
        acCandidates.push([{ label: "Unarmored", value: 10 }, abilityPart("dex")]);
    }
    for (const a of modsFor(["stat.ac"])) {
        if (a.mod.op !== "acBase" || a.mod.value === undefined)
            continue;
        if (conditionState(a.mod.when) !== "pass" || a.mod.mode === "suggested")
            continue;
        acCandidates.push(evalExpr(a.mod.value, ctxFor(a.source)).map((t) => {
            if (t.kind === "dice")
                throw new Error(`AC formula cannot contain dice (${labelOf(a)})`);
            return { label: t.label ?? labelOf(a), value: t.value };
        }));
    }
    const bestAc = acCandidates.reduce((best, cand) => (sum(cand).total > sum(best).total ? cand : best));
    const acParts = [...bestAc];
    if (shieldHeld) {
        acParts.push({ label: shieldHeld.inst.name ?? shieldHeld.def.name, value: shieldHeld.def.shieldBonus ?? 2 });
        if (shieldHeld.def.magic?.bonus)
            acParts.push({ label: "Magic shield", value: shieldHeld.def.magic.bonus });
    }
    acParts.push(...statAdds("stat.ac"));
    const ac = sum(acParts);
    // Initiative is a Dexterity check, so check bonuses apply too.
    const initiative = roll(["roll.initiative", "roll.check.dex"], [abilityPart("dex")]);
    // Speed.
    const race = reg.get(c.race, "race");
    const speed = sum([{ label: race.name, value: race.speed }, ...statAdds("stat.speed.walk")]);
    // Hit points.
    const hpParts = [];
    const hitDice = [];
    c.classes.forEach((cl, index) => {
        const def = reg.get(cl.class, "class");
        const avg = def.hitDie / 2 + 1;
        let levelsLeft = cl.level;
        if (index === 0) {
            hpParts.push({ label: `${def.name} level 1 (d${def.hitDie} maximum)`, value: def.hitDie });
            levelsLeft -= 1;
        }
        if (levelsLeft > 0) {
            const rolls = cl.hpRolls ?? [];
            const total = Array.from({ length: levelsLeft }, (_, i) => rolls[i] ?? avg).reduce((t, v) => t + v, 0);
            const how = rolls.length >= levelsLeft ? "rolled" : rolls.length === 0 ? `average ${avg} each` : "rolled and average";
            const more = index === 0 ? ` ${levelsLeft} more level${levelsLeft > 1 ? "s" : ""}` : ` ${levelsLeft} level${levelsLeft > 1 ? "s" : ""}`;
            hpParts.push({ label: `${def.name}${more} (${how})`, value: total });
        }
        const die = `d${def.hitDie}`;
        const existing = hitDice.find((h) => h.die === die);
        if (existing)
            existing.total += cl.level;
        else
            hitDice.push({ die, total: cl.level, used: c.hitDiceUsed[die] ?? 0 });
    });
    hpParts.push({ label: `Constitution modifier × ${level} levels`, value: mods.con * level });
    hpParts.push(...statAdds("stat.hp.max"));
    const hpMax = sum(hpParts);
    // Attacks: every weapon carried (switching weapons needs no edit), plus attacks features grant.
    const attacks = [];
    const buildAttacks = (w, o) => {
        const ability = w.kind === "ranged" ? "dex" : w.properties.includes("finesse") && mods.dex > mods.str ? "dex" : "str";
        const magic = o.magicBonus ? [{ label: "Magic weapon", value: o.magicBonus }] : [];
        const modes = [w.kind];
        if (w.kind === "melee" && w.properties.includes("thrown"))
            modes.push("thrown");
        for (const mode of modes) {
            const thrown = mode === "thrown";
            const attackKeys = [`roll.attack.weapon.${mode}`, "item.attack", `attack.${o.attackId}`];
            const damageKeys = [`roll.damage.weapon.${mode}`, "item.damage", `damage.${o.attackId}`];
            if (thrown) {
                attackKeys.push(`attack.${o.attackId}.thrown`);
                damageKeys.push(`damage.${o.attackId}.thrown`);
            }
            const attack = roll(attackKeys, [abilityPart(ability), ...(o.proficient ? [pbPart()] : []), ...magic], o.itemInstanceId);
            const bonus = roll(damageKeys, [abilityPart(ability), ...magic], o.itemInstanceId);
            const critMods = modsFor(damageKeys, o.itemInstanceId).filter((a) => conditionState(a.mod.when) === "pass");
            const onCrit = critMods.filter((a) => a.mod.op === "critBonusDamage").map((a) => ({ label: labelOf(a), value: flatOf(a) }));
            const critExtraDice = critMods.filter((a) => a.mod.op === "extraCritDice").map((a) => ({ label: labelOf(a), value: flatOf(a) }));
            const entry = {
                attackId: o.attackId,
                name: thrown ? `${o.name} (thrown)` : o.name,
                mode,
                action: o.action,
                ability,
                proficient: o.proficient,
                attack,
                damage: { dice: w.damage, type: w.damageType, bonus, onCrit, critExtraDice },
                properties: w.properties,
            };
            if (o.itemInstanceId)
                entry.itemInstanceId = o.itemInstanceId;
            if (w.versatileDamage && !thrown)
                entry.damage.versatileDice = w.versatileDamage;
            if (w.range && mode !== "melee")
                entry.range = w.range;
            attacks.push(entry);
        }
    };
    for (const inst of c.inventory) {
        const def = reg.get(inst.item, "item");
        const w = def.weapon;
        if (!w)
            continue;
        const proficient = profs.weapon.has(w.category) || profs.weapon.has(w.group);
        if (!proficient)
            warnings.push(`${inst.name ?? def.name}: not proficient, so no proficiency bonus on attacks.`);
        const o = { attackId: def.id, name: inst.name ?? def.name, proficient, itemInstanceId: inst.id, action: "attack" };
        if (def.magic?.bonus)
            o.magicBonus = def.magic.bonus;
        buildAttacks(w, o);
    }
    for (const s of sources) {
        for (const a of s.grant.attacks ?? []) {
            const w = a;
            buildAttacks(w, { attackId: a.id, name: a.name, proficient: true, action: a.action });
        }
    }
    // Spellcasting: classes that have reached their casting level, plus feats and features.
    const casters = [];
    const casterLevels = [];
    const resolveAbility = (sc, s) => {
        if (typeof sc.ability === "string")
            return sc.ability;
        const picked = s?.choices[sc.ability.choice]?.[0];
        if (!picked)
            warnings.push(`${s?.label ?? sc.label}: choose the spellcasting ability ("${sc.ability.choice}").`);
        return picked;
    };
    for (const cl of c.classes) {
        const def = reg.get(cl.class, "class");
        if (!def.spellcasting)
            continue;
        casterLevels.push({ progression: def.spellcasting.progression, level: cl.level });
        const ability = resolveAbility(def.spellcasting);
        if (ability && cl.level >= (def.spellcastingFromLevel ?? 1))
            casters.push({ ...def.spellcasting, ability });
    }
    for (const s of sources) {
        const sc = s.grant.spellcasting;
        if (!sc || casters.some((x) => x.id === sc.id))
            continue;
        const ability = resolveAbility(sc, s);
        if (ability)
            casters.push({ id: sc.id, label: sc.label, ability });
    }
    const spellcasting = casters.map((sc) => ({
        id: sc.id,
        label: sc.label,
        ability: sc.ability,
        saveDc: sum([{ label: "Base", value: 8 }, pbPart(), abilityPart(sc.ability), ...statAdds("stat.spell.dc")]),
        attack: sum([pbPart(), abilityPart(sc.ability), ...statAdds("stat.spell.attack")]),
    }));
    const slots = spellSlots(casterLevels);
    // Resources.
    const resources = [];
    for (const s of sources) {
        for (const r of s.grant.resources ?? []) {
            const max = evalFlat(r.max, ctxFor(s));
            const used = Math.min(c.resourcesUsed[r.id] ?? 0, max);
            const entry = { id: r.id, name: r.name, max, used, remaining: max - used, reset: r.reset, source: s.label };
            if (r.die) {
                const terms = evalExpr(r.die, ctxFor(s));
                const die = terms[0];
                entry.die = die && die.kind === "dice" ? die.dice.replace(/^1d/, "d") : r.die;
            }
            resources.push(entry);
        }
    }
    // Defenses and senses.
    const defenses = { resist: [], immune: [], vulnerable: [] };
    for (const a of active) {
        const m = /^defense\.(resist|immune|vulnerable)\.(.+)$/.exec(a.mod.selector);
        if (!m || conditionState(a.mod.when) !== "pass" || a.mod.mode === "suggested")
            continue;
        const list = defenses[m[1]];
        if (!list.includes(m[2]))
            list.push(m[2]);
    }
    const senses = {};
    for (const s of sources) {
        for (const [sense, range] of Object.entries(s.grant.senses ?? {}))
            senses[sense] = Math.max(senses[sense] ?? 0, range);
    }
    const toggles = [];
    for (const a of active) {
        const name = a.mod.when?.toggle;
        if (name && !toggles.some((t) => t.name === name))
            toggles.push({ name, label: labelOf(a), on: c.toggles.includes(name) });
    }
    const sheet = {
        toggles,
        level,
        proficiencyBonus: pb,
        abilities,
        saves,
        skills,
        passives: { perception: passive("perception"), investigation: passive("investigation"), insight: passive("insight") },
        ac,
        initiative,
        speed,
        hpMax,
        hitDice,
        attacks,
        spellcasting,
        spellSlots: slots.slots.map((total, i) => ({ level: i + 1, total })),
        resources,
        proficiencies: {
            armor: [...profs.armor],
            weapons: [...profs.weapon],
            tools: [...profs.tool],
            languages: [...profs.language],
        },
        defenses,
        senses,
        warnings,
    };
    if (slots.pact)
        sheet.pactSlots = slots.pact;
    return sheet;
}
