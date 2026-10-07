import { formatBonus, signed, signedDice, type ActionResult, type DerivedSheet, type RollBreakdown, type WeaponAttack } from "@dnd/engine";
import type { ReactNode } from "react";
import { BreakdownLines } from "./Sheet";

type Open = (title: string, body: ReactNode) => void;
type OpenRoll = (title: string, base: RollBreakdown, attack?: WeaponAttack) => void;

export function damageText(a: WeaponAttack): string {
  const extra = a.damage.bonus.dice.map((d) => ` ${signedDice(d.dice)}${d.damageType ? ` ${d.damageType}` : ""}`).join("");
  const bonus = a.damage.bonus.total ? signed(a.damage.bonus.total) : "";
  return `${a.damage.dice}${bonus} ${a.damage.type}${extra}`;
}

function AttackRow({ a, openAttack }: { a: WeaponAttack; openAttack: (a: WeaponAttack) => void }) {
  return (
    <button className="row" onClick={() => openAttack(a)}>
      <div className="row-main">
        <div className="row-title">{a.name}</div>
        <div className="row-sub">{damageText(a)}</div>
      </div>
      {a.attack.advantage.length > 0 && <span className="tag adv">adv</span>}
      {a.attack.suggestions.length > 0 && (
        <span className="tag">{a.attack.suggestions.length === 1 ? "1 option" : `${a.attack.suggestions.length} options`}</span>
      )}
      <span className="num">{formatBonus({ total: a.attack.total, dice: a.attack.dice })}</span>
    </button>
  );
}

function FeatureRow({ a, openFeature }: { a: ActionResult; openFeature: (a: ActionResult) => void }) {
  const none = a.cost && a.cost.remaining < a.cost.amount;
  return (
    <button className="row" onClick={() => openFeature(a)}>
      <div className="row-main">
        <div className="row-title">{a.name}</div>
        <div className="row-sub">
          {a.cost ? `${a.cost.remaining} left` : "No cost"}
          {a.tempHp ? `, ${a.tempHp.text} temp HP` : ""}
          {a.heal ? `, heals ${a.heal.text}` : ""}
        </div>
      </div>
      <span className={`tag${none ? "" : " adv"}`}>{none ? "none left" : "use"}</span>
    </button>
  );
}

export function ActionsTab({
  sheet,
  open,
  openRoll,
  openAttack,
  openFeature,
}: {
  sheet: DerivedSheet;
  open: Open;
  openRoll: OpenRoll;
  openAttack: (a: WeaponAttack) => void;
  openFeature: (a: ActionResult) => void;
}) {
  const features = (e: ActionResult["economy"]) => sheet.actions.filter((a) => a.economy === e);
  const groups: { title: string; attacks: WeaponAttack[]; features: ActionResult[] }[] = [
    { title: "Action", attacks: sheet.attacks.filter((a) => a.action === "attack"), features: features("action") },
    { title: "Bonus action", attacks: sheet.attacks.filter((a) => a.action === "bonus"), features: features("bonus") },
    { title: "Reaction", attacks: [], features: features("reaction") },
    { title: "No action needed", attacks: [], features: features("free") },
  ].filter((g) => g.attacks.length + g.features.length > 0);

  return (
    <main>
      {groups.map((g) => (
        <section key={g.title}>
          <h2>{g.title}</h2>
          <div className="group">
            {g.attacks.map((a) => (
              <AttackRow key={`${a.attackId}-${a.itemInstanceId ?? ""}-${a.mode}`} a={a} openAttack={openAttack} />
            ))}
            {g.features.map((a) => (
              <FeatureRow key={a.id} a={a} openFeature={openFeature} />
            ))}
          </div>
        </section>
      ))}

      {sheet.spellcasting.length > 0 && (
        <section>
          <h2>Spellcasting</h2>
          <div className="group">
            {sheet.spellcasting.map((s) => (
              <button
                className="row"
                key={s.id}
                onClick={() =>
                  open(
                    s.label,
                    <>
                      <p className="sub-head">Spell save DC</p>
                      <BreakdownLines b={s.saveDc} totalLabel="DC" />
                      <p className="sub-head">Spell attack</p>
                      <BreakdownLines b={s.attack} totalLabel="To hit" />
                      <button
                        className="big primary wide"
                        onClick={() => openRoll(`${s.label} spell attack`, { ...s.attack, dice: [], advantage: [], disadvantage: [], suggestions: [] })}
                      >
                        Roll a spell attack
                      </button>
                    </>,
                  )
                }
              >
                <div className="row-main">
                  <div className="row-title">{s.label}</div>
                  <div className="row-sub">Uses {s.ability.toUpperCase()}</div>
                </div>
                <span className="row-sub">DC</span>
                <span className="num" style={{ minWidth: "1.6em" }}>
                  {s.saveDc.total}
                </span>
                <span className="num">{signed(s.attack.total)}</span>
              </button>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
