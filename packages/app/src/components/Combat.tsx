import { Markdown } from "./Markdown";
import { Critter, hiddenCompanionCritter } from "../fx/critters";
import { hpTier } from "../hp";
import { RichText } from "./Conditions";
import { ABILITIES, ABILITY_NAMES, SKILL_ABILITY, SKILL_NAMES, type Character, type OperationType, type Skill } from "@dnd/schema";
import { formatBonus, readiedNow, signed, turnReminders, type CompanionResult, type ContentRegistry, type DerivedSheet, type RollBreakdown, type WeaponAttack } from "@dnd/engine";
import { damageText } from "./ActionsTab";
import { BreakdownLines } from "./Sheet";
import { SwipeButton } from "./Swipe";
import { useEffect, useState, type ReactNode } from "react";
import { useLongPress } from "../longPress";
import { TurnTracker, type TurnKind } from "./TurnTracker";

export type EconomyKind = "action" | "bonus" | "reaction";

/** A combat pill: a tap does what it always did; a long-press (right-click, Shift+F10) opens its menu. */
function Pill({ used, onTap, onMenu, label, children, className = "pill" }: { used: boolean; onTap: () => void; onMenu: () => void; label: string; children: ReactNode; className?: string }) {
  const press = useLongPress(onTap, onMenu);
  return (
    <button className={`${className} long-press`} data-used={used} aria-label={`${label}. Hold, or Shift+F10, for what you can do`} {...press}>
      {children}
    </button>
  );
}

type Act = (type: OperationType, payload: unknown, label: string) => unknown;

/** The combat strip at the top of the Play tab: round, what's used this turn, start and end of turn. */
export function CombatCard({
  character,
  sheet,
  act,
  onStartCombat,
  openMove,
  onInitiative,
  onLimited,
  onMenu,
  spendReaction,
  reg,
}: {
  /** For the names and turn rules of summoned creatures in the turn order. */
  reg?: ContentRegistry;
  character: Character;
  sheet: DerivedSheet;
  act: Act;
  onStartCombat: () => void;
  openMove: () => void;
  onInitiative: () => void;
  /** Opens an extra action of its own (Haste). */
  onLimited: (actionId: string) => void;
  /** Long-press on Action, Bonus or Reaction: what you can do with it. */
  onMenu: (kind: EconomyKind) => void;
  /** Marks the reaction used, through the turn checks (a readied action asks first). */
  spendReaction: () => void;
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
  // Action Surge adds an action: the pill counts them.
  const actionsTotal = 1 + cb.extraActions;
  const actionsLeft = actionsTotal - cb.action;
  const limited = sheet.actions.filter((a) => a.limited);
  const lethargy = sheet.effects.find((e) => e.id === "effect:haste-lethargy");
  // What's readied (the same tag the Effects show): the Reaction pill says so, and its menu releases it.
  const readied = readiedNow(character);

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
      <TurnOrder character={character} sheet={sheet} {...(reg ? { reg } : {})} />
      <div className="pills">
        <Pill
          used={actionsLeft <= 0 && (cb.attacks === 0 || cb.attacks >= max)}
          onTap={() =>
            cb.attacks > 0
              ? act("useEconomy", { kind: "attack", amount: -1 }, "One attack taken back.")
              : actionsLeft > 0
                ? act("useEconomy", { kind: "action", amount: 1 }, "Action used.")
                : act("useEconomy", { kind: "action", amount: -1 }, "Action given back.")
          }
          onMenu={() => onMenu("action")}
          label={actionsLeft > 0 ? `${actionsLeft} action${actionsLeft === 1 ? "" : "s"} free. Tap to mark one used` : "Action used. Tap to give it back"}
        >
          <b>{actionsTotal > 1 ? `Actions ×${actionsTotal}` : "Action"}</b>
          <small>
            {cb.attacks > 0 ? `${cb.attacks} of ${max} attack${max === 1 ? "" : "s"}${cb.attacks >= max && actionsLeft <= 0 ? " · used" : ""}` : actionsLeft <= 0 ? "used" : actionsTotal > 1 ? `${actionsLeft} free` : "free"}
          </small>
        </Pill>
        {limited.map((a) => {
          const used = cb.usedThisTurn.includes(a.id);
          return (
            <button key={a.id} className="pill haste" data-used={used && !cb.hasteAttack} onClick={() => onLimited(a.id)}>
              <b>{a.source}</b>
              <small>{cb.hasteAttack ? "1 attack ready" : used ? "used" : "extra action"}</small>
            </button>
          );
        })}
        <Pill used={cb.bonus > 0} onTap={() => toggle("bonus", cb.bonus, "Bonus action")} onMenu={() => onMenu("bonus")} label={cb.bonus > 0 ? "Bonus action used. Tap to give it back" : "Bonus action free. Tap to mark it used"}>
          <b>Bonus</b>
          <small>{cb.bonus > 0 ? "used" : "free"}</small>
        </Pill>
        <Pill
          used={cb.reaction > 0}
          // Marking it used goes through the turn checks: with something readied, it asks first.
          onTap={() => (cb.reaction > 0 ? toggle("reaction", cb.reaction, "Reaction") : spendReaction())}
          onMenu={() => onMenu("reaction")}
          label={`${cb.reaction > 0 ? "Reaction used. Tap to give it back" : "Reaction free. Tap to mark it used"}${readied ? `. Readied: ${readied.name}` : ""}`}
        >
          <b>Reaction</b>
          <small>{cb.reaction > 0 ? "used" : readied ? "free · readied" : "free"}</small>
        </Pill>
        <button className="pill" data-used={left === 0} onClick={openMove}>
          <b>Move</b>
          <small>
            {left} of {allowed} ft
            {sheet.shape?.speeds?.fly ? ` · fly ${Math.max(0, sheet.shape.speeds.fly * (1 + cb.dashes) - cb.moved)}` : ""}
          </small>
        </button>
      </div>
      <p className="note pill-hint">Hold Action, Bonus or Reaction for what you can do with it.</p>
      {lethargy && (
        <p className="over-banner" role="alert">
          When the spell ends, the target can't move or take actions until after its next turn, as a wave of lethargy sweeps over it.
        </p>
      )}
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
  if (!cb)
    return (
      <>
        <p className="note">Not in combat.</p>
        <JumpSection sheet={sheet} />
      </>
    );
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
      {sheet.shape?.speeds && Object.keys(sheet.shape.speeds).length > 1 && (
        <p className="note">
          {sheet.shape.name}:{" "}
          {Object.entries(sheet.shape.speeds)
            .map(([k, v]) => `${k} ${Math.max(0, (k === "walk" ? speed : v) * (1 + cb.dashes) - cb.moved)} of ${(k === "walk" ? speed : v) * (1 + cb.dashes)} ft left`)
            .join(" · ")}
          . Switching speeds: what you've moved comes off the new one.{sheet.shape.speeds.fly && !sheet.shape.hover ? " Flying, you fall if knocked prone or your speed drops to 0." : ""}
        </p>
      )}
      <p className="note">Standing up from prone costs half your speed. Difficult terrain costs double.</p>
      <JumpSection sheet={sheet} left={Math.max(0, left)} />
    </>
  );
}

