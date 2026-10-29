import { useState } from "react";
import { rollOrThrow } from "../dice/quick";

/**
 * A death saving throw: tap the d20 (or let the app roll). With Adama (a half-elf's heritage), rolling with
 * advantage or disadvantage, both d20s are added: two taps, and a total of exactly 20 counts as a natural 20.
 */
export function DeathSavePanel({
  beacon,
  adama,
  onDecide,
}: {
  beacon: boolean;
  /** Adama's uses left, when the character has it. */
  adama?: number;
  /** The d20 that decides it; `sum` when Adama added two (the faces for the log). */
  onDecide: (n: number, sum?: [number, number]) => void;
}) {
  const [useAdama, setUseAdama] = useState(false);
  const [first, setFirst] = useState<number | null>(null);
  const tap = (n: number) => {
    if (!useAdama) return onDecide(n);
    if (first === null) return setFirst(n);
    onDecide(first + n, [first, n]);
  };
  return (
    <>
      <p className="note">Tap what your d20 shows, or let the app roll. 10 or higher succeeds; 1 counts as two failures; 20 brings you back with 1 HP.</p>
      {beacon && !useAdama && <p className="note">Beacon of Hope: advantage. Roll two d20s and tap the higher one; the app rolls two for you.</p>}
      {adama !== undefined && (
        <label className="row check" style={{ padding: "8px 0" }}>
          <input
            type="checkbox"
            checked={useAdama}
            onChange={() => {
              setUseAdama(!useAdama);
              setFirst(null);
            }}
          />
          <div className="row-main">
            <div className="row-title">Adama: add both d20s</div>
            <div className="row-sub">
              Only with advantage or disadvantage. A total of exactly 20 is a natural 20. {adama} of your uses left{adama <= 0 ? ": none, used anyway if you go on" : ""}.
            </div>
          </div>
        </label>
      )}
      {useAdama && <p className="sub-head">{first === null ? "Tap the first d20" : `First d20: ${first}. Tap the second`}</p>}
      <div className="keys d20" style={{ marginTop: 10 }}>
        {Array.from({ length: 20 }, (_, i) => (
          <button key={i} className="key" onClick={() => tap(i + 1)}>
            {i + 1}
          </button>
        ))}
      </div>
      <button
        className="big"
        style={{ width: "100%", marginTop: 10 }}
        onClick={() =>
          useAdama
            ? void rollOrThrow("1d20", true, undefined, { source: "Adama", quick: true }).then((a) =>
                rollOrThrow("1d20", true, undefined, { source: "Adama", quick: true }).then((b) => onDecide(a.total + b.total, [a.total, b.total])),
              )
            : void rollOrThrow(beacon ? "2d20kh1" : "1d20", true, undefined, { source: "Death saving throw", quick: true }).then((r) => onDecide(r.total))
        }
      >
        Roll for me
      </button>
    </>
  );
}
