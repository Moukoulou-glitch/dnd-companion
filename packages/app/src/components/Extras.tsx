import { useMemo, useState } from "react";
import { LANGUAGES, TOOLS, type ContentRegistry, type DerivedSheet } from "@dnd/engine";
import { shortText } from "../text";
import { ABILITY_NAMES, EXTRA_TAGS, SKILLS, SKILL_NAMES, type Ability, type ExtraNote, type ExtraTag, type OperationType, type Skill } from "@dnd/schema";

type Act = (type: OperationType, payload: unknown, label: string) => unknown;
export type ExtraKind = "skill" | "expertise" | "language" | "tool" | "weapon" | "armor" | "feat" | "spell";

export const KIND_NAMES: Record<ExtraKind, { one: string; question: string }> = {
  skill: { one: "Skill proficiency", question: "How did you gain this skill proficiency?" },
  expertise: { one: "Expertise", question: "How did you gain this expertise?" },
  language: { one: "Language", question: "How did you learn this language?" },
  tool: { one: "Tool proficiency", question: "How did you gain this tool proficiency?" },
  weapon: { one: "Weapon proficiency", question: "How did you gain this weapon proficiency?" },
  armor: { one: "Armor proficiency", question: "How did you gain this armor proficiency?" },
  feat: { one: "Feat", question: "How did you gain this feat?" },
  spell: { one: "Spell", question: "How did you gain this spell?" },
};

/** Red banner for anything beyond what the rules give. */
export function BeyondBanner({ text }: { text: string }) {
  return (
    <p className="over-banner" role="alert">
      {text}
    </p>
  );
}

/** The tag and the player's own words for how they came by something extra. */
export function ExtraNoteForm({
  question,
  initial,
  onSave,
  saveLabel = "Save",
  onCancel,
}: {
  question: string;
  initial?: Partial<ExtraNote>;
  onSave: (note: ExtraNote) => void;
  saveLabel?: string;
  onCancel?: () => void;
}) {
  const [tag, setTag] = useState<ExtraTag | undefined>(initial?.tag);
  const [reason, setReason] = useState(initial?.reason ?? "");
  const ready = !!tag && reason.trim().length > 0;
  return (
    <div className="extra-form">
      <p className="sub-head">{question}</p>
      <textarea
        maxLength={250}
        rows={3}
        placeholder="In your own words: my DM gave it to me for…"
        value={reason}
        onChange={(e) => setReason(e.target.value.slice(0, 250))}
        aria-label="Reason"
      />
      <div className="extra-count">{reason.length}/250</div>
      <div className="choice-grid" role="radiogroup" aria-label="Tag">
        {EXTRA_TAGS.map((t) => (
          <button key={t} role="radio" aria-checked={tag === t} className={`chip${tag === t ? " on" : ""}`} onClick={() => setTag(t)}>
            {t}
          </button>
        ))}
      </div>
      <div className="confirm">
        {onCancel && (
          <button className="big" onClick={onCancel}>
            Cancel
          </button>
        )}
        <button className="big primary" disabled={!ready} onClick={() => tag && onSave({ tag, reason: reason.trim() })}>
          {ready ? saveLabel : !tag ? "Pick a tag" : "Write why"}
        </button>
      </div>
    </div>
  );
}

/** A small read-only line: tag and reason, with an edit button. */
export function ExtraBox({ note, onEdit }: { note: { tag: string; reason: string }; onEdit?: () => void }) {
  return (
    <div className="extra-box">
      <span className="tag extra-tag">{note.tag}</span>
      <span className="extra-reason">{note.reason || "No reason written."}</span>
      {onEdit && (
        <button className="link" onClick={onEdit}>
          Edit
        </button>
      )}
    </div>
  );
}

