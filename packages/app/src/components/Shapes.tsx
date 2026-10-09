import { useMemo, useState, type ReactNode } from "react";
import { formatBonus, shapeIssues, signed, traitDice, type ContentRegistry, type DerivedSheet, type RollBreakdown, type ShapeKind, type ShapeResult, type WeaponAttack } from "@dnd/engine";
import { ABILITIES, ABILITY_NAMES, SKILLS, SKILL_NAMES, type Character, type CreatureDef, type OperationType } from "@dnd/schema";
import { RichText } from "./Conditions";

type Act = (type: OperationType, payload: unknown, label: string) => unknown;

const crText = (n: number) => (n === 0.125 ? "1/8" : n === 0.25 ? "1/4" : n === 0.5 ? "1/2" : String(n));

function speedText(d: CreatureDef): string {
  const s = d.speed;
  return [s.walk ? `${s.walk} ft` : "", s.climb ? `climb ${s.climb}` : "", s.swim ? `swim ${s.swim}` : "", s.fly ? `fly ${s.fly}` : "", s.burrow ? `burrow ${s.burrow}` : ""].filter(Boolean).join(", ");
}

/** On Play: the form you're in, or a way into one. */
export function ShapeCard({ sheet, onOpen, onTransform }: { sheet: DerivedSheet; onOpen: () => void; onTransform: (kind: ShapeKind) => void }) {
  const s = sheet.shape;
  if (s) {
    const pct = Math.round((s.hp.current / s.hp.max) * 100);
    return (
      <section>
        <h2>{s.kind === "wildshape" ? "Wild Shape" : s.kind === "truepolymorph" ? "True Polymorph" : "Polymorphed"}</h2>
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
  // Polymorph and True Polymorph come from casting them or from "+ Effect"; only Wild Shape has its own button here.
  if (!ws) return null;
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
  kind: ShapeKind;
  sheet: DerivedSheet;
  reg: ContentRegistry;
  character: Character;
  onPick: (kind: ShapeKind, creature: CreatureDef, uses: number) => void;
}) {
  const kind = first;
  const [q, setQ] = useState("");
  const [casterLevel, setCasterLevel] = useState(String(sheet.level));
  const limits = sheet.wildShape;
  const polyMax = Number(casterLevel) || 0;
  const list = useMemo(() => {
    const elementals = new Set(["creature:air-elemental", "creature:earth-elemental", "creature:fire-elemental", "creature:water-elemental"]);
    return reg
      .list("creature")
      .filter((d) => kind === "truepolymorph" || d.type === "beast" || (kind === "wildshape" && elementals.has(d.id)))
      .map((d) => ({ d, issues: shapeIssues(d, kind, limits, polyMax), elemental: elementals.has(d.id) }))
      .sort((a, b) => a.d.cr - b.d.cr || a.d.name.localeCompare(b.d.name));
  }, [reg, kind, limits, polyMax]);
  const shown = list.filter((x) => `${x.d.name} ${x.d.type}`.toLowerCase().includes(q.trim().toLowerCase()));
  const ok = shown.filter((x) => !x.issues.length);
  const beyond = shown.filter((x) => x.issues.length);
  const row = (x: (typeof list)[number]) => (
    <button key={x.d.id} className="row" onClick={() => onPick(kind, x.d, kind === "wildshape" ? (x.elemental ? 2 : 1) : 0)}>
      <div className="row-main">
        <div className="row-title">{x.d.name}</div>
        <div className="row-sub">
          CR {crText(x.d.cr)} · {x.d.size} {kind === "truepolymorph" ? x.d.type : ""} · AC {x.d.ac} · {x.d.hp} HP · {speedText(x.d)}
        </div>
        {x.issues.length > 0 && <div className="row-sub danger-text">{x.issues.join(" ")}</div>}
      </div>
      {x.elemental && <span className="tag">2 uses</span>}
    </button>
  );
  return (
    <>
      {kind === "wildshape" && limits && (
        <p className="note">
          A beast you have seen{limits.moon ? ", Circle of the Moon" : ""}: up to CR {crText(limits.maxCr)}
          {limits.noFly ? ", no flying speed" : ""}
          {limits.noSwim ? ", no swimming speed" : ""}. Your Intelligence, Wisdom and Charisma, alignment and personality stay yours.
          {limits.elemental ? " Elementals take two uses." : ""}
        </p>
      )}
      {kind !== "wildshape" && (
        <>
          <p className="note">
            {kind === "truepolymorph" ? "What type of creature? Its statistics, mind included, replace yours." : "Which beast? Its statistics, mind included, replace yours."} Your table's rule: its CR can be up to the caster's level.
          </p>
          <label className="roll-entry">
            <span>Caster's level</span>
            <input type="number" min={0} inputMode="numeric" value={casterLevel} onChange={(e) => setCasterLevel(e.target.value)} />
          </label>
        </>
      )}
      {character.shape && <p className="note">You're in a form now: picking another replaces it{kind === "wildshape" ? " and uses Wild Shape again" : ""}.</p>}
      <input className="search" type="search" placeholder={kind === "truepolymorph" ? "Search creatures (name or type)" : "Search beasts"} value={q} onChange={(e) => setQ(e.target.value)} />
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
  openAttack,
  onTraitRoll,
  onUseAction,
  attacksMade,
  recharging = [],
}: {
  /** In combat: attacks made this turn, for the Multiattack count. */
  attacksMade?: number;
  /** A stat block action used in combat (Fey Charm): marks the turn. */
  onUseAction?: (name: string, economy: "action" | "bonus" | "reaction") => void;
  /** Rolls an attack and marks the turn, like your own attacks. */
  openAttack: (a: WeaponAttack) => void;
  onTraitRoll: (title: string, dice: string, type?: string) => void;
  normalHp: { current: number; max: number };
  shape: ShapeResult;
  sheet: DerivedSheet;
  act: Act;
  openRoll: (title: string, base: RollBreakdown, attack?: WeaponAttack) => void;
  openHp: () => void;
  onRevert: () => void;
  /** Recharge actions waiting for their d6 (Fire Breath). */
  recharging?: string[];
  onHealSlot: (level: number) => void;
}) {
  const onRecharge = (name: string, used: boolean) => act("recharge", { name, used }, used ? `${name}: used, recharging.` : `${name} is ready again.`);
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
          <h2 className="sub-head">
            Attacks
            {attacksMade !== undefined ? ` · ${attacksMade} of ${s.attacksPerAction} made this turn` : s.attacksPerAction > 1 ? ` · ${s.attacksPerAction} per Attack action` : ""}
          </h2>
          <div className="group">
            {s.attacks.map((a) => (
              <button key={a.name} className="row" onClick={() => openAttack(a)}>
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

      {s.traits.length > 0 && <TextList title="Traits" items={s.traits} onRoll={(t, d, ty) => onTraitRoll(`${s.name}: ${t}`, d, ty)} recharging={recharging} onRecharge={onRecharge} />}
      {s.actions.length > 0 && (
        <TextList
          title="Actions"
          items={s.actions.filter((a) => !s.attacks.some((x) => x.name === a.name))}
          onRoll={(t, d, ty) => onTraitRoll(`${s.name}: ${t}`, d, ty)}
          {...(onUseAction ? { onUse: onUseAction } : {})}
          recharging={recharging}
          onRecharge={onRecharge}
        />
      )}
      <button className="link danger-text" style={{ marginTop: 12 }} onClick={() => act("revert", { why: "Dropped to 0 or the DM ended it" }, "Back to normal.")}>
        It ended another way (no bonus action)
      </button>
    </>
  );
}

/** Which part of a turn a stat block action takes, from its name ("Fey Charm", "Leadership (bonus action)"). */
export const actionEconomy = (name: string): "action" | "bonus" | "reaction" => (/\(bonus action\)$/i.test(name) ? "bonus" : /\(reaction\)$/i.test(name) ? "reaction" : "action");

/** Traits and actions as text; any that deal dice of their own get a button to roll them (Heated Body, Charge); actions can be used. */
/** "Fire Breath (Recharge 5–6)" → 5; "(Recharge 6)" → 6. */
export const rechargeAt = (name: string): number | undefined => {
  const m = /\(recharge (\d)(?:\s*[–-]\s*\d)?\)/i.exec(name);
  return m ? Number(m[1]) : undefined;
};

export function TextList({
  title,
  items,
  onRoll,
  onUse,
  recharging = [],
  onRecharge,
}: {
  title: string;
  items: { name: string; text: string }[];
  onRoll?: (name: string, dice: string, type?: string) => void;
  /** Use it: marks the action, bonus action or reaction. */
  onUse?: (name: string, economy: "action" | "bonus" | "reaction") => void;
  /** Recharge actions that were used and wait for their d6. */
  recharging?: string[];
  /** Marks a recharge action used (true) or ready again (false). */
  onRecharge?: (name: string, used: boolean) => void;
}): ReactNode {
  const [lastRoll, setLastRoll] = useState<Record<string, number>>({});
  if (!items.length) return null;
  return (
    <>
      <h2 className="sub-head">{title}</h2>
      {items.map((t) => {
        const d = onRoll ? traitDice(t.text) : undefined;
        const dc = /DC (\d+) (\w+) saving throw/i.exec(t.text);
        const economy = actionEconomy(t.name);
        const usable = onUse && !/^multiattack/i.test(t.name);
        const at = onRecharge ? rechargeAt(t.name) : undefined;
        const waiting = at !== undefined && recharging.includes(t.name);
        const rollRecharge = () => {
          const n = (crypto.getRandomValues(new Uint32Array(1))[0]! % 6) + 1;
          setLastRoll({ ...lastRoll, [t.name]: n });
          if (n >= at!) onRecharge!(t.name, false);
        };
        return (
          <div key={t.name} className={`trait-text${waiting ? " recharging" : ""}`}>
            <p className="note">
              <b>{t.name}.</b> <RichText text={t.text} />
            </p>
            {(d || usable || dc || waiting) && (
              <div className="choice-row">
                {usable && !waiting && (
                  <button
                    className="tag use"
                    onClick={() => {
                      onUse!(t.name, economy);
                      if (at !== undefined) onRecharge!(t.name, true);
                    }}
                  >
                    Use · {economy === "bonus" ? "bonus action" : economy}
                  </button>
                )}
                {waiting && (
                  <>
                    <span className="tag fail">Recharging ({at}{at! < 6 ? "–6" : ""} on a d6)</span>
                    <button className="tag use" onClick={rollRecharge}>
                      Roll d6
                    </button>
                    <button className="tag" onClick={() => onRecharge!(t.name, false)}>
                      It recharged
                    </button>
                  </>
                )}
                {lastRoll[t.name] !== undefined && (
                  <span className={`tag ${lastRoll[t.name]! >= (at ?? 7) ? "adv" : "fail"}`}>
                    Rolled {lastRoll[t.name]}: {lastRoll[t.name]! >= (at ?? 7) ? "ready" : "not yet"}
                  </span>
                )}
                {dc && (
                  <span className="tag dc-tag dc-tag-big">
                    DC {dc[1]} {dc[2]} save
                  </span>
                )}
                {d && (
                  <button className="tag" onClick={() => onRoll!(t.name, d.dice, d.type)}>
                    Roll {d.dice}
                    {d.type ? ` ${d.type}` : ""}
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}
