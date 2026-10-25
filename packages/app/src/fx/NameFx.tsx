import type { DerivedSheet } from "@dnd/engine";

/**
 * The character's name at the top, with what's on them: Mirror Image's duplicates
 * (one faint copy of the name drifting around it for each one left), and Blur's
 * shimmer (the name wavers and smears). From the sheet's effects only; gone the
 * moment the effect ends. Decorative: the copies are aria-hidden, the name is read once.
 */
export function NameFx({ name, sheet }: { name: string; sheet: Pick<DerivedSheet, "effects"> }) {
  const mirror = sheet.effects.find((e) => e.id === "effect:mirror-image");
  const images = mirror ? Math.max(0, Math.min(3, mirror.counter?.left ?? 3)) : 0;
  const blur = sheet.effects.some((e) => e.id === "effect:blur");
  return (
    <span className={`who-name${images ? ` name-mirror name-mirror-${images}` : ""}${blur ? " name-blur" : ""}`}>
      {Array.from({ length: images }, (_, i) => (
        <span key={i} className="name-image" style={{ ["--i" as string]: String(i) }} aria-hidden="true">
          {name}
        </span>
      ))}
      <span className="name-real">{name}</span>
    </span>
  );
}
