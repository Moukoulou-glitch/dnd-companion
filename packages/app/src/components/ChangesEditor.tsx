import { ABILITIES, ABILITY_NAMES, SKILL_ABILITY, SKILL_NAMES, SKILLS, type Ability, type Modifier, type Skill } from "@dnd/schema";

/**
 * The changes of a custom effect or a custom spell's effect, row by row: what
 * it changes (attacks, damage, saves, checks, initiative, AC, speed), which
 * abilities for saves and checks (all, or some), which skills for checks, and
 * how (a bonus, a penalty, advantage, disadvantage). Turned into the engine's ordinary modifiers, so the
 * sheet applies them like any other effect.
 */
export type ChangeTarget = "attack" | "damage" | "save" | "check" | "initiative" | "ac" | "speed";
export type ChangeKind = "bonus" | "penalty" | "advantage" | "disadvantage";

export interface ChangeDraft {
  target: ChangeTarget;
  /** Saves and checks: empty (and no skills) means all of them. */
  abilities: Ability[];
  /** Checks only: these skills (a skill of a chosen ability is already included). */
  skills?: Skill[];
  kind: ChangeKind;
  /** Bonus: "2", "1d4" (a typed "-1" is a penalty too). Penalty: "2", "1d4", taken off. Dice only on rolls. */
  value: string;
}

export const TARGETS: { id: ChangeTarget; label: string }[] = [
  { id: "attack", label: "Attack rolls" },
  { id: "damage", label: "Damage" },
  { id: "save", label: "Saving throws" },
  { id: "check", label: "Ability checks" },
  { id: "initiative", label: "Initiative" },
  { id: "ac", label: "Armor Class" },
  { id: "speed", label: "Speed" },
];

/** A flat number only (AC, speed, damage can't take advantage). */
const isStat = (t: ChangeTarget) => t === "ac" || t === "speed";
const rollOnly = (t: ChangeTarget) => t !== "ac" && t !== "speed" && t !== "damage";

export const emptyChange = (): ChangeDraft => ({ target: "attack", abilities: [], kind: "bonus", value: "" });

/** Whether a row is complete enough to become a modifier. */
export function changeValid(d: ChangeDraft): boolean {
  if (d.kind !== "bonus" && d.kind !== "penalty") return rollOnly(d.target);
  return /^-?\d+$/.test(d.value) || (!isStat(d.target) && /^-?\d*d\d+$/.test(d.value));
}

/** The signed amount: a penalty is always taken off, whatever sign was typed. */
function signedValue(d: ChangeDraft): string {
  return d.kind === "penalty" ? `-${d.value.replace(/^-/, "")}` : d.value;
}

/** The chosen skills that aren't already covered by a chosen ability (no +2 twice on Stealth). */
function ownSkills(d: ChangeDraft): Skill[] {
  return (d.skills ?? []).filter((sk) => !d.abilities.includes(SKILL_ABILITY[sk]));
}

/** The engine modifiers for these rows (incomplete rows are left out). */
export function changesToModifiers(drafts: ChangeDraft[], label: string): Modifier[] {
  const out: Modifier[] = [];
  for (const d of drafts) {
    if (!changeValid(d)) continue;
    const selectors =
      d.target === "save" || d.target === "check"
        ? d.abilities.length || (d.target === "check" && ownSkills(d).length)
          ? [...d.abilities.map((a) => `roll.${d.target}.${a}`), ...(d.target === "check" ? ownSkills(d).map((sk) => `roll.check.skill.${sk}`) : [])]
          : [`roll.${d.target}.*`]
        : [{ attack: "roll.attack.*", damage: "roll.damage.*", initiative: "roll.initiative", ac: "stat.ac", speed: "stat.speed.walk" }[d.target]];
    for (const selector of selectors) {
      out.push(
        d.kind === "bonus" || d.kind === "penalty"
          ? { selector, op: "add", value: /^-?\d+$/.test(signedValue(d)) ? Number(signedValue(d)) : signedValue(d), mode: "auto", label }
          : { selector, op: d.kind, mode: "auto", label },
      );
    }
  }
  return out;
}

/** Back from modifiers to rows (editing a custom spell's effect). */
export function modifiersToChanges(mods: Modifier[]): ChangeDraft[] {
  const rows: ChangeDraft[] = [];
  for (const m of mods) {
    const raw = m.value === undefined ? "" : String(m.value);
    // A negative amount comes back as a penalty of that size.
    const kind: ChangeKind = m.op === "advantage" || m.op === "disadvantage" ? m.op : raw.startsWith("-") ? "penalty" : "bonus";
    const value = raw.replace(/^-/, "");
    const ab = /^roll\.(save|check)\.(str|dex|con|int|wis|cha)$/.exec(m.selector);
    const sk = /^roll\.check\.skill\.([a-zA-Z]+)$/.exec(m.selector);
    if (sk && (SKILLS as string[]).includes(sk[1]!)) {
      const same = rows.find((r) => r.target === "check" && r.kind === kind && r.value === value && (r.abilities.length || r.skills?.length));
      if (same) same.skills = [...(same.skills ?? []), sk[1] as Skill];
      else rows.push({ target: "check", abilities: [], skills: [sk[1] as Skill], kind, value });
      continue;
    }
    const target: ChangeTarget | undefined = ab
      ? (ab[1] as ChangeTarget)
      : m.selector === "roll.save.*" ? "save"
      : m.selector === "roll.check.*" ? "check"
      : m.selector === "roll.attack.*" ? "attack"
      : m.selector === "roll.damage.*" ? "damage"
      : m.selector === "roll.initiative" ? "initiative"
      : m.selector === "stat.ac" ? "ac"
      : m.selector === "stat.speed.walk" ? "speed"
      : undefined;
    if (!target) continue;
    // Several abilities with the same change were one row: put them back together.
    const same = ab && rows.find((r) => r.target === target && r.kind === kind && r.value === value && (r.abilities.length || r.skills?.length));
    if (same && ab) same.abilities.push(ab[2] as Ability);
    else rows.push({ target, abilities: ab ? [ab[2] as Ability] : [], kind, value });
  }
  return rows;
}

