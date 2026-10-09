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

/** The look of a phase, taking the picked mode into account (no mode, or an unknown one: the neutral look). */
export function phaseLook(spell: string, phase: SpellPhase, mode?: string): PhaseLook | undefined {
  const d = SPELL_FX[spell];
  if (!d) return undefined;
  if (phase === "cast" && mode) return d.modes?.[mode.toLowerCase()]?.cast ?? d.cast;
  return d[phase];
}

export interface PhaseLook {
  /** CSS class with the look (styles.css, "Spell effects"). */
  look: string;
  ms: number;
  /** Where: where you tapped, the top of the screen down to the tap, or across the whole width. */
  at: "tap" | "sky" | "across" | "edge";
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
  /**
   * Looks by the mode the player picked when casting (the spell's effect
   * choice, lower case: "flood", "rain"). No mode picked, or one not listed:
   * the neutral cast and ongoing above, never a guess.
   */
  modes?: Record<string, { cast?: PhaseLook; ongoing?: string }>;
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

const water = (look: string): PhaseLook => ({ look: `sfx-water ${look}`, ms: 900, at: "across" });
const weather = (look: string): PhaseLook => ({ look: `sfx-weather ${look}`, ms: 1400, at: "edge" });

Object.assign(SPELL_FX, {
  "spell:ice-storm": {
    family: "ice",
    // Frost at the edges, hail coming down, then one wide icy wave. Its damage roll doesn't replay it.
    cast: { look: "sfx-ice", ms: 900, at: "sky", buzz: [25, 40, 25] },
  },
  "spell:control-water": {
    family: "water",
    cast: water("sfx-water-neutral"),
    ongoing: "sfx-ongoing-water",
    modes: {
      flood: { cast: water("sfx-water-flood") },
      "part water": { cast: water("sfx-water-part") },
      "redirect flow": { cast: water("sfx-water-redirect") },
      whirlpool: { cast: { look: "sfx-water sfx-water-whirl", ms: 900, at: "tap" } },
    },
  },
  "spell:control-weather": {
    family: "weather",
    // Slower: layers of cloud and light settle in. The ongoing loop is only a faint sky at the top: the weather changes in stages, not at once.
    cast: weather("sfx-weather-neutral"),
    ongoing: "sfx-ongoing-weather",
    modes: {
      "clear skies": { cast: weather("sfx-weather-clear"), ongoing: "sfx-ongoing-weather sfx-ongoing-clear" },
      rain: { cast: weather("sfx-weather-rain"), ongoing: "sfx-ongoing-weather sfx-ongoing-rain" },
      snow: { cast: weather("sfx-weather-snow"), ongoing: "sfx-ongoing-weather sfx-ongoing-snow" },
      wind: { cast: weather("sfx-weather-wind"), ongoing: "sfx-ongoing-weather sfx-ongoing-windy" },
      storm: { cast: weather("sfx-weather-storm"), ongoing: "sfx-ongoing-weather sfx-ongoing-storm" },
    },
  },
} satisfies Record<string, SpellFxDef>);

export const spellFxOf = (spell: string | undefined): SpellFxDef | undefined => (spell ? SPELL_FX[spell] : undefined);
