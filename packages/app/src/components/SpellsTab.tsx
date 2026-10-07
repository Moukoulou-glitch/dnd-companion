import { RichText } from "./Conditions";
import { useState } from "react";
import { ABILITY_NAMES } from "@dnd/schema";
import { signed, type DerivedSheet, type SpellResult, type WeaponAttack } from "@dnd/engine";

const LEVEL_NAME = ["Cantrips", "1st level", "2nd level", "3rd level", "4th level", "5th level", "6th level", "7th level", "8th level", "9th level"];

export const ordinal = (n: number) => ["", "1st", "2nd", "3rd"][n] ?? `${n}th`;

/** A spell shaped like a weapon attack, so the roll composer can roll its attack and damage. */
export function spellAsAttack(sp: SpellResult, level: number): WeaponAttack & { saveNote?: string } {
  const key = sp.level === 0 ? 0 : level;
  const dice = sp.damage?.byLevel[key] ?? sp.heal?.byLevel[key] ?? "0";
  const emptyRoll = { total: 0, parts: [], dice: [], advantage: [], disadvantage: [], suggestions: [] };
  const a: WeaponAttack & { saveNote?: string } = {
    attackId: sp.id,
    name: sp.name,
    mode: "ranged",
    action: "attack",
    ability: "int",
    proficient: true,
    attack: sp.attack ?? emptyRoll,
    damage: { dice, type: sp.damage?.type ?? (sp.heal ? "healing" : ""), bonus: sp.damageBonus ?? emptyRoll, onCrit: [], critExtraDice: [] },
    properties: [],
  };
  if (sp.save) {
    a.saveNote = `Targets make a DC ${sp.save.dc} ${ABILITY_NAMES[sp.save.ability]} saving throw${
      sp.save.onSuccess === "half" ? ": half damage on a success." : sp.save.onSuccess === "none" ? ": no damage on a success." : "."
    }`;
  }
  return a;
}

function tags(sp: SpellResult): string {
  const t: string[] = [sp.castingTime];
  if (sp.concentration) t.push("concentration");
  if (sp.ritual) t.push("ritual");
  if (sp.cast.free && sp.cast.free.remaining > 0) t.push("free use");
  return t.join(", ");
}

export function SpellsTab({ sheet, openSpell }: { sheet: DerivedSheet; openSpell: (sp: SpellResult) => void }) {
  const [show, setShow] = useState<"ready" | "all">("ready");
  const hasUnprepared = sheet.spells.some((s) => s.ready === "not prepared");
  const visible = sheet.spells.filter((s) => show === "all" || s.ready !== "not prepared");
  const levels = [...new Set(visible.map((s) => s.level))].sort((a, b) => a - b);
  const slotsLeft = (lvl: number) => {
    const s = sheet.spellSlots.find((x) => x.level === lvl);
    return s ? s.total - s.used : 0;
  };

  return (
    <main>
      <section>
        <div className="group">
          {sheet.spellcasting.map((sc) => (
            <div className="row" key={sc.id}>
              <div className="row-main">
                <div className="row-title">{sc.label}</div>
                <div className="row-sub">
                  {ABILITY_NAMES[sc.ability]}
                  {sc.prepared ? `, ${sc.prepared.count} of ${sc.prepared.max} prepared` : ""}
                </div>
              </div>
              <span className="row-sub">DC</span>
              <span className="num" style={{ minWidth: "1.6em" }}>
                {sc.saveDc.total}
              </span>
              <span className="num">{signed(sc.attack.total)}</span>
            </div>
          ))}
        </div>
      </section>

      {hasUnprepared && (
        <div className="segmented small" role="radiogroup" aria-label="Show">
          <button role="radio" aria-checked={show === "ready"} onClick={() => setShow("ready")}>
            Ready today
          </button>
          <button role="radio" aria-checked={show === "all"} onClick={() => setShow("all")}>
            Whole spellbook
          </button>
        </div>
      )}

      {levels.map((lvl) => (
        <section key={lvl}>
          <h2>
            {LEVEL_NAME[lvl]}
            {lvl > 0 && sheet.spellSlots.some((x) => x.level === lvl) ? `, ${slotsLeft(lvl)} slots left` : ""}
          </h2>
          <div className="group">
            {visible
              .filter((s) => s.level === lvl)
              .map((sp) => (
                <button
                  className={`row${sp.ready === "not prepared" ? " dim" : ""}`}
                  key={`${sp.list.id}-${sp.id}`}
                  onClick={() => openSpell(sp)}
                >
                  <div className="row-main">
                    <div className="row-title">{sp.name}</div>
                    <div className="row-sub">{tags(sp)}</div>
                  </div>
                  <span className="row-tags">
                    {sheet.concentration?.spell === sp.id && <span className="tag conc">concentrating</span>}
                    {sp.ready === "prepared" && <span className="tag adv">prepared</span>}
                    {sp.fromFeature && <span className="tag">{sp.fromFeature}</span>}
                  </span>
                  <span className="num spell-num">{sp.attack ? signed(sp.attack.total) : sp.save ? `DC ${sp.save.dc}` : ""}</span>
                </button>
              ))}
          </div>
        </section>
      ))}
      {sheet.spells.length === 0 && <p className="note">No spells on this character.</p>}
      <p className="note attribution">Spell text from the System Reference Document 5.1 by Wizards of the Coast LLC, licensed CC-BY-4.0.</p>
    </main>
  );
}

