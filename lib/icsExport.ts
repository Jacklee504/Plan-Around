import { addCalendarWeeks, calendarDateForDay, dateFromDateKey, getCalendarWeekStart, getMondayWeekKeyForDate } from "./calendarWeek";
import type { Commitment, DatedCommitment, StudyBlock, TimetableEntry } from "@/types";

const DEFAULT_WEEKS_AHEAD = 8;

function escapeIcsText(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

function pad(value: number) {
  return `${value}`.padStart(2, "0");
}

// Floating local time (no TZID/Z) - deliberately simple for a personal,
// single-device export rather than modelling timezones.
function icsDateTime(date: Date, time: string) {
  const [hours, minutes] = time.split(":").map(Number);
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}T${pad(hours)}${pad(minutes)}00`;
}

function icsTimestamp(date: Date) {
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`;
}

function buildEvent(uid: string, summary: string, date: Date, start: string, end: string, dtstamp: string) {
  return [
    "BEGIN:VEVENT",
    `UID:${uid}@planaround`,
    `DTSTAMP:${dtstamp}`,
    `DTSTART:${icsDateTime(date, start)}`,
    `DTEND:${icsDateTime(date, end)}`,
    `SUMMARY:${escapeIcsText(summary)}`,
    "END:VEVENT",
  ];
}

/** Mirrors the scheduler's own recurring-availability rule (lib/scheduler.ts#isTimetableEntryActive). */
function isTimetableEntryActiveOnDate(entry: TimetableEntry, date: Date) {
  if (entry.attendance === "skip-every-week") return false;
  return !entry.skippedWeeks.includes(getMondayWeekKeyForDate(date));
}

export type IcsExportInput = {
  studyBlocks: StudyBlock[];
  timetableEntries: TimetableEntry[];
  commitments: Commitment[];
  datedCommitments: DatedCommitment[];
};

export type IcsExportOptions = {
  now?: Date;
  /** How many weeks of recurring classes/commitments to expand into concrete events. */
  weeksAhead?: number;
};

/**
 * Builds a downloadable .ics document covering study sessions (already
 * concrete dates), one-off commitments (already concrete dates), and
 * recurring timetable entries/commitments expanded into concrete instances
 * across a bounded window - a calendar app has no concept of PlanAround's
 * own skip-this-week/skip-every-week attendance state, so that has to be
 * resolved into real dates (or omitted) at export time.
 */
export function buildStudyCalendarIcs(input: IcsExportInput, options: IcsExportOptions = {}): string {
  const now = options.now ?? new Date();
  const weeksAhead = options.weeksAhead ?? DEFAULT_WEEKS_AHEAD;
  const dtstamp = icsTimestamp(now);
  const lines: string[] = [];

  input.studyBlocks.forEach((block) => {
    lines.push(...buildEvent(`study-${block.id}`, `Study: ${block.taskName}`, dateFromDateKey(block.date), block.start, block.end, dtstamp));
  });

  input.datedCommitments.forEach((commitment) => {
    lines.push(...buildEvent(`dated-${commitment.id}`, commitment.label, dateFromDateKey(commitment.date), commitment.start, commitment.end, dtstamp));
  });

  const firstWeekStart = getCalendarWeekStart(now);
  for (let week = 0; week < weeksAhead; week += 1) {
    const weekStartKey = addCalendarWeeks(firstWeekStart, week);

    input.timetableEntries.forEach((entry) => {
      const date = dateFromDateKey(calendarDateForDay(weekStartKey, entry.dayOfWeek));
      if (!isTimetableEntryActiveOnDate(entry, date)) return;
      lines.push(...buildEvent(`timetable-${entry.id}-${week}`, `${entry.moduleCode || entry.moduleName} (${entry.sessionType})`, date, entry.start, entry.end, dtstamp));
    });

    input.commitments.forEach((commitment) => {
      const date = dateFromDateKey(calendarDateForDay(weekStartKey, commitment.dayOfWeek));
      lines.push(...buildEvent(`commitment-${commitment.id}-${week}`, commitment.label, date, commitment.start, commitment.end, dtstamp));
    });
  }

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//PlanAround//Study Calendar Export//EN",
    "CALSCALE:GREGORIAN",
    ...lines,
    "END:VCALENDAR",
  ].join("\r\n");
}