/** How a jump's number is made: "Strength score 16, Jump ×3". */
const jumpParts = (b: DerivedSheet["jump"]["long"]["running"]) => b.parts.map((p) => (/\(×\d+\)$/.test(p.label) ? p.label.replace(/^(.*) \((×\d+)\)$/, "$1 $2") : `${p.label} ${p.value}`)).join(", ");

/** Long and high jump (PHB p. 182), with what changes them, and what each foot costs. */
function JumpSection({ sheet, left }: { sheet: DerivedSheet; left?: number }) {
  const j = sheet.jump;
  const row = (title: string, run: DerivedSheet["jump"]["long"]["running"], stand: DerivedSheet["jump"]["long"]["running"], unit: string) => (
    <div className="row">
      <div className="row-main">
        <div className="row-title">
          {title}: {run.total} ft
          <span className="row-sub"> · standing {stand.total} ft</span>
        </div>
        <div className="row-sub">
          {unit} {jumpParts(run)}
        </div>
      </div>
    </div>
  );
  const max = Math.max(j.long.running.total, j.high.running.total);
  return (
    <section style={{ marginTop: 12 }}>
      <h2 className="sub-head">Jumping</h2>
      <div className="group">
        {row("Long jump", j.long.running, j.long.standing, "With a run-up:")}
        {row("High jump", j.high.running, j.high.standing, "With a run-up:")}
      </div>
      <p className="note">
        A running jump needs {j.runUp} ft on foot right before it; standing, half the distance. Each foot you clear costs a foot of movement
        {left !== undefined ? `: you have ${left} ft left${left < max ? `, so that's as far as you can jump now` : ""}` : ""}.
        {j.dice.length ? ` ${j.dice.map((d) => `${d.label}: add ${d.dice} to the distance when you jump.`).join(" ")}` : ""}
      </p>
      <p className="note">
        Long jump over a low obstacle (no taller than a quarter of the jump): DC 10 Strength (Athletics) to clear it, at your DM's option. Landing in difficult terrain: DC 10 Dexterity (Acrobatics) or you land prone. High jump: you can reach up to the jump's height plus one and a half times your own height; your DM may let you try a Strength (Athletics) check to jump higher.
      </p>
    </section>
  );
}

/** A companion on the Play tab: name, form and hit points at a glance. */
export function CompanionCard({ comp, onOpen }: { comp: CompanionResult; onOpen: () => void }) {
  const f = comp.form;
  const pct = f ? Math.round((f.hp.current / f.hpMax.total) * 100) : 0;
  const pet = f && !comp.away ? hiddenCompanionCritter(comp.name, f.name) : undefined;
  return (
    <button className={`row companion${pet ? " has-pet" : ""}`} onClick={onOpen}>
      {pet && (
        <span className="pet-perch">
          <Critter spec={pet} down={f!.hp.current === 0} label={comp.name} seed={3} />
        </span>
      )}
      <div className="row-main">
        <div className="row-title">{comp.name}</div>
        <div className="row-sub">{comp.away ? "Away: dismissed until you summon it again" : f ? `${f.name}, AC ${f.ac.total}${f.hp.current === 0 && comp.summon ? " · gone until summoned" : ""}` : comp.summon || comp.summonedBy ? "Not summoned" : "Choose its form"}</div>
        {comp.states.length + comp.effects.length > 0 && !comp.away && (
          <div className="companion-tags">
            {comp.states.map((x) => (
              <span key={x.id} className="chip other">
                {x.name} (1)
              </span>
            ))}
            {comp.effects.map((e) => (
              <span key={e.id} className="chip other">
                {e.name}
                {e.rounds !== undefined ? ` · ${e.rounds}` : ""}
              </span>
            ))}
          </div>
        )}
        {f && (
          <div className="mini-bar" aria-hidden="true">
            <span className={`tier-${hpTier(f.hp.current, f.hpMax.total)}`} style={{ width: `${pct}%` }} />
          </div>
        )}
      </div>
      {f && (
        <span className={`num hp-frame tier-${hpTier(f.hp.current, f.hpMax.total)}${f.hp.current === 0 ? " danger-text" : ""}`}>
          {f.hp.current}
          <small>/{f.hpMax.total}</small>
          {f.hp.temp > 0 && <small className="temp"> +{f.hp.temp}</small>}
        </span>
      )}
    </button>
  );
}

/**
 * Summoning a companion that's summoned (the Drakewarden's drake): pick its
 * form (essence), then summon it free (once per long rest) or with a slot.
 */
function SummonSection({ comp, character, sheet, act }: { comp: CompanionResult; character: Character; sheet: DerivedSheet; act: Act }) {
  const sm = comp.summon!;
  const [form, setForm] = useState(comp.form?.id ?? comp.forms[0]!.id);
  const free = sheet.resources.find((r) => r.id === sm.resource);
  const slots = sheet.spellSlots.filter((s) => s.level >= sm.slotMin && s.total - s.used > 0);
  const pact = sheet.pactSlots && sheet.pactSlots.level >= sm.slotMin && character.pactSlotsUsed < sheet.pactSlots.count;
  const name = comp.forms.find((f) => f.id === form)?.name ?? form;
  const summon = (extra: { level?: number; pact?: boolean }, how: string) => act("summonCompanion", { companion: comp.id, form, ...extra }, `${name} summoned (${how}).`);
  return (
    <section>
      <p className="note">{sm.note}</p>
      <div className="types wrap" role="group" aria-label="Form">
        {comp.forms.map((f) => (
          <button key={f.id} className="switch" aria-pressed={form === f.id} onClick={() => setForm(f.id)}>
            {f.name}
          </button>
        ))}
      </div>
      <div className="big-actions">
        <button className="big primary" onClick={() => summon({}, "free")}>
          Summon
          <span className="sub">{free ? (free.remaining > 0 ? `free · ${free.remaining} left` : "free use spent") : "free"}</span>
        </button>
        {slots.slice(0, 3).map((s) => (
          <button key={s.level} className="big" onClick={() => summon({ level: s.level }, `level ${s.level} slot`)}>
            Summon
            <span className="sub">level {s.level} slot</span>
          </button>
        ))}
        {pact && (
          <button className="big" onClick={() => summon({ level: sheet.pactSlots!.level, pact: true }, "Pact slot")}>
            Summon
            <span className="sub">Pact slot</span>
          </button>
        )}
      </div>
    </section>
  );
}

/** A companion's full stat block, with rolls, HP and form changes. */
/**
 * Who goes when: you, the companions and summoned creatures with their own initiative,
 * highest first; those that act on your turn or right after it go with you.
 */
export function turnOrder(character: Character, sheet: DerivedSheet, reg?: ContentRegistry): { name: string; initiative?: number; you?: boolean; with?: string[] }[] {
  const you = { name: "You", you: true, with: [] as string[], ...(character.combat?.initiative !== undefined ? { initiative: character.combat.initiative } : {}) };
  const out: { name: string; initiative?: number; you?: boolean; with?: string[] }[] = [you];
  for (const comp of sheet.companions) {
    if (!comp.form || comp.away || comp.form.hp.current === 0 || (comp.summonedBy && !comp.summonedBy.out)) continue;
    if (comp.turn === "own") out.push({ name: comp.name, ...(comp.initiative !== undefined ? { initiative: comp.initiative } : {}) });
    else you.with.push(comp.turn === "after" ? `${comp.name} (right after)` : comp.name);
  }
  const groups = new Map<string, typeof character.summons>();
  for (const m of character.summons) if (m.hp > 0) groups.set(m.group, [...(groups.get(m.group) ?? []), m]);
  for (const ms of groups.values()) {
    const first = ms[0]!;
    const sum = reg?.list("summon").find((x) => (x.spell ?? x.id) === first.spell);
    const base = first.name ?? reg?.find(first.creature, "creature")?.name ?? first.creature.replace(/^creature:/, "").replace(/-/g, " ");
    const name = ms.length > 1 && !first.name ? `${base} ×${ms.length}` : base;
    if (sum?.initiative === "yours") you.with.push(name);
    else {
      // Each with its own (Conjure Elemental) or one for the group.
      const own = sum?.initiative === "own" ? ms : [first];
      for (const m of own) out.push({ name: own.length > 1 ? (m.name ?? base) : name, ...(m.initiative !== undefined ? { initiative: m.initiative } : {}) });
    }
  }
  return out.sort((a, b) => (b.initiative ?? -999) - (a.initiative ?? -999));
}

function TurnOrder({ character, sheet, reg }: { character: Character; sheet: DerivedSheet; reg?: ContentRegistry }) {
  const order = turnOrder(character, sheet, reg);
  if (order.length < 2 && !order[0]?.with?.length) return null;
  return (
    <p className="turn-order" aria-label="Turn order">
      {order.map((x, i) => (
        <span key={i} className={x.you ? "you" : ""}>
          {x.name} {x.initiative ?? "?"}
          {x.with?.length ? <small> + {x.with.join(", ")}</small> : null}
        </span>
      ))}
    </p>
  );
}

const TURN_WORDS: Record<CompanionResult["turn"], string> = {
  own: "Rolls its own initiative and takes its own turn.",
  yours: "Acts on your turn: its turn comes back when yours starts.",
  after: "Shares your initiative and takes its turn right after yours: it comes back when yours starts.",
};

/** A companion's initiative (when it rolls its own) and its turn: action, bonus action, reaction, movement. */
function CompanionTurn({ comp, character, act, onRollInitiative }: { comp: CompanionResult; character: Character; act: Act; onRollInitiative: () => void }) {
  const f = comp.form!;
  const used = comp.used;
  const [init, setInit] = useState(comp.initiative !== undefined ? String(comp.initiative) : "");
  // A rolled initiative shows in the box.
  useEffect(() => setInit(comp.initiative !== undefined ? String(comp.initiative) : ""), [comp.initiative]);
  const [pending, setPending] = useState<{ what: string; why: string; run: () => void } | null>(null);
  const name = comp.name;
  const per = f.attacksPerAction;
  const busy = (kind: TurnKind | "attack"): string | undefined => {
    if (kind === "attack") {
      if (used.action && used.attacks === 0) return "Its action is already used this turn.";
      if (used.attacks >= per) return `It has made ${used.attacks} of ${per} attacks for its Attack action.`;
      return undefined;
    }
    if (used[kind]) return `Its ${kind === "bonus" ? "bonus action" : kind} is already used this turn.`;
    if (kind === "action" && used.attacks > 0) return "Its action went to the Attack action this turn.";
    return undefined;
  };
  /** Warn, never block: "Use anyway" goes ahead. */
  const tryUse = (kind: TurnKind | "attack", what: string, run: () => void) => {
    const why = busy(kind);
    if (why) setPending({ what, why, run });
    else run();
  };
  const commitInit = () => {
    const n = Number(init);
    if (init.trim() !== "" && Number.isFinite(n) && n !== comp.initiative) act("companionInitiative", { companion: comp.id, value: Math.round(n) }, `${name}: initiative ${Math.round(n)}.`);
  };
  const yourInit = character.combat?.initiative;
  return (
    <>
      <h2 className="sub-head">Its turn</h2>
      <p className="note">{TURN_WORDS[comp.turn]}</p>
      {comp.turn === "own" ? (
        <label className="roll-entry">
          <span>Initiative</span>
          <input
            className="init-input"
            inputMode="numeric"
            value={init}
            placeholder="?"
            onChange={(e) => setInit(e.target.value.replace(/[^0-9-]/g, ""))}
            onBlur={commitInit}
            onKeyDown={(e) => e.key === "Enter" && commitInit()}
            aria-label={`${name}'s initiative`}
          />
          <button className="link inline" onClick={onRollInitiative}>
            roll (d20 {signed(f.abilities.dex.modifier)})
          </button>
        </label>
      ) : (
        yourInit !== undefined && <p className="note">Initiative {yourInit}, with you.</p>
      )}
      {pending && (
        <div className="over-banner pending-float" role="alert">
          <p>
            {pending.what}: {pending.why}
          </p>
          <div className="big-actions">
            <button className="big" onClick={() => setPending(null)}>
              Cancel
            </button>
            <button
              className="big primary"
              onClick={() => {
                const r = pending.run;
                setPending(null);
                r();
              }}
            >
              Use anyway
            </button>
          </div>
        </div>
      )}
      <TurnTracker
        name={name}
        used={used}
        perAction={per}
        speeds={f.speeds}
        {...(/hover/i.test(f.speed) ? { hover: true } : {})}
        inCombat={!!character.combat}
        tryUse={tryUse}
        onEconomy={(kind, on, label) => act("companionEconomy", { companion: comp.id, kind, used: on }, on ? `${name}'s ${label.toLowerCase()} used.` : `${name}'s ${label.toLowerCase()} is back.`)}
        onMove={(ft, mode) =>
          act("companionEconomy", { companion: comp.id, move: ft, mode }, ft < 0 ? `${-ft} ft taken back.` : `${name} ${mode === "walk" ? "moves" : mode === "fly" ? "flies" : `moves (${mode})`} ${ft} ft.`)
        }
        onDash={(on) =>
          on
            ? act("companionEconomy", { companion: comp.id, dash: true, kind: "action", used: true }, `${name} dashes: its speeds double this turn.`)
            : act("companionEconomy", { companion: comp.id, dash: false, kind: "action", used: false }, "Dash taken back.")
        }
        onNewTurn={() => act("companionEconomy", { companion: comp.id, newTurn: true }, `${name}'s turn: everything is back.`)}
        {...(comp.turn !== "own" ? { newTurnNote: "It also comes back by itself when your turn starts." } : {})}
      />
    </>
  );
}

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
  onEdit,
  onSummon,
  onRollInitiative,
  onBack,
  onClose,
  onAddEffect,
}: {
  /** Back to this panel (from an action's details). */
  onBack?: () => void;
  /** Close it (back to where it was opened from). */
  onClose?: () => void;
  /** Put a condition, spell or other effect on it. */
  onAddEffect?: () => void;
  /** Its own initiative, rolled (d20 + its Dexterity). */
  onRollInitiative: () => void;
  /** Out only while its action's timer runs (Hound of Ill Omen): use that action. */
  onSummon?: () => void;
  /** One you made: change it in the Companion Builder. */
  onEdit?: () => void;
  comp: CompanionResult;
  character: Character;
  sheet: DerivedSheet;
  act: Act;
  open: (title: string, body: ReactNode) => void;
  /** `uses`: a damage roll of its own, and the part of its turn it takes (Infused Strikes: its reaction). */
  openRoll: (title: string, base: RollBreakdown, attack?: WeaponAttack, uses?: "action" | "bonus" | "reaction" | "free") => void;
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

  if (!f && comp.summon) return <SummonSection comp={comp} character={character} sheet={sheet} act={act} />;
  if (!f && comp.summonedBy) {
    const a = sheet.actions.find((x) => x.id === comp.summonedBy!.action);
    return (
      <>
        <p className="note">Not here now. It comes when you use {a?.name ?? "its feature"}, and stays while that lasts.</p>
        {a && onSummon && (
          <button className="big primary wide" onClick={onSummon}>
            {a.name}
            <span className="sub">
              {a.economy === "bonus" ? "bonus action" : a.economy}
              {a.cost ? ` · ${a.cost.amount} ${a.cost.name.toLowerCase()} (${a.cost.remaining} left)` : ""}
            </span>
          </button>
        )}
      </>
    );
  }
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
  const back = onClose && (
    <button className="link back-link" onClick={onClose}>
      ‹ Back
    </button>
  );
  const dismiss = (
    <DismissCompanion
      comp={comp}
      onPick={(how) => {
        act("dismissCompanion", { companion: comp.id, how }, how === "away" ? `${comp.name} is dismissed until you summon it again.` : `${comp.name} is dismissed for good.`);
        if (how === "total") onClose?.();
      }}
    />
  );

  if (comp.away)
    return (
      <>
        {back}
        <p className="note">
          {comp.name} is away: dismissed until you summon it again. It keeps its {f.hp.current} of {f.hpMax.total} hit points.
        </p>
        <button className="big primary wide" onClick={() => act("dismissCompanion", { companion: comp.id, how: "back" }, `${comp.name} is back.`)}>
          Summon {comp.name} again
        </button>
        {dismiss}
      </>
    );

  return (
    <>
      {back}
      <p className="row-sub">
        {f.size} {f.type}, {comp.custom ? `${comp.custom.kind || "companion"} of yours${comp.custom.bond?.active ? `, your ${comp.custom.bond.name}` : ""}` : `from ${comp.source}`}
      </p>

      <div className="stat-row">
        <button className={`stat hp-frame tier-${hpTier(f.hp.current, f.hpMax.total)}`} onClick={openHp}>
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
      {!dead && <CompanionTurn comp={comp} character={character} act={act} onRollInitiative={onRollInitiative} />}

      {dead && comp.summon && (
        <>
          <p className="note danger-text">{comp.name} is gone until you summon it again.</p>
          <SummonSection comp={comp} character={character} sheet={sheet} act={act} />
        </>
      )}
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
            {sheet.pactSlots && sheet.pactSlots.used < sheet.pactSlots.count && (
              <button className="big" onClick={() => act("reviveCompanion", { companion: comp.id, level: sheet.pactSlots!.level, pact: true }, `${comp.name} revived.`)}>
                Revive
                <span className="sub">Pact slot</span>
              </button>
            )}
            {slots.length === 0 && !(sheet.pactSlots && sheet.pactSlots.used < sheet.pactSlots.count) && <p className="note">No spell slots left.</p>}
          </div>
        </section>
      )}

      {comp.summonedBy?.out && (
        <button
          className="link"
          onClick={() => {
            const e = character.effects.find((x) => x.companion === comp.id);
            if (e) act("removeEffect", { instanceId: e.id }, `${comp.name} is gone.`);
          }}
        >
          End it now (its target dropped to 0, or you dismiss it)
        </button>
      )}
      {comp.custom?.bond && !comp.custom.bond.active && (
        <p className="warn">Bonded as your {comp.custom.bond.name}, but that feature isn't in use, so its bonuses are off.</p>
      )}
      {/* Your own companions act on their own (or as your DM says); a feature's companion (or your Ranger's Companion) takes commands. */}
      {character.combat && !dead && comp.command && (
        <div className="big-actions">
          <button className="big" onClick={onCommand}>
            Command it
            <span className="sub">{comp.command.economy === "action" ? "your action" : "bonus action"}</span>
          </button>
          {comp.command.attackInstead && (
            <button className="big" onClick={onAttackInstead}>
              Attack instead of me
              <span className="sub">one of your attacks</span>
            </button>
          )}
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
      {comp.states.length > 0 && <p className="note">Until {comp.turn === "own" ? "its" : "your"} next turn starts. Tap a tag to end it early (a readied action was taken, or it was lost).</p>}

      <div className="switches effects" aria-label={`Effects on ${comp.name}`}>
        {comp.effects.map((e) => (
          <button
            key={e.id}
            className="chip other"
            onClick={() =>
              open(
                `${e.name} on ${comp.name}`,
                <CompanionEffectPanel comp={comp} e={e} act={act} {...(onBack ? { onBack } : {})} />,
              )
            }
          >
            {e.name}
            {e.choice ? ` (${e.choice})` : ""}
            {e.rounds !== undefined ? ` · ${e.rounds}` : ""}
            {e.concentration ? " ◆" : ""}
          </button>
        ))}
        {onAddEffect && (
          <button className="chip add" onClick={onAddEffect}>
            + Effect
          </button>
        )}
      </div>
      {f.defenses.resist.length + f.defenses.immune.length + f.defenses.vulnerable.length > 0 && (
        <p className="note">
          {[
            f.defenses.resist.length ? `Resists ${f.defenses.resist.join(", ")}` : "",
            f.defenses.immune.length ? `Immune to ${f.defenses.immune.join(", ")}` : "",
            f.defenses.vulnerable.length ? `Vulnerable to ${f.defenses.vulnerable.join(", ")}` : "",
          ]
            .filter(Boolean)
            .join(". ")}
          .
        </p>
      )}

      <CompanionActions comp={comp} sheet={sheet} open={open} openRoll={openRoll} act={act} onBack={onBack} />

      {f.rolls.length > 0 && (
        <>
          <h2 className="sub-head">Its rolls</h2>
          <div className="group">
            {f.rolls.map((x) => {
              const empty = { total: 0, parts: [], dice: [], advantage: [], disadvantage: [], suggestions: [] };
              const a: WeaponAttack = {
                attackId: `companion:${comp.id}:${x.name}`,
                name: x.name,
                mode: "melee",
                action: "attack",
                ability: "str",
                proficient: false,
                attack: empty,
                damage: { dice: x.dice, type: x.damageType, bonus: empty, onCrit: [], critExtraDice: [] },
                properties: [],
              };
              const used = x.economy !== "free" && x.economy !== "action" && comp.used[x.economy];
              return (
                <button key={x.name} className="row" onClick={() => openRoll(`${comp.name}: ${x.name}`, empty, a, x.economy)}>
                  <div className="row-main">
                    <div className="row-title">{x.name}</div>
                    <div className="row-sub">
                      {x.dice} {x.damageType} · {x.economy === "reaction" ? "its reaction" : x.economy === "bonus" ? "its bonus action" : x.economy === "action" ? "its action" : "no action"}
                      {used ? " (already used this turn)" : ""}
                    </div>
                    {x.note && <div className="row-sub">{x.note}</div>}
                  </div>
                </button>
              );
            })}
          </div>
        </>
      )}

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

      {comp.custom ? (
        <>
          {comp.custom.notes && (
            <>
              <h2 className="sub-head">Notes</h2>
              <Markdown className="story-view" text={comp.custom.notes} />
            </>
          )}
          {onEdit && (
            <button className="big wide" onClick={onEdit}>
              Edit {comp.name}
            </button>
          )}
        </>
      ) : (
        <>
      <h2 className="sub-head">Name and form</h2>
      <NameField
        value={character.companions[comp.id]?.name ?? ""}
        placeholder={comp.name}
        onSave={(name) => act("setCompanion", { companion: comp.id, name }, "Name saved.")}
      />
      {comp.summon ? (
        !dead && (
          <>
            <h2 className="sub-head">Summon again</h2>
            <SummonSection comp={comp} character={character} sheet={sheet} act={act} />
          </>
        )
      ) : (
        <>
          <p className="note">A different beast after a long rest arrives with full hit points.</p>
          {chooseForm}
        </>
      )}
        </>
      )}
      {dismiss}
    </>
  );
}

