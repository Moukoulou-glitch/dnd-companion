import type { Ability, SpellDef } from "@dnd/schema";
import { clean, isThirdParty, OFFICIAL_CLASSES, slug, splitHeadings } from "./text.js";

const ABILITIES: Record<string, Ability> = {
  strength: "str",
  dexterity: "dex",
  constitution: "con",
  intelligence: "int",
  wisdom: "wis",
  charisma: "cha",
};
const DAMAGE_TYPES = "acid|bludgeoning|cold|fire|force|lightning|necrotic|piercing|poison|psychic|radiant|slashing|thunder";

/** True when the file looks like a list of spells ("#### Name" then "*Level 1 Evocation*"). */
export function looksLikeSpells(text: string): boolean {
  return /^#### .+\n\*(Level \d \w+|\w+ Cantrip)[^*]*\*/m.test(text.replace(/\r/g, ""));
}

function castingTime(raw: string): { time: string; ritual: boolean } {
  let t = raw.trim();
  const ritual = /\bor Ritual\b/i.test(t);
  t = t.replace(/\s*or Ritual\b/i, "").trim();
  t = t
    .replace(/^Action\b/i, "1 action")
    .replace(/^Bonus action\b/i, "1 bonus action")
    .replace(/^Reaction\b/i, "1 reaction");
  return { time: t, ritual };
}

function addDice(dice: string, extraCount: number): string {
  const m = /^(\d+)d(\d+)(.*)$/.exec(dice);
  if (!m) return dice;
  return `${Number(m[1]) + extraCount}d${m[2]}${m[3]}`;
}

/** Reads damage, saves, attacks and healing out of a spell's text. Anything unclear is left out. */
export function spellMechanics(level: number, text: string[], higher: string[]): Partial<SpellDef> {
  const all = text.join(" ");
  const up = higher.join(" ");
  const out: Partial<SpellDef> = {};

  const atk = /\b(ranged|melee) spell attack/i.exec(all);
  if (atk) out.attack = atk[1]!.toLowerCase() as "ranged" | "melee";

  const save = /(?:make|succeed on|fail) an? (Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma) saving throw/i.exec(all);
  const halfOnSave = /half as much damage on a successful/i.test(all);

  let dmg = new RegExp(`(\\d+d\\d+)(?: \\+ your spellcasting ability modifier)? (${DAMAGE_TYPES}) damage`, "i").exec(all);
  // "3d8 damage of the type you chose" (Chromatic Orb): the first type of the list the caster chooses from.
  if (!dmg) {
    const plain = /(\d+d\d+) damage/i.exec(all);
    const listed = new RegExp(`\\b(${DAMAGE_TYPES}), (?:(?:${DAMAGE_TYPES}), )+(?:or )?(?:${DAMAGE_TYPES})\\b`, "i").exec(all);
    if (plain && listed && /choose|choice/i.test(all)) dmg = Object.assign([`${plain[1]} ${listed[1]} damage`, plain[1]!, listed[1]!], { index: plain.index, input: all }) as unknown as RegExpExecArray;
  }
  if (dmg) {
    const withMod = /\+ your spellcasting ability modifier/.test(dmg[0]) ? " + MOD" : "";
    const base = dmg[1]! + withMod;
    const type = dmg[2]!.toLowerCase();
    if (level === 0) {
      const at = (lvl: number) => new RegExp(`${lvl}th level \\((\\d+d\\d+)`).exec(all)?.[1];
      const table: Record<string, string> = { "1": base };
      for (const lvl of [5, 11, 17]) {
        const d = at(lvl);
        if (d) table[String(lvl)] = d + withMod;
      }
      out.damage = { type, atCharacterLevel: table };
    } else {
      const per = /increases by (\d+)d(\d+) for (?:each|every) slot level above (\d)/i.exec(up);
      // Scales only when the extra dice are the same size as the base dice.
      const sameDie = per && /d(\d+)/.exec(base)?.[1] === per[2];
      const table: Record<string, string> = {};
      for (let s = level; s <= 9; s++) table[String(s)] = sameDie ? addDice(base, (s - level) * Number(per![1])) : base;
      out.damage = { type, atSlot: sameDie ? table : { [String(level)]: base } };
    }
  }

  if (save) {
    out.save = { ability: ABILITIES[save[1]!.toLowerCase()]!, onSuccess: halfOnSave ? "half" : dmg ? "none" : "other" };
  }

  const heal = /regains? (?:a number of )?hit points equal to (\d+d\d+) \+ your spellcasting ability modifier/i.exec(all);
  if (heal && level > 0) {
    const per = /healing increases by (\d+)d(\d+) for each slot level above/i.exec(up);
    const table: Record<string, string> = {};
    for (let s = level; s <= 9; s++) table[String(s)] = `${per ? addDice(heal[1]!, (s - level) * Number(per[1])) : heal[1]} + MOD`;
    out.heal = { atSlot: table };
  }

  const area = /(\d+)-foot(?:-radius)?[- ](cube|cone|sphere|line|cylinder|radius|square|emanation)/i.exec(all);
  if (area) out.area = `${area[1]}-foot ${area[2]!.toLowerCase()}`;
  return out;
}

