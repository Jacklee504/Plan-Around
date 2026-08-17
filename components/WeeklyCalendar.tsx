"use client";

import {
  blockPosition,
  CALENDAR_DAYS,
  CALENDAR_END_HOUR,
  CALENDAR_START_HOUR,
  calendarBlockDensity,
  HOUR_HEIGHT,
} from "@/lib/calendarLayout";
import { calendarDateForDay } from "@/lib/calendarWeek";
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

const calendarHeight = (CALENDAR_END_HOUR - CALENDAR_START_HOUR) * HOUR_HEIGHT;

function dateForDay(visibleWeekStart: string | undefined, dayOfWeek: number) {
  return visibleWeekStart ? calendarDateForDay(visibleWeekStart, dayOfWeek) : undefined;
}

function snappedTime(offsetY: number) {
  const rawMinutes = CALENDAR_START_HOUR * 60 + (offsetY / HOUR_HEIGHT) * 60;
  const snappedMinutes = Math.max(
    CALENDAR_START_HOUR * 60,
    Math.min(CALENDAR_END_HOUR * 60 - 30, Math.round(rawMinutes / 30) * 30),
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
  return (
    <div className="overflow-x-auto rounded-2xl border border-[var(--line)] bg-[var(--surface)]">
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
          <div
            className="relative border-r border-[var(--line)] text-xs text-[var(--muted-ink)]"
            style={{ height: calendarHeight }}
          >
            {Array.from(
              { length: CALENDAR_END_HOUR - CALENDAR_START_HOUR + 1 },
              (_, index) => (
                <span
                  key={index}
                  className="absolute right-1.5 tabular-nums sm:right-2"
                  style={{ top: index * HOUR_HEIGHT }}
                >{`${CALENDAR_START_HOUR + index}:00`}</span>
              ),
            )}
          </div>
          <div className="relative" style={{ height: calendarHeight }}>
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0"
            >
              {Array.from(
                { length: CALENDAR_END_HOUR - CALENDAR_START_HOUR + 1 },
                (_, index) => (
                  <div
                    key={index}
                    className="absolute inset-x-0 border-t border-[var(--line)]"
                    style={{ top: index * HOUR_HEIGHT }}
                  />
                ),
              )}
            </div>
            <div className="relative grid h-full grid-cols-7">
              {CALENDAR_DAYS.map((dayOfWeek) => {
                const currentDate = dateForDay(visibleWeekStart, dayOfWeek);
                return (
                  <div
                    key={dayOfWeek}
                    className="relative border-r border-[var(--line)] last:border-r-0"
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
                        start: snappedTime(event.clientY - bounds.top),
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
                            style={blockPosition(entry.start, entry.end)}
                          >
                            {content}
                          </button>
                        ) : (
                          <div
                            key={entry.id}
                            className={className}
                            style={blockPosition(entry.start, entry.end)}
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

                        return (
                          <div
                            key={block.id}
                            className={`absolute left-1 right-1 z-20 overflow-hidden rounded-lg border border-[var(--accent)] bg-[var(--accent-soft)] text-left text-[var(--accent-strong)] ${cardPadding(density)}`}
                            style={blockPosition(block.start, block.end)}
                          >
                            <CalendarCard
                              label={block.taskName}
                              detail="Study plan"
                            />
                          </div>
                        );
                      })}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
