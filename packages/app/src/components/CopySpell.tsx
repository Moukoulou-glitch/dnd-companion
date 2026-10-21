import { useEffect, useRef, useState } from "react";
import type { CopyCost } from "@dnd/engine";

/** "4 hours", "1 hour 30 minutes", "6 minutes". */
export function formatCopyTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  const parts = [h ? `${h} hour${h === 1 ? "" : "s"}` : "", m ? `${m} minute${m === 1 ? "" : "s"}` : ""].filter(Boolean);
  return parts.join(" ") || "0 minutes";
}

/** What copying costs, with why: "100 gp and 4 hours" (+ the Savant and the Quill). */
export function copyCostText(cost: CopyCost): string {
  const why = [cost.savant, cost.quill ? `${cost.quill}: 2 minutes per level` : ""].filter(Boolean).join("; ");
  return `${cost.gp} gp in materials and fine inks, ${formatCopyTime(cost.minutes)}${why ? ` (${why})` : ""}`;
}

/**
 * Copying a spell into the spellbook (PHB p. 114): what it costs in gold and
 * time, then pay from the spellbook fund or add it free (spells from a new
 * wizard level cost nothing), or cancel.
 */
export function CopyAsk({ cost, fund, label, onDone, onCancel, scrollTop = true }: { cost: CopyCost; fund: number; label: string; onDone: (cost?: number) => void; onCancel: () => void; scrollTop?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  // Bring the question into view by scrolling the sheet only (scrollIntoView also scrolled the page, leaving it blank).
  useEffect(() => {
    if (!scrollTop) return;
    const sheet = ref.current?.closest(".sheet");
    if (sheet) sheet.scrollTop = 0;
  }, [scrollTop]);
  return (
    <div className="copy-ask" role="dialog" aria-label={`Copy ${label}`} ref={ref}>
      <p className="question">Pay for copying {label}?</p>
      <p className="note">
        {copyCostText(cost)}. Your spellbook materials: {fund} gp
        {fund < cost.gp ? ", not enough: it goes to 0 gp if you pay" : ""}. Spells you gain from a new wizard level are free.
      </p>
      <div className="choose-list">
        <button className="big wide" onClick={onCancel}>
          Cancel
        </button>
        <button className="big wide" onClick={() => onDone()}>
          Add it free
        </button>
        <button className="big primary wide" onClick={() => onDone(cost.gp)}>
          Pay {cost.gp} gp and add it
        </button>
      </div>
    </div>
  );
}

/**
 * A wizard's spell: "Copy into the spellbook" and "Prepared today". Preparing
 * one that isn't in the book is beyond the rules: the app says so, and lets you.
 */
export function BookChecks({
  name,
  inBook,
  prepared,
  cost,
  fund,
  onCopy,
  onUncopy,
  onPrepare,
}: {
  name: string;
  inBook: boolean;
  prepared: boolean;
  cost?: CopyCost | undefined;
  fund: number;
  onCopy: (gp?: number) => void;
  onUncopy: () => void;
  onPrepare: (prepared: boolean) => void;
}) {
  const [asking, setAsking] = useState(false);
  return (
    <div className="book-checks">
      <label className="row check" style={{ padding: "8px 0" }}>
        <input
          type="checkbox"
          checked={inBook}
          onChange={() => {
            if (inBook) return onUncopy();
            if (cost) return setAsking(true);
            onCopy();
          }}
        />
        <div className="row-main">
          <div className="row-title">Copy into the spellbook</div>
          <div className="row-sub">{inBook ? "In your spellbook" : cost ? copyCostText(cost) : "Not in your spellbook"}</div>
        </div>
      </label>
      {asking && cost && !inBook && (
        <CopyAsk
          cost={cost}
          fund={fund}
          label={name}
          scrollTop={false}
          onCancel={() => setAsking(false)}
          onDone={(gp) => {
            setAsking(false);
            onCopy(gp);
          }}
        />
      )}
      <label className="row check" style={{ padding: "8px 0" }}>
        <input type="checkbox" checked={prepared} onChange={() => onPrepare(!prepared)} />
        <div className="row-main">
          <div className="row-title">Prepared today</div>
          {!inBook && !prepared && <div className="row-sub">Normally you prepare only from your spellbook</div>}
        </div>
      </label>
      {prepared && !inBook && (
        <p className="warn" role="alert">
          {name} isn't in your spellbook: normally a wizard can prepare only spells from the spellbook. It's prepared anyway; copy it in or untick it if your DM says no.
        </p>
      )}
    </div>
  );
}
