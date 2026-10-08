import { ABILITIES, type CreatureAction, type CreatureDef } from "@dnd/schema";
import { clean, isThirdParty, slug } from "./text.js";

/** A bestiary export: stat blocks in blockquotes ("> ## Wolf"). */
export function looksLikeBestiary(text: string): boolean {
  return /^>\s*## /m.test(text) && /\*\*Armor Class\*\*/.test(text) && /\*\*Challenge\*\*/.test(text);
}

const DAMAGE = ["acid", "bludgeoning", "cold", "fire", "force", "lightning", "necrotic", "piercing", "poison", "psychic", "radiant", "slashing", "thunder"];
const SKILL_KEYS: Record<string, string> = { "animal handling": "animalHandling", "sleight of hand": "sleightOfHand" };

function cr(v: string): number {
  const m = /^(\d+)(?:\/(\d+))?/.exec(v.trim());
  if (!m) return 0;
  return m[2] ? Number(m[1]) / Number(m[2]) : Number(m[1]);
}

function action(name: string, text: string): CreatureAction {
  const a: CreatureAction = { name, text };
  const m = /(Melee|Ranged)(?: or Ranged)? Weapon Attack:\s*\+(\d+) to hit,\s*(?:reach|range) ([^,]+),.*?Hit:\s*\d+\s*\((\d+d\d+)\s*([+-]\s*\d+)?\)\s*(\w+) damage/i.exec(text);
  if (m && DAMAGE.includes(m[6]!.toLowerCase())) {
    a.attack = {
      kind: m[1]!.toLowerCase() as "melee" | "ranged",
      toHit: Number(m[2]),
      reach: m[3]!.trim(),
      damage: m[4]!,
      damageBonus: Number((m[5] ?? "0").replace(/\s/g, "")),
      damageType: m[6]!.toLowerCase() as NonNullable<CreatureAction["attack"]>["damageType"],
    };
  }
  return a;
}

