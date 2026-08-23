import { describe, expect, it } from "vitest";
import {
  DEFAULT_PLANNING_PREFERENCES,
  arePlanningPreferencesDefault,
  normalizePlanningPreferences,
} from "../lib/planningPreferences";

describe("normalizePlanningPreferences", () => {
  it("normalizes a missing value to defaults", () => {
    expect(normalizePlanningPreferences(undefined)).toEqual(DEFAULT_PLANNING_PREFERENCES);
    expect(normalizePlanningPreferences(null)).toEqual(DEFAULT_PLANNING_PREFERENCES);
  });

  it("fills missing fields of a partial object with defaults", () => {
    const result = normalizePlanningPreferences({ preferredSessionMinutes: 60 });

    expect(result).toEqual({ ...DEFAULT_PLANNING_PREFERENCES, preferredSessionMinutes: 60 });
  });

  it("falls back to 90 for an invalid preferred session length", () => {
    expect(normalizePlanningPreferences({ preferredSessionMinutes: 45 }).preferredSessionMinutes).toBe(90);
    expect(normalizePlanningPreferences({ preferredSessionMinutes: "90" }).preferredSessionMinutes).toBe(90);
  });

  it("falls back to 180 for an invalid daily target", () => {
    expect(normalizePlanningPreferences({ dailyAssignmentTargetMinutes: 999 }).dailyAssignmentTargetMinutes).toBe(180);
  });

  it("falls back to none for an invalid preferred time of day", () => {
    expect(normalizePlanningPreferences({ preferredTimeOfDay: "night" }).preferredTimeOfDay).toBe("none");
  });

  it("removes duplicate and invalid enabled assignment days", () => {
    const result = normalizePlanningPreferences({ enabledAssignmentDays: [1, 1, 3, 3, 9, -1, "monday"] });

    expect(result.enabledAssignmentDays).toEqual([1, 3]);
  });

  it("sorts enabled assignment days numerically", () => {
    const result = normalizePlanningPreferences({ enabledAssignmentDays: [5, 0, 3] });

    expect(result.enabledAssignmentDays).toEqual([0, 3, 5]);
  });

  it("falls back to all seven days when enabled days is empty or invalid", () => {
    expect(normalizePlanningPreferences({ enabledAssignmentDays: [] }).enabledAssignmentDays).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(normalizePlanningPreferences({ enabledAssignmentDays: "not-an-array" }).enabledAssignmentDays).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it("repairs an invalid assignment window to a valid window of at least 60 minutes", () => {
    expect(normalizePlanningPreferences({ assignmentStart: "23:00", assignmentEnd: "23:30" })).toMatchObject({ assignmentStart: "08:00", assignmentEnd: "22:00" });
    expect(normalizePlanningPreferences({ assignmentStart: "not-a-time" })).toMatchObject({ assignmentStart: "08:00" });
    expect(normalizePlanningPreferences({ assignmentEnd: "not-a-time" })).toMatchObject({ assignmentEnd: "22:00" });
    expect(normalizePlanningPreferences({ assignmentStart: "06:00", assignmentEnd: "23:00" })).toMatchObject({ assignmentStart: "08:00", assignmentEnd: "22:00" });
    expect(normalizePlanningPreferences({ assignmentStart: "10:00", assignmentEnd: "18:00" })).toMatchObject({ assignmentStart: "10:00", assignmentEnd: "18:00" });
  });

  it("does not throw on malformed persisted data", () => {
    expect(() => normalizePlanningPreferences("garbage")).not.toThrow();
    expect(() => normalizePlanningPreferences(42)).not.toThrow();
    expect(() => normalizePlanningPreferences({ enabledAssignmentDays: null, assignmentStart: 5 })).not.toThrow();
  });

  it("never returns the same enabledAssignmentDays array reference as the default constant", () => {
    const result = normalizePlanningPreferences(undefined);

    expect(result.enabledAssignmentDays).not.toBe(DEFAULT_PLANNING_PREFERENCES.enabledAssignmentDays);
  });
});

describe("arePlanningPreferencesDefault", () => {
  it("treats the default object as default", () => {
    expect(arePlanningPreferencesDefault(DEFAULT_PLANNING_PREFERENCES)).toBe(true);
  });

  it("is insensitive to enabled-day ordering", () => {
    const reordered = { ...DEFAULT_PLANNING_PREFERENCES, enabledAssignmentDays: [6, 5, 4, 3, 2, 1, 0] };

    expect(arePlanningPreferencesDefault(reordered)).toBe(true);
  });

  it("treats any real change as non-default", () => {
    expect(arePlanningPreferencesDefault({ ...DEFAULT_PLANNING_PREFERENCES, preferredSessionMinutes: 60 })).toBe(false);
    expect(arePlanningPreferencesDefault({ ...DEFAULT_PLANNING_PREFERENCES, enabledAssignmentDays: [1, 2, 3, 4, 5] })).toBe(false);
  });
});
