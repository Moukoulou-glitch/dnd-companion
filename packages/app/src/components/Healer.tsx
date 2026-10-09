import { useState } from "react";
import { roll } from "@dnd/dice";
import { NumberStep } from "./Adjust";

/**
 * Healer (remastered): spend a healer's kit use to restore 1d12 + 4 + the
 * creature's maximum number of Hit Dice, once per creature until it rests.
 * Who was already patched up is remembered until a rest.
 */
export function HealerPanel({ used, physical, myHitDice, onDone }: { used: string[]; physical: boolean; myHitDice: number; onDone: (who: string, total: number, me: boolean) => void }) {
  const [who, setWho] = useState("");
  const [me, setMe] = useState(false);
  const [hd, setHd] = useState(1);
  const [entry, setEntry] = useState("");
  const name = me ? "Me" : who.trim();
  const already = used.some((x) => x.toLowerCase() === name.toLowerCase());
  const maxHd = me ? myHitDice : hd;
  const finish = (d12: number) => onDone(name, d12 + 4 + maxHd, me);
  return (
    <>
      <p className="note">1d12 + 4 + the creature's maximum number of Hit Dice. Once per creature until it finishes a short or long rest.</p>
      {used.length > 0 && (
        <p className="note">
          Already patched up since the last rest: <b>{used.join(", ")}</b>
        </p>
      )}
      <label className="row">
        <div className="row-main row-title">On me</div>
        <input type="checkbox" checked={me} onChange={(e) => setMe(e.target.checked)} />
      </label>
      {!me && <input className="search" placeholder="Who (Bob, the guard…)" value={who} maxLength={40} onChange={(e) => setWho(e.target.value)} aria-label="Who" />}
      {!me && (
        <div className="group">
          <NumberStep label="Their maximum Hit Dice" sub="Usually their level" value={hd} min={0} max={40} onChange={setHd} />
        </div>
      )}
      {already && <p className="over-banner">{name} was already patched up since their last rest. Only if your DM allows it.</p>}
      {physical ? (
        <div className="row">
          <div className="row-main row-title">Your d12 shows</div>
          <input className="search" inputMode="numeric" value={entry} onChange={(e) => setEntry(e.target.value.replace(/[^0-9]/g, ""))} aria-label="d12 roll" />
        </div>
      ) : null}
      <div className="big-actions">
        {physical && (
          <button className="big" disabled={!name} onClick={() => finish(roll("1d12").total)}>
            App rolls
          </button>
        )}
        <button className="big primary" disabled={!name || (physical && (!entry || Number(entry) < 1 || Number(entry) > 12))} onClick={() => finish(physical ? Number(entry) : roll("1d12").total)}>
          {physical ? `Heal ${entry ? Number(entry) + 4 + maxHd : "…"}` : "Roll and heal"}
        </button>
      </div>
    </>
  );
}
