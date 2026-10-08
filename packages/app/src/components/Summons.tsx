import { useMemo, useState } from "react";
import { creatureBlock, formatBonus, signed, summonOptions, type ContentRegistry, type RollBreakdown, type WeaponAttack } from "@dnd/engine";
import { ABILITIES, ABILITY_NAMES, type Character, type CreatureDef, type OperationType } from "@dnd/schema";
import { RichText } from "./Conditions";
import { TextList } from "./Shapes";

type Act = (type: OperationType, payload: unknown, label: string) => unknown;

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
          const max = members.reduce((t, m) => t + (reg.find(m.creature, "creature")?.hp ?? m.hp), 0);
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
                  AC {d?.ac ?? "?"}
                  {!shared && m.initiative !== undefined ? ` · initiative ${m.initiative}` : ""}
                  {m.used && (m.used.action || m.used.bonus || m.used.reaction) ? ` · ${[m.used.action && "action", m.used.bonus && "bonus", m.used.reaction && "reaction"].filter(Boolean).join(", ")} used` : ""}
                  {m.effects?.length ? ` · ${m.effects.map((e) => reg.find(e.effect, "effect")?.name ?? e.effect).join(", ")}` : ""}
                  {m.concentrating ? ` · concentrating on ${m.concentrating}` : ""}
                </div>
              </button>
              <button className={`chip${m.hp === 0 ? " danger-text" : ""}`} onClick={() => openHp(m.id)}>
                {m.hp}/{d?.hp ?? "?"} HP
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

