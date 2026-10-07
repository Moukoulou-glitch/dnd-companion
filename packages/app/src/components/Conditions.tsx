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