/** An extra already on the character: see it, change its tag and reason, or take it away. */
export function ExtraEditor({ extra, act, done }: { extra: DerivedSheet["extras"][number]; act: Act; done: () => void }) {
  const [editing, setEditing] = useState(false);
  return (
    <>
      <BeyondBanner text={`${KIND_NAMES[extra.kind].one}: ${extra.name}, beyond what the rules give.`} />
      {editing ? (
        <ExtraNoteForm
          question={KIND_NAMES[extra.kind].question}
          initial={extra as { tag: ExtraTag; reason: string }}
          onCancel={() => setEditing(false)}
          onSave={(n) => {
            act("updateExtra", { id: extra.id, ...n }, `${extra.name}: reason saved.`);
            setEditing(false);
          }}
        />
      ) : (
        <ExtraBox note={extra} onEdit={() => setEditing(true)} />
      )}
      <button
        className="link danger-text"
        style={{ marginTop: 16 }}
        onClick={() => {
          act("removeExtra", { id: extra.id }, `${extra.name} taken away.`);
          done();
        }}
      >
        Take {extra.name} away
      </button>
    </>
  );
}

/** Inline note under a roll or a feature: the extra's tag and reason, editable in place. */
export function ExtraInline({ extra, act }: { extra: DerivedSheet["extras"][number]; act: Act }) {
  const [editing, setEditing] = useState(false);
  return editing ? (
    <ExtraNoteForm
      question={KIND_NAMES[extra.kind].question}
      initial={extra as { tag: ExtraTag; reason: string }}
      onCancel={() => setEditing(false)}
      onSave={(n) => {
        act("updateExtra", { id: extra.id, ...n }, "Reason saved.");
        setEditing(false);
      }}
    />
  ) : (
    <ExtraBox note={extra} onEdit={() => setEditing(true)} />
  );
}

/**
 * Add something the table gave beyond the rules: a feat without the level, a
 * skill for good roleplay. Red banner, then how it was gained: a tag and the
 * player's own words.
 */
