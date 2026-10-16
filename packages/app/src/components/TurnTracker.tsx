import { useState } from "react";
import type { TurnUsed } from "@dnd/schema";
import { SwipeButton } from "./Swipe";

export type TurnKind = "action" | "bonus" | "reaction";

/**
 * The turn of a creature beside you (a summoned creature, a companion): its action
 * (and the attacks of its Attack action), bonus action, reaction and movement by
 * kind of speed, with Dash, and a swipe for a new turn. It only reports taps; the
 * owner records them and warns (never blocks) through `tryUse`.
 */
export function TurnTracker({
  name,
  used,
  perAction,
  speeds,
  hover,
  inCombat,
  onEconomy,
  onMove,
  onDash,
  onNewTurn,
  tryUse,
  newTurnNote,
}: {
  name: string;
  used: TurnUsed;
  perAction: number;
  speeds: Record<string, number>;
  hover?: boolean;
  inCombat: boolean;
  onEconomy: (kind: TurnKind, used: boolean, label: string) => void;
  onMove: (feet: number, mode: string) => void;
  onDash: (on: boolean) => void;
  onNewTurn: () => void;
  tryUse: (kind: TurnKind | "attack", what: string, run: () => void) => void;
  /** Said under the swipe (a companion whose turn comes back with yours). */
  newTurnNote?: string;
}) {
  const [moving, setMoving] = useState(false);
  const [mode, setMode] = useState("walk");
  const left = (m: string) => Math.max(0, (speeds[m] ?? 0) * (1 + used.dashes) - used.moved);
  const economy = (kind: TurnKind, label: string) => (
    <button className="pill" data-used={used[kind] && (kind !== "action" || used.attacks === 0 || used.attacks >= perAction)} onClick={() => onEconomy(kind, !used[kind], label)}>
      <b>{label}</b>
      <small>{kind === "action" && used.attacks > 0 ? `${used.attacks} of ${perAction} attack${perAction === 1 ? "" : "s"}` : used[kind] ? "used" : "free"}</small>
    </button>
  );
  return (
    <section className="turn" aria-label={`${name}'s turn`}>
      <div className="pills">
        {economy("action", "Action")}
        {economy("bonus", "Bonus")}
        {economy("reaction", "Reaction")}
        <button className="pill" data-used={Object.keys(speeds).every((k) => left(k) === 0)} onClick={() => setMoving(!moving)}>
          <b>Move</b>
          <small>
            {Object.entries(speeds)
              .filter(([, v]) => v > 0)
              .map(([k]) => `${k === "walk" ? "" : `${k} `}${left(k)}`)
              .join(" · ") || "0"}{" "}
            ft
          </small>
        </button>
      </div>
      {moving && (
        <div className="pick-inline">
          <p className="note">
            Moved {used.moved} ft{used.dashes ? `, Dash ×${used.dashes}` : ""}. Switching speeds: what it has moved comes off the new one.
          </p>
          {Object.keys(speeds).length > 1 && (
            <div className="segmented small" role="tablist" aria-label="Moving by">
              {Object.entries(speeds).map(([k, v]) => (
                <button key={k} role="tab" aria-selected={mode === k} onClick={() => setMode(k)}>
                  {k} {v} · {left(k)} left
                </button>
              ))}
            </div>
          )}
          <div className="choice-grid">
            {[5, 10, 15, 20, 30].map((ft) => (
              <button key={ft} className="chip" onClick={() => onMove(ft, mode)}>
                +{ft} ft
              </button>
            ))}
            <button className="chip" disabled={used.moved === 0} onClick={() => onMove(-5, mode)}>
              −5 ft
            </button>
            <button className="chip" onClick={() => tryUse("action", "Dash", () => onDash(true))}>
              Dash (action)
            </button>
            {used.dashes > 0 && (
              <button className="chip" onClick={() => onDash(false)}>
                Undo Dash
              </button>
            )}
          </div>
          {speeds.fly ? <p className="note">Flying: knocked prone, speed 0 or unable to move, it falls{hover ? " (it hovers, so it doesn't)" : ""}.</p> : null}
        </div>
      )}
      <SwipeButton label={`Swipe: new turn for ${name}`} tone="plain" onConfirm={onNewTurn} />
      {newTurnNote && <p className="note">{newTurnNote}</p>}
      {!inCombat && <p className="note">Not in combat: track it anyway if you like.</p>}
    </section>
  );
}
