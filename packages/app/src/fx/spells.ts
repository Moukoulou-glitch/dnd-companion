/**
 * Spell effects by phase, keyed by the spell's content id (never its name).
 * Animation only: nothing here knows or changes how a spell works. Each phase
 * plays from its own confirmed event:
 *
 * - cast:    the castSpell operation is recorded.
 * - again:   a later use while the spell lasts: its damage rolled from the
 *            concentration chip (Call Lightning's next bolt, Moonbeam's next burn).
 * - resolve: its damage rolled right after casting (from the spell itself).
 * - ongoing: a quiet loop shown while the engine says you're concentrating on
 *            it; gone (with a short fade) the moment concentration ends.
 *
 * A phase left out plays nothing (or, for cast, the generic arcane circle), so
 * a lasting spell never replays its whole cast every turn.
 */
export type SpellPhase = "cast" | "again" | "resolve";

export interface PhaseLook {
  /** CSS class with the look (styles.css, "Spell effects"). */
  look: string;
  ms: number;
  /** Where: where you tapped, the top of the screen down to the tap, or across the whole width. */
  at: "tap" | "sky" | "across";
  /** navigator.vibrate pattern, when the phone has it. */
  buzz?: number[];
}

export interface SpellFxDef {
  family: "moonlight" | "lightning" | "wind" | "water" | "ice" | "weather";
  cast?: PhaseLook;
  again?: PhaseLook;
  resolve?: PhaseLook;
  /** CSS class of the quiet loop while concentrating; static under reduced motion, paused when the app is in the background. */
  ongoing?: string;
}

const moonPulse: PhaseLook = { look: "sfx-moon-pulse", ms: 450, at: "tap" };

export const SPELL_FX: Record<string, SpellFxDef> = {
  "spell:moonbeam": {
    family: "moonlight",
    // A silver-blue glyph, then the column of moonlight comes down.
    cast: { look: "sfx-moon-cast", ms: 900, at: "sky" },
    again: moonPulse,
    resolve: moonPulse,
    ongoing: "sfx-ongoing-moon",
  },
  "spell:call-lightning": {
    family: "lightning",
    // The storm gathers once; every later bolt comes from it, short.
    cast: { look: "sfx-storm-cast", ms: 1100, at: "sky", buzz: [50] },
    again: { look: "sfx-bolt", ms: 420, at: "sky", buzz: [35] },
    ongoing: "sfx-ongoing-storm",
  },
  "spell:gust-of-wind": {
    family: "wind",
    cast: { look: "sfx-gust", ms: 800, at: "across" },
    ongoing: "sfx-ongoing-wind",
  },
};

export const spellFxOf = (spell: string | undefined): SpellFxDef | undefined => (spell ? SPELL_FX[spell] : undefined);
