/**
 * Spell search: every word typed must match the spell's name, school, level
 * ("1st", "level 2", "2", "cantrip"), or "ritual" / "concentration".
 * "2nd evocation" finds the 2nd-level evocation spells.
 */
export interface SearchableSpell {
  name: string;
  level: number;
  school?: string;
  ritual?: boolean;
  concentration?: boolean;
}

const ORD = ["cantrip", "1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th", "9th"];

export function spellHaystack(s: SearchableSpell): string[] {
  const words = s.name.toLowerCase().split(/[^a-z0-9']+/).filter(Boolean);
  const lvl = s.level === 0 ? ["cantrip", "cantrips", "0", "level0", "lvl0"] : [ORD[s.level]!, String(s.level), "level", `level${s.level}`, `lvl${s.level}`];
  return [...words, s.name.toLowerCase(), ...(s.school ? [s.school.toLowerCase()] : []), ...lvl, ...(s.ritual ? ["ritual"] : []), ...(s.concentration ? ["concentration"] : [])];
}

export function spellMatches(query: string, s: SearchableSpell): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  // The whole name typed with its spaces ("magic mis") still matches.
  if (s.name.toLowerCase().includes(q)) return true;
  // "level 2" and "lvl 2" read as one word.
  const tokens = q.replace(/\b(level|lvl)\s+(\d)\b/g, "$1$2").split(/\s+/).filter(Boolean);
  const hay = spellHaystack(s);
  return tokens.every((t) => {
    // A number or an ordinal is the level, exactly ("1" doesn't find 11 or a name with 1 in it).
    if (/^\d$/.test(t) || /^(level|lvl)\d$/.test(t) || ORD.includes(t) || t === "cantrips") return hay.includes(t);
    return hay.some((h) => h.startsWith(t) || (t.length >= 3 && h.includes(t)));
  });
}
