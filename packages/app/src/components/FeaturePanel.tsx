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
  physical,
  onUse,
}: {
  a: ActionResult;
  physical: boolean;
  onUse: (rolled?: number) => void;
}) {
  const amount = a.tempHp ?? a.heal;
  const [entry, setEntry] = useState("");
  const none = a.cost && a.cost.remaining < a.cost.amount;

  const useNow = () => {
    if (!amount) return onUse();
    if (physical) return onUse(Number(entry) + amount.flat);
    const formula = [...amount.dice, String(amount.flat)].join("+");
    return onUse(Math.max(0, roll(formula).total));
  };

  return (
    <>
      <p className="row-sub">
        {economyLabel(a.economy)}, from {a.source}
      </p>
      {a.note && <p>{a.note}</p>}
      {a.cost && (
        <p className={none ? "note danger-text" : "note"}>
          Uses {a.cost.amount} {a.cost.name}: {a.cost.remaining} left.
          {none ? " None left; you can still use it if your DM allows." : ""}
        </p>
      )}
      {amount && (
        <>
          <p className="sub-head">
            {a.tempHp ? "Temporary HP" : "Healing"}: {amount.text}
          </p>
          {physical && amount.dice.length > 0 && (
            <label className="entry">
              <span>Roll {amount.dice.join(" + ")} and type the dice total</span>
              <input inputMode="numeric" pattern="[0-9]*" value={entry} onChange={(e) => setEntry(e.target.value.replace(/\D/g, "").slice(0, 3))} />
            </label>
          )}
        </>
      )}
      <button className="big primary wide" disabled={!!amount && physical && amount.dice.length > 0 && !entry} onClick={useNow}>
        {none ? `Use ${a.name} anyway` : `Use ${a.name}`}
      </button>
    </>
  );
}
