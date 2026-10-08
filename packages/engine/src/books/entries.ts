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
  return parseClassPageParts(text).entries;
}

/** A subclass as a class page shows it: its intro text and its features by level. */
export interface PageSubclass {
  name: string;
  book?: string;
  page?: number;
  text: string[];
  features: { level: number; name: string; text: string[] }[];
}

export interface ClassPageParts {
  /** The page's title line, when it names one of these classes. */
  className?: string;
  /** Everything with a heading, as before: class features, options, subclass features. */
  entries: TextEntry[];
  /** Headings that belong to the class itself (features and their options). */
  classEntries: TextEntry[];
  subclasses: PageSubclass[];
}

const keyOf = (s: string) => s.toLowerCase().replace(/['’]/g, "").replace(/\s+/g, " ").trim();

/**
 * Reads a class page's structure. Subclasses are the names that later show up
 * as "College of Creation: Level 6: ...". Right after a subclass heading, its
 * first features come as plain "Level 3: Mote of Potential" headings; a
 * "Level N" heading that the class table lists (Expertise, Ability Score
 * Improvement) or that comes from another book belongs to the class again.
 */
export function parseClassPageParts(text: string, classNames: string[] = []): ClassPageParts {
  const lines = text.replace(/\r/g, "").split("\n").map((l) => l.trim());
  const isHeading = (l: string) => SOURCE.test(l) && l.length < 120;
  const subNames = new Set<string>();
  for (const l of lines) {
    if (!isHeading(l)) continue;
    const m = /^(.+?): Level \d+: /.exec(l.replace(SOURCE, ""));
    if (m) subNames.add(m[1]!);
  }
  const firstHeading = lines.findIndex(isHeading);
  const wanted = new Map(classNames.map((n) => [keyOf(n), n]));
  const titleLine = lines.slice(0, firstHeading < 0 ? lines.length : firstHeading).find((l) => wanted.has(keyOf(l)));
  const className = titleLine ? wanted.get(keyOf(titleLine)) : undefined;
  // The class table's feature cells: "Bard College, Expertise", one per line or comma.
  const tableNames = new Set(
    lines
      .slice(0, firstHeading < 0 ? 0 : firstHeading)
      .flatMap((l) => l.split(/[\t,]/))
      .map((x) => keyOf(x))
      .filter(Boolean),
  );

  // A page whose subclasses have no later features (a short copy): a subclass heading is followed by a "Level N" feature the class table doesn't list.
  const heads = lines.filter(isHeading).map((l) => l.replace(SOURCE, "").trim());
  if (!subNames.size) heads.forEach((h, i) => {
    const next = /^Level \d+: (.+)$/.exec(heads[i + 1] ?? "");
    if (!/^(?:.+?: )?Level \d+: /.test(h) && next && !tableNames.has(keyOf(next[1]!))) subNames.add(h);
  });

  const entries: TextEntry[] = [];
  const classEntries: TextEntry[] = [];
  const subs = new Map<string, PageSubclass>();
  const sub = (name: string) => {
    let s = subs.get(name);
    if (!s) subs.set(name, (s = { name, text: [], features: [] }));
    return s;
  };
  let cur: string[] | undefined;
  let inSub: PageSubclass | undefined;
  for (const line of lines) {
    if (!line) continue;
    if (isHeading(line)) {
      const tag = SOURCE.exec(line)!;
      const book = tag[1]!;
      const page = Number(/p(\d+)$/.exec(line)![1]);
      const bare = line.replace(SOURCE, "").trim();
      const name = bare.replace(/^(?:.+?: )?Level \d+: /, "").trim();
      const entry: TextEntry = { name, text: [] };
      entries.push(entry);
      cur = entry.text;
      const pre = /^(.+?): Level (\d+): (.+)$/.exec(bare);
      const lv = /^Level (\d+): (.+)$/.exec(bare);
      if (pre && subNames.has(pre[1]!)) {
        inSub = sub(pre[1]!);
        const f = { level: Number(pre[2]), name, text: entry.text };
        inSub.features.push(f);
      } else if (subNames.has(bare)) {
        inSub = sub(bare);
        inSub.book = book;
        inSub.page = page;
        inSub.text = entry.text;
      } else if (lv && inSub && !tableNames.has(keyOf(name)) && (!inSub.book || inSub.book === book)) {
        inSub.features.push({ level: Number(lv[1]), name, text: entry.text });
      } else if (lv) {
        inSub = undefined;
        classEntries.push(entry);
      } else if (inSub) {
        // An option or a note inside a subclass feature (Arcane Shot options, "Restriction: Knighthood").
        const last = inSub.features[inSub.features.length - 1];
        const into = last?.text ?? inSub.text;
        into.push(`${name}:`);
        cur = into;
        entries.pop();
      } else {
        classEntries.push(entry);
      }
      continue;
    }
    if (!cur) continue;
    if (/^(Reprinted as|Subclass source:|Source:|\d+(st|nd|rd|th)-level .*(feature|optional feature)\b)/.test(line)) continue;
    cur.push(line.replace(/\t+/g, " · "));
  }
  return {
    className,
    entries: entries.filter((e) => e.text.length > 0),
    classEntries: classEntries.filter((e) => e.text.length > 0),
    subclasses: [...subs.values()],
  };
}
