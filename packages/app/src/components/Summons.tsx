import { useMemo, useState } from "react";
import { creatureBlock, creatureCasting, summonBlock, creatureSpells, formatBonus, signed, summonOptions, type ContentRegistry, type CreatureSpellGroup, type CreatureSpells, type RollBreakdown, type WeaponAttack } from "@dnd/engine";
import { ABILITIES, ABILITY_NAMES, SKILL_NAMES, type Character, type CreatureDef, type OperationType, type Skill, type SpellDef } from "@dnd/schema";
import { RichText } from "./Conditions";
import { SwipeButton } from "./Swipe";
import { TextList } from "./Shapes";

type Act = (type: OperationType, payload: unknown, label: string) => unknown;

/** Rounds as time: 3 rounds, 4 min, 8 h. */
const roundsText = (r: number) => (r < 10 ? `${r} rd` : r < 600 ? `${Math.round(r / 10)} min` : `${Math.round((r / 600) * 10) / 10} h`);

const crText = (n: number) => (n === 0.125 ? "1/8" : n === 0.25 ? "1/4" : n === 0.5 ? "1/2" : String(n));

/** After casting a summoning spell: which creatures, and how many (warned past the limit, never blocked). */
export function SummonPicker({ reg, summon, slot, onSummon }: { reg: ContentRegistry; summon: string; slot: number; onSummon: (creatures: { creature: string; count: number }[]) => void }) {
  const def = reg.find(summon, "summon");
  const opts = useMemo(() => summonOptions(reg, summon, slot), [reg, summon, slot]);
  const [tier, setTier] = useState(0);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [q, setQ] = useState("");
  if (!def || !opts) return <p className="note">Nothing to summon.</p>;
  const t = opts.tiers[tier];
  const limit = t ? t.count : opts.count ?? 1;
  const maxCr = t?.maxCr ?? (def.crBySlot ? slot : Infinity);
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const list = opts.creatures.filter((d) => d.cr <= maxCr || counts[d.id]).filter((d) => d.name.toLowerCase().includes(q.trim().toLowerCase()));
  const set = (d: CreatureDef, n: number) => setCounts({ ...counts, [d.id]: Math.max(0, n) });
  return (
    <>
      {def.note && <p className="note">{def.note}</p>}
      {opts.tiers.length > 0 && (
        <div className="choice-grid" role="radiogroup" aria-label="How many">
          {opts.tiers.map((x, i) => (
            <button key={i} className={`chip${tier === i ? " on" : ""}`} onClick={() => setTier(i)}>
              {x.count} × CR {crText(x.maxCr)}
            </button>
          ))}
        </div>
      )}
      <p className="note">
        {total} of {limit} chosen{maxCr !== Infinity ? `, CR ${crText(maxCr)} or lower` : ""}.
      </p>
      {total > limit && (
        <p className="over-banner" role="alert">
          {total} creatures: the spell gives {limit} here. Fine if your DM agrees.
        </p>
      )}
      {opts.creatures.length > 12 && <input className="search" type="search" placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} />}
      <div className="group">
        {list.map((d) => (
          <div className="row" key={d.id}>
            <div className="row-main">
              <div className="row-title">{d.name}</div>
              <div className="row-sub">
                CR {crText(d.cr)} · AC {d.ac} · {d.hp} HP
              </div>
            </div>
            <div className="stepper">
              <button aria-label={`One fewer ${d.name}`} onClick={() => set(d, (counts[d.id] ?? 0) - 1)}>
                −
              </button>
              <span>{counts[d.id] ?? 0}</span>
              <button aria-label={`One more ${d.name}`} onClick={() => set(d, (counts[d.id] ?? 0) + 1)}>
                +
              </button>
            </div>
          </div>
        ))}
        {list.length === 0 && <div className="row row-sub">No creatures of that kind in the content: load a bestiary book file.</div>}
      </div>
      <button
        className="big primary wide"
        style={{ marginTop: 12 }}
        disabled={total === 0}
        onClick={() =>
          onSummon(
            Object.entries(counts)
              .filter(([, n]) => n > 0)
              .map(([creature, count]) => ({ creature, count })),
          )
        }
      >
        Summon {total || ""}
      </button>
    </>
  );
}

