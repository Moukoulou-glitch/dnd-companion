import { NumberStep } from "./Adjust";
import { ChangesEditor, changeValid, changesToModifiers, describeChanges, emptyChange, type ChangeDraft } from "./ChangesEditor";
import { RichText } from "./Conditions";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { facesOrRoll } from "../dice/quick";
import { skipThrow } from "../diceBox";
import type { ContentRegistry, EffectResult } from "@dnd/engine";
import { ABILITY_NAMES, type Ability, type EffectDef, type Modifier, type OperationType } from "@dnd/schema";
import { formatMinutes } from "../time";

type Act = (type: OperationType, payload: unknown, label: string) => void;

export function effectChipLabel(e: EffectResult, hideTime = false): string {
  let s = e.name;
  if (e.level !== undefined) s += ` ${e.level}`;
  if (e.counter) s += e.counter.strike ? ` (${e.counter.left} left)` : ` ×${e.counter.left}`;
  if (e.choice?.value) s += `: ${ABILITY_NAMES[e.choice.value as Ability] ? optionName(e.choice.value).slice(0, 3) : e.choice.value}`;
  if (e.upcast && e.upcast.castLevel > e.upcast.baseLevel) s += ` (lvl ${e.upcast.castLevel})`;
  if (hideTime) return s;
  if (e.rounds !== undefined) s += ` (${e.rounds})`;
  else if (e.minutes !== undefined) s += ` (${formatMinutes(e.minutes)})`;
  else if (e.untilRest) s += e.untilRest === "short" ? " (until rest)" : " (until long rest)";
  return s;
}

const optionName = (o: string) => ABILITY_NAMES[o as Ability] ?? o;

/** Active effects in the status strip; tap one for details, or + to add. */
export function EffectChips({
  effects,
  onOpen,
  onAdd,
  concentration,
  onConcentration,
  onCondition,
}: {
  effects: EffectResult[];
  onOpen: (e: EffectResult) => void;
  onCondition: (id: string) => void;
  onAdd: () => void;
  concentration?: { name: string; rounds?: number | undefined; minutes?: number | undefined } | undefined;
  onConcentration: () => void;
}) {
  return (
    <div className="switches effects" role="group" aria-label="Conditions and effects">
      {concentration && (
        <button className="chip conc" onClick={onConcentration} aria-label={`Concentrating on ${concentration.name}. Details`}>
          ◎ {concentration.name}
          {concentration.rounds !== undefined ? ` (${concentration.rounds})` : concentration.minutes !== undefined ? ` (${formatMinutes(concentration.minutes)})` : ""}
        </button>
      )}
      <button className="chip add" onClick={onAdd} aria-label="Add a condition or effect">
        + Effect
      </button>
      {effects.map((e) => (
        <button
          key={e.instanceId}
          className={`chip ${e.category}`}
          onClick={() => onOpen(e)}
          aria-label={`${e.name}${e.level ? ` level ${e.level}` : ""}${e.rounds !== undefined ? `, ${e.rounds} rounds left` : ""}. Details`}
        >
          {/* The concentration chip already shows the time of a spell you're concentrating on. */}
          {effectChipLabel(e, e.concentration && concentration?.name === e.name)}
        </button>
      ))}
      {[...new Map(effects.flatMap((e) => e.includes).filter((x) => !effects.some((e) => e.id === x.id)).map((x) => [x.id, x])).values()].map((x) => (
        <button key={x.id} className="chip condition" onClick={() => onCondition(x.id)} aria-label={`${x.name}, from another effect. Details`}>
          {x.name}
        </button>
      ))}
    </div>
  );
}

