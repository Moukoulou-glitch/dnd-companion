import { useState } from "react";

/**
 * Damage reduced by a reaction (Deflect Missiles: 1d10 + Dexterity + monk
 * level; Slow Fall: 5 × monk level). Type the damage taken, roll (or tap) the
 * reduction, and see what reaches your hit points. Deflect Missiles at 0: catch
 * it, and throw it back for 1 ki.
 */
export function DamageReducePanel({
  what,
  die,
  flat,
  flatLabel,
  physical,
  onApply,
  onCatch,
}: {
  what: string;
  /** The reduction's die (10 for Deflect Missiles), or none for a fixed amount. */
  die?: number;
  flat: number;
  flatLabel: string;
  physical: boolean;
  /** Damage left after the reduction (0 when all of it is stopped). */
  onApply: (remaining: number, reduction: number) => void;
  /** Reduced to 0 (Deflect Missiles): caught. `throwBack` spends 1 ki and attacks. */
  onCatch?: (throwBack: boolean) => void;
}) {
  const [damage, setDamage] = useState("");
  const [rolled, setRolled] = useState<number | null>(die ? null : 0);
  const taken = Number(damage || 0);
  const reduction = rolled === null ? null : rolled + flat;
  const left = reduction === null ? null : Math.max(0, taken - reduction);
  const press = (d: string) => setDamage((v) => (v.length >= 3 ? v : (v + d).replace(/^0+/, "")));
  return (
    <>
      <p className="sub-head">Damage taken</p>
      <div className={`pad-display${damage ? "" : " empty"}`} aria-live="polite">
        {damage || "0"}
      </div>
      <div className="keys">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
          <button key={d} className="key" onClick={() => press(d)}>
            {d}
          </button>
        ))}
        <button className="key" onClick={() => setDamage("")} aria-label="Clear">
          C
        </button>
        <button className="key" onClick={() => press("0")}>
          0
        </button>
        <button className="key" onClick={() => setDamage((v) => v.slice(0, -1))} aria-label="Delete last digit">
          ⌫
        </button>
      </div>
      {die && (
        <>
          <p className="sub-head">
            {what}: d{die} + {flat} ({flatLabel}){physical ? " · tap what your die shows" : ""}
          </p>
          <div className="keys d20">
            {Array.from({ length: die }, (_, i) => (
              <button key={i} className={`key${rolled === i + 1 ? " on" : ""}`} aria-pressed={rolled === i + 1} onClick={() => setRolled(i + 1)}>
                {i + 1}
              </button>
            ))}
          </div>
          <button className="big wide" style={{ marginTop: 8 }} onClick={() => setRolled(1 + Math.floor(Math.random() * die))}>
            Roll the d{die} for me
          </button>
        </>
      )}
      {reduction !== null && (
        <p className="formula">
          {taken} − {reduction}
          {die ? ` (${rolled} + ${flat})` : ` (${flatLabel})`} = {left}
        </p>
      )}
      {reduction !== null && taken > 0 && left! > 0 && (
        <button className="big primary wide" onClick={() => onApply(left!, reduction)}>
          Take {left} damage
        </button>
      )}
      {reduction !== null && taken > 0 && left === 0 && (
        <>
          <p className="note">All of it stopped.{onCatch ? " You catch the missile if it's small enough to hold in one hand and you have a hand free." : ""}</p>
          {onCatch ? (
            <div className="big-actions">
              <button className="big primary" onClick={() => onCatch(true)}>
                Throw it back
                <span className="sub">1 ki · ranged attack, 20/60 ft</span>
              </button>
              <button className="big" onClick={() => onCatch(false)}>
                Keep it
                <span className="sub">no ki</span>
              </button>
            </div>
          ) : (
            <button className="big primary wide" onClick={() => onApply(0, reduction)}>
              No damage
            </button>
          )}
        </>
      )}
    </>
  );
}
