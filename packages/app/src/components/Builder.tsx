import { useMemo, useState, type ReactNode } from "react";
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
  type BuildItem,
  type ContentRegistry,
  type DerivedSheet,
} from "@dnd/engine";
import { ABILITIES, ABILITY_NAMES, SKILL_NAMES, type Ability, type Character, type OperationType, type Skill } from "@dnd/schema";
import { RichText } from "./Conditions";

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
}

/** The new character wizard: who, race, class, abilities, background; the rest is chosen on the checklist after. */
export function NewCharacterPanel({ reg, onCreate }: { reg: ContentRegistry; onCreate: (input: NewCharacterInput) => void }) {
  const steps = ["Who", "Race", "Class", "Abilities", "Background", "Ready"] as const;
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

  const canNext = [name.trim().length > 0, !!race, !!cls, true, true, true][step];
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
          sub={(r) => [r.summary, bonusText(r.grant?.abilityBonuses), r.choices?.some((c) => c.kind === "ability") ? "+1 to abilities you pick" : ""].filter(Boolean).join(" · ")}
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
            sub={(b) => ("summary" in b ? (b.summary as string | undefined) : undefined) ?? ""}
          />
        </>
      )}

      {step === 5 && (
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
              })
            }
          >
            Create {name.trim() || "character"}
          </button>
        </>
      )}

      {step < 5 && step !== 1 && step !== 2 && step !== 4 && (
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
}: {
  /** The character as it is now (editors re-read it after every change). */
  get: () => Character | undefined;
  reg: ContentRegistry;
  push: Panel;
  act: Act;
  back: () => void;
  onLevelUp: () => void;
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
      {i.over ? <span className="tag fail">over the limit</span> : <span className={`tag${i.done ? " adv" : " fail"}`}>{i.done ? "done" : "choose"}</span>}
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
      <button className="big wide" style={{ marginTop: 14 }} onClick={onLevelUp}>
        Level up
      </button>
    </>
  );
}

/**
 * The editor for one checklist item. It finds the item again by key on every
 * render, so it always shows the character as it is now.
 */
function ItemEditor({ itemKey, get, reg, act, back }: { itemKey: string; get: () => Character | undefined; reg: ContentRegistry; act: Act; back: () => void }) {
  const c = get();
  const item = c ? buildItems(c, reg).find((i) => i.key === itemKey) : undefined;
  if (!c || !item) return <p className="note">Nothing to choose here any more.</p>;
  if (item.kind === "choice") return <ChoiceEditor item={item} reg={reg} act={act} back={back} />;
  if (item.kind === "subclass") return <SubclassEditor item={item} reg={reg} act={act} back={back} />;
  if (item.kind === "asi") return <AsiEditor item={item} c={c} reg={reg} act={act} back={back} />;
  return <SpellsEditor item={item} reg={reg} act={act} />;
}

function ChoiceEditor({ item, reg, act, back }: { item: BuildItem; reg: ContentRegistry; act: Act; back: () => void }) {
  const options = useMemo(() => choiceOptions(item.choice!, reg), [item.choice, reg]);
  const [picked, setPicked] = useState<string[]>(item.picked);
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
      {picked.length > item.need && <OverBanner item={item} count={picked.length} />}
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
      <button
        className="big primary wide sticky-save"
        onClick={() => {
          act("setChoice", { source: item.source, choice: item.choice!.id, values: picked }, `${item.sourceName}: ${item.label} saved.`);
          back();
        }}
      >
        Save {picked.length} of {item.need}
        {picked.length > item.need ? " (more than the rules give)" : ""}
      </button>
    </>
  );
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
        sub={(s) => s.summary ?? ""}
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
  const bump = (a: Ability, d: number) => {
    const v = (inc[a] ?? 0) + d;
    if (v < 0 || v > 2 || total + d > 2) return;
    const next = { ...inc, [a]: v };
    if (!v) delete next[a];
    setInc(next);
  };
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
          <p className="note">+2 to one ability, or +1 to two. {2 - total} left.</p>
          <div className="group">
            {ABILITIES.map((a) => (
              <div className="row" key={a}>
                <div className="row-main">
                  <div className="row-title">{ABILITY_NAMES[a]}</div>
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
            Save
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
            sub={(f) => f.summary ?? ""}
          />
        </>
      )}
    </>
  );
}

function SpellsEditor({ item, reg, act }: { item: BuildItem; reg: ContentRegistry; act: Act }) {
  const [q, setQ] = useState("");
  const options = useMemo(() => classSpellOptions(reg, item.class!, item.spellKind!, item.maxLevel ?? 1), [reg, item.class, item.spellKind, item.maxLevel]);
  const shown = options.filter((o) => o.label.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <>
      {item.spellKind !== "spellbook" && item.picked.length > item.need && <OverBanner item={item} count={item.picked.length} />}
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
                onChange={() => act(on ? "forgetSpell" : "learnSpell", { spell: o.value, list: item.list }, `${o.label} ${on ? "taken away" : "added"}.`)}
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

/** Level up: pick the class (multiclassing warns about minimums), see what the level brings, take HP. */
export function LevelUpPanel({ character, sheet, reg, onLevel }: { character: Character; sheet: DerivedSheet; reg: ContentRegistry; onLevel: (cls: string, hpRoll?: number) => void }) {
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
          <input className="score-select" inputMode="numeric" value={mine} onChange={(e) => (setMine(e.target.value.replace(/\D/g, "").slice(0, 2)), setHp("mine"))} placeholder={`1–${gains.hitDie}`} aria-label="Your roll" />
        </label>
      </div>
      <button className="big primary wide" style={{ marginTop: 14 }} disabled={hp === "mine" && !mine} onClick={go}>
        Level up to {gains.className} {gains.newLevel}
      </button>
    </>
  );
}
