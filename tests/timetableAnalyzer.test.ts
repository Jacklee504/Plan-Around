import { describe, expect, it } from "vitest";
import { applyDetectedTimetableSlots, type TimetableAnalysisEntry } from "../lib/timetableAnalysis";

function entry(day: TimetableAnalysisEntry["day"], start: string, end: string): TimetableAnalysisEntry {
  return {
    moduleCode: "CS401",
    moduleName: "Example module",
    day,
    start,
    end,
    sessionType: "lecture",
  };
}

describe("applyDetectedTimetableSlots", () => {
  it("corrects inflated model durations without shifting later labels", () => {
    const entries = [
      entry("Monday", "09:00", "10:00"),
      entry("Monday", "10:00", "11:00"),
      entry("Monday", "14:00", "16:00"),
      entry("Tuesday", "09:00", "11:00"),
      entry("Tuesday", "11:00", "13:00"),
    ];
    const slots = [
      { day: "Monday" as const, start: "09:00", end: "10:00" },
      { day: "Monday" as const, start: "10:00", end: "11:00" },
      { day: "Monday" as const, start: "14:00", end: "15:00" },
      { day: "Monday" as const, start: "15:00", end: "16:00" },
      { day: "Tuesday" as const, start: "09:00", end: "10:00" },
      { day: "Tuesday" as const, start: "11:00", end: "12:00" },
    ];

    expect(applyDetectedTimetableSlots(entries, slots).map(({ day, start, end }) => ({ day, start, end }))).toEqual([
      { day: "Monday", start: "09:00", end: "10:00" },
      { day: "Monday", start: "10:00", end: "11:00" },
      { day: "Monday", start: "14:00", end: "16:00" },
      { day: "Tuesday", start: "09:00", end: "10:00" },
      { day: "Tuesday", start: "11:00", end: "12:00" },
    ]);
  });
});
