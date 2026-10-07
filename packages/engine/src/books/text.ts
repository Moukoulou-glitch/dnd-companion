/**
 * Helpers for reading book text the player loads on their own device
 * (markdown exports and copied pages). Nothing here ships any book text.
 */

/** "Hunter's Mark" -> "hunters-mark", the id style the packs use. */
export function slug(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Removes markdown emphasis, links and HTML tags, and normalizes odd hyphens and spaces. */
export function clean(line: string): string {
  return line
    .replace(/<[^>]+>/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\*{1,3}([^*]+?)\*{1,3}/g, "$1")
    .replace(/\*/g, "")
    .replace(/[‐‑‒–]/g, (c) => (c === "–" ? "–" : "-"))
    .replace(/ /g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Splits a markdown file into entries at headings of exactly this level ("##" or "####"). */
export function splitHeadings(text: string, marker: "##" | "####"): { name: string; lines: string[] }[] {
  const out: { name: string; lines: string[] }[] = [];
  const re = new RegExp(`^${marker} (?!#)(.+)$`);
  let cur: { name: string; lines: string[] } | undefined;
  for (const raw of text.replace(/\r/g, "").split("\n")) {
    const m = re.exec(raw);
    if (m) {
      cur = { name: clean(m[1]!), lines: [] };
      out.push(cur);
    } else if (cur) cur.lines.push(raw);
  }
  return out;
}

/**
 * Turns markdown body lines into paragraphs: one per non-empty line, list
 * items with a bullet, table rows with their cells joined, rules dropped.
 */
export function paragraphs(lines: string[]): string[] {
  const out: string[] = [];
  for (const raw of lines) {
    // Sidebars come as blockquotes ("> ##### Interacting with Objects"): read them as ordinary lines.
    const line = raw.trim().replace(/^>\s?/, "").trim();
    if (!line || /^(-{3,}|_{3,})$/.test(line)) continue;
    if (/^\|?\s*:?-{2,}/.test(line)) continue; // table separator row
    if (line.startsWith("|")) {
      const cells = line.split("|").map(clean).filter(Boolean);
      if (cells.length) out.push(cells.join(" · "));
      continue;
    }
    if (/^#{2,6} /.test(line)) {
      out.push(clean(line.replace(/^#+ /, "")));
      continue;
    }
    if (/^[-*] /.test(line)) {
      out.push(`• ${clean(line.slice(2))}`);
      continue;
    }
    const c = clean(line);
    if (c) out.push(c);
  }
  return out;
}

/**
 * Third-party publishers' material that shows up in exported lists. The
 * table plays official 2014 content plus its own homebrew, so these are
 * never loaded.
 */
const THIRD_PARTY = /Grim Hollow|Vampire: The Masquerade|Lord of the Rings|Humblewood|Ghostfire|Kobold Press|Tal'Dorei|Critical Role|Salvage text|removed due to homebrew|Advanced Weapon/i;

export function isThirdParty(text: string): boolean {
  return THIRD_PARTY.test(text);
}

/** The classes of the 2014 rules; anything else on a spell's class list is third-party and dropped. */
export const OFFICIAL_CLASSES = ["artificer", "barbarian", "bard", "cleric", "druid", "fighter", "monk", "paladin", "ranger", "rogue", "sorcerer", "warlock", "wizard"];
