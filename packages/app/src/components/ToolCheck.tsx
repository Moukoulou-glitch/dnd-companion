import { useState } from "react";
import { ABILITIES, ABILITY_NAMES, type Ability } from "@dnd/schema";
import { TOOL_NAMES, signed, toolGuide, type RollBreakdown } from "@dnd/engine";

/**
 * A tool or instrument check: what it's good for (the skills it helps, some
 * activities and their usual DCs), then which ability: the DM says which fits.
 */
export function ToolCheck({ name, proficiency, doubledBy, checks, onRoll }: { name?: string | undefined; proficiency: 0 | 1 | 2; doubledBy?: string | undefined; checks: Record<Ability, RollBreakdown>; onRoll: (title: string, ability: Ability) => void }) {
  const [other, setOther] = useState("");
  const tool = name ?? other;
  const guide = tool ? toolGuide(tool) : undefined;
  return (
    <>
      {!name && (
        <label className="field">
          <span>Which tool or instrument?</span>
          <select className="search" value={other} onChange={(e) => setOther(e.target.value)}>
            <option value="">Not listed / any</option>
            {TOOL_NAMES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
      )}
      {guide && (
        <div className="tool-guide">
          {guide.kind && <p className="row-sub">{guide.kind}</p>}
          <p className="note">Can help with {guide.helps.join(", ")}: with the tool in hand and proficiency, your DM may give you advantage or let you add it.</p>
          {guide.activities.length > 0 && (
            <div className="group">
              {guide.activities.map((a) => (
                <div className="row" key={a.what}>
                  <div className="row-main row-title">{a.what}</div>
                  <span className="tag dc-tag">{a.dc === "varies" ? "DC varies" : `DC ${a.dc}`}</span>
                </div>
              ))}
            </div>
          )}
          {guide.also && <p className="note">{guide.also}</p>}
          <p className="note">The usual DCs; your DM sets the real one.</p>
        </div>
      )}
      <p className="sub-head">Which ability?</p>
      <p className="note">
        It depends on what you do with it (Strength to force something with the tools, Intelligence to recall or work something out, Charisma to perform).
        {proficiency === 2 ? ` Your proficiency bonus is doubled (${doubledBy}).` : proficiency === 1 ? " You add your proficiency bonus." : " Without proficiency: no proficiency bonus."}
      </p>
      <div className="choice-grid">
        {ABILITIES.map((ab) => (
          <button key={ab} className="big" onClick={() => onRoll(`${tool || "Tool"} (${ABILITY_NAMES[ab]})`, ab)}>
            {ABILITY_NAMES[ab]}
            <span className="sub">{signed(checks[ab].total)}</span>
          </button>
        ))}
      </div>
    </>
  );
}
