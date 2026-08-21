export const CALENDAR_START_HOUR = 8;
export const CALENDAR_END_HOUR = 22;
export const HOUR_HEIGHT = 64;
export const CALENDAR_DAYS = [1, 2, 3, 4, 5, 6, 0] as const;

const CALENDAR_START_MINUTES = CALENDAR_START_HOUR * 60;

export type CalendarBlockDensity = "compact" | "tight" | "normal";

export function minutesFromTime(time: string) {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

export function minuteToPixel(time: string) {
  return ((minutesFromTime(time) - CALENDAR_START_MINUTES) / 60) * HOUR_HEIGHT;
}

export function blockPosition(start: string, end: string) {
  return {
    top: `${minuteToPixel(start)}px`,
    height: `${minuteToPixel(end) - minuteToPixel(start)}px`,
  };
}

export function calendarBlockDensity(start: string, end: string): CalendarBlockDensity {
  const duration = minutesFromTime(end) - minutesFromTime(start);
  if (duration < 60) return "compact";
  if (duration === 60) return "tight";
  return "normal";
}
