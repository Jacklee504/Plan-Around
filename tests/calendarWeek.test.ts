import { describe, expect, it } from "vitest";
import {
  addCalendarWeeks,
  calendarDateForDay,
  dateFromDateKey,
  getCalendarWeekStart,
  getMondayWeekKeyForDate,
  getMondayWeekKeyForDateKey,
  localDateKey,
} from "../lib/calendarWeek";

describe("calendarWeek", () => {
  it("maps a Monday date to the preceding Sunday Calendar start", () => {
    // 2026-08-17 is a Monday.
    expect(getCalendarWeekStart(new Date(2026, 7, 17))).toBe("2026-08-16");
  });

  it("maps a Sunday to itself as the Calendar start", () => {
    expect(getCalendarWeekStart(new Date(2026, 7, 16))).toBe("2026-08-16");
  });

  it("moves the visible week by exactly seven calendar days in each direction", () => {
    expect(addCalendarWeeks("2026-08-16", 1)).toBe("2026-08-23");
    expect(addCalendarWeeks("2026-08-16", -1)).toBe("2026-08-09");
  });

  it("maps Sunday and Monday of the same visible week to different Monday-based week keys where the boundary falls between them", () => {
    // Sunday 2026-08-16 still belongs to the Monday week that started 2026-08-10.
    // Monday 2026-08-17 starts a new Monday-based week.
    expect(getMondayWeekKeyForDateKey("2026-08-16")).toBe("2026-08-10");
    expect(getMondayWeekKeyForDateKey("2026-08-17")).toBe("2026-08-17");
  });

  it("returns all seven correct date keys for a Sunday-first week", () => {
    const weekStart = "2026-08-16";
    const expected = [
      "2026-08-16",
      "2026-08-17",
      "2026-08-18",
      "2026-08-19",
      "2026-08-20",
      "2026-08-21",
      "2026-08-22",
    ];
    expect([0, 1, 2, 3, 4, 5, 6].map((day) => calendarDateForDay(weekStart, day))).toEqual(expected);
  });

  it("parses YYYY-MM-DD into local date components without timezone-induced day shifts", () => {
    const parsed = dateFromDateKey("2026-01-01");
    expect(parsed.getFullYear()).toBe(2026);
    expect(parsed.getMonth()).toBe(0);
    expect(parsed.getDate()).toBe(1);
    expect(localDateKey(parsed)).toBe("2026-01-01");
  });

  it("keeps Monday-based week keys stable across a year boundary", () => {
    // 2025-12-29 is a Monday; the following Sunday is 2026-01-04.
    expect(getMondayWeekKeyForDate(new Date(2025, 11, 29))).toBe("2025-12-29");
    expect(getMondayWeekKeyForDateKey("2026-01-04")).toBe("2025-12-29");
  });
});
