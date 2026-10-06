import type { DerivedSheet } from "@dnd/engine";
import type { Character, OperationType } from "@dnd/schema";

type Act = (type: OperationType, payload: unknown, label: string) => void;

function Pips({ total, used, onSpend, onRestore, kind, name }: {
  total: number;
  used: number;
  onSpend: () => void;
  onRestore: () => void;
  kind?: "slot";
  name: string;
}) {
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
}: {
  character: Character;
  sheet: DerivedSheet;
  act: Act;
  openHp: () => void;
  openHitDie: (die: string) => void;
}) {
  const down = character.hp.current === 0;
  const slotsUsed = (level: number) => character.slotsUsed[String(level)] ?? 0;

  return (
    <main>
      <section className="big-actions" aria-label="Hit points">
        <button className="big damage" onClick={openHp}>
          Damage
        </button>
        <button className="big heal" onClick={openHp}>
          Heal
        </button>
      </section>

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
                </div>
                <Pips
                  name={r.name}
                  total={r.max}
                  used={r.used}
                  onSpend={() => act("spendResource", { resource: r.id }, `${r.name} used.`)}
                  onRestore={() => act("restoreResource", { resource: r.id }, `${r.name} restored.`)}
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
                  onSpend={() => act("spendSlot", { level: s.level }, `Level ${s.level} slot spent.`)}
                  onRestore={() => act("restoreSlot", { level: s.level }, `Level ${s.level} slot restored.`)}
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
                  onSpend={() => act("spendSlot", { level: sheet.pactSlots!.level, pact: true }, "Pact slot spent.")}
                  onRestore={() => act("restoreSlot", { level: sheet.pactSlots!.level, pact: true }, "Pact slot restored.")}
                />
              </div>
            )}
          </div>
        </section>
      )}

      <section>
        <h2>Rest</h2>
        <div className="group">
          {sheet.hitDice.map((h) => (
            <div className="row" key={h.die}>
              <div className="row-main">
                <div className="row-title">Hit Dice {h.die}</div>
                <div className="row-sub">
                  {h.total - (character.hitDiceUsed[h.die] ?? 0)} of {h.total} left, tap one to spend it
                </div>
              </div>
              <Pips
                name={`${h.die} Hit Die`}
                total={h.total}
                used={character.hitDiceUsed[h.die] ?? 0}
                onSpend={() => openHitDie(h.die)}
                onRestore={() => undefined}
              />
            </div>
          ))}
        </div>
        <div className="big-actions" style={{ marginTop: 10 }}>
          <button className="big" onClick={() => act("rest", { kind: "short" }, "Short rest.")}>
            Short rest
          </button>
          <button className="big" onClick={() => act("rest", { kind: "long" }, "Long rest.")}>
            Long rest
          </button>
        </div>
      </section>
    </main>
  );
}

function resetLabel(reset: string): string {
  return { short: "short rest", long: "long rest", dawn: "dawn", manual: "reset by hand" }[reset] ?? reset;
}
