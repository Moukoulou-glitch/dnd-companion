import { Fragment, useState } from "react";
import type { DerivedSheet, ResourceResult, SpellResult } from "@dnd/engine";

import { facesOrRoll } from "../dice/quick";
import { gainsFromUpcast, slotGroups } from "../slotSpells";

function rollDie(sides: number): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return (buf[0]! % sides) + 1;
}

/** Two big choices: the safe one first. */
/** A question with several answers, each a button, the last one the main one. */
export function Choose({ question, detail, options }: { question: string; detail?: string; options: { label: string; onPick: () => void }[] }) {
  return (
    <>
      <p className="question">{question}</p>
      {detail && <p className="note">{detail}</p>}
      <div className="choose-list">
        {options.map((o, i) => (
          <button key={o.label} className={`big wide${i === options.length - 1 ? " primary" : ""}`} onClick={o.onPick}>
            {o.label}
          </button>
        ))}
      </div>
    </>
  );
}

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
/**
 * Tap the face your die shows, or let the app roll it (3D dice when they're on, in `theme`'s look:
 * the resource it spends, the feature it's for).
 */
export function DieEntry({ sides, onDone, label, theme }: { sides: number; onDone: (n: number) => void; label?: string; theme?: { source?: string; keys?: string[]; quick?: boolean } }) {
  const [rolling, setRolling] = useState(false);
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
      <button
        className="big wide"
        style={{ marginTop: 10 }}
        disabled={rolling}
        onClick={() => {
          setRolling(true);
          void facesOrRoll(1, sides, true, theme).then(([v]) => {
            setRolling(false);
            onDone(v ?? rollDie(sides));
          });
        }}
      >
        {rolling ? "Rolling…" : "Roll for me"}
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
      <DieEntry sides={sides} onDone={onRolled} theme={{ source: r.name, keys: [`resource:${r.id}`] }} />
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
      <DieEntry sides={sides} onDone={add} label={`Die ${values.length + 1} of ${count}: tap what it shows, or let the app roll.`} theme={{ source: r.name, keys: [`resource:${r.id}`] }} />
      <button
        className="link"
        onClick={() => void facesOrRoll(count - values.length, sides, true, { source: r.name, keys: [`resource:${r.id}`] }).then((rest) => onDone([...values, ...rest]))}
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
  const [q, setQ] = useState("");
  const castable = sheet.spells.filter(
    (sp) => sp.level > 0 && sp.level <= level && sp.ready !== "not prepared" && (pact ? !!sp.cast.pact : sp.cast.slotLevels.includes(level)),
  );
  const groups = slotGroups(castable, level, q);
  const ord = (n: number) => `${n}${n === 1 ? "st" : n === 2 ? "nd" : n === 3 ? "rd" : "th"}`;
  return (
    <>
      <p className="question">Are you casting a spell?</p>
      <p className="note">Pick it and it's cast with this level {level} {pact ? "Pact Magic " : ""}slot. Lower-level spells that do more at a higher slot are marked ▲.</p>
      {castable.length > 4 && (
        <input className="search" type="search" placeholder="Search by name, level or school" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search spells for this slot" />
      )}
      {groups.map((g) => (
        <Fragment key={g.level}>
          <div className="level-head">
            {ord(g.level)} level {g.level === level ? <span className="level-picked">· this slot's level</span> : <span className="level-picked">· upcast to {ord(level)}</span>}
          </div>
          <div className="group">
            {g.spells.map((sp) => {
              const up = gainsFromUpcast(sp, level);
              return (
                <button className={up ? "row slot-upcast" : "row"} key={`${sp.list.id}-${sp.id}`} onClick={() => onCast(sp)}>
                  <div className="row-main">
                    <div className="row-title">
                      {sp.name}
                      {up && <span className="tag upcast-tag">▲ stronger at {ord(level)}</span>}
                    </div>
                    <div className="row-sub">
                      {sp.castingTime}
                      {sp.concentration ? ", concentration" : ""}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </Fragment>
      ))}
      {castable.length === 0 && (
        <div className="group">
          <div className="row">
            <div className="row-main row-sub">No prepared spells for this slot.</div>
          </div>
        </div>
      )}
      {castable.length > 0 && groups.length === 0 && <p className="note">No spell matches "{q}".</p>}
      <button className="link" onClick={onJustSpend}>
        Just spend the slot
      </button>
    </>
  );
}
