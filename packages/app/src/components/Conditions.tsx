import { createContext, useContext, type ReactNode } from "react";

/** Opens a condition's card on top of the current panel. */
export const ConditionLinks = createContext<(id: string) => void>(() => undefined);

const WORDS = ["blinded", "charmed", "deafened", "exhaustion", "frightened", "grappled", "incapacitated", "invisible", "paralyzed", "petrified", "poisoned", "prone", "restrained", "stunned", "unconscious"];
const RE = new RegExp(`\\b(${WORDS.join("|")})\\b`, "gi");

/** Text where every condition name is a link to its card. */
export function RichText({ text }: { text: string }): ReactNode {
  const show = useContext(ConditionLinks);
  const parts: ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(RE)) {
    const i = m.index ?? 0;
    if (i > last) parts.push(text.slice(last, i));
    const id = `condition:${m[1]!.toLowerCase()}`;
    parts.push(
      <button key={i} className="cond-link" onClick={() => show(id)}>
        {m[1]}
      </button>,
    );
    last = i + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts}</>;
}

/** A table row's cells: "| a | b |" → ["a", "b"]. */
const cells = (row: string) => row.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((x) => x.trim());
const isRow = (p: string) => p.trim().startsWith("|");
const isRule = (p: string) => /^\|?\s*:?-{2,}/.test(p.trim());

/**
 * Book text paragraphs: markdown headings ("##### Precipitation") as small
 * headings, runs of table rows as a table, everything else as text with
 * condition links.
 */
export function TextBlocks({ text }: { text: string[] }): ReactNode {
  const out: ReactNode[] = [];
  for (let i = 0; i < text.length; ) {
    const p = text[i]!;
    if (isRow(p)) {
      const rows: string[][] = [];
      for (; i < text.length && (isRow(text[i]!) || isRule(text[i]!)); i++) if (!isRule(text[i]!)) rows.push(cells(text[i]!));
      const [head, ...body] = rows;
      out.push(
        <div className="text-table-wrap" key={`t${i}`}>
          <table className="text-table">
            {head && (
              <thead>
                <tr>{head.map((c, j) => <th key={j}>{c}</th>)}</tr>
              </thead>
            )}
            <tbody>
              {body.map((r, k) => (
                <tr key={k}>{r.map((c, j) => <td key={j}><RichText text={c} /></td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }
    const h = /^#{2,6}\s+(.+)$/.exec(p.trim());
    out.push(
      h ? (
        <h4 className="text-head" key={i}>
          {h[1]}
        </h4>
      ) : (
        <p key={i}>
          <RichText text={p} />
        </p>
      ),
    );
    i++;
  }
  return <>{out}</>;
}