/** One active effect: what it does, what to remember, its rounds or level, and Remove. */
export function EffectPanel({ e, act, close, onRelease }: { e: EffectResult; act: Act; close: () => void; onRelease?: () => void }) {
  return (
    <>
      {e.from && <p className="row-sub">From {e.from}</p>}
      {onRelease && (
        <>
          <p className="note">
            {e.release?.spell
              ? "When the trigger happens, release the spell with your reaction. If your concentration breaks first, or your next turn starts, it's lost."
              : "When the trigger happens, take it with your reaction, or let it go. It ends when your next turn starts."}
          </p>
          <button className="big primary wide" style={{ marginBottom: 10 }} onClick={onRelease}>
            {e.release?.spell ? "Release it now (reaction)" : "The trigger happened: do it (reaction)"}
          </button>
        </>
      )}
      {e.untilRest && <p className="note">Ends at your next {e.untilRest === "short" ? "rest (short or long)" : "long rest"}.</p>}
      {e.summary && (
        <p>
          <RichText text={e.summary} />
        </p>
      )}
      {e.changes && e.changes.length > 0 && (
        <ul className="plain-list">
          {describeChanges(e.changes).map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      )}
      {e.includes.length > 0 && (
        <p className="note">
          Brings with it: <RichText text={e.includes.map((x) => x.name).join(", ")} />
        </p>
      )}
      {e.levelNotes && (
        <>
          <p className="sub-head">Levels</p>
          <ol className="levels">
            {e.levelNotes.map((n, i) => (
              <li key={n} data-on={(e.level ?? 0) > i}>
                <RichText text={n} />
              </li>
            ))}
          </ol>
        </>
      )}
      {e.reminders.length > 0 && (
        <>
          <p className="sub-head">Remember</p>
          <ul className="reminders">
            {e.reminders.map((r) => (
              <li key={r}>
                <RichText text={r} />
              </li>
            ))}
          </ul>
        </>
      )}
      {e.concentration && <p className="note">Needs the caster's concentration. Remove it if they lose concentration.</p>}
      {e.counter && <CounterSection e={e} counter={e.counter} act={act} close={close} />}
      {e.choice && (
        <>
          <p className="sub-head">{e.choice.label}{e.choice.value ? "" : ": choose one"}</p>
          <div className="choice-grid">
            {e.choice.options.map((o) => (
              <button
                key={o}
                className="tag"
                aria-pressed={e.choice!.value === o}
                onClick={() => act("updateEffect", { instanceId: e.instanceId, choice: o }, `${e.name}: ${optionName(o)}.`)}
              >
                {optionName(o)}
              </button>
            ))}
          </div>
        </>
      )}
      <div className="group" style={{ marginTop: 12 }}>
        {e.upcast && (
          <div className="row">
            <div className="row-main">
              <div className="row-title">Cast at level</div>
              <div className="row-sub">Set the slot level it was cast with</div>
            </div>
            <div className="stepper">
              <button
                aria-label="Lower slot level"
                disabled={e.upcast.castLevel <= e.upcast.baseLevel}
                onClick={() => act("updateEffect", { instanceId: e.instanceId, castLevel: e.upcast!.castLevel - 1 }, `${e.name}: level ${e.upcast!.castLevel - 1}.`)}
              >
                −
              </button>
              <span>{e.upcast.castLevel}</span>
              <button
                aria-label="Raise slot level"
                disabled={e.upcast.castLevel >= 9}
                onClick={() => act("updateEffect", { instanceId: e.instanceId, castLevel: e.upcast!.castLevel + 1 }, `${e.name}: level ${e.upcast!.castLevel + 1}.`)}
              >
                +
              </button>
            </div>
          </div>
        )}
        {e.minutes !== undefined && (
          <div className="row">
            <div className="row-main">
              <div className="row-title">Time left</div>
              <div className="row-sub">Rests and "Time passes" count it down</div>
            </div>
            <div className="stepper">
              <button
                aria-label="Less time"
                onClick={() => {
                  const step = e.minutes! > 60 ? 60 : 10;
                  const next = e.minutes! - step;
                  if (next <= 0) {
                    act("removeEffect", { instanceId: e.instanceId }, `${e.name} ended.`);
                    close();
                  } else act("updateEffect", { instanceId: e.instanceId, minutes: next }, `${e.name}: ${formatMinutes(next)}.`);
                }}
              >
                −
              </button>
              <span style={{ minWidth: "4.5em" }}>{formatMinutes(e.minutes)}</span>
              <button
                aria-label="More time"
                onClick={() => {
                  const next = e.minutes! + (e.minutes! >= 60 ? 60 : 10);
                  act("updateEffect", { instanceId: e.instanceId, minutes: next }, `${e.name}: ${formatMinutes(next)}.`);
                }}
              >
                +
              </button>
            </div>
          </div>
        )}
        {e.level !== undefined && (
          <div className="row">
            <div className="row-main row-title">Level</div>
            <div className="stepper">
              <button
                aria-label="Lower level"
                onClick={() =>
                  e.level! <= 1
                    ? (act("removeEffect", { instanceId: e.instanceId }, `${e.name} removed.`), close())
                    : act("updateEffect", { instanceId: e.instanceId, level: e.level! - 1 }, `${e.name} ${e.level! - 1}.`)
                }
              >
                −
              </button>
              <span>{e.level}</span>
              <button
                aria-label="Raise level"
                disabled={e.level >= (e.maxLevel ?? 6)}
                onClick={() => act("updateEffect", { instanceId: e.instanceId, level: e.level! + 1 }, `${e.name} ${e.level! + 1}.`)}
              >
                +
              </button>
            </div>
          </div>
        )}
        {e.untilTurnStart && (
          <div className="row">
            <div className="row-main">
              <div className="row-title">One round</div>
              <div className="row-sub">It ends when your next turn starts.</div>
            </div>
          </div>
        )}
        {e.minutes === undefined && !e.untilTurnStart && !e.untilRest && (
        <div className="row">
          <div className="row-main">
            <div className="row-title">Rounds left</div>
            <div className="row-sub">{e.rounds === undefined ? "Until removed" : "Counts down at the end of your turn"}</div>
          </div>
          <div className="stepper">
            <button
              aria-label="One round less"
              disabled={e.rounds === undefined || e.rounds <= 1}
              onClick={() => act("updateEffect", { instanceId: e.instanceId, rounds: (e.rounds ?? 2) - 1 }, `${e.name}: ${(e.rounds ?? 2) - 1} rounds.`)}
            >
              −
            </button>
            <span>{e.rounds ?? "∞"}</span>
            <button
              aria-label="One round more"
              onClick={() => act("updateEffect", { instanceId: e.instanceId, rounds: (e.rounds ?? 0) + 1 }, `${e.name}: ${(e.rounds ?? 0) + 1} rounds.`)}
            >
              +
            </button>
          </div>
        </div>
        )}
      </div>
      {e.rounds !== undefined && !e.untilTurnStart && (
        <button className="link" onClick={() => act("updateEffect", { instanceId: e.instanceId, rounds: null }, `${e.name} lasts until removed.`)}>
          Keep it until I remove it
        </button>
      )}
      <button
        className="big damage wide"
        style={{ marginTop: 12 }}
        onClick={() => {
          act("removeEffect", { instanceId: e.instanceId }, `${e.name} removed.`);
          close();
        }}
      >
        Remove {e.name}
      </button>
    </>
  );
}

type Duration = "removed" | "rounds" | "minutes" | "hours" | "short" | "long";

/**
 * A custom effect for DM rulings and anything not in the pack: one or more
 * changes the sheet applies, how long it lasts (rounds, minutes, hours, until a
 * short or long rest, or until removed), and the player's own description.
 */
function CustomBuilder({ act, close }: { act: Act; close: () => void }) {
  const [name, setName] = useState("");
  const [changes, setChanges] = useState<ChangeDraft[]>([emptyChange()]);
  const [text, setText] = useState("");
  const [duration, setDuration] = useState<Duration>("removed");
  const [amount, setAmount] = useState("");
  const mods = changesToModifiers(changes, name.trim() || "Custom");
  const needsAmount = duration === "rounds" || duration === "minutes" || duration === "hours";
  // Something to apply or something to say, and every row either complete or empty-valued.
  const ready = !!name.trim() && (mods.length > 0 || !!text.trim()) && changes.every((d) => changeValid(d) || (d.kind === "bonus" && !d.value)) && (!needsAmount || Number(amount) > 0);

  const create = () => {
    const payload: Record<string, unknown> = { instanceId: crypto.randomUUID(), effect: "custom", custom: { name: name.trim(), modifiers: mods, ...(text.trim() ? { text: text.trim() } : {}) } };
    const n = Number(amount);
    if (duration === "rounds") payload.rounds = n;
    if (duration === "minutes") payload.minutes = n;
    if (duration === "hours") payload.minutes = n * 60;
    if (duration === "short" || duration === "long") payload.untilRest = duration;
    act("addEffect", payload, `${name.trim()} added.`);
    close();
  };

  return (
    <>
      <input className="search" placeholder="Name, e.g. High ground" value={name} onChange={(e) => setName(e.target.value)} aria-label="Effect name" />
      <p className="sub-head">Changes</p>
      <ChangesEditor value={changes} onChange={setChanges} />
      <p className="sub-head">How long</p>
      <div className="types wrap" role="radiogroup" aria-label="How long">
        {([
          ["removed", "Until removed"],
          ["rounds", "Rounds"],
          ["minutes", "Minutes"],
          ["hours", "Hours"],
          ["short", "Until a short rest"],
          ["long", "Until a long rest"],
        ] as const).map(([k, l]) => (
          <button key={k} className="switch" role="radio" aria-checked={duration === k} aria-pressed={duration === k} onClick={() => setDuration(k)}>
            {l}
          </button>
        ))}
      </div>
      {needsAmount && (
        <input className="search" inputMode="numeric" placeholder={`How many ${duration}`} value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ""))} aria-label={`How many ${duration}`} />
      )}
      <p className="note">“Until a short rest” ends at any rest; “until a long rest” only at a long one.</p>
      <p className="sub-head">Description (optional)</p>
      <textarea className="story-text" rows={3} maxLength={2000} value={text} onChange={(e) => setText(e.target.value)} placeholder="In your words: shown on its card, not applied by the sheet" aria-label="Description" />
      <button className="big primary wide" disabled={!ready} onClick={create}>
        Add effect
      </button>
    </>
  );
}

