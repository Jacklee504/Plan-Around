export function localDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function dateFromDateKey(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function getCalendarWeekStart(date: Date = new Date()) {
  const sunday = dateFromDateKey(localDateKey(date));
  sunday.setDate(sunday.getDate() - sunday.getDay());
  return localDateKey(sunday);
}

export function addCalendarWeeks(weekStart: string, weeks: number) {
  const next = dateFromDateKey(weekStart);
  next.setDate(next.getDate() + weeks * 7);
  return localDateKey(next);
}

export function calendarDateForDay(weekStart: string, dayOfWeek: number) {
  const date = dateFromDateKey(weekStart);
  date.setDate(date.getDate() + dayOfWeek);
  return localDateKey(date);
}

export function getMondayWeekKeyForDate(date: Date) {
  const monday = dateFromDateKey(localDateKey(date));
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  return localDateKey(monday);
}

export function getMondayWeekKeyForDateKey(dateKey: string) {
  return getMondayWeekKeyForDate(dateFromDateKey(dateKey));
}
