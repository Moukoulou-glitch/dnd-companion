import { useState } from "react";
import { facesOrRoll } from "../dice/quick";

/**
 * One die after something else happened (Untamed Flame's d10 for the slot): tap what your
 * die shows, or let the app roll it.
 */
export function DiePick({ sides, what, source, onPick }: { sides: number; what: string; source?: string; onPick: (face: number) => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <>
      <p className="note">{what}</p>
      <p className="sub-head">Tap what your d{sides} shows</p>
      <div className="keys d20">
        {Array.from({ length: sides }, (_, i) => (
          <button key={i} className="key" disabled={busy} onClick={() => onPick(i + 1)}>
            {i + 1}
          </button>
        ))}
      </div>
      <button
        className="big wide"
        style={{ marginTop: 10 }}
        disabled={busy}
        onClick={() => {
          setBusy(true);
          void facesOrRoll(1, sides, true, source ? { source } : {})
            .then((f) => onPick(f[0]!))
            .finally(() => setBusy(false));
        }}
      >
        {busy ? "Throwing…" : `Roll the d${sides} for me`}
      </button>
    </>
  );
}
