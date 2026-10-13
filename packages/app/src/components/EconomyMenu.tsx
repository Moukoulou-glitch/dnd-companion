import { castingEconomy, signed, warCasterSpells, type ActionResult, type DerivedSheet, type EffectResult, type SpellResult, type WeaponAttack } from "@dnd/engine";
import type { Character } from "@dnd/schema";
import { AttackRow, FeatureRow } from "./ActionsTab";
import type { EconomyKind } from "./Combat";

const TITLE: Record<EconomyKind, string> = { action: "Action", bonus: "Bonus action", reaction: "Reaction" };

/** Whether a spell can be cast right now without asking (a slot, a free use, at will…); otherwise it says why. */
function spellState(sp: SpellResult): string | undefined {
  if (sp.level === 0 || sp.cast.atWill || sp.cast.extra) return undefined;
  if (sp.cast.free && sp.cast.free.remaining > 0) return undefined;
  if (sp.cast.pact && sp.cast.pact.remaining > 0) return undefined;
  if (sp.cast.slotLevels.length) return undefined;
  return "no slot left";
}

function SpellRow({ sp, onOpen, sub }: { sp: SpellResult; onOpen: () => void; sub?: string }) {
  const why = spellState(sp);
  return (
    <button className={`row${why ? " dim" : ""}`} onClick={onOpen}>
      <div className="row-main">
        <div className="row-title">{sp.name}</div>
        <div className="row-sub">
          {sp.level === 0 ? "Cantrip" : `Level ${sp.level}`}
          {sp.concentration ? ", concentration" : ""}
          {sub ? ` · ${sub}` : ""}
        </div>
      </div>
      {why && <span className="tag fail">{why}</span>}
      <span className="num spell-num">{sp.attack ? signed(sp.attack.total) : sp.save ? `DC ${sp.save.dc}` : ""}</span>
    </button>
  );
}

/**
 * Long-press on Action, Bonus or Reaction: what you can do with it, from the
 * same lists as the Actions and Spells tabs. Opening it spends nothing; each
 * entry opens its usual flow, which asks before spending anything.
 */
export function EconomyMenu({
  kind,
  sheet,
  character,
  openAttack,
  openFeature,
  openSpell,
  openEffect,
}: {
  kind: EconomyKind;
  sheet: DerivedSheet;
  character: Character;
  openAttack: (a: WeaponAttack, reaction?: boolean) => void;
  openFeature: (a: ActionResult) => void;
  openSpell: (sp: SpellResult) => void;
  openEffect: (e: EffectResult) => void;
}) {
  const cb = character.combat;
  const used = !cb ? false : kind === "action" ? cb.action > cb.extraActions : kind === "bonus" ? cb.bonus > 0 : cb.reaction > 0;
  const mine = sheet.actions.filter((a) => a.economy === kind && !a.common && !a.limited);
  const common = sheet.actions.filter((a) => a.economy === kind && a.common);
  const spells = sheet.spells.filter((s) => s.ready !== "not prepared" && !s.cast.scroll && castingEconomy(s.castingTime) === kind);
  const attacks = kind === "action" ? sheet.attacks.filter((a) => a.action === "attack") : kind === "bonus" ? sheet.attacks.filter((a) => a.action === "bonus") : [];
  // Opportunity attacks: your melee weapon attacks, as a reaction.
  const opportunity = kind === "reaction" ? sheet.attacks.filter((a) => a.action === "attack" && a.mode === "melee" && !a.offHand) : [];
  const warCaster = kind === "reaction" ? warCasterSpells(sheet) : [];
  // Ready: the one tag on you (the Effects show the same one); release it from there.
  const readied = kind === "reaction" ? sheet.effects.find((e) => e.release) : undefined;
  const ready = sheet.actions.find((a) => a.id === "common-ready");

  return (
    <>
      <p className={`note${used ? " danger-text" : ""}`}>
        {TITLE[kind]}: {used ? "already used" : "free"}
        {kind === "reaction" ? " this round" : " this turn"}. Picking something opens it; nothing is spent until you use it there.
      </p>

      {kind === "reaction" && (
        <section>
          <h2 className="sub-head">Ready</h2>
          <div className="group">
            {readied ? (
              <button className="row" onClick={() => openEffect(readied)}>
                <div className="row-main">
                  <div className="row-title">Release: {readied.name.replace(/^Ready:?\s*/, "")}</div>
                  <div className="row-sub">{readied.release?.spell ? "A readied spell, held with concentration: release it with your reaction when its trigger comes." : "Take the readied action with your reaction when its trigger comes."}</div>
                </div>
                <span className="tag adv">readied</span>
              </button>
            ) : ready ? (
              <button className="row" onClick={() => openFeature(ready)}>
                <div className="row-main">
                  <div className="row-title">Ready an action</div>
                  <div className="row-sub">Uses your action now, on your turn; released later with your reaction when its trigger comes.</div>
                </div>
              </button>
            ) : null}
          </div>
        </section>
      )}

      {(attacks.length > 0 || opportunity.length > 0) && (
        <section>
          <h2 className="sub-head">{kind === "reaction" ? "Opportunity attack" : "Attacks"}</h2>
          <div className="group">
            {attacks.map((a) => (
              <AttackRow key={`${a.attackId}-${a.itemInstanceId ?? ""}-${a.mode}`} a={a} openAttack={(x) => openAttack(x)} />
            ))}
            {opportunity.map((a) => (
              <AttackRow key={`oa-${a.attackId}-${a.itemInstanceId ?? ""}`} a={a} openAttack={(x) => openAttack(x, true)} />
            ))}
          </div>
        </section>
      )}

      {warCaster.length > 0 && (
        <section>
          <h2 className="sub-head">War Caster: a spell instead of the opportunity attack</h2>
          <p className="note">A 1-action spell that targets only the creature that provoked it. The cast asks for its slot and rolls as usual.</p>
          <div className="group">
            {warCaster.map((sp) => (
              <SpellRow key={`wc-${sp.list.id}-${sp.id}`} sp={sp} onOpen={() => openSpell(sp)} sub="as your reaction" />
            ))}
          </div>
        </section>
      )}

      {mine.length > 0 && (
        <section>
          <h2 className="sub-head">Your features</h2>
          <div className="group">
            {mine.map((a) => (
              <FeatureRow key={a.id} a={a} openFeature={openFeature} />
            ))}
          </div>
        </section>
      )}

      {spells.length > 0 && (
        <section>
          <h2 className="sub-head">Spells ({spells.length})</h2>
          <div className="group">
            {spells.map((sp) => (
              <SpellRow key={`${sp.list.id}-${sp.id}`} sp={sp} onOpen={() => openSpell(sp)} />
            ))}
          </div>
        </section>
      )}

      {common.filter((a) => a.id !== "common-ready").length > 0 && (
        <section>
          <h2 className="sub-head">Anyone can</h2>
          <div className="group">
            {common
              .filter((a) => a.id !== "common-ready")
              .map((a) => (
                <button className="row" key={a.id} onClick={() => openFeature(a)}>
                  <div className="row-main">
                    <div className="row-title">{a.name}</div>
                    {a.note && <div className="row-sub">{a.note.length > 90 ? `${a.note.slice(0, 88)}…` : a.note}</div>}
                  </div>
                </button>
              ))}
          </div>
        </section>
      )}
    </>
  );
}
