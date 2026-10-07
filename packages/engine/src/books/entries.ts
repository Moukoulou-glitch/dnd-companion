import { clean, isThirdParty, paragraphs, splitHeadings } from "./text.js";

/** A named piece of text from a book file: a feat, a background, a race trait, a class feature. */
export interface TextEntry {
  name: string;
  text: string[];
}

export type EntryFileKind = "feats" | "races" | "backgrounds";

/** Guesses what a "## Name" markdown file holds. */
export function entryFileKind(text: string): EntryFileKind | undefined {
  if (!/^## /m.test(text)) return undefined;
  if (/\*\*Ability Scores:\*\*|\*\*Creature Type:\*\*/.test(text)) return "races";
  if (/\*\*Skill Proficiencies:\*\*/.test(text) && /#### Feature:/.test(text)) return "backgrounds";
  return "feats";
}

/** Feats and backgrounds: one entry per "## Name" heading. */
export function parseEntries(text: string, excluded: string[] = []): TextEntry[] {
  return splitHeadings(text, "##")
    .filter((e) => {
      const tp = isThirdParty(e.lines.join("\n"));
      if (tp) excluded.push(e.name);
      return !tp;
    })
    .map((e) => ({ name: e.name, text: paragraphs(e.lines) }))
    .filter((e) => e.text.length > 0);
}

/**
 * Race traits ("***Darkvision.*** You can see..."): one entry per trait name,
 * first one wins, so the same trait shared by several races appears once.
 */
export function parseRaceTraits(text: string): TextEntry[] {
  const out = new Map<string, string[]>();
  for (const e of splitHeadings(text, "##")) {
    if (isThirdParty(e.lines.join("\n"))) continue;
    let cur: string[] | undefined;
    for (const raw of e.lines) {
      const line = raw.trim();
      const m = /^\*\*\*(.+?)\.\*\*\*\s*(.*)$/.exec(line);
      if (m) {
        const name = clean(m[1]!);
        if (out.has(name)) {
          cur = undefined;
          continue;
        }
        cur = [clean(m[2]!)].filter(Boolean);
        out.set(name, cur);
      } else if (/^(#|---|You may roll for your character)/.test(line)) {
        cur = undefined;
      } else if (cur && line) {
        const c = clean(line);
        if (c) cur.push(c);
      }
    }
  }
  return [...out].map(([name, text]) => ({ name, text })).filter((e) => e.text.length > 0);
}

const SOURCE = /\s+(PHB'14|PHB|XGE|TCE|SCAG|DMG'14|DMG|MTF|VGM|VRGR|FTD|EGW|ERLW|GGR|MOT|SCC|AAG|BMT|[A-Z]{2,5}'?\d{0,2}) p\d+$/;

/** True when the file is a copied class page ("Level 1: Rage PHB'14 p46"). */
export function looksLikeClassPage(text: string): boolean {
  return /^Level \d+: .+ p\d+$/m.test(text);
}

/**
 * A copied class page: every "Name SRC pNN" heading starts an entry (class
 * features, subclasses, subclass features, options like fighting styles).
 * "Path of the Beast: Level 6: Bestial Soul TCE p24" becomes "Bestial Soul".
 */
export function parseClassPage(text: string): TextEntry[] {
  const out: TextEntry[] = [];
  let cur: TextEntry | undefined;
  for (const raw of text.replace(/\r/g, "").split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    if (SOURCE.test(line) && line.length < 120) {
      let name = line.replace(SOURCE, "");
      name = name.replace(/^(?:.+?: )?Level \d+: /, "").trim();
      cur = { name, text: [] };
      out.push(cur);
      continue;
    }
    if (!cur) continue;
    if (/^(Reprinted as|Subclass source:|Source:|\d+(st|nd|rd|th)-level .*(feature|optional feature)\b)/.test(line)) continue;
    cur.text.push(line.replace(/\t+/g, " · "));
  }
  return out.filter((e) => e.text.length > 0);
}
