import { RichText } from "./Conditions";
import { HealTargets, type HealTarget } from "./HealTargets";
import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { rollThrown } from "../dice3d";
import { NoWebGLError, SkipError, skipThrow, throwDice } from "../diceBox";
import { myDieLook } from "../dice/mine";
import { currentDiceState, resourceNow } from "../diceColours";
import type { ThrowOptions } from "../dice3d";
import { useDice3d } from "../dice3dSetting";
import {
  composeD20,
  composeDamage,
  d20Count,
  d20Reroll,
  diceToRoll,
  formatFormula,
  physicalDamageTotal,
  rerollDie,
  rollComposed,
  secureRng,
  sourcesMode,
  type ComposerBase,
  type ComposerChoices,
  type Composed,
  type ComposedRoll,
} from "@dnd/dice";
import { signed, type WeaponAttack } from "@dnd/engine";
import { recordOf, type RollRecord } from "../rolls";
import { usedUpBy, withoutUsedUp, type UsedUp } from "../oneTime";
import { damageFor } from "../crit";
import { defaultHands, forHands, handsOf, isVersatile, rememberHands, weaponDiceFor, type Hands } from "../hands";

interface Props {
  title: string;
  base: ComposerBase;
  /** Set for weapon and feature attacks: enables the damage step. */
  attack?: WeaponAttack & { saveNote?: string };
  physical: boolean;
  /** `label`: what to say about the change (3D dice say so). */
  onPhysicalChange: (physical: boolean, label?: string) => void;
  onRolled: (r: RollRecord) => void;
  /** The player's call on an attack roll: Hit, Critical damage or Miss (for effects only). */
  onResolved?: (outcome: "hit" | "crit" | "miss", options: string[]) => void;
  /** Skip the d20: save spells, Magic Missile, healing. */
  damageOnly?: boolean;
  /** The roll heals rather than damages: the result offers "Heal myself". */
  healing?: boolean;
  onHealSelf?: (amount: number) => void;
  /** Who the healing can go to (you, companions, summoned creatures): replaces "Heal myself" with a choice. */
  healTargets?: { targets: HealTarget[]; max: number; selfBack?: { label: string; value: number }; onHeal: (ids: string[], amount: number, perTarget?: Record<string, number>) => void };
  /** A DC the d20 roll must meet (concentration checks). */
  dc?: number;
  /** What the roll is against the DC ("Constitution saving throw"). */
  dcLabel?: string;
  /** Made as a reaction (Riposte and Brace start ticked). */
  reaction?: boolean;
  /** Options that spend something (a superiority die) or are used up (a smite), once the roll that used them is made. */
  onSpend?: (used: { label: string; spends?: { resource: string; amount: number }; endsEffect?: string }[]) => void;
  /** Called with whether the d20 roll met the DC. */
  onCheck?: (passed: boolean) => void;
  /** Extra reminders for this roll (Eldritch Blast beams). */
  notes?: string[];
  /** Shown above the roll (a skill the table gave beyond the rules: its tag and reason). */
  header?: ReactNode;
  /**
   * Ways to change the damage type (Chromatic Orb's choice, Transmuted Spell,
   * Awakened Spellbook). `onUse` runs when damage is rolled with a type from it
   * (Transmuted Spell spends its sorcery point).
   */
  typeChoices?: { label: string; options: string[]; note?: string; onUse?: () => void }[];
  /** Foretelling rolls that can replace the d20 (Portent). */
  portent?: { values: number[]; onUse: (index: number) => void };
  /**
   * Per optional modifier: a warning shown when it's turned on (Steady Aim
   * with no bonus action left, Sneak Attack already used this turn), and
   * whether it starts turned on (Steady Aim already used this turn).
   */
  optionInfo?: Record<string, OptionInfo>;
  /** Called once per attack actually made (at its first roll), to mark the turn. */
  onCommit?: (n: number) => void;
  /** Several separate attacks in a row (Eldritch Blast beams, Extra Attack). */
  repeat?: { count: number; what: string };
  /** The damage options used, when damage is rolled (marks once-per-turn ones like Sneak Attack). */
  onDamageOptions?: (labels: string[]) => void;
  /** The optional modifiers that were on when the d20 was rolled (Steady Aim spends its bonus action). */
  onOptionsUsed?: (labels: string[]) => void;
  /**
   * Things added to an attack roll after seeing it (Focused Aim, Precision
   * Attack): `run` spends what they cost and gives the number added.
   */
  afterRoll?: { label: string; sub?: string; warn?: boolean; group?: string; run: () => { value: number; detail: string } | undefined }[];
  /** Closes the roll (after a miss with no more attacks). */
  onDone?: () => void;
  /** Shown right after the d20 is rolled, with the options that were ticked (ammunition: count one shot?). */
  afterD20?: (enabled: string[]) => ReactNode;
  /** The feature, spell or item rolling these dice ("feature:second-wind"), for its own dice theme. */
  diceSource?: string;
}

/**
 * What the app knows about one optional modifier: a warning, whether it starts
 * on, and for smites the spell slots to spend, with the dice each one gives.
 */
