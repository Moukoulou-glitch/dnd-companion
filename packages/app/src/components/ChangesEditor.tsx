import { ABILITIES, ABILITY_NAMES, type Ability, type Modifier } from "@dnd/schema";

/**
 * The changes of a custom effect or a custom spell's effect, row by row: what
 * it changes (attacks, damage, saves, checks, initiative, AC, speed), which
 * abilities for saves and checks (all, or some), and how (a bonus or penalty,
 * advantage, disadvantage). Turned into the engine's ordinary modifiers, so the
 * sheet applies them like any other effect.
 */
export type ChangeTarget = "attack" | "damage" | "save" | "check" | "initiative" | "ac" | "speed";
export type ChangeKind = "bonus" | "advantage" | "disadvantage";

export interface ChangeDraft {
  target: ChangeTarget;
  /** Saves and checks: empty means all of them. */
  abilities: Ability[];
  kind: ChangeKind;
  /** Bonus/Penalty: "2", "-1", "1d4", "-1d4" (dice only on rolls). */
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
  if (d.kind !== "bonus") return rollOnly(d.target);
  return /^-?\d+$/.test(d.value) || (!isStat(d.target) && /^-?\d*d\d+$/.test(d.value));
}

/** The engine modifiers for these rows (incomplete rows are left out). */
export function changesToModifiers(drafts: ChangeDraft[], label: string): Modifier[] {
  const out: Modifier[] = [];
  for (const d of drafts) {
    if (!changeValid(d)) continue;
    const selectors =
      d.target === "save" || d.target === "check"
        ? d.abilities.length
          ? d.abilities.map((a) => `roll.${d.target}.${a}`)
          : [`roll.${d.target}.*`]
        : [{ attack: "roll.attack.*", damage: "roll.damage.*", initiative: "roll.initiative", ac: "stat.ac", speed: "stat.speed.walk" }[d.target]];
    for (const selector of selectors) {
      out.push(
        d.kind === "bonus"
          ? { selector, op: "add", value: /^-?\d+$/.test(d.value) ? Number(d.value) : d.value, mode: "auto", label }
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
    const kind: ChangeKind = m.op === "advantage" || m.op === "disadvantage" ? m.op : "bonus";
    const value = m.value === undefined ? "" : String(m.value);
    const ab = /^roll\.(save|check)\.(str|dex|con|int|wis|cha)$/.exec(m.selector);
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
    const same = ab && rows.find((r) => r.target === target && r.kind === kind && r.value === value && r.abilities.length);
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
    const which = d.abilities.length ? `${d.abilities.map((a) => ABILITY_NAMES[a]).join(", ")} ${what.toLowerCase()}` : d.target === "ac" ? what : what.toLowerCase();
    if (d.kind !== "bonus") return `${d.kind === "advantage" ? "Advantage" : "Disadvantage"} on ${which}`;
    return `${d.value.startsWith("-") ? d.value : `+${d.value}`}${d.target === "speed" ? " ft." : ""} to ${which}`;
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
                onClick={() => set(i, { target: x.id, abilities: [], ...(rollOnly(x.id) ? {} : { kind: "bonus" }) })}
              >
                {x.label}
              </button>
            ))}
          </div>
          {(d.target === "save" || d.target === "check") && (
            <div className="types wrap" role="group" aria-label="Which abilities">
              <button className="switch" aria-pressed={d.abilities.length === 0} onClick={() => set(i, { abilities: [] })}>
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
          {rollOnly(d.target) && (
            <div className="segmented small" role="radiogroup" aria-label="How">
              {(["bonus", "advantage", "disadvantage"] as const).map((k) => (
                <button key={k} role="radio" aria-checked={d.kind === k} onClick={() => set(i, { kind: k })}>
                  {k === "bonus" ? "Bonus/Penalty" : k === "advantage" ? "Advantage" : "Disadvantage"}
                </button>
              ))}
            </div>
          )}
          {d.kind === "bonus" && (
            <input
              className="search"
              aria-label="Bonus/Penalty"
              placeholder={isStat(d.target) ? "Bonus/Penalty, e.g. 2 or -10" : "Bonus/Penalty, e.g. 2, -1, 1d4 or -1d4"}
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
