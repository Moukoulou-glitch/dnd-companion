import { useState } from "react";
import { NumberStep } from "./Adjust";

export interface Share {
  name: string;
  amount: number;
  me?: boolean;
}

/**
 * Sharing out a pool of healing among creatures (Preserve Life: 5 × cleric
 * level): first how many creatures, then a box for each with how much it gets.
 */
export function DistributePanel({
  pool,
  what,
  note,
  myMax,
  onDone,
  max = 30,
}: {
  pool: number;
  /** "hit points" */
  what: string;
  note?: string;
  /** The most you can give yourself (half your maximum minus what you have now). */
  myMax?: number;
  onDone: (shares: Share[]) => void;
  max?: number;
}) {
  const [count, setCount] = useState<number | null>(null);
  const [pick, setPick] = useState(2);
  const [shares, setShares] = useState<Share[]>([]);
  if (count === null)
    return (
      <>
        <p className="question">Among how many creatures?</p>
        <p className="note">
          {pool} {what} to share out{note ? `. ${note}` : ""}.
        </p>
        <div className="group">
          <NumberStep label="Creatures" sub={`1 to ${max}`} value={pick} min={1} max={max} onChange={setPick} />
        </div>
        <button
          className="big primary wide"
          onClick={() => {
            const each = Math.floor(pool / pick);
            setShares(Array.from({ length: pick }, (_, i) => ({ name: "", amount: each + (i < pool - each * pick ? 1 : 0) })));
            setCount(pick);
          }}
        >
          Next
        </button>
      </>
    );
  const used = shares.reduce((t, s) => t + s.amount, 0);
  const left = pool - used;
  const set = (i: number, p: Partial<Share>) => setShares(shares.map((s, j) => (j === i ? { ...s, ...p } : s)));
  const meOver = shares.some((s) => s.me && myMax !== undefined && s.amount > myMax);
  return (
    <>
      <p className={`dist-left${left < 0 ? " bad" : ""}`} role="status">
        <b>{left}</b> of {pool} {what} left{left < 0 ? ": that's more than you have" : ""}
      </p>
      {note && <p className="note">{note}.</p>}
      <div className="dist-list">
        {shares.map((s, i) => (
          <div className={`dist-box${s.me ? " me" : ""}`} key={i}>
            <div className="dist-head">
              <span className="dist-n">{i + 1}</span>
              <input
                className="search"
                placeholder={s.me ? "Me" : `Creature ${i + 1}`}
                value={s.me ? "Me" : s.name}
                disabled={s.me}
                maxLength={40}
                onChange={(e) => set(i, { name: e.target.value })}
                aria-label={`Name of creature ${i + 1}`}
              />
              {myMax !== undefined && (i === 0 || s.me) && (
                <label className="dist-me">
                  <input type="checkbox" checked={!!s.me} onChange={(e) => set(i, { me: e.target.checked })} /> me
                </label>
              )}
            </div>
            <NumberStep label="Hit points" {...(s.me && myMax !== undefined ? { sub: `you can take up to ${myMax}` } : {})} value={s.amount} min={0} max={pool} onChange={(n) => set(i, { amount: n })} />
          </div>
        ))}
      </div>
      {meOver && <p className="over-banner">You'd go above half your hit point maximum; only {myMax} will be healed.</p>}
      <div className="big-actions">
        <button className="big" onClick={() => setCount(null)}>
          Back
        </button>
        <button className="big primary" disabled={used <= 0} onClick={() => onDone(shares.map((s, i) => ({ ...s, name: s.me ? "Me" : s.name.trim() || `Creature ${i + 1}` })).filter((s) => s.amount > 0))}>
          {left < 0 ? "Heal anyway" : "Heal"}
        </button>
      </div>
    </>
  );
}
