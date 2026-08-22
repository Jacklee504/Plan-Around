"use client";

import { useMemo, useState } from "react";
import {
  blockPosition,
  CALENDAR_DAYS,
  CALENDAR_END_HOUR,
  CALENDAR_START_HOUR,
  calendarBlockDensity,
  calendarHeight,
  calendarVisibleRange,
  HOUR_HEIGHT,
  type CalendarTimeRange,
} from "@/lib/calendarLayout";
import { calendarDateForDay, localDateKey } from "@/lib/calendarWeek";
import type {
  Commitment,
  DatedCommitment,
  StudyBlock,
  TimetableEntry,
} from "@/types";

const days = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
const sessionLabels = {
  lecture: "Lecture",
  lab: "Lab",
  tutorial: "Tutorial",
  other: "Class",
} as const;

export type CalendarSlot = { dayOfWeek: number; date?: string; start: string };

type WeeklyCalendarProps = {
  timetableEntries: TimetableEntry[];
  commitments: Commitment[];
  datedCommitments?: DatedCommitment[];
  studyBlocks?: StudyBlock[];
  visibleWeekStart?: string;
  selectedEntryId?: string | null;
  isEntrySkipped?: (entry: TimetableEntry, date?: string) => boolean;
  onSelectEntry?: (entry: TimetableEntry) => void;
  onSelectCommitment?: (commitment: Commitment) => void;
  onSelectDatedCommitment?: (commitment: DatedCommitment) => void;
  onSelectEmptySlot?: (slot: CalendarSlot) => void;
};

const FULL_DAY_RANGE: CalendarTimeRange = {
  startHour: CALENDAR_START_HOUR,
  endHour: CALENDAR_END_HOUR,
};

function dateForDay(visibleWeekStart: string | undefined, dayOfWeek: number) {
  return visibleWeekStart ? calendarDateForDay(visibleWeekStart, dayOfWeek) : undefined;
}

function snappedTime(offsetY: number, startHour: number, endHour: number) {
  const rawMinutes = startHour * 60 + (offsetY / HOUR_HEIGHT) * 60;
  const snappedMinutes = Math.max(
    startHour * 60,
    Math.min(endHour * 60 - 30, Math.round(rawMinutes / 30) * 30),
  );
  return `${String(Math.floor(snappedMinutes / 60)).padStart(2, "0")}:${String(snappedMinutes % 60).padStart(2, "0")}`;
}

function CalendarCard({
  label,
  detail,
}: {
  label: string;
  detail?: string;
}) {
  return (
    <span>
      <span className="block truncate font-bold">{label}</span>
      {detail ? <span className="block truncate">{detail}</span> : null}
    </span>
  );
}
function cardPadding(density: ReturnType<typeof calendarBlockDensity>) {
  return density === "compact"
    ? "px-1.5 py-0 text-[14px] leading-[18px]"
    : "px-2 py-1 text-[14px] leading-[18px]";
}

function HourAxis({ range }: { range: CalendarTimeRange }) {
  return (
    <div
      className="relative border-r border-[var(--line)] text-xs text-[var(--muted-ink)]"
      style={{ height: calendarHeight(range) }}
    >
      {Array.from(
        { length: range.endHour - range.startHour + 1 },
        (_, index) => (
          <span
            key={index}
            className="absolute right-1.5 tabular-nums sm:right-2"
            style={{ top: index * HOUR_HEIGHT }}
          >{`${range.startHour + index}:00`}</span>
        ),
      )}
    </div>
  );
}

function HourGridLines({ range }: { range: CalendarTimeRange }) {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0">
      {Array.from(
        { length: range.endHour - range.startHour + 1 },
        (_, index) => (
          <div
            key={index}
            className="absolute inset-x-0 border-t border-[var(--line)]"
            style={{ top: index * HOUR_HEIGHT }}
          />
        ),
      )}
    </div>
  );
}

