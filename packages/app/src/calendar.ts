import type { CalendarDef, Story } from "@dnd/schema";

/**
 * Calendars for in-world time. Time is kept as minutes since the first
 * minute of year 1; each calendar turns that into a date.
 */
export interface WorldDate {
  year: number;
  /** 0-based month index. */
  month: number;
  monthName: string;
  /** 1-based day of the month. */
  day: number;
  weekday: string;
  hour: number;
  minute: number;
  season?: string;
  era?: string;
}

/**
 * Μηθειολόγιο (Mithiologio), the table's calendar on Fantasy Calendar:
 * 16 months of 30 days (480 a year), a 7-day week, 24 hours, the era
 * "Μετά Σχίσματος", and five seasons by day of the year.
 */
export const MITHIOLOGIO: CalendarDef & { seasons: { name: string; from: number; to: number }[]; firstWeekday: number; start: { year: number; month: number; day: number; hour: number; minute: number } } = {
  name: "Μηθειολόγιο",
  months: ["Ελένη", "Μήδεια", "Πηνελόπη", "Αράχνη", "Αριάδνη", "Αταλάντη", "Κλυταιμνήστρα", "Δανάη", "Δάφνη", "Ανδρομέδα", "Ευρυδίκη", "Περσεΐδα", "Κίρκη", "Καλυψώ", "Πανδώρα", "Ανδρονίκη"].map((name) => ({ name, days: 30 })),
  weekdays: ["Πέρια", "Χιλία", "Θάλια", "Κλέα", "Πιττάκα", "Βία", "Σόλωνα"],
  hoursPerDay: 24,
  era: "Μετά Σχίσματος",
  firstWeekday: 0,
  seasons: [
    { name: "Νυχτώνας (Χειμώνας)", from: 0, to: 90 },
    { name: "Τιτάνοιξη (Άνοιξη)", from: 90, to: 210 },
    { name: "Ουραναίρι (Καλοκαίρι)", from: 210, to: 330 },
    { name: "Υπνόπωρο (Φθινόπωρο)", from: 330, to: 450 },
    { name: "Νυχτώνας (Χειμώνας)", from: 450, to: 480 },
  ],
  // Where the table's Fantasy Calendar stood: 25 Δανάη 521, 20:30.
  start: { year: 521, month: 7, day: 25, hour: 20, minute: 30 },
};

export const MITHIOLOGIO_URL = "https://app.fantasy-calendar.com/calendars/f563b74af91ce319ce7e0c1404a512f6";

const GREGORIAN_MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const GREGORIAN_DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** Midnight of 1 January, year 1, in milliseconds (JavaScript maps years below 100 to the 1900s unless set this way). */
const YEAR_ONE = (() => {
  const d = new Date(0);
  d.setUTCFullYear(1, 0, 1);
  d.setUTCHours(0, 0, 0, 0);
  return d.getTime();
})();

export type CalendarKind = Story["calendar"]["kind"];

/** The calendar in use: a fixed-month one (Mithiologio, custom), or the normal one. */
function fixed(kind: CalendarKind, custom?: CalendarDef): (CalendarDef & { seasons?: { name: string; from: number; to: number }[]; firstWeekday?: number }) | undefined {
  if (kind === "mithiologio") return MITHIOLOGIO;
  if (kind === "custom" && custom) return custom;
  return undefined;
}

export function calendarName(kind: CalendarKind, custom?: CalendarDef): string {
  if (kind === "mithiologio") return MITHIOLOGIO.name;
  if (kind === "custom") return custom?.name || "Custom calendar";
  return "Normal calendar";
}

export function toDate(minutes: number, kind: CalendarKind, custom?: CalendarDef): WorldDate {
  const cal = fixed(kind, custom);
  if (!cal) {
    const d = new Date(YEAR_ONE + minutes * 60000);
    return { year: d.getUTCFullYear(), month: d.getUTCMonth(), monthName: GREGORIAN_MONTHS[d.getUTCMonth()]!, day: d.getUTCDate(), weekday: GREGORIAN_DAYS[d.getUTCDay()]!, hour: d.getUTCHours(), minute: d.getUTCMinutes() };
  }
  const perDay = cal.hoursPerDay * 60;
  const yearDays = cal.months.reduce((t, m) => t + m.days, 0);
  const dayIndex = Math.floor(minutes / perDay);
  const inDay = minutes - dayIndex * perDay;
  const year = Math.floor(dayIndex / yearDays) + 1;
  let rest = dayIndex - (year - 1) * yearDays;
  const yearDay = rest;
  let month = 0;
  while (month < cal.months.length - 1 && rest >= cal.months[month]!.days) rest -= cal.months[month++]!.days;
  const season = cal.seasons?.find((s) => yearDay >= s.from && yearDay < s.to)?.name;
  return {
    year,
    month,
    monthName: cal.months[month]!.name,
    day: rest + 1,
    weekday: cal.weekdays[(dayIndex + (cal.firstWeekday ?? 0)) % cal.weekdays.length]!,
    hour: Math.floor(inDay / 60),
    minute: inDay % 60,
    ...(season ? { season } : {}),
    ...(cal.era ? { era: cal.era } : {}),
  };
}

export function fromDate(d: { year: number; month: number; day: number; hour: number; minute: number }, kind: CalendarKind, custom?: CalendarDef): number {
  const cal = fixed(kind, custom);
  if (!cal) {
    const x = new Date(0);
    x.setUTCFullYear(d.year, d.month, d.day);
    x.setUTCHours(d.hour, d.minute, 0, 0);
    return Math.max(0, Math.round((x.getTime() - YEAR_ONE) / 60000));
  }
  const yearDays = cal.months.reduce((t, m) => t + m.days, 0);
  const days = (d.year - 1) * yearDays + cal.months.slice(0, d.month).reduce((t, m) => t + m.days, 0) + (d.day - 1);
  return Math.max(0, days * cal.hoursPerDay * 60 + d.hour * 60 + d.minute);
}

/** Months of the calendar, for pickers. */
export function monthsOf(kind: CalendarKind, custom?: CalendarDef): { name: string; days: number }[] {
  const cal = fixed(kind, custom);
  if (cal) return cal.months;
  return GREGORIAN_MONTHS.map((name, i) => ({ name, days: [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][i]! }));
}

export function hoursPerDay(kind: CalendarKind, custom?: CalendarDef): number {
  return fixed(kind, custom)?.hoursPerDay ?? 24;
}

const two = (n: number) => String(n).padStart(2, "0");

/** "Πιττάκα, 25 Δανάη 521 Μετά Σχίσματος, 20:30". */
export function formatWorld(minutes: number, kind: CalendarKind, custom?: CalendarDef): string {
  const d = toDate(minutes, kind, custom);
  return `${d.weekday}, ${d.day} ${d.monthName} ${d.year}${d.era ? ` ${d.era}` : ""}, ${two(d.hour)}:${two(d.minute)}`;
}

/** A real date and time, the way the phone shows it. */
export function formatReal(iso: string | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
