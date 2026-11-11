import { useState } from "react";
import type { Character } from "@dnd/schema";
import { MITHIOLOGIO, calendarName, fromDate, monthsOf, toDate, type CalendarKind } from "../calendar";
import { NumberStep } from "./Adjust";

/** Where a calendar starts when it isn't the character's own: today (Normal), the table's date (Μηθειολόγιο), year 1. */
function startOf(kind: CalendarKind, story: Character["story"]): number {
  const cal = story.calendar;
  if (cal.kind === kind) return cal.minutes;
  if (kind === "mithiologio") return fromDate(MITHIOLOGIO.start, "mithiologio");
  if (kind === "normal") {
    const t = new Date();
    return fromDate({ year: t.getFullYear(), month: t.getMonth(), day: t.getDate(), hour: 12, minute: 0 }, "normal");
  }
  return fromDate({ year: 1, month: 0, day: 1, hour: 12, minute: 0 }, "custom", cal.custom);
}

/**
 * When a feature was used, asked of the player for its Backstory note (Divine Intervention): the session and
 * the day, on the Normal calendar, the Μηθειολόγιο or the character's custom one. Filled in with the
 * character's own session and date; nothing is written until they save.
 */
export function UsedWhenPanel({ name, story, detail, onSave, onSkip }: { name: string; story: Character["story"]; detail?: string; onSave: (o: { session: number; minutes: number; kind: CalendarKind }) => void; onSkip: () => void }) {
  const custom = story.calendar.custom;
  const [kind, setKind] = useState<CalendarKind>(story.calendar.kind);
  const [session, setSession] = useState(story.session);
  const [noCustom, setNoCustom] = useState(false);
  const [date, setDate] = useState(() => {
    const d = toDate(startOf(story.calendar.kind, story), story.calendar.kind, custom);
    return { year: d.year, month: d.month, day: d.day };
  });
  const pick = (k: CalendarKind) => {
    // No custom calendar made yet: say where it's made, and stay on this one.
    if (k === "custom" && !custom) return setNoCustom(true);
    setNoCustom(false);
    setKind(k);
    const d = toDate(startOf(k, story), k, custom);
    setDate({ year: d.year, month: d.month, day: d.day });
  };
  const months = monthsOf(kind, custom);
  const days = months[date.month]?.days ?? 30;
  const minutes = fromDate({ ...date, day: Math.min(date.day, days), hour: 12, minute: 0 }, kind, custom);
  const kinds: CalendarKind[] = ["normal", "mithiologio", "custom"];
  return (
    <>
      <p className="question">When was {name} used?</p>
      {detail && <p className="note">{detail}</p>}
      <p className="note">For the note in your Backstory: the session and the day.</p>
      <div className="group">
        <NumberStep label="Session" value={session} min={0} max={9999} onChange={setSession} />
      </div>
      <div className="segmented small three" role="radiogroup" aria-label="Calendar" style={{ marginTop: 12 }}>
        {kinds.map((k) => (
          <button key={k} role="radio" aria-checked={kind === k} onClick={() => pick(k)}>
            {k === "normal" ? "Normal" : k === "mithiologio" ? "Μηθειολόγιο" : custom ? calendarName(k, custom) : "Custom"}
          </button>
        ))}
      </div>
      {noCustom && <p className="note warn">No custom calendar yet: make one in Backstory, under In the world (Calendar → Custom). For now, pick Normal or Μηθειολόγιο.</p>}
      <div className="group set-date" style={{ marginTop: 8 }}>
        <NumberStep label="Day" value={Math.min(date.day, days)} min={1} max={days} onChange={(n) => setDate({ ...date, day: n })} />
        <div className="row">
          <div className="row-main row-title">Month</div>
          <select className="search" value={date.month} onChange={(e) => setDate({ ...date, month: Number(e.target.value) })} aria-label="Month" style={{ maxWidth: 200 }}>
            {months.map((m, i) => (
              <option key={i} value={i}>
                {m.name}
              </option>
            ))}
          </select>
        </div>
        <NumberStep label="Year" value={date.year} min={1} max={99999} onChange={(n) => setDate({ ...date, year: n })} />
      </div>
      <button className="big primary wide" style={{ marginTop: 12 }} onClick={() => onSave({ session, minutes, kind })}>
        Save the note
      </button>
      <button className="link" onClick={onSkip}>
        No note this time
      </button>
    </>
  );
}
