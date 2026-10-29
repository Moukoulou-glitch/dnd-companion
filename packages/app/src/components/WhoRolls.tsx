/**
 * "My dice" or "App rolls" for one roll outside the roll screen (a breath weapon, a feature's
 * dice, Give Life): starts from the character's setting and changes only this roll.
 * With 3D dice switched on, "App rolls" throws them.
 */
export function WhoRolls({ physical, onChange }: { physical: boolean; onChange: (physical: boolean) => void }) {
  return (
    <div className="segmented small" role="radiogroup" aria-label="Who rolls">
      <button role="radio" aria-checked={physical} onClick={() => onChange(true)}>
        My dice
      </button>
      <button role="radio" aria-checked={!physical} onClick={() => onChange(false)}>
        App rolls
      </button>
    </div>
  );
}
