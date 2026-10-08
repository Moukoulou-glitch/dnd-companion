import { useEffect, useMemo, useState } from "react";
import type { CalendarDef, Character, Note, OperationType } from "@dnd/schema";
import { MITHIOLOGIO, MITHIOLOGIO_URL, calendarName, formatReal, formatWorld, fromDate, hoursPerDay, monthsOf, toDate, type CalendarKind } from "../calendar";
import { NumberStep } from "./Adjust";

type Act = (type: OperationType, payload: unknown, label: string) => unknown;

export const NOTE_COLORS: { id: string; label: string }[] = [
  { id: "none", label: "No colour" },
  { id: "red", label: "Red" },
  { id: "gold", label: "Gold" },
  { id: "green", label: "Green" },
  { id: "teal", label: "Teal" },
  { id: "blue", label: "Blue" },
  { id: "purple", label: "Purple" },
];

const PARTS: { key: "traits" | "ideals" | "bonds" | "flaws"; label: string; hint: string }[] = [
  { key: "traits", label: "Personality traits", hint: "Habits, manners, how you talk" },
  { key: "ideals", label: "Ideals", hint: "What you believe in" },
  { key: "bonds", label: "Bonds", hint: "Who and what you're tied to" },
  { key: "flaws", label: "Flaws", hint: "Weaknesses, vices, fears" },
];

/** A text box that saves when you leave it (and shows that it did). */
function SavedText({ value, onSave, rows, label, placeholder, big }: { value: string; onSave: (v: string) => void; rows: number; label: string; placeholder?: string; big?: boolean }) {
  const [text, setText] = useState(value);
  const [last, setLast] = useState(value);
  if (last !== value) {
    setLast(value);
    setText(value);
  }
  return (
    <textarea
      className={`story-text${big ? " big" : ""}`}
      rows={rows}
      aria-label={label}
      placeholder={placeholder}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => text !== value && onSave(text)}
    />
  );
}

/** Lines of `text` that hold `q`, for search results. */
function snippets(text: string, q: string): string[] {
  if (!q) return [];
  return text
    .split(/\n+/)
    .filter((l) => l.toLowerCase().includes(q))
    .slice(0, 3)
    .map((l) => (l.length > 160 ? `${l.slice(0, 157)}…` : l));
}

/** Highlights `q` in `text`. */
function Mark({ text, q }: { text: string; q: string }) {
  if (!q) return <>{text}</>;
  const i = text.toLowerCase().indexOf(q);
  if (i < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, i)}
      <mark>{text.slice(i, i + q.length)}</mark>
      <Mark text={text.slice(i + q.length)} q={q} />
    </>
  );
}

/**
 * The Backstory page: who you are (traits, ideals, bonds, flaws), your story,
 * notes by session with colours and real dates, and the in-world date.
 */
