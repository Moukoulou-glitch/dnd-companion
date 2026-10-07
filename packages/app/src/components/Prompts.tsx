import { useState } from "react";
import type { DerivedSheet, ResourceResult, SpellResult } from "@dnd/engine";

function rollDie(sides: number): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return (buf[0]! % sides) + 1;
}

/** Two big choices: the safe one first. */
export function Confirm({
  question,
  detail,
  no,
  yes,
  onNo,
  onYes,
}: {
  question: string;
  detail?: string;
  no: string;
  yes: string;
  onNo: () => void;
  onYes: () => void;
}) {
  return (
    <>
      <p className="question">{question}</p>
      {detail && <p className="note">{detail}</p>}
      <div className="confirm">
        <button className="big" onClick={onNo}>
          {no}
        </button>
        <button className="big primary" onClick={onYes}>
          {yes}
        </button>
      </div>
    </>
  );
}

/** Tap the die you rolled, or let the app roll it. */
export function DieEntry({ sides, onDone, label }: { sides: number; onDone: (n: number) => void; label?: string }) {
  return (
    <>
      <p className="note">{label ?? `Tap what your d${sides} shows, or let the app roll.`}</p>
      <div className="keys" style={{ gridTemplateColumns: `repeat(${sides > 12 ? 5 : 4}, 1fr)` }}>
        {Array.from({ length: sides }, (_, i) => (
          <button key={i} className="key" onClick={() => onDone(i + 1)}>
            {i + 1}
          </button>
        ))}
      </div>
      <button className="big wide" style={{ marginTop: 10 }} onClick={() => onDone(rollDie(sides))}>
        Roll for me
      </button>
    </>
  );
}

/** Spending a die from a pool (Psionic Energy): roll it, or just spend it. */
export function SpendDiePanel({ r, onRolled, onJustSpend }: { r: ResourceResult; onRolled: (n: number) => void; onJustSpend: () => void }) {
  const sides = Number(/d(\d+)/.exec(r.die ?? "")?.[1] ?? 6);
  return (
    <>
      <p className="sub-head">Roll your {r.name.replace(/ dice$/i, "")} die ({r.die})</p>
      <DieEntry sides={sides} onDone={onRolled} />
      <button className="link" onClick={onJustSpend}>
        Just spend it, no roll
      </button>
    </>
  );
}

/** Foretelling rolls (Portent): roll them after a long rest, then keep them until used. */
export function PoolRollPanel({ r, onDone }: { r: ResourceResult; onDone: (values: number[]) => void }) {
  const sides = r.pool?.sides ?? 20;
  const count = r.remaining;
  const [values, setValues] = useState<number[]>([]);
  const add = (n: number) => {
    const next = [...values, n];
    if (next.length >= count) onDone(next);
    else setValues(next);
  };
  return (
    <>
      <p className="note">
        Roll {count} d{sides} and keep them: before any attack, save or check by you or a creature you can see, replace its d20 with one of these. Once per turn.
      </p>
      {values.length > 0 && <p className="sub-head">So far: {values.join(", ")}</p>}
      <DieEntry sides={sides} onDone={add} label={`Die ${values.length + 1} of ${count}: tap what it shows, or let the app roll.`} />
      <button
        className="link"
        onClick={() => onDone([...values, ...Array.from({ length: count - values.length }, () => rollDie(sides))])}
      >
        Roll all of them for me
      </button>
    </>
  );
}

/** Spending a spell slot from the Play tab: which spell are you casting? */
export function SlotSpendPanel({
  sheet,
  level,
  pact,
  onCast,
  onJustSpend,
}: {
  sheet: DerivedSheet;
  level: number;
  pact: boolean;
  onCast: (sp: SpellResult) => void;
  onJustSpend: () => void;
}) {
  const castable = sheet.spells.filter(
    (sp) => sp.level > 0 && sp.level <= level && sp.ready !== "not prepared" && (pact ? !!sp.cast.pact : sp.cast.slotLevels.includes(level)),
  );
  return (
    <>
      <p className="question">Are you casting a spell?</p>
      <p className="note">Pick it and it's cast with this level {level} {pact ? "Pact Magic " : ""}slot.</p>
      <div className="group">
        {castable.map((sp) => (
          <button className="row" key={`${sp.list.id}-${sp.id}`} onClick={() => onCast(sp)}>
            <div className="row-main">
              <div className="row-title">{sp.name}</div>
              <div className="row-sub">
                {sp.level < level ? `level ${sp.level}, upcast to ${level}` : `level ${sp.level}`}, {sp.castingTime}
                {sp.concentration ? ", concentration" : ""}
              </div>
            </div>
          </button>
        ))}
        {castable.length === 0 && (
          <div className="row">
            <div className="row-main row-sub">No prepared spells for this slot.</div>
          </div>
        )}
      </div>
      <button className="link" onClick={onJustSpend}>
        Just spend the slot
      </button>
    </>
  );
}