/** Parses every spell in a markdown export into spell definitions. */
export function parseSpells(text: string, pack: string, excluded: string[] = []): SpellDef[] {
  const out: SpellDef[] = [];
  for (const e of splitHeadings(text, "####")) {
    if (isThirdParty(e.lines.join("\n"))) {
      excluded.push(e.name);
      continue;
    }
    const head = e.lines.find((l) => l.trim().startsWith("*"));
    if (!head) continue;
    const h = clean(head);
    let level: number;
    let school: string;
    const lv = /^Level (\d) (\w+)/.exec(h);
    const ct = /^(\w+) Cantrip/.exec(h);
    if (lv) {
      level = Number(lv[1]);
      school = lv[2]!;
    } else if (ct) {
      level = 0;
      school = ct[1]!;
    } else continue;

    const field = (label: string) => {
      const l = e.lines.find((x) => x.includes(`**${label}:**`));
      return l ? clean(l.slice(l.indexOf(`**${label}:**`) + label.length + 5)) : "";
    };
    const { time, ritual } = castingTime(field("Casting Time"));
    const compRaw = field("Components");
    const material = /M \((.+)\)\s*$/.exec(compRaw)?.[1];
    const components = (["V", "S", "M"] as const).filter((c) => new RegExp(`(^|, )${c}\\b`).test(compRaw));
    const duration = field("Duration");

    // Body: after the second rule ("---") following the field list.
    const rules = e.lines.map((l, i) => (/^-{3,}\s*$/.test(l.trim()) ? i : -1)).filter((i) => i >= 0);
    const start = rules[0] !== undefined ? rules[0] + 1 : 0;
    const textOut: string[] = [];
    const higher: string[] = [];
    let classes: string[] = [];
    for (const raw of e.lines.slice(start)) {
      const line = raw.trim();
      if (!line || /^(-{3,}|_{3,})$/.test(line)) continue;
      if (line.startsWith("**Classes:**")) {
        classes = clean(line.slice(12))
          .split(",")
          .map((c) => c.trim().toLowerCase())
          .filter((c) => OFFICIAL_CLASSES.includes(c));
        continue;
      }
      const c = clean(line.replace(/^[-*] /, "• "));
      if (/^At Higher Levels\.\s*/i.test(c)) higher.push(c.replace(/^At Higher Levels\.\s*/i, ""));
      else if (c) textOut.push(c);
    }

    const def: SpellDef = {
      kind: "spell",
      id: `spell:${slug(e.name)}`,
      name: e.name,
      source: { pack },
      level,
      school,
      castingTime: time,
      range: field("Range"),
      components: [...components],
      duration,
      concentration: /^Concentration/i.test(duration),
      ritual,
      classes,
      text: textOut,
      higherLevels: higher,
      ...spellMechanics(level, textOut, higher),
    };
    if (material) def.material = material;
    out.push(def);
  }
  return out;
}
