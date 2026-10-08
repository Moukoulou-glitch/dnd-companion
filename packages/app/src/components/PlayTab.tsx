import { HitDiceRow } from "./HitDice";
import { ShapeCard } from "./Shapes";
import { SummonsCard } from "./Summons";
import type { ContentRegistry, DerivedSheet, ResourceResult, ShapeKind } from "@dnd/engine";
import type { Character, OperationType } from "@dnd/schema";
import type { RollRecord } from "../rolls";
import { CombatCard, CompanionCard } from "./Combat";
import { registry } from "../content";

const ALIGNMENTS: Record<string, string> = {
  LG: "Lawful good",
  NG: "Neutral good",
  CG: "Chaotic good",
  LN: "Lawful neutral",
  N: "Neutral",
  TN: "Neutral",
  CN: "Chaotic neutral",
  LE: "Lawful evil",
  NE: "Neutral evil",
  CE: "Chaotic evil",
};

/** Race, background, alignment, and size and creature type, in one line. */
function Identity({ c }: { c: Character }) {
  const race = registry.find(c.race, "race");
  const bg = c.background ? registry.find(c.background, "background") : undefined;
  const cap = (s: string) => s.replace(/^./, (x) => x.toUpperCase());
  const parts: [string, string][] = [
    ["Race", race?.name ?? c.race],
    ["Background", bg?.name ?? "none"],
    ["Alignment", c.alignment ? ALIGNMENTS[c.alignment.toUpperCase()] ?? c.alignment : "not set"],
    ["Creature", race ? `${cap(race.size)} ${race.creatureType ?? "humanoid"}` : "humanoid"],
  ];
  return (
    <section className="identity" aria-label="Who you are">
      {parts.map(([k, v]) => (
        <div key={k}>
          <span className="identity-label">{k}</span>
          <span className="identity-value">{v}</span>
        </div>
      ))}
    </section>
  );
}

type Act = (type: OperationType, payload: unknown, label: string) => void;

/** Questions the Play tab asks before spending or restoring (handled by the app shell). */
export interface PlayPrompts {
  spendResource: (r: ResourceResult) => void;
  spendSlot: (level: number, pact: boolean) => void;
  /** Restoring anything by hand asks first. */
  restore: (what: string, run: () => void) => void;
  rest: (kind: "short" | "long") => void;
  rollPool: (r: ResourceResult) => void;
}

function Pips({ total, used, onSpend, onRestore, kind, name }: {
  total: number;
  used: number;
  onSpend: () => void;
  onRestore: () => void;
  kind?: "slot";
  name: string;
}) {
  // Big pools (Lay on Hands, Ki at high level) as a counter instead of a row of circles.
  if (total > 12)
    return (
      <div className="stepper pool-count">
        <button aria-label={`Spend one ${name}`} disabled={used >= total} onClick={onSpend}>
          −
        </button>
        <span>
          {total - used}
          <small>/{total}</small>
        </span>
        <button aria-label={`Get back one ${name}`} disabled={used === 0} onClick={onRestore}>
          +
        </button>
      </div>
    );
  return (
    <div className={`pips${total > 5 ? " wide" : ""}`}>
      {Array.from({ length: total }, (_, i) => {
        const spent = i >= total - used;
        return (
          <button
            key={i}
            className={`pip${kind === "slot" ? " slot" : ""}`}
            data-spent={spent}
            aria-label={spent ? `Get back one ${name}` : `Spend one ${name}`}
            onClick={spent ? onRestore : onSpend}
          />
        );
      })}
    </div>
  );
}

