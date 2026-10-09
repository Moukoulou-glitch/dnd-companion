import { useState } from "react";
import { ABILITIES, ABILITY_NAMES, SKILL_NAMES, SKILLS, type Character, type OperationType } from "@dnd/schema";
import { NumberStep } from "./Adjust";

type Act = (type: OperationType, payload: unknown, label: string) => unknown;
export type AdjustKind = "save" | "skill" | "passive";

const ALL: Record<AdjustKind, string> = { save: "All saving throws", skill: "All skills", passive: "All passive senses" };

/** What can be adjusted: all of them together, then each one. */
function itemsOf(kind: AdjustKind): { key: string; label: string }[] {
  const all = { key: `${kind}.all`, label: ALL[kind] };
  if (kind === "save") return [all, ...ABILITIES.map((a) => ({ key: `save.${a}`, label: ABILITY_NAMES[a] }))];
  if (kind === "skill") return [all, ...SKILLS.map((s) => ({ key: `skill.${s}`, label: SKILL_NAMES[s] }))];
  return [all, ...(["perception", "investigation", "insight"] as const).map((s) => ({ key: `passive.${s}`, label: `Passive ${SKILL_NAMES[s]}` }))];
}

/**
 * Bonuses and penalties by hand: on all saves (or skills, or passive senses)
 * at once, or on one of them, each with an optional reason. They show in the
 * breakdowns like everything else.
 */
export function RollAdjustPanel({ kind, c, act }: { kind: AdjustKind; c: Character; act: Act }) {
  const [openKey, setOpenKey] = useState<string | null>(`${kind}.all`);
  return (
    <>
      <p className="note">A bonus and a penalty can both be on at once (a blessing and a curse). Tap a line to change it; both at 0 clears it.</p>
      <div className="group">
        {itemsOf(kind).map((it) => {
          const a = c.rollAdjust[it.key];
          const summary = a ? [a.bonus ? `+${a.bonus}` : "", a.penalty ? `−${a.penalty}` : ""].filter(Boolean).join(" / ") : "";
          return (
            <div key={it.key} className={`adjust-item${a ? " set" : ""}`}>
              <button className="row" onClick={() => setOpenKey(openKey === it.key ? null : it.key)} aria-expanded={openKey === it.key}>
                <div className="row-main">
                  <div className="row-title">{it.label}</div>
                  {a?.note && <div className="row-sub">{a.note}</div>}
                </div>
                {summary && <span className="tag extra-tag">{summary}</span>}
              </button>
              {openKey === it.key && <AdjustEditor k={it.key} label={it.label} c={c} act={act} />}
            </div>
          );
        })}
      </div>
    </>
  );
}

function AdjustEditor({ k, label, c, act }: { k: string; label: string; c: Character; act: Act }) {
  const a = c.rollAdjust[k] ?? { bonus: 0, penalty: 0 };
  const [note, setNote] = useState(a.note ?? "");
  return (
    <div className="adjust-editor">
      <NumberStep label="Bonus" value={a.bonus} max={20} onChange={(n) => act("setRollAdjust", { key: k, bonus: n }, `${label}: bonus ${n}.`)} />
      <NumberStep label="Penalty" value={a.penalty} max={20} onChange={(n) => act("setRollAdjust", { key: k, penalty: n }, `${label}: penalty ${n}.`)} />
      <input
        className="search"
        placeholder="Why (Cloak of Protection, a curse…)"
        value={note}
        maxLength={80}
        onChange={(e) => setNote(e.target.value)}
        onBlur={() => note !== (a.note ?? "") && act("setRollAdjust", { key: k, note }, `${label}: ${note || "no reason"}.`)}
        aria-label={`${label}: why`}
      />
    </div>
  );
}
