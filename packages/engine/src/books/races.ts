import { ABILITIES, ABILITY_NAMES, type Ability } from "@dnd/schema";
import { LANGUAGES } from "../build.js";
import { clean, isThirdParty, splitHeadings } from "./text.js";

/** A race as a "## Name" markdown export shows it: its numbers and its traits. */
export interface BookRace {
  name: string;
  /** Fixed bonuses ("Dexterity +2; Charisma +1"), or a free choice (Tasha's and later: +2/+1 or three +1). */
  abilities: Partial<Record<Ability, number>> | "choose";
  size: "small" | "medium";
  speed: number;
  creatureType?: string;
  darkvision?: number;
  languages: string[];
  /** "one other language of your choice". */
  languageChoice: number;
  traits: { name: string; text: string[] }[];
}

const byName = new Map(ABILITIES.map((a) => [ABILITY_NAMES[a].toLowerCase(), a]));
/** Traits that are only description, not something the character has. */
const FLAVOR = /^(Age|Alignment|Size|Languages|Creature Type)$/i;

export function parseBookRaces(text: string, excluded: string[] = []): BookRace[] {
  const out: BookRace[] = [];
  for (const e of splitHeadings(text, "##")) {
    const raw = e.lines.join("\n");
    if (isThirdParty(raw)) {
      excluded.push(e.name);
      continue;
    }
    const field = (label: string) => new RegExp(`\\*\\*${label}:\\*\\*\\s*(.+)`, "i").exec(raw)?.[1]?.trim() ?? "";
    const ab = field("Ability Scores");
    if (!ab) continue;
    let abilities: BookRace["abilities"] = {};
    if (/choose/i.test(ab)) abilities = "choose";
    else
      for (const m of ab.matchAll(/([A-Za-z]+)\s*\+(\d)/g)) {
        const a = byName.get(m[1]!.toLowerCase());
        if (a) abilities[a] = Number(m[2]);
      }
    const size = /small/i.test(field("Size")) && !/medium/i.test(field("Size")) ? "small" : "medium";
    const speed = Number(/(\d+)\s*feet/i.exec(field("Speed"))?.[1] ?? 30);
    const type = field("Creature Type");
    const traits: BookRace["traits"] = [];
    let cur: { name: string; text: string[] } | undefined;
    for (const line of e.lines.map((l) => l.trim())) {
      const m = /^\*\*\*(.+?)\.\*\*\*\s*(.*)$/.exec(line);
      if (m) {
        cur = { name: clean(m[1]!), text: [clean(m[2]!)].filter(Boolean) };
        traits.push(cur);
      } else if (/^(#|---|>)/.test(line)) cur = undefined;
      else if (cur && line) cur.text.push(line.startsWith("- ") ? `• ${clean(line.slice(2))}` : clean(line));
    }
    const lang = traits.find((t) => /^Languages$/i.test(t.name))?.text.join(" ") ?? "";
    const languages = LANGUAGES.filter((l) => new RegExp(`\\b${l}\\b`).test(lang));
    if (!languages.includes("Common") && /common/i.test(lang)) languages.unshift("Common");
    const languageChoice = /one (other|extra|additional)? ?language/i.test(lang) ? 1 : 0;
    const dv = traits.find((t) => /darkvision/i.test(t.name));
    const darkvision = dv ? Number(/(\d+)\s*feet/.exec(dv.text.join(" "))?.[1] ?? 60) : undefined;
    out.push({
      name: e.name,
      abilities,
      size,
      speed,
      ...(type && !/^humanoid$/i.test(type) ? { creatureType: type.toLowerCase() } : {}),
      ...(darkvision ? { darkvision } : {}),
      languages,
      languageChoice,
      traits: traits.filter((t) => !FLAVOR.test(t.name) && t.text.length > 0),
    });
  }
  return out;
}
