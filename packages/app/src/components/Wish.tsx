import { useMemo, useState } from "react";
import type { ContentRegistry } from "@dnd/engine";

/**
 * After casting Wish: duplicate a spell of 8th level or lower (no stress), or
 * wish for something else (the stress follows: its tag, with 2d4 days of
 * Strength 3). Picking a spell puts it on your Spells tab, at will, for now.
 */
export function WishPanel({ registry, onDuplicate, onOther }: { registry: ContentRegistry; onDuplicate: (spell: string) => void; onOther: () => void }) {
  const [mode, setMode] = useState<"ask" | "spell">("ask");
  const [q, setQ] = useState("");
  const spells = useMemo(
    () =>
      registry
        .list("spell")
        .filter((s) => s.level <= 8 && s.id !== "spell:wish")
        .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name)),
    [registry],
  );
  if (mode === "ask")
    return (
      <>
        <p className="note">What do you wish for?</p>
        <div className="group">
          <button className="row" onClick={() => setMode("spell")}>
            <div className="row-main">
              <div className="row-title">Duplicate a spell</div>
              <div className="row-sub">Any spell of 8th level or lower, with no components and no stress.</div>
            </div>
          </button>
          <button className="row" onClick={onOther}>
            <div className="row-main">
              <div className="row-title">Something else</div>
              <div className="row-sub">Your DM decides what happens. The stress follows: its tag, with 2d4 days of Strength 3 rolled now.</div>
            </div>
          </button>
        </div>
      </>
    );
  const shown = spells.filter((s) => s.name.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 80);
  return (
    <>
      <input className="search" type="search" placeholder="Search spells" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search spells" />
      <div className="group">
        {shown.map((s) => (
          <button key={s.id} className="row" onClick={() => onDuplicate(s.id)}>
            <div className="row-main">
              <div className="row-title">{s.name}</div>
              <div className="row-sub">{s.level === 0 ? "Cantrip" : `Level ${s.level}`}, {s.school.toLowerCase()}</div>
            </div>
          </button>
        ))}
      </div>
    </>
  );
}