/** Everything about one spell, and how to cast it. */
export function SpellPanel({
  sp,
  sheet,
  hasSelfEffect,
  onCast,
  initialCast,
  onPrepare,
  onRollAttack,
  onRollDamage,
}: {
  sp: SpellResult;
  sheet: DerivedSheet;
  hasSelfEffect: boolean;
  onCast: (level: number, using: "slot" | "pact" | "free" | "ritual" | "none", selfEffect: boolean) => void;
  /** Opens already cast at this level (after a turn warning was confirmed). */
  initialCast?: number | undefined;
  onPrepare: (prepared: boolean) => void;
  onRollAttack: (level: number) => void;
  onRollDamage: (level: number) => void;
}) {
  const [cast, setCast] = useState<number | null>(initialCast ?? null);
  const [onMe, setOnMe] = useState(hasSelfEffect && /self/i.test(sp.range));
  const slotsLeft = (lvl: number) => {
    const s = sheet.spellSlots.find((x) => x.level === lvl);
    return s ? s.total - s.used : 0;
  };

  const meta: [string, string][] = [
    ["Casting time", sp.castingTime],
    ["Range", sp.range],
    ["Components", sp.components.join(", ") + (sp.material ? ` (${sp.material})` : "")],
    ["Duration", sp.duration],
    ["School", sp.school],
    ["Cast with", sp.list.label],
    ...(sp.fromFeature ? [["From", sp.fromFeature] as [string, string]] : []),
    ...(sp.beams
      ? [
          [
            sp.beams.what === "beams" ? "Beams" : "Rays",
            sp.level === 0
              ? `${sp.beams.byLevel[0]} at your level, each its own attack roll`
              : `${sp.beams.byLevel[sp.level]} at level ${sp.level}, +1 per slot level above`,
          ] as [string, string],
        ]
      : []),
  ];

  const doCast = (level: number, using: "slot" | "pact" | "free" | "ritual" | "none") => {
    onCast(level, using, onMe);
    setCast(level);
  };

  return (
    <>
      <p className="row-sub">
        {sp.level === 0 ? `${sp.school} cantrip` : `${ordinal(sp.level)}-level ${sp.school.toLowerCase()}`}
        {sp.concentration ? ", concentration" : ""}
        {sp.ritual ? ", ritual" : ""}
      </p>
      <ul className="lines meta">
        {meta.map(([k, v]) => (
          <li key={k}>
            <span>{k}</span>
            <span>{v}</span>
          </li>
        ))}
      </ul>

      {(sp.attack || sp.save) && (
        <p className="note">
          {sp.attack ? `Spell attack ${signed(sp.attack.total)}.` : ""} {sp.save ? `DC ${sp.save.dc} ${ABILITY_NAMES[sp.save.ability]} save.` : ""}
        </p>
      )}

      {cast === null ? (
        <>
          {sp.ready === "not prepared" && <p className="warn">Not prepared today. You can still cast it if your DM allows.</p>}
          {hasSelfEffect && (
            <label className="row check" style={{ padding: "8px 0" }}>
              <input type="checkbox" checked={onMe} onChange={() => setOnMe(!onMe)} />
              <div className="row-main">
                <div className="row-title">Put its effect on me</div>
                <div className="row-sub">For spells you cast on yourself</div>
              </div>
            </label>
          )}
          <div className="cast-options">
            {sp.level === 0 && (
              <button className="big primary" onClick={() => doCast(0, "none")}>
                Cast
              </button>
            )}
            {sp.cast.slotLevels.map((l) => (
              <button key={l} className={`big${l === sp.level ? " primary" : ""}`} onClick={() => doCast(l, "slot")}>
                {ordinal(l)} slot
                <span className="sub">{slotsLeft(l)} left</span>
              </button>
            ))}
            {sp.cast.pact && (
              <button className="big primary" onClick={() => doCast(sp.cast.pact!.level, "pact")}>
                Pact slot
                <span className="sub">
                  {ordinal(sp.cast.pact.level)} level, {sp.cast.pact.remaining} left
                </span>
              </button>
            )}
            {sp.cast.free && (
              <button className="big" onClick={() => doCast(sp.level, "free")}>
                Free use
                <span className="sub">{sp.cast.free.remaining} left</span>
              </button>
            )}
            {sp.ritual && (
              <button className="big" onClick={() => doCast(sp.level, "ritual")}>
                As a ritual
                <span className="sub">+10 minutes, no slot</span>
              </button>
            )}
          </div>
          {sp.level > 0 && sp.cast.slotLevels.length === 0 && !sp.cast.pact && !sp.cast.free && !sp.ritual && (
            <p className="note">No slots of this level. Use your feature or ask your DM.</p>
          )}
        </>
      ) : (
        <>
          <p className="pass">
            Cast{sp.level > 0 ? ` at ${ordinal(cast || sp.level)} level` : ""}.{sp.concentration ? " You're concentrating on it." : ""}
          </p>
          <div className="big-actions">
            {sp.attack && (
              <button className="big primary" onClick={() => onRollAttack(cast)}>
                Roll attack
              </button>
            )}
            {(sp.damage || sp.heal) && !sp.attack && (
              <button className="big primary" onClick={() => onRollDamage(cast)}>
                {sp.heal ? "Roll healing" : "Roll damage"}
              </button>
            )}
          </div>
          <button className="link" onClick={() => setCast(null)}>
            Cast it again
          </button>
        </>
      )}

      {sp.ready !== "always" && (
        <label className="row check" style={{ padding: "8px 0" }}>
          <input type="checkbox" checked={sp.ready === "prepared"} onChange={() => onPrepare(sp.ready !== "prepared")} />
          <div className="row-main">
            <div className="row-title">Prepared today</div>
          </div>
        </label>
      )}

      <div className="spell-text">
        {sp.placeholder ? (
          <p className="note">
            {sp.summary} Full text: {sp.source}. Load your book files (Characters → Book text) to read it here.
          </p>
        ) : (
          sp.text.map((p, i) => (
            <p key={i}>
              <RichText text={p} />
            </p>
          ))
        )}
        {sp.higherLevels.map((p, i) => (
          <p key={`h${i}`}>
            <b>At higher levels.</b> <RichText text={p} />
          </p>
        ))}
      </div>
    </>
  );
}