type DayColumnProps = {
  dayOfWeek: number;
  currentDate: string | undefined;
  range: CalendarTimeRange;
  timetableEntries: TimetableEntry[];
  commitments: Commitment[];
  datedCommitments: DatedCommitment[];
  studyBlocks: StudyBlock[];
  selectedEntryId: string | null;
  isEntrySkipped: (entry: TimetableEntry, date?: string) => boolean;
  onSelectEntry?: (entry: TimetableEntry) => void;
  onSelectCommitment?: (commitment: Commitment) => void;
  onSelectDatedCommitment?: (commitment: DatedCommitment) => void;
  onSelectEmptySlot?: (slot: CalendarSlot) => void;
};

function DayColumn({
  dayOfWeek,
  currentDate,
  range,
  timetableEntries,
  commitments,
  datedCommitments,
  studyBlocks,
  selectedEntryId,
  isEntrySkipped,
  onSelectEntry,
  onSelectCommitment,
  onSelectDatedCommitment,
  onSelectEmptySlot,
}: DayColumnProps) {
  return (
    <div
      className="relative h-full border-r border-[var(--line)] last:border-r-0"
      onClick={(event) => {
        if (
          !onSelectEmptySlot ||
          event.target !== event.currentTarget
        )
          return;
        const bounds =
          event.currentTarget.getBoundingClientRect();
        onSelectEmptySlot({
          dayOfWeek,
          date: currentDate,
          start: snappedTime(event.clientY - bounds.top, range.startHour, range.endHour),
        });
      }}
    >
      {timetableEntries
        .filter((entry) => entry.dayOfWeek === dayOfWeek)
        .map((entry) => {
          const density = calendarBlockDensity(
            entry.start,
            entry.end,
          );
          const skipped = isEntrySkipped(entry, currentDate);
          const selected = selectedEntryId === entry.id;
          const className = `absolute left-1 right-1 z-10 overflow-hidden rounded-lg border text-left transition-colors ${cardPadding(density)} ${skipped ? "border-dashed border-[var(--line)] bg-[var(--surface-soft)] text-[var(--muted-ink)] line-through" : selected ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--ink)]" : "border-[var(--accent-soft)] bg-[var(--accent-soft)] text-[var(--ink)] hover:border-[var(--accent)]"}`;
          const content = (
            <CalendarCard
              label={entry.moduleCode}
              detail={sessionLabels[entry.sessionType]}
            />
          );
          return onSelectEntry ? (
            <button
              key={entry.id}
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onSelectEntry(entry);
              }}
              className={className}
              style={blockPosition(entry.start, entry.end, range.startHour)}
            >
              {content}
            </button>
          ) : (
            <div
              key={entry.id}
              className={className}
              style={blockPosition(entry.start, entry.end, range.startHour)}
            >
              {content}
            </div>
          );
        })}
      {commitments
        .filter(
          (commitment) => commitment.dayOfWeek === dayOfWeek,
        )
        .map((commitment) => {
          const density = calendarBlockDensity(
            commitment.start,
            commitment.end,
          );
          const className = `absolute left-1 right-1 z-10 overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--surface)] text-left text-[var(--ink)] shadow-sm transition-colors hover:border-[var(--accent)] ${cardPadding(density)}`;
          const content = (
            <CalendarCard label={commitment.label} />
          );
          return onSelectCommitment ? (
            <button
              key={commitment.id}
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onSelectCommitment(commitment);
              }}
              className={className}
              style={blockPosition(
                commitment.start,
                commitment.end,
                range.startHour,
              )}
            >
              {content}
            </button>
          ) : (
            <div
              key={commitment.id}
              className={className}
              style={blockPosition(
                commitment.start,
                commitment.end,
                range.startHour,
              )}
            >
              {content}
            </div>
          );
        })}
      {datedCommitments
        .filter((commitment) => commitment.date === currentDate)
        .map((commitment) => {
          const density = calendarBlockDensity(
            commitment.start,
            commitment.end,
          );
          const className = `absolute left-1 right-1 z-10 overflow-hidden rounded-lg border border-dashed border-amber-300 bg-amber-50 text-left text-amber-950 transition-colors hover:border-amber-500 ${cardPadding(density)}`;
          const content = (
            <CalendarCard
              label={commitment.label}
              detail="One-off"
            />
          );
          return onSelectDatedCommitment ? (
            <button
              key={commitment.id}
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onSelectDatedCommitment(commitment);
              }}
              className={className}
              style={blockPosition(
                commitment.start,
                commitment.end,
                range.startHour,
              )}
            >
              {content}
            </button>
          ) : (
            <div
              key={commitment.id}
              className={className}
              style={blockPosition(
                commitment.start,
                commitment.end,
                range.startHour,
              )}
            >
              {content}
            </div>
          );
        })}
      {studyBlocks
        .filter((block) => block.date === currentDate)
        .map((block) => {
          const density = calendarBlockDensity(
            block.start,
            block.end,
          );
          const completed = Boolean(block.completedAt);
          const missed = Boolean(block.missedAt);

          return (
            <div
              key={block.id}
              className={`absolute left-1 right-1 z-20 overflow-hidden rounded-lg border text-left ${cardPadding(density)} ${completed ? "border-[var(--line)] bg-[var(--surface-soft)] text-[var(--muted-ink)]" : missed ? "border-red-200 bg-red-50 text-red-700" : "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-strong)]"}`}
              style={blockPosition(block.start, block.end, range.startHour)}
            >
              <CalendarCard
                label={block.taskName}
                detail={completed ? "Completed" : missed ? "Missed" : "Study plan"}
              />
            </div>
          );
        })}
    </div>
  );
}

