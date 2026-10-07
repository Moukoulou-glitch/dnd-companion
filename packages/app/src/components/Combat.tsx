import { RichText } from "./Conditions";
import { ABILITIES, ABILITY_NAMES, SKILL_ABILITY, SKILL_NAMES, type Character, type OperationType, type Skill } from "@dnd/schema";
import { formatBonus, signed, turnReminders, type CompanionResult, type DerivedSheet, type RollBreakdown, type WeaponAttack } from "@dnd/engine";
import { damageText } from "./ActionsTab";
import { BreakdownLines } from "./Sheet";
import { SwipeButton } from "./Swipe";
import type { ReactNode } from "react";

type Act = (type: OperationType, payload: unknown, label: string) => unknown;

/** The combat strip at the top of the Play tab: round, what's used this turn, start and end of turn. */
export function CombatCard({
  character,
  sheet,
  act,
  onStartCombat,
  openMove,
  onInitiative,
}: {
  character: Character;
  sheet: DerivedSheet;
  act: Act;
  onStartCombat: () => void;
  openMove: () => void;
  onInitiative: () => void;
}) {
  const cb = character.combat;
  if (!cb) {
    return (
      <button className="big wide" onClick={onStartCombat}>
        Start combat
        <span className="sub">Roll initiative and track your turns</span>
      </button>
    );
  }

  const speed = sheet.speed.total;
  const allowed = speed * (1 + cb.dashes);
  const left = cb.speedZero ? 0 : Math.max(0, allowed - cb.moved);
  const max = sheet.attacksPerAction;
  const toggle = (kind: "action" | "bonus" | "reaction", used: number, label: string) =>
    act("useEconomy", { kind, amount: used > 0 ? -1 : 1 }, used > 0 ? `${label} given back.` : `${label} used.`);
  const reminders = turnReminders(character, sheet);

  return (
    <section className="turn" aria-label="Combat">
      <div className="turn-head">
        <b>Round {cb.round}</b>
        <span className={cb.myTurn ? "tag adv" : "tag"}>{cb.myTurn ? "your turn" : "waiting"}</span>
        <button className="init" onClick={onInitiative} aria-label={cb.initiative !== undefined ? `Initiative ${cb.initiative}. Roll again` : "Roll initiative"}>
          <small>Init</small>
          <b>{cb.initiative ?? "?"}</b>
        </button>
      </div>
      <div className="pills">
        <button
          className="pill"
          data-used={cb.action > 0}
          onClick={() => (cb.attacks > 0 ? act("useEconomy", { kind: "attack", amount: -1 }, "One attack taken back.") : toggle("action", cb.action, "Action"))}
          aria-label={cb.action > 0 ? "Action used. Tap to give it back" : "Action free. Tap to mark it used"}
        >
          <b>Action</b>
          <small>{cb.attacks > 0 ? `${cb.attacks} of ${max} attacks` : cb.action > 0 ? "used" : "free"}</small>
        </button>
        <button className="pill" data-used={cb.bonus > 0} onClick={() => toggle("bonus", cb.bonus, "Bonus action")}>
          <b>Bonus</b>
          <small>{cb.bonus > 0 ? "used" : "free"}</small>
        </button>
        <button className="pill" data-used={cb.reaction > 0} onClick={() => toggle("reaction", cb.reaction, "Reaction")}>
          <b>Reaction</b>
          <small>{cb.reaction > 0 ? "used" : "free"}</small>
        </button>
        <button className="pill" data-used={left === 0} onClick={openMove}>
          <b>Move</b>
          <small>
            {left} of {allowed} ft
          </small>
        </button>
      </div>
      {cb.myTurn ? (
        <SwipeButton key="end" label="Swipe to end my turn" onConfirm={() => act("endTurn", {}, "Turn ended.")} />
      ) : (
        <SwipeButton key="start" label="Swipe to start my turn" tone="plain" onConfirm={() => act("startTurn", {}, "Your turn.")} />
      )}
      {reminders.length > 0 && (
        <ul className="reminders">
          {reminders.map((r) => (
            <li key={r}>
              <RichText text={r} />
            </li>
          ))}
        </ul>
      )}
      <button className="link" onClick={() => act("endCombat", {}, "Combat over.")}>
        End combat
      </button>
    </section>
  );
}