/** Dismiss: until you summon it again, or for good. Asks which. */
function DismissCompanion({ comp, onPick }: { comp: CompanionResult; onPick: (how: "away" | "total") => void }) {
  const [asking, setAsking] = useState(false);
  if (!asking)
    return (
      <button className="big wide" style={{ marginTop: 12 }} onClick={() => setAsking(true)}>
        Dismiss {comp.name}
      </button>
    );
  return (
    <div className="group" style={{ marginTop: 12 }}>
      <p className="note" style={{ padding: "8px 12px 0" }}>
        Dismiss {comp.name}:
      </p>
      {!comp.away && (
        <button className="row" onClick={() => onPick("away")}>
          <div className="row-main">
            <div className="row-title">Until I summon it again</div>
            <div className="row-sub">It leaves the fight and keeps its hit points; bring it back from here.</div>
          </div>
        </button>
      )}
      <button className="row" onClick={() => onPick("total")}>
        <div className="row-main">
          <div className="row-title danger-text">Total Dismiss</div>
          <div className="row-sub">{comp.custom ? "It's deleted from your companions (Undo in the toast brings it back)." : "It's gone: summon or choose it again to have it back."}</div>
        </div>
      </button>
      <button className="link" onClick={() => setAsking(false)}>
        Keep it
      </button>
    </div>
  );
}

