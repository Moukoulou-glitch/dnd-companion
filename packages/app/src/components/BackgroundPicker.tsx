import { useState } from "react";
import { registry } from "../content";

/** Every background in the content, searchable; the current one marked. */
export function BackgroundPicker({ current, onPick }: { current?: string | undefined; onPick: (id: string) => void }) {
  const [q, setQ] = useState("");
  const list = registry
    .list("background")
    .filter((b) => b.id !== "background:custom")
    .filter((b) => b.name.toLowerCase().includes(q.trim().toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name));
  return (
    <>
      <p className="note">Its skills, tools and languages replace the old background's. Gear from the old one stays in your inventory.</p>
      <input className="search" type="search" placeholder="Search backgrounds" value={q} onChange={(e) => setQ(e.target.value)} />
      <button className={`row custom-bg${current === "background:custom" ? " current" : ""}`} onClick={() => onPick("background:custom")}>
        <div className="row-main">
          <div className="row-title">You don't know me! (custom){current === "background:custom" ? " ✓" : ""}</div>
          <div className="row-sub">Make your own: skills, tools or languages, a feature, gear and gold, and your personality, step by step.</div>
        </div>
      </button>
      <div className="group">
        {list.map((b) => (
          <button key={b.id} className={`row${b.id === current ? " current" : ""}`} onClick={() => onPick(b.id)}>
            <div className="row-main">
              <div className="row-title">
                {b.name}
                {b.id === current ? " ✓" : ""}
              </div>
              {b.summary && <div className="row-sub">{b.summary}</div>}
            </div>
          </button>
        ))}
      </div>
    </>
  );
}