/** These modifiers in plain words, one line per change: "+2 to Armor Class", "Advantage on Dexterity saving throws". */
export function describeChanges(mods: Modifier[]): string[] {
  return modifiersToChanges(mods).map((d) => {
    const what = TARGETS.find((t) => t.id === d.target)!.label;
    // "Dexterity saving throws", "attack rolls", "Armor Class".
    const named = [...d.abilities.map((a) => ABILITY_NAMES[a]), ...ownSkills(d).map((sk) => SKILL_NAMES[sk])];
    const which = named.length ? `${named.join(", ")} ${what.toLowerCase()}` : d.target === "ac" ? what : what.toLowerCase();
    if (d.kind === "advantage" || d.kind === "disadvantage") return `${d.kind === "advantage" ? "Advantage" : "Disadvantage"} on ${which}`;
    const v = signedValue(d);
    return `${v.startsWith("-") ? v : `+${v}`}${d.target === "speed" ? " ft." : ""} to ${which}`;
  });
}

export function ChangesEditor({ value, onChange }: { value: ChangeDraft[]; onChange: (v: ChangeDraft[]) => void }) {
  const set = (i: number, patch: Partial<ChangeDraft>) => onChange(value.map((d, k) => (k === i ? { ...d, ...patch } : d)));
  return (
    <>
      {value.map((d, i) => (
        <div className="change-row" key={i}>
          <div className="change-head">
            <span className="sub-head">Change {value.length > 1 ? i + 1 : ""}</span>
            {value.length > 1 && (
              <button className="link danger-text" onClick={() => onChange(value.filter((_, k) => k !== i))}>
                Remove
              </button>
            )}
          </div>
          <div className="types wrap" role="radiogroup" aria-label="What it changes">
            {TARGETS.map((x) => (
              <button
                key={x.id}
                className="switch"
                role="radio"
                aria-checked={d.target === x.id}
                aria-pressed={d.target === x.id}
                onClick={() => set(i, { target: x.id, abilities: [], skills: [], ...(rollOnly(x.id) || d.kind === "penalty" ? {} : { kind: "bonus" }) })}
              >
                {x.label}
              </button>
            ))}
          </div>
          {(d.target === "save" || d.target === "check") && (
            <div className="types wrap" role="group" aria-label="Which abilities">
              <button className="switch" aria-pressed={d.abilities.length === 0 && !d.skills?.length} onClick={() => set(i, { abilities: [], skills: [] })}>
                All
              </button>
              {ABILITIES.map((a) => (
                <button
                  key={a}
                  className="switch"
                  aria-pressed={d.abilities.includes(a)}
                  onClick={() => set(i, { abilities: d.abilities.includes(a) ? d.abilities.filter((x) => x !== a) : [...d.abilities, a] })}
                >
                  {ABILITY_NAMES[a]}
                </button>
              ))}
            </div>
          )}
          {d.target === "check" && (
            <details className="skill-pick" open={!!d.skills?.length}>
              <summary>Skills{d.skills?.length ? `: ${d.skills.map((sk) => SKILL_NAMES[sk]).join(", ")}` : ""}</summary>
              <div className="types wrap" role="group" aria-label="Which skills">
                {SKILLS.map((sk) => {
                  const inAbility = d.abilities.includes(SKILL_ABILITY[sk]);
                  const on = inAbility || !!d.skills?.includes(sk);
                  return (
                    <button
                      key={sk}
                      className="switch"
                      aria-pressed={on}
                      disabled={inAbility}
                      title={inAbility ? `Included in ${ABILITY_NAMES[SKILL_ABILITY[sk]]} checks` : undefined}
                      onClick={() => set(i, { skills: d.skills?.includes(sk) ? d.skills.filter((x) => x !== sk) : [...(d.skills ?? []), sk] })}
                    >
                      {SKILL_NAMES[sk]}
                    </button>
                  );
                })}
              </div>
            </details>
          )}
          <div className="segmented small" role="radiogroup" aria-label="How">
            {(rollOnly(d.target) ? (["bonus", "penalty", "advantage", "disadvantage"] as const) : (["bonus", "penalty"] as const)).map((k) => (
              <button key={k} role="radio" aria-checked={d.kind === k} onClick={() => set(i, { kind: k })}>
                {k === "bonus" ? "Bonus" : k === "penalty" ? "Penalty" : k === "advantage" ? "Advantage" : "Disadvantage"}
              </button>
            ))}
          </div>
          {(d.kind === "bonus" || d.kind === "penalty") && (
            <input
              className="search"
              inputMode={isStat(d.target) ? "numeric" : "text"}
              aria-label={d.kind === "penalty" ? "Penalty" : "Bonus"}
              placeholder={
                d.kind === "penalty"
                  ? isStat(d.target) ? "How much it takes off, e.g. 2 or 10" : "How much it takes off, e.g. 2 or 1d4"
                  : isStat(d.target) ? "How much it adds, e.g. 2" : "How much it adds, e.g. 2 or 1d4"
              }
              value={d.value}
              onChange={(e) => set(i, { value: e.target.value.replace(/\s/g, "").toLowerCase() })}
            />
          )}
        </div>
      ))}
      <button className="link" onClick={() => onChange([...value, emptyChange()])}>
        + Another change
      </button>
    </>
  );
}
