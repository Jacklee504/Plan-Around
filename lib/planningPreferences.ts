import type { PlanningPreferences, PreferredStudyTime } from "@/types";

export const DEFAULT_PLANNING_PREFERENCES: PlanningPreferences = {
  studyStart: "08:00",
  studyEnd: "22:00",
  preferredSessionMinutes: 90,
  dailyStudyTargetMinutes: 180,
  preferredTimeOfDay: "none",
  enabledStudyDays: [0, 1, 2, 3, 4, 5, 6],
};

// The Calendar's own visible range, independent of any user preference - a
// study window can narrow inside this range but never widen past it.
const ABSOLUTE_START_MINUTES = 8 * 60;
const ABSOLUTE_END_MINUTES = 22 * 60;
const MIN_STUDY_WINDOW_MINUTES = 60;
const VALID_SESSION_MINUTES = [60, 90, 120] as const;
const VALID_DAILY_TARGET_MINUTES = [120, 180, 240, 300] as const;
const VALID_TIME_OF_DAY: PreferredStudyTime[] = ["none", "morning", "afternoon", "evening"];

function isValidTimeString(value: unknown): value is string {
  return typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function minutesFromTime(time: string) {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

function timeFromMinutes(minutes: number) {
  const hours = Math.floor(minutes / 60).toString().padStart(2, "0");
  const remainder = (minutes % 60).toString().padStart(2, "0");
  return `${hours}:${remainder}`;
}

function normalizeStudyWindow(rawStart: unknown, rawEnd: unknown): { studyStart: string; studyEnd: string } {
  const startMinutes = isValidTimeString(rawStart)
    ? Math.min(Math.max(minutesFromTime(rawStart), ABSOLUTE_START_MINUTES), ABSOLUTE_END_MINUTES)
    : ABSOLUTE_START_MINUTES;
  const endMinutes = isValidTimeString(rawEnd)
    ? Math.min(Math.max(minutesFromTime(rawEnd), ABSOLUTE_START_MINUTES), ABSOLUTE_END_MINUTES)
    : ABSOLUTE_END_MINUTES;

  if (endMinutes - startMinutes < MIN_STUDY_WINDOW_MINUTES) {
    return { studyStart: DEFAULT_PLANNING_PREFERENCES.studyStart, studyEnd: DEFAULT_PLANNING_PREFERENCES.studyEnd };
  }

  return { studyStart: timeFromMinutes(startMinutes), studyEnd: timeFromMinutes(endMinutes) };
}

function normalizeEnabledStudyDays(value: unknown): number[] {
  const candidates = Array.isArray(value) ? value : [];
  const unique = Array.from(new Set(candidates.filter((day): day is number => Number.isInteger(day) && day >= 0 && day <= 6)));

  if (!unique.length) return [...DEFAULT_PLANNING_PREFERENCES.enabledStudyDays];

  return unique.sort((first, second) => first - second);
}

/**
 * Returns a valid PlanningPreferences object from any raw value, including
 * malformed, partial, legacy or manually edited localStorage JSON. Never
 * throws; falls back field by field rather than discarding the whole object.
 */
export function normalizePlanningPreferences(value: unknown): PlanningPreferences {
  const raw = (value && typeof value === "object" ? value : {}) as Partial<Record<keyof PlanningPreferences, unknown>>;
  const { studyStart, studyEnd } = normalizeStudyWindow(raw.studyStart, raw.studyEnd);

  const preferredSessionMinutes = (VALID_SESSION_MINUTES as readonly number[]).includes(raw.preferredSessionMinutes as number)
    ? (raw.preferredSessionMinutes as PlanningPreferences["preferredSessionMinutes"])
    : DEFAULT_PLANNING_PREFERENCES.preferredSessionMinutes;

  const dailyStudyTargetMinutes = (VALID_DAILY_TARGET_MINUTES as readonly number[]).includes(raw.dailyStudyTargetMinutes as number)
    ? (raw.dailyStudyTargetMinutes as PlanningPreferences["dailyStudyTargetMinutes"])
    : DEFAULT_PLANNING_PREFERENCES.dailyStudyTargetMinutes;

  const preferredTimeOfDay = VALID_TIME_OF_DAY.includes(raw.preferredTimeOfDay as PreferredStudyTime)
    ? (raw.preferredTimeOfDay as PreferredStudyTime)
    : DEFAULT_PLANNING_PREFERENCES.preferredTimeOfDay;

  return {
    studyStart,
    studyEnd,
    preferredSessionMinutes,
    dailyStudyTargetMinutes,
    preferredTimeOfDay,
    enabledStudyDays: normalizeEnabledStudyDays(raw.enabledStudyDays),
  };
}

/**
 * Compares a normalized preference object against the defaults semantically,
 * so enabled-day ordering never affects the result.
 */
export function arePlanningPreferencesDefault(preferences: PlanningPreferences): boolean {
  const normalized = normalizePlanningPreferences(preferences);
  const sortedDays = [...normalized.enabledStudyDays].sort((first, second) => first - second);
  const sortedDefaultDays = [...DEFAULT_PLANNING_PREFERENCES.enabledStudyDays].sort((first, second) => first - second);

  return normalized.studyStart === DEFAULT_PLANNING_PREFERENCES.studyStart
    && normalized.studyEnd === DEFAULT_PLANNING_PREFERENCES.studyEnd
    && normalized.preferredSessionMinutes === DEFAULT_PLANNING_PREFERENCES.preferredSessionMinutes
    && normalized.dailyStudyTargetMinutes === DEFAULT_PLANNING_PREFERENCES.dailyStudyTargetMinutes
    && normalized.preferredTimeOfDay === DEFAULT_PLANNING_PREFERENCES.preferredTimeOfDay
    && sortedDays.length === sortedDefaultDays.length
    && sortedDays.every((day, index) => day === sortedDefaultDays[index]);
}
