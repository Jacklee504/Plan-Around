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
  it("maps a Monday date to itself as the Calendar start", () => {
    // 2026-08-17 is a Monday.
    expect(getCalendarWeekStart(new Date(2026, 7, 17))).toBe("2026-08-17");
  });

  it("maps a Sunday to the preceding Monday as the Calendar start", () => {
    // 2026-08-16 is a Sunday, the last day of the week that started 2026-08-10.
    expect(getCalendarWeekStart(new Date(2026, 7, 16))).toBe("2026-08-10");
  });

  it("moves the visible week by exactly seven calendar days in each direction", () => {
    expect(addCalendarWeeks("2026-08-17", 1)).toBe("2026-08-24");
    expect(addCalendarWeeks("2026-08-17", -1)).toBe("2026-08-10");
  });

  it("maps Sunday and Monday of the same visible week to different Monday-based week keys where the boundary falls between them", () => {
    // Sunday 2026-08-16 still belongs to the Monday week that started 2026-08-10.
    // Monday 2026-08-17 starts a new Monday-based week.
    expect(getMondayWeekKeyForDateKey("2026-08-16")).toBe("2026-08-10");
    expect(getMondayWeekKeyForDateKey("2026-08-17")).toBe("2026-08-17");
  });

  it("returns all seven correct date keys for a Monday-first week", () => {
    const weekStart = "2026-08-17";
    const expected = [
      "2026-08-17",
      "2026-08-18",
      "2026-08-19",
      "2026-08-20",
      "2026-08-21",
      "2026-08-22",
      "2026-08-23",
    ];
    // [1, 2, 3, 4, 5, 6, 0] mirrors CALENDAR_DAYS's Monday-first display order.
    expect([1, 2, 3, 4, 5, 6, 0].map((day) => calendarDateForDay(weekStart, day))).toEqual(expected);
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

  it("moves by exactly seven calendar days across the late-March DST boundary", () => {
    // Ireland's clocks spring forward on 2026-03-29 (a Sunday).
    expect(addCalendarWeeks("2026-03-22", 1)).toBe("2026-03-29");
    // 2026-03-23 is the Monday of that same week; day 0 (Sunday) is its last day.
    expect(calendarDateForDay("2026-03-23", 0)).toBe("2026-03-29");
  });

  it("moves by exactly seven calendar days across the late-October DST boundary", () => {
    // Ireland's clocks fall back on 2026-10-25 (a Sunday).
    expect(addCalendarWeeks("2026-10-18", 1)).toBe("2026-10-25");
    // 2026-10-19 is the Monday of that same week; day 0 (Sunday) is its last day.
    expect(calendarDateForDay("2026-10-19", 0)).toBe("2026-10-25");
  });

  it("maps the calendar week start correctly on and around a DST changeover date", () => {
    // 2026-03-29 (Sunday) is the DST spring-forward date; its Calendar week started the preceding Monday.
    expect(getCalendarWeekStart(new Date(2026, 2, 29))).toBe("2026-03-23");
    // 2026-10-25 (Sunday) is the DST fall-back date; same relationship.
    expect(getCalendarWeekStart(new Date(2026, 9, 25))).toBe("2026-10-19");
  });

  it("keeps Monday-based week keys correct immediately after a DST changeover", () => {
    expect(getMondayWeekKeyForDate(new Date(2026, 2, 30))).toBe("2026-03-30");
    expect(getMondayWeekKeyForDate(new Date(2026, 9, 26))).toBe("2026-10-26");
  });
});
