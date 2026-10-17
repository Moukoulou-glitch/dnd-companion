import { RichText, TextBlocks } from "./Conditions";
import { DcBig } from "./DcBig";
import { useEffect, useRef, useState } from "react";
import { roll } from "@dnd/dice";
import type { ActionResult } from "@dnd/engine";
import { facesOrRoll } from "../dice/quick";
import { skipThrow } from "../diceBox";

const ECONOMY: Record<ActionResult["economy"], string> = {
  action: "Action",
  bonus: "Bonus action",
  reaction: "Reaction",
  free: "No action",
};

export const economyLabel = (e: ActionResult["economy"]) => ECONOMY[e];

/**
 * Details and the Use button for one feature. Features that roll (Form of
 * Dread's temp HP) are rolled here, by the app or from the player's dice,
 * and the result is recorded with the use.
 */
export function FeaturePanel({
  a,
  text,
  physical,
  onUse,
  checks,
}: {
  a: ActionResult;
  text?: string[] | undefined;
  physical: boolean;
  /** The third argument: the skill to roll right after (Hide: stealth). */
  /** onMe: for an action that can heal someone else (Healing Hands), whether it was on you. */
  onUse: (rolled?: number, free?: boolean, check?: string, choice?: string, spend?: { amount: number; healSelf: boolean }, onMe?: boolean) => void;
  /** Skills it can roll, with their names and bonuses. */
  checks?: { skill: string; name: string; bonus: string }[];
}) {
  const amount = a.tempHp ?? a.heal ?? a.roll;
  const [entry, setEntry] = useState("");
  const [points, setPoints] = useState("");
  // Healing Hands and the like: on someone else unless ticked.
  const [onMe, setOnMe] = useState(false);
  const me = a.others ? onMe : undefined;
  const none = a.cost && a.cost.remaining < a.cost.amount;

  const [throwing, setThrowing] = useState(false);
  // Closed while its dice are in the air: the dice stop and the feature isn't used.
  const alive = useRef(true);
  const inAir = useRef(false);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      if (inAir.current) skipThrow();
    };
  }, []);
  const useNow = async (free = false) => {
    if (!amount) return onUse(undefined, free, undefined, undefined, undefined, me);
    if (physical) return onUse(Number(entry) + amount.flat, free, undefined, undefined, undefined, me);
    // The app rolls for this character: 3D dice when they're on (in the feature's own look: Second Wind's), else the app's roll.
    setThrowing(true);
    inAir.current = true;
    try {
      let total = amount.flat;
      for (const d of amount.dice) {
        const m = /^(\d*)d(\d+)$/.exec(d);
        if (!m) {
          total += roll(d).total;
          continue;
        }
        const faces = await facesOrRoll(Number(m[1] || 1), Number(m[2]), true, { source: a.name, keys: a.cost ? [`resource:${a.cost.resource}`] : [] });
        total += faces.reduce((x, f) => x + f, 0);
      }
      inAir.current = false;
      if (!alive.current) return;
      return onUse(Math.max(0, total), free, undefined, undefined, undefined, me);
    } finally {
      inAir.current = false;
      if (alive.current) setThrowing(false);
    }
  };


  return (
    <>
      <p className="row-sub">
        {a.limited ? `An extra action from ${a.source}, once on each of your turns, on top of your own` : economyLabel(a.economy)}
        {a.common || a.limited ? "" : `, from ${a.source}`}
      </p>
      {a.dc && <DcBig dc={a.dc} />}
      {a.note && (
        <p>
          <RichText text={a.note} />
        </p>
      )}
      {text && text.length > 0 && (
        <details className="book-text">
          <summary>Full text</summary>
          <TextBlocks text={text} />
        </details>
      )}
      {a.common && !text?.length && <p className="note">Full text: load the actions file with your book files (Characters → Book text).</p>}
      {a.cost && !a.spendAmount && (
        <p className={none ? "note danger-text" : "note"}>
          Uses {a.cost.amount} {a.cost.name}: {a.cost.remaining} left.
          {none ? " None left; you can still use it if your DM allows." : ""}
        </p>
      )}
      {a.others && (
        <label className="row check" style={{ padding: "8px 0" }}>
          <input type="checkbox" checked={onMe} onChange={() => setOnMe(!onMe)} />
          <div className="row-main">
            <div className="row-title">Put its effect on me</div>
            <div className="row-sub">Unticked: it goes to the creature you touch, and your hit points stay as they are.</div>
          </div>
        </label>
      )}
      {amount && (
        <>
          <p className="sub-head">
            {a.tempHp ? "Temporary HP" : a.heal ? "Healing" : `Roll ${amount.text}, ${a.roll!.label}`}
            {a.tempHp || a.heal ? `: ${amount.text}` : ""}
          </p>
          {physical && amount.dice.length > 0 && (
            <label className="entry">
              <span>Roll {amount.dice.join(" + ")} and type the dice total</span>
              <input inputMode="numeric" pattern="[0-9]*" value={entry} onChange={(e) => setEntry(e.target.value.replace(/\D/g, "").slice(0, 3))} />
            </label>
          )}
        </>
      )}
      {a.infoOnly ? null : a.spendAmount ? (
        <>
          <label className="entry">
            <span>
              {a.spendAmount.label} ({a.cost?.remaining ?? 0} left)
            </span>
            <input inputMode="numeric" pattern="[0-9]*" value={points} onChange={(e) => setPoints(e.target.value.replace(/\D/g, "").slice(0, 3))} />
          </label>
          <div className="big-actions">
            {a.spendAmount.heals && (
              <button className="big primary" disabled={!Number(points)} onClick={() => onUse(undefined, false, undefined, undefined, { amount: Number(points), healSelf: true })}>
                Heal myself
              </button>
            )}
            <button className="big" disabled={!Number(points)} onClick={() => onUse(undefined, false, undefined, undefined, { amount: Number(points), healSelf: false })}>
              {a.spendAmount.heals ? "Someone else" : `Spend ${points || ""}`}
            </button>
          </div>
        </>
      ) : a.choose ? (
        <>
          <p className="sub-head">{a.choose.label}</p>
          <div className="choice-grid">
            {a.choose.options.map((o) => (
              <button key={o} className="big" onClick={() => onUse(undefined, false, undefined, o)}>
                {o}
              </button>
            ))}
          </div>
        </>
      ) : checks && checks.length > 0 ? (
        <>
          {checks.map((ch) => (
            <button key={ch.skill} className="big wide primary" style={{ marginBottom: 8 }} onClick={() => onUse(undefined, false, ch.skill)}>
              {a.name}: roll {ch.name}
              <span className="sub">
                {ch.bonus}
                {a.check?.dc ? `, DC ${a.check.dc}` : ""}
                {a.asAttack ? ", uses one attack" : ""}
              </span>
            </button>
          ))}
          <button className="link" onClick={() => onUse()}>
            Use it without rolling here
          </button>
        </>
      ) : (
      <button className={`big wide ${none ? "damage" : "primary"}`} disabled={throwing || (!!amount && physical && amount.dice.length > 0 && !entry)} onClick={() => void useNow()}>
        {throwing ? "Throwing…" : none ? `Use ${a.name} anyway` : a.roll && !physical ? `Roll and use ${a.name}` : `Use ${a.name}`}
      </button>
      )}
      {!a.common && (a.cost || a.economy !== "free") && (a.toggles.length > 0 || a.duration) && (
        <button className="link" disabled={throwing || (!!amount && physical && amount.dice.length > 0 && !entry)} onClick={() => void useNow(true)}>
          Just activate: switch it on without spending anything
        </button>
      )}
    </>
  );
}
