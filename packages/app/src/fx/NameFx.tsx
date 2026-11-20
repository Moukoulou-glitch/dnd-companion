import type { DerivedSheet } from "@dnd/engine";
import { SunCrown } from "./Moments";

/**
 * The character's name at the top, with what's on them: Mirror Image's duplicates
 * (one faint copy of the name drifting around it for each one left), and Blur's
 * shimmer (the name wavers and smears). From the sheet's effects only; gone the
 * moment the effect ends. Charm of Sunlight: a crown of light above the name while it lasts. Decorative: the copies are aria-hidden, the name is read once.
 */
export function NameFx({ name, sheet }: { name: string; sheet: Pick<DerivedSheet, "effects"> }) {
  const mirror = sheet.effects.find((e) => e.id === "effect:mirror-image");
  const images = mirror ? Math.max(0, Math.min(3, mirror.counter?.left ?? 3)) : 0;
  const blur = sheet.effects.some((e) => e.id === "effect:blur");
  // Charm of Sunlight: the crown of light moves with you while it lasts (22i).
  const crowned = sheet.effects.some((e) => e.id === "other:charm-of-sunlight");
  // Aleriasa's mark: a small wound at the sternum that bleeds while the disease is active (a pale scar while it's held back).
  const aler = sheet.effects.find((e) => e.id === "other:aleriasa");
  return (
    <span className={`who-name${images ? ` name-mirror name-mirror-${images}` : ""}${blur ? " name-blur" : ""}${crowned ? " name-crowned" : ""}`}>
      {Array.from({ length: images }, (_, i) => (
        <span key={i} className="name-image" style={{ ["--i" as string]: String(i) }} aria-hidden="true">
          {name}
        </span>
      ))}
      <span className="name-real">{name}</span>
      {crowned && <SunCrown className="sun-crown name-crown" />}
      {aler && (
        <svg className={`aler-mark${aler.suppressed ? " held" : ""} aler-l${Math.min(5, aler.exhaustion ?? 0)}`} viewBox="0 0 20 28" aria-label={aler.suppressed ? "Aleriasa, held back" : "Aleriasa"} role="img">
          <path className="skin" d="M10 2 C15 2 17 6 17 10 C17 15 13 18 10 19 C7 18 3 15 3 10 C3 6 5 2 10 2 Z" />
          <path className="wound" d="M10 6 L11.2 9.6 L10 13.4 L8.8 9.6 Z" />
          {!aler.suppressed && (
            <>
              <path className="drip d1" d="M10 13 C10.9 15 10.9 16.4 10 17 C9.1 16.4 9.1 15 10 13 Z" />
              <circle className="drop d2" cx={10} cy={18} r={1.1} />
              <circle className="drop d3" cx={10} cy={18} r={0.9} />
            </>
          )}
        </svg>
      )}
    </span>
  );
}