export function BackstoryTab({ c, act }: { c: Character; act: Act }) {
  const story = c.story;
  const cal = story.calendar;
  const [q, setQ] = useState("");
  const needle = q.trim().toLowerCase();
  const [colour, setColour] = useState<string>("all");
  const [sessionOnly, setSessionOnly] = useState(false);
  const [editing, setEditing] = useState<string | "new" | null>(null);

  const notes = useMemo(() => {
    const list = c.notes.filter((n) => (colour === "all" || n.category === colour) && (!sessionOnly || n.session === story.session) && (!needle || `${n.title}\n${n.body}`.toLowerCase().includes(needle)));
    return [...list].sort((a, b) => Number(b.pinned) - Number(a.pinned) || (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
  }, [c.notes, colour, sessionOnly, needle, story.session]);

  const found = needle
    ? [...PARTS.map((p) => ({ label: p.label, lines: snippets(story[p.key], needle) })), { label: "Backstory", lines: snippets(story.backstory, needle) }].filter((x) => x.lines.length)
    : [];

  return (
    <main className="backstory">
      <input className="search" type="search" placeholder="Search your story and notes" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search your story and notes" />
      {needle && (
        <section>
          <h2>Found</h2>
          {found.length === 0 && notes.length === 0 && <p className="note">Nothing matches “{q.trim()}”.</p>}
          {found.map((f) => (
            <div className="found" key={f.label}>
              <div className="row-sub">{f.label}</div>
              {f.lines.map((l, i) => (
                <p key={i}>
                  <Mark text={l} q={needle} />
                </p>
              ))}
            </div>
          ))}
          {notes.length > 0 && <p className="note">{notes.length === 1 ? "1 note" : `${notes.length} notes`} below.</p>}
        </section>
      )}

      <WorldTime c={c} act={act} />

      {!needle && (
        <>
          <section>
            <h2>Who you are</h2>
            {PARTS.map((p) => (
              <label className="story-field" key={p.key}>
                <span className="row-title">{p.label}</span>
                <span className="row-sub">{p.hint}</span>
                <SavedText value={story[p.key]} rows={3} label={p.label} onSave={(v) => act("setStory", { [p.key]: v }, `${p.label} saved.`)} />
              </label>
            ))}
          </section>

          <section>
            <h2>Backstory</h2>
            <SavedText value={story.backstory} rows={10} big label="Backstory" placeholder="Where you come from, what happened, why you adventure…" onSave={(v) => act("setStory", { backstory: v }, "Backstory saved.")} />
            <p className="note">{story.backstory.trim() ? `${story.backstory.trim().split(/\s+/).length} words. ` : ""}Saved when you tap outside the box.</p>
          </section>
        </>
      )}

      <section>
        <h2>Notes</h2>
        <div className="group">
          <NumberStep label="Session" sub="New notes go to this session" value={story.session} min={0} max={9999} onChange={(n) => act("setStory", { session: n }, `Session ${n}.`)} />
        </div>
        <div className="note-filters" role="group" aria-label="Show notes">
          <button className="chip" aria-pressed={colour === "all" && !sessionOnly} onClick={() => (setColour("all"), setSessionOnly(false))}>
            All
          </button>
          <button className="chip" aria-pressed={sessionOnly} onClick={() => setSessionOnly(!sessionOnly)}>
            Session {story.session}
          </button>
          {NOTE_COLORS.filter((x) => x.id !== "none").map((x) => (
            <button key={x.id} className={`chip swatch ${x.id}`} aria-label={x.label} aria-pressed={colour === x.id} onClick={() => setColour(colour === x.id ? "all" : x.id)} />
          ))}
        </div>
        {editing === "new" ? (
          <NoteEditor c={c} act={act} done={() => setEditing(null)} />
        ) : (
          <button className="big primary wide" onClick={() => setEditing("new")}>
            New note
          </button>
        )}
        <div className="notes-list">
          {notes.map((n) =>
            editing === n.id ? (
              <NoteEditor key={n.id} c={c} act={act} note={n} done={() => setEditing(null)} />
            ) : (
              <button key={n.id} className={`note-card ${n.category}`} onClick={() => setEditing(n.id)}>
                <div className="note-head">
                  {n.pinned && <span aria-label="Pinned">📌 </span>}
                  <b>
                    <Mark text={n.title || "Untitled"} q={needle} />
                  </b>
                </div>
                {n.body && (
                  <p className="note-body">
                    <Mark text={n.body.length > 240 && !needle ? `${n.body.slice(0, 237)}…` : n.body} q={needle} />
                  </p>
                )}
                <div className="note-meta">
                  {n.session !== undefined && <span>Session {n.session}</span>}
                  {n.createdAt && <span>{formatReal(n.createdAt)}</span>}
                  {n.updatedAt && n.updatedAt !== n.createdAt && <span>edited {formatReal(n.updatedAt)}</span>}
                  {n.gameDate && <span>In the world: {n.gameDate}</span>}
                </div>
              </button>
            ),
          )}
          {notes.length === 0 && !needle && <p className="note">No notes{colour !== "all" || sessionOnly ? " like that" : " yet"}.</p>}
        </div>
      </section>
    </main>
  );
}

/** Writing or changing a note. New notes get the real date and time, the session and the in-world date. */
function NoteEditor({ c, act, note, done }: { c: Character; act: Act; note?: Note; done: () => void }) {
  const [title, setTitle] = useState(note?.title ?? "");
  const [body, setBody] = useState(note?.body ?? "");
  const [category, setCategory] = useState(note?.category ?? "none");
  const [pinned, setPinned] = useState(note?.pinned ?? false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const cal = c.story.calendar;
  const save = () => {
    if (!title.trim() && !body.trim()) return done();
    if (note) act("updateNote", { id: note.id, title: title.trim(), body, category, pinned }, "Note saved.");
    else act("addNote", { title: title.trim(), body, category, pinned, session: c.story.session, gameDate: formatWorld(cal.minutes, cal.kind, cal.custom) }, "Note added.");
    done();
  };
  return (
    <div className={`note-card editing ${category}`}>
      <input className="search" placeholder="Title" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} aria-label="Note title" autoFocus={!note} />
      <textarea className="story-text" rows={6} placeholder="What happened, who you met, what to remember…" value={body} onChange={(e) => setBody(e.target.value)} aria-label="Note" />
      <div className="note-filters" role="radiogroup" aria-label="Colour">
        {NOTE_COLORS.map((x) => (
          <button key={x.id} className={`chip swatch ${x.id}`} role="radio" aria-label={x.label} aria-checked={category === x.id} onClick={() => setCategory(x.id)} />
        ))}
        <label className="pin">
          <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} /> Pin
        </label>
      </div>
      {note && (
        <p className="note">
          Written {formatReal(note.createdAt)}
          {note.session !== undefined ? `, session ${note.session}` : ""}
          {note.gameDate ? `; in the world ${note.gameDate}` : ""}.
        </p>
      )}
      <div className="big-actions">
        {note &&
          (confirmDelete ? (
            <button
              className="big damage"
              onClick={() => {
                act("removeNote", { id: note.id }, "Note deleted.");
                done();
              }}
            >
              Delete it
            </button>
          ) : (
            <button className="big" onClick={() => setConfirmDelete(true)}>
              Delete
            </button>
          ))}
        <button className="big" onClick={done}>
          Cancel
        </button>
        <button className="big primary" onClick={save}>
          Save
        </button>
      </div>
    </div>
  );
}

/** The date and time in the world, moved on by hand, by rests, or set directly. */
function WorldTime({ c, act }: { c: Character; act: Act }) {
  const cal = c.story.calendar;
  const [setting, setSetting] = useState(false);
  const [choosing, setChoosing] = useState(false);
  const d = toDate(cal.minutes, cal.kind, cal.custom);
  const perDay = hoursPerDay(cal.kind, cal.custom) * 60;
  const add = (m: number, label: string) => act("setCalendar", { add: m }, `${label}: ${formatWorld(Math.max(0, cal.minutes + m), cal.kind, cal.custom)}.`);
  return (
    <section className="world-time">
      <h2>In the world</h2>
      <div className="world-date">
        <div className="world-day">
          {d.weekday}, {d.day} {d.monthName}
        </div>
        <div className="world-year">
          Year {d.year}
          {d.era ? ` ${d.era}` : ""} · {String(d.hour).padStart(2, "0")}:{String(d.minute).padStart(2, "0")}
        </div>
        {d.season && <div className="row-sub">{d.season}</div>}
        <div className="row-sub">{calendarName(cal.kind, cal.custom)}</div>
      </div>
      <div className="time-buttons">
        <button className="chip" onClick={() => add(-60, "An hour back")}>
          −1 h
        </button>
        <button className="chip" onClick={() => add(10, "10 minutes")}>
          +10 min
        </button>
        <button className="chip" onClick={() => add(60, "An hour")}>
          +1 h
        </button>
        <button className="chip" onClick={() => add(480, "8 hours")}>
          +8 h
        </button>
        <button className="chip" onClick={() => add(perDay, "A day")}>
          +1 day
        </button>
      </div>
      <label className="row">
        <div className="row-main">
          <div className="row-title">Rests move the clock</div>
          <div className="row-sub">A short rest adds 1 hour, a long rest 8, and “time passes” what you set</div>
        </div>
        <input type="checkbox" checked={cal.followRests} onChange={(e) => act("setCalendar", { followRests: e.target.checked }, e.target.checked ? "Rests move the clock." : "The clock moves only by hand.")} />
      </label>
      <div className="big-actions">
        <button className="big" onClick={() => setSetting(!setting)}>
          Set the date
        </button>
        <button className="big" onClick={() => setChoosing(!choosing)}>
          Calendar
        </button>
      </div>
      {setting && <SetDate c={c} act={act} done={() => setSetting(false)} />}
      {choosing && <ChooseCalendar c={c} act={act} done={() => setChoosing(false)} />}
    </section>
  );
}

function SetDate({ c, act, done }: { c: Character; act: Act; done: () => void }) {
  const cal = c.story.calendar;
  const now = toDate(cal.minutes, cal.kind, cal.custom);
  const [v, setV] = useState({ year: now.year, month: now.month, day: now.day, hour: now.hour, minute: now.minute });
  const months = monthsOf(cal.kind, cal.custom);
  const hours = hoursPerDay(cal.kind, cal.custom);
  return (
    <div className="group set-date">
      <NumberStep label="Year" value={v.year} min={1} max={99999} onChange={(n) => setV({ ...v, year: n })} />
      <div className="row">
        <div className="row-main row-title">Month</div>
        <select className="search" value={v.month} onChange={(e) => setV({ ...v, month: Number(e.target.value) })} aria-label="Month" style={{ maxWidth: 200 }}>
          {months.map((m, i) => (
            <option key={i} value={i}>
              {m.name}
            </option>
          ))}
        </select>
      </div>
      <NumberStep label="Day" value={v.day} min={1} max={months[v.month]?.days ?? 31} onChange={(n) => setV({ ...v, day: n })} />
      <NumberStep label="Hour" value={v.hour} min={0} max={hours - 1} onChange={(n) => setV({ ...v, hour: n })} />
      <NumberStep label="Minute" value={v.minute} min={0} max={59} onChange={(n) => setV({ ...v, minute: n })} />
      <div className="big-actions">
        <button
          className="big primary"
          onClick={() => {
            const m = fromDate(v, cal.kind, cal.custom);
            act("setCalendar", { minutes: m }, `Now ${formatWorld(m, cal.kind, cal.custom)}.`);
            done();
          }}
        >
          Set
        </button>
      </div>
    </div>
  );
}

function ChooseCalendar({ c, act, done }: { c: Character; act: Act; done: () => void }) {
  const cal = c.story.calendar;
  const [kind, setKind] = useState<CalendarKind>(cal.kind);
  const [custom, setCustom] = useState<CalendarDef>(
    cal.custom ?? { name: "", months: Array.from({ length: 12 }, (_, i) => ({ name: `Month ${i + 1}`, days: 30 })), weekdays: ["Day 1", "Day 2", "Day 3", "Day 4", "Day 5", "Day 6", "Day 7"], hoursPerDay: 24 },
  );
  const [monthsText, setMonthsText] = useState(custom.months.map((m) => `${m.name}, ${m.days}`).join("\n"));
  const [weekText, setWeekText] = useState(custom.weekdays.join(", "));
  useEffect(() => {
    const months = monthsText
      .split("\n")
      .map((l) => /^(.+?)[,;:]\s*(\d+)\s*$/.exec(l.trim()))
      .filter((m): m is RegExpExecArray => !!m)
      .map((m) => ({ name: m[1]!.trim().slice(0, 40), days: Math.max(1, Math.min(400, Number(m[2]))) }));
    const weekdays = weekText
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean)
      .slice(0, 20);
    setCustom((cur) => ({ ...cur, ...(months.length ? { months } : {}), ...(weekdays.length ? { weekdays } : {}) }));
  }, [monthsText, weekText]);
  const apply = () => {
    // Keep the same moment when the calendar changes shape; Mithiologio starts where the table's Fantasy Calendar is.
    const start = kind === "mithiologio" && cal.kind !== "mithiologio" ? fromDate(MITHIOLOGIO.start, "mithiologio") : undefined;
    const today = new Date();
    const normalStart = kind === "normal" && cal.kind !== "normal" ? fromDate({ year: today.getFullYear(), month: today.getMonth(), day: today.getDate(), hour: 12, minute: 0 }, "normal") : undefined;
    act(
      "setCalendar",
      { kind, ...(kind === "custom" ? { custom: { ...custom, name: custom.name.trim() || "Custom calendar" } } : {}), ...(start !== undefined ? { minutes: start } : normalStart !== undefined ? { minutes: normalStart } : {}) },
      `Calendar: ${calendarName(kind, custom)}.`,
    );
    done();
  };
  return (
    <div className="choose-calendar">
      <div className="segmented small three" role="radiogroup" aria-label="Calendar">
        <button role="radio" aria-checked={kind === "normal"} onClick={() => setKind("normal")}>
          Normal
        </button>
        <button role="radio" aria-checked={kind === "mithiologio"} onClick={() => setKind("mithiologio")}>
          Μηθειολόγιο
        </button>
        <button role="radio" aria-checked={kind === "custom"} onClick={() => setKind("custom")}>
          Custom
        </button>
      </div>
      {kind === "normal" && <p className="note">Twelve months and a seven-day week, like ours. Starts from today's date.</p>}
      {kind === "mithiologio" && (
        <p className="note">
          The table's calendar: 16 months of 30 days, a seven-day week (Πέρια to Σόλωνα), five seasons, years “Μετά Σχίσματος”. Starts at 25 Δανάη 521, 20:30, where{" "}
          <a href={MITHIOLOGIO_URL} target="_blank" rel="noreferrer">
            the Fantasy Calendar
          </a>{" "}
          stands; set the date if it has moved on.
        </p>
      )}
      {kind === "custom" && (
        <>
          <input className="search" placeholder="Calendar name" value={custom.name} maxLength={60} onChange={(e) => setCustom({ ...custom, name: e.target.value })} aria-label="Calendar name" />
          <label className="story-field">
            <span className="row-title">Months</span>
            <span className="row-sub">One per line: name, days</span>
            <textarea className="story-text" rows={6} value={monthsText} onChange={(e) => setMonthsText(e.target.value)} aria-label="Months" />
          </label>
          <label className="story-field">
            <span className="row-title">Days of the week</span>
            <span className="row-sub">Separated by commas</span>
            <input className="search" value={weekText} onChange={(e) => setWeekText(e.target.value)} aria-label="Days of the week" />
          </label>
          <div className="group">
            <NumberStep label="Hours in a day" value={custom.hoursPerDay} min={1} max={100} onChange={(n) => setCustom({ ...custom, hoursPerDay: n })} />
          </div>
          <input className="search" placeholder="Era after the year (optional)" value={custom.era ?? ""} maxLength={60} onChange={(e) => {
              const { era: _old, ...rest } = custom;
              setCustom(e.target.value ? { ...rest, era: e.target.value } : rest);
            }} aria-label="Era" />
          <p className="note">
            {custom.months.length} months, {custom.months.reduce((t, m) => t + m.days, 0)} days a year, {custom.weekdays.length}-day week.
          </p>
        </>
      )}
      <div className="big-actions">
        <button className="big primary" onClick={apply}>
          Use it
        </button>
      </div>
    </div>
  );
}
