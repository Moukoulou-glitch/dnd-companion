import { formatBonus, signed, type DerivedSheet, type RollBreakdown } from "@dnd/engine";
import { shortSave } from "./DcBig";
import { ABILITIES, ABILITY_NAMES, SKILLS, SKILL_NAMES, type Ability, type Character, type Skill } from "@dnd/schema";
import { KIND_NAMES, skillExtra } from "./Extras";
import type { ReactNode } from "react";
import { BreakdownLines } from "./Sheet";

type Open = (title: string, body: ReactNode) => void;
type OpenRoll = (title: string, base: RollBreakdown) => void;

const profMark = (p: 0 | 1 | 2 | boolean) => (p === 2 ? "◆" : p ? "●" : "○");
const profName = (p: 0 | 1 | 2 | boolean) => (p === 2 ? "expertise" : p ? "proficient" : "not proficient");

function RollRow({ title, sub, roll, mark, onOpen, extraTag }: { title: string; sub?: string; roll: RollBreakdown; mark: 0 | 1 | 2 | boolean; onOpen: () => void; extraTag?: string }) {
  return (
    <button className="row" onClick={onOpen} aria-label={`${title}, ${profName(mark)}, ${formatBonus(roll)}`}>
      <span className="prof" aria-hidden="true">
        {profMark(mark)}
      </span>
      <div className="row-main">
        <div className="row-title">{title}</div>
        {sub && <div className="row-sub">{sub}</div>}
      </div>
      {extraTag && <span className="tag extra-tag">{extraTag}</span>}
      {roll.autoFail && roll.autoFail.length > 0 && <span className="tag fail">fails</span>}
      {roll.advantage.length > 0 && roll.disadvantage.length === 0 ? <span className="tag adv">adv</span> : null}
      {roll.disadvantage.length > 0 && roll.advantage.length === 0 ? <span className="tag dis">disadv</span> : null}
      {roll.suggestions.length > 0 && <span className="tag">?</span>}
      <span className="num">{formatBonus(roll)}</span>
    </button>
  );
}

const KIND_LABEL = { race: "Race", background: "Background", feature: "Feature", feat: "Feat" } as const;

