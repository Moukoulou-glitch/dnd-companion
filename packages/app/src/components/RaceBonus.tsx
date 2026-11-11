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
 * Puts one increase on `to`. Two increases never share an ability (the table's ruling): the one already there
 * swaps places with it (a Tiefling's +2 Charisma to Intelligence sends the +1 Intelligence to Charisma).
 */
export function moveIncrease(fixed: Partial<Record<Ability, number>>, moves: RaceMoves, from: Ability, to: Ability): RaceMoves {
  const where = (a: Ability) => moves[a] ?? a;
  const next: RaceMoves = { ...moves, [from]: to };
  const other = ABILITIES.find((a) => a !== from && fixed[a] && where(a) === to);
  if (other) next[other] = where(from);
  return Object.fromEntries(Object.entries(next).filter(([a, b]) => a !== b)) as RaceMoves;
}

/**
 * The race's ability score increases, each on its own ability or put on another one
 * (Tasha's Cauldron of Everything, Customizing Your Origin). Never two on one ability: picking a taken one swaps them.
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
            <select className="score-select" value={l.to} aria-label={`Where ${raceName}'s ${plus(l.amount)} ${ABILITY_NAMES[l.from]} goes`} onChange={(e) => onChange(moveIncrease(fixed, moves, l.from, e.target.value as Ability))}>
              {ABILITIES.map((a) => {
                const taken = lines.find((x) => x.from !== l.from && x.to === a);
                return (
                  <option key={a} value={a}>
                    {ABILITY_NAMES[a]}
                    {taken ? ` (swap with ${plus(taken.amount)})` : ""}
                  </option>
                );
              })}
            </select>
          </label>
        ))}
      </div>
      {twice.length > 0 && moved && (
        <p className="note warn">
          ⚠ {twice.map((a) => ABILITY_NAMES[a]).join(" and ")} {twice.length > 1 ? "get" : "gets"} two of the increases, which isn't allowed: each goes on a different ability. Pick another one for it.
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
