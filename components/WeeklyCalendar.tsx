"use client";

import { blockPosition, CALENDAR_DAYS, CALENDAR_END_HOUR, CALENDAR_START_HOUR, calendarBlockDensity, HOUR_HEIGHT } from "@/lib/calendarLayout";
import type { Commitment, DatedCommitment, TimetableEntry } from "@/types";

const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const sessionLabels = { lecture: "Lecture", lab: "Lab", tutorial: "Tutorial", other: "Class" } as const;
const categoryLabels = { class: "Class", work: "Work", gym: "Gym", meal: "Meal", social: "Social", other: "Other" } as const;

type WeeklyCalendarProps = {
  timetableEntries: TimetableEntry[];
  commitments: Commitment[];
  datedCommitments?: DatedCommitment[];
  visibleWeekStart?: string;
  selectedEntryId?: string | null;
  isEntrySkipped?: (entry: TimetableEntry) => boolean;
  onSelectEntry?: (entry: TimetableEntry) => void;
};

const calendarHeight = (CALENDAR_END_HOUR - CALENDAR_START_HOUR) * HOUR_HEIGHT;

function CalendarCard({
  label,
  detail,
  start,
  end,
  density,
  className,
}: {
  label: string;
  detail: string;
  start: string;
  end: string;
  density: ReturnType<typeof calendarBlockDensity>;
  className: string;
}) {
  if (density === "compact") {
    return <span className="block truncate font-bold tabular-nums">{label} · {start}–{end}</span>;
  }

  return (
    <span className={className}>
      <span className="block truncate font-bold">{label}</span>
      <span className="block truncate">{detail}</span>
      <span className="block tabular-nums">{start}–{end}</span>
    </span>
  );
}

export function WeeklyCalendar({
  timetableEntries,
  commitments,
  datedCommitments = [],
  visibleWeekStart,
  selectedEntryId = null,
  isEntrySkipped = () => false,
  onSelectEntry,
}: WeeklyCalendarProps) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-[var(--line)] bg-[var(--surface)]">
      <div className="min-w-[65rem]">
        <div className="grid grid-cols-[3.5rem_repeat(7,minmax(8rem,1fr))] border-b border-[var(--line)] bg-[var(--surface-soft)]">
          <div />
          {CALENDAR_DAYS.map((dayOfWeek) => <div key={dayOfWeek} className="px-3 py-3 text-sm font-semibold">{days[dayOfWeek]}</div>)}
        </div>
        <div className="grid grid-cols-[3.5rem_minmax(0,1fr)]">
          <div className="relative border-r border-[var(--line)] text-xs text-[var(--muted-ink)]" style={{ height: calendarHeight }}>
            {Array.from({ length: CALENDAR_END_HOUR - CALENDAR_START_HOUR + 1 }, (_, index) => (
              <span key={index} className="absolute right-2 tabular-nums" style={{ top: index * HOUR_HEIGHT }}>
                {`${CALENDAR_START_HOUR + index}:00`}
              </span>
            ))}
          </div>
          <div className="relative" style={{ height: calendarHeight }}>
            <div aria-hidden="true" className="pointer-events-none absolute inset-0">
              {Array.from({ length: CALENDAR_END_HOUR - CALENDAR_START_HOUR + 1 }, (_, index) => (
                <div key={index} className="absolute inset-x-0 border-t border-[var(--line)]" style={{ top: index * HOUR_HEIGHT }} />
              ))}
            </div>
            <div className="relative grid h-full grid-cols-7">
              {CALENDAR_DAYS.map((dayOfWeek) => (
                <div key={dayOfWeek} className="relative border-r border-[var(--line)] last:border-r-0">
                  {timetableEntries.filter((entry) => entry.dayOfWeek === dayOfWeek).map((entry) => {
                    const density = calendarBlockDensity(entry.start, entry.end);
                    const isSkipped = isEntrySkipped(entry);
                    const isSelected = selectedEntryId === entry.id;
                    const padding = density === "compact" ? "px-1.5 py-0 text-[10px] leading-[14px]" : density === "tight" ? "flex flex-col justify-center px-1.5 py-0.5 text-[10px] leading-[12px]" : "px-2 py-1 text-[11px] leading-[14px]";
                    const contentClass = density === "tight" ? "text-[10px] leading-[12px]" : "";
                    const classes = `absolute left-1 right-1 z-10 overflow-hidden rounded-lg border text-left transition-colors ${padding} ${isSkipped ? "border-dashed border-[var(--line)] bg-[var(--surface-soft)] text-[var(--muted-ink)] line-through" : isSelected ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--ink)]" : "border-[var(--accent-soft)] bg-[var(--accent-soft)] text-[var(--ink)] hover:border-[var(--accent)]"}`;

                    return onSelectEntry ? (
                      <button key={entry.id} type="button" onClick={() => onSelectEntry(entry)} className={classes} style={blockPosition(entry.start, entry.end)}>
                        <CalendarCard label={entry.moduleCode} detail={sessionLabels[entry.sessionType]} start={entry.start} end={entry.end} density={density} className={contentClass} />
                      </button>
                    ) : (
                      <div key={entry.id} className={classes} style={blockPosition(entry.start, entry.end)}>
                        <CalendarCard label={entry.moduleCode} detail={sessionLabels[entry.sessionType]} start={entry.start} end={entry.end} density={density} className={contentClass} />
                      </div>
                    );
                  })}
                  {commitments.filter((commitment) => commitment.dayOfWeek === dayOfWeek).map((commitment) => {
                    const density = calendarBlockDensity(commitment.start, commitment.end);
                    const padding = density === "compact" ? "px-1.5 py-0 text-[10px] leading-[14px]" : density === "tight" ? "flex flex-col justify-center px-1.5 py-0.5 text-[10px] leading-[12px]" : "px-2 py-1 text-[11px] leading-[14px]";
                    return <div key={commitment.id} className={`absolute left-1 right-1 z-10 overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--surface)] text-left text-[var(--ink)] shadow-sm ${padding}`} style={blockPosition(commitment.start, commitment.end)}><CalendarCard label={commitment.label} detail={categoryLabels[commitment.category]} start={commitment.start} end={commitment.end} density={density} className={density === "tight" ? "text-[10px] leading-[12px] text-[var(--muted-ink)]" : "text-[var(--muted-ink)]"} /></div>;
                  })}
                  {datedCommitments.filter((commitment) => {
                    if (!visibleWeekStart) return false;
                    const monday = new Date(`${visibleWeekStart}T12:00:00`);
                    const date = new Date(monday);
                    date.setDate(monday.getDate() + ((dayOfWeek + 6) % 7));
                    const dateKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
                    return commitment.date === dateKey;
                  }).map((commitment) => {
                    const density = calendarBlockDensity(commitment.start, commitment.end);
                    const padding = density === "compact" ? "px-1.5 py-0 text-[10px] leading-[14px]" : density === "tight" ? "flex flex-col justify-center px-1.5 py-0.5 text-[10px] leading-[12px]" : "px-2 py-1 text-[11px] leading-[14px]";
                    return <div key={commitment.id} className={`absolute left-1 right-1 z-10 overflow-hidden rounded-lg border border-dashed border-amber-300 bg-amber-50 text-left text-amber-950 ${padding}`} style={blockPosition(commitment.start, commitment.end)}><CalendarCard label={commitment.label} detail="One-off" start={commitment.start} end={commitment.end} density={density} className={density === "tight" ? "text-[10px] leading-[12px]" : ""} /></div>;
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
