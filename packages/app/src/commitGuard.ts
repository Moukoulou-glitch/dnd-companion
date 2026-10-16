/**
 * A fast second tap on something that spends (a feature's use, sorcery
 * points, a slot, a summoning) records it only once. The same change with the
 * same details within DOUBLE_TAP_MS of the first is taken as the same tap.
 * Anything else, or the same thing done again a moment later, goes through:
 * nothing is ever blocked for being out of uses (that only warns).
 */
export const DOUBLE_TAP_MS = 800;

export const GUARDED = new Set(["useAction", "spendResource", "spendSlot", "castSpell", "summonCompanion", "reviveCompanion", "damage", "heal", "spendHitDie", "companionAction"]);

export class CommitGuard {
  private last: { key: string; at: number } | undefined;

  constructor(private readonly ms = DOUBLE_TAP_MS) {}

  /** Whether to record this change; false for a repeat of the last one within the window. */
  allow(type: string, payload: unknown, now: number): boolean {
    if (!GUARDED.has(type)) return true;
    const key = `${type}|${JSON.stringify(payload)}`;
    const repeat = this.last && this.last.key === key && now - this.last.at < this.ms;
    if (repeat) return false;
    this.last = { key, at: now };
    return true;
  }

  /** After undo, the next tap is a new one. */
  reset() {
    this.last = undefined;
  }
}
