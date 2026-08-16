import type {
  Assignment,
  Commitment,
  ScheduleResult,
  StudyBlock,
  TimetableEntry,
  WorkloadBreakdown,
  WorkloadTask,
} from "@/types";

export const SCHEDULER_START_HOUR = 8;
export const SCHEDULER_END_HOUR = 22;
export const MIN_STUDY_SESSION_MINUTES = 60;
export const PREFERRED_STUDY_SESSION_MINUTES = 90;
export const MAX_STUDY_SESSION_MINUTES = 120;
export const DAILY_ASSIGNMENT_TARGET_MINUTES = 180;

type TimeRange = { start: number; end: number };

type SchedulerInput = {
  assignment: Assignment;
  workload: WorkloadBreakdown;
  timetableEntries: TimetableEntry[];
  commitments: Commitment[];
  now?: Date;
};

type DatedAvailability = {
  date: Date;
  dateKey: string;
  ranges: TimeRange[];
};

type TaskRemaining = WorkloadTask & { remainingMinutes: number };

const DAY_MINUTES = 24 * 60;
const SCHEDULER_START_MINUTES = SCHEDULER_START_HOUR * 60;
const SCHEDULER_END_MINUTES = SCHEDULER_END_HOUR * 60;

function minutesFromTime(time: string) {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

function timeFromMinutes(minutes: number) {
  const hours = Math.floor(minutes / 60).toString().padStart(2, "0");
  const remainder = (minutes % 60).toString().padStart(2, "0");
  return `${hours}:${remainder}`;
}

function hoursFromMinutes(minutes: number) {
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
  return monday.toISOString().slice(0, 10);
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

function availableRanges(date: Date, timetableEntries: TimetableEntry[], commitments: Commitment[]) {
  const recurringRanges = [
    ...timetableEntries
      .filter((entry) => entry.dayOfWeek === date.getDay() && isTimetableEntryActive(entry, date))
      .map((entry) => ({ start: minutesFromTime(entry.start), end: minutesFromTime(entry.end) })),
    ...commitments
      .filter((commitment) => commitment.dayOfWeek === date.getDay())
      .map((commitment) => ({ start: minutesFromTime(commitment.start), end: minutesFromTime(commitment.end) })),
  ].map((range) => ({
    start: Math.max(SCHEDULER_START_MINUTES, range.start),
    end: Math.min(SCHEDULER_END_MINUTES, range.end),
  }));

  const blocked = mergeRanges(recurringRanges);
  const freeRanges: TimeRange[] = [];
  let cursor = SCHEDULER_START_MINUTES;

  blocked.forEach((range) => {
    if (range.start > cursor) freeRanges.push({ start: cursor, end: range.start });
    cursor = Math.max(cursor, range.end);
  });

  if (cursor < SCHEDULER_END_MINUTES) freeRanges.push({ start: cursor, end: SCHEDULER_END_MINUTES });
  return freeRanges.filter((range) => range.end - range.start >= MIN_STUDY_SESSION_MINUTES);
}

function buildAvailability(start: Date, endExclusive: Date, timetableEntries: TimetableEntry[], commitments: Commitment[]) {
  const dates: DatedAvailability[] = [];
  for (let date = startOfDay(start); date < endExclusive; date = addDays(date, 1)) {
    dates.push({ date, dateKey: dateKey(date), ranges: availableRanges(date, timetableEntries, commitments) });
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
    .filter((range) => range.end - range.start >= MIN_STUDY_SESSION_MINUTES);
}

function nextTask(tasks: TaskRemaining[]) {
  return tasks.find((task) => task.remainingMinutes > 0) ?? null;
}

function canMergeBlocks(first: StudyBlock, second: StudyBlock) {
  return first.assignmentId === second.assignmentId
    && first.taskId === second.taskId
    && first.date === second.date
    && first.end === second.start
    && minutesFromTime(second.end) - minutesFromTime(first.start) <= MAX_STUDY_SESSION_MINUTES;
}

function absorbShortBlocks(blocks: StudyBlock[]) {
  const normalized: StudyBlock[] = [];

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

function fillStudyBlocks(availability: DatedAvailability[], assignment: Assignment, workload: WorkloadBreakdown) {
  const tasks = workload.taskHours.map((task) => ({ ...task, remainingMinutes: Math.round(task.recommendedHours * 60) }));
  const studyBlocks: StudyBlock[] = [];

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

        if (dailyRemaining < MIN_STUDY_SESSION_MINUTES && !isFinalHalfHour) break;
        if (rangeRemaining < MIN_STUDY_SESSION_MINUTES && !isFinalHalfHour) break;

        const preferredLength = Math.min(PREFERRED_STUDY_SESSION_MINUTES, MAX_STUDY_SESSION_MINUTES, dailyRemaining, rangeRemaining);
        let duration = Math.min(preferredLength, task.remainingMinutes);

        // Keep the final half-hour attached to a normal session whenever the
        // current free period allows it. If it cannot be extended, leave a full
        // hour for a later eligible period instead of creating a 30-minute block.
        if (task.remainingMinutes - duration === 30) {
          const expandedDuration = Math.min(task.remainingMinutes, MAX_STUDY_SESSION_MINUTES, dailyRemaining, rangeRemaining);
          duration = expandedDuration > duration ? expandedDuration : duration >= 90 ? duration - 30 : duration;
        }

        if (duration < MIN_STUDY_SESSION_MINUTES && !isFinalHalfHour) break;
        if (duration === 0) break;

        studyBlocks.push({
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

  // First distribute work in roughly three-hour daily portions. A second pass only
  // uses extra free time when the workload cannot otherwise fit before the deadline.
  availability.forEach((day) => fillDay(day, DAILY_ASSIGNMENT_TARGET_MINUTES));
  if (nextTask(tasks)) {
    availability.forEach((day) => fillDay(day, DAY_MINUTES));
  }

  return absorbShortBlocks(studyBlocks);
}

function totalBlockMinutes(blocks: StudyBlock[]) {
  return blocks.reduce((total, block) => total + minutesFromTime(block.end) - minutesFromTime(block.start), 0);
}

export function generateStudySchedule({ assignment, workload, timetableEntries, commitments, now = new Date() }: SchedulerInput): ScheduleResult {
  const deadline = dateFromKey(assignment.deadline);
  const scheduleStart = startOfDay(now);
  const dayAfterDeadline = addDays(deadline, 1);
  const fullAvailability = buildAvailability(scheduleStart, dayAfterDeadline, timetableEntries, commitments);
  const bufferedAvailability = buildAvailability(scheduleStart, deadline, timetableEntries, commitments);
  removePastAvailability(fullAvailability, now);
  removePastAvailability(bufferedAvailability, now);
  const requiredMinutes = Math.round(workload.usableHours * 60);
  const bufferedCapacity = capacityMinutes(bufferedAvailability);
  const deadlineCapacity = capacityMinutes(fullAvailability);
  const canKeepDeadlineBuffer = requiredMinutes <= bufferedCapacity;
  const canFitBeforeDeadline = requiredMinutes <= deadlineCapacity;
  const availability = canKeepDeadlineBuffer ? bufferedAvailability : fullAvailability;
  const studyBlocks = fillStudyBlocks(availability, assignment, workload);
  const scheduledMinutes = totalBlockMinutes(studyBlocks);
  const unscheduledMinutes = Math.max(0, requiredMinutes - scheduledMinutes);

  return {
    studyBlocks,
    status: canKeepDeadlineBuffer ? "on-track" : canFitBeforeDeadline ? "tight" : "not-enough-time",
    requiredHours: hoursFromMinutes(requiredMinutes),
    scheduledHours: hoursFromMinutes(scheduledMinutes),
    unscheduledHours: hoursFromMinutes(unscheduledMinutes),
    bufferedAvailableHours: hoursFromMinutes(bufferedCapacity),
    deadlineAvailableHours: hoursFromMinutes(deadlineCapacity),
    usesDeadlineBuffer: !canKeepDeadlineBuffer && canFitBeforeDeadline,
  };
}
