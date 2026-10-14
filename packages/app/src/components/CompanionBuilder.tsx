import { useMemo, useState } from "react";
import { companionFromCreature, type ContentRegistry } from "@dnd/engine";
import { ABILITIES, ABILITY_NAMES, type Ability, type CustomCompanion, type OperationType } from "@dnd/schema";
import { MarkdownHelp } from "./Markdown";

type Act = (type: OperationType, payload: unknown, label: string) => unknown;
type Attack = CustomCompanion["attacks"][number];

const SIZES: CustomCompanion["size"][] = ["Tiny", "Small", "Medium", "Large", "Huge", "Gargantuan"];
const KINDS = ["Pet", "Mount", "Hireling", "Animal companion", "Familiar"];
const DAMAGE_TYPES = ["acid", "bludgeoning", "cold", "fire", "force", "lightning", "necrotic", "piercing", "poison", "psychic", "radiant", "slashing", "thunder"] as const;
const newId = () => crypto.randomUUID().slice(0, 8);

/** A number typed in: kept as text while typing, checked against its range. */
function Num({ label, value, onChange, min, max, width }: { label: string; value: string; onChange: (v: string) => void; min: number; max: number; width?: number }) {
  const n = Number(value);
  const bad = value.trim() === "" || !Number.isInteger(n) || n < min || n > max;
  return (
    <input
      className={`search narrow${bad ? " invalid" : ""}`}
      style={width ? { maxWidth: width } : undefined}
      inputMode="numeric"
      aria-label={label}
      aria-invalid={bad}
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/[^0-9-]/g, "").slice(0, 5))}
    />
  );
}
const ok = (v: string, min: number, max: number) => v.trim() !== "" && Number.isInteger(Number(v)) && Number(v) >= min && Number(v) <= max;

/** Draft numbers as text, so a half-typed "-" or "" doesn't jump back. */
interface Draft {
  name: string;
  kind: string;
  from?: string;
  size: CustomCompanion["size"];
  type: string;
  ac: string;
  hpMax: string;
  speed: string;
  abilities: Record<Ability, string>;
  saves: Partial<Record<Ability, string>>;
  senses: string;
  languages: string;
  traits: { name: string; summary: string }[];
  attacks: (Omit<Attack, "toHit" | "damageBonus"> & { toHit: string; damageBonus: string })[];
  notes: string;
  bond?: "rangers-companion";
}

const toDraft = (c: Omit<CustomCompanion, "id">): Draft => ({
  name: c.name,
  kind: c.kind,
  ...(c.from ? { from: c.from } : {}),
  size: c.size,
  type: c.type,
  ac: String(c.ac),
  hpMax: String(c.hpMax),
  speed: c.speed,
  abilities: Object.fromEntries(ABILITIES.map((a) => [a, String(c.abilities[a] ?? 10)])) as Record<Ability, string>,
  saves: Object.fromEntries(Object.entries(c.saves ?? {}).map(([a, v]) => [a, String(v)])),
  senses: c.senses ?? "",
  languages: c.languages ?? "",
  traits: c.traits.map((t) => ({ ...t })),
  attacks: c.attacks.map((a) => ({ ...a, toHit: String(a.toHit), damageBonus: String(a.damageBonus) })),
  notes: c.notes,
  ...(c.bond ? { bond: c.bond } : {}),
});

const BLANK: Omit<CustomCompanion, "id"> = {
  name: "",
  kind: "Pet",
  size: "Medium",
  type: "beast",
  ac: 12,
  hpMax: 5,
  speed: "30 ft.",
  abilities: { str: 10, dex: 10, con: 10, int: 3, wis: 10, cha: 6 },
  traits: [],
  attacks: [],
  notes: "",
};

/** Ranger's Companion: a beast of Medium size or smaller, challenge rating 1/4 or lower. */
export const fitsRangersCompanion = (c: { type: string; size: string; cr?: number }) =>
  /^beast/i.test(c.type) && ["tiny", "small", "medium"].includes(c.size.toLowerCase()) && (c.cr === undefined || c.cr <= 0.25);

