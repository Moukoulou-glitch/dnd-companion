import { formatBonus, signed, type DerivedSheet, type WeaponAttack } from "@dnd/engine";
import type { ReactNode } from "react";
import { BreakdownLines } from "./Sheet";

type Open = (title: string, body: ReactNode) => void;

export function damageText(a: WeaponAttack): string {
  const extra = a.damage.bonus.dice.map((d) => ` +${d.dice}${d.damageType ? ` ${d.damageType}` : ""}`).join("");
  const bonus = a.damage.bonus.total ? signed(a.damage.bonus.total) : "";
  return `${a.damage.dice}${bonus} ${a.damage.type}${extra}`;
}

function AttackDetail({ a }: { a: WeaponAttack }) {
  return (
    <>
      <p className="sub-head">Attack roll</p>
      <BreakdownLines b={a.attack} totalLabel="To hit" />
      <p className="sub-head">Damage: {a.damage.dice} plus</p>
      <BreakdownLines b={a.damage.bonus} totalLabel="Damage bonus" />
      {a.damage.versatileDice && <p className="note">Two-handed: {a.damage.versatileDice} instead of {a.damage.dice}.</p>}
      {(a.damage.onCrit.length > 0 || a.damage.critExtraDice.length > 0) && (
        <>
          <p className="sub-head">On a critical hit</p>
          <ul className="lines">
            <li>
              <span>Weapon dice</span>
              <b>rolled twice</b>
            </li>
            {a.damage.critExtraDice.map((p) => (
              <li key={p.label}>
                <span>{p.label}</span>
                <b>
                  +{p.value} {a.damage.dice.replace(/^\d+/, "")}
                </b>
              </li>
            ))}
            {a.damage.onCrit.map((p) => (
              <li key={p.label}>
                <span>{p.label}</span>
                <b>{signed(p.value)}</b>
              </li>
            ))}
          </ul>
        </>
      )}
      {a.range && <p className="note">Range {a.range[0] === a.range[1] ? `${a.range[0]} ft` : `${a.range[0]}/${a.range[1]} ft`}.</p>}
      {!a.proficient && <p className="note danger-text">Not proficient: no proficiency bonus on the attack.</p>}
    </>
  );
}

export function ActionsTab({ sheet, open }: { sheet: DerivedSheet; open: Open }) {
  const groups: { title: string; list: WeaponAttack[] }[] = [
    { title: "Attack action", list: sheet.attacks.filter((a) => a.action === "attack") },
    { title: "Bonus action", list: sheet.attacks.filter((a) => a.action === "bonus") },
  ].filter((g) => g.list.length > 0);

  return (
    <main>
      {groups.map((g) => (
        <section key={g.title}>
          <h2>{g.title}</h2>
          <div className="group">
            {g.list.map((a) => (
              <button className="row" key={`${a.attackId}-${a.itemInstanceId ?? ""}-${a.mode}`} onClick={() => open(a.name, <AttackDetail a={a} />)}>
                <div className="row-main">
                  <div className="row-title">{a.name}</div>
                  <div className="row-sub">{damageText(a)}</div>
                </div>
                {a.attack.advantage.length > 0 && <span className="tag adv">adv</span>}
                {a.attack.suggestions.length > 0 && <span className="tag">{a.attack.suggestions.length === 1 ? "1 option" : `${a.attack.suggestions.length} options`}</span>}
                <span className="num">{formatBonus({ total: a.attack.total, dice: a.attack.dice })}</span>
              </button>
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
                  open(s.label, (
                    <>
                      <p className="sub-head">Spell save DC</p>
                      <BreakdownLines b={s.saveDc} totalLabel="DC" />
                      <p className="sub-head">Spell attack</p>
                      <BreakdownLines b={s.attack} totalLabel="To hit" />
                    </>
                  ))
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
          <p className="note">Spell lists and casting come in a later phase.</p>
        </section>
      )}
    </main>
  );
}
