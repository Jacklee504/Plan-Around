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
    expect(normalizePlanningPreferences({ dailyStudyTargetMinutes: 999 }).dailyStudyTargetMinutes).toBe(180);
  });

  it("falls back to none for an invalid preferred time of day", () => {
    expect(normalizePlanningPreferences({ preferredTimeOfDay: "night" }).preferredTimeOfDay).toBe("none");
  });

  it("removes duplicate and invalid enabled study days", () => {
    const result = normalizePlanningPreferences({ enabledStudyDays: [1, 1, 3, 3, 9, -1, "monday"] });

    expect(result.enabledStudyDays).toEqual([1, 3]);
  });

  it("sorts enabled study days numerically", () => {
    const result = normalizePlanningPreferences({ enabledStudyDays: [5, 0, 3] });

    expect(result.enabledStudyDays).toEqual([0, 3, 5]);
  });

  it("falls back to all seven days when enabled days is empty or invalid", () => {
    expect(normalizePlanningPreferences({ enabledStudyDays: [] }).enabledStudyDays).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(normalizePlanningPreferences({ enabledStudyDays: "not-an-array" }).enabledStudyDays).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it("repairs an invalid study window to a valid window of at least 60 minutes", () => {
    expect(normalizePlanningPreferences({ studyStart: "23:00", studyEnd: "23:30" })).toMatchObject({ studyStart: "08:00", studyEnd: "22:00" });
    expect(normalizePlanningPreferences({ studyStart: "not-a-time" })).toMatchObject({ studyStart: "08:00" });
    expect(normalizePlanningPreferences({ studyEnd: "not-a-time" })).toMatchObject({ studyEnd: "22:00" });
    expect(normalizePlanningPreferences({ studyStart: "06:00", studyEnd: "23:00" })).toMatchObject({ studyStart: "08:00", studyEnd: "22:00" });
    expect(normalizePlanningPreferences({ studyStart: "10:00", studyEnd: "18:00" })).toMatchObject({ studyStart: "10:00", studyEnd: "18:00" });
  });

  it("does not throw on malformed persisted data", () => {
    expect(() => normalizePlanningPreferences("garbage")).not.toThrow();
    expect(() => normalizePlanningPreferences(42)).not.toThrow();
    expect(() => normalizePlanningPreferences({ enabledStudyDays: null, studyStart: 5 })).not.toThrow();
  });

  it("never returns the same enabledStudyDays array reference as the default constant", () => {
    const result = normalizePlanningPreferences(undefined);

    expect(result.enabledStudyDays).not.toBe(DEFAULT_PLANNING_PREFERENCES.enabledStudyDays);
  });
});

describe("arePlanningPreferencesDefault", () => {
  it("treats the default object as default", () => {
    expect(arePlanningPreferencesDefault(DEFAULT_PLANNING_PREFERENCES)).toBe(true);
  });

  it("is insensitive to enabled-day ordering", () => {
    const reordered = { ...DEFAULT_PLANNING_PREFERENCES, enabledStudyDays: [6, 5, 4, 3, 2, 1, 0] };

    expect(arePlanningPreferencesDefault(reordered)).toBe(true);
  });

  it("treats any real change as non-default", () => {
    expect(arePlanningPreferencesDefault({ ...DEFAULT_PLANNING_PREFERENCES, preferredSessionMinutes: 60 })).toBe(false);
    expect(arePlanningPreferencesDefault({ ...DEFAULT_PLANNING_PREFERENCES, enabledStudyDays: [1, 2, 3, 4, 5] })).toBe(false);
  });
});