/** On Play: what you've summoned, by spell. */
export function SummonsCard({ character, reg, onOpen }: { character: Character; reg: ContentRegistry; onOpen: (group: string) => void }) {
  const groups = [...new Set(character.summons.map((s) => s.group))];
  if (!groups.length) return null;
  return (
    <section>
      <h2>Summoned</h2>
      <div className="group">
        {groups.map((g) => {
          const members = character.summons.filter((s) => s.group === g);
          const spell = reg.find(members[0]!.spell, "spell")?.name ?? "Spell";
          const names = [...new Set(members.map((m) => reg.find(m.creature, "creature")?.name ?? m.creature))];
          const hp = members.reduce((t, m) => t + m.hp, 0);
          const max = members.reduce((t, m) => t + (summonBlock(reg, m)?.hp.max ?? reg.find(m.creature, "creature")?.hp ?? m.hp), 0);
          return (
            <button key={g} className="row companion" onClick={() => onOpen(g)}>
              <div className="row-main">
                <div className="row-title">
                  {members.length > 1 ? `${members.length} × ` : ""}
                  {names.join(", ")}
                </div>
                <div className="row-sub">
                  {spell}
                  {members[0]!.initiative !== undefined ? ` · initiative ${members[0]!.initiative}` : character.combat ? " · roll initiative" : ""}
                  {members.some((m) => m.concentration) ? " · concentration" : ""}
                </div>
                <div className="mini-bar" aria-hidden="true">
                  <span style={{ width: `${max ? Math.round((hp / max) * 100) : 0}%` }} />
                </div>
              </div>
              <span className="num">
                {hp}
                <small>/{max}</small>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

/** One summoning: each creature's HP, initiative, stat block and attacks; dismiss one or all. */
export function SummonGroupPanel({
  character,
  reg,
  group,
  act,
  openRoll,
  openHp,
  rollInitiative,
  openMember,
}: {
  character: Character;
  reg: ContentRegistry;
  group: string;
  act: Act;
  openRoll: (title: string, base: RollBreakdown, attack?: WeaponAttack) => void;
  openHp: (id: string) => void;
  rollInitiative: (group: string, id?: string) => void;
  /** One creature's own turn, effects and concentration. */
  openMember: (id: string) => void;
}) {
  const members = character.summons.filter((s) => s.group === group);
  if (!members.length) return <p className="note">They're gone.</p>;
  const sumDef = reg.list("summon").find((s) => s.spell === members[0]!.spell);
  const shared = sumDef?.initiative !== "own";
  const kinds = [...new Set(members.map((m) => m.creature))];
  return (
    <>
      {sumDef?.note && <p className="note">{sumDef.note}</p>}
      <div className="group">
        {members.map((m, i) => {
          const d = reg.find(m.creature, "creature");
          return (
            <div className="row" key={m.id}>
              <button className="row-main plain" onClick={() => openMember(m.id)}>
                <div className="row-title">
                  {m.name ?? d?.name ?? m.creature} {members.length > 1 ? i + 1 : ""} ›
                </div>
                <div className="row-sub">
                  AC {summonBlock(reg, m)?.ac ?? d?.ac ?? "?"}
                  {!shared && m.initiative !== undefined ? ` · initiative ${m.initiative}` : ""}
                  {m.used && (m.used.action || m.used.bonus || m.used.reaction) ? ` · ${[m.used.action && "action", m.used.bonus && "bonus", m.used.reaction && "reaction"].filter(Boolean).join(", ")} used` : ""}
                  {m.effects?.length ? ` · ${m.effects.map((e) => reg.find(e.effect, "effect")?.name ?? e.effect).join(", ")}` : ""}
                  {m.concentrating ? ` · concentrating on ${m.concentrating}` : ""}
                </div>
              </button>
              <button className={`chip${m.hp === 0 ? " danger-text" : ""}`} onClick={() => openHp(m.id)}>
                {m.hp}/{summonBlock(reg, m)?.hp.max ?? d?.hp ?? "?"} HP
              </button>
              {!shared && (
                <button className="chip" onClick={() => rollInitiative(group, m.id)}>
                  Init
                </button>
              )}
              <button className="chip" aria-label={`Dismiss ${d?.name ?? "it"}`} onClick={() => act("dismiss", { id: m.id }, `${d?.name ?? "It"} is gone.`)}>
                ✕
              </button>
            </div>
          );
        })}
      </div>
      <div className="row" style={{ marginTop: 10 }}>
        <span className="row-main row-sub">{shared ? "Initiative for the group" : "Type an initiative for all of them"}</span>
        <input
          className="init-input"
          inputMode="numeric"
          key={members[0]!.initiative ?? "none"}
          defaultValue={members[0]!.initiative ?? ""}
          placeholder="?"
          aria-label="Initiative"
          onBlur={(e) => {
            const n = Number(e.currentTarget.value);
            if (e.currentTarget.value.trim() !== "" && Number.isFinite(n)) act("summonInitiative", { group, value: Math.round(n) }, `Initiative ${Math.round(n)}.`);
          }}
          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
        />
      </div>
      <div className="big-actions" style={{ marginTop: 10 }}>
        {shared && (
          <button className="big" onClick={() => rollInitiative(group)}>
            {members[0]!.initiative !== undefined ? `Initiative ${members[0]!.initiative}` : "Roll initiative"}
            <span className="sub">{sumDef?.initiative === "yours" ? "they act on your turn" : "one roll for the group"}</span>
          </button>
        )}
        <button className="big" onClick={() => act("dismiss", { group }, "Dismissed.")}>
          Dismiss all
        </button>
      </div>
      {kinds.map((k) => {
        const b = creatureBlock(reg, k);
        if (!b) return null;
        return (
          <section key={k}>
            <h2 className="sub-head">
              {b.name} · {b.size} {b.type}, CR {crText(b.cr)} · speed {b.speed}
            </h2>
            {b.attacks.length > 0 && (
              <div className="group">
                {b.attacks.map((a) => (
                  <button key={a.name} className="row" onClick={() => openRoll(`${b.name}: ${a.name}`, a.attack, a)}>
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
            )}
            <div className="choice-grid" style={{ margin: "8px 0" }}>
              {ABILITIES.map((ab) => (
                <button key={ab} className="tag" onClick={() => openRoll(`${b.name}: ${ABILITY_NAMES[ab]} save`, b.saves[ab])}>
                  {ABILITY_NAMES[ab].slice(0, 3)} {b.abilities[ab].score} ({signed(b.abilities[ab].modifier)})
                </button>
              ))}
            </div>
            {[...b.traits, ...b.actions.filter((a) => !b.attacks.some((x) => x.name === a.name))].map((t) => (
              <p key={t.name} className="note">
                <b>{t.name}.</b> <RichText text={t.text} />
              </p>
            ))}
          </section>
        );
      })}
    </>
  );
}

type Member = Character["summons"][number];

/** Where a creature's spell comes from: its stat block's group, or nowhere (cast anyway). */
export interface SpellSource {
  info?: CreatureSpells;
  group?: CreatureSpellGroup;
}

/** The use key a cast counts against, and how many it has. */
export function spellUseKey(spell: { name: string; id?: string }, g?: CreatureSpellGroup): { key?: string; max?: number } {
  if (!g) return {};
  if (g.slots !== undefined && g.level !== undefined) return { key: `slot:${g.level}`, max: g.slots };
  if (g.perDay !== undefined) return g.shared ? { key: `day:${g.label}`, max: g.perDay } : { key: spell.id ?? spell.name.toLowerCase(), max: g.perDay };
  return {};
}

/** What part of a turn a casting time takes. */
export const castEconomy = (castingTime: string): "action" | "bonus" | "reaction" | "none" =>
  /bonus/i.test(castingTime) ? "bonus" : /reaction/i.test(castingTime) ? "reaction" : /^1 action/i.test(castingTime) ? "action" : "none";

/** Uses as dots: gold while available, hollow once used. Tap a gold one to use it, a hollow one to get it back. */
function Pips({ left, total, onUse, onRestore, what = "use" }: { left: number; total: number; onUse?: () => void; onRestore?: () => void; what?: string }) {
  return (
    <span className="mpips" aria-label={`${left} of ${total} left`}>
      {Array.from({ length: total }, (_, i) =>
        onUse || onRestore ? (
          <button
            key={i}
            className={i < left ? "mpip on" : "mpip"}
            aria-label={i < left ? `Use one ${what}` : `Give one ${what} back`}
            onClick={() => (i < left ? onUse?.() : onRestore?.())}
          />
        ) : (
          <span key={i} className={i < left ? "mpip on" : "mpip"} />
        ),
      )}
    </span>
  );
}

/** Search spells: its own first, then the ones it normally can't cast. */
function SpellSearch({
  reg,
  own,
  filter,
  placeholder,
  onPick,
}: {
  reg: ContentRegistry;
  own: { name: string; id?: string }[];
  filter?: (d: SpellDef) => boolean;
  placeholder: string;
  onPick: (sp: { name: string; id?: string }, its: boolean) => void;
}) {
  const [q, setQ] = useState("");
  const all = useMemo(() => reg.list("spell"), [reg]);
  const needle = q.trim().toLowerCase();
  const ownIds = new Set(own.map((o) => o.id ?? o.name.toLowerCase()));
  // Its own spells are listed below with their uses; here they show only for a search.
  const mine = !needle ? [] : own.filter((o) => {
    const d = o.id ? reg.find(o.id, "spell") : undefined;
    return (!filter || (d && filter(d))) && o.name.toLowerCase().includes(needle);
  });
  const others = needle ? all.filter((d) => !ownIds.has(d.id) && (!filter || filter(d)) && d.name.toLowerCase().includes(needle)).slice(0, 25) : [];
  return (
    <>
      <input className="search" type="search" placeholder={placeholder} value={q} onChange={(e) => setQ(e.target.value)} aria-label={placeholder} />
      {mine.length > 0 && (
        <>
          <p className="sub-head small">Its spells</p>
          <div className="group">
            {mine.map((o) => (
              <button key={o.name} className="row" onClick={() => (onPick(o, true), setQ(""))}>
                <div className="row-main">
                  <div className="row-title">{o.id ? reg.find(o.id, "spell")?.name ?? o.name : o.name}</div>
                </div>
              </button>
            ))}
          </div>
        </>
      )}
      {others.length > 0 && (
        <>
          <p className="sub-head small">Not its spells</p>
          <p className="over-banner">Normally this creature can't cast these. Fine if your DM agrees.</p>
          <div className="group">
            {others.map((d) => (
              <button key={d.id} className="row" onClick={() => (onPick({ name: d.name, id: d.id }, false), setQ(""))}>
                <div className="row-main">
                  <div className="row-title">{d.name}</div>
                  <div className="row-sub">
                    {d.level === 0 ? "Cantrip" : `Level ${d.level}`} · {d.castingTime}
                    {d.concentration ? " · concentration" : ""}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </>
      )}
      {needle && !mine.length && !others.length && <p className="note">No spell by that name.</p>}
    </>
  );
}

const COMMON_SKIP = /^(Attack|Cast a Spell|Opportunity Attack|Two-Weapon Fighting|Don or Doff a Shield|End Concentration|Other Activity)$/;

/** One summoned creature: its own turn, initiative, effects, concentration, spells, attacks and actions. */
export function SummonMemberPanel({
  member: m,
  reg,
  act,
  inCombat,
  openHp,
  onTraitRoll,
  openAttack,
  onCheck,
  onAddEffect,
  onRollInitiative,
  onSpell,
  back,
}: {
  member: Member;
  reg: ContentRegistry;
  act: Act;
  inCombat: boolean;
  openHp: () => void;
  onTraitRoll: (title: string, dice: string, type?: string) => void;
  /** Rolls the attack; using it marks the creature's action (or bonus action). */
  openAttack: (a: WeaponAttack) => void;
  onCheck: (title: string, base: RollBreakdown) => void;
  onAddEffect: () => void;
  onRollInitiative: () => void;
  onSpell: (spell: { name: string; id?: string }, source: SpellSource) => void;
  back: () => void;
}) {
  const [common, setCommon] = useState<string | null>(null);
  const [init, setInit] = useState<string>(m.initiative !== undefined ? String(m.initiative) : "");
  const def = reg.find(m.creature, "creature");
  const b = summonBlock(reg, m);
  const [moving, setMoving] = useState(false);
  const [mode, setMode] = useState("walk");
  const [pending, setPending] = useState<{ what: string; why: string; run: () => void } | null>(null);
  const [editEffect, setEditEffect] = useState<string | null>(null);
  const spells = useMemo(() => (def ? creatureSpells(reg, def) : []), [reg, def]);
  const name = m.name ?? b?.name ?? m.creature;
  const used = { action: false, bonus: false, reaction: false, attacks: 0, moved: 0, dashes: 0, ...m.used };
  const perAction = b ? b.attacksPerAction : 1;
  const own = spells.flatMap((sp) => sp.groups.flatMap((g) => g.spells));
  const sourceOf = (sp: { name: string; id?: string }): SpellSource => {
    for (const info of spells) for (const group of info.groups) if (group.spells.some((x) => (x.id && x.id === sp.id) || x.name.toLowerCase() === sp.name.toLowerCase())) return { info, group };
    return {};
  };
  const economy = (kind: "action" | "bonus" | "reaction", label: string) => (
    <button
      className="pill"
      data-used={used[kind] && (kind !== "action" || used.attacks === 0 || used.attacks >= perAction)}
      onClick={() => act("summonEconomy", { id: m.id, kind, used: !used[kind] }, used[kind] ? `${name}'s ${label.toLowerCase()} is back.` : `${name}'s ${label.toLowerCase()} used.`)}
    >
      <b>{label}</b>
      <small>{kind === "action" && used.attacks > 0 ? `${used.attacks} of ${perAction} attack${perAction === 1 ? "" : "s"}` : used[kind] ? "used" : "free"}</small>
    </button>
  );
  const commons = reg
    .list("feature")
    .filter((f) => f.common)
    .map((f) => ({ f, a: f.grant?.actions?.[0] }))
    .filter((x) => x.a && x.a.economy !== "free" && !COMMON_SKIP.test(x.f.name));
  const commitInit = () => {
    const n = Number(init);
    if (init.trim() !== "" && Number.isFinite(n) && n !== m.initiative) act("summonInitiative", { group: m.group, id: m.id, value: Math.round(n) }, `${name}: initiative ${Math.round(n)}.`);
  };
  const defenses = b?.defenses;
  /** Why using this now goes beyond its turn (empty: fine). */
  const busy = (kind: "action" | "bonus" | "reaction" | "attack"): string | undefined => {
    if (kind === "attack") {
      if (used.action && used.attacks === 0) return "Its action is already used this turn.";
      if (used.attacks >= perAction) return `It has made ${used.attacks} of ${perAction} attacks for its Attack action.`;
      return undefined;
    }
    if (used[kind]) return `Its ${kind === "bonus" ? "bonus action" : kind} is already used this turn.`;
    if (kind === "action" && used.attacks > 0) return "Its action went to the Attack action this turn.";
    return undefined;
  };
  /** Warn, never block: "Use anyway" goes ahead. */
  const tryUse = (kind: "action" | "bonus" | "reaction" | "attack", what: string, run: () => void) => {
    const why = busy(kind);
    if (why) setPending({ what, why, run });
    else run();
  };
  const speeds = b?.speeds ?? { walk: b?.walk ?? 0 };
  const left = (mode: string) => Math.max(0, (speeds[mode] ?? 0) * (1 + used.dashes) - used.moved);
  const editing = (m.effects ?? []).find((e) => e.id === editEffect);
  const editingDef = editing ? reg.find(editing.effect, "effect") : undefined;
  // "Legendary Resistance (3/Day)", "Breath Weapon (Recharge 5–6)": uses to mark.
  const limitedUses = b
    ? [...b.traits, ...b.actions].flatMap((t): { key: string; name: string; max: number; recharge?: string }[] => {
        const day = /\((\d+)\/day\)/i.exec(t.name);
        if (day) return [{ key: `use:${t.name}`, name: t.name.replace(/\s*\([^)]*\)\s*$/, ""), max: Number(day[1]) }];
        const rech = /\((recharge[^)]*|recharges after a (?:short or )?long rest)\)/i.exec(t.name);
        if (rech) return [{ key: `use:${t.name}`, name: t.name.replace(/\s*\([^)]*\)\s*$/, ""), max: 1, recharge: rech[1]! }];
        return [];
      })
    : [];
  return (
    <>
      <button className="link" onClick={back}>
        ‹ All summoned
      </button>
      <h2 className="sub-head">{name}</h2>
      <div className="stat-row">
        <button className={`stat-box${m.hp === 0 ? " danger-text" : ""}`} onClick={openHp}>
          <b>
            {m.hp}
            <small>/{b?.hp.max ?? "?"}</small>
          </b>
          <span>HP · damage or heal</span>
        </button>
        <div className="stat-box">
          <b>{b?.ac ?? "?"}</b>
          <span>AC</span>
        </div>
        <label className="stat-box">
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
          <span>
            Init ·{" "}
            <button className="link inline" onClick={onRollInitiative}>
              roll
            </button>
          </span>
        </label>
      </div>
      {b && <p className="note">Speed {b.speed}</p>}
      {defenses && (defenses.immune.length > 0 || defenses.resist.length > 0 || defenses.vulnerable.length > 0 || defenses.conditions.length > 0) && (
        <p className="note">
          {defenses.immune.length > 0 && <>Immune: {defenses.immune.join(", ")}. </>}
          {defenses.resist.length > 0 && <>Resists: {defenses.resist.join(", ")}. </>}
          {defenses.vulnerable.length > 0 && <>Vulnerable: {defenses.vulnerable.join(", ")}. </>}
          {defenses.conditions.length > 0 && <>Can't be {defenses.conditions.join(", ")}.</>}
        </p>
      )}

      <section className="turn" aria-label={`${name}'s turn`}>
        <div className="pills">
          {economy("action", "Action")}
          {economy("bonus", "Bonus")}
          {economy("reaction", "Reaction")}
          <button className="pill" data-used={Object.keys(speeds).every((k) => left(k) === 0)} onClick={() => setMoving(!moving)}>
            <b>Move</b>
            <small>
              {Object.entries(speeds)
                .filter(([, v]) => v > 0)
                .map(([k]) => `${k === "walk" ? "" : `${k} `}${left(k)}`)
                .join(" · ") || "0"}{" "}
              ft
            </small>
          </button>
        </div>
        {moving && (
          <div className="pick-inline">
            <p className="note">
              Moved {used.moved} ft{used.dashes ? `, Dash ×${used.dashes}` : ""}. Switching speeds: what it has moved comes off the new one.
            </p>
            {Object.keys(speeds).length > 1 && (
              <div className="segmented small" role="tablist" aria-label="Moving by">
                {Object.entries(speeds).map(([k, v]) => (
                  <button key={k} role="tab" aria-selected={mode === k} onClick={() => setMode(k)}>
                    {k} {v} · {left(k)} left
                  </button>
                ))}
              </div>
            )}
            <div className="choice-grid">
              {[5, 10, 15, 20, 30].map((ft) => (
                <button key={ft} className="chip" onClick={() => act("summonEconomy", { id: m.id, move: ft, mode }, `${name} ${mode === "walk" ? "moves" : mode === "fly" ? "flies" : `moves (${mode})`} ${ft} ft.`)}>
                  +{ft} ft
                </button>
              ))}
              <button className="chip" disabled={used.moved === 0} onClick={() => act("summonEconomy", { id: m.id, move: -5, mode }, "5 ft taken back.")}>
                −5 ft
              </button>
              <button className="chip" onClick={() => tryUse("action", "Dash", () => act("summonEconomy", { id: m.id, dash: true, kind: "action", used: true }, `${name} dashes: its speeds double this turn.`))}>
                Dash (action)
              </button>
              {used.dashes > 0 && (
                <button className="chip" onClick={() => act("summonEconomy", { id: m.id, dash: false, kind: "action", used: false }, "Dash taken back.")}>
                  Undo Dash
                </button>
              )}
            </div>
            {speeds.fly ? <p className="note">Flying: knocked prone, speed 0 or unable to move, it falls{b?.hover ? " (it hovers, so it doesn't)" : ""}.</p> : null}
          </div>
        )}
        <SwipeButton label={`Swipe: new turn for ${name}`} tone="plain" onConfirm={() => act("summonEconomy", { id: m.id, newTurn: true }, `${name}'s turn: everything is back.`)} />
        {!inCombat && <p className="note">Not in combat: track it anyway if you like.</p>}
      </section>

      <h2 className="sub-head">Effects on it</h2>
      <div className="switches effects" role="group" aria-label={`Effects on ${name}`}>
        {m.concentrating && (
          <button className="chip conc" onClick={() => document.getElementById(`conc-${m.id}`)?.scrollIntoView({ block: "center", behavior: "smooth" })} aria-label={`Concentrating on ${m.concentrating}. Details`}>
            ◎ {m.concentrating}
          </button>
        )}
        <button className="chip add" onClick={onAddEffect}>
          + Effect
        </button>
        {(m.effects ?? []).map((e) => {
          const d = reg.find(e.effect, "effect");
          const immune = d?.category === "condition" && (defenses?.conditions ?? []).some((k) => k.toLowerCase() === d.name.toLowerCase());
          return (
            <button key={e.id} className={`chip ${d?.category ?? "other"}${editEffect === e.id ? " editing" : ""}`} aria-label={`${d?.name ?? e.effect}: details`} onClick={() => setEditEffect(editEffect === e.id ? null : e.id)}>
              {d?.name ?? e.effect}
              {e.choice ? ` ${e.choice}` : ""}
              {e.rounds !== undefined ? ` (${roundsText(e.rounds)})` : ""}
              {immune ? " · immune" : ""}
            </button>
          );
        })}
      </div>

      {editing && editingDef && (
        <div className="pick-inline">
          <p className="note">
            <b>{editingDef.name}.</b> {editingDef.summary}
          </p>
          <div className="row">
            <span className="row-main">{editing.rounds !== undefined ? `${editing.rounds} round${editing.rounds === 1 ? "" : "s"} left (${roundsText(editing.rounds)})` : "No timer"}</span>
            <div className="stepper">
              <button aria-label="One round less" onClick={() => act("summonEffectEdit", { id: m.id, instance: editing.id, rounds: Math.max(0, (editing.rounds ?? 1) - 1) }, "One round less.")}>
                −
              </button>
              <button aria-label="One round more" onClick={() => act("summonEffectEdit", { id: m.id, instance: editing.id, rounds: (editing.rounds ?? 0) + 1 }, "One round more.")}>
                +
              </button>
            </div>
          </div>
          <div className="choice-grid">
            {[1, 10, 100, 600].map((r) => (
              <button key={r} className={`chip${editing.rounds === r ? " on" : ""}`} onClick={() => act("summonEffectEdit", { id: m.id, instance: editing.id, rounds: r }, `${r} rounds.`)}>
                {r === 1 ? "1 round" : r === 10 ? "1 minute" : r === 100 ? "10 minutes" : "1 hour"}
              </button>
            ))}
            <button className={`chip${editing.rounds === undefined ? " on" : ""}`} onClick={() => act("summonEffectEdit", { id: m.id, instance: editing.id, rounds: null }, "No timer.")}>
              No timer
            </button>
          </div>
          {editingDef.upcast && (
            <>
              <p className="sub-head small">Cast at level</p>
              <div className="choice-grid">
                {Array.from({ length: 10 - editingDef.upcast.baseLevel }, (_, i) => editingDef.upcast!.baseLevel + i).map((l) => (
                  <button
                    key={l}
                    className={`chip${(editing.slotLevel ?? editingDef.upcast!.baseLevel) === l ? " on" : ""}`}
                    onClick={() => act("summonEffectEdit", { id: m.id, instance: editing.id, slotLevel: l }, `${editingDef.name} at level ${l}.`)}
                  >
                    {l}
                  </button>
                ))}
              </div>
            </>
          )}
          {editingDef.choice && (
            <>
              <p className="sub-head small">{editingDef.choice.label}</p>
              <div className="choice-grid">
                {editingDef.choice.options.map((o) => (
                  <button key={o} className={`chip${editing.choice === o ? " on" : ""}`} onClick={() => act("summonEffectEdit", { id: m.id, instance: editing.id, choice: o }, `${editingDef.name}: ${o}.`)}>
                    {ABILITY_NAMES[o as keyof typeof ABILITY_NAMES] ?? o}
                  </button>
                ))}
              </div>
            </>
          )}
          <button
            className="big wide danger-text"
            onClick={() => {
              act("summonEffect", { id: m.id, effect: editing.effect, instance: editing.id, add: false }, `${editingDef.name} ends on ${name}.`);
              setEditEffect(null);
            }}
          >
            Remove {editingDef.name}
          </button>
        </div>
      )}

      <h2 className="sub-head" id={`conc-${m.id}`}>
        Concentration
      </h2>
      {m.concentrating ? (
        <div className="group">
          <div className="row">
            <div className="row-main">
              <div className="row-title">{m.concentrating}</div>
              <div className="row-sub">Damage asks for a Constitution save: DC 10 or half the damage.</div>
            </div>
            {b && (
              <button className="chip" onClick={() => onCheck(`${name}: Constitution save`, b.saves.con)}>
                Con save {signed(b.saves.con.total)}
              </button>
            )}
            <button className="chip" onClick={() => act("summonConcentration", { id: m.id, spell: null }, `${name} stops concentrating.`)}>
              End
            </button>
          </div>
        </div>
      ) : (
        <SpellSearch
          reg={reg}
          own={own}
          filter={(d) => d.concentration}
          placeholder="Search spells it concentrates on"
          onPick={(sp) => act("summonConcentration", { id: m.id, spell: sp.id ? reg.find(sp.id, "spell")?.name ?? sp.name : sp.name }, `${name} concentrates on ${sp.name}.`)}
        />
      )}

      <h2 className="sub-head">Spells</h2>
      {spells.map((info) => {
        const cast = def ? creatureCasting(def, info) : undefined;
        return (
          <div key={info.trait}>
            <p className="note">
              {info.trait}
              {cast ? ` · spell save DC ${cast.dc}, ${signed(cast.attack)} to hit` : ""}
            </p>
            {info.groups.map((g) => {
              const shared = spellUseKey({ name: "" }, g);
              return (
                <div key={g.label} className="group" style={{ marginBottom: 8 }}>
                  <div className="row row-sub">
                    <span className="row-main">{g.label}</span>
                    {g.shared && shared.key && shared.max !== undefined && <Pips left={Math.max(0, shared.max - (m.spellUses?.[shared.key] ?? 0))} total={shared.max} />}
                    {g.slots !== undefined && shared.key && <Pips left={Math.max(0, g.slots - (m.spellUses?.[shared.key] ?? 0))} total={g.slots} />}
                  </div>
                  {g.spells.map((sp) => {
                    const u = spellUseKey(sp, g);
                    const sd = sp.id ? reg.find(sp.id, "spell") : undefined;
                    return (
                      <button key={sp.name} className="row" onClick={() => onSpell(sp, { info, group: g })}>
                        <div className="row-main">
                          <div className="row-title">{sd?.name ?? sp.name}</div>
                          <div className="row-sub">{sd ? `${sd.castingTime}${sd.concentration ? " · concentration" : ""}` : "not in your spell content"}</div>
                        </div>
                        {!g.shared && g.perDay !== undefined && u.key && <Pips left={Math.max(0, g.perDay - (m.spellUses?.[u.key] ?? 0))} total={g.perDay} />}
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        );
      })}
      <SpellSearch reg={reg} own={spells.length ? own : []} placeholder={spells.length ? "Search its spells, or any spell" : "Cast a spell anyway: search"} onPick={(sp) => onSpell(sp, sourceOf(sp))} />

      {b && b.attacks.length > 0 && (
        <>
          <h2 className="sub-head">
            Attacks · {used.attacks} of {perAction} made <Pips left={Math.max(0, perAction - used.attacks)} total={perAction} />
          </h2>
          {perAction > 1 && <p className="note">Multiattack: {perAction} attacks for one Attack action.</p>}
          <div className="group">
            {b.attacks.map((a) => (
              <button key={a.name} className="row" onClick={() => tryUse(a.action === "bonus" ? "bonus" : "attack", a.name, () => openAttack(a))}>
                <div className="row-main">
                  <div className="row-title">{a.name}</div>
                  <div className="row-sub">
                    {a.damage.dice}
                    {a.damage.bonus.total ? signed(a.damage.bonus.total) : ""} {a.damage.type}
                    {a.damage.bonus.dice.map((d) => ` + ${d.dice}${d.damageType ? ` ${d.damageType}` : ""}`).join("")}
                    {a.note ? ` · ${a.note}` : ""}
                    {a.action === "bonus" ? " · bonus action" : ""}
                  </div>
                </div>
                <span className="num">{formatBonus(a.attack)}</span>
              </button>
            ))}
          </div>
        </>
      )}
      {b && (
        <TextList
          title="Actions"
          items={b.actions.filter((a) => !b.attacks.some((x) => x.name === a.name))}
          onRoll={(n, dice, type) => onTraitRoll(`${name}: ${n}`, dice, type)}
          onUse={(n, kind) => tryUse(kind, n, () => act("summonEconomy", { id: m.id, kind, used: true }, `${name}: ${n}.`))}
        />
      )}

      {b && limitedUses.length > 0 && (
        <>
          <h2 className="sub-head">Limited uses</h2>
          <div className="group">
            {limitedUses.map((u) => {
              const usedN = m.spellUses?.[u.key] ?? 0;
              return (
                <div key={u.key} className="row">
                  <div className="row-main">
                    <div className="row-title">{u.name}</div>
                    <div className="row-sub">
                      {Math.max(0, u.max - usedN)} of {u.max} left{u.recharge ? ` · ${u.recharge}` : ""}
                    </div>
                  </div>
                  <Pips
                    left={Math.max(0, u.max - usedN)}
                    total={u.max}
                    what={u.name}
                    onUse={() => act("summonCast", { id: m.id, spell: u.name, key: u.key, max: u.max, economy: "none" }, `${name}: ${u.name} used.`)}
                    onRestore={() => act("summonCast", { id: m.id, spell: u.name, key: u.key, economy: "none", restore: true }, `${name}: one ${u.name} back.`)}
                  />
                </div>
              );
            })}
          </div>
        </>
      )}

      <h2 className="sub-head">Actions anyone can take</h2>
      <div className="choice-grid">
        {commons.map(({ f }) => (
          <button key={f.id} className={`chip${common === f.id ? " on" : ""}`} onClick={() => setCommon(common === f.id ? null : f.id)}>
            {f.name}
          </button>
        ))}
      </div>
      {commons
        .filter((x) => x.f.id === common)
        .map(({ f, a }) => {
          const skills = (a!.check?.skills ?? []) as Skill[];
          const kind = a!.asAttack ? "attack" : a!.economy === "bonus" ? "bonus" : a!.economy === "reaction" ? "reaction" : "action";
          return (
            <div key={f.id} className="pick-inline">
              <p className="note">{f.summary}</p>
              <div className="choice-grid">
                <button
                  className="big primary"
                  onClick={() =>
                    tryUse(kind, f.name, () => {
                      act("summonEconomy", { id: m.id, kind, used: true, ...(a!.dash ? { dash: true } : {}) }, `${name}: ${f.name}.${a!.dash ? " Its speeds double this turn." : ""}`);
                      setCommon(null);
                    })
                  }
                >
                  Use · {kind === "attack" ? "one attack" : kind === "bonus" ? "bonus action" : kind}
                </button>
                {b &&
                  skills.map((sk) => (
                    <button key={sk} className="big" onClick={() => onCheck(`${name}: ${SKILL_NAMES[sk]}`, b.skills[sk])}>
                      {SKILL_NAMES[sk]} {signed(b.skills[sk].total)}
                    </button>
                  ))}
              </div>
            </div>
          );
        })}

      {b && (
        <>
          <h2 className="sub-head">Abilities · checks and saves</h2>
          <div className="group">
            {ABILITIES.map((ab) => (
              <div key={ab} className="row">
                <button className="row-main plain" onClick={() => onCheck(`${name}: ${ABILITY_NAMES[ab]} check`, b.checks?.[ab] ?? b.saves[ab])}>
                  <div className="row-title">
                    {ABILITY_NAMES[ab]} {b.abilities[ab].score} ({signed(b.abilities[ab].modifier)})
                  </div>
                  <div className="row-sub">tap for a check</div>
                </button>
                <button className="chip" onClick={() => onCheck(`${name}: ${ABILITY_NAMES[ab]} save`, b.saves[ab])}>
                  save {signed(b.saves[ab].total)}
                </button>
              </div>
            ))}
          </div>
          <details className="skills">
            <summary className="sub-head">Skills</summary>
            <div className="group">
              {(Object.keys(b.skills) as Skill[]).map((sk) => (
                <button key={sk} className="row" onClick={() => onCheck(`${name}: ${SKILL_NAMES[sk]}`, b.skills[sk])}>
                  <div className="row-main">
                    <div className="row-title">{SKILL_NAMES[sk]}</div>
                  </div>
                  <span className="num">{formatBonus(b.skills[sk])}</span>
                </button>
              ))}
            </div>
          </details>
          <TextList title="Traits" items={b.traits} onRoll={(n, dice, type) => onTraitRoll(`${name}: ${n}`, dice, type)} />
        </>
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
    </>
  );
}

/** A spell a summoned creature casts: its text, uses left, and casting it (turn, uses, concentration, the roll). */
export function SummonSpellPanel({
  member: m,
  reg,
  spell,
  source,
  act,
  onRoll,
  back,
}: {
  member: Member;
  reg: ContentRegistry;
  spell: { name: string; id?: string };
  source: SpellSource;
  act: Act;
  /** After casting: its attack or damage roll. */
  onRoll: (sp: SpellDef, level: number) => void;
  back: () => void;
}) {
  const def = reg.find(m.creature, "creature");
  const sd = spell.id ? reg.find(spell.id, "spell") : undefined;
  const name = m.name ?? def?.name ?? "It";
  const [level, setLevel] = useState(source.group?.level ?? sd?.level ?? 0);
  const use = spellUseKey(spell, source.group);
  const slotGroup = source.group?.slots !== undefined;
  const key = slotGroup ? `slot:${level}` : use.key;
  const slotMax = slotGroup ? source.info?.groups.find((g) => g.level === level)?.slots : use.max;
  const usedN = key ? m.spellUses?.[key] ?? 0 : 0;
  const cast = def ? creatureCasting(def, source.info) : undefined;
  const economy = castEconomy(sd?.castingTime ?? "1 action");
  const levels = slotGroup && sd ? (source.info?.groups ?? []).filter((g) => g.level !== undefined && g.level >= sd.level).map((g) => g.level!) : [];
  const selfEffect = sd ? reg.find(reg.effectId(sd.id), "effect") : undefined;
  const [onSelf, setOnSelf] = useState(!!selfEffect && /^(self|touch)/i.test(sd?.range ?? ""));
  const doCast = () => {
    if (selfEffect && onSelf)
      act(
        "summonEffect",
        { id: m.id, effect: selfEffect.id, add: true, ...(selfEffect.rounds ? { rounds: selfEffect.rounds } : selfEffect.minutes ? { rounds: selfEffect.minutes * 10 } : {}), ...(selfEffect.upcast && level >= selfEffect.upcast.baseLevel ? { slotLevel: level } : {}) },
        `${selfEffect.name} on ${name}.`,
      );
    act(
      "summonCast",
      { id: m.id, spell: sd?.name ?? spell.name, ...(key ? { key } : {}), ...(slotMax !== undefined ? { max: slotMax } : {}), economy, ...(sd?.concentration ? { concentration: true } : {}) },
      `${name} casts ${sd?.name ?? spell.name}.${sd?.save && cast ? ` DC ${cast.dc} ${ABILITY_NAMES[sd.save.ability]} save.` : ""}`,
    );
    if (sd && (sd.attack || sd.damage || sd.heal)) onRoll(sd, level);
    else back();
  };
  return (
    <>
      <button className="link" onClick={back}>
        ‹ {name}
      </button>
      {!source.group && <p className="over-banner">Normally {name} can't cast this spell. Fine if your DM agrees.</p>}
      {sd ? (
        <>
          <p className="note">
            {sd.level === 0 ? "Cantrip" : `Level ${sd.level}`} {sd.school} · {sd.castingTime} · {sd.range} · {sd.duration}
            {sd.concentration ? " · concentration" : ""}
          </p>
          {cast && (
            <p className="note">
              {sd.save ? `DC ${cast.dc} ${ABILITY_NAMES[sd.save.ability]} save` : sd.attack ? `${signed(cast.attack)} to hit` : `Spell save DC ${cast.dc}`} · from {source.info?.trait ?? "its best mental ability"}
            </p>
          )}
          {sd.text.map((t, i) => (
            <p key={i} className="note">
              <RichText text={t} />
            </p>
          ))}
        </>
      ) : (
        <p className="note">This spell isn't in your spell content, so there's no text or roll for it. Casting still marks its turn and uses.</p>
      )}
      {levels.length > 1 && (
        <div className="choice-grid" role="radiogroup" aria-label="Slot level">
          {levels.map((l) => (
            <button key={l} className={`chip${level === l ? " on" : ""}`} onClick={() => setLevel(l)}>
              Level {l}
            </button>
          ))}
        </div>
      )}
      {key && slotMax !== undefined && (
        <p className="note">
          <Pips left={Math.max(0, slotMax - usedN)} total={slotMax} /> {Math.max(0, slotMax - usedN)} of {slotMax} {slotGroup ? `level ${level} slots` : "a day"} left
        </p>
      )}
      {key && slotMax !== undefined && usedN >= slotMax && <p className="over-banner">None left. Cast anyway if your DM agrees.</p>}
      {m.concentrating && sd?.concentration && <p className="note">Casting this ends its concentration on {m.concentrating}.</p>}
      {selfEffect && (
        <label className="row">
          <div className="row-main">
            <div className="row-title">On itself</div>
            <div className="row-sub">{name} gets {selfEffect.name}: {selfEffect.summary}</div>
          </div>
          <input type="checkbox" checked={onSelf} onChange={(e) => setOnSelf(e.target.checked)} />
        </label>
      )}
      <button className="big primary wide" onClick={doCast}>
        Cast{economy !== "none" ? ` · ${economy === "bonus" ? "bonus action" : economy}` : ""}
      </button>
    </>
  );
}
