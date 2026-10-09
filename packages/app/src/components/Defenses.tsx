import { useState } from "react";
import type { ContentRegistry, DerivedSheet } from "@dnd/engine";
import type { Character, OperationType } from "@dnd/schema";

type Act = (type: OperationType, payload: unknown, label: string) => unknown;
const DAMAGE = ["acid", "bludgeoning", "cold", "fire", "force", "lightning", "necrotic", "piercing", "poison", "psychic", "radiant", "slashing", "thunder"];
const KINDS = [
  ["resist", "Resistances", "Half damage"],
  ["immune", "Immunities", "No damage, or the condition doesn't take"],
  ["vulnerable", "Vulnerabilities", "Double damage"],
] as const;

/**
 * Resistances, immunities and vulnerabilities: what features give (fixed) and
 * what you add by hand (a ring, a curse, a boon), with why.
 */
export function DefensesPanel({ c, sheet, reg, act }: { c: Character; sheet: DerivedSheet; reg: ContentRegistry; act: Act }) {
  const mine = c.defenseAdjust ?? { resist: [], immune: [], vulnerable: [] };
  const [note, setNote] = useState(mine.note ?? "");
  const conditions = reg.list("effect").filter((e) => e.category === "condition").map((e) => e.name.toLowerCase());
  return (
    <>
      <p className="note">Tap to add or take away. Gold ones come from your features and stay; the rest are yours, by hand.</p>
      {KINDS.map(([k, title, sub]) => {
        // "spells": damage from spells (Aura of Warding), whatever its type.
        const options = k === "immune" ? [...DAMAGE, ...conditions] : k === "resist" ? [...DAMAGE, "spells"] : DAMAGE;
        return (
          <section key={k}>
            <h2 className="sub-head">
              {title}
              <small className="row-sub defense-sub">{sub}</small>
            </h2>
            <div className="types wrap" role="group" aria-label={title}>
              {options.map((v) => {
                const byHand = mine[k].includes(v);
                const fromFeature = sheet.defenses[k].includes(v) && !byHand;
                return (
                  <button
                    key={v}
                    className={`switch${fromFeature ? " aura" : ""}`}
                    aria-pressed={byHand || fromFeature}
                    disabled={fromFeature}
                    onClick={() => act("setDefense", { kind: k, value: v, on: !byHand }, `${title}: ${v} ${byHand ? "taken away" : "added"}.`)}
                  >
                    {v === "spells" ? "damage from spells" : v}
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}
      <input
        className="search"
        placeholder="Why (Ring of Fire Resistance, a curse…)"
        value={note}
        maxLength={80}
        onChange={(e) => setNote(e.target.value)}
        onBlur={() => note !== (mine.note ?? "") && act("setDefense", { kind: "resist", value: "", on: false, note }, note ? `Why: ${note}.` : "Reason cleared.")}
        aria-label="Why"
      />
    </>
  );
}
