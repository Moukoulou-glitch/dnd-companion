import { SKILL_NAMES, type ChoiceDef, type Proficiency } from "@dnd/schema";
import { LANGUAGES, TOOLS } from "../build.js";
import { clean, isThirdParty, paragraphs, splitHeadings } from "./text.js";

/** A background as a "## Name" markdown export shows it, with what it grants read from its bullet lines. */
export interface BookBackground {
  name: string;
  text: string[];
  proficiencies: Proficiency[];
  choices: ChoiceDef[];
  feature?: { name: string; text: string[] };
}

const ARTISAN = TOOLS.slice(0, TOOLS.indexOf("Woodcarver's tools") + 1);
const GAMING = ["Dice set", "Playing card set"];
const INSTRUMENTS = TOOLS.slice(TOOLS.indexOf("Bagpipes"));
const COUNTS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, any: 1, a: 1 };

const skillByName = new Map(Object.entries(SKILL_NAMES).map(([k, v]) => [v.toLowerCase(), k]));
const toolByName = new Map(TOOLS.map((t) => [t.toLowerCase(), t]));
const languageByName = new Map(LANGUAGES.map((l) => [l.toLowerCase(), l]));

/** "a, b, and c" -> ["a", "b", "c"]. */
function items(list: string): string[] {
  return list
    .split(/,|\band\b|\bor\b/)
    .map((x) => x.trim().replace(/\.$/, ""))
    .filter(Boolean);
}

function toolGroup(phrase: string): string[] | undefined {
  if (/gaming set/i.test(phrase)) return GAMING;
  if (/musical instrument/i.test(phrase)) return INSTRUMENTS;
  if (/artisan/i.test(phrase)) return ARTISAN;
  return undefined;
}

/** Reads one background's grants; anything it can't read stays in the text for the player. */
function grants(lines: string[]): { proficiencies: Proficiency[]; choices: ChoiceDef[] } {
  const proficiencies: Proficiency[] = [];
  const choices: ChoiceDef[] = [];
  const addChoice = (kind: "skill" | "tool" | "language", count: number, from?: string[]) => {
    const base = kind === "skill" ? "skills" : kind === "tool" ? "tools" : "languages";
    const id = choices.some((c) => c.id === base) ? `${base}-${choices.filter((c) => c.id.startsWith(base)).length + 1}` : base;
    const label = kind === "skill" ? "Skills" : kind === "tool" ? "Tools" : "Languages";
    choices.push({ id, label, kind, count, ...(from ? { from } : {}) });
    proficiencies.push({ kind, target: { choice: id } });
  };
  for (const raw of lines) {
    const m = /^[-*]\s+\*\*(.+?):\*\*\s*(.+)$/.exec(raw.trim());
    if (!m) continue;
    const label = m[1]!.toLowerCase();
    const value = clean(m[2]!);
    if (label === "skill proficiencies") {
      const among = /(?:plus )?(one|two) (?:from among|of the following:?|chosen from) (.+)$/i.exec(value);
      const fixedPart = among ? value.slice(0, among.index) : value;
      const free = /^(one|two|three|four) of your choice/i.exec(fixedPart.trim());
      if (free) addChoice("skill", COUNTS[free[1]!.toLowerCase()]!);
      else
        for (const n of items(fixedPart)) {
          const k = skillByName.get(n.toLowerCase());
          if (k) proficiencies.push({ kind: "skill", target: k });
        }
      if (among) {
        const from = items(among[2]!).map((n) => skillByName.get(n.toLowerCase())).filter((k): k is string => !!k);
        if (from.length) addChoice("skill", COUNTS[among[1]!.toLowerCase()]!, from);
      }
    } else if (label === "tool proficiencies") {
      // "One type of artisan's tools, or navigator's tools, or an additional language" is one choice.
      if (/,?\s+or\s+/i.test(value) && toolGroup(value)) {
        const from = [...toolGroup(value)!, ...items(value).map((n) => toolByName.get(n.toLowerCase())).filter((t): t is string => !!t)];
        addChoice("tool", 1, [...new Set(from)]);
        continue;
      }
      for (const part of value.split(/,\s*/)) {
        const group = toolGroup(part);
        const count = /^(one|two)/i.exec(part)?.[1];
        if (group) addChoice("tool", COUNTS[(count ?? "one").toLowerCase()]!, group);
        else if (/vehicles \((land|water)\)/i.test(part)) proficiencies.push({ kind: "tool", target: `Vehicles (${/water/i.test(part) ? "water" : "land"})` });
        else {
          const t = toolByName.get(part.trim().toLowerCase());
          if (t) proficiencies.push({ kind: "tool", target: t });
        }
      }
    } else if (label === "languages") {
      const free = /^(one|two|three|any one|any two) (?:of your choice|other language)/i.exec(value);
      if (free) addChoice("language", COUNTS[free[1]!.split(" ").pop()!.toLowerCase()]!);
      else
        for (const n of items(value)) {
          const l = languageByName.get(n.toLowerCase());
          if (l) proficiencies.push({ kind: "language", target: l });
        }
    }
  }
  return { proficiencies, choices };
}

/** Backgrounds from a "## Name" markdown export: text, grants, and the "Feature:" section as its own feature. */
export function parseBackgrounds(text: string, excluded: string[] = []): BookBackground[] {
  const out: BookBackground[] = [];
  for (const e of splitHeadings(text, "##")) {
    if (isThirdParty(e.lines.join("\n"))) {
      excluded.push(e.name);
      continue;
    }
    const body = paragraphs(e.lines);
    if (!body.length) continue;
    const { proficiencies, choices } = grants(e.lines);
    let feature: BookBackground["feature"];
    const sections = splitHeadings(e.lines.join("\n"), "####");
    const f = sections.find((s) => /^Feature: /.test(s.name) && !/Choose a Feature/i.test(s.name));
    if (f) feature = { name: f.name.replace(/^Feature: /, ""), text: paragraphs(f.lines) };
    out.push({ name: e.name, text: body, proficiencies, choices, ...(feature ? { feature } : {}) });
  }
  return out;
}
