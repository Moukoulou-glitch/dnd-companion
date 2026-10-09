import { useState } from "react";
import { roll } from "@dnd/dice";

const rollDie = (sides: number) => roll(`1d${sides}`).total;

/** Durable's reaction: pick a Hit Die, roll it (or type your roll), and the damage drops by the die + Constitution, at least 3. */
export function DurablePanel({ amount, con, dice, physical, onSkip, onSpend }: { amount: number; con: number; dice: { die: string; left: number }[]; physical: boolean; onSkip: () => void; onSpend: (die: string, roll: number, reduce: number) => void }) {
  const [die, setDie] = useState(dice[0]?.die ?? "d8");
  const [entry, setEntry] = useState("");
  const sides = Number(die.slice(1));
  const spend = (roll: number) => onSpend(die, roll, Math.max(3, roll + con));
  return (
    <>
      <p className="note">
        {amount} damage coming. Use your reaction to spend a Hit Die: the damage drops by the die + your Constitution modifier ({con >= 0 ? `+${con}` : con}), at least 3, before resistances.
      </p>
      <div className="segmented small" role="radiogroup" aria-label="Hit Die">
        {dice.map((d) => (
          <button key={d.die} role="radio" aria-checked={die === d.die} onClick={() => setDie(d.die)}>
            {d.die} ({d.left} left)
          </button>
        ))}
      </div>
      {physical ? (
        <div className="row">
          <div className="row-main row-title">Your {die} shows</div>
          <input className="search" inputMode="numeric" value={entry} onChange={(e) => setEntry(e.target.value.replace(/[^0-9]/g, ""))} aria-label="Hit Die roll" style={{ maxWidth: 90 }} />
        </div>
      ) : null}
      <div className="big-actions">
        <button className="big" onClick={onSkip}>
          Take it all
        </button>
        {physical ? (
          <button className="big primary" disabled={!entry || Number(entry) < 1 || Number(entry) > sides} onClick={() => spend(Number(entry))}>
            Reduce by {entry ? Math.max(3, Number(entry) + con) : "…"}
          </button>
        ) : (
          <button className="big primary" onClick={() => spend(rollDie(sides))}>
            Roll {die} and reduce
          </button>
        )}
      </div>
    </>
  );
}
