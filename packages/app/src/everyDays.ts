import type { ActionResult } from "@dnd/engine";
import type { Character } from "@dnd/schema";
import { formatWorld, formatWorldDay, type CalendarKind } from "./calendar";
import type { CalendarDef } from "@dnd/schema";

/**
 * The Backstory note for a use that can come again only after some days
 * (Divine Intervention after it worked: 7; Charm of Sunlight: 10), with the
 * session, the in-world date and the day it's back. Nothing when the action
 * has no wait, or when the roll was above what starts the wait (a Divine
 * Intervention that failed can be tried again after a long rest).
 */
export function everyDaysNote(a: Pick<ActionResult, "name" | "everyDays" | "everyDaysIfRollAtMost" | "roll">, rolled: number | undefined, story: Character["story"] | undefined) {
  if (!a.everyDays) return undefined;
  if (a.everyDaysIfRollAtMost !== undefined && (rolled === undefined || rolled > a.everyDaysIfRollAtMost)) return undefined;
  const cal = story?.calendar;
  const again = cal ? formatWorldDay(cal.minutes + a.everyDays * 24 * 60, cal.kind, cal.custom) : undefined;
  return {
    title: `${a.name} used`,
    body: `${a.name} was used${rolled !== undefined && a.roll ? ` (rolled ${rolled})` : ""}. It can't be used again for ${a.everyDays} days${again ? `: from ${again}` : ""}.`,
    category: "gold" as const,
    pinned: false,
    ...(story?.session !== undefined ? { session: story.session } : {}),
    ...(cal ? { gameDate: formatWorld(cal.minutes, cal.kind, cal.custom), gameMinutes: cal.minutes } : {}),
  };
}

/**
 * Days a spell lasts, from its duration ("10 days", "24 hours", "Up to 24 hours", "30 days"); undefined for
 * anything shorter, or with no end of its own ("Until dispelled").
 */
export function spellDays(duration: string | undefined): number | undefined {
  const d = (duration ?? "").toLowerCase();
  const days = /(\d+)\s*days?\b/.exec(d);
  if (days) return Number(days[1]);
  const hours = /(\d+)\s*hours?\b/.exec(d);
  if (hours && Number(hours[1]) >= 24 && Number(hours[1]) % 24 === 0) return Number(hours[1]) / 24;
  return undefined;
}

/** Days a feature's use lasts: rolled in days (Theros: 1d10), or a day or more of time (Blackrazor's 24 hours). */
export function actionDays(a: Pick<ActionResult, "duration">, rolled: number | undefined, effectMinutes?: number): number | undefined {
  const d = a.duration;
  if (d?.fromRoll === "days" && rolled !== undefined) return rolled;
  if (d?.fromRoll === "hours" && rolled !== undefined && rolled >= 24 && rolled % 24 === 0) return rolled / 24;
  const minutes = d?.minutes ?? effectMinutes;
  if (minutes !== undefined && minutes >= 1440 && minutes % 1440 === 0) return minutes / 1440;
  return undefined;
}

/** The note for something that lasts days (Gentle Repose: 10 days; Theros: 4 days), from now on the character's calendar. */
export function lastsDaysNote(name: string, days: number, story: Character["story"] | undefined, what = "cast") {
  const cal = story?.calendar;
  const until = cal ? formatWorldDay(cal.minutes + days * 1440, cal.kind, cal.custom) : undefined;
  return {
    title: `${name} ${what}`,
    body: `${name} was ${what}. It lasts ${days === 1 ? "1 day" : `${days} days`}${until ? `: until ${until}` : ""}.`,
    category: "teal" as const,
    pinned: false,
    ...(story?.session !== undefined ? { session: story.session } : {}),
    ...(cal ? { gameDate: formatWorld(cal.minutes, cal.kind, cal.custom), gameMinutes: cal.minutes } : {}),
  };
}

/**
 * The note asked for when Divine Intervention is used: the session and the day the player gave, on the
 * calendar they picked (the character's own keeps its minutes, so the note sorts by in-world date), and
 * whether the deity answered (then not again for 7 days).
 */
export function interventionNote(o: {
  name: string;
  session: number;
  minutes: number;
  kind: CalendarKind;
  custom?: CalendarDef;
  rolled?: number;
  answered: boolean;
  days?: number;
  story: Character["story"] | undefined;
}) {
  const day = formatWorldDay(o.minutes, o.kind, o.custom);
  const roll = o.rolled !== undefined ? ` (rolled ${o.rolled})` : "";
  const outcome = o.answered
    ? ` Your deity answered${roll}. It can't be used again for ${o.days ?? 7} days: from ${formatWorldDay(o.minutes + (o.days ?? 7) * 1440, o.kind, o.custom)}.`
    : ` No answer this time${roll}: it can be tried again after a long rest.`;
  const same = o.story?.calendar.kind === o.kind;
  return {
    title: `${o.name} used`,
    body: `${o.name} was used in session ${o.session}, on ${day}.${outcome}`,
    category: "gold" as const,
    pinned: true,
    session: o.session,
    gameDate: day,
    // Minutes only on the character's own calendar (another one's would sort wrongly).
    ...(same ? { gameMinutes: o.minutes } : {}),
  };
}
