/**
 * Dice formula grammar (a superset of common roller notation):
 *
 *   formula   := term (("+" | "-") term)*
 *   term      := dice | number
 *   dice      := [count] "d" (sides | "%") modifier* [ "[" label "]" ]
 *   modifier  := "kh" n | "kl" n          keep highest / lowest n
 *              | "r<=" n | "r" n          reroll once at or below n
 *              | "min" n                  each die counts as at least n
 *              | "cs>=" n                 critical on a natural n or more (d20s)
 *   number    := digits [ "[" label "]" ]
 *
 * Examples: "1d20+5", "2d20kh1+7", "2d6r<=2+4", "1d20min10+8",
 *           "1d8[piercing]+3+2d6[fire]", "d%".
 * Labels name a term in breakdowns; on damage they are the damage type.
 */

export interface DiceTerm {
  kind: "dice";
  sign: 1 | -1;
  count: number;
  sides: number;
  keep?: { which: "highest" | "lowest"; n: number };
  rerollAtOrBelow?: number;
  min?: number;
  critAtOrAbove?: number;
  label?: string;
}

export interface FlatTerm {
  kind: "flat";
  sign: 1 | -1;
  value: number;
  label?: string;
}

export type Term = DiceTerm | FlatTerm;

export class FormulaError extends Error {}

const TERM = /^(\d*)d(\d+|%)((?:kh\d+|kl\d+|r<=\d+|r\d+|min\d+|cs>=\d+)*)(?:\[([^\]]+)\])?$/i;
const FLAT = /^(\d+)(?:\[([^\]]+)\])?$/;
const MOD = /(kh|kl|r<=|r|min|cs>=)(\d+)/gi;

export function parseFormula(input: string): Term[] {
  const src = input.replace(/\s+/g, "");
  if (!src) throw new FormulaError("Empty formula");

  // Split on + and - that are not inside [labels].
  const chunks: { sign: 1 | -1; text: string }[] = [];
  let sign: 1 | -1 = 1;
  let buf = "";
  let depth = 0;
  for (const ch of src) {
    if (ch === "[") depth++;
    if (ch === "]") depth--;
    if (depth === 0 && (ch === "+" || ch === "-")) {
      if (buf) chunks.push({ sign, text: buf });
      else if (chunks.length > 0) throw new FormulaError(`Two signs in a row in "${input}"`);
      sign = ch === "-" ? -1 : 1;
      buf = "";
      continue;
    }
    buf += ch;
  }
  if (!buf) throw new FormulaError(`Formula "${input}" ends with a sign`);
  chunks.push({ sign, text: buf });

  return chunks.map(({ sign: s, text }) => {
    const flat = FLAT.exec(text);
    if (flat) {
      const t: FlatTerm = { kind: "flat", sign: s, value: Number(flat[1]) };
      if (flat[2]) t.label = flat[2];
      return t;
    }
    const m = TERM.exec(text);
    if (!m) throw new FormulaError(`Can't read "${text}" in "${input}"`);
    const count = m[1] ? Number(m[1]) : 1;
    const sides = m[2] === "%" ? 100 : Number(m[2]);
    if (count < 1 || count > 100) throw new FormulaError(`Dice count must be 1 to 100 in "${text}"`);
    if (sides < 2 || sides > 1000) throw new FormulaError(`Dice sides must be 2 to 1000 in "${text}"`);
    const t: DiceTerm = { kind: "dice", sign: s, count, sides };
    for (const [, op, nStr] of (m[3] ?? "").matchAll(MOD)) {
      const n = Number(nStr);
      switch (op!.toLowerCase()) {
        case "kh":
        case "kl":
          if (n < 1 || n > count) throw new FormulaError(`Can't keep ${n} of ${count} dice in "${text}"`);
          t.keep = { which: op!.toLowerCase() === "kh" ? "highest" : "lowest", n };
          break;
        case "r":
        case "r<=":
          if (n >= sides) throw new FormulaError(`Rerolling ${n} or less on a d${sides} would never stop in "${text}"`);
          t.rerollAtOrBelow = n;
          break;
        case "min":
          t.min = n;
          break;
        case "cs>=":
          t.critAtOrAbove = n;
          break;
      }
    }
    if (m[4]) t.label = m[4];
    return t;
  });
}

/** Writes terms back as a formula string. */
export function formatFormula(terms: Term[]): string {
  return terms
    .map((t, i) => {
      const sign = t.sign < 0 ? "-" : i === 0 ? "" : "+";
      if (t.kind === "flat") return `${sign}${t.value}${t.label ? `[${t.label}]` : ""}`;
      let s = `${sign}${t.count}d${t.sides}`;
      if (t.keep) s += `${t.keep.which === "highest" ? "kh" : "kl"}${t.keep.n}`;
      if (t.rerollAtOrBelow) s += `r<=${t.rerollAtOrBelow}`;
      if (t.min) s += `min${t.min}`;
      if (t.critAtOrAbove) s += `cs>=${t.critAtOrAbove}`;
      if (t.label) s += `[${t.label}]`;
      return s;
    })
    .join("");
}
