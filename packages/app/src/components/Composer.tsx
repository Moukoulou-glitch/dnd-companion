import { RichText } from "./Conditions";
import { useMemo, useState } from "react";
import {
  composeD20,
  composeDamage,
  d20Count,
  diceToRoll,
  formatFormula,
  physicalDamageTotal,
  rollComposed,
  sourcesMode,
  withCrit,
  type ComposerBase,
  type ComposerChoices,
  type Composed,
} from "@dnd/dice";
import { signed, type WeaponAttack } from "@dnd/engine";
import { recordOf, type RollRecord } from "../rolls";

interface Props {
  title: string;
  base: ComposerBase;
  /** Set for weapon and feature attacks: enables the damage step. */
  attack?: WeaponAttack & { saveNote?: string };
  physical: boolean;
  onPhysicalChange: (physical: boolean) => void;
  onRolled: (r: RollRecord) => void;
  /** Skip the d20: save spells, Magic Missile, healing. */
  damageOnly?: boolean;
  /** The roll heals rather than damages: the result offers "Heal myself". */
  healing?: boolean;
  onHealSelf?: (amount: number) => void;
  /** A DC the d20 roll must meet (concentration checks). */
  dc?: number;
  /** Called with whether the d20 roll met the DC. */
  onCheck?: (passed: boolean) => void;
  /** Extra reminders for this roll (Eldritch Blast beams). */
  notes?: string[];
  /** Foretelling rolls that can replace the d20 (Portent). */
  portent?: { values: number[]; onUse: (index: number) => void };
  /** Options that clash with this roll, with the warning shown when turned on (Steady Aim with a bonus-action attack). */
  conflicts?: { label: string; warning: string }[];
  /** The optional modifiers that were on when the d20 was rolled (Steady Aim spends its bonus action). */
  onOptionsUsed?: (labels: string[]) => void;
}

type Stage =
  | { step: "setup" }
  | { step: "d20-result"; record: RollRecord }
  | { step: "damage-setup"; crit: boolean; attackRecord?: RollRecord; attackMode?: string }
  | { step: "damage-result"; record: RollRecord; crit: boolean; attackRecord?: RollRecord };

/** The lines of a composed roll before rolling: what goes in and from where. */
function FormulaLines({ c }: { c: Composed }) {
  return (
    <ul className="lines">
      {c.terms.map((t, i) => (
        <li key={i}>
          <span>{c.sources[i]}</span>
          <b>
            {t.kind === "flat"
              ? signed(t.sign * t.value)
              : `${t.sign < 0 ? "-" : i === 0 ? "" : "+"}${t.count}d${t.sides}${t.keep ? (t.keep.which === "highest" ? " keep high" : " keep low") : ""}${
                  t.label && t.label !== c.sources[i] ? ` ${t.label}` : ""
                }`}
          </b>
        </li>
      ))}
    </ul>
  );
}

function Options({
  base,
  choices,
  setChoices,
  withManual,
}: {
  base: ComposerBase;
  choices: ComposerChoices;
  setChoices: (c: ComposerChoices) => void;
  withManual: boolean;
}) {
  const toggle = (label: string) =>
    setChoices({
      ...choices,
      enabled: choices.enabled.includes(label) ? choices.enabled.filter((l) => l !== label) : [...choices.enabled, label],
    });

  return (
    <>
      {base.suggestions.length > 0 && (
        <>
          <p className="sub-head">Can apply, your call</p>
          <div className="group">
            {base.suggestions.map((s) => (
              <label className="row check" key={s.label}>
                <input type="checkbox" checked={choices.enabled.includes(s.label)} onChange={() => toggle(s.label)} />
                <div className="row-main">
                  <div className="row-title">{s.label}</div>
                  {s.reason && <div className="row-sub">{s.reason}</div>}
                </div>
                <b>{s.effect}</b>
              </label>
            ))}
          </div>
        </>
      )}
      <div className="adjust">
        {withManual && (
          <div className="segmented mode" role="radiogroup" aria-label="Advantage">
            {(["disadvantage", "normal", "advantage"] as const).map((m) => {
              const auto = sourcesMode(base, choices);
              const current = choices.force ?? auto;
              return (
                <button
                  key={m}
                  role="radio"
                  data-mode={m}
                  aria-checked={current === m}
                  onClick={() => {
                    const next: ComposerChoices = { ...choices, manual: "none" };
                    if (m === auto) delete next.force;
                    else next.force = m;
                    setChoices(next);
                  }}
                >
                  {m === "normal" ? "Normal" : m === "advantage" ? "Adv" : "Disadv"}
                </button>
              );
            })}
          </div>
        )}
        <div className="stepper" aria-label="Extra bonus">
          <button aria-label="Lower the extra bonus" onClick={() => setChoices({ ...choices, extra: choices.extra - 1 })}>
            −
          </button>
          <span>{choices.extra === 0 ? "±0" : signed(choices.extra)}</span>
          <button aria-label="Raise the extra bonus" onClick={() => setChoices({ ...choices, extra: choices.extra + 1 })}>
            +
          </button>
        </div>
      </div>
    </>
  );
}