export interface OptionInfo {
  warning?: string;
  preselect?: boolean;
  slots?: {
    choices: { key: string; label: string }[];
    /** A yes/no extra, e.g. "Undead or fiend (+1d8)". */
    extra?: string;
    dice: (key: string, extra: boolean) => string;
    /** Called when the damage is rolled with this option on: spends the slot. */
    onSpend: (key: string) => void;
  };
}

type Stage =
  | { step: "setup" }
  | { step: "d20-result"; record: RollRecord; used?: string[] }
  | { step: "missed"; record: RollRecord }
  | { step: "damage-setup"; crit: boolean; attackRecord?: RollRecord; attackMode?: string; usedGroups?: string[]; carried?: string[] }
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
  usedGroups = [],
  carried = [],
}: {
  base: ComposerBase;
  choices: ComposerChoices;
  setChoices: (c: ComposerChoices) => void;
  withManual: boolean;
  /** Groups already used on this attack's roll (a maneuver): warn, one per attack. */
  usedGroups?: string[];
  /** Options ticked on the attack roll that carry on to this one. */
  carried?: string[];
}) {
  // One option of a group per roll (one maneuver per attack): ticking one unticks the others.
  const toggle = (label: string) => {
    const group = base.suggestions.find((x) => x.label === label)?.group;
    const others = group ? base.suggestions.filter((x) => x.group === group && x.label !== label).map((x) => x.label) : [];
    setChoices({
      ...choices,
      enabled: choices.enabled.includes(label) ? choices.enabled.filter((l) => l !== label) : [...choices.enabled.filter((l) => !others.includes(l)), label],
    });
  };

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
                  {s.spends && resourceNow(s.spends.resource) && (
                    <div className="row-sub">
                      {resourceNow(s.spends.resource)!.name}
                      {resourceNow(s.spends.resource)!.die ? ` (${resourceNow(s.spends.resource)!.die})` : ""}: {resourceNow(s.spends.resource)!.remaining} of {resourceNow(s.spends.resource)!.max} left
                    </div>
                  )}
                  {/* The maneuver used on the roll carrying on to its damage (Feinting Attack) is the same one, not a second. */}
                  {s.group && usedGroups.includes(s.group) && !carried.includes(s.label) && <div className="row-sub danger-text">Already used one on this attack's roll: one {s.group} per attack.</div>}
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

/**
 * Tap the face you rolled. Two taps when rolling with advantage or disadvantage.
 * With Halfling Lucky (`reroll`), a die at or below it is rolled again: the new
 * roll is tapped right after it, in the order the dice code reads them.
 */
function D20Entry({ count, reroll = 0, onDone }: { count: number; reroll?: number; onDone: (values: number[]) => void }) {
  const [values, setValues] = useState<number[]>([]);
  const [dice, setDice] = useState(0);
  const [again, setAgain] = useState(false);
  const pick = (v: number) => {
    const next = [...values, v];
    const left = again ? dice : dice + 1;
    if (!again && reroll > 0 && v <= reroll) {
      setValues(next);
      setDice(left);
      setAgain(true);
      return;
    }
    setAgain(false);
    if (left >= count) onDone(next);
    else {
      setValues(next);
      setDice(left);
    }
  };
  const last = values[values.length - 1];
  return (
    <>
      <p className="note">
        {again
          ? `Lucky: you rolled ${last}. Roll that d20 again and tap the new roll.`
          : count === 1
            ? "Tap what your d20 shows."
            : dice === 0
              ? "Tap the first d20."
              : `First d20: ${last}. Tap the second.`}
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

const ABILITY_WORD: Record<string, string> = { str: "Strength", dex: "Dexterity", con: "Constitution", int: "Intelligence", wis: "Wisdom", cha: "Charisma" };

export function ResultView({ r }: { r: RollRecord }) {
  return (
    <>
      <div className={`result${r.crit ? " crit" : ""}${r.fumble ? " fumble" : ""}`}>
        <b>{r.total}</b>
        {r.crit && <span>Critical</span>}
        {r.fumble && <span>Natural 1</span>}
        {r.byType && Object.keys(r.byType).some((t) => t !== "damage") && (
          <small>
            {Object.entries(r.byType)
              .map(([type, n]) => `${n} ${type}`)
              .join(", ")}
          </small>
        )}
        {r.physical && <small>From your dice</small>}
        {r.thrown && <small>From the 3D dice</small>}
      </div>
      {(r.saves ?? []).map((sv) => (
        <p className="note save-rider" key={sv.label}>
          {sv.total < 0
            ? `DC ${sv.dc} ${ABILITY_WORD[sv.ability] ?? sv.ability} save for the ${sv.type ?? "extra"} damage: on a success it takes ${sv.half ? "half of it" : "none of it"}.`
            : `DC ${sv.dc} ${ABILITY_WORD[sv.ability] ?? sv.ability} save for the ${`${sv.total} ${sv.type ?? ""}`.trim()}: on a success it takes ${
                sv.half ? `${Math.floor(sv.total / 2)} instead (${r.total - sv.total + Math.floor(sv.total / 2)} in all)` : `none of it (${r.total - sv.total} in all)`
              }.`}
        </p>
      ))}
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

export function Composer({ title, base: baseIn, attack, physical, onPhysicalChange, onRolled, onResolved, damageOnly, healing, onHealSelf, healTargets, dc, dcLabel, reaction, onSpend, onCheck, notes, header, typeChoices, portent, onOptionsUsed, optionInfo, onCommit, repeat, onDamageOptions, afterRoll, onDone, diceSource, afterD20 }: Props) {
  const [typePick, setTypePick] = useState<{ via: number; type: string } | null>(null);
  // A smite used on an earlier hit (Extra Attack's first attack, or this one rolled again) is gone: it can't be ticked again.
  const [usedUp, setUsedUp] = useState<UsedUp[]>([]);
  const base = useMemo(() => withoutUsedUp(baseIn, usedUp), [baseIn, usedUp]);
  // Ticked from the start: what the app was told to (Hex on its target), options that wait for the next hit (a smite), and Riposte or Brace on a reaction attack.
  const presetOn = (sg: { label: string; preset?: string }) => optionInfo?.[sg.label]?.preselect || sg.preset === "always" || (sg.preset === "reaction" && reaction);
  const preselected = base.suggestions.filter(presetOn).map((sg) => sg.label);
  const [choices, setChoices] = useState<ComposerChoices>({ enabled: preselected, manual: "none", extra: 0 });
  // Which of several attacks this is, and whether it has been made (marked on the turn) yet.
  const [nth, setNth] = useState(1);
  const [committed, setCommitted] = useState(false);
  const commit = () => {
    if (committed) return;
    setCommitted(true);
    onCommit?.(nth);
  };
  const warningsFor = (enabled: string[]) =>
    enabled.flatMap((l) => (optionInfo?.[l]?.warning ? [{ label: l, warning: optionInfo[l]!.warning! }] : []));
  const nextButton =
    repeat && nth < repeat.count ? (
      <button
        className="big primary wide"
        style={{ marginTop: 12 }}
        onClick={() => {
          setNth(nth + 1);
          setCommitted(false);
          setEntering(false);
          setStage(damageOnly ? { step: "damage-setup", crit: false } : { step: "setup" });
        }}
      >
        Next {repeat.what.replace(/s$/, "")} ({nth + 1} of {repeat.count})
      </button>
    ) : null;
  // Straight to the damage (a spell's healing, a potion): the options that start ticked are ticked (Beacon of Hope when you're under it).
  const [damageChoices, setDamageChoices] = useState<ComposerChoices>(() => ({
    enabled: damageOnly && attack ? attack.damage.bonus.suggestions.filter((x) => optionInfo?.[x.label]?.preselect || x.preset === "always").map((x) => x.label) : [],
    manual: "none",
    extra: 0,
  }));
  /** The last damage or healing rolled, for its maximum (Beacon of Hope on a target). */
  const lastDamage = useRef<Composed | undefined>(undefined);
  /** The damage just rolled die by die (not typed in as one total), for Piercer's reroll of one die. */
  const lastDamageRoll = useRef<ComposedRoll | undefined>(undefined);
  const [rerolledOne, setRerolledOne] = useState(false);
  const [stage, setStage] = useState<Stage>(damageOnly ? { step: "damage-setup", crit: false } : { step: "setup" });
  const [entering, setEntering] = useState(false);

  const d20 = useMemo(() => composeD20(base, choices), [base, choices]);

  // One hand or two: a versatile weapon's choice (its bigger die with two hands); options that need one or the other follow it.
  const [chosenHands, setChosenHands] = useState<Hands>(() => (attack && isVersatile(attack) ? defaultHands(attack.attackId, attack.damage.bonus) : "one"));
  const hands: Hands = attack ? handsOf(attack, chosenHands) : "one";
  const damageBase = useMemo(() => (attack ? forHands(withoutUsedUp(attack.damage.bonus, usedUp), hands) : undefined), [attack, usedUp, hands]);
  // Beacon of Hope (or Overchannel): every die at its maximum.
  const maxed = !!damageBase?.suggestions.some((x) => damageChoices.enabled.includes(x.label) && x.apply.maximize);
  const beaconRolled = damageChoices.enabled.includes(BEACON);
  // Smites: the slot picked decides the dice (Divine Smite with a 3rd-level slot: 4d8).
  const [slotPick, setSlotPick] = useState<Record<string, { key: string; extra: boolean }>>({});
  const smites = Object.entries(optionInfo ?? {}).filter(([label, info]) => info.slots && damageChoices.enabled.includes(label));
  const pickFor = (label: string) => slotPick[label] ?? { key: optionInfo?.[label]?.slots?.choices[0]?.key ?? "", extra: false };
  const damage = useMemo(() => {
    if (!attack || stage.step !== "damage-setup") return undefined;
    const bonus = {
      ...damageBase!,
      suggestions: damageBase!.suggestions.map((sg) => {
        const slots = optionInfo?.[sg.label]?.slots;
        if (!slots) return sg;
        const p = pickFor(sg.label);
        return p.key ? { ...sg, apply: { ...sg.apply, dice: [slots.dice(p.key, p.extra)] } } : sg;
      }),
    };
    const twoHanded = isVersatile(attack) && hands === "two";
    const c = composeDamage(weaponDiceFor(attack, chosenHands), typePick?.type ?? attack.damage.type, bonus, damageChoices, attack.attackId.startsWith("spell:") || attack.attackId.startsWith("item:") || attack.damage.type === "healing" ? attack.name : attack.attackId.startsWith("trait:") ? `${attack.name.replace(/^.*?: /, "")}${attack.damage.type ? ` (${attack.damage.type})` : ""}` : twoHanded ? "Weapon, two hands" : "Weapon");
    return damageFor(c, attack, stage.crit);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attack, damageBase, stage, damageChoices, slotPick, optionInfo, typePick, chosenHands, hands]);

  const [attackMode, setAttackMode] = useState<string | undefined>();

  const startDamage = (crit: boolean, attackRecord?: RollRecord) => {
    // Options turned on for the attack (Sharpshooter) carry over to its damage.
    // Options turned on for the attack carry over to its damage, except one that spent its die on the attack (Precision Attack).
    const shared = [
      // (Feinting Attack spent its die on the feint and carries on to the damage: same tick, no second die.)
      ...choices.enabled.filter((l) => damageBase?.suggestions.some((s) => s.label === l)),
      ...(damageBase?.suggestions.filter(presetOn).map((x) => x.label) ?? []),
    ].filter((l, i, all) => all.indexOf(l) === i);
    setDamageChoices({ enabled: shared, manual: "none", extra: 0 });
    setEntering(false);
    const next: Stage = { step: "damage-setup", crit };
    // A maneuver used on the attack roll (ticked before, or added after seeing it): one per attack.
    const usedGroups = [
      ...base.suggestions.filter((x) => x.group && choices.enabled.includes(x.label)).map((x) => x.group!),
      ...(stage.step === "d20-result" ? (stage.used ?? []) : []),
    ];
    if (usedGroups.length) next.usedGroups = usedGroups;
    if (shared.length) next.carried = choices.enabled.filter((l) => shared.includes(l));
    if (attackRecord) next.attackRecord = attackRecord;
    const mode = attackRecord ? attackMode : d20.d20Mode;
    if (mode) next.attackMode = mode;
    setStage(next);
  };

  // 3D dice (this device's setting): the thrown faces are the roll; the engine does the rest.
  const [dice3d, setDice3d] = useDice3d();
  const throwing3d = !physical && dice3d;
  const [throwing, setThrowing] = useState(false);
  const [throwNote, setThrowNote] = useState<string | undefined>();
  const alive = useRef(true);
  const inAir = useRef(false);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      // Closed while the dice are in the air: nothing is rolled, so the dice don't keep flying.
      if (inAir.current) skipThrow();
    };
  }, []);
  /**
   * A die's theme keys beyond its source's name: the resource its option spends (every maneuver
   * spends a superiority die), and the feature or spell this whole roll is for.
   */
  const keysFor = (source: string | undefined): string[] => {
    const opt = [...base.suggestions, ...(damageBase?.suggestions ?? [])].find((x) => x.label === source);
    // Beacon of Hope: the healing dice in its emerald-gold.
    const beacon = damageChoices.enabled.includes(BEACON) ? ["name:Beacon of Hope"] : [];
    return [...beacon, ...(opt?.spends ? [`resource:${opt.spends.resource}`] : []), ...(diceSource ? [diceSource] : [])];
  };
  /**
   * Throws the dice for `c`, then `done` with the roll. Skipped, or the 3D dice can't be drawn or fail:
   * the app rolls instead and says so. The result is never held up by the dice.
   */
  const throwThen = async (c: Composed, done: (r: ComposedRoll, thrown: boolean) => void, options?: ThrowOptions) => {
    setThrowing(true);
    setThrowNote(undefined);
    inAir.current = true;
    let r: ComposedRoll | undefined;
    try {
      // Raging: your dice are thrown with Rage's force.
      const opts = currentDiceState().raging && !options?.strong ? { ...options, strong: true } : options;
      r = await rollThrown(c, throwDice, undefined, (label, _sides, source) => myDieLook(label, source, keysFor(source)), opts);
    } catch (e) {
      if (alive.current)
        setThrowNote(
          e instanceof SkipError
            ? "Skipped: the app rolled."
            : e instanceof NoWebGLError
              ? "3D dice can't be drawn on this device, so the app rolled."
              : "The 3D dice didn't work this time, so the app rolled.",
        );
    }
    inAir.current = false;
    // Closed while the dice were in the air: nothing was rolled.
    if (!alive.current) return;
    setThrowing(false);
    done(r ?? rollComposed(c), !!r);
  };

  const rollD20 = (values?: number[], composed = d20, done?: ComposedRoll, thrown = false) => {
    const rec = recordOf(dc ? `${title} (DC ${dc})` : title, "d20", done ?? rollComposed(composed, values));
    if (thrown) rec.thrown = true;
    if (attack) rec.attack = true;
    if (choices.enabled.length) rec.options = [...choices.enabled];
    setAttackMode(composed.d20Mode);
    commit();
    if (choices.enabled.length) onOptionsUsed?.(choices.enabled);
    onSpend?.(base.suggestions.filter((x) => choices.enabled.includes(x.label) && (x.spends || x.endsEffect)));
    const usedNow = usedUpBy(base.suggestions, choices.enabled);
    if (usedNow.length) setUsedUp((u) => [...u, ...usedNow]);
    onRolled(rec);
    if (dc !== undefined) onCheck?.(rec.total >= dc);
    setEntering(false);
    setStage({ step: "d20-result", record: rec });
  };

  const rollDamage = (diceTotal?: number, done?: ComposedRoll, thrown = false) => {
    if (!damage || stage.step !== "damage-setup") return;
    const label = `${attack!.name} ${healing ? "healing" : "damage"}${stage.crit ? " (critical)" : ""}`;
    const result = done ?? rollComposed(damage);
    lastDamage.current = damage;
    lastDamageRoll.current = diceTotal === undefined ? result : undefined;
    setRerolledOne(false);
    const rec =
      diceTotal === undefined
        ? recordOf(label, "damage", result)
        : recordOf(label, "damage", { ...result, physical: true }, physicalDamageTotal(damage, diceTotal));
    if (thrown) rec.thrown = true;
    if (diceTotal !== undefined) {
      rec.lines = [
        { source: `Your dice (${diceToRoll(damage)})`, detail: "", total: diceTotal },
        ...damage.terms.flatMap((t, i) => (t.kind === "flat" ? [{ source: damage.sources[i]!, detail: "", total: t.sign * t.value }] : [])),
      ];
    }
    commit();
    for (const [label, info] of smites) {
      const p = pickFor(label);
      if (p.key) info.slots!.onSpend(p.key);
    }
    if (typePick && typePick.type !== attack!.damage.type) typeChoices?.[typePick.via]?.onUse?.();
    onDamageOptions?.(damageChoices.enabled);
    // A maneuver's die is spent once (not again if it was ticked on the attack); a smite is used up.
    const spentOnAttack = choices.enabled;
    onSpend?.(damage.terms.length ? (damageBase?.suggestions ?? []).filter((x) => damageChoices.enabled.includes(x.label) && (x.endsEffect || (x.spends && !spentOnAttack.includes(x.label)))) : []);
    const usedNow = damage.terms.length ? usedUpBy(damageBase?.suggestions ?? [], damageChoices.enabled) : [];
    if (usedNow.length) setUsedUp((u) => [...u, ...usedNow]);
    onRolled(rec);
    setEntering(false);
    const next: Stage = { step: "damage-result", record: rec, crit: stage.crit };
    if (stage.attackRecord) next.attackRecord = stage.attackRecord;
    setStage(next);
  };

  const pickHands = (h: Hands) => {
    if (!attack) return;
    setChosenHands(h);
    rememberHands(attack.attackId, h);
    // Options that no longer fit are unticked; ones that now fit and start ticked (Great Weapon Fighting) are ticked.
    const now = forHands(withoutUsedUp(attack.damage.bonus, usedUp), handsOf(attack, h)).suggestions;
    setDamageChoices((dc) => ({
      ...dc,
      enabled: [...dc.enabled.filter((l) => now.some((x) => x.label === l) || !attack.damage.bonus.suggestions.some((x) => x.label === l)), ...now.filter((x) => presetOn(x) && x.hands && !dc.enabled.includes(x.label)).map((x) => x.label)],
    }));
  };
  const handsSwitch = attack && isVersatile(attack) && (
    <div className="segmented small" role="radiogroup" aria-label="One hand or two">
      {(["one", "two"] as const).map((h) => (
        <button key={h} role="radio" aria-checked={chosenHands === h} onClick={() => pickHands(h)}>
          {h === "one" ? `One hand · ${attack.damage.dice}` : `Two hands · ${attack.damage.versatileDice}`}
        </button>
      ))}
    </div>
  );
  const diceSwitch = (
    <div className="segmented small three" role="radiogroup" aria-label="Who rolls">
      <button role="radio" aria-checked={physical} onClick={() => onPhysicalChange(true)}>
        My dice
      </button>
      <button
        role="radio"
        aria-checked={!physical && !dice3d}
        onClick={() => {
          setDice3d(false);
          if (physical) onPhysicalChange(false);
        }}
      >
        App rolls
      </button>
      <button
        role="radio"
        aria-checked={throwing3d}
        onClick={() => {
          setDice3d(true);
          // From your own dice: the character's setting changes too (and says so). From the app's rolls: only this device's.
          if (physical) onPhysicalChange(false, "3D dice: the faces they land on are your roll.");
        }}
      >
        3D dice
      </button>
    </div>
  );

  const which = repeat && repeat.count > 1 ? <p className="sub-head">{`${repeat.what.replace(/s$/, "").replace(/^./, (c) => c.toUpperCase())} ${nth} of ${repeat.count}`}</p> : null;

  if (stage.step === "setup") {
    return (
      <>
        {header}
        {dc !== undefined && (
          <div className="dc-big dc-target" role="note">
            <span className="dc-num">DC {dc}</span>
            <span className="dc-save">{dcLabel ?? "to succeed"}</span>
          </div>
        )}
        {which}
        {diceSwitch}
        {handsSwitch}
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
            {d20.d20Mode === "advantage" && base.tripleAdvantage && ` ${base.tripleAdvantage}: three d20s, the highest counts.`}
          </p>
        )}
        {d20.d20Mode === "normal" && d20.advantageFrom.length > 0 && d20.disadvantageFrom.length > 0 && (
          <p className="note">
            Advantage ({d20.advantageFrom.join(", ")}) and disadvantage ({d20.disadvantageFrom.join(", ")}) cancel out.
          </p>
        )}
        <Options base={base} choices={choices} setChoices={setChoices} withManual />
        {warningsFor(choices.enabled).map((x) => (
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
          <D20Entry key={`${d20Count(d20)}-${d20Reroll(d20)}`} count={d20Count(d20)} reroll={d20Reroll(d20)} onDone={rollD20} />
        ) : (
          <button className="big primary wide" disabled={throwing} onClick={() => (throwing3d ? throwThen(d20, (r, t) => rollD20(undefined, d20, r, t)) : rollD20())}>
            {throwing ? "Throwing…" : throwing3d ? "Throw the dice" : "Roll"}
          </button>
        )}
        {throwing && (
          <button className="link" onClick={skipThrow}>
            Skip: let the app roll
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

  if (stage.step === "missed") {
    return (
      <>
        <ResultView r={stage.record} />
        <p className="warn">Missed{stage.record.total ? ` with ${stage.record.total}` : ""}.</p>
        <button className="link" onClick={() => setStage({ step: "d20-result", record: stage.record })}>
          Back: change the roll (Focused Aim, Precision Attack…)
        </button>
        {nextButton}
        {!nextButton && onDone && (
          <button className="big primary wide" style={{ marginTop: 12 }} onClick={onDone}>
            Done
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
        {throwNote && <p className="note">{throwNote}</p>}
        {/* Asked after the attack roll (one piece of ammunition shot?): once per attack. */}
        {afterD20 && <Fragment key={`after-${nth}`}>{afterD20(choices.enabled)}</Fragment>}
        {dc !== undefined && (
          <p className={r.total >= dc ? "pass" : "warn"}>
            {r.total >= dc ? `Success against DC ${dc}.` : `Failed against DC ${dc}.`}
          </p>
        )}
        {attack && (
          <>
            {/* After seeing the roll: add to it (Focused Aim, Precision Attack) or nudge it by hand. */}
            <div className="after-roll">
              <span className="sub-head small">Change this roll</span>
              <div className="choice-grid">
                {(afterRoll ?? []).map((o) => {
                  // Once per roll: one Focused Aim (1, 2 or 3 ki), one Precision Attack.
                  const used = stage.used ?? [];
                  // Already ticked before the roll (Precision Attack): not again.
                  const g = o.group ?? o.label;
                  const done = used.includes(g) || base.suggestions.some((x) => choices.enabled.includes(x.label) && (x.label === g || x.group === g));
                  return (
                    <button
                      key={o.label}
                      className={`tag use${o.warn ? " danger-text" : ""}`}
                      disabled={done}
                      onClick={() => {
                        if (done) return;
                        const res = o.run();
                        if (!res) return;
                        setStage({
                          step: "d20-result",
                          record: { ...r, total: r.total + res.value, lines: [...r.lines, { source: o.label, detail: res.detail, total: res.value }] },
                          used: [...used, o.group ?? o.label],
                        });
                      }}
                    >
                      {o.label}
                      {o.sub ? <small> · {o.sub}</small> : null}
                    </button>
                  );
                })}
                {[-1, 1].map((d) => (
                  <button
                    key={d}
                    className="tag"
                    onClick={() => setStage({ ...stage, record: { ...r, total: r.total + d, lines: [...r.lines, { source: "By hand", detail: "", total: d }] } })}
                  >
                    {d > 0 ? "+1" : "−1"}
                  </button>
                ))}
              </div>
            </div>
            <div className="big-actions" style={{ marginTop: 12 }}>
              <button className={`big${r.crit ? "" : " primary"}`} onClick={() => { onResolved?.("hit", r.options ?? []); startDamage(false, r); }}>
                Hit: roll damage
              </button>
              <button className={`big${r.crit ? " primary" : ""}`} onClick={() => { onResolved?.("crit", r.options ?? []); startDamage(true, r); }}>
                Critical damage
              </button>
            </div>
            <button className="big wide miss" style={{ marginTop: 8 }} onClick={() => { onResolved?.("miss", r.options ?? []); setStage({ step: "missed", record: r }); }}>
              Miss
            </button>
          </>
        )}
        {nextButton}
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
        {which}
        {diceSwitch}
        {handsSwitch}
        {/* Hit or critical hit, changeable here too (after "Skip to damage", or a crit the d20 didn't show: a paralysed target). */}
        {!damageOnly && !healing && (
          <div className="segmented small" role="radiogroup" aria-label="Hit or critical hit">
            <button role="radio" aria-checked={!stage.crit} onClick={() => setStage({ ...stage, crit: false })}>
              Hit
            </button>
            <button role="radio" aria-checked={stage.crit} onClick={() => setStage({ ...stage, crit: true })}>
              Critical hit
            </button>
          </div>
        )}
        {stage.crit && (
          <p className="note">
            Critical hit: every damage die is rolled twice
            {attack!.damage.critExtraDice.length ? `, plus ${attack!.damage.critExtraDice.map((p) => `${p.value} more weapon ${p.value === 1 ? "die" : "dice"} (${p.label})`).join(", ")}` : ""}
            {attack!.damage.onCrit.length ? `; ${attack!.damage.onCrit.map((p) => `${p.label} +${p.value}`).join(", ")}` : ""}.
          </p>
        )}
        {usedUp.length > 0 && (
          <p className="note warn">
            Used up on an earlier hit: {[...new Set(usedUp.map((u) => u.label))].join(", ")}. It doesn't apply again (Undo the earlier roll's toast to get it back).
          </p>
        )}
        {dc === undefined && attack?.saveNote && <p className="note">{attack.saveNote}</p>}
        {(damageBase.notes ?? []).map((n) => (
          <p className="note reminder" key={n}>
            <RichText text={n} />
          </p>
        ))}
        {damageBase.minDie && (
          <p className="note reminder">
            {damageBase.minDie.label}: every {damageBase.minDie.types.join("/")} die counts as at least {damageBase.minDie.value}
            {physical ? ". Rolling your own dice: count any lower die as that before you add them up." : " (the app does it)."}
          </p>
        )}
        {stage.attackMode === "disadvantage" && damageChoices.enabled.some((l) => /sneak attack/i.test(l)) && (
          <p className="warn">You rolled this attack with disadvantage: Sneak Attack can't apply. Leave it on only if your DM says so.</p>
        )}
        <FormulaLines c={damage} />
        {(typeChoices ?? []).map((tc, i) => (
          <div className="type-choice" key={tc.label}>
            <p className="sub-head">Damage type: {tc.label}</p>
            <div className="choice-grid">
              {[...new Set([...(i === 0 && attack?.damage.type && !tc.options.includes(attack.damage.type) ? [attack.damage.type] : []), ...tc.options])].map((t) => {
                const on = typePick ? typePick.via === i && typePick.type === t : t === attack?.damage.type;
                return (
                  <button key={t} className="tag" aria-pressed={on} onClick={() => setTypePick(t === attack?.damage.type ? null : { via: i, type: t })} style={{ textTransform: "capitalize" }}>
                    {t}
                  </button>
                );
              })}
            </div>
            {tc.note && <p className="note">{tc.note}</p>}
          </div>
        ))}
        <Options base={damageBase} choices={damageChoices} setChoices={setDamageChoices} withManual={false} {...(stage.usedGroups ? { usedGroups: stage.usedGroups } : {})} {...(stage.carried ? { carried: stage.carried } : {})} />
        {smites.map(([label, info]) => {
          const p = pickFor(label);
          const s = info.slots!;
          return (
            <div className="smite" key={label}>
              <p className="sub-head">{label.replace(/\s*\(.*\)$/, "")}: which slot?</p>
              {s.choices.length === 0 ? (
                <p className="warn">No spell slots left. Turn it off, or keep it if your DM allows.</p>
              ) : (
                <div className="choice-grid">
                  {s.choices.map((ch) => (
                    <button key={ch.key} className="tag" aria-pressed={p.key === ch.key} onClick={() => setSlotPick({ ...slotPick, [label]: { ...p, key: ch.key } })}>
                      {ch.label} · {s.dice(ch.key, p.extra)}
                    </button>
                  ))}
                </div>
              )}
              {s.extra && (
                <label className="row check">
                  <input type="checkbox" checked={p.extra} onChange={() => setSlotPick({ ...slotPick, [label]: { ...p, extra: !p.extra } })} />
                  <div className="row-main">
                    <div className="row-title">{s.extra}</div>
                  </div>
                </label>
              )}
              <p className="note">The slot is spent when you roll the damage.</p>
            </div>
          );
        })}
        {warningsFor(damageChoices.enabled).map((x) => (
          <p className="warn" key={x.label}>
            {x.warning}
          </p>
        ))}
        <p className="formula">{formatFormula(damage.terms).replace(/\[[^\]]*\]/g, "")}</p>
        {physical && maxed ? (
          // Every die at its maximum: nothing to roll.
          <button className="big primary wide beacon" onClick={() => rollDamage()}>
            {healing ? "Maximum healing" : "Maximum damage"}: {rollComposed(damage).result.total}
          </button>
        ) : physical ? (
          entering ? (
            <TotalEntry prompt={`Roll ${diceToRoll(damage)} and type the total of the dice.`} onDone={rollDamage} />
          ) : (
            <button className="big primary wide" onClick={() => setEntering(true)}>
              Enter my dice
            </button>
          )
        ) : (
          <button className="big primary wide" disabled={throwing} onClick={() => (throwing3d ? throwThen(damage, (r, t) => rollDamage(undefined, r, t), stage.crit ? { strong: true, crit: true } : undefined) : rollDamage())}>
            {throwing ? "Throwing…" : throwing3d ? (healing ? "Throw the healing dice" : "Throw the damage dice") : healing ? "Roll healing" : "Roll damage"}
          </button>
        )}
        {throwing && (
          <button className="link" onClick={skipThrow}>
            Skip: let the app roll
          </button>
        )}
      </>
    );
  }

  if (stage.step === "damage-result") {
    return (
      <>
        <ResultView r={stage.record} />
        {throwNote && <p className="note">{throwNote}</p>}
        {!healing && attack?.damage.bonus.rerollOne && !rerolledOne && (
          <RerollOne
            what={attack.damage.bonus.rerollOne}
            roll={lastDamageRoll.current}
            total={stage.record.total}
            onDone={(next, detail) => {
              setRerolledOne(true);
              const rec: RollRecord = next
                ? { ...recordOf(`${stage.record.title}, ${attack.damage.bonus.rerollOne!.label}: one die again`, "damage", next), ...(stage.record.thrown ? { thrown: true } : {}) }
                : { ...stage.record, id: crypto.randomUUID(), at: Date.now(), title: `${stage.record.title}, ${attack.damage.bonus.rerollOne!.label}: one die again`, total: detail!.total, lines: [...stage.record.lines, { source: `${attack.damage.bonus.rerollOne!.label}: a ${detail!.from} rolled again`, detail: `${detail!.from}→${detail!.to}`, total: detail!.to - detail!.from }] };
              if (stage.record.options) rec.options = stage.record.options;
              onRolled(rec);
              setStage({ ...stage, record: rec });
            }}
          />
        )}
        {healing && healTargets && (
          <HealTargets
            targets={healTargets.targets}
            max={healTargets.max}
            amount={stage.record.total}
            beacon={{ rolledMax: beaconRolled, maxAmount: lastDamage.current ? maxTotal(lastDamage.current) : stage.record.total }}
            selfBack={healTargets.selfBack}
            onHeal={(ids, per) => healTargets.onHeal(ids, stage.record.total, per)}
          />
        )}
        {healing && onHealSelf && !healTargets && (
          <button className="big heal wide" onClick={() => onHealSelf(stage.record.total)}>
            Heal myself {stage.record.total}
          </button>
        )}
        {nextButton}
        <button className="link" onClick={() => setStage(damageOnly ? { step: "damage-setup", crit: false } : { step: "setup" })}>
          {damageOnly ? "Roll again" : "Roll this one again"}
        </button>
      </>
    );
  }

  return null;
}

/**
 * Piercer: after the damage, pick one die and roll it again; the new face counts and the
 * total follows. Dice rolled by the app (or thrown): tap the die. Your own dice typed in as
 * one total: what the die showed and what it shows now.
 */
function RerollOne({ what, roll, total, onDone }: { what: { label: string; oncePerTurn?: boolean }; roll: ComposedRoll | undefined; total: number; onDone: (next: ComposedRoll | undefined, typed?: { from: number; to: number; total: number }) => void }) {
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState<number | undefined>();
  const [to, setTo] = useState("");
  const dice = roll
    ? roll.result.terms.flatMap((t, ti) => (t.term.kind === "dice" && t.term.sign > 0 ? t.dice.map((d, di) => ({ ti, di, sides: (t.term as { sides: number }).sides, face: d.value, source: roll.composed.sources[ti] ?? "", dropped: d.dropped })) : [])).filter((d) => !d.dropped)
    : [];
  if (!open)
    return (
      <button className="big wide" onClick={() => setOpen(true)}>
        {what.label}: roll one damage die again{what.oncePerTurn ? " (once per turn)" : ""}
      </button>
    );
  if (roll)
    return (
      <div className="group reroll-one">
        <p className="note">Which die? The new roll counts, even if it's lower.</p>
        <div className="keys" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
          {dice.map((d) => (
            <button key={`${d.ti}-${d.di}`} className="key" title={d.source} onClick={() => onDone(rerollDie(roll, d.ti, d.di, secureRng(d.sides)))}>
              {d.face}
              <small> d{d.sides}</small>
            </button>
          ))}
        </div>
      </div>
    );
  const n = Number(to);
  return (
    <div className="group reroll-one">
      <p className="note">Roll one of your damage dice again. What did it show, and what does it show now?</p>
      <div className="keys" style={{ gridTemplateColumns: "repeat(6, 1fr)" }}>
        {Array.from({ length: 12 }, (_, i) => (
          <button key={i} className={`key${from === i + 1 ? " on" : ""}`} aria-pressed={from === i + 1} onClick={() => setFrom(i + 1)}>
            {i + 1}
          </button>
        ))}
      </div>
      <input className="search" inputMode="numeric" placeholder="It shows now" value={to} onChange={(e) => setTo(e.target.value.replace(/\D/g, ""))} aria-label="The new face" />
      <button className="big primary wide" disabled={from === undefined || !n} onClick={() => onDone(undefined, { from: from!, to: n, total: total - from! + n })}>
        New total: {from !== undefined && n ? total - from + n : "…"}
      </button>
    </div>
  );
}

const BEACON = "Beacon of Hope";

/** The most a roll can give: every die at its maximum. */
function maxTotal(c: Composed): number {
  return rollComposed({ ...c, terms: c.terms.map((t) => (t.kind === "dice" && t.sign > 0 ? { ...t, min: t.sides } : t)) }).result.total;
}
