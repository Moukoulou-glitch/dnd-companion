import { RichText } from "./Conditions";
import { useMemo, useState } from "react";
import type { ContentRegistry, EffectResult } from "@dnd/engine";
import { ABILITY_NAMES, type Ability, type EffectDef, type Modifier, type OperationType } from "@dnd/schema";
import { formatMinutes } from "../time";

type Act = (type: OperationType, payload: unknown, label: string) => void;

export function effectChipLabel(e: EffectResult, hideTime = false): string {
  let s = e.name;
  if (e.level !== undefined) s += ` ${e.level}`;
  if (e.choice?.value) s += `: ${optionName(e.choice.value).slice(0, 3)}`;
  if (e.upcast && e.upcast.castLevel > e.upcast.baseLevel) s += ` (lvl ${e.upcast.castLevel})`;
  if (hideTime) return s;
  if (e.rounds !== undefined) s += ` (${e.rounds})`;
  else if (e.minutes !== undefined) s += ` (${formatMinutes(e.minutes)})`;
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
export function EffectPanel({ e, act, close }: { e: EffectResult; act: Act; close: () => void }) {
  return (
    <>
      {e.from && <p className="row-sub">From {e.from}</p>}
      {e.summary && (
        <p>
          <RichText text={e.summary} />
        </p>
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
        {e.minutes === undefined && (
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
      {e.rounds !== undefined && (
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

const TARGETS = [
  { id: "attack", label: "Attack rolls", selector: "roll.attack.*" },
  { id: "save", label: "Saving throws", selector: "roll.save.*" },
  { id: "check", label: "Ability checks", selector: "roll.check.*" },
  { id: "damage", label: "Damage", selector: "roll.damage.*" },
  { id: "ac", label: "Armor Class", selector: "stat.ac" },
  { id: "speed", label: "Speed", selector: "stat.speed.walk" },
] as const;

/** A quick effect for DM rulings and anything not in the pack: one target, one change. */
function CustomBuilder({ act, close }: { act: Act; close: () => void }) {
  const [name, setName] = useState("");
  const [target, setTarget] = useState<(typeof TARGETS)[number]["id"]>("attack");
  const [kind, setKind] = useState<"bonus" | "advantage" | "disadvantage">("bonus");
  const [value, setValue] = useState("");
  const [rounds, setRounds] = useState("");
  const t = TARGETS.find((x) => x.id === target)!;
  const isStat = t.selector.startsWith("stat.");
  const validValue = /^-?\d+$/.test(value) || (!isStat && /^-?\d*d\d+$/.test(value));
  const ready = name.trim() && (kind !== "bonus" || validValue);

  const create = () => {
    const mod: Modifier =
      kind === "bonus"
        ? { selector: t.selector, op: "add", value: /^-?\d+$/.test(value) ? Number(value) : value, mode: "auto" }
        : { selector: t.selector, op: kind, mode: "auto" };
    const payload: Record<string, unknown> = { instanceId: crypto.randomUUID(), effect: "custom", custom: { name: name.trim(), modifiers: [mod] } };
    if (Number(rounds) > 0) payload.rounds = Number(rounds);
    act("addEffect", payload, `${name.trim()} added.`);
    close();
  };

  return (
    <>
      <input className="search" placeholder="Name, e.g. High ground" value={name} onChange={(e) => setName(e.target.value)} />
      <p className="sub-head">Changes</p>
      <div className="choice-grid">
        {TARGETS.map((x) => (
          <button key={x.id} className="switch" aria-pressed={target === x.id} onClick={() => { setTarget(x.id); if (x.id === "ac" || x.id === "speed" || x.id === "damage") setKind("bonus"); }}>
            {x.label}
          </button>
        ))}
      </div>
      {!isStat && t.id !== "damage" && (
        <div className="segmented" role="radiogroup" aria-label="Kind" style={{ marginTop: 10 }}>
          {(["bonus", "advantage", "disadvantage"] as const).map((k) => (
            <button key={k} role="radio" aria-checked={kind === k} onClick={() => setKind(k)}>
              {k === "bonus" ? "Bonus" : k === "advantage" ? "Adv" : "Disadv"}
            </button>
          ))}
        </div>
      )}
      {kind === "bonus" && (
        <input
          className="search"
          style={{ marginTop: 10 }}
          placeholder={isStat ? "Amount, e.g. 2 or -10" : "Amount, e.g. 2, -1 or 1d4"}
          value={value}
          onChange={(e) => setValue(e.target.value.replace(/\s/g, "").toLowerCase())}
        />
      )}
      <input className="search" inputMode="numeric" placeholder="Rounds (leave empty: until removed)" value={rounds} onChange={(e) => setRounds(e.target.value.replace(/\D/g, ""))} />
      <button className="big primary wide" disabled={!ready} onClick={create}>
        Add effect
      </button>
    </>
  );
}

/** Pick a condition or spell from the pack, or build a custom effect. */
export function AddEffectPanel({ registry, act, close }: { registry: ContentRegistry; act: Act; close: () => void }) {
  const [tab, setTab] = useState<"condition" | "spell" | "other" | "custom">("condition");
  const [q, setQ] = useState("");
  // Effects someone or something else puts on you; caster-only ones (Hex, Hunter's Mark) come from casting.
  const all = useMemo(() => registry.list("effect").filter((d) => !d.selfOnly), [registry]);
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
        ).map(([id, label]) => (
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
            {list.map((d) => (
              <button
                className="row"
                key={d.id}
                onClick={() => {
                  act("addEffect", { instanceId: crypto.randomUUID(), effect: d.id }, `${d.name} added.`);
                  close();
                }}
              >
                <div className="row-main">
                  <div className="row-title">{d.name}</div>
                  {d.summary && <div className="row-sub">{d.summary}</div>}
                </div>
                {d.rounds && <span className="tag">{d.rounds} rounds</span>}
              </button>
            ))}
          </div>
        </>
      )}
    </>
  );
}
