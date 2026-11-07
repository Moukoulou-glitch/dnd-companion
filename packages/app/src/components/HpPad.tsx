import { useState, type ReactNode } from "react";

const TYPES = ["slashing", "piercing", "bludgeoning", "fire", "cold", "lightning", "thunder", "acid", "poison", "necrotic", "radiant", "force", "psychic"];

/**
 * Number pad for HP changes. Type the amount once, then choose what it is:
 * damage (optionally typed, so resistances apply), healing, or temporary HP.
 */
export function HpPad({
  onDamage,
  onHeal,
  onTemp,
  temp = 0,
  sourceToggles = false,
  spellToggle = false,
  boundTo,
  rangedToggle = false,
  magicalAll = false,
  below,
}: {
  onDamage: (amount: number, type?: string, src?: { magical?: boolean; silvered?: boolean; adamantine?: boolean; spell?: boolean; bound?: boolean; ranged?: boolean }) => void;
  /** Ask whether any damage was magical (resistance to nonmagical damage of every type: Armor of Invulnerability). */
  magicalAll?: boolean;
  /** Ask whether the damage came from a ranged weapon attack (resistance to it: Tattoo of Guardian Winds). */
  rangedToggle?: boolean;
  /** Your shield guardian's name, when it's bound to you (you wear its amulet): ask whether it's within 60 ft. */
  boundTo?: string;
  /** Ask whether the damage came from a spell (resistance to damage from spells: Aura of Warding). */
  spellToggle?: boolean;
  /** Ask whether bludgeoning, piercing or slashing came from a magical (silvered, adamantine) attack. */
  sourceToggles?: boolean;
  /** More below the pad (maximum hit points). */
  below?: ReactNode;
  onHeal: (amount: number) => void;
  onTemp: (amount: number) => void;
  /** Current temporary HP, to offer removing them. */
  temp?: number;
}) {
  const [value, setValue] = useState("");
  const [type, setType] = useState<string | undefined>();
  const [src, setSrc] = useState<{ magical?: boolean; silvered?: boolean; adamantine?: boolean }>({});
  const [spell, setSpell] = useState(false);
  const [ranged, setRanged] = useState(false);
  // It follows you: within 60 ft unless you say otherwise.
  const [bound, setBound] = useState(true);
  const physical = type === "slashing" || type === "piercing" || type === "bludgeoning";
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
      {magicalAll && !physical && (
        <div className="types" role="group" aria-label="Magical damage">
          <button className="switch" aria-pressed={!!src.magical} onClick={() => setSrc({ ...src, magical: !src.magical })}>
            magical
          </button>
        </div>
      )}
      {(sourceToggles || magicalAll) && physical && (
        <div className="types" role="group" aria-label="Where the damage came from">
          {(["magical", "silvered", "adamantine"] as const).map((k) => (
            <button key={k} className="switch" aria-pressed={!!src[k]} onClick={() => setSrc({ ...src, [k]: !src[k] })}>
              {k}
            </button>
          ))}
        </div>
      )}
      {spellToggle && (
        <div className="types" role="group" aria-label="From a spell">
          <button className="switch" aria-pressed={spell} onClick={() => setSpell(!spell)}>
            from a spell
          </button>
        </div>
      )}
      {rangedToggle && (
        <div className="types" role="group" aria-label="From a ranged weapon attack">
          <button className="switch" aria-pressed={ranged} onClick={() => setRanged(!ranged)}>
            from a ranged weapon attack
          </button>
        </div>
      )}
      {boundTo && (
        <div className="types" role="group" aria-label="Bound">
          <button className="switch" aria-pressed={bound} onClick={() => setBound(!bound)}>
            {boundTo} within 60 ft: half goes to it
          </button>
        </div>
      )}
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
        <button className="big damage" disabled={!amount} onClick={() => onDamage(amount, type, { ...(physical || (magicalAll && src.magical) ? src : {}), ...(spell ? { spell: true } : {}), ...(boundTo ? { bound } : {}), ...(rangedToggle && ranged ? { ranged: true } : {}) })}>
          Damage
        </button>
        <button className="big heal" disabled={!amount} onClick={() => onHeal(amount)}>
          Heal
        </button>
        <button className="big" disabled={!amount} onClick={() => onTemp(amount)}>
          Temp HP
        </button>
      </div>
      {temp > 0 && (
        <button className="link" onClick={() => onTemp(0)}>
          Remove the {temp} temporary HP
        </button>
      )}
      {below}
    </div>
  );
}