export function WeeklyCalendar({
  timetableEntries,
  commitments,
  datedCommitments = [],
  studyBlocks = [],
  visibleWeekStart,
  selectedEntryId = null,
  isEntrySkipped = () => false,
  onSelectEntry,
  onSelectCommitment,
  onSelectDatedCommitment,
  onSelectEmptySlot,
}: WeeklyCalendarProps) {
  const todayDateKey = localDateKey(new Date());
  const todayDayOfWeek = CALENDAR_DAYS.find(
    (dayOfWeek) => dateForDay(visibleWeekStart, dayOfWeek) === todayDateKey,
  );
  const [selectedDayOfWeek, setSelectedDayOfWeek] = useState(todayDayOfWeek ?? 1);
  const [showFullDay, setShowFullDay] = useState(false);

  // Trims the grid to the hours actually in use (padded, minimum 8h) so a
  // week of 9-5 classes doesn't render the full 08:00-22:00 range - never
  // hides anything, just the empty hours around it. "Show full day" opts
  // back into the fixed range.
  const compactRange = useMemo(
    () =>
      calendarVisibleRange({
        timetableEntries,
        commitments,
        datedCommitments,
        studyBlocks,
      }),
    [commitments, datedCommitments, studyBlocks, timetableEntries],
  );
  const isAlreadyFullDay =
    compactRange.startHour === CALENDAR_START_HOUR && compactRange.endHour === CALENDAR_END_HOUR;
  const visibleRange = showFullDay ? FULL_DAY_RANGE : compactRange;

  const dayColumnProps = {
    range: visibleRange,
    timetableEntries,
    commitments,
    datedCommitments,
    studyBlocks,
    selectedEntryId,
    isEntrySkipped,
    onSelectEntry,
    onSelectCommitment,
    onSelectDatedCommitment,
    onSelectEmptySlot,
  };

  return (
    <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)]">
      {!isAlreadyFullDay ? (
        <div className="flex items-center justify-end gap-3 border-b border-[var(--line)] bg-[var(--surface-soft)] px-3 py-2 sm:px-4">
          <span className="text-xs tabular-nums text-[var(--muted-ink)]" aria-live="polite">
            {`${String(visibleRange.startHour).padStart(2, "0")}:00–${String(visibleRange.endHour).padStart(2, "0")}:00`}
          </span>
          <button
            type="button"
            onClick={() => setShowFullDay((current) => !current)}
            className="min-h-9 rounded-lg px-2 text-xs font-semibold text-[var(--accent-strong)] hover:bg-[var(--accent-soft)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
            aria-pressed={showFullDay}
          >
            {showFullDay ? "Use compact hours" : "Show full day"}
          </button>
        </div>
      ) : null}

      {/* Seven columns don't fit a phone screen readably, so below md this
          swaps for a single-day agenda with a day switcher instead of
          shrinking or horizontally scrolling a dense grid. */}
      <div className="hidden overflow-x-auto md:block">
        <div className="min-w-[42rem] lg:min-w-0">
          <div className="grid grid-cols-[3.25rem_repeat(7,minmax(0,1fr))] border-b border-[var(--line)] bg-[var(--surface-soft)]">
            <div />
            {CALENDAR_DAYS.map((dayOfWeek) => {
              const headerDate = dateForDay(visibleWeekStart, dayOfWeek);
              return (
                <div
                  key={dayOfWeek}
                  className="min-w-0 px-1 py-3 text-center text-xs font-semibold sm:px-2 sm:text-sm"
                >
                  {days[dayOfWeek].slice(0, 3)}
                  <span className="hidden xl:inline">
                    {days[dayOfWeek].slice(3)}
                  </span>
                  {headerDate ? (
                    <span className="mt-0.5 block text-[11px] font-normal text-[var(--muted-ink)]">
                      {Number(headerDate.slice(-2))}
                    </span>
                  ) : null}
                </div>
              );
            })}
          </div>
          <div className="grid grid-cols-[3.25rem_minmax(0,1fr)] py-4">
            <HourAxis range={visibleRange} />
            <div className="relative" style={{ height: calendarHeight(visibleRange) }}>
              <HourGridLines range={visibleRange} />
              <div className="relative grid h-full grid-cols-7">
                {CALENDAR_DAYS.map((dayOfWeek) => (
                  <DayColumn
                    key={dayOfWeek}
                    dayOfWeek={dayOfWeek}
                    currentDate={dateForDay(visibleWeekStart, dayOfWeek)}
                    {...dayColumnProps}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="md:hidden">
        <div className="flex items-center gap-0.5 overflow-x-auto border-b border-[var(--line)] bg-[var(--surface-soft)] px-1 py-2">
          {CALENDAR_DAYS.map((dayOfWeek) => {
            const date = dateForDay(visibleWeekStart, dayOfWeek);
            const isToday = date === todayDateKey;
            const isSelected = dayOfWeek === selectedDayOfWeek;
            return (
              <button
                key={dayOfWeek}
                type="button"
                onClick={() => setSelectedDayOfWeek(dayOfWeek)}
                aria-pressed={isSelected}
                className={`flex min-h-11 min-w-11 flex-1 flex-col items-center justify-center rounded-lg px-1 py-1.5 text-xs font-semibold transition-colors ${
                  isSelected
                    ? "bg-[var(--accent)] text-white"
                    : isToday
                      ? "text-[var(--accent-strong)]"
                      : "text-[var(--muted-ink)]"
                }`}
              >
                {days[dayOfWeek].slice(0, 3)}
                {date ? (
                  <span className="mt-0.5 text-[11px] font-normal">
                    {Number(date.slice(-2))}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
        <div className="grid grid-cols-[3rem_minmax(0,1fr)] py-4">
          <HourAxis range={visibleRange} />
          <div className="relative" style={{ height: calendarHeight(visibleRange) }}>
            <HourGridLines range={visibleRange} />
            <DayColumn
              dayOfWeek={selectedDayOfWeek}
              currentDate={dateForDay(visibleWeekStart, selectedDayOfWeek)}
              {...dayColumnProps}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
