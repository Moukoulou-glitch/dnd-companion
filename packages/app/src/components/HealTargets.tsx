import { useState } from "react";

export interface HealTarget {
  id: string;
  name: string;
  /** "12 / 30 HP", "Drake companion". */
  sub?: string;
  /** Why it may not work (wrong creature type, deafened…): shown, never blocking. */
  warnings: string[];
}

/**
 * Who the healing goes to: you, a companion, a summoned creature, or several
 * when the spell allows (`max`). Warnings are shown and never stop the pick.
 */
export function HealTargets({
  targets,
  max,
  amount,
  selfBack,
  onHeal,
}: {
  targets: HealTarget[];
  max: number;
  amount: number;
  /** What you regain when someone else is healed (Blessed Healer). */
  selfBack?: { label: string; value: number } | undefined;
  onHeal: (ids: string[]) => void;
}) {
  const [picked, setPicked] = useState<string[]>([targets[0]?.id ?? "me"]);
  const toggle = (id: string) =>
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : max <= 1 ? [id] : p.length >= max ? p : [...p, id]));
  const names = targets.filter((t) => picked.includes(t.id)).map((t) => (t.id === "me" ? "me" : t.name));
  const others = picked.some((id) => id !== "me");
  return (
    <div className="heal-targets">
      <p className="sub-head">{max > 1 ? `Heal whom? Up to ${max}` : "Heal whom?"}</p>
      <div className="group">
        {targets.map((t) => {
          const on = picked.includes(t.id);
          return (
            <label className="row check" key={t.id}>
              <input type={max > 1 ? "checkbox" : "radio"} name="heal-target" checked={on} onChange={() => toggle(t.id)} />
              <div className="row-main">
                <div className="row-title">{t.id === "me" ? `Me (${t.name})` : t.name}</div>
                {t.sub && <div className="row-sub">{t.sub}</div>}
                {t.warnings.map((w) => (
                  <div className="row-sub danger-text" key={w}>
                    {w}
                  </div>
                ))}
              </div>
            </label>
          );
        })}
      </div>
      {others && selfBack && selfBack.value > 0 && <p className="note">{selfBack.label}: you regain {selfBack.value} too.</p>}
      <button className="big heal wide" disabled={!picked.length} onClick={() => onHeal(picked)}>
        Heal {names.join(", ") || "…"} {amount}
      </button>
    </div>
  );
}