/** Movement for this turn: add feet as you go, Dash for more. */
export function MovePanel({
  character,
  sheet,
  act,
  onDash,
}: {
  character: Character;
  sheet: DerivedSheet;
  act: Act;
  onDash: (economy: "action" | "bonus") => void;
}) {
  const cb = character.combat;
  if (!cb) return <p className="note">Not in combat.</p>;
  const speed = sheet.speed.total;
  const allowed = speed * (1 + cb.dashes);
  const left = cb.speedZero ? -cb.moved : allowed - cb.moved;
  const cunning = sheet.actions.some((a) => a.id === "cunning-action");
  const move = (feet: number) => act("useEconomy", { kind: "move", amount: feet }, feet > 0 ? `Moved ${feet} ft.` : `${-feet} ft back.`);
  return (
    <>
      <p className="note">
        {cb.speedZero ? `Your speed is 0 for the rest of this turn (${cb.speedZero}). ` : ""}Speed {speed} ft{cb.dashes ? `, Dash ×${cb.dashes}` : ""}. Moved {cb.moved} ft, {Math.max(0, left)} ft left.
        {left < 0 ? " That's more than your speed allows." : ""}
      </p>
      <div className="keys" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
        {[5, 10, 15, 30].map((f) => (
          <button key={f} className="key" onClick={() => move(f)}>
            +{f}
          </button>
        ))}
      </div>
      <div className="big-actions" style={{ marginTop: 10 }}>
        <button className="big" disabled={cb.moved === 0} onClick={() => move(-Math.min(5, cb.moved))}>
          −5 ft
        </button>
        <button className="big" onClick={() => onDash("action")}>
          Dash (action)
        </button>
      </div>
      {cunning && (
        <button className="big wide" style={{ marginTop: 10 }} onClick={() => onDash("bonus")}>
          Dash with Cunning Action (bonus)
        </button>
      )}
      <p className="note">Standing up from prone costs half your speed. Difficult terrain costs double.</p>
    </>
  );
}

/** A companion on the Play tab: name, form and hit points at a glance. */
export function CompanionCard({ comp, onOpen }: { comp: CompanionResult; onOpen: () => void }) {
  const f = comp.form;
  const pct = f ? Math.round((f.hp.current / f.hpMax.total) * 100) : 0;
  return (
    <button className="row companion" onClick={onOpen}>
      <div className="row-main">
        <div className="row-title">{comp.name}</div>
        <div className="row-sub">{f ? `${f.name}, AC ${f.ac.total}` : "Choose its form"}</div>
        {comp.states.length > 0 && (
          <div className="companion-tags">
            {comp.states.map((x) => (
              <span key={x.id} className="chip other">
                {x.name} (1)
              </span>
            ))}
          </div>
        )}
        {f && (
          <div className="mini-bar" aria-hidden="true">
            <span style={{ width: `${pct}%` }} />
          </div>
        )}
      </div>
      {f && (
        <span className={`num${f.hp.current === 0 ? " danger-text" : ""}`}>
          {f.hp.current}
          <small>/{f.hpMax.total}</small>
          {f.hp.temp > 0 && <small className="temp"> +{f.hp.temp}</small>}
        </span>
      )}
    </button>
  );
}

