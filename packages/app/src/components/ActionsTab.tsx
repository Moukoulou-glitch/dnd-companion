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
        <div className="row-sub">
          {damageText(a)}
          {a.note ? <span className={/not a club/i.test(a.note) ? " danger-text" : ""}> · {a.note}</span> : null}
        </div>
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
      <span className="row-tags">
        {a.dc && <span className="tag dc-tag">DC {a.dc.value}</span>}
        <span className="tag">{a.source}</span>
      </span>
      <span className={`tag${none ? " fail" : " adv"}`}>{none ? "none left" : "use"}</span>
    </button>
  );
}

const COMMON_TITLES: Record<ActionResult["economy"], string> = {
  action: "Action",
  bonus: "Bonus action",
  reaction: "Reaction",
  free: "No action needed",
};

/** What tapping it does, in a few words. */
function commonSub(a: ActionResult): string {
  if (a.infoOnly) return "How it works";
  if (a.asAttack) return "Replaces one attack";
  if (a.check) return `Rolls ${a.check.skills.map((s) => s.replace(/^./, (c) => c.toUpperCase())).join(" or ")}${a.check.dc ? `, DC ${a.check.dc}` : ""}`;
  if (a.dash) return "Extra movement this turn";
  if (a.untilTurnStart) return "Until your next turn";
  return a.economy === "free" ? "No action" : `Uses your ${a.economy === "bonus" ? "bonus action" : a.economy}`;
}

export function ActionsTab({
  sheet,
  open,
  openRoll,
  openAttack,
  openFeature,
  custom = [],
  openCustom,
}: {
  sheet: DerivedSheet;
  open: Open;
  openRoll: OpenRoll;
  openAttack: (a: WeaponAttack) => void;
  openFeature: (a: ActionResult) => void;
  /** Actions the player wrote, to change or delete. */
  custom?: { id: string; name: string; source: string }[];
  /** Write a new action, or change one (by id). */
  openCustom?: (id?: string) => void;
}) {
  const features = (e: ActionResult["economy"]) => sheet.actions.filter((a) => a.economy === e && !a.common && !a.limited);
  const common = sheet.actions.filter((a) => a.common);
  const commonGroups = (["action", "bonus", "reaction", "free"] as const)
    .map((e) => ({ economy: e, list: common.filter((a) => a.economy === e) }))
    .filter((g) => g.list.length > 0);
  const groups: { title: string; attacks: WeaponAttack[]; features: ActionResult[] }[] = [
    { title: "Action", attacks: sheet.attacks.filter((a) => a.action === "attack"), features: features("action") },
    { title: "Extra action", attacks: [], features: sheet.actions.filter((a) => a.limited) },
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

      {common.length > 0 && (
        <section>
          <details className="common-actions">
            <summary>
              <span className="ca-icon" aria-hidden="true">⚔</span>
              <h2>Actions anyone can take</h2>
              <span className="ca-arrow" aria-hidden="true">▸</span>
              <span className="row-sub">{new Set(common.map((a) => a.name.replace(/ \(.*\)$/, ""))).size} actions: Dash, Dodge, Ready, Hide, Grapple, Shove…</span>
            </summary>
            {commonGroups.map((g) => (
              <div key={g.economy}>
                <p className="sub-head">{COMMON_TITLES[g.economy]}</p>
                <div className="group">
                  {g.list.map((a) => (
                    <button className="row" key={a.id} onClick={() => openFeature(a)}>
                      <div className="row-main">
                        <div className="row-title">{a.name}</div>
                        <div className="row-sub">{commonSub(a)}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </details>
        </section>
      )}

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
      {openCustom && (
        <section>
          <h2>Your own actions</h2>
          {custom.length > 0 && (
            <div className="group">
              {custom.map((x) => (
                <button className="row" key={x.id} onClick={() => openCustom(x.id)}>
                  <div className="row-main">
                    <div className="row-title">{x.name}</div>
                    <div className="row-sub">{x.source || "Your own"} · tap to change</div>
                  </div>
                </button>
              ))}
            </div>
          )}
          <button className="big wide" onClick={() => openCustom()}>
            Add your own action
          </button>
          <p className="note">Attacks, saves with damage or conditions, healing, anything else: they show up above with the rest.</p>
        </section>
      )}
    </main>
  );
}