/** One effect on a companion: its rounds, and ending it. */
function CompanionEffectPanel({ comp, e, act, onBack }: { comp: CompanionResult; e: CompanionResult["effects"][number]; act: Act; onBack?: () => void }) {
  const set = (rounds: number | null, note: string) => act("companionEffect", { companion: comp.id, effect: e.effect, add: false, instance: e.id, rounds }, note);
  return (
    <>
      {onBack && (
        <button className="link back-link" onClick={onBack}>
          ‹ Back to {comp.name}
        </button>
      )}
      <p className="note">
        {e.rounds !== undefined ? `${e.rounds} ${e.rounds === 1 ? "round" : "rounds"} left: counts down at the start of ${comp.turn === "own" ? "its" : "your"} turn.` : "No timer."}
        {e.concentration ? " Ends with your concentration." : ""}
      </p>
      {e.baseLevel !== undefined && (
        <>
          <p className="sub-head">Cast at level</p>
          <div className="choice-grid">
            {Array.from({ length: 10 - e.baseLevel }, (_, i) => e.baseLevel! + i).map((l) => (
              <button key={l} className={`big${l === (e.slotLevel ?? e.baseLevel) ? " primary" : ""}`} aria-pressed={l === (e.slotLevel ?? e.baseLevel)} onClick={() => l !== (e.slotLevel ?? e.baseLevel) && act("companionEffect", { companion: comp.id, effect: e.effect, add: false, instance: e.id, slotLevel: l }, `${e.name} on ${comp.name}: level ${l}.`)}>
                {l}
              </button>
            ))}
          </div>
        </>
      )}
      <div className="big-actions">
        <button className="big" onClick={() => set(Math.max(0, (e.rounds ?? 1) - 1), "One round less.")}>
          One round less
        </button>
        <button className="big" onClick={() => set((e.rounds ?? 0) + 1, "One round more.")}>
          One round more
        </button>
      </div>
      <button
        className="big wide damage"
        style={{ marginTop: 12 }}
        onClick={() => {
          act("companionEffect", { companion: comp.id, effect: e.effect, add: false, instance: e.id }, `${e.name} ends on ${comp.name}.`);
          onBack?.();
        }}
      >
        End {e.name}
      </button>
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
  onBack,
}: {
  comp: CompanionResult;
  sheet: DerivedSheet;
  open: (title: string, body: ReactNode) => void;
  openRoll: (title: string, base: RollBreakdown, attack?: WeaponAttack) => void;
  act: Act;
  /** Back to the companion's panel. */
  onBack?: (() => void) | undefined;
}) {
  const f = comp.form!;
  const until = comp.turn === "own" ? ", until its next turn starts" : ", until your next turn starts";
  // Taking it uses its action (or bonus action, reaction, one of its attacks), marked on its turn.
  const take = (a: (typeof list)[number], choice?: string, stay = false) => {
    act("companionAction", { companion: comp.id, action: a.id, ...(choice ? { choice } : {}) }, `${comp.name}: ${choice ? `${a.name}: ${choice}` : a.name}${a.untilTurnStart ? until : ""}.`);
    if (!stay) onBack?.();
  };
  const uses = (a: (typeof list)[number]) => (a.asAttack ? "one of its attacks" : a.economy === "bonus" ? "its bonus action" : a.economy === "reaction" ? "its reaction" : "its action");
  const list = sheet.actions.filter((a) => a.common && !NOT_FOR_COMPANIONS.test(a.id));
  const show = (a: (typeof list)[number]) =>
    open(
      `${comp.name}: ${a.name}`,
      <>
        {onBack && (
          <button className="link back-link" onClick={onBack}>
            ‹ Back to {comp.name}
          </button>
        )}
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
            <button
              key={sk}
              className="big primary wide"
              style={{ marginBottom: 8 }}
              onClick={() => {
                take(a, undefined, true);
                openRoll(`${comp.name}: ${a.name} (${SKILL_NAMES[sk as Skill]})`, base);
              }}
            >
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
            <span className="sub">
              {uses(a)}; a tag{until}
            </span>
          </button>
        )}
        {!a.untilTurnStart && !a.choose && !a.check && a.economy !== "free" && (
          <button className="big primary wide" style={{ marginBottom: 8 }} onClick={() => take(a)}>
            {comp.name} takes {a.name}
            <span className="sub">{a.id === "common-dash" ? `${uses(a)}; its speeds double this turn` : uses(a)}</span>
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
