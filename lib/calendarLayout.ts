import type {
  Commitment,
  DatedCommitment,
  AssignmentSession,
  TimetableEntry,
} from "@/types";

export const CALENDAR_START_HOUR = 8;
export const CALENDAR_END_HOUR = 22;
export const HOUR_HEIGHT = 64;
export const CALENDAR_DAYS = [1, 2, 3, 4, 5, 6, 0] as const;
export const MIN_VISIBLE_CALENDAR_HOURS = 8;

export type CalendarBlockDensity = "micro" | "compact" | "tight" | "normal";

export type CalendarTimeRange = {
  startHour: number;
  endHour: number;
};

type CalendarItem = Pick<
  Commitment | DatedCommitment | AssignmentSession | TimetableEntry,
  "start" | "end"
>;

export function minutesFromTime(time: string) {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

export function minuteToPixel(time: string, startHour = CALENDAR_START_HOUR) {
  return ((minutesFromTime(time) - startHour * 60) / 60) * HOUR_HEIGHT;
}

export function blockPosition(start: string, end: string, startHour = CALENDAR_START_HOUR) {
  return {
    top: `${minuteToPixel(start, startHour)}px`,
    height: `${minuteToPixel(end, startHour) - minuteToPixel(start, startHour)}px`,
  };
}

export function calendarHeight(range: CalendarTimeRange) {
  return (range.endHour - range.startHour) * HOUR_HEIGHT;
}

function clampHour(hour: number) {
  return Math.max(CALENDAR_START_HOUR, Math.min(CALENDAR_END_HOUR, hour));
}

/**
 * Grows a tight range up to the minimum visible width, preferring to add
 * hours before the range first (so a late-morning-only day still reads
 * naturally) and only spilling into extra hours after once the start is
 * already pinned to CALENDAR_START_HOUR.
 */
function fitMinimumRange(range: CalendarTimeRange): CalendarTimeRange {
  const missingHours = Math.max(
    0,
    MIN_VISIBLE_CALENDAR_HOURS - (range.endHour - range.startHour),
  );
  const spaceBefore = range.startHour - CALENDAR_START_HOUR;
  const growBefore = Math.min(spaceBefore, Math.ceil(missingHours / 2));
  const startHour = range.startHour - growBefore;
  const remainingHours = missingHours - growBefore;
  const spaceAfter = CALENDAR_END_HOUR - range.endHour;
  const growAfter = Math.min(spaceAfter, remainingHours);
  const endHour = range.endHour + growAfter;

  return {
    startHour: Math.max(CALENDAR_START_HOUR, startHour - (remainingHours - growAfter)),
    endHour,
  };
}

/**
 * Finds the smallest useful calendar window without hiding any scheduled
 * item, so a week with only 9-5 classes doesn't render the full 8am-10pm
 * grid. A preferred assignment window can be included by callers when that
 * setting exists, so the compact view doesn't hide the student's own
 * configured assignment hours either.
 */
export function calendarVisibleRange({
  timetableEntries = [],
  commitments = [],
  datedCommitments = [],
  assignmentSessions = [],
  preferredHours,
}: {
  timetableEntries?: TimetableEntry[];
  commitments?: Commitment[];
  datedCommitments?: DatedCommitment[];
  assignmentSessions?: AssignmentSession[];
  preferredHours?: { start: string; end: string };
} = {}): CalendarTimeRange {
  const items: CalendarItem[] = [
    ...timetableEntries,
    ...commitments,
    ...datedCommitments,
    ...assignmentSessions,
  ];

  if (preferredHours) items.push(preferredHours);

  if (!items.length) {
    return {
      startHour: CALENDAR_START_HOUR,
      endHour: CALENDAR_START_HOUR + MIN_VISIBLE_CALENDAR_HOURS,
    };
  }

  const earliestStart = Math.min(...items.map((item) => minutesFromTime(item.start)));
  const latestEnd = Math.max(...items.map((item) => minutesFromTime(item.end)));
  const range = {
    startHour: clampHour(Math.floor(earliestStart / 60) - 1),
    endHour: clampHour(Math.ceil(latestEnd / 60)),
  };

  return fitMinimumRange(range);
}

export function calendarBlockDensity(start: string, end: string): CalendarBlockDensity {
  const duration = minutesFromTime(end) - minutesFromTime(start);
  if (duration < 30) return "micro";
  if (duration < 60) return "compact";
  if (duration === 60) return "tight";
  return "normal";
}
