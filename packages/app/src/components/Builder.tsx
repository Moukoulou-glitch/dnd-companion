import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { roll } from "@dnd/dice";
import {
  POINT_BUY_BUDGET,
  POINT_BUY_COST,
  STANDARD_ARRAY,
  buildItems,
  choiceOptions,
  classSpellOptions,
  levelGains,
  multiclassIssues,
  signed,
  copyCost,
  derive,
  itemsForTag,
  type BuildItem,
  type ContentRegistry,
  type DerivedSheet,
} from "@dnd/engine";
import { ABILITIES, ABILITY_NAMES, SKILL_NAMES, type Ability, type Character, type ExtraNote, type OperationType, type Skill } from "@dnd/schema";
import { RichText } from "./Conditions";
import { ExtraBox, ExtraNoteForm, KIND_NAMES } from "./Extras";
import { shortText } from "../text";

type Act = (type: OperationType, payload: unknown, label: string) => void;
type Panel = (title: string, body: ReactNode | (() => ReactNode)) => void;

export const ALIGNMENTS: [string, string][] = [
  ["LG", "Lawful good"],
  ["NG", "Neutral good"],
  ["CG", "Chaotic good"],
  ["LN", "Lawful neutral"],
  ["N", "Neutral"],
  ["CN", "Chaotic neutral"],
  ["LE", "Lawful evil"],
  ["NE", "Neutral evil"],
  ["CE", "Chaotic evil"],
];

const bonusText = (b: Partial<Record<Ability, number>> | undefined) =>
  Object.entries(b ?? {})
    .map(([a, n]) => `${ABILITY_NAMES[a as Ability].slice(0, 3)} ${signed(n)}`)
    .join(", ");

/** One step's list of things to pick from, as rows. */
function PickList<T extends { id: string; name: string }>({
  items,
  selected,
  onPick,
  sub,
  group,
}: {
  items: T[];
  selected?: string | undefined;
  onPick: (item: T) => void;
  sub?: (item: T) => ReactNode;
  group?: (item: T) => string | undefined;
}) {
  let last: string | undefined;
  return (
    <div className="group">
      {items.map((it) => {
        const g = group?.(it);
        const head = g && g !== last ? <div className="pick-group">{g}</div> : null;
        last = g ?? last;
        return (
          <div key={it.id}>
            {head}
            <button className="row" aria-current={selected === it.id} onClick={() => onPick(it)}>
              <div className="row-main">
                <div className="row-title">{it.name}</div>
                {sub && <div className="row-sub">{sub(it)}</div>}
              </div>
              {selected === it.id && <span className="tag adv">chosen</span>}
            </button>
          </div>
        );
      })}
    </div>
  );
}

