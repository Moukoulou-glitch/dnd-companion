import { useState, type ReactNode } from "react";

/**
 * A long list in sections (Features and traits by class, race, background…; Items by type): a search box, a row of
 * chips to jump to a section, and each section folding open or shut. Which ones are shut is remembered on this device.
 */
export interface SectionSpec {
  key: string;
  label: string;
  count: number;
  body: ReactNode;
  /** A small mark after the label (an attuned item in it). */
  hint?: string;
}

const readShut = (storageKey: string): string[] => {
  try {
    const v = JSON.parse(localStorage.getItem(storageKey) ?? "[]");
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
};

export function Sections({ sections, storageKey, label, searching }: { sections: SectionSpec[]; storageKey: string; label: string; searching?: boolean }) {
  const [shut, setShut] = useState<string[]>(() => readShut(storageKey));
  const save = (next: string[]) => {
    setShut(next);
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {
      /* not kept on this device: fine */
    }
  };
  const isOpen = (k: string) => searching || !shut.includes(k);
  const jump = (k: string) => {
    if (shut.includes(k)) save(shut.filter((x) => x !== k));
    // After it opens, bring it into view.
    // Below the character's strip at the top, which stays on screen.
    setTimeout(() => {
      const el = document.getElementById(`sec-${storageKey}-${k}`);
      if (!el) return;
      const strip = document.querySelector(".strip")?.getBoundingClientRect().height ?? 0;
      window.scrollTo({ top: window.scrollY + el.getBoundingClientRect().top - strip - 8, behavior: "smooth" });
    }, 30);
  };
  const shown = sections.filter((s) => s.count > 0);
  return (
    <div className="sections">
      {shown.length > 1 && (
        <nav className="jump-chips" aria-label={`${label}: jump to`}>
          {shown.map((s) => (
            <button key={s.key} className="jump-chip" onClick={() => jump(s.key)}>
              {s.label}
              <span className="jump-count">{s.count}</span>
            </button>
          ))}
          {!searching && (
            <button className="jump-chip quiet" onClick={() => save(shut.length ? [] : shown.map((s) => s.key))}>
              {shut.length ? "Open all" : "Fold all"}
            </button>
          )}
        </nav>
      )}
      {shown.map((s) => (
        <section key={s.key} id={`sec-${storageKey}-${s.key}`} className={`fold${isOpen(s.key) ? " open" : ""}`}>
          <button className="fold-head" aria-expanded={isOpen(s.key)} onClick={() => (searching ? undefined : save(isOpen(s.key) ? [...shut, s.key] : shut.filter((x) => x !== s.key)))}>
            <span className="fold-caret" aria-hidden="true">
              ▸
            </span>
            <span className="fold-label">{s.label}</span>
            {s.hint && <span className="fold-hint">{s.hint}</span>}
            <span className="fold-count">{s.count}</span>
          </button>
          {isOpen(s.key) && s.body}
        </section>
      ))}
    </div>
  );
}
