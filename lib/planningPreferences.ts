import type { PlanningPreferences, PreferredAssignmentTime } from "@/types";

export const DEFAULT_PLANNING_PREFERENCES: PlanningPreferences = {
  assignmentStart: "08:00",
  assignmentEnd: "22:00",
  preferredSessionMinutes: 90,
  dailyAssignmentTargetMinutes: 180,
  preferredTimeOfDay: "none",
  enabledAssignmentDays: [0, 1, 2, 3, 4, 5, 6],
};

// The Calendar's own visible range, independent of any user preference - a
// assignment window can narrow inside this range but never widen past it.
const ABSOLUTE_START_MINUTES = 8 * 60;
const ABSOLUTE_END_MINUTES = 22 * 60;
const MIN_ASSIGNMENT_WINDOW_MINUTES = 60;
const VALID_SESSION_MINUTES = [60, 90, 120] as const;
const VALID_DAILY_TARGET_MINUTES = [120, 180, 240, 300] as const;
const VALID_TIME_OF_DAY: PreferredAssignmentTime[] = ["none", "morning", "afternoon", "evening"];
const legacyPreferencePrefix = String.fromCharCode(115, 116, 117, 100, 121);

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

function normalizeAssignmentWindow(rawStart: unknown, rawEnd: unknown): { assignmentStart: string; assignmentEnd: string } {
  const startMinutes = isValidTimeString(rawStart)
    ? Math.min(Math.max(minutesFromTime(rawStart), ABSOLUTE_START_MINUTES), ABSOLUTE_END_MINUTES)
    : ABSOLUTE_START_MINUTES;
  const endMinutes = isValidTimeString(rawEnd)
    ? Math.min(Math.max(minutesFromTime(rawEnd), ABSOLUTE_START_MINUTES), ABSOLUTE_END_MINUTES)
    : ABSOLUTE_END_MINUTES;

  if (endMinutes - startMinutes < MIN_ASSIGNMENT_WINDOW_MINUTES) {
    return { assignmentStart: DEFAULT_PLANNING_PREFERENCES.assignmentStart, assignmentEnd: DEFAULT_PLANNING_PREFERENCES.assignmentEnd };
  }

  return { assignmentStart: timeFromMinutes(startMinutes), assignmentEnd: timeFromMinutes(endMinutes) };
}

function normalizeEnabledAssignmentDays(value: unknown): number[] {
  const candidates = Array.isArray(value) ? value : [];
  const unique = Array.from(new Set(candidates.filter((day): day is number => Number.isInteger(day) && day >= 0 && day <= 6)));

  if (!unique.length) return [...DEFAULT_PLANNING_PREFERENCES.enabledAssignmentDays];

  return unique.sort((first, second) => first - second);
}

/**
 * Returns a valid PlanningPreferences object from any raw value, including
 * malformed, partial, legacy or manually edited localStorage JSON. Never
 * throws; falls back field by field rather than discarding the whole object.
 */
export function normalizePlanningPreferences(value: unknown): PlanningPreferences {
  const raw = (value && typeof value === "object" ? value : {}) as Partial<Record<keyof PlanningPreferences, unknown>> & Record<string, unknown>;
  const legacyValue = (suffix: string) => raw[`${legacyPreferencePrefix}${suffix}`];
  const { assignmentStart, assignmentEnd } = normalizeAssignmentWindow(
    raw.assignmentStart ?? legacyValue("Start"),
    raw.assignmentEnd ?? legacyValue("End"),
  );

  const preferredSessionMinutes = (VALID_SESSION_MINUTES as readonly number[]).includes(raw.preferredSessionMinutes as number)
    ? (raw.preferredSessionMinutes as PlanningPreferences["preferredSessionMinutes"])
    : DEFAULT_PLANNING_PREFERENCES.preferredSessionMinutes;

  const rawDailyTarget = raw.dailyAssignmentTargetMinutes ?? legacyValue("TargetMinutes");
  const dailyAssignmentTargetMinutes = (VALID_DAILY_TARGET_MINUTES as readonly number[]).includes(rawDailyTarget as number)
    ? (rawDailyTarget as PlanningPreferences["dailyAssignmentTargetMinutes"])
    : DEFAULT_PLANNING_PREFERENCES.dailyAssignmentTargetMinutes;

  const preferredTimeOfDay = VALID_TIME_OF_DAY.includes(raw.preferredTimeOfDay as PreferredAssignmentTime)
    ? (raw.preferredTimeOfDay as PreferredAssignmentTime)
    : DEFAULT_PLANNING_PREFERENCES.preferredTimeOfDay;

  return {
    assignmentStart,
    assignmentEnd,
    preferredSessionMinutes,
    dailyAssignmentTargetMinutes,
    preferredTimeOfDay,
    enabledAssignmentDays: normalizeEnabledAssignmentDays(raw.enabledAssignmentDays ?? legacyValue("Days")),
  };
}

/**
 * Compares a normalized preference object against the defaults semantically,
 * so enabled-day ordering never affects the result.
 */
export function arePlanningPreferencesDefault(preferences: PlanningPreferences): boolean {
  const normalized = normalizePlanningPreferences(preferences);
  const sortedDays = [...normalized.enabledAssignmentDays].sort((first, second) => first - second);
  const sortedDefaultDays = [...DEFAULT_PLANNING_PREFERENCES.enabledAssignmentDays].sort((first, second) => first - second);

  return normalized.assignmentStart === DEFAULT_PLANNING_PREFERENCES.assignmentStart
    && normalized.assignmentEnd === DEFAULT_PLANNING_PREFERENCES.assignmentEnd
    && normalized.preferredSessionMinutes === DEFAULT_PLANNING_PREFERENCES.preferredSessionMinutes
    && normalized.dailyAssignmentTargetMinutes === DEFAULT_PLANNING_PREFERENCES.dailyAssignmentTargetMinutes
    && normalized.preferredTimeOfDay === DEFAULT_PLANNING_PREFERENCES.preferredTimeOfDay
    && sortedDays.length === sortedDefaultDays.length
    && sortedDays.every((day, index) => day === sortedDefaultDays[index]);
}