/** A companion's full stat block, with rolls, HP and form changes. */
export function CompanionPanel({
  comp,
  character,
  sheet,
  act,
  open,
  openRoll,
  openHp,
  onCommand,
  onAttackInstead,
}: {
  comp: CompanionResult;
  character: Character;
  sheet: DerivedSheet;
  act: Act;
  open: (title: string, body: ReactNode) => void;
  openRoll: (title: string, base: RollBreakdown, attack?: WeaponAttack) => void;
  openHp: () => void;
  onCommand: () => void;
  onAttackInstead: () => void;
}) {
  const f = comp.form;
  const chooseForm = (
    <div className="group">
      {comp.forms.map((form) => (
        <button
          key={form.id}
          className="row"
          aria-current={f?.id === form.id}
          onClick={() => act("setCompanion", { companion: comp.id, form: form.id }, `${form.name} summoned.`)}
        >
          <div className="row-main">
            <div className="row-title">{form.name}</div>
          </div>
          {f?.id === form.id && <span className="tag adv">now</span>}
        </button>
      ))}
    </div>
  );

  if (!f) {
    return (
      <>
        <p className="note">Choose the stat block your beast uses. You can summon a different one after a long rest.</p>
        {chooseForm}
      </>
    );
  }

  const dead = f.hp.current === 0;
  const slots = sheet.spellSlots.filter((s) => s.total - s.used > 0);

  return (
    <>
      <p className="row-sub">
        {f.size} {f.type}, from {comp.source}
      </p>

      <div className="stat-row">
        <button className="stat" onClick={openHp}>
          <b className={dead ? "danger-text" : ""}>
            {f.hp.current}
            <small>/{f.hpMax.total}</small>
          </b>
          <small>HP{f.hp.temp ? ` +${f.hp.temp}` : ""}</small>
        </button>
        <button className="stat" onClick={() => open(`${comp.name}: AC`, <BreakdownLines b={f.ac} totalLabel="AC" />)}>
          <b>{f.ac.total}</b>
          <small>AC</small>
        </button>
        <button className="stat" onClick={() => open(`${comp.name}: hit points`, <BreakdownLines b={f.hpMax} totalLabel="HP max" />)}>
          <b>{f.hpMax.total}</b>
          <small>HP max</small>
        </button>
      </div>
      <p className="note">{[f.speed, f.senses, f.languages].filter(Boolean).map((x) => `${x!.replace(/\.$/, "")}.`).join(" ")}</p>

      {dead && comp.reviveNote && (
        <section>
          <p className="note danger-text">{comp.reviveNote}</p>
          <div className="big-actions">
            {slots.slice(0, 3).map((s) => (
              <button key={s.level} className="big" onClick={() => act("reviveCompanion", { companion: comp.id, level: s.level }, `${comp.name} revived.`)}>
                Revive
                <span className="sub">level {s.level} slot</span>
              </button>
            ))}
            {slots.length === 0 && <p className="note">No spell slots left.</p>}
          </div>
        </section>
      )}

      {character.combat && !dead && (
        <div className="big-actions">
          <button className="big" onClick={onCommand}>
            Command it
            <span className="sub">bonus action</span>
          </button>
          <button className="big" onClick={onAttackInstead}>
            Attack instead of me
            <span className="sub">one of your attacks</span>
          </button>
        </div>
      )}

      {comp.states.length > 0 && (
        <div className="switches effects" aria-label={`What ${comp.name} is doing`}>
          {comp.states.map((x) => (
            <button key={x.id} className="chip other" onClick={() => act("endCompanionState", { companion: comp.id, id: x.id }, `${comp.name}: ${x.name} ended.`)}>
              {x.name} (1) ✕
            </button>
          ))}
        </div>
      )}
      {comp.states.length > 0 && <p className="note">Until your next turn starts. Tap a tag to end it early (a readied action was taken, or it was lost).</p>}

      <CompanionActions comp={comp} sheet={sheet} open={open} openRoll={openRoll} act={act} />

      <h2 className="sub-head">Attacks</h2>
      <div className="group">
        {f.attacks.map((a) => (
          <button key={a.name} className="row" onClick={() => openRoll(`${comp.name}: ${a.name}`, a.attack, a)}>
            <div className="row-main">
              <div className="row-title">{a.name}</div>
              <div className="row-sub">{damageText(a)}</div>
              {a.note && <div className="row-sub">{a.note}</div>}
            </div>
            <span className="num">{formatBonus({ total: a.attack.total, dice: [] })}</span>
          </button>
        ))}
      </div>

      <h2 className="sub-head">Abilities</h2>
      <div className="group">
        {ABILITIES.map((ab) => (
          <div className="row" key={ab}>
            <div className="row-main">
              <div className="row-title">
                {ABILITY_NAMES[ab]} {f.abilities[ab].score}
              </div>
            </div>
            <button className="tag" onClick={() => openRoll(`${comp.name}: ${ABILITY_NAMES[ab]} check`, f.abilities[ab].check)}>
              check {signed(f.abilities[ab].check.total)}
            </button>
            <button className="tag" onClick={() => openRoll(`${comp.name}: ${ABILITY_NAMES[ab]} save`, f.abilities[ab].save)}>
              save {signed(f.abilities[ab].save.total)}
            </button>
          </div>
        ))}
      </div>

      <h2 className="sub-head">Traits</h2>
      <div className="spell-text">
        {f.traits.map((t) => (
          <p key={t.name}>
            <b>{t.name}.</b> <RichText text={t.summary} />
          </p>
        ))}
        {f.saveDc !== undefined && <p className="note">Its save DC is your spell save DC, {f.saveDc}.</p>}
      </div>

      <h2 className="sub-head">Name and form</h2>
      <NameField
        value={character.companions[comp.id]?.name ?? ""}
        placeholder={comp.name}
        onSave={(name) => act("setCompanion", { companion: comp.id, name }, "Name saved.")}
      />
      <p className="note">A different beast after a long rest arrives with full hit points.</p>
      {chooseForm}
    </>
  );
}

