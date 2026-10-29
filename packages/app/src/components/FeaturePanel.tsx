import { RichText, TextBlocks } from "./Conditions";
import { DcBig } from "./DcBig";
import { useEffect, useRef, useState } from "react";
import { roll } from "@dnd/dice";
import type { ActionResult } from "@dnd/engine";
import { facesOrRoll } from "../dice/quick";
import { WhoRolls } from "./WhoRolls";
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
  physical: mine,
  onUse,
  checks,
  targets,
  slots,
  onSlots,
  beaconIds,
  maxLabels,
  onJustSpend,
  onMaxWith,
}: {
  /** Its damage at the maximum by an option (Destructive Wrath on Wrath of the Storm): spend what the option costs. */
  onMaxWith?: (label: string, spends?: { resource: string; amount: number }) => void;
  /** From Play's Features: spend its use without doing anything else. */
  onJustSpend?: () => void;
  /** Who is under Beacon of Hope ("me", a companion's id, "summon:<id>"): healing them is the maximum. */
  beaconIds?: string[];
  /** What makes it the maximum for some of them, when it isn't Beacon of Hope (you: Gift of the Ever-Living Ones). */
  maxLabels?: Record<string, string>;
  /** Spell slots by level (Arcane Recovery, Combat Wild Shape). */
  slots?: { level: number; total: number; used: number }[];
  /** Recovering slots, or spending one to heal (with what was rolled). */
  onSlots?: (p: { slots?: number[]; slot?: number; rolled?: number }) => void;
  /**
   * Who it can go to, when it heals or gives something (Healing Hands, Lay on Hands, Bardic Inspiration):
   * you, your companions, your summoned creatures, or someone the app doesn't track ("other"). Warnings never block.
   */
  targets?: { id: string; name: string; sub?: string; warnings: string[] }[];
  a: ActionResult;
  text?: string[] | undefined;
  physical: boolean;
  /** The third argument: the skill to roll right after (Hide: stealth). */
  /** onMe: for an action that can heal someone else (Healing Hands), whether it was on you. */
  onUse: (rolled?: number, free?: boolean, check?: string, choice?: string, spend?: { amount: number; healSelf: boolean }, onMe?: boolean, target?: string) => void;
  /** Skills it can roll, with their names and bonuses. */
  checks?: { skill: string; name: string; bonus: string }[];
}) {
  const amount = a.tempHp ?? a.heal ?? a.roll;
  // Your own dice or the app's: the character's setting, changeable for this roll.
  const [physical, setPhysical] = useState(mine);
  const [entry, setEntry] = useState("");
  const [points, setPoints] = useState("");
  // Healing Hands and the like: on someone else unless ticked.
  const [onMe, setOnMe] = useState(false);
  // Who it goes to, when the app knows the candidates: you, a companion, a summoned creature, or someone else.
  const pickable = !!targets?.length && (!!a.others || !!a.gives || !!a.spendAmount?.heals);
  const [target, setTarget] = useState(a.spendAmount?.heals ? "me" : "other");
  const me = pickable ? target === "me" : a.others || a.gives ? onMe : undefined;
  const useWith = (rolled?: number, free?: boolean, check?: string, choice?: string, spend?: { amount: number; healSelf: boolean }, onMeArg?: boolean) =>
    onUse(rolled, free, check, choice ?? (types.length > 1 ? dtype : undefined), spend, onMeArg, pickable ? target : undefined);
  const targetName = targets?.find((t) => t.id === target)?.name ?? "them";
  const none = a.cost && a.cost.remaining < a.cost.amount;

  const [throwing, setThrowing] = useState(false);
  // Destructive Wrath on this roll: its dice at their maximum.
  const [maxOn, setMaxOn] = useState(false);
  // Its damage type, when it can be one of several (Wrath of the Storm: lightning or thunder).
  const types = a.roll?.types ?? [];
  const [dtype, setDtype] = useState(types[0]);
  // Rolled more than once, keeping one (Controlled Chaos, Controlled Surge): the faces, then the pick.
  const times = a.roll?.times ?? 1;
  const [faces, setFaces] = useState<number[] | null>(null);
  const sidesOf = (d?: string) => Number(/^1?d(\d+)$/.exec(d ?? "")?.[1] ?? 0);
  const rollTimes = async () => {
    const sides = sidesOf(amount?.dice[0]);
    if (!sides) return;
    setThrowing(true);
    try {
      const f = await facesOrRoll(times, sides, true, { source: a.name });
      if (alive.current) setFaces(f);
    } finally {
      if (alive.current) setThrowing(false);
    }
  };
  // What a face means: the action's table, or its options when there's one per face (Wild Surge's d8).
  const meaning = (n: number) => a.roll?.table?.[n - 1] ?? (a.choose && a.choose.options.length === sidesOf(amount?.dice[0]) ? a.choose.options[n - 1] : undefined);
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
  // Beacon of Hope: healing that reaches a creature under it is the maximum the dice can give.
  const healedId = pickable ? target : me === false ? "other" : "me";
  const beacon = !!a.heal && !!beaconIds?.includes(healedId);
  const maxOfAmount = amount ? amount.flat + amount.dice.reduce((t, d) => t + (/^(\d*)d(\d+)$/.test(d) ? Number(/^(\d*)/.exec(d)![1] || 1) * Number(/d(\d+)$/.exec(d)![1]) : 0), 0) : 0;
  // Theros: the pick first, then its dice (1d10 days), recorded together.
  const rollAfter = async (choice: string) => {
    if (!amount) return useWith(undefined, false, undefined, choice);
    if (physical) return useWith(Number(entry) + amount.flat, false, undefined, choice);
    setThrowing(true);
    inAir.current = true;
    try {
      let total = amount.flat;
      for (const d of amount.dice) {
        const m = /^(\d*)d(\d+)$/.exec(d);
        if (!m) continue;
        const faces = await facesOrRoll(Number(m[1] || 1), Number(m[2]), true, { source: a.name });
        total += faces.reduce((x, f) => x + f, 0);
      }
      inAir.current = false;
      if (alive.current) useWith(total, false, undefined, choice);
    } finally {
      inAir.current = false;
      if (alive.current) setThrowing(false);
    }
  };
  const useNow = async (free = false) => {
    if (!amount) return useWith(undefined, free, undefined, undefined, undefined, me);
    if (maxOn && a.roll?.maxWith) {
      const top = amount.dice.reduce((n, d) => {
        const m = /^(\d*)d(\d+)$/.exec(d);
        return n + (m ? Number(m[1] || 1) * Number(m[2]) : 0);
      }, amount.flat);
      onMaxWith?.(a.roll.maxWith.label, a.roll.maxWith.spends);
      return useWith(top, free, undefined, undefined, undefined, me);
    }
    // Healing typed in (Keeper of Souls: the creature's Hit Dice), not rolled.
    if (a.healEntered) return useWith(Number(entry), free, undefined, undefined, undefined, me);
    if (beacon && physical) return useWith(maxOfAmount, free, undefined, undefined, undefined, me);
    if (physical) return useWith(Number(entry) + amount.flat, free, undefined, undefined, undefined, me);
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
        const faces = await facesOrRoll(Number(m[1] || 1), Number(m[2]), true, beacon ? { source: "Beacon of Hope", max: true } : { source: a.name, keys: a.cost ? [`resource:${a.cost.resource}`] : [] });
        // Beacon of Hope: each die counts as its maximum.
        total += beacon ? faces.length * Number(m[2]) : faces.reduce((x, f) => x + f, 0);
      }
      inAir.current = false;
      if (!alive.current) return;
      return useWith(Math.max(0, total), free, undefined, undefined, undefined, me);
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
      {pickable && (
        <>
          <p className="sub-head">{a.gives ? "Give it to" : "On whom?"}</p>
          <div className="group">
            {targets!.map((t) => (
              <label className="row check" key={t.id}>
                <input type="radio" name="feature-target" checked={target === t.id} onChange={() => setTarget(t.id)} />
                <div className="row-main">
                  <div className="row-title">{t.id === "me" ? `Me (${t.name})` : t.name}</div>
                  {t.sub && <div className="row-sub">{t.sub}</div>}
                  {t.warnings.map((w) => (
                    <div className="row-sub danger-text" key={w}>
                      {w}
                    </div>
                  ))}
                </div>
              </label>
            ))}
          </div>
          {target === "me" && a.gives?.selfWarning && <p className="over-banner">{a.gives.selfWarning}</p>}
        </>
      )}
      {!pickable && a.gives && !a.others && (
        <>
          <label className="row check" style={{ padding: "8px 0" }}>
            <input type="checkbox" checked={onMe} onChange={() => setOnMe(!onMe)} />
            <div className="row-main">
              <div className="row-title">Put its effect on me</div>
              <div className="row-sub">Unticked: it goes to the creature you give it to (they track it on their sheet).</div>
            </div>
          </label>
          {onMe && a.gives.selfWarning && <p className="over-banner">{a.gives.selfWarning}</p>}
        </>
      )}
      {!pickable && a.others && (
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
            {a.healEntered ? "" : a.tempHp || a.heal ? `: ${amount.text}` : ""}
          </p>
          {a.healEntered && (
            <label className="entry">
              <span>{a.healEntered}</span>
              <input inputMode="numeric" pattern="[0-9]*" value={entry} onChange={(e) => setEntry(e.target.value.replace(/\D/g, "").slice(0, 3))} />
            </label>
          )}
          {beacon && <p className="note beacon-text">{maxLabels?.[healedId] ?? "Beacon of Hope"}: the maximum, {maxOfAmount}.</p>}
          {times > 1 && faces && (
            <div className="group">
              {faces.map((f, i) => (
                <div className="row" key={i}>
                  <div className="row-main">
                    <div className="row-title">
                      Roll {i + 1}: {f}
                    </div>
                    {meaning(f) && <div className="row-sub">{meaning(f)}</div>}
                  </div>
                </div>
              ))}
              {faces.length > 1 && faces.every((f) => f === faces[0]) && a.choose && <p className="note">Both the same: pick any.</p>}
            </div>
          )}
          {types.length > 1 && (
            <div className="types wrap" role="radiogroup" aria-label="Damage type">
              {types.map((t) => (
                <button key={t} className="switch" role="radio" aria-checked={dtype === t} aria-pressed={dtype === t} onClick={() => setDtype(t)} style={{ textTransform: "capitalize" }}>
                  {t}
                </button>
              ))}
            </div>
          )}
          {a.roll?.maxWith && amount.dice.length > 0 && (
            <label className="row check" style={{ padding: "8px 0" }}>
              <input type="checkbox" checked={maxOn} onChange={() => setMaxOn(!maxOn)} />
              <div className="row-main">
                <div className="row-title">{a.roll.maxWith.label}: maximum damage</div>
                <div className="row-sub">Every die at its maximum instead of rolling{a.roll.maxWith.spends ? "; spends a use" : ""}.</div>
              </div>
            </label>
          )}
          {!beacon && !a.healEntered && !maxOn && amount.dice.length > 0 && <WhoRolls physical={physical} onChange={setPhysical} />}
          {physical && !beacon && !a.healEntered && !maxOn && amount.dice.length > 0 && (
            <label className="entry">
              <span>{times > 1 ? `Roll ${amount.dice.join(" + ")} ${times} times and type the one you keep` : `Roll ${amount.dice.join(" + ")} and type the dice total`}</span>
              <input inputMode="numeric" pattern="[0-9]*" value={entry} onChange={(e) => setEntry(e.target.value.replace(/\D/g, "").slice(0, 3))} />
            </label>
          )}
        </>
      )}
      {a.recoversSlots && slots && onSlots ? (
        <RecoverSlots a={a} slots={slots} none={!!none} onDone={(levels) => onSlots({ slots: levels })} />
      ) : a.slotHeal && slots && onSlots ? (
        <SlotHeal a={a} slots={slots} physical={physical} beacon={!!beaconIds?.includes("me")} onDone={(slot, rolled) => onSlots({ slot, rolled })} />
      ) : a.infoOnly ? null : a.spendAmount ? (
        <>
          <label className="entry">
            <span>
              {a.spendAmount.label} ({a.cost?.remaining ?? 0} left)
            </span>
            <input inputMode="numeric" pattern="[0-9]*" value={points} onChange={(e) => setPoints(e.target.value.replace(/\D/g, "").slice(0, 3))} />
          </label>
          {pickable && a.spendAmount.heals ? (
            <button className="big primary wide" disabled={!Number(points)} onClick={() => useWith(undefined, false, undefined, undefined, { amount: Number(points), healSelf: target === "me" })}>
              Heal {target === "me" ? "me" : targetName} {points || ""}
            </button>
          ) : (
          <div className="big-actions">
            {a.spendAmount.heals && (
              <button className="big primary" disabled={!Number(points)} onClick={() => useWith(undefined, false, undefined, undefined, { amount: Number(points), healSelf: true })}>
                Heal myself
              </button>
            )}
            <button className="big" disabled={!Number(points)} onClick={() => useWith(undefined, false, undefined, undefined, { amount: Number(points), healSelf: false })}>
              {a.spendAmount.heals ? "Someone else" : `Spend ${points || ""}`}
            </button>
          </div>
          )}
        </>
      ) : times > 1 && !physical && !faces ? (
        <button className="big wide primary" disabled={throwing} onClick={() => void rollTimes()}>
          {throwing ? "Throwing…" : `Roll ${amount?.dice[0] ?? ""} ${times} times`}
        </button>
      ) : times > 1 && !physical && faces && !a.choose ? (
        <div className="big-actions">
          {faces.map((f, i) => (
            <button key={i} className="big primary" onClick={() => useWith(f + (amount?.flat ?? 0))}>
              Keep {f}
            </button>
          ))}
        </div>
      ) : a.choose ? (
        <>
          <p className="sub-head">{a.choose.label}</p>
          <div className="choice-grid">
            {a.choose.options.map((o) => (
              <button
                key={o}
                className="big"
                disabled={throwing || (!!a.roll?.afterChoice && physical && !!amount && amount.dice.length > 0 && !entry)}
                onClick={() => (a.roll?.afterChoice ? void rollAfter(o) : useWith(undefined, false, undefined, o))}
              >
                {o}
              </button>
            ))}
          </div>
        </>
      ) : checks && checks.length > 0 ? (
        <>
          {checks.map((ch) => (
            <button key={ch.skill} className="big wide primary" style={{ marginBottom: 8 }} onClick={() => useWith(undefined, false, ch.skill)}>
              {a.name}: roll {ch.name}
              <span className="sub">
                {ch.bonus}
                {a.check?.dc ? `, DC ${a.check.dc}` : ""}
                {a.asAttack ? ", uses one attack" : ""}
              </span>
            </button>
          ))}
          <button className="link" onClick={() => useWith()}>
            Use it without rolling here
          </button>
        </>
      ) : (
      <button className={`big wide ${none ? "damage" : "primary"}${beacon ? " beacon" : ""}`} disabled={throwing || (!!a.healEntered && !Number(entry)) || (!!amount && physical && !beacon && !maxOn && amount.dice.length > 0 && !entry)} onClick={() => void useNow()}>
        {throwing ? "Throwing…" : none ? `Use ${a.name} anyway` : a.roll && !physical ? `Roll and use ${a.name}` : `Use ${a.name}`}
      </button>
      )}
      {onJustSpend && (
        <button className="big wide" style={{ marginTop: 8 }} disabled={throwing} onClick={onJustSpend}>
          {/* A use spent only when it works (Draconic Presence): the use isn't spent by using the feature. */}
          {a.cost ? "Use resource without effect" : "It worked: spend the use"}
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

/** Arcane Recovery, Natural Recovery: pick spent slots, their levels adding up to the budget (more is warned, not blocked). */
function RecoverSlots({ a, slots, none, onDone }: { a: ActionResult; slots: { level: number; total: number; used: number }[]; none: boolean; onDone: (levels: number[]) => void }) {
  const { budget, maxLevel, count } = a.recoversSlots!;
  const [pick, setPick] = useState<Record<number, number>>({});
  const spent = slots.filter((s) => s.used > 0);
  const levels = Object.entries(pick).flatMap(([l, n]) => Array.from({ length: n }, () => Number(l)));
  const sum = levels.reduce((x, l) => x + l, 0);
  const tooHigh = levels.some((l) => l > maxLevel);
  const tooMany = count !== undefined && levels.length > count;
  return (
    <>
      <p className="sub-head">
        {count === 1 ? `One slot to recover, up to level ${maxLevel}` : `Slots to recover: ${sum} of ${budget} levels`}
      </p>
      {spent.length === 0 && <p className="note">No spent spell slots.</p>}
      <div className="group">
        {spent.map((s) => {
          const n = pick[s.level] ?? 0;
          return (
            <div className="row" key={s.level}>
              <div className="row-main">
                <div className="row-title">Level {s.level}</div>
                <div className="row-sub">
                  {s.used} spent{s.level > maxLevel ? `, above level ${maxLevel}` : ""}
                </div>
              </div>
              <div className="stepper">
                <button className="key" aria-label={`One fewer level ${s.level}`} disabled={n === 0} onClick={() => setPick({ ...pick, [s.level]: n - 1 })}>
                  −
                </button>
                <span>{n}</span>
                <button className="key" aria-label={`One more level ${s.level}`} disabled={n >= s.used} onClick={() => setPick({ ...pick, [s.level]: n + 1 })}>
                  +
                </button>
              </div>
            </div>
          );
        })}
      </div>
      {(sum > budget || tooHigh || tooMany) && (
        <p className="over-banner">
          {tooMany ? `${a.name} brings back ${count === 1 ? "one slot" : `${count} slots`}. ` : sum > budget ? `That's more than ${budget} levels of slots. ` : ""}
          {tooHigh ? `${a.name} can't recover slots above level ${maxLevel}. ` : ""}
          You can still do it if your DM allows.
        </p>
      )}
      <button className={`big wide ${none || sum > budget || tooHigh ? "damage" : "primary"}`} disabled={!levels.length} onClick={() => onDone(levels)}>
        Recover {levels.length ? levels.map((l) => `level ${l}`).join(", ") : "slots"}
      </button>
    </>
  );
}

/** Combat Wild Shape: pick a slot; it heals its die once per slot level, rolled here or from your dice. */
function SlotHeal({ a, slots, physical: mine, beacon, onDone }: { a: ActionResult; slots: { level: number; total: number; used: number }[]; physical: boolean; beacon?: boolean; onDone: (slot: number, rolled: number) => void }) {
  const { die } = a.slotHeal!;
  const [physical, setPhysical] = useState(mine);
  const [level, setLevel] = useState<number | undefined>(slots.find((s) => s.total - s.used > 0)?.level);
  const [entry, setEntry] = useState("");
  const [busy, setBusy] = useState(false);
  const sides = Number(/d(\d+)/.exec(die)?.[1] ?? 8);
  const go = async () => {
    if (!level) return;
    // Beacon of Hope: the maximum.
    if (beacon && physical) return onDone(level, level * sides);
    if (physical) return onDone(level, Number(entry));
    setBusy(true);
    try {
      const faces = await facesOrRoll(level, sides, true, beacon ? { source: "Beacon of Hope", max: true } : { source: a.name, keys: [] });
      onDone(level, beacon ? level * sides : faces.reduce((x, f) => x + f, 0));
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <p className="sub-head">Which slot?</p>
      <div className="choice-grid">
        {slots
          .filter((s) => s.total > 0)
          .map((s) => (
            <button key={s.level} className={`big${level === s.level ? " primary" : ""}${s.total - s.used <= 0 ? " damage" : ""}`} onClick={() => setLevel(s.level)}>
              Level {s.level}
              <span className="sub">
                {s.total - s.used} left, {s.level}
                {die.replace(/^1/, "")}
              </span>
            </button>
          ))}
      </div>
      {beacon && <p className="note beacon-text">Beacon of Hope: the maximum, {level ? level * sides : 0}.</p>}
      {level && !beacon && <WhoRolls physical={physical} onChange={setPhysical} />}
      {level && physical && !beacon && (
        <label className="entry">
          <span>
            Roll {level}d{sides} and type the total
          </span>
          <input inputMode="numeric" pattern="[0-9]*" value={entry} onChange={(e) => setEntry(e.target.value.replace(/\D/g, "").slice(0, 3))} />
        </label>
      )}
      <button className="big wide primary" disabled={!level || busy || (physical && !beacon && !entry)} onClick={() => void go()}>
        {busy ? "Throwing…" : level ? `Spend a level ${level} slot and heal ${level}d${sides}` : "No slots"}
      </button>
    </>
  );
}
