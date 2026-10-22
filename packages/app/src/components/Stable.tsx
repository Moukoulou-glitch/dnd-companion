import { useState } from "react";
import { DieEntry } from "./Prompts";

const WAYS = [
  { how: "a Medicine check (DC 10)", label: "Someone's Medicine check (DC 10)" },
  { how: "Spare the Dying", label: "Spare the Dying" },
  { how: "a healer's kit", label: "A healer's kit" },
  { how: "another way", label: "Another way (your DM's call)" },
];

/**
 * Stable at 0 HP: how it came about (unless it's already known: three
 * successful death saves), then the 1d4 hours until 1 HP comes back.
 */
export function StablePanel({ how, onDone }: { how?: string | undefined; onDone: (how: string, hours: number) => void }) {
  const [picked, setPicked] = useState<string | undefined>(how);
  if (!picked)
    return (
      <>
        <p className="note">At 0 HP and stable: you make no more death saves and your death saves are cleared. How were you stabilized?</p>
        <div className="choose-list">
          {WAYS.map((w) => (
            <button key={w.how} className="big wide" onClick={() => setPicked(w.how)}>
              {w.label}
            </button>
          ))}
        </div>
      </>
    );
  return (
    <>
      <p className="note">
        Stable ({picked}). Unless you're healed, you regain 1 hit point after 1d4 hours: roll it now and a tag on Play counts the hours down.
      </p>
      <DieEntry sides={4} label="Tap what your d4 shows, or let the app roll." theme={{ source: "Stable" }} onDone={(n) => onDone(picked, n)} />
    </>
  );
}
