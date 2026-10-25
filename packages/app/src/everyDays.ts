import type { ActionResult } from "@dnd/engine";
import type { Character } from "@dnd/schema";
import { formatWorld, formatWorldDay } from "./calendar";

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
