import { DEFAULT_PLANNING_PREFERENCES, normalizePlanningPreferences } from "./planningPreferences";
import type {
  Assignment,
  Commitment,
  DatedCommitment,
  PlanningPreferences,
  PreferredAssignmentTime,
  ScheduleResult,
  AssignmentSession,
  TimetableEntry,
  WorkloadBreakdown,
  WorkloadTask,
} from "@/types";

// Defaults only - the effective assignment window, preferred session length and
// daily target are resolved per call from (normalized) PlanningPreferences.
export const SCHEDULER_START_HOUR = 8;
export const SCHEDULER_END_HOUR = 22;
export const MIN_ASSIGNMENT_SESSION_MINUTES = 60;
export const PREFERRED_ASSIGNMENT_SESSION_MINUTES = 90;
export const MAX_ASSIGNMENT_SESSION_MINUTES = 120;
export const DAILY_ASSIGNMENT_TARGET_MINUTES = 180;

const MORNING_BOUNDARY_MINUTES = 12 * 60;
const AFTERNOON_BOUNDARY_MINUTES = 17 * 60;

type TimeBand = "morning" | "afternoon" | "evening";

const BAND_PRIORITY: Record<Exclude<PreferredAssignmentTime, "none">, TimeBand[]> = {
  morning: ["morning", "afternoon", "evening"],
  afternoon: ["afternoon", "evening", "morning"],
  evening: ["evening", "afternoon", "morning"],
};

type TimeRange = { start: number; end: number };

type SchedulerInput = {
  assignment: Assignment;
  workload: WorkloadBreakdown;
  timetableEntries: TimetableEntry[];
  commitments: Commitment[];
  /** Exact-date commitments block only their recorded date. */
  datedCommitments?: DatedCommitment[];
  /** Existing sessions for other assignments. Unlike commitments, these block one exact date only. */
  reservedBlocks?: AssignmentSession[];
  now?: Date;
  preferences?: PlanningPreferences;
};

type DatedAvailability = {
  date: Date;
  dateKey: string;
  ranges: TimeRange[];
};

type TaskRemaining = WorkloadTask & { remainingMinutes: number };

const DAY_MINUTES = 24 * 60;

