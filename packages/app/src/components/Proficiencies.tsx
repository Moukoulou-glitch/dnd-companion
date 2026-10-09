import { useState } from "react";
import type { DerivedSheet } from "@dnd/engine";
import { ABILITIES, ABILITY_NAMES, SKILLS, SKILL_NAMES, type Ability, type OperationType, type Skill } from "@dnd/schema";

type Act = (type: OperationType, payload: unknown, label: string) => unknown;
type Kind = "save" | "skill" | "expertise" | "armor" | "weapon" | "tool" | "language";

const TITLES: Record<Kind, string> = {
  save: "Saving throws",
  skill: "Skills",
  expertise: "Expertise",
  armor: "Armor",
  weapon: "Weapons",
  tool: "Tools",
  language: "Languages",
};

const nameOf = (kind: Kind, t: string) =>
  kind === "save" ? ABILITY_NAMES[t as Ability] ?? t : kind === "skill" || kind === "expertise" ? SKILL_NAMES[t as Skill] ?? t : t;

/**
 * Taking away a proficiency your race, class or background gives, when the
 * table rules so (and giving it back). Adding one is under "Beyond the rules".
 */
export function ProficienciesPanel({ sheet, act }: { sheet: DerivedSheet; act: Act }) {
  const [reason, setReason] = useState("");
  const current: Record<Kind, string[]> = {
    save: ABILITIES.filter((a) => sheet.saves[a].proficient),
    skill: SKILLS.filter((s) => sheet.skills[s].proficiency),
    expertise: SKILLS.filter((s) => sheet.skills[s].proficiency === 2),
    armor: sheet.proficiencies.armor,
    weapon: sheet.proficiencies.weapons,
    tool: sheet.proficiencies.tools,
    language: sheet.proficiencies.languages,
  };
  const removed = sheet.proficiencies.removed as { kind: Kind; target: string; reason?: string }[];
  return (
    <>
      <p className="note">Tap one to take it away (your DM's ruling); it stays off whatever gives it. Taken-away ones are listed below to give back. To add one, use “Beyond the rules”.</p>
      <input className="search" placeholder="Why (optional): the DM's ruling, a curse…" value={reason} maxLength={250} onChange={(e) => setReason(e.target.value)} aria-label="Why" />
      {(Object.keys(TITLES) as Kind[]).map((k) =>
        current[k].length ? (
          <section key={k}>
            <h2 className="sub-head">{TITLES[k]}</h2>
            <div className="types wrap" role="group" aria-label={TITLES[k]}>
              {current[k].map((t) => (
                <button
                  key={t}
                  className="switch"
                  aria-pressed={true}
                  onClick={() => act("setProfRemoved", { kind: k, target: t, removed: true, ...(reason.trim() ? { reason: reason.trim() } : {}) }, `${TITLES[k]}: ${nameOf(k, t)} taken away.`)}
                >
                  {nameOf(k, t)}
                </button>
              ))}
            </div>
          </section>
        ) : null,
      )}
      {removed.length > 0 && (
        <section>
          <h2 className="sub-head">Taken away</h2>
          <div className="group">
            {removed.map((r) => (
              <div className="row" key={`${r.kind}-${r.target}`}>
                <div className="row-main">
                  <div className="row-title">
                    <s>{nameOf(r.kind, r.target)}</s>
                  </div>
                  <div className="row-sub">
                    {TITLES[r.kind]}
                    {r.reason ? ` · ${r.reason}` : ""}
                  </div>
                </div>
                <button className="link" onClick={() => act("setProfRemoved", { kind: r.kind, target: r.target, removed: false }, `${TITLES[r.kind]}: ${nameOf(r.kind, r.target)} given back.`)}>
                  Give back
                </button>
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
