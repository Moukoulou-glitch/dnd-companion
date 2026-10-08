import { useState } from "react";
import { signed, type ContentRegistry, type DerivedSheet } from "@dnd/engine";
import { ABILITY_NAMES, type Ability, type Character, type OperationType } from "@dnd/schema";
import { BreakdownLines } from "./Sheet";

type Act = (type: OperationType, payload: unknown, label: string) => unknown;

/** A number with − and + and a box to type into. */
export function NumberStep({ label, sub, value, onChange, min = 0, max = 999 }: { label: string; sub?: string; value: number; onChange: (n: number) => void; min?: number; max?: number }) {
  const [text, setText] = useState(String(value));
  const [last, setLast] = useState(value);
  if (last !== value) {
    setLast(value);
    setText(String(value));
  }
  const commit = (n: number) => onChange(Math.max(min, Math.min(max, n)));
  return (
    <div className="row">
      <div className="row-main">
        <div className="row-title">{label}</div>
        {sub && <div className="row-sub">{sub}</div>}
      </div>
      <div className="stepper">
        <button aria-label={`${label}: one less`} disabled={value <= min} onClick={() => commit(value - 1)}>
          −
        </button>
        <input
          className="step-input"
          inputMode="numeric"
          aria-label={label}
          value={text}
          onChange={(e) => setText(e.target.value.replace(/[^0-9]/g, ""))}
          onBlur={() => text !== String(value) && commit(Number(text || 0))}
          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
        />
        <button aria-label={`${label}: one more`} disabled={value >= max} onClick={() => commit(value + 1)}>
          +
        </button>
      </div>
    </div>
  );
}

/** An ability score's breakdown, and changing it by hand: bonus, penalty (drain), "becomes N" (Amulet of Health). */
export function AbilityAdjustPanel({ ab, character, sheet, act }: { ab: Ability; character: Character; sheet: DerivedSheet; act: Act }) {
  const adj = character.abilityAdjust[ab] ?? { bonus: 0, penalty: 0, penaltyEndsOnRest: false };
  const name = ABILITY_NAMES[ab];
  const set = (p: Record<string, unknown>, label: string) => act("setAbilityAdjust", { ability: ab, ...p }, label);
  const [setTo, setSetTo] = useState(adj.setTo !== undefined ? String(adj.setTo) : "");
  const [note, setNote] = useState(adj.setNote ?? "");
  const score = sheet.abilities[ab].score.total;
  return (
    <>
      <BreakdownLines b={sheet.abilities[ab].score} totalLabel="Score" />
      {score <= 0 && (
        <p className="over-banner" role="alert">
          {name} is {score}. A shadow's Strength drain kills at 0.
        </p>
      )}
      {sheet.abilities[ab].asiOver && (
        <p className="over-banner" role="alert">
          <strong>Ability Score Improvements took {name} above 20.</strong> They can't: "you can't increase an ability score above 20 using this feature". Change the improvement in Choices (Build).
        </p>
      )}
      {!sheet.abilities[ab].asiOver && score > sheet.abilities[ab].max && adj.setTo === undefined && (
        <p className="over-banner" role="alert">
          {name} is {score}, above its maximum of {sheet.abilities[ab].max}.
        </p>
      )}
      <PermanentChange ab={ab} character={character} sheet={sheet} act={act} />
      <h2 className="sub-head">Change it by hand</h2>
      <div className="group">
        <NumberStep label="Bonus" value={adj.bonus} max={30} onChange={(n) => set({ bonus: n }, `${name} bonus ${n}.`)} />
        <NumberStep label="Penalty" sub="Strength drain, a curse, poison" value={adj.penalty} max={30} onChange={(n) => set({ penalty: n }, `${name} penalty ${n}.`)} />
        <label className="row">
          <div className="row-main">
            <div className="row-title">Penalty ends after a short or long rest</div>
          </div>
          <input type="checkbox" checked={adj.penaltyEndsOnRest} onChange={(e) => set({ penaltyEndsOnRest: e.target.checked }, e.target.checked ? "Ends on a rest." : "Stays after rests.")} />
        </label>
      </div>
      <h2 className="sub-head">Becomes a score</h2>
      <p className="note">Like an Amulet of Health (Constitution 19): the score becomes this, and it does nothing if the score is already as high or higher.</p>
      <div className="row">
        <input className="search" inputMode="numeric" placeholder="Score, e.g. 19" value={setTo} onChange={(e) => setSetTo(e.target.value.replace(/[^0-9]/g, ""))} aria-label="Becomes" style={{ maxWidth: 120 }} />
        <input className="search" placeholder="From (Amulet of Health)" value={note} maxLength={60} onChange={(e) => setNote(e.target.value)} aria-label="From" />
      </div>
      <div className="big-actions">
        <button
          className="big primary"
          disabled={!setTo || Number(setTo) < 1 || Number(setTo) > 30}
          onClick={() => set({ setTo: Number(setTo), setNote: note.trim() }, `${name} becomes ${setTo}${note.trim() ? ` (${note.trim()})` : ""}.`)}
        >
          Set
        </button>
        {adj.setTo !== undefined && (
          <button
            className="big"
            onClick={() => {
              setSetTo("");
              setNote("");
              set({ setTo: null, setNote: "" }, `${name} back to normal.`);
            }}
          >
            Remove
          </button>
        )}
      </div>
    </>
  );
}