/** Pick a condition or spell from the pack, or build a custom effect. */
export function AddEffectPanel({
  registry,
  act,
  close,
  onTransform,
  onPick,
  already = [],
}: {
  registry: ContentRegistry;
  act: Act;
  close: () => void;
  onTransform?: (d: EffectDef) => void;
  /** Put the effect on someone else (a summoned creature) instead of you; a spell that grows with its level (Aid) asks the level. */
  onPick?: (d: EffectDef, choice?: string, slotLevel?: number) => void;
  /** Effects already on that creature: a spell can't go on it twice (its effects don't add up). */
  already?: string[];
}) {
  const [tab, setTab] = useState<"condition" | "spell" | "other" | "custom">("condition");
  const [q, setQ] = useState("");
  /** An effect with a choice (Bardic Inspiration's die, Hexed's ability) asks for it before it's added. */
  const [picking, setPicking] = useState<string | null>(null);
  const add = (d: EffectDef, choice?: string, slotLevel?: number) => {
    // Polymorph, True Polymorph: which creature? The effect goes on with the form.
    if (onPick) return onPick(d, choice, slotLevel);
    if (d.transform && onTransform) return onTransform(d);
    act("addEffect", { instanceId: crypto.randomUUID(), effect: d.id, ...(choice ? { choice } : {}) }, `${d.name}${choice ? ` (${optionName(choice)})` : ""} added.`);
    close();
  };
  // Effects someone or something else puts on you; caster-only ones (Hex, Hunter's Mark) come from casting.
  const all = useMemo(() => registry.list("effect").filter((d) => !d.selfOnly && !(onPick && d.transform)), [registry, onPick]);
  const list = all.filter((d: EffectDef) => d.category === tab && d.name.toLowerCase().includes(q.trim().toLowerCase()));

  return (
    <>
      <div className="segmented small" role="tablist">
        {(
          [
            ["condition", "Conditions"],
            ["spell", "Spells"],
            ["other", "Other"],
            ["custom", "Custom"],
          ] as const
        ).filter(([id]) => !onPick || id !== "custom").map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} aria-checked={tab === id} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>
      {tab === "custom" ? (
        <CustomBuilder act={act} close={close} />
      ) : (
        <>
          {tab === "spell" && <input className="search" type="search" placeholder="Search spells" value={q} onChange={(e) => setQ(e.target.value)} />}
          <div className="group">
            {list.map((d) => {
              // The same spell twice on one creature: the second doesn't add anything, so it isn't offered.
              const on = d.category === "spell" && already.includes(d.id);
              // A spell that grows with its level, put on someone else: at which level (Aid at 3rd: +10).
              const levels = onPick && d.upcast ? Array.from({ length: 10 - d.upcast.baseLevel }, (_, i) => d.upcast!.baseLevel + i) : undefined;
              return (
              <Fragment key={d.id}>
                <button className="row" disabled={on} aria-disabled={on} onClick={() => (on ? undefined : d.choice || levels ? setPicking(picking === d.id ? null : d.id) : add(d))}>
                  <div className="row-main">
                    <div className="row-title">{d.name}</div>
                    {on ? <div className="row-sub">Already on it: the same spell doesn't add up. Change or end the one it has.</div> : d.summary && <div className="row-sub">{d.summary}</div>}
                  </div>
                  {on ? <span className="tag">On</span> : d.rounds && <span className="tag">{d.rounds} rounds</span>}
                </button>
                {levels && !d.choice && picking === d.id && (
                  <div className="pick-inline">
                    <p className="sub-head">Cast at level</p>
                    <div className="choice-grid">
                      {levels.map((l) => (
                        <button key={l} className="big" onClick={() => add(d, undefined, l)}>
                          {l}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {d.choice && picking === d.id && (
                  <div className="pick-inline">
                    <p className="sub-head">{d.choice.label}</p>
                    <div className="choice-grid">
                      {d.choice.options.map((o) => (
                        <button key={o} className="big" onClick={() => add(d, o)}>
                          {optionName(o)}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </Fragment>
              );
            })}
          </div>
        </>
      )}
    </>
  );
}

/**
 * What an effect counts (Mirror Image's duplicates): how many are left, the
 * d20 to roll when you're attacked, and − / + to count them by hand.
 */
function CounterSection({ e, counter, act, close }: { e: EffectResult; counter: NonNullable<EffectResult["counter"]>; act: Act; close: () => void }) {
  const [d20, setD20] = useState<number | null>(null);
  const [throwing, setThrowing] = useState(false);
  const alive = useRef(true);
  const inAir = useRef(false);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      if (inAir.current) skipThrow();
    };
  }, []);
  const word = counter.label.toLowerCase();
  const one = word.replace(/s$/, "");
  const set = (n: number) => {
    setD20(null);
    act("updateEffect", { instanceId: e.instanceId, count: n }, n < counter.left ? `${e.name}: a ${one} destroyed, ${n} left.` : `${e.name}: ${n} ${word}.`);
    if (n === 0 && counter.endsAtZero) close();
  };
  const roll = async () => {
    setD20(null);
    setThrowing(true);
    inAir.current = true;
    try {
      const [v] = await facesOrRoll(1, 20, true, { source: e.name });
      if (alive.current && v) setD20(v);
    } finally {
      inAir.current = false;
      if (alive.current) setThrowing(false);
    }
  };
  const hitsDuplicate = d20 !== null && counter.need !== undefined && d20 >= counter.need;
  // Guardian of Faith: each strike takes the damage dealt off what's left (half on a save).
  const strike = counter.strike;
  if (strike) {
    const deal = (n: number, saved: boolean) => {
      const dealt = Math.min(counter.left, n);
      const left = counter.left - dealt;
      act("updateEffect", { instanceId: e.instanceId, count: left }, `${e.name}: ${dealt} ${strike.type} damage${saved ? " (saved)" : ""}, ${left} left.`);
      if (left === 0 && counter.endsAtZero) close();
    };
    const half = Math.floor(strike.amount / 2);
    return (
      <div className="counter-box">
        <div className="row">
          <div className="row-main">
            <div className="row-title">{counter.label}</div>
            <div className="row-sub">
              {strike.amount} {strike.type} damage, {ABILITY_NAMES[strike.save as keyof typeof ABILITY_NAMES] ?? strike.save} save{strike.dc ? ` DC ${strike.dc}` : ""} for half. It vanishes at {counter.start} dealt.
            </div>
          </div>
          <span className="counter-left">{counter.left}</span>
        </div>
        <div className="meter" aria-hidden="true">
          <span style={{ width: `${(counter.left / counter.start) * 100}%` }} />
        </div>
        <div className="big-actions">
          <button className="big primary" disabled={counter.left <= 0} onClick={() => deal(strike.amount, false)}>
            Failed the save: {Math.min(strike.amount, counter.left)}
          </button>
          <button className="big" disabled={counter.left <= 0} onClick={() => deal(half, true)}>
            Saved: {Math.min(half, counter.left)}
          </button>
        </div>
        <NumberStep value={counter.left} min={0} max={counter.start} label={`${counter.label}, by hand`} onChange={(n) => set(n)} />
      </div>
    );
  }
  return (
    <div className="counter-box">
      <div className="row">
        <div className="row-main">
          <div className="row-title">{counter.label} left</div>
          {counter.need !== undefined && counter.left > 0 && (
            <div className="row-sub">
              Attacked? Roll a d20: {counter.need} or higher and the attack targets a {one} instead{counter.ac !== undefined ? ` (AC ${counter.ac})` : ""}.
            </div>
          )}
        </div>
        <div className="stepper">
          <button aria-label={`One ${one} fewer`} disabled={counter.left <= 0} onClick={() => set(counter.left - 1)}>
            −
          </button>
          <span className="counter-left">{counter.left}</span>
          <button aria-label={`One ${one} more`} disabled={counter.left >= counter.start} onClick={() => set(counter.left + 1)}>
            +
          </button>
        </div>
      </div>
      <div className="pips" aria-hidden="true">
        {Array.from({ length: counter.start }, (_, i) => (
          <span key={i} className={i < counter.left ? "pip on" : "pip"} />
        ))}
      </div>
      {counter.need !== undefined && counter.left > 0 && (
        <>
          {d20 !== null && (
            <p className={`counter-roll ${hitsDuplicate ? "yes" : "no"}`} role="status">
              <strong>{d20}</strong>{" "}
              {hitsDuplicate
                ? `— the attack targets a ${one}${counter.ac !== undefined ? ` (AC ${counter.ac})` : ""}. If it hits, the ${one} is destroyed.`
                : `— under ${counter.need}: the attack targets you as normal.`}
            </p>
          )}
          <div className="big-actions">
            <button className="big" disabled={throwing} onClick={() => void roll()}>
              {throwing ? "Rolling…" : d20 === null ? "I'm attacked: roll d20" : "Roll again"}
            </button>
            {hitsDuplicate && (
              <button className="big primary" onClick={() => set(counter.left - 1)}>
                It hit: destroy a {one}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