/** One summoned creature: its own action economy, effects on it, what it concentrates on, its stat block. */
export function SummonMemberPanel({
  member: m,
  reg,
  act,
  inCombat,
  openHp,
  onTraitRoll,
  openAttack,
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
  back: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const [q, setQ] = useState("");
  const [conc, setConc] = useState("");
  const b = creatureBlock(reg, m.creature);
  const name = m.name ?? b?.name ?? m.creature;
  const used = m.used ?? { action: false, bonus: false, reaction: false, attacks: 0 };
  const perAction = b ? b.attacksPerAction : 1;
  const pill = (kind: "action" | "bonus" | "reaction", label: string) => (
    <button
      className={`chip${used[kind] ? " on" : ""}`}
      aria-pressed={used[kind]}
      onClick={() => act("summonEconomy", { id: m.id, kind, used: !used[kind] }, used[kind] ? `${name}'s ${label.toLowerCase()} is back.` : `${name}'s ${label.toLowerCase()} used.`)}
    >
      {label}
      {kind === "action" && perAction > 1 && used.attacks > 0 ? ` (${used.attacks}/${perAction} attacks)` : ""}
    </button>
  );
  const effects = reg
    .list("effect")
    .filter((e) => !e.transform)
    .filter((e) => e.name.toLowerCase().includes(q.trim().toLowerCase()))
    .sort((a, b2) => (a.category === b2.category ? a.name.localeCompare(b2.name) : a.category === "condition" ? -1 : 1));
  return (
    <>
      <button className="link" onClick={back}>
        ‹ All summoned
      </button>
      <h2 className="sub-head">{name}</h2>
      <div className="big-actions">
        <button className={`big${m.hp === 0 ? " danger-text" : ""}`} onClick={openHp}>
          {m.hp}/{b?.hp.max ?? "?"} HP<span className="sub">damage or heal</span>
        </button>
        {b && (
          <div className="big static">
            AC {b.ac}
            <span className="sub">speed {b.speed}</span>
          </div>
        )}
      </div>

      <h2 className="sub-head">Its turn</h2>
      <div className="choice-grid" aria-label={`${name}'s action economy`}>
        {pill("action", "Action")}
        {pill("bonus", "Bonus")}
        {pill("reaction", "Reaction")}
        <button className="chip" onClick={() => act("summonEconomy", { id: m.id, newTurn: true }, `${name}'s turn: everything is back.`)}>
          New turn
        </button>
      </div>
      {!inCombat && <p className="note">Not in combat: track it anyway if you like.</p>}

      <h2 className="sub-head">Effects on it</h2>
      <div className="choice-grid">
        {(m.effects ?? []).map((e) => {
          const def = reg.find(e.effect, "effect");
          return (
            <button key={e.id} className="chip on" aria-label={`Remove ${def?.name ?? e.effect}`} onClick={() => act("summonEffect", { id: m.id, effect: e.effect, add: false }, `${def?.name ?? "Effect"} ends on ${name}.`)}>
              {def?.name ?? e.effect}
              {e.rounds !== undefined ? ` · ${e.rounds} rd` : ""} ✕
            </button>
          );
        })}
        <button className="chip" onClick={() => setAdding(!adding)}>
          {adding ? "Done" : "+ Effect"}
        </button>
      </div>
      {adding && (
        <>
          <input className="search" type="search" placeholder="Search conditions and spells" value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="group" style={{ maxHeight: 260, overflowY: "auto" }}>
            {effects.map((e) => (
              <button
                key={e.id}
                className="row"
                onClick={() => {
                  act("summonEffect", { id: m.id, effect: e.id, add: true, ...(e.rounds ? { rounds: e.rounds } : {}) }, `${e.name} on ${name}.`);
                  setAdding(false);
                  setQ("");
                }}
              >
                <div className="row-main">
                  <div className="row-title">{e.name}</div>
                  <div className="row-sub">
                    {e.category}
                    {e.rounds ? ` · ${e.rounds} rounds` : ""}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </>
      )}

      <h2 className="sub-head">Concentration</h2>
      {m.concentrating ? (
        <div className="row">
          <div className="row-main">
            <div className="row-title">{m.concentrating}</div>
            <div className="row-sub">Damage: Constitution save, DC 10 or half the damage.</div>
          </div>
          {b && (
            <button className="chip" onClick={() => onTraitRoll(`${name}: Constitution save`, `1d20${b.saves.con.total >= 0 ? "+" : ""}${b.saves.con.total}`)}>
              Con save {signed(b.saves.con.total)}
            </button>
          )}
          <button className="chip" onClick={() => act("summonConcentration", { id: m.id, spell: null }, `${name} stops concentrating.`)}>
            End
          </button>
        </div>
      ) : (
        <div className="row">
          <input className="search" placeholder="Spell it concentrates on" value={conc} onChange={(e) => setConc(e.target.value)} aria-label="Spell it concentrates on" />
          <button
            className="chip"
            disabled={!conc.trim()}
            onClick={() => {
              act("summonConcentration", { id: m.id, spell: conc.trim() }, `${name} concentrates on ${conc.trim()}.`);
              setConc("");
            }}
          >
            Start
          </button>
        </div>
      )}

      {b && (
        <>
          {b.attacks.length > 0 && (
            <>
              <h2 className="sub-head">Attacks{perAction > 1 ? ` · ${perAction} per Attack action` : ""}</h2>
              <div className="group">
                {b.attacks.map((a) => (
                  <button key={a.name} className="row" onClick={() => openAttack(a)}>
                    <div className="row-main">
                      <div className="row-title">{a.name}</div>
                      <div className="row-sub">
                        {a.damage.dice}
                        {a.damage.bonus.total ? signed(a.damage.bonus.total) : ""} {a.damage.type}
                        {a.note ? ` · ${a.note}` : ""}
                        {a.action === "bonus" ? " · bonus action" : ""}
                      </div>
                    </div>
                    <span className="num">{formatBonus({ total: a.attack.total, dice: [] })}</span>
                  </button>
                ))}
              </div>
            </>
          )}
          <div className="choice-grid" style={{ margin: "8px 0" }}>
            {ABILITIES.map((ab) => (
              <span key={ab} className="tag">
                {ABILITY_NAMES[ab].slice(0, 3)} {b.abilities[ab].score} ({signed(b.abilities[ab].modifier)})
              </span>
            ))}
          </div>
          <TextList title="Traits" items={b.traits} onRoll={(n, dice, type) => onTraitRoll(`${name}: ${n}`, dice, type)} />
          <TextList title="Actions" items={b.actions.filter((a) => !b.attacks.some((x) => x.name === a.name))} onRoll={(n, dice, type) => onTraitRoll(`${name}: ${n}`, dice, type)} />
        </>
      )}
    </>
  );
}