/** Tap the face you rolled. Two taps when rolling with advantage or disadvantage. */
function D20Entry({ count, onDone }: { count: number; onDone: (values: number[]) => void }) {
  const [values, setValues] = useState<number[]>([]);
  const pick = (v: number) => {
    const next = [...values, v];
    if (next.length >= count) onDone(next);
    else setValues(next);
  };
  return (
    <>
      <p className="note">
        {count === 1 ? "Tap what your d20 shows." : values.length === 0 ? "Tap the first d20." : `First d20: ${values[0]}. Tap the second.`}
      </p>
      <div className="keys d20">
        {Array.from({ length: 20 }, (_, i) => (
          <button key={i} className="key" onClick={() => pick(i + 1)}>
            {i + 1}
          </button>
        ))}
      </div>
    </>
  );
}

/** Type the total showing on all the damage dice. */
function TotalEntry({ prompt, onDone }: { prompt: string; onDone: (n: number) => void }) {
  const [v, setV] = useState("");
  const press = (d: string) => setV((x) => (x.length >= 3 ? x : (x + d).replace(/^0+/, "")));
  return (
    <>
      <p className="note">{prompt}</p>
      <div className={`pad-display${v ? "" : " empty"}`}>{v || "0"}</div>
      <div className="keys">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
          <button key={d} className="key" onClick={() => press(d)}>
            {d}
          </button>
        ))}
        <button className="key" onClick={() => setV((x) => x.slice(0, -1))} aria-label="Delete last digit">
          ⌫
        </button>
        <button className="key" onClick={() => press("0")}>
          0
        </button>
        <button className="key ok" disabled={!v} onClick={() => onDone(Number(v))}>
          OK
        </button>
      </div>
    </>
  );
}

export function ResultView({ r }: { r: RollRecord }) {
  return (
    <>
      <div className={`result${r.crit ? " crit" : ""}${r.fumble ? " fumble" : ""}`}>
        <b>{r.total}</b>
        {r.crit && <span>Critical</span>}
        {r.fumble && <span>Natural 1</span>}
        {r.byType && Object.keys(r.byType).length > 1 && (
          <small>
            {Object.entries(r.byType)
              .map(([type, n]) => `${n} ${type}`)
              .join(", ")}
          </small>
        )}
        {r.physical && <small>From your dice</small>}
      </div>
      <ul className="lines">
        {r.lines.map((l, i) => (
          <li key={i}>
            <span>
              {l.source}
              {l.detail && <span className="why">{l.detail}</span>}
            </span>
            <b>{signed(l.total)}</b>
          </li>
        ))}
      </ul>
    </>
  );
}