/** Starting point: a creature from the content (its numbers copied in), or a blank stat block. */
function StartFrom({ reg, pick, bond }: { reg: ContentRegistry; pick: (d: Draft) => void; bond?: boolean }) {
  const [q, setQ] = useState("");
  const all = useMemo(() => reg.list("creature").filter((c) => !bond || fitsRangersCompanion(c)), [reg, bond]);
  const needle = q.trim().toLowerCase();
  // A Ranger's Companion's choice is short enough to show whole.
  const found = needle ? all.filter((c) => c.name.toLowerCase().includes(needle)).slice(0, 30) : bond ? all.slice().sort((a, b) => a.name.localeCompare(b.name)) : [];
  const kind = bond ? "Animal companion" : "Pet";
  return (
    <>
      <p className="note">
        {bond
          ? "Your Ranger's Companion: a beast of Medium size or smaller with a challenge rating of 1/4 or lower. Its stat block is copied in; the ranger's bonuses are added on top while the feature is in use."
          : "Start from a creature (its stat block is copied in, and you can change anything), or from a blank one."}
      </p>
      <input className="search" type="search" placeholder="Search creatures: mastiff, riding horse, mule…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search creatures" autoFocus />
      {found.length > 0 && (
        <div className="group">
          {found.map((c) => (
            <button key={c.id} className="row" onClick={() => pick(toDraft({ ...BLANK, ...companionFromCreature(c), name: c.name, kind, notes: "", ...(bond ? { bond: "rangers-companion" as const } : {}) }))}>
              <div className="row-main">
                <div className="row-title">{c.name}</div>
                <div className="row-sub">
                  {c.size} {c.type}, CR {c.cr === 0.125 ? "1/8" : c.cr === 0.25 ? "1/4" : c.cr === 0.5 ? "1/2" : c.cr}, AC {c.ac}, {c.hp} HP
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
      {needle && found.length === 0 && <p className="note">No creature called “{q.trim()}”.</p>}
      <button className="big wide" style={{ marginTop: 10 }} onClick={() => pick(toDraft({ ...BLANK, kind, ...(bond ? { bond: "rangers-companion" as const } : {}) }))}>
        Start from a blank stat block
      </button>
    </>
  );
}

/**
 * The Companion Builder: a companion of your own (a pet, a mount, a hireling)
 * with one stat block. Saved, it joins your companions on Play, with its HP,
 * attacks, checks and saves worked out like any companion's.
 */
export function CompanionBuilder({
  reg,
  act,
  editing,
  done,
  bond,
  canBond,
}: {
  reg: ContentRegistry;
  act: Act;
  editing?: CustomCompanion;
  done: (deleted?: boolean) => void;
  /** Start a new Ranger's Companion (only fitting beasts offered). */
  bond?: boolean;
  /** The character has Ranger's Companion: offer to bond this one. */
  canBond?: boolean;
}) {
  const [d, setD] = useState<Draft | undefined>(editing ? toDraft(editing) : undefined);
  const [confirmDelete, setConfirmDelete] = useState(false);
  if (!d) return <StartFrom reg={reg} pick={setD} {...(bond ? { bond } : {})} />;
  const set = (p: Partial<Draft>) => setD({ ...d, ...p });
  const setAttack = (i: number, p: Partial<Draft["attacks"][number]>) => set({ attacks: d.attacks.map((a, k) => (k === i ? { ...a, ...p } : a)) });
  const setTrait = (i: number, p: Partial<Draft["traits"][number]>) => set({ traits: d.traits.map((t, k) => (k === i ? { ...t, ...p } : t)) });

  const problems = [
    !d.name.trim() && "a name",
    !ok(d.ac, 0, 40) && "an AC from 0 to 40",
    !ok(d.hpMax, 1, 9999) && "hit points from 1 to 9999",
    ABILITIES.some((a) => !ok(d.abilities[a], 1, 30)) && "ability scores from 1 to 30",
    Object.values(d.saves).some((v) => v !== undefined && v !== "" && !ok(v, -10, 30)) && "saves from −10 to 30",
    d.attacks.some((a) => !a.name.trim() || !ok(a.toHit, -10, 30) || !ok(a.damageBonus || "0", -20, 50) || !/^\d*d\d+$|^\d+$|^$/.test(a.damage.trim())) && "each attack's name, bonus and damage dice (like 1d6)",
    d.traits.some((t) => !t.name.trim()) && "a name for each trait",
  ].filter(Boolean) as string[];

  const save = () => {
    const saves = Object.fromEntries(Object.entries(d.saves).filter(([, v]) => v !== undefined && v !== "").map(([a, v]) => [a, Number(v)]));
    const companion: CustomCompanion = {
      id: editing?.id ?? newId(),
      name: d.name.trim(),
      kind: d.kind.trim(),
      ...(d.from ? { from: d.from } : {}),
      size: d.size,
      type: d.type.trim() || "beast",
      ac: Number(d.ac),
      hpMax: Number(d.hpMax),
      speed: d.speed.trim() || "30 ft.",
      abilities: Object.fromEntries(ABILITIES.map((a) => [a, Number(d.abilities[a])])) as Record<Ability, number>,
      ...(Object.keys(saves).length ? { saves } : {}),
      ...(d.senses.trim() ? { senses: d.senses.trim() } : {}),
      ...(d.languages.trim() ? { languages: d.languages.trim() } : {}),
      traits: d.traits.map((t) => ({ name: t.name.trim(), summary: t.summary.trim() })),
      attacks: d.attacks.map((a) => {
        const out: Attack = { name: a.name.trim(), kind: a.kind, toHit: Number(a.toHit), damage: a.damage.trim(), damageBonus: Number(a.damageBonus || 0), damageType: a.damageType };
        if (a.reach?.trim()) out.reach = a.reach.trim();
        if (a.note?.trim()) out.note = a.note.trim();
        return out;
      }),
      notes: d.notes.trim(),
      ...(d.bond ? { bond: d.bond } : {}),
    };
    act("setCustomCompanion", { companion }, editing ? `${companion.name} changed.` : `${companion.name} joins your companions.`);
    done();
  };

  const field = (label: string, child: React.ReactNode, hint?: string) => (
    <label className="story-field">
      <span className="row-title">{label}</span>
      {hint && <span className="row-sub">{hint}</span>}
      {child}
    </label>
  );

  return (
    <div className="custom-form companion-builder">
      {d.from && <p className="row-sub">Started from {reg.find(d.from, "creature")?.name ?? d.from}.</p>}
      {field("Name", <input className="search" value={d.name} maxLength={60} onChange={(e) => set({ name: e.target.value })} aria-label="Companion name" />)}
      {field(
        "What it is to you",
        <>
          <div className="types wrap" role="group" aria-label="Kind of companion">
            {KINDS.map((k) => (
              <button key={k} className="switch" aria-pressed={d.kind === k} onClick={() => set({ kind: k })}>
                {k}
              </button>
            ))}
          </div>
          <input className="search" value={d.kind} maxLength={40} placeholder="Or your own word" onChange={(e) => set({ kind: e.target.value })} aria-label="Kind (your own word)" />
        </>,
      )}
      <div className="group">
        <div className="row">
          <div className="row-main row-title">Size</div>
          <select className="search" value={d.size} onChange={(e) => set({ size: e.target.value as CustomCompanion["size"] })} aria-label="Size" style={{ maxWidth: 160 }}>
            {SIZES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </div>
        <div className="row">
          <div className="row-main row-title">Type</div>
          <input className="search" value={d.type} maxLength={40} onChange={(e) => set({ type: e.target.value })} aria-label="Creature type" style={{ maxWidth: 160 }} />
        </div>
        <div className="row">
          <div className="row-main row-title">Armor Class</div>
          <Num label="Armor Class" value={d.ac} min={0} max={40} onChange={(v) => set({ ac: v })} />
        </div>
        <div className="row">
          <div className="row-main row-title">Hit point maximum</div>
          <Num label="Hit point maximum" value={d.hpMax} min={1} max={9999} onChange={(v) => set({ hpMax: v })} />
        </div>
      </div>
      {field("Speed", <input className="search" value={d.speed} maxLength={120} onChange={(e) => set({ speed: e.target.value })} aria-label="Speed" />)}

      <h2 className="sub-head">Abilities</h2>
      <p className="note">The score; a save only when its stat block lists one (otherwise it's the modifier).</p>
      <div className="group">
        {ABILITIES.map((a) => (
          <div className="row" key={a}>
            <div className="row-main row-title">{ABILITY_NAMES[a]}</div>
            <Num label={`${ABILITY_NAMES[a]} score`} value={d.abilities[a]} min={1} max={30} onChange={(v) => set({ abilities: { ...d.abilities, [a]: v } })} width={70} />
            <input
              className="search narrow"
              style={{ maxWidth: 80 }}
              inputMode="numeric"
              placeholder="save"
              aria-label={`${ABILITY_NAMES[a]} save (optional)`}
              value={d.saves[a] ?? ""}
              onChange={(e) => set({ saves: { ...d.saves, [a]: e.target.value.replace(/[^0-9-]/g, "").slice(0, 3) } })}
            />
          </div>
        ))}
      </div>
      {field("Senses", <input className="search" value={d.senses} maxLength={200} placeholder="passive Perception 13" onChange={(e) => set({ senses: e.target.value })} aria-label="Senses" />)}
      {field("Languages", <input className="search" value={d.languages} maxLength={200} placeholder="understands Common but can't speak" onChange={(e) => set({ languages: e.target.value })} aria-label="Languages" />)}

      <h2 className="sub-head">Attacks</h2>
      {d.attacks.map((a, i) => (
        <div className="change-row" key={i}>
          <div className="change-head">
            <input className="search" value={a.name} maxLength={60} placeholder="Bite" onChange={(e) => setAttack(i, { name: e.target.value })} aria-label="Attack name" />
            <button className="link danger-text" onClick={() => set({ attacks: d.attacks.filter((_, k) => k !== i) })}>
              Remove
            </button>
          </div>
          <div className="segmented small" role="radiogroup" aria-label="Melee or ranged">
            {(["melee", "ranged"] as const).map((k) => (
              <button key={k} role="radio" aria-checked={a.kind === k} onClick={() => setAttack(i, { kind: k })}>
                {k === "melee" ? "Melee" : "Ranged"}
              </button>
            ))}
          </div>
          <div className="group">
            <div className="row">
              <div className="row-main row-title">To hit</div>
              <Num label="To hit" value={a.toHit} min={-10} max={30} onChange={(v) => setAttack(i, { toHit: v })} />
            </div>
            <div className="row">
              <div className="row-main row-title">Damage dice</div>
              <input className="search narrow" value={a.damage} maxLength={20} placeholder="1d6" aria-label="Damage dice" onChange={(e) => setAttack(i, { damage: e.target.value.replace(/\s/g, "").toLowerCase() })} />
            </div>
            <div className="row">
              <div className="row-main row-title">Damage bonus</div>
              <Num label="Damage bonus" value={a.damageBonus} min={-20} max={50} onChange={(v) => setAttack(i, { damageBonus: v })} />
            </div>
            <div className="row">
              <div className="row-main row-title">Damage type</div>
              <select className="search" value={a.damageType} onChange={(e) => setAttack(i, { damageType: e.target.value as Attack["damageType"] })} aria-label="Damage type" style={{ maxWidth: 160 }}>
                {DAMAGE_TYPES.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </div>
            <div className="row">
              <div className="row-main row-title">Reach or range</div>
              <input className="search narrow" style={{ maxWidth: 140 }} value={a.reach ?? ""} maxLength={60} placeholder="5 ft." aria-label="Reach or range" onChange={(e) => setAttack(i, { reach: e.target.value })} />
            </div>
          </div>
          <input className="search" value={a.note ?? ""} maxLength={400} placeholder="What else a hit does (shown, not applied)" aria-label="Attack note" onChange={(e) => setAttack(i, { note: e.target.value })} />
        </div>
      ))}
      <button className="link" onClick={() => set({ attacks: [...d.attacks, { name: "", kind: "melee", toHit: "3", damage: "1d6", damageBonus: "0", damageType: "piercing" }] })}>
        + Add an attack
      </button>

      <h2 className="sub-head">Traits</h2>
      {d.traits.map((t, i) => (
        <div className="change-row" key={i}>
          <div className="change-head">
            <input className="search" value={t.name} maxLength={80} placeholder="Keen Smell" onChange={(e) => setTrait(i, { name: e.target.value })} aria-label="Trait name" />
            <button className="link danger-text" onClick={() => set({ traits: d.traits.filter((_, k) => k !== i) })}>
              Remove
            </button>
          </div>
          <textarea className="story-text" rows={2} value={t.summary} maxLength={2000} onChange={(e) => setTrait(i, { summary: e.target.value })} aria-label="What the trait does" />
        </div>
      ))}
      <button className="link" onClick={() => set({ traits: [...d.traits, { name: "", summary: "" }] })}>
        + Add a trait
      </button>

      {field("Notes", <textarea className="story-text" rows={4} value={d.notes} maxLength={4000} onChange={(e) => set({ notes: e.target.value })} aria-label="Notes" placeholder="Where you found it, what it likes, what it's afraid of…" />)}
      <MarkdownHelp />

      {(canBond || d.bond) && (
        <label className="row check">
          <input type="checkbox" checked={!!d.bond} onChange={() => set(d.bond ? { bond: undefined } : { bond: "rangers-companion" })} />
          <div className="row-main">
            <div className="row-title">Bonded as your Ranger's Companion</div>
            <div className="row-sub">Adds your proficiency bonus to its AC, attacks, damage and the saves its stat block lists; its HP max is at least 4 × your ranger level.</div>
          </div>
        </label>
      )}
      {d.bond && !fitsRangersCompanion({ type: d.type, size: d.size, ...(d.from ? { cr: reg.find(d.from, "creature")?.cr } : {}) }) && (
        <p className="warn">A Ranger's Companion is a beast of Medium size or smaller with a challenge rating of 1/4 or lower. This one isn't; keep it if your DM agrees.</p>
      )}

      {problems.length > 0 && <p className="note danger-text">Still needs {problems.join(", ")}.</p>}
      <div className="big-actions">
        {editing &&
          (confirmDelete ? (
            <button
              className="big damage"
              onClick={() => {
                act("removeCustomCompanion", { id: editing.id }, `${editing.name} removed.`);
                done(true);
              }}
            >
              Delete it
            </button>
          ) : (
            <button className="big" onClick={() => setConfirmDelete(true)}>
              Delete
            </button>
          ))}
        <button className="big primary" disabled={problems.length > 0} onClick={save}>
          {editing ? "Save" : "Add companion"}
        </button>
      </div>
      {editing && confirmDelete && <p className="note">Deleting it also forgets its hit points and tags. Undo brings it back.</p>}
    </div>
  );
}