/**
 * A permanent change to a score, with where it came from: a Manual of Gainful
 * Exercise (+2 Strength, maximum 22), a Tome, a wish, a lasting curse.
 */
function PermanentChange({ ab, character, sheet, act }: { ab: Ability; character: Character; sheet: DerivedSheet; act: Act }) {
  const name = ABILITY_NAMES[ab];
  const list = character.abilityAdjust[ab]?.permanent ?? [];
  const [sign, setSign] = useState<1 | -1>(1);
  const [amount, setAmount] = useState(2);
  const [from, setFrom] = useState("");
  const [raise, setRaise] = useState(true);
  const [newMax, setNewMax] = useState(String(Math.max(20, sheet.abilities[ab].max) + 2));
  const add = () => {
    const n = sign * amount;
    const max = sign > 0 && raise && Number(newMax) > 20 ? Number(newMax) : undefined;
    act(
      "setAbilityAdjust",
      { ability: ab, addPermanent: { amount: n, from: from.trim(), ...(max ? { newMax: max } : {}) } },
      `${name} ${n > 0 ? "+" : ""}${n} for good${from.trim() ? ` (${from.trim()})` : ""}${max ? `, maximum ${max}` : ""}.`,
    );
    setFrom("");
  };
  return (
    <>
      <h2 className="sub-head">Permanent change</h2>
      <p className="note">For good, like a Manual of Gainful Exercise (+2 Strength, and the maximum becomes 22) or a Manual of Quickness of Action (Dexterity). Counts for everything, multiclassing included.</p>
      {list.length > 0 && (
        <div className="group">
          {list.map((p, i) => (
            <div className="row" key={i}>
              <div className="row-main">
                <div className="row-title">
                  {p.amount > 0 ? "+" : ""}
                  {p.amount} {p.from ? `from ${p.from}` : ""}
                </div>
                {p.newMax && <div className="row-sub">Maximum {p.newMax}</div>}
              </div>
              <button className="link" onClick={() => act("setAbilityAdjust", { ability: ab, removePermanent: i }, `${name}: permanent change removed.`)}>
                Remove
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="segmented small" role="radiogroup" aria-label="Bonus or penalty">
        <button role="radio" aria-checked={sign === 1} onClick={() => setSign(1)}>
          Bonus
        </button>
        <button role="radio" aria-checked={sign === -1} onClick={() => setSign(-1)}>
          Penalty
        </button>
      </div>
      <div className="group">
        <NumberStep label={sign > 0 ? "Bonus" : "Penalty"} value={amount} min={1} max={10} onChange={setAmount} />
        {sign > 0 && (
          <label className="row">
            <div className="row-main">
              <div className="row-title">Is there a new maximum?</div>
              <div className="row-sub">A Manual raises the maximum by 2</div>
            </div>
            <input type="checkbox" checked={raise} onChange={(e) => setRaise(e.target.checked)} />
          </label>
        )}
        {sign > 0 && raise && (
          <div className="row">
            <div className="row-main">
              <div className="row-title">New maximum</div>
            </div>
            <input className="search" inputMode="numeric" value={newMax} onChange={(e) => setNewMax(e.target.value.replace(/[^0-9]/g, ""))} aria-label="New maximum" style={{ maxWidth: 90 }} />
          </div>
        )}
      </div>
      <input className="search" placeholder="From (Manual of Gainful Exercise)" value={from} maxLength={60} onChange={(e) => setFrom(e.target.value)} aria-label="Permanent change from" />
      <div className="big-actions">
        <button className="big primary" disabled={!from.trim()} onClick={add}>
          Add {sign > 0 ? "+" : "−"}
          {amount} for good
        </button>
      </div>
    </>
  );
}

/** Maximum hit points: the breakdown, a reduction and an increase by hand, and the rolls for each level. */
export function MaxHpPanel({ character, sheet, reg, act }: { character: Character; sheet: DerivedSheet; reg: ContentRegistry; act: Act }) {
  const adj = character.maxHpAdjust ?? { reduce: 0, increase: 0 };
  return (
    <>
      <h2 className="sub-head">Maximum hit points: {sheet.hpMax.total}</h2>
      <div className="group">
        <NumberStep label="Reduction" sub="A vampire's bite, a curse" value={adj.reduce} onChange={(n) => act("setMaxHpAdjust", { reduce: n }, `Maximum HP reduced by ${n}.`)} />
        <NumberStep label="Increase" sub="Aid from outside the app, a blessing" value={adj.increase} onChange={(n) => act("setMaxHpAdjust", { increase: n }, `Maximum HP increased by ${n}.`)} />
      </div>
      {(adj.reduce > 0 || adj.increase > 0) && (
        <button className="link" onClick={() => act("setMaxHpAdjust", { reduce: 0, increase: 0 }, "Back to your normal maximum.")}>
          Back to normal ({sheet.hpMax.total - adj.increase + adj.reduce})
        </button>
      )}
      <details className="skills">
        <summary className="sub-head">How it adds up</summary>
        <BreakdownLines b={sheet.hpMax} totalLabel="Maximum" />
      </details>
      <h2 className="sub-head">Your hit point rolls</h2>
      <p className="note">Kept for each level after the first, so the maximum can be worked out again. Levels without a roll use the average.</p>
      {character.classes.map((cl, ci) => {
        const def = reg.find(cl.class, "class");
        if (!def) return null;
        const avg = def.hitDie / 2 + 1;
        const firstLevel = ci === 0 ? 2 : 1;
        const count = cl.level - (ci === 0 ? 1 : 0);
        if (count <= 0) return null;
        return (
          <div key={cl.class} className="group" style={{ marginBottom: 8 }}>
            <div className="row row-sub">
              {def.name} (d{def.hitDie}){ci === 0 ? ` · level 1: ${def.hitDie} (maximum)` : ""}
            </div>
            {Array.from({ length: count }, (_, i) => {
              const v = cl.hpRolls?.[i];
              return (
                <NumberStep
                  key={i}
                  label={`Level ${firstLevel + i}`}
                  sub={v === undefined ? `average ${avg}` : v > def.hitDie ? `more than a d${def.hitDie}` : "rolled"}
                  value={v ?? avg}
                  min={1}
                  max={def.hitDie}
                  onChange={(n) => act("setHpRoll", { class: cl.class, index: i, value: n }, `${def.name} level ${firstLevel + i}: ${n}.`)}
                />
              );
            })}
          </div>
        );
      })}
      <p className="note">Constitution modifier {signed(sheet.abilities.con.modifier)} is added for every level.</p>
    </>
  );
}

/** A summoned creature's maximum hit points changed by hand. */
export function SummonMaxHp({ member, reg, act }: { member: Character["summons"][number]; reg: ContentRegistry; act: Act }) {
  const adj = member.maxHpAdjust ?? { reduce: 0, increase: 0 };
  const base = reg.find(member.creature, "creature")?.hp ?? member.hp;
  return (
    <>
      <h2 className="sub-head">Maximum hit points</h2>
      <div className="group">
        <NumberStep label="Reduction" sub="A vampire's bite, a curse" value={adj.reduce} onChange={(n) => act("summonMaxHpAdjust", { id: member.id, reduce: n }, `Its maximum reduced by ${n}.`)} />
        <NumberStep label="Increase" sub="By hand" value={adj.increase} onChange={(n) => act("summonMaxHpAdjust", { id: member.id, increase: n }, `Its maximum increased by ${n}.`)} />
      </div>
      {(adj.reduce > 0 || adj.increase > 0) && (
        <button className="link" onClick={() => act("summonMaxHpAdjust", { id: member.id, reduce: 0, increase: 0 }, "Back to its normal maximum.")}>
          Back to normal ({base} before effects)
        </button>
      )}
    </>
  );
}