export function Composer({ title, base, attack, physical, onPhysicalChange, onRolled, damageOnly, healing, onHealSelf, dc, onCheck, notes, portent, onOptionsUsed, conflicts }: Props) {
  const [choices, setChoices] = useState<ComposerChoices>({ enabled: [], manual: "none", extra: 0 });
  const [damageChoices, setDamageChoices] = useState<ComposerChoices>({ enabled: [], manual: "none", extra: 0 });
  const [stage, setStage] = useState<Stage>(damageOnly ? { step: "damage-setup", crit: false } : { step: "setup" });
  const [entering, setEntering] = useState(false);

  const d20 = useMemo(() => composeD20(base, choices), [base, choices]);

  const damageBase = attack?.damage.bonus;
  const damage = useMemo(() => {
    if (!attack || stage.step !== "damage-setup") return undefined;
    const c = composeDamage(attack.damage.dice, attack.damage.type, attack.damage.bonus, damageChoices, attack.attackId.startsWith("spell:") ? attack.name : "Weapon");
    if (!stage.crit) return c;
    const extra = attack.damage.critExtraDice.reduce((n, p) => n + p.value, 0);
    const natural20 = stage.attackRecord?.natural === 20 || !stage.attackRecord;
    return withCrit(c, extra, natural20 ? attack.damage.onCrit : []);
  }, [attack, stage, damageChoices]);

  const [attackMode, setAttackMode] = useState<string | undefined>();

  const startDamage = (crit: boolean, attackRecord?: RollRecord) => {
    // Options turned on for the attack (Sharpshooter) carry over to its damage.
    const shared = choices.enabled.filter((l) => damageBase?.suggestions.some((s) => s.label === l));
    setDamageChoices({ enabled: shared, manual: "none", extra: 0 });
    setEntering(false);
    const next: Stage = { step: "damage-setup", crit };
    if (attackRecord) next.attackRecord = attackRecord;
    const mode = attackRecord ? attackMode : d20.d20Mode;
    if (mode) next.attackMode = mode;
    setStage(next);
  };

  const rollD20 = (values?: number[], composed = d20) => {
    const rec = recordOf(dc ? `${title} (DC ${dc})` : title, "d20", rollComposed(composed, values));
    setAttackMode(composed.d20Mode);
    if (choices.enabled.length) onOptionsUsed?.(choices.enabled);
    onRolled(rec);
    if (dc !== undefined) onCheck?.(rec.total >= dc);
    setEntering(false);
    setStage({ step: "d20-result", record: rec });
  };

  const rollDamage = (diceTotal?: number) => {
    if (!damage || stage.step !== "damage-setup") return;
    const label = `${attack!.name} ${healing ? "healing" : "damage"}${stage.crit ? " (critical)" : ""}`;
    const result = rollComposed(damage);
    const rec =
      diceTotal === undefined
        ? recordOf(label, "damage", result)
        : recordOf(label, "damage", { ...result, physical: true }, physicalDamageTotal(damage, diceTotal));
    if (diceTotal !== undefined) {
      rec.lines = [
        { source: `Your dice (${diceToRoll(damage)})`, detail: "", total: diceTotal },
        ...damage.terms.flatMap((t, i) => (t.kind === "flat" ? [{ source: damage.sources[i]!, detail: "", total: t.sign * t.value }] : [])),
      ];
    }
    onRolled(rec);
    setEntering(false);
    const next: Stage = { step: "damage-result", record: rec, crit: stage.crit };
    if (stage.attackRecord) next.attackRecord = stage.attackRecord;
    setStage(next);
  };

  const diceSwitch = (
    <div className="segmented small" role="radiogroup" aria-label="Who rolls">
      <button role="radio" aria-checked={physical} onClick={() => onPhysicalChange(true)}>
        My dice
      </button>
      <button role="radio" aria-checked={!physical} onClick={() => onPhysicalChange(false)}>
        App rolls
      </button>
    </div>
  );

  if (stage.step === "setup") {
    return (
      <>
        {diceSwitch}
        {base.autoFail && base.autoFail.length > 0 && (
          <p className="warn">
            Fails automatically ({base.autoFail.join(", ")}). Roll anyway only if your DM rules otherwise.
          </p>
        )}
        {[...(notes ?? []), ...(base.notes ?? [])].map((n) => (
          <p className="note reminder" key={n}>
            <RichText text={n} />
          </p>
        ))}
        <FormulaLines c={d20} />
        {choices.force && choices.force !== sourcesMode(base, choices) && (
          <p className="note">Set by hand: the sources give {sourcesMode(base, choices) === "normal" ? "a normal roll" : sourcesMode(base, choices)}.</p>
        )}
        {!choices.force && d20.d20Mode !== "normal" && (
          <p className="note">
            {d20.d20Mode === "advantage" ? "Advantage" : "Disadvantage"} from {(d20.d20Mode === "advantage" ? d20.advantageFrom : d20.disadvantageFrom).join(", ")}.
          </p>
        )}
        {d20.d20Mode === "normal" && d20.advantageFrom.length > 0 && d20.disadvantageFrom.length > 0 && (
          <p className="note">
            Advantage ({d20.advantageFrom.join(", ")}) and disadvantage ({d20.disadvantageFrom.join(", ")}) cancel out.
          </p>
        )}
        <Options base={base} choices={choices} setChoices={setChoices} withManual />
        {(conflicts ?? [])
          .filter((x) => choices.enabled.includes(x.label))
          .map((x) => (
            <p className="warn" key={x.label}>
              {x.warning}
            </p>
          ))}
        {attack?.range && (
          <p className="note">Range {attack.range[0] === attack.range[1] ? `${attack.range[0]} ft` : `${attack.range[0]}/${attack.range[1]} ft`}.</p>
        )}
        {attack && !attack.proficient && <p className="note danger-text">Not proficient: no proficiency bonus on the attack.</p>}
        <p className="formula">{formatFormula(d20.terms).replace(/\[[^\]]*\]/g, "")}</p>
        {portent && portent.values.length > 0 && (
          <div className="portent">
            <span>Portent: use a foretold roll instead</span>
            {portent.values.map((v, i) => (
              <button
                key={i}
                className="tag adv"
                onClick={() => {
                  portent.onUse(i);
                  rollD20([v], composeD20(base, { ...choices, force: "normal" }));
                }}
              >
                {v}
              </button>
            ))}
          </div>
        )}
        {physical ? (
          <D20Entry key={d20Count(d20)} count={d20Count(d20)} onDone={rollD20} />
        ) : (
          <button className="big primary wide" onClick={() => rollD20()}>
            Roll
          </button>
        )}
        {attack && (
          <button className="link" onClick={() => startDamage(false)}>
            Skip to damage
          </button>
        )}
      </>
    );
  }

  if (stage.step === "d20-result") {
    const r = stage.record;
    return (
      <>
        <ResultView r={r} />
        {dc !== undefined && (
          <p className={r.total >= dc ? "pass" : "warn"}>
            {r.total >= dc ? `Success against DC ${dc}.` : `Failed against DC ${dc}.`}
          </p>
        )}
        {attack && (
          <div className="big-actions" style={{ marginTop: 12 }}>
            <button className={`big${r.crit ? "" : " primary"}`} onClick={() => startDamage(false, r)}>
              Roll damage
            </button>
            <button className={`big${r.crit ? " primary" : ""}`} onClick={() => startDamage(true, r)}>
              Critical damage
            </button>
          </div>
        )}
        {dc === undefined && (
          <button className="link" onClick={() => setStage({ step: "setup" })}>
            Roll again
          </button>
        )}
      </>
    );
  }

  if (stage.step === "damage-setup" && damage && damageBase) {
    return (
      <>
        {diceSwitch}
        {stage.crit && <p className="note">Critical hit: every damage die is rolled twice.</p>}
        {dc === undefined && attack?.saveNote && <p className="note">{attack.saveNote}</p>}
        {(damageBase.notes ?? []).map((n) => (
          <p className="note reminder" key={n}>
            <RichText text={n} />
          </p>
        ))}
        {stage.attackMode === "disadvantage" && damageChoices.enabled.some((l) => /sneak attack/i.test(l)) && (
          <p className="warn">You rolled this attack with disadvantage: Sneak Attack can't apply. Leave it on only if your DM says so.</p>
        )}
        <FormulaLines c={damage} />
        <Options base={damageBase} choices={damageChoices} setChoices={setDamageChoices} withManual={false} />
        <p className="formula">{formatFormula(damage.terms).replace(/\[[^\]]*\]/g, "")}</p>
        {physical ? (
          entering ? (
            <TotalEntry prompt={`Roll ${diceToRoll(damage)} and type the total of the dice.`} onDone={rollDamage} />
          ) : (
            <button className="big primary wide" onClick={() => setEntering(true)}>
              Enter my dice
            </button>
          )
        ) : (
          <button className="big primary wide" onClick={() => rollDamage()}>
            {healing ? "Roll healing" : "Roll damage"}
          </button>
        )}
      </>
    );
  }

  if (stage.step === "damage-result") {
    return (
      <>
        <ResultView r={stage.record} />
        {healing && onHealSelf && (
          <button className="big heal wide" onClick={() => onHealSelf(stage.record.total)}>
            Heal myself {stage.record.total}
          </button>
        )}
        <button className="link" onClick={() => setStage(damageOnly ? { step: "damage-setup", crit: false } : { step: "setup" })}>
          {damageOnly ? "Roll again" : "New attack"}
        </button>
      </>
    );
  }

  return null;
}
