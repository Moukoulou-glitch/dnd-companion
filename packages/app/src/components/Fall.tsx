import { useState } from "react";
import { rollOrThrow } from "../dice/quick";
import { WhoRolls } from "./WhoRolls";

/**
 * A fall (PHB p. 183): 1d6 bludgeoning for every 10 ft, at most 20d6; you land prone
 * unless you take no damage. Slow Fall (a monk's reaction) takes 5 × monk level off;
 * Feather Fall means no damage at all. Your own dice: type the total.
 */
export function FallPanel({ slowFall, featherFall, physical: mine, onDone }: { slowFall?: number; featherFall: boolean; physical: boolean; onDone: (damage: number, usedSlowFall: boolean) => void }) {
  const [physical, setPhysical] = useState(mine);
  const [feet, setFeet] = useState("");
  const [slow, setSlow] = useState(false);
  const [typed, setTyped] = useState("");
  const [rolling, setRolling] = useState(false);
  const ft = Math.max(0, Number(feet) || 0);
  const n = Math.min(20, Math.floor(ft / 10));
  const finish = (total: number) => onDone(Math.max(0, total - (slow && slowFall ? slowFall : 0)), slow);
  return (
    <>
      <label className="row">
        <div className="row-main">
          <div className="row-title">How far?</div>
          <div className="row-sub">{n ? `${n}d6 bludgeoning${n === 20 ? " (the most a fall deals)" : ""}` : "Less than 10 ft: no damage"}</div>
        </div>
        <input className="search" style={{ maxWidth: 110 }} inputMode="numeric" placeholder="feet" value={feet} onChange={(e) => setFeet(e.target.value.replace(/\D/g, ""))} aria-label="Feet fallen" />
      </label>
      {featherFall && <p className="note">Feather Fall is on you: you land on your feet, with no damage.</p>}
      {slowFall !== undefined && !featherFall && n > 0 && (
        <label className="row check">
          <input type="checkbox" checked={slow} onChange={() => setSlow(!slow)} />
          <div className="row-main">
            <div className="row-title">Slow Fall: {slowFall} less</div>
            <div className="row-sub">Your reaction: 5 × your monk level.</div>
          </div>
        </label>
      )}
      {!featherFall && n > 0 && <WhoRolls physical={physical} onChange={setPhysical} />}
      {featherFall || n === 0 ? (
        <button className="big primary wide" onClick={() => onDone(0, false)}>
          Land safely
        </button>
      ) : physical ? (
        <>
          <input className="search" inputMode="numeric" placeholder={`Your ${n}d6 total`} value={typed} onChange={(e) => setTyped(e.target.value.replace(/\D/g, ""))} aria-label="Your dice total" />
          <button className="big primary wide" disabled={!typed} onClick={() => finish(Number(typed))}>
            Take the damage
          </button>
        </>
      ) : (
        <button
          className="big primary wide"
          disabled={rolling}
          onClick={() => {
            setRolling(true);
            void rollOrThrow(`${n}d6`, true, "bludgeoning", { source: "Fall" }).then((r) => finish(r.total));
          }}
        >
          {rolling ? "Rolling…" : `Roll ${n}d6`}
        </button>
      )}
      <p className="note">You land prone, unless you take no damage.</p>
    </>
  );
}
