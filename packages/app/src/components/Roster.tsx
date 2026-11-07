import { useState } from "react";
import type { ContentRegistry } from "@dnd/engine";
import type { Character } from "@dnd/schema";
import { raceCrest } from "../fx/crest";
import { CharacterToken } from "./CharacterToken";

export interface RosterEntry {
  id: string;
  name: string;
  summary: string;
  character: Character;
}

/** What the Characters page shows of one: its classes with levels and subclasses, its race. */
export function rosterLines(c: Character, reg: ContentRegistry): { classes: string; race: string; words: string } {
  const parts = [...c.classes]
    .sort((a, b) => b.level - a.level)
    .map((cl) => {
      const name = reg.find(cl.class, "class")?.name ?? cl.class.replace(/^class:/, "");
      const sub = cl.subclass ? reg.find(cl.subclass, "subclass")?.name ?? cl.subclass.replace(/^subclass:/, "").replace(/-/g, " ") : "";
      return { line: `${name} ${cl.level}${sub ? ` · ${sub}` : ""}`, words: `${name} ${sub}` };
    });
  const race = reg.find(c.race, "race")?.name ?? c.race.replace(/^race:/, "").replace(/-/g, " ");
  return { classes: parts.map((p) => p.line).join(" / "), race, words: `${parts.map((p) => p.words).join(" ")} ${race}` };
}

/** The Characters page's list: a token for each, name, classes with subclasses, race; searchable by any of them. */
export function RosterList({ roster, selectedId, reg, onSelect }: { roster: RosterEntry[]; selectedId: string | null; reg: ContentRegistry; onSelect: (id: string) => void }) {
  const [q, setQ] = useState("");
  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const rows = roster.map((r) => ({ r, l: rosterLines(r.character, reg) }));
  const shown = words.length ? rows.filter(({ r, l }) => words.every((w) => `${r.name} ${l.words}`.toLowerCase().includes(w))) : rows;
  return (
    <>
      {roster.length > 1 && <input className="search" type="search" placeholder="Search by name, race, class or subclass" aria-label="Search characters" value={q} onChange={(e) => setQ(e.target.value)} />}
      {words.length > 0 && !shown.length && <p className="note">No character matches “{q.trim()}”.</p>}
      {shown.length > 0 && (
        <div className="group roster">
          {shown.map(({ r, l }) => (
            <button className="row roster-row" key={r.id} aria-current={r.id === selectedId} onClick={() => onSelect(r.id)}>
              <CharacterToken
                classes={r.character.classes.map((cl) => ({ key: cl.class.replace(/^class:/, ""), level: cl.level, ...(cl.subclass ? { subclass: cl.subclass } : {}) }))}
                race={raceCrest(r.character, reg.find(r.character.race, "race")?.name)}
              />
              <div className="row-main">
                <div className="row-title">{r.name}</div>
                <div className="row-sub">{l.classes}</div>
                <div className="row-sub roster-race">{l.race}</div>
              </div>
              {r.id === selectedId && <span className="tag adv">open</span>}
            </button>
          ))}
        </div>
      )}
    </>
  );
}
