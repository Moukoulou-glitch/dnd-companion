import { formatBonus, signed, type DerivedSheet, type RollBreakdown } from "@dnd/engine";
import { ABILITIES, ABILITY_NAMES, SKILLS, SKILL_NAMES } from "@dnd/schema";
import type { ReactNode } from "react";
import { BreakdownLines } from "./Sheet";

type Open = (title: string, body: ReactNode) => void;

const profMark = (p: 0 | 1 | 2 | boolean) => (p === 2 ? "◆" : p ? "●" : "○");
const profName = (p: 0 | 1 | 2 | boolean) => (p === 2 ? "expertise" : p ? "proficient" : "not proficient");

function RollRow({ title, sub, roll, mark, onOpen }: { title: string; sub?: string; roll: RollBreakdown; mark: 0 | 1 | 2 | boolean; onOpen: () => void }) {
  return (
    <button className="row" onClick={onOpen} aria-label={`${title}, ${profName(mark)}, ${formatBonus(roll)}`}>
      <span className="prof" aria-hidden="true">
        {profMark(mark)}
      </span>
      <div className="row-main">
        <div className="row-title">{title}</div>
        {sub && <div className="row-sub">{sub}</div>}
      </div>
      {roll.advantage.length > roll.disadvantage.length ? <span className="tag adv">adv</span> : null}
      {roll.suggestions.length > 0 && <span className="tag">?</span>}
      <span className="num">{formatBonus(roll)}</span>
    </button>
  );
}

export function SheetTab({ sheet, open }: { sheet: DerivedSheet; open: Open }) {
  return (
    <main>
      <section>
        <h2>Abilities</h2>
        <div className="abilities">
          {ABILITIES.map((ab) => (
            <button key={ab} className="ability" onClick={() => open(`${ABILITY_NAMES[ab]} score`, <BreakdownLines b={sheet.abilities[ab].score} totalLabel="Score" />)}>
              <small>{ABILITY_NAMES[ab]}</small>
              <b>{signed(sheet.abilities[ab].modifier)}</b>
              <span>{sheet.abilities[ab].score.total}</span>
            </button>
          ))}
        </div>
      </section>

      <section>
        <h2>Saving throws</h2>
        <div className="group">
          {ABILITIES.map((ab) => (
            <RollRow
              key={ab}
              title={ABILITY_NAMES[ab]}
              roll={sheet.saves[ab]}
              mark={sheet.saves[ab].proficient}
              onOpen={() => open(`${ABILITY_NAMES[ab]} saving throw`, <BreakdownLines b={sheet.saves[ab]} totalLabel="Save" />)}
            />
          ))}
        </div>
      </section>

      <section>
        <h2>Skills</h2>
        <div className="group">
          {SKILLS.map((s) => (
            <RollRow
              key={s}
              title={SKILL_NAMES[s]}
              sub={ABILITY_NAMES[sheet.skills[s].ability]}
              roll={sheet.skills[s]}
              mark={sheet.skills[s].proficiency}
              onOpen={() => open(SKILL_NAMES[s], <BreakdownLines b={sheet.skills[s]} totalLabel="Check" />)}
            />
          ))}
        </div>
        <p className="note">○ not proficient, ● proficient, ◆ expertise</p>
      </section>

      <section>
        <h2>Passive senses</h2>
        <div className="group">
          {(
            [
              ["Perception", sheet.passives.perception],
              ["Investigation", sheet.passives.investigation],
              ["Insight", sheet.passives.insight],
            ] as const
          ).map(([name, b]) => (
            <button className="row" key={name} onClick={() => open(`Passive ${name}`, <BreakdownLines b={b} totalLabel="Passive" />)}>
              <div className="row-main row-title">Passive {name}</div>
              <span className="num">{b.total}</span>
            </button>
          ))}
          {Object.entries(sheet.senses).map(([sense, range]) => (
            <div className="row" key={sense}>
              <div className="row-main row-title" style={{ textTransform: "capitalize" }}>
                {sense}
              </div>
              <span className="num">{range} ft</span>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2>Proficiencies</h2>
        <div className="group">
          {(
            [
              ["Armor", sheet.proficiencies.armor],
              ["Weapons", sheet.proficiencies.weapons],
              ["Tools", sheet.proficiencies.tools],
              ["Languages", sheet.proficiencies.languages],
              ["Resistances", sheet.defenses.resist],
            ] as const
          )
            .filter(([, list]) => list.length > 0)
            .map(([name, list]) => (
              <div className="row" key={name}>
                <div className="row-main">
                  <div className="row-title">{name}</div>
                  <div className="row-sub">{list.join(", ")}</div>
                </div>
              </div>
            ))}
        </div>
      </section>

      {sheet.warnings.length > 0 && (
        <section>
          <h2>Needs attention</h2>
          <div className="group">
            {sheet.warnings.map((w) => (
              <div className="row" key={w}>
                <div className="row-main row-sub">{w}</div>
              </div>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
