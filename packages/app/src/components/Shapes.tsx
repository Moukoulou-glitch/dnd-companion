import { useMemo, useState, type ReactNode } from "react";
import { formatBonus, shapeIssues, signed, type ContentRegistry, type DerivedSheet, type RollBreakdown, type ShapeResult, type WeaponAttack } from "@dnd/engine";
import { ABILITIES, ABILITY_NAMES, SKILLS, SKILL_NAMES, type Character, type CreatureDef, type OperationType } from "@dnd/schema";
import { RichText } from "./Conditions";

type Act = (type: OperationType, payload: unknown, label: string) => unknown;

const crText = (n: number) => (n === 0.125 ? "1/8" : n === 0.25 ? "1/4" : n === 0.5 ? "1/2" : String(n));

function speedText(d: CreatureDef): string {
  const s = d.speed;
  return [s.walk ? `${s.walk} ft` : "", s.climb ? `climb ${s.climb}` : "", s.swim ? `swim ${s.swim}` : "", s.fly ? `fly ${s.fly}` : "", s.burrow ? `burrow ${s.burrow}` : ""].filter(Boolean).join(", ");
}

/** On Play: the form you're in, or a way into one. */
export function ShapeCard({ sheet, onOpen, onTransform }: { sheet: DerivedSheet; onOpen: () => void; onTransform: (kind: "wildshape" | "polymorph") => void }) {
  const s = sheet.shape;
  if (s) {
    const pct = Math.round((s.hp.current / s.hp.max) * 100);
    return (
      <section>
        <h2>{s.kind === "wildshape" ? "Wild Shape" : "Polymorphed"}</h2>
        <div className="group">
          <button className="row companion shape-card" onClick={onOpen}>
            <div className="row-main">
              <div className="row-title">{s.name}</div>
              <div className="row-sub">
                AC {s.ac} · {s.speed}
              </div>
              <div className="mini-bar" aria-hidden="true">
                <span style={{ width: `${pct}%` }} />
              </div>
            </div>
            <span className="num">
              {s.hp.current}
              <small>/{s.hp.max}</small>
            </span>
          </button>
        </div>
      </section>
    );
  }
  const ws = sheet.wildShape;
  const uses = sheet.resources.find((r) => r.id === "wild-shape");
  return (
    <section>
      {ws && (
        <>
          <h2>Wild Shape</h2>
          <div className="group">
            <button className="row" onClick={() => onTransform("wildshape")}>
              <div className="row-main">
                <div className="row-title">Transform</div>
                <div className="row-sub">
                  Beasts up to CR {crText(ws.maxCr)}
                  {ws.noFly ? ", no flying" : ""}
                  {ws.noSwim ? " or swimming" : ""} · {ws.bonusAction ? "bonus action" : "action"} · up to {ws.hours} hour{ws.hours === 1 ? "" : "s"}
                </div>
              </div>
              {uses && (
                <span className="num">
                  {uses.remaining}
                  <small>/{uses.max}</small>
                </span>
              )}
            </button>
          </div>
        </>
      )}
      <button className="link" style={{ marginTop: ws ? 8 : 0 }} onClick={() => onTransform("polymorph")}>
        Polymorphed? Pick the beast
      </button>
    </section>
  );
}

