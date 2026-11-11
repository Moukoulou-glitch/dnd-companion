import { ABILITIES, ABILITY_NAMES, type Ability } from "@dnd/schema";

export type RaceMoves = Partial<Record<Ability, Ability>>;

/** Where each of the race's increases lands, after the moves: { dex: 2, int: 1 }. */
export function movedBonuses(fixed: Partial<Record<Ability, number>>, moves: RaceMoves): Partial<Record<Ability, number>> {
  const out: Partial<Record<Ability, number>> = {};
  for (const a of ABILITIES) {
    const n = fixed[a];
    if (!n) continue;
    const to = moves[a] ?? a;
    out[to] = (out[to] ?? 0) + n;
  }
  return out;
}

const plus = (n: number) => (n >= 0 ? `+${n}` : `${n}`);

/**
 * The race's ability score increases, each on its own ability or put on another one
 * (Tasha's Cauldron of Everything, Customizing Your Origin). Two on one ability: warned, kept.
 */
export function RaceBonusMover({ raceName, fixed, moves, onChange }: { raceName: string; fixed: Partial<Record<Ability, number>>; moves: RaceMoves; onChange: (m: RaceMoves) => void }) {
  const lines = ABILITIES.filter((a) => fixed[a]).map((a) => ({ from: a, amount: fixed[a]!, to: moves[a] ?? a }));
  if (!lines.length) return null;
  const moved = lines.some((l) => l.to !== l.from);
  const twice = ABILITIES.filter((a) => lines.filter((l) => l.to === a).length > 1);
  return (
    <div className="race-moves">
      <p className="note">
        {raceName}'s increases: {lines.map((l) => `${plus(l.amount)} ${ABILITY_NAMES[l.from]}`).join(", ")}. You can put each one on another ability instead (Customizing Your Origin, Tasha's).
      </p>
      <div className="group">
        {lines.map((l) => (
          <label className="row" key={l.from}>
            <div className="row-main">
              <div className="row-title">
                {plus(l.amount)} {ABILITY_NAMES[l.from]}
              </div>
              <div className="row-sub">{l.to === l.from ? "Where the race puts it" : `Moved to ${ABILITY_NAMES[l.to]}`}</div>
            </div>
            <select className="score-select" value={l.to} aria-label={`Where ${raceName}'s ${plus(l.amount)} ${ABILITY_NAMES[l.from]} goes`} onChange={(e) => onChange({ ...moves, [l.from]: e.target.value as Ability })}>
              {ABILITIES.map((a) => (
                <option key={a} value={a}>
                  {ABILITY_NAMES[a]}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
      {twice.length > 0 && moved && (
        <p className="note warn">
          ⚠ {twice.map((a) => ABILITY_NAMES[a]).join(" and ")} {twice.length > 1 ? "get" : "gets"} two of the increases. Customizing Your Origin moves each increase to a different ability.
        </p>
      )}
      {moved && (
        <button className="link" onClick={() => onChange({})}>
          Back to {raceName}'s own
        </button>
      )}
    </div>
  );
}
