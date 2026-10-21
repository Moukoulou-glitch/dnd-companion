import { useEffect, useRef, useState } from "react";
import { facesOrRoll } from "../dice/quick";
import { skipThrow } from "../diceBox";

/** What Durable takes off: the Hit Die + Constitution modifier, at least 3. */
export function durableReduce(roll: number, con: number): { reduce: number; text: string } {
  const raw = roll + con;
  const reduce = Math.max(3, raw);
  const conText = con >= 0 ? `+ ${con}` : `− ${-con}`;
  return { reduce, text: `${roll} ${conText} Constitution = ${raw}${reduce > raw ? `, minimum 3` : ""}` };
}

/**
 * Durable's reaction: pick a Hit Die, roll it (3D dice when they're on) or type
 * your roll, then see what the die showed, the reduction and the damage left
 * before anything is spent or taken.
 */
export function DurablePanel({ amount, con, dice, physical, onSkip, onSpend }: { amount: number; con: number; dice: { die: string; left: number }[]; physical: boolean; onSkip: () => void; onSpend: (die: string, roll: number, reduce: number) => void }) {
  const [die, setDie] = useState(dice[0]?.die ?? "d8");
  const [entry, setEntry] = useState("");
  const [rolled, setRolled] = useState<number | null>(null);
  const [throwing, setThrowing] = useState(false);
  const sides = Number(die.slice(1));
  const alive = useRef(true);
  const inAir = useRef(false);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      if (inAir.current) skipThrow();
    };
  }, []);
  const appRolls = async () => {
    setThrowing(true);
    inAir.current = true;
    try {
      const [v] = await facesOrRoll(1, sides, true, { source: "Durable", keys: ["hitdie"] });
      if (alive.current && v) setRolled(v);
    } finally {
      inAir.current = false;
      if (alive.current) setThrowing(false);
    }
  };

  if (rolled !== null) {
    const { reduce, text } = durableReduce(rolled, con);
    const left = Math.max(0, amount - reduce);
    return (
      <>
        <div className="durable-result" role="status">
          <div className="row-title">
            Your {die} shows <strong className="durable-face">{rolled}</strong>
          </div>
          <p className="row-sub">{text}: the damage drops by {reduce}.</p>
          <p className="durable-left">
            {amount} − {reduce} = <strong>{left}</strong> damage {left > 0 ? "left, before resistances" : "— none gets through"}
          </p>
        </div>
        <div className="big-actions">
          <button className="big primary wide" onClick={() => onSpend(die, rolled, reduce)}>
            {left > 0 ? `Take ${left} damage` : "Done"}
          </button>
        </div>
      </>
    );
  }

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
        <button className="big" onClick={onSkip} disabled={throwing}>
          Take it all
        </button>
        {physical && (
          <button className="big" onClick={() => void appRolls()} disabled={throwing}>
            App rolls
          </button>
        )}
        {physical ? (
          <button className="big primary" disabled={!entry || Number(entry) < 1 || Number(entry) > sides} onClick={() => setRolled(Number(entry))}>
            Reduce by {entry ? Math.max(3, Number(entry) + con) : "…"}
          </button>
        ) : (
          <button className="big primary" onClick={() => void appRolls()} disabled={throwing}>
            {throwing ? "Rolling…" : `Roll ${die} and reduce`}
          </button>
        )}
      </div>
    </>
  );
}