export function AddExtraPanel({ sheet, reg, act, done }: { sheet: DerivedSheet; reg: ContentRegistry; act: Act; done: () => void }) {
  const [kind, setKind] = useState<ExtraKind | undefined>();
  const [value, setValue] = useState<string | undefined>();
  const [q, setQ] = useState("");
  const [list, setList] = useState<string | undefined>(sheet.spellcasting[0]?.id);
  const [ability, setAbility] = useState<Ability>("cha");

  const options = useMemo((): { value: string; label: string; sub?: string; have?: boolean }[] => {
    if (!kind) return [];
    if (kind === "skill") return SKILLS.map((s) => ({ value: s, label: SKILL_NAMES[s], have: sheet.skills[s].proficiency > 0 }));
    if (kind === "expertise") return SKILLS.map((s) => ({ value: s, label: SKILL_NAMES[s], sub: sheet.skills[s].proficiency > 0 ? "proficient" : "not proficient yet", have: sheet.skills[s].proficiency === 2 }));
    if (kind === "language") return LANGUAGES.map((l) => ({ value: l, label: l, have: sheet.proficiencies.languages.includes(l) }));
    if (kind === "tool") return TOOLS.map((t) => ({ value: t, label: t, have: sheet.proficiencies.tools.some((x) => x.toLowerCase() === t.toLowerCase()) }));
    if (kind === "weapon") {
      const groups = [...new Set(reg.list("item").flatMap((i) => (i.weapon ? [i.weapon.group] : [])))].filter(Boolean).sort();
      const has = (v: string) => sheet.proficiencies.weapons.some((x) => x.toLowerCase() === v.toLowerCase());
      return [
        { value: "simple", label: "Simple weapons", sub: "every simple weapon", have: has("simple") },
        { value: "martial", label: "Martial weapons", sub: "every martial weapon", have: has("martial") },
        ...groups.map((g) => ({ value: g, label: g.replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase()), have: has(g) })),
      ];
    }
    if (kind === "armor")
      return (["light", "medium", "heavy", "shields"] as const).map((a) => ({ value: a, label: a === "shields" ? "Shields" : `${a[0]!.toUpperCase()}${a.slice(1)} armor`, have: sheet.proficiencies.armor.includes(a) }));
    if (kind === "feat") return reg.list("feat").map((f) => ({ value: f.id, label: f.name, ...(f.summary || f.text?.length ? { sub: f.summary ?? shortText(f.text) } : {}), have: sheet.features.some((x) => x.id === f.id) }));
    return reg
      .list("spell")
      .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name))
      .map((s) => ({ value: s.id, label: s.name, sub: `${s.level === 0 ? "Cantrip" : `Level ${s.level}`}, ${s.school.toLowerCase()}`, have: sheet.spells.some((x) => x.id === s.id) }));
  }, [kind, sheet, reg]);
  const shown = options.filter((o) => o.label.toLowerCase().includes(q.trim().toLowerCase()));
  const picked = options.find((o) => o.value === value);

  if (!kind)
    return (
      <>
        <p className="note">Something your DM or table gave you beyond the rules: a feat without the level, a skill for your roleplay, a spell from your backstory. The app asks how you came by it and keeps the reason with it.</p>
        <div className="group">
          {(Object.keys(KIND_NAMES) as ExtraKind[]).map((k) => (
            <button className="row" key={k} onClick={() => setKind(k)}>
              <div className="row-main row-title">{KIND_NAMES[k].one}</div>
            </button>
          ))}
        </div>
      </>
    );

  if (!value || !picked)
    return (
      <>
        <p className="note">
          Which {KIND_NAMES[kind].one.toLowerCase()}?{" "}
          <button className="link" onClick={() => setKind(undefined)}>
            Something else
          </button>
        </p>
        {options.length > 12 && <input className="search" type="search" placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} />}
        <div className="group">
          {shown.map((o) => (
            <button className="row" key={o.value} onClick={() => setValue(o.value)}>
              <div className="row-main">
                <div className="row-title">{o.label}</div>
                {o.sub && <div className="row-sub">{o.sub}</div>}
              </div>
              {o.have && <span className="tag">have it</span>}
            </button>
          ))}
        </div>
      </>
    );

  return (
    <>
      <BeyondBanner text={`${picked.label}: this is more than your character gets by the rules.${picked.have ? " You already have it." : ""}`} />
      {kind === "spell" && (
        <>
          <p className="sub-head">Cast with</p>
          <div className="choice-grid">
            {sheet.spellcasting.map((sc) => (
              <button key={sc.id} className={`chip${list === sc.id ? " on" : ""}`} onClick={() => setList(sc.id)}>
                {sc.label}
              </button>
            ))}
            <button className={`chip${list === undefined ? " on" : ""}`} onClick={() => setList(undefined)}>
              Its own ability
            </button>
          </div>
          {list === undefined && (
            <div className="choice-grid" style={{ marginTop: 8 }}>
              {(["int", "wis", "cha"] as const).map((a) => (
                <button key={a} className={`chip${ability === a ? " on" : ""}`} onClick={() => setAbility(a)}>
                  {ABILITY_NAMES[a]}
                </button>
              ))}
            </div>
          )}
        </>
      )}
      <ExtraNoteForm
        question={KIND_NAMES[kind].question}
        saveLabel={`Add ${picked.label}`}
        onCancel={() => setValue(undefined)}
        onSave={(n) => {
          act(
            "addExtra",
            { id: crypto.randomUUID().slice(0, 8), kind, value, ...(kind === "spell" ? (list ? { list } : { ability }) : {}), ...n },
            `${picked.label} added (${n.tag}).`,
          );
          done();
        }}
      />
    </>
  );
}

/** The extra for a skill, if the table gave its proficiency or expertise. */
export function skillExtra(sheet: DerivedSheet, s: Skill) {
  return sheet.extras.find((x) => (x.kind === "skill" || x.kind === "expertise") && x.value === s);
}