/** Things only you do (casting, your own gear and concentration): left out of a companion's list. */
const NOT_FOR_COMPANIONS = /^common-(cast-a-spell|two-weapon-fighting|activate-an-item|identify-a-spell|don-or-doff|end-concentration|attack|disarm)/;

/**
 * The actions anyone can take, for a companion: what each does, and its
 * checks rolled with the companion's own abilities (Stealth uses its Dexterity).
 */
function CompanionActions({
  comp,
  sheet,
  open,
  openRoll,
  act,
}: {
  comp: CompanionResult;
  sheet: DerivedSheet;
  open: (title: string, body: ReactNode) => void;
  openRoll: (title: string, base: RollBreakdown, attack?: WeaponAttack) => void;
  act: Act;
}) {
  const f = comp.form!;
  const take = (a: (typeof list)[number], choice?: string) =>
    act("companionAction", { companion: comp.id, action: a.id, ...(choice ? { choice } : {}) }, `${comp.name}: ${choice ? `${a.name}: ${choice}` : a.name}${a.untilTurnStart ? ", until your next turn starts" : ""}.`);
  const list = sheet.actions.filter((a) => a.common && !NOT_FOR_COMPANIONS.test(a.id));
  const show = (a: (typeof list)[number]) =>
    open(
      `${comp.name}: ${a.name}`,
      <>
        <p className="row-sub">{a.economy === "bonus" ? "Bonus action" : a.economy === "reaction" ? "Reaction" : a.economy === "free" ? "No action" : "Action"}, on its turn</p>
        {a.note && (
          <p>
            <RichText text={a.note} />
          </p>
        )}
        {a.check?.skills.map((sk) => {
          const ab = SKILL_ABILITY[sk as Skill];
          if (!ab) return null;
          const base = f.abilities[ab].check;
          return (
            <button key={sk} className="big primary wide" style={{ marginBottom: 8 }} onClick={() => openRoll(`${comp.name}: ${a.name} (${SKILL_NAMES[sk as Skill]})`, base)}>
              Roll {SKILL_NAMES[sk as Skill]}
              <span className="sub">
                {ABILITY_NAMES[ab]} check {signed(base.total)}
                {a.check?.dc ? `, DC ${a.check.dc}` : ""}
              </span>
            </button>
          );
        })}
        {a.untilTurnStart && !a.choose && (
          <button className="big primary wide" style={{ marginBottom: 8 }} onClick={() => take(a)}>
            {comp.name} takes {a.name}
            <span className="sub">a tag until your next turn starts</span>
          </button>
        )}
        {a.choose && (
          <>
            <p className="sub-head">{a.choose.label}</p>
            <div className="choice-grid">
              {a.choose.options
                .filter((o) => o !== "Cast a Spell")
                .map((o) => (
                  <button key={o} className="big" onClick={() => take(a, o)}>
                    {o}
                  </button>
                ))}
            </div>
          </>
        )}
        {a.check && <p className="note">Rolled with its {a.check.skills.map((sk) => ABILITY_NAMES[SKILL_ABILITY[sk as Skill]]).join(" or ")}; add its proficiency bonus if its stat block lists the skill.</p>}
      </>,
    );
  return (
    <details className="common-actions companion-actions">
      <summary>
        <span className="ca-icon" aria-hidden="true">⚔</span>
        <h2>Actions anyone can take</h2>
        <span className="ca-arrow" aria-hidden="true">▸</span>
        <span className="row-sub">{comp.name} can Dash, Dodge, Help, Hide, Grapple…</span>
      </summary>
      <div className="group">
        {list.map((a) => (
          <button className="row" key={a.id} onClick={() => show(a)}>
            <div className="row-main">
              <div className="row-title">{a.name}</div>
              <div className="row-sub">{a.check ? `Rolls ${a.check.skills.map((s) => SKILL_NAMES[s as Skill]).join(" or ")}` : a.note?.split(/[.:]/)[0]}</div>
            </div>
          </button>
        ))}
      </div>
    </details>
  );
}

function NameField({ value, placeholder, onSave }: { value: string; placeholder: string; onSave: (v: string) => void }) {
  return (
    <form
      className="name-field"
      onSubmit={(e) => {
        e.preventDefault();
        const v = new FormData(e.currentTarget).get("name");
        onSave(String(v ?? "").trim());
      }}
    >
      <input className="search" name="name" defaultValue={value} placeholder={placeholder} aria-label="Companion's name" />
      <button className="big" type="submit">
        Save
      </button>
    </form>
  );
}
