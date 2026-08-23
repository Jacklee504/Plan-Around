import { describe, expect, it } from "vitest";
import { buildAssignmentCalendarIcs } from "../lib/icsExport";
import { getMondayWeekKeyForDate } from "../lib/calendarWeek";
import type { Commitment, DatedCommitment, AssignmentSession, TimetableEntry } from "../types";

// A Wednesday, so dayOfWeek expansion below is unambiguous.
const NOW = new Date(2026, 7, 19, 9, 0, 0);

function timetableEntry(overrides: Partial<TimetableEntry> = {}): TimetableEntry {
  return {
    id: "entry-1",
    moduleCode: "CS101",
    moduleName: "Databases",
    dayOfWeek: 3,
    start: "10:00",
    end: "11:00",
    sessionType: "lecture",
    attendance: "attending",
    skippedWeeks: [],
    ...overrides,
  };
}

describe("buildAssignmentCalendarIcs", () => {
  it("wraps output in a VCALENDAR with a VEVENT per assignment block and dated commitment", () => {
    const block: AssignmentSession = { id: "b1", assignmentId: "a1", date: "2026-08-20", start: "09:00", end: "10:30", taskId: "t1", taskName: "Draft report" };
    const dated: DatedCommitment = { id: "d1", label: "Dentist", date: "2026-08-21", start: "14:00", end: "15:00", category: "other" };

    const ics = buildAssignmentCalendarIcs({ assignmentSessions: [block], timetableEntries: [], commitments: [], datedCommitments: [dated] }, { now: NOW, weeksAhead: 0 });

    expect(ics.startsWith("BEGIN:VCALENDAR")).toBe(true);
    expect(ics.trim().endsWith("END:VCALENDAR")).toBe(true);
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2);
    expect(ics).toContain("SUMMARY:Assignment: Draft report");
    expect(ics).toContain("DTSTART:20260820T090000");
    expect(ics).toContain("DTEND:20260820T103000");
    expect(ics).toContain("SUMMARY:Dentist");
    expect(ics).toContain("DTSTART:20260821T140000");
  });

  it("expands a recurring timetable entry across the requested number of weeks", () => {
    const ics = buildAssignmentCalendarIcs({ assignmentSessions: [], timetableEntries: [timetableEntry()], commitments: [], datedCommitments: [] }, { now: NOW, weeksAhead: 3 });

    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(3);
    expect(ics).toContain("SUMMARY:CS101 (lecture)");
  });

  it("omits a timetable entry marked skip-every-week", () => {
    const ics = buildAssignmentCalendarIcs({ assignmentSessions: [], timetableEntries: [timetableEntry({ attendance: "skip-every-week" })], commitments: [], datedCommitments: [] }, { now: NOW, weeksAhead: 3 });

    expect(ics.match(/BEGIN:VEVENT/g)).toBeNull();
  });

  it("omits a timetable entry only for its specifically skipped week", () => {
    const firstOccurrenceDate = new Date(NOW);
    firstOccurrenceDate.setDate(firstOccurrenceDate.getDate() + (3 - firstOccurrenceDate.getDay()));
    const skippedWeekKey = getMondayWeekKeyForDate(firstOccurrenceDate);

    const ics = buildAssignmentCalendarIcs({ assignmentSessions: [], timetableEntries: [timetableEntry({ skippedWeeks: [skippedWeekKey] })], commitments: [], datedCommitments: [] }, { now: NOW, weeksAhead: 2 });

    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(1);
  });

  it("escapes ICS special characters in event text", () => {
    const block: AssignmentSession = { id: "b1", assignmentId: "a1", date: "2026-08-20", start: "09:00", end: "10:00", taskId: "t1", taskName: "Draft; report, notes" };

    const ics = buildAssignmentCalendarIcs({ assignmentSessions: [block], timetableEntries: [], commitments: [], datedCommitments: [] }, { now: NOW, weeksAhead: 0 });

    expect(ics).toContain("SUMMARY:Assignment: Draft\\; report\\, notes");
  });

  it("expands a recurring personal commitment the same way as a timetable entry", () => {
    const commitment: Commitment = { id: "c1", label: "Gym", dayOfWeek: 3, start: "18:00", end: "19:00", category: "gym" };

    const ics = buildAssignmentCalendarIcs({ assignmentSessions: [], timetableEntries: [], commitments: [commitment], datedCommitments: [] }, { now: NOW, weeksAhead: 2 });

    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2);
    expect(ics).toContain("SUMMARY:Gym");
  });
});
