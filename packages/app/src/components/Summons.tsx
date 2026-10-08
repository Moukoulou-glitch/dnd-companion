import { useMemo, useState } from "react";
import { creatureBlock, formatBonus, signed, summonOptions, type ContentRegistry, type RollBreakdown, type WeaponAttack } from "@dnd/engine";
import { ABILITIES, ABILITY_NAMES, type Character, type CreatureDef, type OperationType } from "@dnd/schema";
import { RichText } from "./Conditions";

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
}: {
  character: Character;
  reg: ContentRegistry;
  group: string;
  act: Act;
  openRoll: (title: string, base: RollBreakdown, attack?: WeaponAttack) => void;
  openHp: (id: string) => void;
  rollInitiative: (group: string, id?: string) => void;
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
              <div className="row-main">
                <div className="row-title">
                  {m.name ?? d?.name ?? m.creature} {members.length > 1 ? i + 1 : ""}
                </div>
                <div className="row-sub">
                  AC {d?.ac ?? "?"}
                  {!shared && m.initiative !== undefined ? ` · initiative ${m.initiative}` : ""}
                </div>
              </div>
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
