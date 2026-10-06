import { useState } from "react";

const TYPES = ["slashing", "piercing", "bludgeoning", "fire", "cold", "lightning", "thunder", "acid", "poison", "necrotic", "radiant", "force", "psychic"];

/**
 * Number pad for HP changes. Type the amount once, then choose what it is:
 * damage (optionally typed, so resistances apply), healing, or temporary HP.
 */
export function HpPad({
  onDamage,
  onHeal,
  onTemp,
}: {
  onDamage: (amount: number, type?: string) => void;
  onHeal: (amount: number) => void;
  onTemp: (amount: number) => void;
}) {
  const [value, setValue] = useState("");
  const [type, setType] = useState<string | undefined>();
  const amount = Number(value || 0);
  const press = (d: string) => setValue((v) => (v.length >= 3 ? v : (v + d).replace(/^0+/, "")));

  return (
    <div>
      <div className={`pad-display${value ? "" : " empty"}`} aria-live="polite">
        {value || "0"}
      </div>
      <div className="types" role="group" aria-label="Damage type">
        {TYPES.map((t) => (
          <button key={t} className="switch" aria-pressed={type === t} onClick={() => setType(type === t ? undefined : t)}>
            {t}
          </button>
        ))}
      </div>
      <div className="keys">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
          <button key={d} className="key" onClick={() => press(d)}>
            {d}
          </button>
        ))}
        <button className="key" onClick={() => setValue("")} aria-label="Clear">
          C
        </button>
        <button className="key" onClick={() => press("0")}>
          0
        </button>
        <button className="key" onClick={() => setValue((v) => v.slice(0, -1))} aria-label="Delete last digit">
          ⌫
        </button>
      </div>
      <div className="pad-actions">
        <button className="big damage" disabled={!amount} onClick={() => onDamage(amount, type)}>
          Damage
        </button>
        <button className="big heal" disabled={!amount} onClick={() => onHeal(amount)}>
          Heal
        </button>
        <button className="big" disabled={!amount} onClick={() => onTemp(amount)}>
          Temp HP
        </button>
      </div>
    </div>
  );
}