/** Choose the creature: what the rules allow first, the rest below with why (warned, never blocked). */
export function TransformPanel({
  kind: first,
  sheet,
  reg,
  character,
  onPick,
}: {
  kind: "wildshape" | "polymorph";
  sheet: DerivedSheet;
  reg: ContentRegistry;
  character: Character;
  onPick: (kind: "wildshape" | "polymorph", creature: CreatureDef, uses: number) => void;
}) {
  const [kind, setKind] = useState(first);
  const [q, setQ] = useState("");
  const [casterLevel, setCasterLevel] = useState(String(sheet.level));
  const limits = sheet.wildShape;
  const polyMax = Number(casterLevel) || 0;
  const list = useMemo(() => {
    const elementals = new Set(["creature:air-elemental", "creature:earth-elemental", "creature:fire-elemental", "creature:water-elemental"]);
    return reg
      .list("creature")
      .filter((d) => d.type === "beast" || (kind === "wildshape" && elementals.has(d.id)))
      .map((d) => ({ d, issues: shapeIssues(d, kind, limits, polyMax), elemental: elementals.has(d.id) }))
      .sort((a, b) => a.d.cr - b.d.cr || a.d.name.localeCompare(b.d.name));
  }, [reg, kind, limits, polyMax]);
  const shown = list.filter((x) => x.d.name.toLowerCase().includes(q.trim().toLowerCase()));
  const ok = shown.filter((x) => !x.issues.length);
  const beyond = shown.filter((x) => x.issues.length);
  const row = (x: (typeof list)[number]) => (
    <button key={x.d.id} className="row" onClick={() => onPick(kind, x.d, kind === "wildshape" ? (x.elemental ? 2 : 1) : 0)}>
      <div className="row-main">
        <div className="row-title">{x.d.name}</div>
        <div className="row-sub">
          CR {crText(x.d.cr)} · {x.d.size} · AC {x.d.ac} · {x.d.hp} HP · {speedText(x.d)}
        </div>
        {x.issues.length > 0 && <div className="row-sub danger-text">{x.issues.join(" ")}</div>}
      </div>
      {x.elemental && <span className="tag">2 uses</span>}
    </button>
  );
  return (
    <>
      <div className="segmented" role="radiogroup" aria-label="How">
        <button role="radio" aria-checked={kind === "wildshape"} disabled={!limits} onClick={() => setKind("wildshape")}>
          Wild Shape
        </button>
        <button role="radio" aria-checked={kind === "polymorph"} onClick={() => setKind("polymorph")}>
          Polymorph
        </button>
      </div>
      {kind === "wildshape" && limits && (
        <p className="note">
          A beast you have seen{limits.moon ? ", Circle of the Moon" : ""}: up to CR {crText(limits.maxCr)}
          {limits.noFly ? ", no flying speed" : ""}
          {limits.noSwim ? ", no swimming speed" : ""}. Your Intelligence, Wisdom and Charisma, alignment and personality stay yours.
          {limits.elemental ? " Elementals take two uses." : ""}
        </p>
      )}
      {kind === "polymorph" && (
        <>
          <p className="note">The beast's statistics, mind included, replace yours. Your table's rule: its CR can be up to the caster's level.</p>
          <label className="roll-entry">
            <span>Caster's level</span>
            <input type="number" min={0} inputMode="numeric" value={casterLevel} onChange={(e) => setCasterLevel(e.target.value)} />
          </label>
        </>
      )}
      {character.shape && <p className="note">You're in a form now: picking another replaces it{kind === "wildshape" ? " and uses Wild Shape again" : ""}.</p>}
      <input className="search" type="search" placeholder="Search beasts" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="group">{ok.map(row)}</div>
      {ok.length === 0 && <p className="note">Nothing within the rules matches. Load a bestiary book file for more beasts.</p>}
      {beyond.length > 0 && (
        <details className="beyond">
          <summary>Beyond the rules ({beyond.length})</summary>
          <div className="group">{beyond.map(row)}</div>
        </details>
      )}
    </>
  );
}

/** The stat block while transformed: HP, AC, attacks to roll, abilities, traits and actions, and changing back. */
export function ShapePanel({
  shape: s,
  sheet,
  act,
  openRoll,
  openHp,
  onRevert,
  onHealSlot,
  normalHp,
}: {
  normalHp: { current: number; max: number };
  shape: ShapeResult;
  sheet: DerivedSheet;
  act: Act;
  openRoll: (title: string, base: RollBreakdown, attack?: WeaponAttack) => void;
  openHp: () => void;
  onRevert: () => void;
  onHealSlot: (level: number) => void;
}) {
  const slots = sheet.spellSlots.filter((x) => x.total - x.used > 0);
  const notable = SKILLS.filter((k) => s.skills[k].parts.length > 1 || s.skills[k].parts[0]?.label.includes("'s"));
  return (
    <>
      <p className="row-sub">
        {s.size} {s.type}, CR {crText(s.cr)}
        {s.hours ? ` · up to ${s.hours} hour${s.hours === 1 ? "" : "s"}` : ""}
      </p>
      <div className="stat-row">
        <button className="stat" onClick={openHp}>
          <b className={s.hp.current === 0 ? "danger-text" : ""}>
            {s.hp.current}
            <small>/{s.hp.max}</small>
          </b>
          <small>HP</small>
        </button>
        <div className="stat">
          <b>{s.ac}</b>
          <small>AC{s.acNote ? ` (${s.acNote})` : ""}</small>
        </div>
        <div className="stat">
          <b>
            {normalHp.current}
            <small>/{normalHp.max}</small>
          </b>
          <small>your own HP</small>
        </div>
      </div>
      <p className="note">Speed {s.speed}.</p>
      <p className="note">{[s.senses ? `Senses: ${s.senses}.` : "", s.languages ? `Languages: ${s.languages}.` : ""].filter(Boolean).join(" ")}</p>
      {s.notes.map((n) => (
        <p className="note reminder" key={n}>
          {n}
        </p>
      ))}
      {(s.defenses.resist.length > 0 || s.defenses.immune.length > 0 || s.defenses.vulnerable.length > 0) && (
        <p className="note">
          {[
            s.defenses.resist.length ? `Resists ${s.defenses.resist.join(", ")}` : "",
            s.defenses.immune.length ? `immune to ${s.defenses.immune.join(", ")}` : "",
            s.defenses.vulnerable.length ? `vulnerable to ${s.defenses.vulnerable.join(", ")}` : "",
          ]
            .filter(Boolean)
            .join("; ")}
          .
        </p>
      )}

      <div className="big-actions">
        <button className="big" onClick={onRevert}>
          Change back
          <span className="sub">{s.kind === "wildshape" ? "bonus action" : "the spell ends"}</span>
        </button>
      </div>

      {s.attacks.length > 0 && (
        <>
          <h2 className="sub-head">Attacks</h2>
          <div className="group">
            {s.attacks.map((a) => (
              <button key={a.name} className="row" onClick={() => openRoll(`${s.name}: ${a.name}`, a.attack, a)}>
                <div className="row-main">
                  <div className="row-title">{a.name}</div>
                  <div className="row-sub">
                    {a.damage.dice}
                    {a.damage.bonus.total ? signed(a.damage.bonus.total) : ""} {a.damage.type}
                    {a.note ? ` · ${a.note}` : ""}
                  </div>
                </div>
                <span className="num">{formatBonus({ total: a.attack.total, dice: [] })}</span>
              </button>
            ))}
          </div>
        </>
      )}

      {sheet.wildShape?.moon && s.kind === "wildshape" && (
        <>
          <h2 className="sub-head">Combat Wild Shape</h2>
          <p className="note">Bonus action: spend a spell slot to regain 1d8 hit points per level of the slot.</p>
          <div className="choice-grid">
            {slots.map((x) => (
              <button key={x.level} className="tag" onClick={() => onHealSlot(x.level)}>
                Level {x.level} · {x.level}d8
              </button>
            ))}
            {slots.length === 0 && <span className="note">No spell slots left.</span>}
          </div>
        </>
      )}

      <h2 className="sub-head">Abilities</h2>
      <div className="group">
        {ABILITIES.map((ab) => (
          <div className="row" key={ab}>
            <div className="row-main">
              <div className="row-title">
                {ABILITY_NAMES[ab]} {s.abilities[ab].score} ({signed(s.abilities[ab].modifier)})
              </div>
              {s.abilities[ab].mine && <div className="row-sub">yours</div>}
            </div>
            <button className="tag" onClick={() => openRoll(`${s.name}: ${ABILITY_NAMES[ab]} saving throw`, s.saves[ab])}>
              save {signed(s.saves[ab].total)}
            </button>
          </div>
        ))}
      </div>

      <details className="beyond">
        <summary>Skills</summary>
        <div className="group">
          {SKILLS.map((k) => (
            <button key={k} className="row" onClick={() => openRoll(`${s.name}: ${SKILL_NAMES[k]}`, s.skills[k])}>
              <div className="row-main row-title">
                {SKILL_NAMES[k]}
                {notable.includes(k) ? " ●" : ""}
              </div>
              <span className="num">{signed(s.skills[k].total)}</span>
            </button>
          ))}
        </div>
      </details>

      {s.traits.length > 0 && <TextList title="Traits" items={s.traits} />}
      {s.actions.length > 0 && <TextList title="Actions" items={s.actions} />}
      <button className="link danger-text" style={{ marginTop: 12 }} onClick={() => act("revert", { why: "Dropped to 0 or the DM ended it" }, "Back to normal.")}>
        It ended another way (no bonus action)
      </button>
    </>
  );
}

function TextList({ title, items }: { title: string; items: { name: string; text: string }[] }): ReactNode {
  return (
    <>
      <h2 className="sub-head">{title}</h2>
      {items.map((t) => (
        <p key={t.name} className="note">
          <b>{t.name}.</b> <RichText text={t.text} />
        </p>
      ))}
    </>
  );
}