function minutesFromTime(time: string) {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

function timeFromMinutes(minutes: number) {
  const hours = Math.floor(minutes / 60).toString().padStart(2, "0");
  const remainder = (minutes % 60).toString().padStart(2, "0");
  return `${hours}:${remainder}`;
}

export function hoursFromMinutes(minutes: number) {
  return Math.round((minutes / 60) * 10) / 10;
}

function dateKey(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dateFromKey(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function getWeekKey(date: Date) {
  const monday = startOfDay(date);
  const distanceFromMonday = (monday.getDay() + 6) % 7;
  monday.setDate(monday.getDate() - distanceFromMonday);
  return dateKey(monday);
}

function isTimetableEntryActive(entry: TimetableEntry, date: Date) {
  return entry.attendance !== "skip-every-week" && !entry.skippedWeeks.includes(getWeekKey(date));
}

function mergeRanges(ranges: TimeRange[]) {
  return ranges
    .filter((range) => range.end > range.start)
    .sort((first, second) => first.start - second.start)
    .reduce<TimeRange[]>((merged, range) => {
      const previous = merged.at(-1);
      if (previous && range.start <= previous.end) {
        previous.end = Math.max(previous.end, range.end);
      } else {
        merged.push({ ...range });
      }
      return merged;
    }, []);
}

function bandForRange(range: TimeRange): TimeBand {
  if (range.start < MORNING_BOUNDARY_MINUTES) return "morning";
  if (range.start < AFTERNOON_BOUNDARY_MINUTES) return "afternoon";
  return "evening";
}

/**
 * Splits a range at the fixed 12:00/17:00 band boundaries. This only changes
 * shape, not total minutes, so callers relying on summed range duration for
 * capacity are unaffected.
 */
function splitRangeAtBandBoundaries(range: TimeRange): TimeRange[] {
  const boundaries = [MORNING_BOUNDARY_MINUTES, AFTERNOON_BOUNDARY_MINUTES].filter(
    (boundary) => boundary > range.start && boundary < range.end,
  );
  const points = [range.start, ...boundaries, range.end];
  const segments: TimeRange[] = [];
  for (let index = 0; index < points.length - 1; index += 1) {
    segments.push({ start: points[index], end: points[index + 1] });
  }
  return segments;
}

/**
 * A preferred time of day is a soft within-day placement priority, not an
 * availability change: total minutes across all bands stays identical, only
 * the order the scheduler encounters them changes. "none" preserves the
 * existing chronological range shape exactly.
 */
function orderRangesByTimeOfDay(ranges: TimeRange[], preferredTimeOfDay: PreferredAssignmentTime): TimeRange[] {
  if (preferredTimeOfDay === "none") return ranges;

  const priority = BAND_PRIORITY[preferredTimeOfDay];
  return ranges
    .flatMap(splitRangeAtBandBoundaries)
    .map((range) => ({ range, band: bandForRange(range) }))
    .sort((first, second) => {
      const bandOrder = priority.indexOf(first.band) - priority.indexOf(second.band);
      return bandOrder !== 0 ? bandOrder : first.range.start - second.range.start;
    })
    .map((entry) => entry.range);
}

function availableRanges(
  date: Date,
  timetableEntries: TimetableEntry[],
  commitments: Commitment[],
  datedCommitments: DatedCommitment[],
  reservedBlocks: AssignmentSession[],
  windowStartMinutes: number,
  windowEndMinutes: number,
  enabledAssignmentDays: number[],
  preferredTimeOfDay: PreferredAssignmentTime,
) {
  // A disabled assignment day has zero capacity outright; recurring commitments
  // never need inspecting because the whole date is already unavailable.
  if (!enabledAssignmentDays.includes(date.getDay())) return [];

  const recurringRanges = [
    ...timetableEntries
      .filter((entry) => entry.dayOfWeek === date.getDay() && isTimetableEntryActive(entry, date))
      .map((entry) => ({ start: minutesFromTime(entry.start), end: minutesFromTime(entry.end) })),
    ...commitments
      .filter((commitment) => commitment.dayOfWeek === date.getDay())
      .map((commitment) => ({ start: minutesFromTime(commitment.start), end: minutesFromTime(commitment.end) })),
    ...datedCommitments
      .filter((commitment) => commitment.date === dateKey(date))
      .map((commitment) => ({ start: minutesFromTime(commitment.start), end: minutesFromTime(commitment.end) })),
    ...reservedBlocks
      .filter((block) => block.date === dateKey(date))
      .map((block) => ({ start: minutesFromTime(block.start), end: minutesFromTime(block.end) })),
  ].map((range) => ({
    start: Math.max(windowStartMinutes, range.start),
    end: Math.min(windowEndMinutes, range.end),
  }));

  const blocked = mergeRanges(recurringRanges);
  const freeRanges: TimeRange[] = [];
  let cursor = windowStartMinutes;

  blocked.forEach((range) => {
    if (range.start > cursor) freeRanges.push({ start: cursor, end: range.start });
    cursor = Math.max(cursor, range.end);
  });

  if (cursor < windowEndMinutes) freeRanges.push({ start: cursor, end: windowEndMinutes });

  // The minimum-session filter runs once, before band-splitting, so a
  // qualifying range's minutes always count toward capacity even if a split
  // produces a smaller sub-60-minute segment at a band boundary.
  const qualifyingRanges = freeRanges.filter((range) => range.end - range.start >= MIN_ASSIGNMENT_SESSION_MINUTES);
  return orderRangesByTimeOfDay(qualifyingRanges, preferredTimeOfDay);
}

function buildAvailability(
  start: Date,
  endExclusive: Date,
  timetableEntries: TimetableEntry[],
  commitments: Commitment[],
  datedCommitments: DatedCommitment[],
  reservedBlocks: AssignmentSession[],
  preferences: PlanningPreferences,
) {
  const windowStartMinutes = minutesFromTime(preferences.assignmentStart);
  const windowEndMinutes = minutesFromTime(preferences.assignmentEnd);
  const dates: DatedAvailability[] = [];
  for (let date = startOfDay(start); date < endExclusive; date = addDays(date, 1)) {
    dates.push({
      date,
      dateKey: dateKey(date),
      ranges: availableRanges(
        date,
        timetableEntries,
        commitments,
        datedCommitments,
        reservedBlocks,
        windowStartMinutes,
        windowEndMinutes,
        preferences.enabledAssignmentDays,
        preferences.preferredTimeOfDay,
      ),
    });
  }
  return dates;
}

function capacityMinutes(availability: DatedAvailability[]) {
  return availability.reduce((total, day) => total + day.ranges.reduce((dayTotal, range) => dayTotal + range.end - range.start, 0), 0);
}

function removePastAvailability(availability: DatedAvailability[], now: Date) {
  const currentDay = availability.find((day) => day.dateKey === dateKey(now));
  if (!currentDay) return;

  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const nextHalfHour = Math.ceil(currentMinutes / 30) * 30;
  currentDay.ranges = currentDay.ranges
    .map((range) => ({ ...range, start: Math.max(range.start, nextHalfHour) }))
    .filter((range) => range.end - range.start >= MIN_ASSIGNMENT_SESSION_MINUTES);
}

function nextTask(tasks: TaskRemaining[]) {
  return tasks.find((task) => task.remainingMinutes > 0) ?? null;
}

function canMergeBlocks(first: AssignmentSession, second: AssignmentSession) {
  return first.assignmentId === second.assignmentId
    && first.taskId === second.taskId
    && first.date === second.date
    && first.end === second.start
    && minutesFromTime(second.end) - minutesFromTime(first.start) <= MAX_ASSIGNMENT_SESSION_MINUTES;
}

function absorbShortBlocks(blocks: AssignmentSession[]) {
  const normalized: AssignmentSession[] = [];

  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index];
    const duration = minutesFromTime(block.end) - minutesFromTime(block.start);
    const previous = normalized.at(-1);

    if (duration === 30 && previous && canMergeBlocks(previous, block)) {
      previous.end = block.end;
      continue;
    }

    const next = blocks[index + 1];
    if (duration === 30 && next && canMergeBlocks(block, next)) {
      normalized.push({ ...next, start: block.start, id: block.id });
      index += 1;
      continue;
    }

    normalized.push({ ...block });
  }

  return normalized;
}

function fillAssignmentSessions(
  availability: DatedAvailability[],
  assignment: Assignment,
  workload: WorkloadBreakdown,
  preferredSessionMinutes: number,
  dailyAssignmentTargetMinutes: number,
) {
  const tasks = workload.taskHours.map((task) => ({ ...task, remainingMinutes: Math.round(task.recommendedHours * 60) }));
  const assignmentSessions: AssignmentSession[] = [];

  function fillDay(day: DatedAvailability, dailyLimit: number) {
    let dayMinutes = 0;

    for (const range of day.ranges) {
      let cursor = range.start;
      while (cursor < range.end && nextTask(tasks)) {
        const task = nextTask(tasks);
        if (!task) break;

        const rangeRemaining = range.end - cursor;
        const dailyRemaining = dailyLimit - dayMinutes;
        const isFinalHalfHour = task.remainingMinutes === 30;

        if (dailyRemaining < MIN_ASSIGNMENT_SESSION_MINUTES && !isFinalHalfHour) break;
        if (rangeRemaining < MIN_ASSIGNMENT_SESSION_MINUTES && !isFinalHalfHour) break;

        const preferredLength = Math.min(preferredSessionMinutes, MAX_ASSIGNMENT_SESSION_MINUTES, dailyRemaining, rangeRemaining);
        let duration = Math.min(preferredLength, task.remainingMinutes);

        // Keep the final half-hour attached to a normal session whenever the
        // current free period allows it. If it cannot be extended, leave a full
        // hour for a later eligible period instead of creating a 30-minute block.
        if (task.remainingMinutes - duration === 30) {
          const expandedDuration = Math.min(task.remainingMinutes, MAX_ASSIGNMENT_SESSION_MINUTES, dailyRemaining, rangeRemaining);
          duration = expandedDuration > duration ? expandedDuration : duration >= 90 ? duration - 30 : duration;
        }

        if (duration < MIN_ASSIGNMENT_SESSION_MINUTES && !isFinalHalfHour) break;
        if (duration === 0) break;

        assignmentSessions.push({
          id: `${assignment.id}-${day.dateKey}-${timeFromMinutes(cursor)}-${task.id}`,
          assignmentId: assignment.id,
          date: day.dateKey,
          start: timeFromMinutes(cursor),
          end: timeFromMinutes(cursor + duration),
          taskId: task.id,
          taskName: task.name,
        });

        task.remainingMinutes -= duration;
        dayMinutes += duration;
        cursor += duration;
      }
      range.start = cursor;
    }
  }

  // First distribute work using the daily target as a soft portion size. A second
  // pass only uses extra free time when the workload cannot otherwise fit before
  // the deadline - the target is a distribution preference, not a hard cap.
  availability.forEach((day) => fillDay(day, dailyAssignmentTargetMinutes));
  if (nextTask(tasks)) {
    availability.forEach((day) => fillDay(day, DAY_MINUTES));
  }

  return absorbShortBlocks(assignmentSessions);
}

function totalBlockMinutes(blocks: AssignmentSession[]) {
  return blocks.reduce((total, block) => total + minutesFromTime(block.end) - minutesFromTime(block.start), 0);
}

export function generateAssignmentSchedule({
  assignment,
  workload,
  timetableEntries,
  commitments,
  datedCommitments = [],
  reservedBlocks = [],
  now = new Date(),
  preferences,
}: SchedulerInput): ScheduleResult {
  // Normalizing at this boundary means a direct caller/test that omits
  // preferences (or passes the exact defaults) gets the same schedule as
  // before this feature existed.
  const resolvedPreferences = normalizePlanningPreferences(preferences ?? DEFAULT_PLANNING_PREFERENCES);
  const deadline = dateFromKey(assignment.deadline);
  const scheduleStart = startOfDay(now);
  const dayAfterDeadline = addDays(deadline, 1);
  // An incomplete block for this same assignment is stale planning output
  // about to be replaced, so it must not reserve time against its own
  // replacement. A completed block for this assignment is different: it is
  // finished history at a real, already-used time, so replanning must not
  // place a new session on top of it - besides being wrong, that would
  // regenerate the exact same date/time/task id as the preserved block.
  const occupiedBlocks = reservedBlocks.filter((block) => block.assignmentId !== assignment.id || block.completedAt);
  const fullAvailability = buildAvailability(scheduleStart, dayAfterDeadline, timetableEntries, commitments, datedCommitments, occupiedBlocks, resolvedPreferences);
  const bufferedAvailability = buildAvailability(scheduleStart, deadline, timetableEntries, commitments, datedCommitments, occupiedBlocks, resolvedPreferences);
  removePastAvailability(fullAvailability, now);
  removePastAvailability(bufferedAvailability, now);
  const requiredMinutes = Math.round(workload.usableHours * 60);
  const bufferedCapacity = capacityMinutes(bufferedAvailability);
  const deadlineCapacity = capacityMinutes(fullAvailability);
  const canKeepDeadlineBuffer = requiredMinutes <= bufferedCapacity;
  const canFitBeforeDeadline = requiredMinutes <= deadlineCapacity;
  const availability = canKeepDeadlineBuffer ? bufferedAvailability : fullAvailability;
  const assignmentSessions = fillAssignmentSessions(
    availability,
    assignment,
    workload,
    resolvedPreferences.preferredSessionMinutes,
    resolvedPreferences.dailyAssignmentTargetMinutes,
  );
  const scheduledMinutes = totalBlockMinutes(assignmentSessions);
  const unscheduledMinutes = Math.max(0, requiredMinutes - scheduledMinutes);

  return {
    assignmentSessions,
    status: canKeepDeadlineBuffer ? "on-track" : canFitBeforeDeadline ? "tight" : "not-enough-time",
    requiredHours: hoursFromMinutes(requiredMinutes),
    scheduledHours: hoursFromMinutes(scheduledMinutes),
    unscheduledHours: hoursFromMinutes(unscheduledMinutes),
    bufferedAvailableHours: hoursFromMinutes(bufferedCapacity),
    deadlineAvailableHours: hoursFromMinutes(deadlineCapacity),
    usesDeadlineBuffer: !canKeepDeadlineBuffer && canFitBeforeDeadline,
  };
}