export function PlayTab({
  character,
  sheet,
  act,
  openHp,
  openHitDie,
  rolls,
  openRollHistory,
  onStartCombat,
  openMove,
  openCompanion,
  prompts,
  onInitiative,
  openShape,
  openTransform,
  openLimited,
  openSummonGroup,
  reg,
}: {
  openShape: () => void;
  openLimited: (actionId: string) => void;
  openSummonGroup: (group: string) => void;
  reg: ContentRegistry;
  openTransform: (kind: ShapeKind) => void;
  character: Character;
  sheet: DerivedSheet;
  act: Act;
  openHp: () => void;
  openHitDie: (die: string) => void;
  rolls: RollRecord[];
  openRollHistory: () => void;
  onStartCombat: () => void;
  openMove: () => void;
  openCompanion: (id: string) => void;
  prompts: PlayPrompts;
  onInitiative: () => void;
}) {
  const down = character.hp.current === 0;
  const slotsUsed = (level: number) => character.slotsUsed[String(level)] ?? 0;

  return (
    <main>
      <Identity c={character} />

      <CombatCard character={character} sheet={sheet} act={act} onStartCombat={onStartCombat} openMove={openMove} onInitiative={onInitiative} onLimited={openLimited} />

      <ShapeCard sheet={sheet} onOpen={openShape} onTransform={openTransform} />
      <SummonsCard character={character} reg={reg} onOpen={openSummonGroup} />

      {sheet.companions.length > 0 && (
        <section>
          <h2>Companion</h2>
          <div className="group">
            {sheet.companions.map((comp) => (
              <CompanionCard key={comp.id} comp={comp} onOpen={() => openCompanion(comp.id)} />
            ))}
          </div>
        </section>
      )}

      {!character.combat && sheet.effects.some((e) => e.rounds !== undefined) && (
        <button className="big wide" onClick={() => act("endTurn", {}, "Turn ended.")}>
          End of my turn
          <span className="sub">
            {sheet.effects
              .filter((e) => e.rounds !== undefined)
              .map((e) => `${e.name} ${e.rounds}`)
              .join(", ")}{" "}
            rounds left
          </span>
        </button>
      )}

      {down && (
        <section>
          <h2>Death saves</h2>
          <div className="group">
            <div className="row">
              <div className="row-main">
                <div className="row-title">
                  {character.deathSaves.successes} successes, {character.deathSaves.failures} failures
                </div>
                <div className="row-sub">10 or higher succeeds. A 1 counts twice; a 20 brings you back with 1 HP.</div>
              </div>
            </div>
            <div className="row" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 }}>
              <button className="big heal" onClick={() => act("deathSave", { result: "success" }, "Death save: success.")}>
                10+
              </button>
              <button className="big damage" onClick={() => act("deathSave", { result: "failure" }, "Death save: failure.")}>
                1–9
              </button>
              <button className="big" onClick={() => act("deathSave", { result: "critSuccess" }, "Natural 20.")}>
                20
              </button>
              <button className="big" onClick={() => act("deathSave", { result: "critFailure" }, "Natural 1: two failures.")}>
                1
              </button>
            </div>
          </div>
        </section>
      )}

      {rolls.length > 0 && (
        <section>
          <h2>Recent rolls</h2>
          <div className="group">
            {rolls.slice(0, 3).map((r) => (
              <button className="row" key={r.id} onClick={openRollHistory}>
                <div className="row-main">
                  <div className="row-title">{r.title}</div>
                  <div className="row-sub">
                    {r.crit ? "Critical. " : r.fumble ? "Natural 1. " : ""}
                    {r.physical ? "Your dice" : "App roll"}
                  </div>
                </div>
                <span className={`num${r.crit ? " crit-text" : r.fumble ? " danger-text" : ""}`}>{r.total}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {sheet.resources.length > 0 && (
        <section>
          <h2>Features</h2>
          <div className="group">
            {sheet.resources.map((r) => (
              <div className="row" key={r.id}>
                <div className="row-main">
                  <div className="row-title">{r.name}</div>
                  <div className="row-sub">
                    {r.remaining} of {r.max}
                    {r.die ? `, ${r.die}` : ""}, {resetLabel(r.reset)}
                  </div>
                  {r.pool && r.remaining > 0 && (
                    <div className="pool">
                      {r.pool.values.length > 0 ? (
                        r.pool.values.map((v, i) => (
                          <span key={i} className="pool-value">
                            {v}
                          </span>
                        ))
                      ) : (
                        <button className="tag adv" onClick={() => prompts.rollPool(r)}>
                          Roll your {r.remaining} d{r.pool.sides}
                        </button>
                      )}
                    </div>
                  )}
                </div>
                <Pips
                  name={r.name}
                  total={r.max}
                  used={r.used}
                  onSpend={() => prompts.spendResource(r)}
                  onRestore={() => prompts.restore(r.name, () => act("restoreResource", { resource: r.id }, `${r.name} restored.`))}
                />
              </div>
            ))}
          </div>
        </section>
      )}

      {(sheet.spellSlots.length > 0 || sheet.pactSlots) && (
        <section>
          <h2>Spell slots</h2>
          <div className="group">
            {sheet.spellSlots.map((s) => (
              <div className="row" key={s.level}>
                <div className="row-main">
                  <div className="row-title">Level {s.level}</div>
                  <div className="row-sub">
                    {s.total - slotsUsed(s.level)} of {s.total} left
                  </div>
                </div>
                <Pips
                  kind="slot"
                  name={`level ${s.level} slot`}
                  total={s.total}
                  used={slotsUsed(s.level)}
                  onSpend={() => prompts.spendSlot(s.level, false)}
                  onRestore={() => prompts.restore(`a level ${s.level} spell slot`, () => act("restoreSlot", { level: s.level }, `Level ${s.level} slot restored.`))}
                />
              </div>
            ))}
            {sheet.pactSlots && (
              <div className="row">
                <div className="row-main">
                  <div className="row-title">Pact Magic, level {sheet.pactSlots.level}</div>
                  <div className="row-sub">Back on a short rest</div>
                </div>
                <Pips
                  kind="slot"
                  name="Pact Magic slot"
                  total={sheet.pactSlots.count}
                  used={character.pactSlotsUsed}
                  onSpend={() => prompts.spendSlot(sheet.pactSlots!.level, true)}
                  onRestore={() => prompts.restore("a Pact Magic slot", () => act("restoreSlot", { level: sheet.pactSlots!.level, pact: true }, "Pact slot restored."))}
                />
              </div>
            )}
          </div>
        </section>
      )}

      <section>
        <h2>Inspiration</h2>
        <div className="group">
          <div className="row hit-dice-row">
            <div className="row-main">
              <div className="row-title">Inspiration</div>
              <div className="row-sub">
                {character.inspirations ?? 0} of 10 · swipe one down to spend it, a grey one up when the DM gives one
              </div>
            </div>
            <HitDiceRow
              die="d20"
              total={10}
              used={10 - (character.inspirations ?? 0)}
              tone="gold"
              what="Inspiration"
              hintText="Swipe a golden die down to spend it (advantage on one attack, save or check), or a grey one up when you're given one. Rolls also offer it."
              onSpend={() => act("setInspiration", { count: Math.max(0, (character.inspirations ?? 0) - 1) }, "Inspiration spent: advantage on one attack roll, saving throw or ability check.")}
              onRestore={() => act("setInspiration", { count: Math.min(10, (character.inspirations ?? 0) + 1) }, "Inspiration gained.")}
            />
          </div>
        </div>
      </section>

      <section>
        <h2>Rest</h2>
        <div className="group">
          {sheet.hitDice.map((h) => (
            <div className="row hit-dice-row" key={h.die}>
              <div className="row-main">
                <div className="row-title">Hit Dice {h.die}</div>
                <div className="row-sub">
                  {h.total - (character.hitDiceUsed[h.die] ?? 0)} of {h.total} left · swipe one down to spend it
                </div>
              </div>
              <HitDiceRow
                die={h.die}
                total={h.total}
                used={character.hitDiceUsed[h.die] ?? 0}
                onSpend={() => openHitDie(h.die)}
                onRestore={() => prompts.restore(`a ${h.die} Hit Die`, () => act("restoreHitDie", { die: h.die }, `A ${h.die} Hit Die is back.`))}
              />
            </div>
          ))}
        </div>
        <div className="big-actions" style={{ marginTop: 10 }}>
          <button className="big" onClick={() => prompts.rest("short")}>
            Short rest
          </button>
          <button className="big" onClick={() => prompts.rest("long")}>
            Long rest
          </button>
        </div>
        {(sheet.effects.some((e) => e.minutes !== undefined) || character.concentration?.minutes !== undefined) && (
          <div className="time-passes">
            <span>Time passes</span>
            <button className="tag" onClick={() => act("passTime", { minutes: 10 }, "10 minutes pass.")}>
              10 min
            </button>
            <button className="tag" onClick={() => act("passTime", { minutes: 60 }, "An hour passes.")}>
              1 hour
            </button>
          </div>
        )}
      </section>
    </main>
  );
}

function resetLabel(reset: string): string {
  return { short: "short rest", long: "long rest", dawn: "dawn", manual: "reset by hand" }[reset] ?? reset;
}
