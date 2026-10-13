/**
 * The HP frame's colour by how much of the maximum is left, and the low-HP
 * blink. Display only: nothing here changes hit points.
 *
 *   80–100%  healthy   (green)
 *   50–79%   wounded   (yellow)
 *   25–49%   bloodied  (orange)
 *   11–24%   danger    (red)
 *    0–10%   critical  (darkest red)
 *
 * The percentage is current ÷ maximum, not rounded, so 79.9% is still
 * "wounded" and exactly 80% is "healthy"; exactly 10% is "critical".
 */
export type HpTier = "healthy" | "wounded" | "bloodied" | "danger" | "critical" | "unknown";

export function hpTier(current: number, max: number): HpTier {
  if (!Number.isFinite(current) || !Number.isFinite(max) || max <= 0) return "unknown";
  const pct = (Math.max(0, current) / max) * 100;
  if (pct >= 80) return "healthy";
  if (pct >= 50) return "wounded";
  if (pct >= 25) return "bloodied";
  if (pct > 10) return "danger";
  return "critical";
}

/** Words for the tier, so colour is never the only sign (screen readers, the frame's label). */
export const HP_TIER_WORDS: Record<HpTier, string> = {
  healthy: "healthy",
  wounded: "wounded",
  bloodied: "bloodied",
  danger: "badly hurt",
  critical: "critical",
  unknown: "",
};

/**
 * The existing low-HP blink, unchanged: 1 HP up to 10% of the maximum, and not
 * while in a Wild Shape or Polymorph form. At 0 HP the death-save state shows
 * instead (no blink).
 */
export function hpBlinks(current: number, max: number, inForm: boolean): boolean {
  return current >= 1 && current <= max * 0.1 && !inForm;
}