export function SheetTab({
  sheet,
  character,
  openAbility,
  open,
  openRoll,
  openTrait,
  openSkill,
  openAddExtra,
  openExtra,
  openAdjust,
  openPb,
  openDefenses,
  onOptional,
  openProficiencies,
}: {
  sheet: DerivedSheet;
  character: Character;
  /** An ability's breakdown, and changing it by hand. */
  openAbility: (ab: Ability) => void;
  open: Open;
  openRoll: OpenRoll;
  openTrait: (id: string) => void;
  openSkill: (s: Skill) => void;
  openAddExtra: () => void;
  openExtra: (id: string) => void;
  /** Bonuses and penalties by hand on saves, skills or passive senses. */
  openAdjust: (kind: "save" | "skill" | "passive") => void;
  /** The proficiency bonus, and changing it by hand. */
  openPb: () => void;
  /** Resistances, immunities and vulnerabilities by hand. */
  openDefenses: () => void;
  /** Turn a Tasha's optional class feature on or off. */
  onOptional: (id: string, on: boolean) => void;
  /** Take away (or give back) a proficiency by the table's ruling. */
  openProficiencies: () => void;
}) {
  const featTag = (id: string) => sheet.extras.find((x) => x.kind === "feat" && x.value === id)?.tag;
  return (
    <main>
      <section>
        <h2>Abilities</h2>
        <div className="abilities">
          {ABILITIES.map((ab) => (
            <button
              key={ab}
              className={`ability${character.abilityAdjust[ab]?.penalty ? " drained" : character.abilityAdjust[ab] ? " adjusted" : ""}${sheet.abilities[ab].asiOver ? " over-max" : ""}`}
              onClick={() => openAbility(ab)}
            >
              <small>{ABILITY_NAMES[ab]}</small>
              <b>{signed(sheet.abilities[ab].modifier)}</b>
              <span>{sheet.abilities[ab].score.total}</span>
              {sheet.abilities[ab].asiOver && <em className="over-tag">over 20</em>}
            </button>
          ))}
        </div>
              <button className={`row pb-row${character.pbAdjust?.bonus || character.pbAdjust?.penalty ? " adjusted" : ""}`} onClick={openPb}>
          <div className="row-main row-title">Proficiency bonus</div>
          <span className="num">{signed(sheet.proficiencyBonus)}</span>
        </button>
      </section>

      <section>
        <h2>
          Saving throws
          <button className="link section-tool" onClick={() => openAdjust("save")}>
            ± Bonus or penalty
          </button>
        </h2>
        <div className="group">
          {ABILITIES.map((ab) => (
            <RollRow
              key={ab}
              title={ABILITY_NAMES[ab]}
              roll={sheet.saves[ab]}
              mark={sheet.saves[ab].proficient}
              onOpen={() => openRoll(`${ABILITY_NAMES[ab]} saving throw`, sheet.saves[ab])}
            />
          ))}
        </div>
      </section>

      <section>
        <h2>
          Skills
          <button className="link section-tool" onClick={() => openAdjust("skill")}>
            ± Bonus or penalty
          </button>
        </h2>
        <div className="group">
          {SKILLS.map((s) => (
            <RollRow
              key={s}
              title={SKILL_NAMES[s]}
              sub={ABILITY_NAMES[sheet.skills[s].ability]}
              roll={sheet.skills[s]}
              mark={sheet.skills[s].proficiency}
              {...(skillExtra(sheet, s) ? { extraTag: skillExtra(sheet, s)!.tag } : {})}
              onOpen={() => openSkill(s)}
            />
          ))}
        </div>
        <p className="note">○ not proficient, ● proficient, ◆ expertise</p>
      </section>

      <section>
        <h2>
          Passive senses
          <button className="link section-tool" onClick={() => openAdjust("passive")}>
            ± Bonus or penalty
          </button>
        </h2>
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
        <h2>Features and traits</h2>
        <div className="group">
          {sheet.features.filter((f) => !f.common).map((f) => (
            <button className="row" key={f.id} onClick={() => openTrait(f.id)}>
              <div className="row-main">
                <div className="row-title">{f.name}</div>
                <div className="row-sub">{f.summary ?? KIND_LABEL[f.kind]}</div>
              </div>
              {f.dc && <span className="tag dc-tag">DC {f.dc.value} {shortSave(f.dc.save)}</span>}
              {featTag(f.id) && <span className="tag extra-tag">{featTag(f.id)}</span>}
              {f.text && <span className="tag">text</span>}
            </button>
          ))}
        </div>
      </section>

      {sheet.optionalFeatures.length > 0 && (
        <section>
          <h2>Tasha's optional class features</h2>
          <div className="group">
            {sheet.optionalFeatures.map((f) => (
              <label className="row check" key={f.id}>
                <input type="checkbox" checked={f.on} onChange={() => onOptional(f.id, !f.on)} />
                <div className="row-main">
                  <div className="row-title">{f.name}</div>
                  <div className="row-sub">
                    {f.className} {f.level}
                    {f.summary ? ` · ${f.summary}` : ""}
                  </div>
                </div>
              </label>
            ))}
          </div>
          <p className="note">On unless your table doesn't use them. Turning one off takes it (and what it gives) off the sheet; its picks are kept.</p>
        </section>
      )}

      <section>
        <h2>Beyond the rules</h2>
        {sheet.extras.length > 0 && (
          <div className="group">
            {sheet.extras.map((x) => (
              <button className="row" key={x.id} onClick={() => openExtra(x.id)}>
                <div className="row-main">
                  <div className="row-title">{x.name}</div>
                  <div className="row-sub">
                    {KIND_NAMES[x.kind].one}
                    {x.reason ? ` · ${x.reason}` : ""}
                  </div>
                </div>
                <span className="tag extra-tag">{x.tag}</span>
              </button>
            ))}
          </div>
        )}
        <button className="big wide" style={{ marginTop: 10 }} onClick={openAddExtra}>
          Add a feat, skill, expertise, language, tool or spell
        </button>
        <p className="note">For what your DM or table gives you beyond the rules. The app asks how you got it and keeps the reason with it.</p>
      </section>

      <section>
        <h2>
          Proficiencies
          <button className="link section-tool" onClick={openProficiencies}>
            Take away
          </button>
        </h2>
        <div className="group">
          {(
            [
              ["Armor", sheet.proficiencies.armor],
              ["Weapons", sheet.proficiencies.weapons],
              ["Tools", sheet.proficiencies.tools],
              ["Languages", sheet.proficiencies.languages],
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
      {sheet.proficiencies.removed.length > 0 && (
          <p className="note">
            Taken away by your table: {sheet.proficiencies.removed.map((r) => r.target).join(", ")}.
          </p>
        )}
      </section>

      <section>
        <h2>
          Defenses
          <button className="link section-tool" onClick={openDefenses}>
            Change
          </button>
        </h2>
        <div className="group">
          {(
            [
              ["Resistances", sheet.defenses.resist],
              ["Immunities", sheet.defenses.immune],
              ["Vulnerabilities", sheet.defenses.vulnerable],
            ] as const
          ).map(([name, list]) => (
            <button className="row" key={name} onClick={openDefenses}>
              <div className="row-main">
                <div className="row-title">{name}</div>
                <div className="row-sub">{list.length ? list.join(", ") : "none"}</div>
              </div>
            </button>
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