/** Ability scores: standard array, point buy, rolled, or typed in. */
function AbilityStep({ scores, setScores, raceBonus }: { scores: Record<Ability, number>; setScores: (s: Record<Ability, number>) => void; raceBonus: Partial<Record<Ability, number>> }) {
  const [method, setMethod] = useState<"array" | "points" | "roll" | "manual">("array");
  const [pool, setPool] = useState<number[]>(STANDARD_ARRAY);
  const spent = ABILITIES.reduce((n, a) => n + (POINT_BUY_COST[scores[a]] ?? 99), 0);

  const switchTo = (m: typeof method) => {
    setMethod(m);
    if (m === "array") {
      setPool(STANDARD_ARRAY);
      setScores({ str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8 });
    }
    if (m === "points") setScores({ str: 8, dex: 8, con: 8, int: 8, wis: 8, cha: 8 });
    if (m === "roll") rollAll();
  };
  const rollAll = () => {
    const rolled = Array.from({ length: 6 }, () => roll("4d6kh3").total).sort((a, b) => b - a);
    setPool(rolled);
    setScores(Object.fromEntries(ABILITIES.map((a, i) => [a, rolled[i]!])) as Record<Ability, number>);
  };
  /** Assigning from a pool swaps two abilities' values, so every value is used once. */
  const assign = (a: Ability, value: number) => {
    const other = ABILITIES.find((x) => x !== a && scores[x] === value);
    setScores({ ...scores, [a]: value, ...(other ? { [other]: scores[a] } : {}) });
  };
  const step = (a: Ability, d: number) => {
    const v = scores[a] + d;
    if (method === "points" && (v < 8 || v > 15)) return;
    if (v < 3 || v > 20) return;
    setScores({ ...scores, [a]: v });
  };

  return (
    <>
      <div className="segmented small" role="tablist">
        {(
          [
            ["array", "Standard"],
            ["points", "Point buy"],
            ["roll", "Roll"],
            ["manual", "Type in"],
          ] as const
        ).map(([id, label]) => (
          <button key={id} role="tab" aria-selected={method === id} onClick={() => switchTo(id)}>
            {label}
          </button>
        ))}
      </div>
      {method === "points" && (
        <p className={`note${spent > POINT_BUY_BUDGET ? " danger-text" : ""}`}>
          {POINT_BUY_BUDGET - spent} of {POINT_BUY_BUDGET} points left. Scores from 8 to 15.
        </p>
      )}
      {method === "array" && <p className="note">15, 14, 13, 12, 10, 8: pick which goes where.</p>}
      {method === "roll" && (
        <p className="note">
          4d6, dropping the lowest, six times: {pool.join(", ")}.{" "}
          <button className="link" onClick={rollAll}>
            Roll again
          </button>
        </p>
      )}
      <div className="group">
        {ABILITIES.map((a) => {
          const bonus = raceBonus[a] ?? 0;
          return (
            <div className="row" key={a}>
              <div className="row-main">
                <div className="row-title">{ABILITY_NAMES[a]}</div>
                <div className="row-sub">
                  {bonus ? `${scores[a]} ${signed(bonus)} from your race = ${scores[a] + bonus}` : `Score ${scores[a]}`}, modifier {signed(Math.floor((scores[a] + bonus - 10) / 2))}
                </div>
              </div>
              {method === "array" || method === "roll" ? (
                <select className="score-select" value={scores[a]} onChange={(e) => assign(a, Number(e.target.value))} aria-label={`${ABILITY_NAMES[a]} score`}>
                  {[...new Set(pool)].map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="stepper">
                  <button aria-label={`Lower ${ABILITY_NAMES[a]}`} onClick={() => step(a, -1)}>
                    −
                  </button>
                  <span>{scores[a]}</span>
                  <button aria-label={`Raise ${ABILITY_NAMES[a]}`} onClick={() => step(a, 1)}>
                    +
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}

export interface NewCharacterInput {
  name: string;
  player?: string;
  alignment?: string;
  race: string;
  class: string;
  background?: string;
  abilities: Record<Ability, number>;
  equipment?: { item: string; quantity: number }[];
  gear?: string[];
  gold?: number;
}

/** What the equipment step decided. */
interface KitState {
  mode: "kit" | "gold";
  /** Per class option: which choice ((a), (b)...). */
  choice: number[];
  /** "Any martial weapon" picks, keyed "option.pick.n". */
  picked: Record<string, string>;
  gold?: number;
}

/** The equipment, gear and gold the step adds up to. */
function kitResult(reg: ContentRegistry, cls: string | undefined, background: string | undefined, k: KitState): Pick<NewCharacterInput, "equipment" | "gear" | "gold"> {
  if (k.mode === "gold") return k.gold ? { gold: k.gold } : {};
  const se = cls ? reg.find(cls, "class")?.startingEquipment : undefined;
  const bg = background ? reg.find(background, "background")?.equipment : undefined;
  const equipment = [...(se?.fixed ?? []), ...(bg?.fixed ?? [])].map((x) => ({ item: x.item, quantity: x.quantity }));
  (se?.options ?? []).forEach((o, oi) => {
    const ch = o.choices[k.choice[oi] ?? 0] ?? o.choices[0]!;
    equipment.push(...ch.items.map((x) => ({ item: x.item, quantity: x.quantity })));
    ch.picks.forEach((p, pi) => {
      for (let n = 0; n < p.count; n++) {
        const id = k.picked[`${oi}.${pi}.${n}`];
        if (id) equipment.push({ item: id, quantity: 1 });
      }
    });
  });
  const gold = Number(bg?.gold ?? 0) || 0;
  return { equipment, ...(bg?.other?.length ? { gear: bg.other } : {}), ...(gold ? { gold } : {}) };
}

const itemLabel = (reg: ContentRegistry, x: { item: string; quantity: number }) => `${x.quantity > 1 ? `${x.quantity} ` : ""}${reg.find(x.item, "item")?.name ?? x.item}`;

/** Starting equipment from the class and background, or the class's starting gold instead (PHB p. 143). */
function EquipmentStep({ reg, cls, background, kit, setKit }: { reg: ContentRegistry; cls?: string; background?: string; kit: KitState; setKit: (k: KitState) => void }) {
  const classDef = cls ? reg.find(cls, "class") : undefined;
  const se = classDef?.startingEquipment;
  const bgDef = background ? reg.find(background, "background") : undefined;
  const bg = bgDef?.equipment;
  const goldDice = se?.gold;
  return (
    <>
      <div className="segmented" role="radiogroup" aria-label="Starting equipment">
        <button role="radio" aria-checked={kit.mode === "kit"} onClick={() => setKit({ ...kit, mode: "kit" })}>
          Equipment
        </button>
        <button role="radio" aria-checked={kit.mode === "gold"} onClick={() => setKit({ ...kit, mode: "gold" })} disabled={!goldDice}>
          Gold instead
        </button>
      </div>
      {kit.mode === "gold" ? (
        <>
          <p className="note">
            Instead of the equipment from your class and background, start with {goldDice?.replace("*", " × ")} gp and buy what you want.
          </p>
          <div className="fund">
            <label>
              <span>Gold</span>
              <input type="number" min={0} inputMode="numeric" value={kit.gold ?? ""} onChange={(e) => setKit({ ...kit, gold: Number(e.target.value) || 0 })} placeholder="gp" />
            </label>
            <button
              className="big"
              onClick={() => {
                const [dice, mult] = (goldDice ?? "0").split("*");
                setKit({ ...kit, gold: roll(dice!).total * Number(mult ?? 1) });
              }}
            >
              Roll {goldDice?.replace("*", " × ")}
            </button>
          </div>
        </>
      ) : (
        <>
          {!se && <p className="note">This class has no starting equipment in the content yet. Add items later from the Items page.</p>}
          {se && (
            <>
              <p className="sub-head">{classDef!.name}</p>
              {se.fixed.length > 0 && <p className="note">You get {se.fixed.map((x) => itemLabel(reg, x)).join(", ")}.</p>}
              {se.options.map((o, oi) => (
                <div key={oi} className="kit-option">
                  {o.label && <p className="note">{o.label}</p>}
                  <div className="group">
                    {o.choices.map((ch, ci) => {
                      const on = (kit.choice[oi] ?? 0) === ci;
                      return (
                        <div key={ci} className={`row check kit-choice${on ? " on" : ""}`}>
                          <input
                            type="radio"
                            name={`kit-${oi}`}
                            checked={on}
                            onChange={() => {
                              const choice = [...kit.choice];
                              choice[oi] = ci;
                              setKit({ ...kit, choice });
                            }}
                            aria-label={`Option ${String.fromCharCode(97 + ci)}`}
                          />
                          <div className="row-main">
                            <div className="row-title">
                              ({String.fromCharCode(97 + ci)}) {[...ch.items.map((x) => itemLabel(reg, x)), ...ch.picks.map((p) => p.label)].join(", ")}
                            </div>
                            {on &&
                              ch.picks.map((p, pi) =>
                                Array.from({ length: p.count }, (_, n) => {
                                  const key = `${oi}.${pi}.${n}`;
                                  const opts = itemsForTag(reg, p.tag);
                                  return (
                                    <select
                                      key={key}
                                      className="kit-select"
                                      value={kit.picked[key] ?? ""}
                                      onChange={(e) => setKit({ ...kit, picked: { ...kit.picked, [key]: e.target.value } })}
                                      aria-label={p.label}
                                    >
                                      <option value="">Choose {p.label.replace(/^(a|an|any|two)\s+/i, "").toLowerCase()}…</option>
                                      {opts.map((d) => (
                                        <option key={d.id} value={d.id}>
                                          {d.name}
                                        </option>
                                      ))}
                                    </select>
                                  );
                                }),
                              )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </>
          )}
          {bgDef && (
            <>
              <p className="sub-head">{bgDef.name}</p>
              {bg ? (
                <p className="note">
                  {[...bg.fixed.map((x) => itemLabel(reg, x)), ...(bg.other ?? []), ...(bg.gold ? [`${bg.gold} gp`] : [])].join(", ")}.
                  {bg.other?.length ? " Things without an item of their own go in as named gear." : ""}
                </p>
              ) : (
                <p className="note">No equipment list for this background: load the backgrounds book file, or add items later.</p>
              )}
            </>
          )}
        </>
      )}
    </>
  );
}

/** The new character wizard: who, race, class, abilities, background; the rest is chosen on the checklist after. */
export function NewCharacterPanel({ reg, onCreate }: { reg: ContentRegistry; onCreate: (input: NewCharacterInput) => void }) {
  const steps = ["Who", "Race", "Class", "Abilities", "Background", "Equipment", "Ready"] as const;
  const [kit, setKit] = useState<KitState>({ mode: "kit", choice: [], picked: {} });
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [player, setPlayer] = useState("");
  const [alignment, setAlignment] = useState("");
  const [race, setRace] = useState<string>();
  const [cls, setCls] = useState<string>();
  const [background, setBackground] = useState<string>();
  const [scores, setScores] = useState<Record<Ability, number>>({ str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8 });

  // Races with subraces show as "Dwarf: Hill Dwarf"; the table's own races come with them.
  const races = useMemo(() => reg.list("race").sort((a, b) => (a.group ?? a.name).localeCompare(b.group ?? b.name) || a.name.localeCompare(b.name)), [reg]);
  const classes = useMemo(() => reg.list("class"), [reg]);
  const backgrounds = useMemo(() => reg.list("background"), [reg]);
  const raceDef = race ? reg.find(race, "race") : undefined;
  const classDef = cls ? reg.find(cls, "class") : undefined;

  const canNext = [name.trim().length > 0, !!race, !!cls, true, true, true, true][step];
  const next = () => setStep((s) => Math.min(steps.length - 1, s + 1));

  return (
    <>
      <ol className="steps" aria-label="Steps">
        {steps.map((s, i) => (
          <li key={s} data-on={i === step} data-done={i < step}>
            <button onClick={() => (i <= step || canNext ? setStep(i) : undefined)} disabled={i > step && !canNext}>
              {s}
            </button>
          </li>
        ))}
      </ol>

      {step === 0 && (
        <>
          <label className="field">
            <span>Character name</span>
            <input className="search" value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" autoFocus />
          </label>
          <label className="field">
            <span>Player</span>
            <input className="search" value={player} onChange={(e) => setPlayer(e.target.value)} placeholder="Who plays them (optional)" />
          </label>
          <p className="sub-head">Alignment</p>
          <div className="align-grid">
            {ALIGNMENTS.map(([id, label]) => (
              <button key={id} className="tag" aria-pressed={alignment === id} onClick={() => setAlignment(alignment === id ? "" : id)}>
                {label}
              </button>
            ))}
          </div>
        </>
      )}

      {step === 1 && (
        <PickList
          items={races}
          selected={race}
          onPick={(r) => {
            setRace(r.id);
            next();
          }}
          group={(r) => r.group}
          sub={(r) => [r.summary ?? shortText(r.text), bonusText(r.grant?.abilityBonuses), r.choices?.some((c) => c.kind === "ability") ? "+1 to abilities you pick" : ""].filter(Boolean).join(" · ")}
        />
      )}

      {step === 2 && (
        <PickList
          items={classes}
          selected={cls}
          onPick={(c) => {
            setCls(c.id);
            next();
          }}
          sub={(c) => `d${c.hitDie} hit die · ${c.saves.map((s) => ABILITY_NAMES[s]).join(" and ")} saves · ${c.summary ?? ""}`}
        />
      )}

      {step === 3 && <AbilityStep scores={scores} setScores={setScores} raceBonus={raceDef?.grant?.abilityBonuses ?? {}} />}

      {step === 4 && (
        <>
          <p className="note">Load your book files to see every background; you can also pick none now and add one later.</p>
          <PickList
            items={[{ id: "", name: "None for now" }, ...backgrounds]}
            selected={background ?? ""}
            onPick={(b) => {
              setBackground(b.id || undefined);
              next();
            }}
            sub={(b) => ("summary" in b ? b.summary : undefined) ?? ("text" in b ? shortText(b.text) : "")}
          />
        </>
      )}

      {step === 5 && <EquipmentStep reg={reg} {...(cls ? { cls } : {})} {...(background ? { background } : {})} kit={kit} setKit={setKit} />}

      {step === 6 && (
        <>
          <div className="identity">
            <div>
              <span className="identity-label">Name</span>
              <span className="identity-value">{name || "—"}</span>
            </div>
            <div>
              <span className="identity-label">Race</span>
              <span className="identity-value">{raceDef?.name ?? "—"}</span>
            </div>
            <div>
              <span className="identity-label">Class</span>
              <span className="identity-value">{classDef ? `${classDef.name} 1` : "—"}</span>
            </div>
            <div>
              <span className="identity-label">Background</span>
              <span className="identity-value">{background ? reg.find(background, "background")?.name : "none"}</span>
            </div>
          </div>
          <p className="note">Next: a checklist of what's left to choose (skills, languages, spells…). You can come back to it any time from the Sheet tab.</p>
          <button
            className="big primary wide"
            disabled={!name.trim() || !race || !cls}
            onClick={() =>
              onCreate({
                name: name.trim(),
                ...(player.trim() ? { player: player.trim() } : {}),
                ...(alignment ? { alignment } : {}),
                race: race!,
                class: cls!,
                ...(background ? { background } : {}),
                abilities: scores,
                ...kitResult(reg, cls, background, kit),
              })
            }
          >
            Create {name.trim() || "character"}
          </button>
        </>
      )}

      {step < 6 && step !== 1 && step !== 2 && step !== 4 && (
        <button className="big primary wide" style={{ marginTop: 14 }} disabled={!canNext} onClick={next}>
          Next: {steps[step + 1]}
        </button>
      )}
    </>
  );
}

/** A short line for what's picked on a checklist item. */
function pickedText(item: BuildItem, reg: ContentRegistry): string {
  if (!item.picked.length) return "Not chosen yet";
  if (item.kind === "spells") return `${item.picked.length} of ${item.need}`;
  return item.picked
    .map((v) => {
      if (item.kind === "subclass") return reg.find(v, "subclass")?.name ?? v;
      if (item.kind === "asi") return reg.find(v, "feat")?.name ?? v.replace(/(\w+)\+(\d)/g, (_, a: string, n: string) => `${ABILITY_NAMES[a as Ability] ?? a} +${n}`);
      if (item.choice?.kind === "feature") return reg.find(v, "feature")?.name ?? v;
      if (item.choice?.kind === "spell") return reg.find(v, "spell")?.name ?? v;
      if (item.choice?.kind === "skill") return SKILL_NAMES[v as Skill] ?? v;
      if (item.choice?.kind === "ability") return ABILITY_NAMES[v as Ability] ?? v;
      return v;
    })
    .join(", ");
}

/** Everything left to choose (and what's chosen), each opening its own picker. */
export function BuildPanel({
  get,
  reg,
  push,
  act,
  back,
  onLevelUp,
  onAddExtra,
  onOpenExtra,
  extras,
}: {
  /** The character as it is now (editors re-read it after every change). */
  get: () => Character | undefined;
  reg: ContentRegistry;
  push: Panel;
  act: Act;
  back: () => void;
  onLevelUp: () => void;
  onAddExtra: () => void;
  onOpenExtra: (id: string) => void;
  extras: DerivedSheet["extras"];
}) {
  const character = get();
  if (!character) return null;
  const items = buildItems(character, reg);
  const open = items.filter((i) => !i.done);
  const done = items.filter((i) => i.done);
  const edit = (item: BuildItem) => push(`${item.sourceName}: ${item.label}`, () => <ItemEditor itemKey={item.key} get={get} reg={reg} act={act} back={back} />);
  const row = (i: BuildItem) => (
    <button className={`row${i.done ? "" : " todo"}`} key={i.key} onClick={() => edit(i)}>
      <div className="row-main">
        <div className="row-title">
          {i.label}
          {i.need > 1 && i.kind !== "spells" ? ` (${i.need})` : ""}
        </div>
        <div className="row-sub">
          {i.sourceName} · {pickedText(i, reg)}
        </div>
      </div>
      {i.over ? (
        <span className="tag extra-tag">{character.extraNotes[noteKey(i)]?.tag ?? "over the limit"}</span>
      ) : (
        <span className={`tag${i.done ? " adv" : " fail"}`}>{i.done ? "done" : "choose"}</span>
      )}
    </button>
  );
  return (
    <>
      <p className="note">{open.length ? `${open.length} left to choose.` : "Everything is chosen."} Changes apply at once and can be undone.</p>
      {open.length > 0 && (
        <>
          <p className="sub-head">To choose</p>
          <div className="group">{open.map(row)}</div>
        </>
      )}
      {done.length > 0 && (
        <>
          <p className="sub-head">Chosen</p>
          <div className="group">{done.map(row)}</div>
        </>
      )}
      <p className="sub-head">Beyond the rules</p>
      {extras.length > 0 && (
        <div className="group">
          {extras.map((x) => (
            <button className="row" key={x.id} onClick={() => onOpenExtra(x.id)}>
              <div className="row-main">
                <div className="row-title">{x.name}</div>
                <div className="row-sub">{KIND_NAMES[x.kind].one}</div>
              </div>
              <span className="tag extra-tag">{x.tag}</span>
            </button>
          ))}
        </div>
      )}
      <button className="big wide" style={{ marginTop: 10 }} onClick={onAddExtra}>
        Add a feat, skill, expertise, language, tool or spell
      </button>
      <button className="big wide" style={{ marginTop: 14 }} onClick={onLevelUp}>
        Level up
      </button>
    </>
  );
}

/** Where the reason for picking past the limit is kept. */
const noteKey = (item: BuildItem) => (item.kind === "spells" ? `spells|${item.class}|${item.spellKind}` : `${item.source}|${item.choice?.id}`);

/**
 * The editor for one checklist item. It finds the item again by key on every
 * render, so it always shows the character as it is now.
 */
function ItemEditor({ itemKey, get, reg, act, back }: { itemKey: string; get: () => Character | undefined; reg: ContentRegistry; act: Act; back: () => void }) {
  const c = get();
  const item = c ? buildItems(c, reg).find((i) => i.key === itemKey) : undefined;
  if (!c || !item) return <p className="note">Nothing to choose here any more.</p>;
  if (item.kind === "choice") return <ChoiceEditor item={item} reg={reg} act={act} back={back} {...(c.extraNotes[noteKey(item)] ? { note: c.extraNotes[noteKey(item)]! } : {})} />;
  if (item.kind === "subclass") return <SubclassEditor item={item} reg={reg} act={act} back={back} />;
  if (item.kind === "asi") return <AsiEditor item={item} c={c} reg={reg} act={act} back={back} />;
  return <SpellsEditor item={item} reg={reg} act={act} c={c} {...(c.extraNotes[noteKey(item)] ? { note: c.extraNotes[noteKey(item)]! } : {})} />;
}

function ChoiceEditor({ item, reg, act, back, note }: { item: BuildItem; reg: ContentRegistry; act: Act; back: () => void; note?: ExtraNote }) {
  const options = useMemo(() => choiceOptions(item.choice!, reg, item.slotMax), [item.choice, reg, item.slotMax]);
  const [picked, setPicked] = useState<string[]>(item.picked);
  // Eldritch Knight, Arcane Trickster: most picks from two schools, a few from any.
  const lim = item.choice!.spells?.schoolLimit;
  const outside = lim ? picked.filter((id) => !lim.schools.includes(reg.find(id, "spell")?.school.toLowerCase() ?? "")).length : 0;
  const [q, setQ] = useState("");
  const shown = options.filter((o) => o.label.toLowerCase().includes(q.trim().toLowerCase()));
  // Feats (and single picks like a fighting style) keep their numbers; skills, languages, tools and spells can go over.
  const toggle = (v: string) =>
    setPicked((p) => (p.includes(v) ? p.filter((x) => x !== v) : item.strict && item.need === 1 ? [v] : item.strict && p.length >= item.need ? p : [...p, v]));
  return (
    <>
      <p className="note">
        Pick {item.need}. {picked.length} picked.{item.strict && item.source?.startsWith("feat") ? " A feat gives exactly this many." : ""}
      </p>
      {lim && (
        <p className={`note${outside > (item.freeSchool ?? 0) ? " danger-text" : ""}`}>
          All but {item.freeSchool ?? 0} must be {lim.schools.join(" or ")}. From other schools: {outside} of {item.freeSchool ?? 0}.
          {item.slotMax ? ` Spells up to level ${item.slotMax}, your highest slot.` : ""}
        </p>
      )}
      {picked.length > item.need && <OverBanner item={item} count={picked.length} />}
      {picked.length > item.need && note && <ExtraBox note={note} />}
      {options.length > 12 && <input className="search" type="search" placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} />}
      <div className="group">
        {shown.map((o) => (
          <label className="row check" key={o.value}>
            <input type="checkbox" checked={picked.includes(o.value)} onChange={() => toggle(o.value)} />
            <div className="row-main">
              <div className="row-title">{o.label}</div>
              {o.detail && (
                <div className="row-sub">
                  <RichText text={o.detail} />
                </div>
              )}
            </div>
          </label>
        ))}
        {options.length === 0 && <div className="row row-sub">Nothing to pick from here: load your book files for more options.</div>}
      </div>
      {picked.length > item.need ? (
        <div className="over-save">
          <ExtraNoteForm
            question={overQuestion(item)}
            {...(note ? { initial: note } : {})}
            saveLabel={`Save ${picked.length} of ${item.need}`}
            onSave={(n) => {
              act("setChoice", { source: item.source, choice: item.choice!.id, values: picked }, `${item.sourceName}: ${item.label} saved.`);
              act("setExtraNote", { key: noteKey(item), ...n }, `Why: ${n.tag}.`);
              back();
            }}
          />
        </div>
      ) : (
        <button
          className="big primary wide sticky-save"
          onClick={() => {
            act("setChoice", { source: item.source, choice: item.choice!.id, values: picked }, `${item.sourceName}: ${item.label} saved.`);
            if (note) act("setExtraNote", { key: noteKey(item) }, "Back within the rules.");
            back();
          }}
        >
          Save {picked.length} of {item.need}
        </button>
      )}
    </>
  );
}

/** "How did you gain access to the extra language?" */
function overQuestion(item: BuildItem): string {
  const k = item.kind === "spells" ? "spell" : item.choice?.kind;
  const what =
    k === "skill" ? (/expertise/i.test(item.label) ? "expertise" : "skill proficiency") : k === "language" ? "language" : k === "tool" ? "tool proficiency" : k === "spell" ? "spell" : "pick";
  return `How did you gain access to the extra ${what}?`;
}

/** Red banner: more picked than the rules give. Allowed, since every table bends the rules, but never silent. */
function OverBanner({ item, count }: { item: BuildItem; count: number }) {
  const what =
    item.kind === "spells"
      ? item.spellKind === "cantrips"
        ? "cantrips"
        : "spells known"
      : item.choice?.kind === "skill"
        ? /expertise/i.test(item.label) ? "expertise picks" : "skill proficiencies"
        : item.choice?.kind === "language"
          ? "languages"
          : item.choice?.kind === "tool"
            ? "tool proficiencies"
            : item.choice?.kind === "spell"
              ? "spells"
              : "picks";
  return (
    <p className="over-banner" role="alert">
      {count} {what}: the rules give {item.need} here. That's {count - item.need} more than RAW. Fine if your DM agrees.
    </p>
  );
}

function SubclassEditor({ item, reg, act, back }: { item: BuildItem; reg: ContentRegistry; act: Act; back: () => void }) {
  const subs = reg.list("subclass").filter((s) => s.class === item.class);
  return (
    <>
      <p className="note">Load your book files to see more than the SRD's choices and your table's own.</p>
      <PickList
        items={subs}
        selected={item.picked[0]}
        onPick={(s) => {
          act("setSubclass", { class: item.class, subclass: s.id }, `${s.name} chosen.`);
          back();
        }}
        sub={(s) => s.summary ?? shortText(s.text)}
      />
    </>
  );
}

function AsiEditor({ item, c, reg, act, back }: { item: BuildItem; c: Character; reg: ContentRegistry; act: Act; back: () => void }) {
  const rec = c.asi.find((a) => a.class === item.class && a.level === item.level);
  const [mode, setMode] = useState<"abilities" | "feat">(rec?.feat ? "feat" : "abilities");
  const [inc, setInc] = useState<Partial<Record<Ability, number>>>(rec?.abilities ?? {});
  const [q, setQ] = useState("");
  const total = Object.values(inc).reduce((n, v) => n + (v ?? 0), 0);
  // Scores before this improvement, without changes by hand: "you can't increase an ability score above 20 using this feature".
  const before = useMemo(() => derive({ ...c, asi: c.asi.filter((a) => a !== rec), abilityAdjust: {} }, reg).abilities, [c, rec, reg]);
  const [blocked, setBlocked] = useState<Ability | null>(null);
  const [allowOver, setAllowOver] = useState(false);
  const bump = (a: Ability, d: number) => {
    const v = (inc[a] ?? 0) + d;
    if (v < 0 || v > 2 || total + d > 2) return;
    if (d > 0 && before[a].score.total + v > 20 && !allowOver) return setBlocked(a);
    setBlocked(null);
    const next = { ...inc, [a]: v };
    if (!v) delete next[a];
    setInc(next);
  };
  const overNow = ABILITIES.filter((a) => (inc[a] ?? 0) > 0 && before[a].score.total + (inc[a] ?? 0) > 20);
  const feats = reg.list("feat").filter((f) => f.name.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <>
      <div className="segmented small" role="tablist">
        <button role="tab" aria-selected={mode === "abilities"} onClick={() => setMode("abilities")}>
          +2 to abilities
        </button>
        <button role="tab" aria-selected={mode === "feat"} onClick={() => setMode("feat")}>
          A feat instead
        </button>
      </div>
      {mode === "abilities" ? (
        <>
          <p className="note">+2 to one ability, or +1 to two, never above 20. {2 - total} left.</p>
          {blocked && (
            <div className="over-banner" role="alert">
              <strong>{ABILITY_NAMES[blocked]} can't go above 20 with an Ability Score Improvement.</strong> It's {before[blocked].score.total} now
              {inc[blocked] ? ` (+${inc[blocked]} here)` : ""}. Put the point in another ability.
              <div>
                <button
                  className="link"
                  onClick={() => {
                    setAllowOver(true);
                    setBlocked(null);
                  }}
                >
                  My DM allows it anyway
                </button>
              </div>
            </div>
          )}
          {overNow.length > 0 && !blocked && (
            <p className="over-banner" role="alert">
              Over 20 with this improvement: {overNow.map((a) => `${ABILITY_NAMES[a]} ${before[a].score.total + (inc[a] ?? 0)}`).join(", ")}. The rules don't allow it; keep it only if your DM agreed.
            </p>
          )}
          <div className="group">
            {ABILITIES.map((a) => (
              <div className="row" key={a}>
                <div className="row-main">
                  <div className="row-title">{ABILITY_NAMES[a]}</div>
                  <div className={`row-sub${before[a].score.total + (inc[a] ?? 0) > 20 ? " bad" : ""}`}>
                    {before[a].score.total}
                    {inc[a] ? ` → ${before[a].score.total + inc[a]}` : before[a].score.total >= 20 ? " · at the maximum" : ""}
                  </div>
                </div>
                <div className="stepper">
                  <button aria-label={`Less ${ABILITY_NAMES[a]}`} onClick={() => bump(a, -1)}>
                    −
                  </button>
                  <span>+{inc[a] ?? 0}</span>
                  <button aria-label={`More ${ABILITY_NAMES[a]}`} onClick={() => bump(a, 1)}>
                    +
                  </button>
                </div>
              </div>
            ))}
          </div>
          <button
            className="big primary wide"
            disabled={total !== 2}
            onClick={() => {
              act("chooseAsi", { class: item.class, level: item.level, abilities: inc }, "Ability Score Improvement saved.");
              back();
            }}
          >
            {overNow.length ? "Save anyway (DM allowed)" : "Save"}
          </button>
        </>
      ) : (
        <>
          <input className="search" type="search" placeholder="Search feats" value={q} onChange={(e) => setQ(e.target.value)} />
          <PickList
            items={feats}
            selected={rec?.feat}
            onPick={(f) => {
              act("chooseAsi", { class: item.class, level: item.level, feat: f.id }, `${f.name} taken.`);
              back();
            }}
            sub={(f) => f.summary ?? shortText(f.text)}
          />
        </>
      )}
    </>
  );
}

function SpellsEditor({ item, reg, act, c, note }: { item: BuildItem; reg: ContentRegistry; act: Act; c: Character; note?: ExtraNote }) {
  const [q, setQ] = useState("");
  const [editNote, setEditNote] = useState(false);
  // Wizard: copying a spell into the spellbook costs gold from the fund; ask first.
  const [copying, setCopying] = useState<{ spell: string; label: string } | null>(null);
  const over = item.spellKind !== "spellbook" && item.picked.length > item.need;
  const options = useMemo(() => classSpellOptions(reg, item.class!, item.spellKind!, item.maxLevel ?? 1), [reg, item.class, item.spellKind, item.maxLevel]);
  const shown = options.filter((o) => o.label.toLowerCase().includes(q.trim().toLowerCase()));
  if (copying)
    return (
      <CopyAsk
          c={c}
          reg={reg}
          spell={copying.spell}
          label={copying.label}
          onDone={(cost) => {
            act("learnSpell", { spell: copying.spell, list: item.list, ...(cost ? { cost } : {}) }, `${copying.label} copied into your spellbook.`);
            setCopying(null);
          }}
          onCancel={() => setCopying(null)}
        />
    );
  return (
    <>
      {over && <OverBanner item={item} count={item.picked.length} />}
      {over &&
        (note && !editNote ? (
          <ExtraBox note={note} onEdit={() => setEditNote(true)} />
        ) : (
          <ExtraNoteForm
            question={overQuestion(item)}
            {...(note ? { initial: note } : {})}
            saveLabel="Save the reason"
            onSave={(n) => {
              act("setExtraNote", { key: noteKey(item), ...n }, `Why: ${n.tag}.`);
              setEditNote(false);
            }}
          />
        ))}
      <p className="note">
        {item.picked.length} of {item.need} {item.spellKind === "cantrips" ? "cantrips" : item.spellKind === "spellbook" ? "spells in your spellbook" : "spells known"}
        {item.spellKind !== "cantrips" ? `, up to level ${item.maxLevel}` : ""}. Tap to add or take away.
      </p>
      <input className="search" type="search" placeholder="Search spells" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="group">
        {shown.map((o) => {
          const on = item.picked.includes(o.value);
          return (
            <label className="row check" key={o.value}>
              <input
                type="checkbox"
                checked={on}
                onChange={() => {
                  if (!on && item.spellKind === "spellbook" && copyCost(c, reg, o.value)) return setCopying({ spell: o.value, label: o.label });
                  act(on ? "forgetSpell" : "learnSpell", { spell: o.value, list: item.list }, `${o.label} ${on ? "taken away" : "added"}.`);
                  if (on && note && item.picked.length - 1 <= item.need) act("setExtraNote", { key: noteKey(item) }, "Back within the rules.");
                }}
              />
              <div className="row-main">
                <div className="row-title">{o.label}</div>
                {o.detail && <div className="row-sub">{o.detail}</div>}
              </div>
            </label>
          );
        })}
      </div>
    </>
  );
}

/**
 * Copying a spell into the spellbook (PHB p. 114): 50 gp per level in
 * materials and fine inks, half for your school with its Savant feature.
 * Spells a new wizard level gives are free, so paying is the player's call.
 */
function CopyAsk({ c, reg, spell, label, onDone, onCancel }: { c: Character; reg: ContentRegistry; spell: string; label: string; onDone: (cost?: number) => void; onCancel: () => void }) {
  const cost = copyCost(c, reg, spell)!;
  const fund = c.spellbookFunds;
  const ref = useRef<HTMLDivElement>(null);
  // Bring the question into view by scrolling the sheet only (scrollIntoView also scrolled the page, leaving it blank).
  useEffect(() => {
    const sheet = ref.current?.closest(".sheet");
    if (sheet) sheet.scrollTop = 0;
  }, []);
  return (
    <div className="copy-ask" role="dialog" aria-label={`Copy ${label}`} ref={ref}>
      <p className="question">Pay for copying {label}?</p>
      <p className="note">
        {cost.gp} gp in materials and fine inks{cost.savant ? ` (${cost.savant})` : ""}. Your spellbook materials: {fund} gp
        {fund < cost.gp ? ", not enough: it goes to 0 gp if you pay" : ""}. Spells you gain from a new wizard level are free.
      </p>
      <div className="choose-list">
        <button className="big wide" onClick={onCancel}>
          Cancel
        </button>
        <button className="big wide" onClick={() => onDone()}>
          Add it free
        </button>
        <button className="big primary wide" onClick={() => onDone(cost.gp)}>
          Pay {cost.gp} gp and add it
        </button>
      </div>
    </div>
  );
}

/** Level up: pick the class (multiclassing warns about minimums), see what the level brings, take HP. */
export function LevelUpPanel({
  character,
  sheet,
  reg,
  onLevel,
  onLevelDown,
}: {
  character: Character;
  sheet: DerivedSheet;
  reg: ContentRegistry;
  onLevel: (cls: string, hpRoll?: number) => void;
  onLevelDown: (cls: string) => void;
}) {
  const [removing, setRemoving] = useState<string | null>(null);
  const [cls, setCls] = useState(character.classes[0]?.class ?? "");
  const [hp, setHp] = useState<"average" | "app" | "mine">("average");
  const [mine, setMine] = useState("");
  const gains = levelGains(character, reg, cls);
  const others = reg.list("class").filter((d) => !character.classes.some((x) => x.class === d.id));
  const con = sheet.abilities.con.modifier;
  const total = character.classes.reduce((n, x) => n + x.level, 0);
  if (!gains) return null;
  const avg = gains.hitDie / 2 + 1;
  const go = () => {
    if (hp === "average") return onLevel(cls);
    if (hp === "app") return onLevel(cls, roll(`1d${gains.hitDie}`).total);
    return onLevel(cls, Math.max(1, Math.min(gains.hitDie, Number(mine))));
  };

  return (
    <>
      <p className="note">Character level {total} → {total + 1}.</p>
      <p className="sub-head">Which class?</p>
      <div className="group">
        {character.classes.map((x) => {
          const d = reg.find(x.class, "class");
          return (
            <label className="row check" key={x.class}>
              <input type="radio" name="lvl-class" checked={cls === x.class} onChange={() => setCls(x.class)} />
              <div className="row-main">
                <div className="row-title">
                  {d?.name} {x.level} → {x.level + 1}
                </div>
              </div>
            </label>
          );
        })}
      </div>
      <details className="multiclass">
        <summary>Multiclass into a new class</summary>
        <div className="group">
          {others.map((d) => {
            const issues = multiclassIssues(character, reg, d.id);
            return (
              <label className="row check" key={d.id}>
                <input type="radio" name="lvl-class" checked={cls === d.id} onChange={() => setCls(d.id)} />
                <div className="row-main">
                  <div className="row-title">{d.name} 1</div>
                  <div className={`row-sub${issues.length ? " danger-text" : ""}`}>{issues.length ? issues.join(" ") : `d${d.hitDie} hit die`}</div>
                </div>
              </label>
            );
          })}
        </div>
      </details>

      <p className="sub-head">
        {gains.className} {gains.newLevel} brings
      </p>
      <ul className="reminders">
        {gains.features.map((f) => (
          <li key={f.id}>
            <b>{f.name}.</b> {f.summary}
          </li>
        ))}
        {gains.subclassDue && <li>Choose your {reg.find(cls, "class")?.subclassTitle ?? "subclass"}.</li>}
        {gains.asiDue && <li>An Ability Score Improvement, or a feat.</li>}
        {!gains.features.length && !gains.subclassDue && !gains.asiDue && <li>More hit points{reg.find(cls, "class")?.spellcasting ? " and spells" : ""}.</li>}
        {gains.prerequisites.map((p) => (
          <li key={p} className="danger-text">
            Multiclassing: {p}
          </li>
        ))}
      </ul>

      <p className="sub-head">Hit points: d{gains.hitDie} {signed(con)}</p>
      <div className="group">
        <label className="row check">
          <input type="radio" name="lvl-hp" checked={hp === "average"} onChange={() => setHp("average")} />
          <div className="row-main">
            <div className="row-title">Take the average: {avg + con}</div>
          </div>
        </label>
        <label className="row check">
          <input type="radio" name="lvl-hp" checked={hp === "app"} onChange={() => setHp("app")} />
          <div className="row-main">
            <div className="row-title">The app rolls the d{gains.hitDie}</div>
          </div>
        </label>
        <label className="row check">
          <input type="radio" name="lvl-hp" checked={hp === "mine"} onChange={() => setHp("mine")} />
          <div className="row-main">
            <div className="row-title">I rolled</div>
          </div>
        </label>
      </div>
      {hp === "mine" && (
        <label className="roll-entry">
          <span>Your d{gains.hitDie} roll</span>
          <input type="number" min={1} max={gains.hitDie} inputMode="numeric" autoFocus value={mine} onChange={(e) => setMine(e.target.value.replace(/\D/g, "").slice(0, 2))} placeholder={`1–${gains.hitDie}`} />
        </label>
      )}
      <button className="big primary wide" style={{ marginTop: 14 }} disabled={hp === "mine" && !mine} onClick={go}>
        Level up to {gains.className} {gains.newLevel}
      </button>

      <details className="beyond" style={{ marginTop: 18 }}>
        <summary>Remove a level</summary>
        <p className="note">Takes the class's last level back: its hit points, features, and an Ability Score Improvement or feat from that level. A class at level 1 is removed entirely (not your only class).</p>
        <div className="group">
          {character.classes.map((x) => {
            const d = reg.find(x.class, "class");
            const only = character.classes.length === 1 && x.level === 1;
            return (
              <div className="row" key={x.class}>
                <div className="row-main">
                  <div className="row-title">
                    {d?.name} {x.level} → {x.level - 1 || "gone"}
                  </div>
                </div>
                {removing === x.class ? (
                  <button
                    className="chip danger-text"
                    onClick={() => {
                      onLevelDown(x.class);
                      setRemoving(null);
                    }}
                  >
                    Sure? Remove it
                  </button>
                ) : (
                  <button className="chip" disabled={only} onClick={() => setRemoving(x.class)}>
                    Remove a level
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </details>
    </>
  );
}