/** Reads stat blocks; third-party ones are left out. */
export function parseBestiary(text: string, pack: string, excluded: string[] = []): CreatureDef[] {
  const out: CreatureDef[] = [];
  const blocks = text.replace(/\r/g, "").split(/\n(?=___\s*\n>\s*## )|\n---\s*\n/);
  for (const block of blocks) {
    const lines = block.split("\n").map((l) => l.replace(/^>\s?/, "").trimEnd());
    const head = lines.findIndex((l) => /^## /.test(l));
    if (head < 0) continue;
    const name = clean(lines[head]!.slice(3));
    if (isThirdParty(block)) {
      excluded.push(name);
      continue;
    }
    const field = (label: string) => lines.find((l) => new RegExp(`^- \\*\\*${label}\\*\\*`, "i").test(l))?.replace(/^- \*\*[^*]+\*\*\s*/, "").trim() ?? "";
    const typeLine = /^\*(.+)\*$/.exec(lines[head + 1]?.trim() ?? "")?.[1] ?? "";
    const tm = /^(\w+)\s+([^,]+?)(?:,\s*(.+))?$/.exec(typeLine);
    const acRaw = field("Armor Class");
    const hpRaw = field("Hit Points");
    const challenge = field("Challenge");
    if (!acRaw || !hpRaw || !challenge) continue;
    const speed: CreatureDef["speed"] = { walk: 0 };
    for (const part of field("Speed").split(",")) {
      const sm = /(?:(walk|swim|fly|climb|burrow)\s+)?(\d+)\s*ft\.?(\s*\(hover\))?/i.exec(part.trim());
      if (!sm) continue;
      const k = (sm[1]?.toLowerCase() ?? "walk") as keyof CreatureDef["speed"];
      (speed as Record<string, number | boolean>)[k] = Number(sm[2]);
      if (sm[3]) speed.hover = true;
    }
    const abilityRow = lines.find((l) => /^\|\s*\d+\s*\(/.test(l));
    const scores = abilityRow ? [...abilityRow.matchAll(/(\d+)\s*\(/g)].map((m) => Number(m[1])) : [];
    if (scores.length < 6) continue;
    const abilities = Object.fromEntries(ABILITIES.map((a, i) => [a, scores[i]!])) as CreatureDef["abilities"];
    const skills: Record<string, number> = {};
    for (const m of field("Skills").matchAll(/([A-Za-z ]+?)\s*\+(\d+)/g)) {
      const k = m[1]!.trim().toLowerCase();
      skills[SKILL_KEYS[k] ?? k] = Number(m[2]);
    }
    const saves: Record<string, number> = {};
    for (const m of field("Saving Throws").matchAll(/(Str|Dex|Con|Int|Wis|Cha)\w*\s*\+(\d+)/gi)) saves[m[1]!.toLowerCase().slice(0, 3)] = Number(m[2]);
    const senses: Record<string, number> = {};
    for (const m of field("Senses").matchAll(/(Darkvision|Blindsight|Tremorsense|Truesight)\s+(\d+)/gi)) senses[m[1]!.toLowerCase()] = Number(m[2]);
    // "Lightning, Thunder; Bludgeoning, Piercing, and Slashing from nonmagical attacks": the plain types come first;
    // the nonmagical part stays as a note.
    const list = (label: string) => {
      const v = field(label);
      const plain = v.includes(";") ? v.split(";")[0]! : /nonmagical|silvered|adamantine/i.test(v) ? "" : v;
      return plain
        .split(",")
        .map((x) => x.replace(/^and\s+/i, "").trim().toLowerCase())
        .filter((x) => DAMAGE.includes(x));
    };
    const defenseNotes = ["Damage Resistances", "Damage Vulnerabilities"]
      .map((l) => [l, field(l)] as const)
      .filter(([, v]) => /nonmagical|silvered|adamantine/i.test(v))
      .map(([l, v]) => ({ name: l, text: v }));
    // "Immunities Poison; Exhaustion, Grappled…": damage types before the semicolon, conditions after.
    const imm = field("Immunities") || field("Damage Immunities");
    const [immDamage, immCond] = imm.split(";");
    const traits: CreatureDef["traits"] = [];
    const actions: CreatureAction[] = [];
    const bonusActions: CreatureAction[] = [];
    const reactions: CreatureAction[] = [];
    let section: "traits" | "actions" | "bonus" | "reactions" | "other" = "traits";
    let last: { name: string; text: string } | undefined;
    for (const raw of lines.slice(head + 2)) {
      const l = raw.trim();
      const h = /^###\s+(.+)$/.exec(l);
      if (h) {
        const t = h[1]!.toLowerCase();
        section = t.startsWith("action") ? "actions" : t.startsWith("bonus") ? "bonus" : t.startsWith("reaction") ? "reactions" : "other";
        last = undefined;
        continue;
      }
      const e = /^\*\*\*(.+?)\.\*\*\*\s*(.*)$/.exec(l);
      if (e) {
        const n = clean(e[1]!);
        const body = clean(e[2]!);
        if (section === "traits") traits.push((last = { name: n, text: body }) as CreatureDef["traits"][number]);
        else if (section === "actions") actions.push((last = action(n, body)) as CreatureAction);
        else if (section === "bonus") bonusActions.push((last = action(n, body)) as CreatureAction);
        else if (section === "reactions") reactions.push((last = action(n, body)) as CreatureAction);
        continue;
      }
      if (last && l && !/^(-|\||_{3,}|---)/.test(l)) last.text = `${last.text} ${clean(l)}`.trim();
    }
    const d: CreatureDef = {
      kind: "creature",
      id: `creature:${slug(name)}`,
      name,
      source: { pack },
      size: tm?.[1] ?? "Medium",
      type: (tm?.[2] ?? "beast").toLowerCase(),
      ...(tm?.[3] ? { alignment: tm[3].toLowerCase() } : {}),
      ac: Number(/(\d+)/.exec(acRaw)?.[1] ?? 10),
      ...(/\(([^)]+)\)/.exec(acRaw)?.[1] ? { acNote: /\(([^)]+)\)/.exec(acRaw)![1]! } : {}),
      hp: Number(/(\d+)/.exec(hpRaw)?.[1] ?? 1),
      ...(/\(([^)]+)\)/.exec(hpRaw)?.[1] ? { hitDice: /\(([^)]+)\)/.exec(hpRaw)![1]!.replace(/\s/g, "") } : {}),
      speed,
      abilities,
      ...(Object.keys(saves).length ? { saves: saves as CreatureDef["saves"] } : {}),
      ...(Object.keys(skills).length ? { skills } : {}),
      ...(Object.keys(senses).length ? { senses } : {}),
      ...(field("Languages") && field("Languages") !== "—" ? { languages: field("Languages") } : {}),
      cr: cr(challenge),
      ...(list("Damage Resistances").length ? { resist: list("Damage Resistances") } : {}),
      ...(list("Damage Vulnerabilities").length ? { vulnerable: list("Damage Vulnerabilities") } : {}),
      ...((immDamage ?? "").split(",").map((x) => x.trim().toLowerCase()).filter((x) => DAMAGE.includes(x)).length
        ? { immune: (immDamage ?? "").split(",").map((x) => x.trim().toLowerCase()).filter((x) => DAMAGE.includes(x)) }
        : {}),
      ...(immCond ? { conditionImmune: immCond.split(",").map((x) => x.trim().toLowerCase()).filter(Boolean) } : {}),
      traits: [...defenseNotes, ...traits],
      actions,
      ...(bonusActions.length ? { bonusActions } : {}),
      ...(reactions.length ? { reactions } : {}),
    };
    out.push(d);
  }
  return out;
}
