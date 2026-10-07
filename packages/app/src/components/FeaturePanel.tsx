import { RichText } from "./Conditions";
import { useState } from "react";
import { roll } from "@dnd/dice";
import type { ActionResult } from "@dnd/engine";

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
  onUse: (rolled?: number, free?: boolean, check?: string, choice?: string) => void;
  /** Skills it can roll, with their names and bonuses. */
  checks?: { skill: string; name: string; bonus: string }[];
}) {
  const amount = a.tempHp ?? a.heal ?? a.roll;
  const [entry, setEntry] = useState("");
  const none = a.cost && a.cost.remaining < a.cost.amount;

  const useNow = (free = false) => {
    if (!amount) return onUse(undefined, free);
    if (physical) return onUse(Number(entry) + amount.flat, free);
    const formula = [...amount.dice, String(amount.flat)].join("+");
    return onUse(Math.max(0, roll(formula).total), free);
  };


  return (
    <>
      <p className="row-sub">
        {economyLabel(a.economy)}
        {a.common ? "" : `, from ${a.source}`}
      </p>
      {a.note && (
        <p>
          <RichText text={a.note} />
        </p>
      )}
      {text && text.length > 0 && (
        <details className="book-text">
          <summary>Full text</summary>
          {text.map((p, i) => (
            <p key={i}>
              <RichText text={p} />
            </p>
          ))}
        </details>
      )}
      {a.common && !text?.length && <p className="note">Full text: load the actions file with your book files (Characters → Book text).</p>}
      {a.cost && (
        <p className={none ? "note danger-text" : "note"}>
          Uses {a.cost.amount} {a.cost.name}: {a.cost.remaining} left.
          {none ? " None left; you can still use it if your DM allows." : ""}
        </p>
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
      {a.infoOnly ? null : a.choose ? (
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
      <button className={`big wide ${none ? "damage" : "primary"}`} disabled={!!amount && physical && amount.dice.length > 0 && !entry} onClick={() => useNow()}>
        {none ? `Use ${a.name} anyway` : a.roll && !physical ? `Roll and use ${a.name}` : `Use ${a.name}`}
      </button>
      )}
      {!a.common && (a.cost || a.economy !== "free") && (a.toggles.length > 0 || a.duration) && (
        <button className="link" disabled={!!amount && physical && amount.dice.length > 0 && !entry} onClick={() => useNow(true)}>
          Just activate: switch it on without spending anything
        </button>
      )}
    </>
  );
}
