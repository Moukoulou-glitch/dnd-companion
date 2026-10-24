import { useState } from "react";

export interface HealTarget {
  id: string;
  name: string;
  /** "12 / 30 HP", "Drake companion". */
  sub?: string;
  /** Why it may not work (wrong creature type, deafened…): shown, never blocking. */
  warnings: string[];
  /** Under Beacon of Hope: its healing is the maximum. */
  beacon?: boolean;
  /** Someone the app doesn't track, while you concentrate on Beacon of Hope: ask whether it's under it. */
  askBeacon?: boolean;
}

/**
 * Who the healing goes to: you, a companion, a summoned creature, or several
 * when the spell allows (`max`). Warnings are shown and never stop the pick.
 * Beacon of Hope: a target under it gets the maximum (`beacon.maxAmount`);
 * when the roll was already the maximum, a target that isn't under it is warned about.
 */
export function HealTargets({
  targets,
  max,
  amount,
  beacon,
  selfBack,
  onHeal,
}: {
  targets: HealTarget[];
  max: number;
  amount: number;
  beacon?: { rolledMax: boolean; maxAmount: number };
  /** What you regain when someone else is healed (Blessed Healer). */
  selfBack?: { label: string; value: number } | undefined;
  onHeal: (ids: string[], perTarget: Record<string, number>) => void;
}) {
  const [picked, setPicked] = useState<string[]>([targets[0]?.id ?? "me"]);
  // Someone else under Beacon of Hope (asked only while you concentrate on it).
  const [otherBeacon, setOtherBeacon] = useState(false);
  const toggle = (id: string) =>
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : max <= 1 ? [id] : p.length >= max ? p : [...p, id]));
  const isBeacon = (t: HealTarget) => !!t.beacon || (t.askBeacon && otherBeacon);
  const amountFor = (t: HealTarget) => (beacon && isBeacon(t) ? beacon.maxAmount : amount);
  const chosen = targets.filter((t) => picked.includes(t.id));
  const names = chosen.map((t) => `${t.id === "me" ? "me" : t.name}${chosen.length > 1 || amountFor(t) !== amount ? ` ${amountFor(t)}` : ""}`);
  const others = picked.some((id) => id !== "me");
  const notUnder = beacon?.rolledMax ? chosen.filter((t) => !isBeacon(t)) : [];
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
                {t.beacon && beacon && <div className="row-sub beacon-text">Beacon of Hope: the maximum, {beacon.maxAmount}</div>}
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
      {beacon && targets.some((t) => t.askBeacon && picked.includes(t.id)) && (
        <label className="row check" style={{ padding: "8px 0" }}>
          <input type="checkbox" checked={otherBeacon} onChange={() => setOtherBeacon(!otherBeacon)} />
          <div className="row-main">
            <div className="row-title">They're under your Beacon of Hope</div>
            <div className="row-sub">Then they regain the maximum: {beacon.maxAmount}.</div>
          </div>
        </label>
      )}
      {notUnder.length > 0 && (
        <p className="over-banner">
          Rolled at the maximum for Beacon of Hope, but {notUnder.map((t) => (t.id === "me" ? "you aren't" : `${t.name} isn't`)).join(" and ")} under it. Kept only if your DM allows.
        </p>
      )}
      {others && selfBack && selfBack.value > 0 && <p className="note">{selfBack.label}: you regain {selfBack.value} too.</p>}
      <button className="big heal wide" disabled={!picked.length} onClick={() => onHeal(picked, Object.fromEntries(chosen.map((t) => [t.id, amountFor(t)])))}>
        Heal {names.join(", ") || "…"}
        {chosen.length === 1 && amountFor(chosen[0]!) === amount ? ` ${amount}` : ""}
      </button>
    </div>
  );
}
