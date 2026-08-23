"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { parseTimetablePdf } from "@/lib/timetableParser";
import { renderPdfToImageFile } from "@/lib/pdfDocument";
import {
  readStoredValue,
  storageKeys,
  writeStoredValue,
} from "@/lib/storage";
import { CALENDAR_DAYS } from "@/lib/calendarLayout";
import {
  addCalendarWeeks,
  calendarDateForDay,
  dateFromDateKey,
  getCalendarWeekStart,
  getMondayWeekKeyForDate,
  getMondayWeekKeyForDateKey,
} from "@/lib/calendarWeek";
import { WeeklyCalendar, type CalendarSlot } from "@/components/WeeklyCalendar";
import { useOnboardingState } from "@/lib/onboarding";
import { assignmentPartNumber } from "@/lib/assignmentParts";
import { type PreparedAnalysisImage } from "@/lib/analysisImage";
import { prepareTimetableAnalysisImages } from "@/lib/timetableImage";
import { analyzeTimetableScreenshot } from "@/lib/timetableAnalyzer";
import { imageAnalysisIsAvailable } from "@/lib/analyzerEndpoint";
import type { TimetableAnalysisEntry } from "@/lib/timetableAnalysis";
import { TimetableReview } from "@/components/TimetableReview";
import type {
  Assignment,
  Commitment,
  CommitmentCategory,
  DatedCommitment,
  Module,
  AssignmentSession,
  TimetableAttendance,
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
const inputClassName =
  "mt-1.5 min-h-11 w-full rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 text-sm text-[var(--ink)] outline-none transition-colors placeholder:text-[var(--muted-ink)] focus:border-[var(--accent)]";

type CalendarEventDraft = {
  mode: "recurring" | "dated";
  id?: string;
  label: string;
  dayOfWeek: number;
  selectedDays?: number[];
  date: string;
  start: string;
  end: string;
  category: CommitmentCategory;
};
type AssignmentSessionEditDraft = {
  id: string;
  date: string;
  start: string;
  end: string;
  missed: boolean;
};
type TimetableAttendanceChoice = TimetableAttendance | "skip-this-week";
type LegacyTimetableEntry = Omit<
  TimetableEntry,
  "attendance" | "skippedWeeks"
> & {
  attendance?: TimetableAttendance | "skip-this-week";
  skippedWeeks?: string[];
};
type SetupWorkspaceContentProps = {
  onboardingCompleted: boolean;
  onCompleteOnboarding: () => void;
};

const createId = () =>
  window.crypto?.randomUUID?.() ??
  `${Date.now()}-${Math.random().toString(16).slice(2)}`;

function plusHour(time: string) {
  const [hour, minute] = time.split(":").map(Number);
  const endMinutes = Math.min(hour * 60 + minute + 60, 22 * 60);
  return `${String(Math.floor(endMinutes / 60)).padStart(2, "0")}:${String(endMinutes % 60).padStart(2, "0")}`;
}
const weekRangeDayFormatter = new Intl.DateTimeFormat("en-IE", { day: "numeric" });
const weekRangeMonthFormatter = new Intl.DateTimeFormat("en-IE", { day: "numeric", month: "short" });
const weekRangeMonthYearFormatter = new Intl.DateTimeFormat("en-IE", {
  day: "numeric",
  month: "short",
  year: "numeric",
});
function formatVisibleWeekRange(weekStart: string) {
  const start = dateFromDateKey(weekStart);
  const end = dateFromDateKey(calendarDateForDay(weekStart, 0));
  const sameMonth = start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear();
  const startLabel = sameMonth ? weekRangeDayFormatter.format(start) : weekRangeMonthFormatter.format(start);
  return `${startLabel}–${weekRangeMonthYearFormatter.format(end)}`;
}
// The real current Monday-based week key, used only to migrate legacy
// "skip-this-week" data on load. Skip/attendance actions elsewhere use the
// key for the week currently being viewed, not this fixed value.
const currentWeekKey = getMondayWeekKeyForDate(new Date());

function EventDialog({
  draft,
  onboardingCompleted,
  onChange,
  onSave,
  onDelete,
  onClose,
  error,
}: {
  draft: CalendarEventDraft;
  onboardingCompleted: boolean;
  onChange: (draft: CalendarEventDraft) => void;
  onSave: () => void;
  onDelete?: () => void;
  onClose: () => void;
  error: string;
}) {
  const isEdit = Boolean(draft.id);
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-[oklch(0.18_0.02_260_/_0.35)] p-4"
      role="presentation"
      onMouseDown={onClose}
    >
      <form
        className="w-full max-w-md rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5 shadow-xl"
        onSubmit={(event) => {
          event.preventDefault();
          onSave();
        }}
        onMouseDown={(event) => event.stopPropagation()}
        aria-labelledby="calendar-event-heading"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--accent-strong)]">
              {isEdit ? "Edit event" : "Add event"}
            </p>
            <h2
              id="calendar-event-heading"
              className="mt-1 text-xl font-semibold tracking-[-0.03em]"
            >
              {draft.mode === "recurring"
                ? "Add a recurring commitment."
                : "Protect this date."}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-10 px-2 text-sm font-semibold text-[var(--muted-ink)] hover:text-[var(--ink)]"
          >
            Close
          </button>
        </div>
        {!isEdit && onboardingCompleted ? (
          <div className="mt-5 grid grid-cols-2 rounded-xl bg-[var(--surface-soft)] p-1 text-sm font-semibold">
            <button
              type="button"
              onClick={() => onChange({ ...draft, mode: "dated" })}
              className={`min-h-10 rounded-lg ${draft.mode === "dated" ? "bg-[var(--surface)] text-[var(--ink)] shadow-sm" : "text-[var(--muted-ink)]"}`}
            >
              This date only
            </button>
            <button
              type="button"
              onClick={() => onChange({ ...draft, mode: "recurring" })}
              className={`min-h-10 rounded-lg ${draft.mode === "recurring" ? "bg-[var(--surface)] text-[var(--ink)] shadow-sm" : "text-[var(--muted-ink)]"}`}
            >
              Every week
            </button>
          </div>
        ) : null}
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-medium sm:col-span-2">
            What
            <input
              value={draft.label}
              onChange={(event) =>
                onChange({ ...draft, label: event.target.value })
              }
              className={inputClassName}
              placeholder="Gym"
              autoFocus
              autoComplete="off"
            />
          </label>
          {draft.mode === "dated" ? (
            <label className="text-sm font-medium sm:col-span-2">
              Date
              <input
                value={draft.date}
                onChange={(event) =>
                  onChange({ ...draft, date: event.target.value })
                }
                className={inputClassName}
                type="date"
              />
            </label>
          ) : isEdit ? (
            <label className="text-sm font-medium sm:col-span-2">
              Day
              <select
                value={draft.dayOfWeek}
                onChange={(event) =>
                  onChange({ ...draft, dayOfWeek: Number(event.target.value) })
                }
                className={inputClassName}
              >
                {CALENDAR_DAYS.map((day) => (
                  <option key={day} value={day}>
                    {days[day]}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <div className="sm:col-span-2">
              <p className="text-sm font-medium">Days</p>

              <div className="mt-2 grid grid-cols-7 gap-1.5">
                {CALENDAR_DAYS.map((day) => {
                  const selected = (
                    draft.selectedDays ?? [draft.dayOfWeek]
                  ).includes(day);

                  return (
                    <button
                      key={day}
                      type="button"
                      onClick={() => {
                        const current =
                          draft.selectedDays ?? [draft.dayOfWeek];

                        const selectedDays = selected
                          ? current.filter(
                              (selectedDay) => selectedDay !== day,
                            )
                          : [...current, day];

                        onChange({
                          ...draft,
                          selectedDays,
                        });
                      }}
                      className={`min-h-10 rounded-lg border px-1 text-xs font-semibold ${
                        selected
                          ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-strong)]"
                          : "border-[var(--line)] text-[var(--muted-ink)] hover:border-[var(--accent)]"
                      }`}
                    >
                      {days[day].slice(0, 3)}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          <label className="text-sm font-medium">
            Start
            <input
              value={draft.start}
              onChange={(event) =>
                onChange({ ...draft, start: event.target.value })
              }
              className={inputClassName}
              type="time"
            />
          </label>
          <label className="text-sm font-medium">
            End
            <input
              value={draft.end}
              onChange={(event) =>
                onChange({ ...draft, end: event.target.value })
              }
              className={inputClassName}
              type="time"
            />
          </label>
        </div>
        {error ? (
          <p className="mt-3 text-sm text-red-700" role="alert">
            {error}
          </p>
        ) : null}
        <div className="mt-6 flex flex-wrap justify-between gap-3">
          <div>
            {onDelete ? (
              <button
                type="button"
                onClick={onDelete}
                className="min-h-11 px-2 text-sm font-semibold text-red-700 hover:text-red-900"
              >
                Delete
              </button>
            ) : null}
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="min-h-11 rounded-xl border border-[var(--line)] px-4 text-sm font-semibold text-[var(--muted-ink)] hover:border-[var(--accent)]"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="min-h-11 rounded-xl bg-[var(--accent)] px-4 text-sm font-semibold text-white hover:bg-[var(--accent-strong)]"
            >
              {isEdit ? "Save changes" : "Add"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

function AssignmentSessionDialog({
  block,
  onSave,
  onClose,
}: {
  block: AssignmentSession;
  onSave: (draft: AssignmentSessionEditDraft) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<AssignmentSessionEditDraft>({
    id: block.id,
    date: block.date,
    start: block.start,
    end: block.end,
    missed: Boolean(block.missedAt),
  });
  const [error, setError] = useState("");
  const isCompleted = Boolean(block.completedAt);

  function updateDraft(changes: Partial<AssignmentSessionEditDraft>) {
    setDraft((current) => ({ ...current, ...changes }));
    setError("");
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-[oklch(0.18_0.02_260_/_0.35)] p-4"
      role="presentation"
      onMouseDown={onClose}
    >
      <form
        className="w-full max-w-md rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5 shadow-xl"
        onSubmit={(event) => {
          event.preventDefault();
          if (!draft.date || !/^\d{4}-\d{2}-\d{2}$/.test(draft.date)) {
            setError("Choose a valid date.");
            return;
          }
          if (draft.start < "08:00" || draft.end > "22:00" || draft.end <= draft.start) {
            setError("Choose an end time after the start, between 08:00 and 22:00.");
            return;
          }
          onSave(draft);
        }}
        onMouseDown={(event) => event.stopPropagation()}
        aria-labelledby="assignment-session-heading"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="assignment-session-heading" className="text-xl font-semibold tracking-[-0.03em]">Adjust this session.</h2>
            <p className="mt-2 text-sm leading-6 text-[var(--muted-ink)]">{block.taskName}</p>
          </div>
          <button type="button" onClick={onClose} className="min-h-10 px-2 text-sm font-semibold text-[var(--muted-ink)] hover:text-[var(--ink)]">Close</button>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-medium sm:col-span-2">Date<input value={draft.date} onChange={(event) => updateDraft({ date: event.target.value })} className={inputClassName} type="date" autoFocus /></label>
          <label className="text-sm font-medium">Start<input value={draft.start} onChange={(event) => updateDraft({ start: event.target.value })} className={inputClassName} type="time" min="08:00" max="22:00" /></label>
          <label className="text-sm font-medium">End<input value={draft.end} onChange={(event) => updateDraft({ end: event.target.value })} className={inputClassName} type="time" min="08:00" max="22:00" /></label>
        </div>

        {isCompleted ? <p className="mt-4 rounded-xl bg-[var(--surface-soft)] px-4 py-3 text-sm leading-6 text-[var(--muted-ink)]">This session is marked complete.</p> : (
          <button type="button" onClick={() => updateDraft({ missed: !draft.missed })} className={`mt-4 min-h-10 rounded-xl px-4 text-sm font-semibold ${draft.missed ? "bg-red-50 text-red-700" : "border border-[var(--line)] text-[var(--muted-ink)] hover:border-red-300 hover:text-red-700"}`}>
            {draft.missed ? "Restore session" : "Mark missed"}
          </button>
        )}
        <p className="mt-4 text-sm leading-6 text-[var(--muted-ink)]">Replanning this assignment can replace unfinished sessions.</p>
        {error ? <p className="mt-3 text-sm text-red-700" role="alert">{error}</p> : null}

        <div className="mt-6 flex justify-end gap-3">
          <button type="button" onClick={onClose} className="min-h-11 rounded-xl border border-[var(--line)] px-4 text-sm font-semibold text-[var(--muted-ink)] hover:border-[var(--accent)]">Cancel</button>
          <button type="submit" className="min-h-11 rounded-xl bg-[var(--accent)] px-4 text-sm font-semibold text-white hover:bg-[var(--accent-strong)]">Save session</button>
        </div>
      </form>
    </div>
  );
}

function TimetableEntryDialog({
  entry,
  weekKey,
  onSave,
  onClose,
}: {
  entry: TimetableEntry;
  weekKey: string;
  onSave: (attendance: TimetableAttendanceChoice) => void;
  onClose: () => void;
}) {
  const [attendance, setAttendance] = useState<TimetableAttendanceChoice>(
    entry.attendance === "skip-every-week"
      ? "skip-every-week"
      : entry.skippedWeeks.includes(weekKey)
        ? "skip-this-week"
        : "attending",
  );

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-[oklch(0.18_0.02_260_/_0.35)] p-4"
      role="presentation"
      onMouseDown={onClose}
    >
      <form
        className="w-full max-w-md rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5 shadow-xl"
        onSubmit={(event) => {
          event.preventDefault();
          onSave(attendance);
        }}
        onMouseDown={(event) => event.stopPropagation()}
        aria-labelledby="timetable-entry-heading"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--accent-strong)]">
              Class attendance
            </p>
            <h2
              id="timetable-entry-heading"
              className="mt-1 text-xl font-semibold tracking-[-0.03em]"
            >
              Are you going to this class?
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-10 px-2 text-sm font-semibold text-[var(--muted-ink)] hover:text-[var(--ink)]"
          >
            Close
          </button>
        </div>

        <div className="mt-5 rounded-xl bg-[var(--surface-soft)] px-4 py-3">
          <p className="text-sm font-semibold">
            {entry.moduleCode} · {entry.moduleName}
          </p>
          <p className="mt-1 text-sm text-[var(--muted-ink)]">
            {days[entry.dayOfWeek]}, {entry.start} to {entry.end} · {sessionLabels[entry.sessionType]}
          </p>
        </div>

        <fieldset className="mt-5 grid gap-2">
          <legend className="text-sm font-medium">Attendance</legend>
          {[
            ["attending", "Going", "Keep this class in your calendar."],
            ["skip-this-week", "Not going this week", "Remove this occurrence only."],
            ["skip-every-week", "Not going every week", "Remove this recurring class."],
          ].map(([value, label, description]) => {
            const selected = attendance === value;
            return (
              <button
                key={value}
                type="button"
                onClick={() => setAttendance(value as TimetableAttendanceChoice)}
                className={`min-h-11 rounded-xl border px-3 py-2 text-left text-sm transition-colors ${
                  selected
                    ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-strong)]"
                    : "border-[var(--line)] text-[var(--ink)] hover:border-[var(--accent)]"
                }`}
              >
                <span className="block font-semibold">{label}</span>
                <span className="mt-0.5 block text-xs font-normal text-[var(--muted-ink)]">
                  {description}
                </span>
              </button>
            );
          })}
        </fieldset>

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 rounded-xl border border-[var(--line)] px-4 text-sm font-semibold text-[var(--muted-ink)] hover:border-[var(--accent)]"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="min-h-11 rounded-xl bg-[var(--accent)] px-4 text-sm font-semibold text-white hover:bg-[var(--accent-strong)]"
          >
            Save attendance
          </button>
        </div>
      </form>
    </div>
  );
}

function SetupWorkspaceContent({
  onboardingCompleted,
  onCompleteOnboarding,
}: SetupWorkspaceContentProps) {
  const [modules, setModules] = useState<Module[]>([]);
const [assignments, setAssignments] = useState<Assignment[]>([]);
const [assignmentSessions, setAssignmentSessions] = useState<AssignmentSession[]>([]);
const [commitments, setCommitments] = useState<Commitment[]>([]);
const [datedCommitments, setDatedCommitments] = useState<DatedCommitment[]>(
    [],
  );
  const [timetableEntries, setTimetableEntries] = useState<TimetableEntry[]>(
    [],
  );
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
  const [visibleCalendarWeekStart, setVisibleCalendarWeekStart] = useState(() =>
    getCalendarWeekStart(),
  );
  const [eventDraft, setEventDraft] = useState<CalendarEventDraft | null>(null);
  const [eventError, setEventError] = useState("");
  const [assignmentSessionDraft, setAssignmentSessionDraft] = useState<AssignmentSession | null>(null);
  const [showImporter, setShowImporter] = useState(!onboardingCompleted);
  const [importState, setImportState] = useState<
    "idle" | "reading" | "complete" | "error"
  >("idle");
  const [uploadedFileName, setUploadedFileName] = useState("");
  const [importMessage, setImportMessage] = useState("");
  const [preparedTimetableImage, setPreparedTimetableImage] =
    useState<PreparedAnalysisImage[] | null>(null);
  const [isPreparingTimetableImage, setIsPreparingTimetableImage] =
    useState(false);
  const [isAnalysingTimetable, setIsAnalysingTimetable] = useState(false);
  const [timetableAnalysisError, setTimetableAnalysisError] = useState("");
  const [reviewEntries, setReviewEntries] = useState<
    TimetableAnalysisEntry[] | null
  >(null);
  const [reviewWarnings, setReviewWarnings] = useState<string[]>([]);
  const [reviewError, setReviewError] = useState("");
  const [isLoaded, setIsLoaded] = useState(false);
  const timetableImageInput = useRef<HTMLInputElement>(null);
  const timetableImageVersion = useRef(0);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setModules(readStoredValue<Module[]>(storageKeys.modules, []));
      setAssignments(
        readStoredValue<Assignment[]>(storageKeys.assignments, []),
      );
      setAssignmentSessions(
        readStoredValue<AssignmentSession[]>(storageKeys.assignmentSessions, []),
      );
      setCommitments(
        readStoredValue<Commitment[]>(storageKeys.commitments, []),
      );
      setDatedCommitments(
        readStoredValue<DatedCommitment[]>(storageKeys.datedCommitments, []),
      );
      const stored = readStoredValue<LegacyTimetableEntry[]>(
        storageKeys.timetableEntries,
        [],
      );
      setTimetableEntries(
        stored.map((entry) => ({
          ...entry,
          attendance:
            entry.attendance === "skip-every-week"
              ? "skip-every-week"
              : "attending",
          skippedWeeks:
            entry.skippedWeeks ??
            (entry.attendance === "skip-this-week" ? [currentWeekKey] : []),
        })),
      );
      setIsLoaded(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);
  useEffect(() => {
    if (isLoaded) writeStoredValue(storageKeys.modules, modules);
  }, [isLoaded, modules]);
  useEffect(() => {
    if (isLoaded) writeStoredValue(storageKeys.assignmentSessions, assignmentSessions);
  }, [isLoaded, assignmentSessions]);
  useEffect(() => {
    if (isLoaded) writeStoredValue(storageKeys.commitments, commitments);
  }, [isLoaded, commitments]);
  useEffect(() => {
    if (isLoaded)
      writeStoredValue(storageKeys.datedCommitments, datedCommitments);
  }, [isLoaded, datedCommitments]);
  useEffect(() => {
    if (isLoaded)
      writeStoredValue(storageKeys.timetableEntries, timetableEntries);
  }, [isLoaded, timetableEntries]);

  const selectedEntry =
    timetableEntries.find((entry) => entry.id === selectedEntryId) ?? null;
  // The recurring class shown as "selected" can appear in any displayed week, so its
  // one-week skip exception is keyed off the visible week, not the real current week.
  const selectedEntryDate = selectedEntry
    ? calendarDateForDay(visibleCalendarWeekStart, selectedEntry.dayOfWeek)
    : null;
  const selectedEntryWeekKey = selectedEntryDate
    ? getMondayWeekKeyForDateKey(selectedEntryDate)
    : null;
  const importedModuleCount = new Set(
    timetableEntries.map((entry) => entry.moduleCode),
  ).size;
  const isEntrySkippedOnDate = (entry: TimetableEntry, date?: string) =>
    entry.attendance === "skip-every-week" ||
    (date ? entry.skippedWeeks.includes(getMondayWeekKeyForDateKey(date)) : false);
  const totalBlockedTime = timetableEntries.length + commitments.length;
  const hasBaseline = totalBlockedTime > 0;
  const canCompleteSetup = hasBaseline;
  const assignmentSessionLabels = useMemo(() => {
    const assignmentsById = new Map(
      assignments.map((assignment) => [assignment.id, assignment]),
    );
    const modulesById = new Map(modules.map((module) => [module.id, module]));

    return assignmentSessions.reduce<Record<string, string>>((labels, block) => {
      const assignment = assignmentsById.get(block.assignmentId);
      const moduleCode = assignment
        ? modulesById.get(assignment.moduleId)?.code?.trim()
        : undefined;
      const partNumber = assignment
        ? assignmentPartNumber(assignment, block.taskId)
        : null;

      if (moduleCode && partNumber) {
        labels[block.id] = `${moduleCode} · Pt ${partNumber}`;
      }
      return labels;
    }, {});
  }, [assignments, modules, assignmentSessions]);
  const shouldShowImporter =
    !reviewEntries && (showImporter || !timetableEntries.length);
  function openSlot(slot: CalendarSlot) {
    setSelectedEntryId(null);
    setEventError("");
    setEventDraft({
      mode: onboardingCompleted ? "dated" : "recurring",
      label: "",
      dayOfWeek: slot.dayOfWeek,
      selectedDays: [slot.dayOfWeek],
      date: onboardingCompleted ? (slot.date ?? "") : "",
      start: slot.start,
      end: plusHour(slot.start),
      category: "other",
    });
  }

  function openNewEvent() {
    openSlot({
      dayOfWeek: 1,
      date: calendarDateForDay(visibleCalendarWeekStart, 1),
      start: "16:00",
    });
  }

  function openRecurringCommitment(commitment: Commitment) {
    setSelectedEntryId(null);
    setEventError("");
    setEventDraft({
      mode: "recurring",
      id: commitment.id,
      label: commitment.label,
      dayOfWeek: commitment.dayOfWeek,
      selectedDays: [commitment.dayOfWeek],
      date: "",
      start: commitment.start,
      end: commitment.end,
      category: commitment.category,
    });
  }
  function openDatedCommitment(commitment: DatedCommitment) {
    setSelectedEntryId(null);
    setEventError("");
    setEventDraft({
      mode: "dated",
      id: commitment.id,
      label: commitment.label,
      dayOfWeek: 1,
      date: commitment.date,
      start: commitment.start,
      end: commitment.end,
      category: commitment.category,
    });
  }
  function saveCalendarEvent() {
    if (!eventDraft) return;
    const label = eventDraft.label.trim();
    if (!label) {
      setEventError("Add a name for this event.");
      return;
    }
    if (eventDraft.mode === "dated" && !eventDraft.date) {
      setEventError("Choose a date for this event.");
      return;
    }
    if (!eventDraft.start || !eventDraft.end || eventDraft.end <= eventDraft.start) {
      setEventError("Choose an end time after the start time.");
      return;
    }
  if (eventDraft.mode === "recurring") {
    if (eventDraft.id) {
      const next: Commitment = {
        id: eventDraft.id,
        label,
        dayOfWeek: eventDraft.dayOfWeek,
        start: eventDraft.start,
        end: eventDraft.end,
        category: eventDraft.category,
      };

      setCommitments((current) =>
        current.map((item) => (item.id === eventDraft.id ? next : item)),
      );
    } else {
      const selectedDays = [
        ...new Set(eventDraft.selectedDays ?? [eventDraft.dayOfWeek]),
      ];

      if (!selectedDays.length) {
        setEventError("Select at least one day.");
        return;
      }

      const newCommitments: Commitment[] = selectedDays.map((dayOfWeek) => ({
        id: createId(),
        label,
        dayOfWeek,
        start: eventDraft.start,
        end: eventDraft.end,
        category: eventDraft.category,
      }));

      setCommitments((current) => [...current, ...newCommitments]);
    }
  } else {
  const next: DatedCommitment = {
        id: eventDraft.id ?? createId(),
        label,
        date: eventDraft.date,
        start: eventDraft.start,
        end: eventDraft.end,
        category: eventDraft.category,
      };
      setDatedCommitments((current) =>
        eventDraft.id
          ? current.map((item) => (item.id === eventDraft.id ? next : item))
          : [...current, next],
      );
    }
    setEventDraft(null);
    setEventError("");
  }
  function deleteCalendarEvent() {
    if (!eventDraft?.id) return;
    if (eventDraft.mode === "recurring")
      setCommitments((current) =>
        current.filter((item) => item.id !== eventDraft.id),
      );
    else
      setDatedCommitments((current) =>
        current.filter((item) => item.id !== eventDraft.id),
      );
    setEventDraft(null);
  }

  function saveAssignmentSession(draft: AssignmentSessionEditDraft) {
    setAssignmentSessions((current) => current.map((block) => {
      if (block.id !== draft.id) return block;
      const isCompleted = Boolean(block.completedAt);
      return {
        ...block,
        date: draft.date,
        start: draft.start,
        end: draft.end,
        missedAt: isCompleted || !draft.missed
          ? undefined
          : block.missedAt ?? new Date().toISOString(),
      };
    }));
    setAssignmentSessionDraft(null);
  }

async function importTimetable(file: File | undefined) {
  if (!file) return;

  const version = timetableImageVersion.current + 1;
  timetableImageVersion.current = version;
  setImportState("reading");
  setUploadedFileName(file.name);
  setImportMessage("");
  setPreparedTimetableImage(null);
  setIsPreparingTimetableImage(false);
  setIsAnalysingTimetable(false);
  setTimetableAnalysisError("");
  setReviewEntries(null);
  setReviewWarnings([]);
  setReviewError("");

  try {
    const parsed = parseTimetablePdf(await file.text());
    if (timetableImageVersion.current !== version) return;

    setReviewEntries(
      parsed.entries.map((entry) => ({
        moduleCode: entry.moduleCode,
        moduleName: entry.moduleName,
        day: days[entry.dayOfWeek] as TimetableAnalysisEntry["day"],
        start: entry.start,
        end: entry.end,
        sessionType: entry.sessionType,
      })),
    );

    setImportState("complete");
    setImportMessage(
      `Read ${parsed.entries.length} teaching sessions across ${parsed.moduleCount} modules. Review them before saving.`,
    );
    return;
  } catch {
    // Fall through to the visual fallback below rather than failing
    // immediately - the deterministic parser only understands one specific
    // text layout, so a PDF it can't read is not necessarily unreadable.
  }

  if (timetableImageVersion.current !== version) return;

  // The deterministic parser found no valid rows (compressed content stream,
  // scanned/image-only page, or a different layout). Render the PDF locally
  // and send the prepared image straight to the analyser, then let the student
  // review its results before saving.
  if (!imageAnalysisIsAvailable()) {
    setImportState("error");
    setImportMessage(
      "This PDF's timetable text could not be read directly, and reading it visually needs the hosted analyser. Use the deployed app or configure NEXT_PUBLIC_ANALYZER_URL locally.",
    );
    return;
  }

  setIsPreparingTimetableImage(true);
  let prepared: PreparedAnalysisImage[] | null = null;
  try {
    const renderedImage = await renderPdfToImageFile(file);
    // PDF renderings retain the useful weekday crops, but their source layouts
    // vary too much for the screenshot-only grid-time correction.
    prepared = await prepareTimetableAnalysisImages(renderedImage, {
      deriveSlots: false,
    });
    if (timetableImageVersion.current !== version) return;
  } catch (renderError) {
    if (timetableImageVersion.current !== version) return;
    setImportState("error");
    setImportMessage(
      renderError instanceof Error
        ? renderError.message
        : "We could not read that timetable PDF, even as an image.",
    );
  } finally {
    if (timetableImageVersion.current === version) setIsPreparingTimetableImage(false);
  }

  if (!prepared || timetableImageVersion.current !== version) return;
  setPreparedTimetableImage(prepared);
  setImportState("idle");
  setImportMessage("");
  void analyseTimetableImage(prepared, version);
}

  async function selectTimetableImage(file: File | undefined) {
    if (!file) return;
    const version = timetableImageVersion.current + 1;
    timetableImageVersion.current = version;
    setUploadedFileName(file.name);
    setIsPreparingTimetableImage(true);
    setIsAnalysingTimetable(false);
    setPreparedTimetableImage(null);
    setTimetableAnalysisError("");
    setReviewEntries(null);
    setReviewWarnings([]);
    setReviewError("");
    // A direct image upload is its own attempt, not a continuation of a PDF's
    // text-parse-then-visual-fallback attempt.
    setImportState("idle");
    setImportMessage("");
    try {
      const prepared = await prepareTimetableAnalysisImages(file);
      if (timetableImageVersion.current === version) {
        setPreparedTimetableImage(prepared);
        void analyseTimetableImage(prepared, version);
      }
    } catch (error) {
      if (timetableImageVersion.current === version)
        setTimetableAnalysisError(
          error instanceof Error
            ? error.message
            : "This timetable screenshot could not be prepared.",
        );
    } finally {
      if (timetableImageVersion.current === version)
        setIsPreparingTimetableImage(false);
      if (timetableImageInput.current) timetableImageInput.current.value = "";
    }
  }
  function clearTimetableImage() {
    timetableImageVersion.current += 1;
    setIsPreparingTimetableImage(false);
    setPreparedTimetableImage(null);
    setTimetableAnalysisError("");
    if (timetableImageInput.current) timetableImageInput.current.value = "";
  }
  async function analyseTimetableImage(
    image = preparedTimetableImage,
    version = timetableImageVersion.current,
  ) {
    if (!image) return;
    setIsAnalysingTimetable(true);
    setTimetableAnalysisError("");
    setReviewEntries(null);
    setReviewWarnings([]);
    setReviewError("");
    try {
      const response = await analyzeTimetableScreenshot(image);
      if (timetableImageVersion.current !== version) return;
      setReviewEntries(response.analysis.entries);
      setReviewWarnings(response.analysis.warnings);
      const sessionCount = response.analysis.entries.length;
      setImportState("complete");
      setImportMessage(
        `Found ${sessionCount} teaching session${sessionCount === 1 ? "" : "s"}. Review ${sessionCount === 1 ? "it" : "them"} before saving.`,
      );
    } catch (error) {
      if (timetableImageVersion.current !== version) return;
      setImportState("error");
      setImportMessage(
        "We couldn't analyse the timetable image. Try again or choose another file.",
      );
      setTimetableAnalysisError(
        error instanceof Error
          ? error.message
          : "This timetable could not be analysed.",
      );
    } finally {
      if (timetableImageVersion.current === version) setIsAnalysingTimetable(false);
    }
  }
  function confirmReviewedTimetable(creditsByModuleCode: Record<string, number>) {
    if (!reviewEntries?.length) {
      setReviewError(
        "Add at least one teaching session before confirming the timetable.",
      );
      return;
    }
    const invalid = reviewEntries.find(
      (entry) =>
        !entry.moduleCode?.trim() ||
        !entry.moduleName?.trim() ||
        !/^\d{2}:\d{2}$/.test(entry.start) ||
        !/^\d{2}:\d{2}$/.test(entry.end) ||
        entry.end <= entry.start,
    );
    if (invalid) {
      setReviewError(
        "Each session needs a module code, module name, valid times, and an end time after its start.",
      );
      return;
    }
    if (
      onboardingCompleted &&
      timetableEntries.length &&
      !window.confirm(
        "Importing this timetable replaces recurring teaching sessions and their attendance exceptions. Personal commitments, assignments, and their referenced modules remain.",
      )
    )
      return;
    const nextEntries: TimetableEntry[] = reviewEntries.map((entry) => ({
      id: createId(),
      moduleCode: entry.moduleCode!.trim(),
      moduleName: entry.moduleName!.trim(),
      dayOfWeek: days.indexOf(entry.day),
      start: entry.start,
      end: entry.end,
      sessionType: entry.sessionType,
      attendance: "attending",
      skippedWeeks: [],
    }));
    const existingByCode = new Map(
      modules
        .filter((module) => module.code)
        .map((module) => [module.code!.trim().toUpperCase(), module]),
    );
    const imported = [
      ...new Map(
        nextEntries.map((entry) => [entry.moduleCode.toUpperCase(), entry]),
      ).values(),
    ].map((entry) => {
      const existing = existingByCode.get(entry.moduleCode.toUpperCase());
      return {
        id: existing?.id ?? createId(),
        code: entry.moduleCode,
        name: entry.moduleName,
        credits: creditsByModuleCode[entry.moduleCode.toUpperCase()] ?? existing?.credits ?? 5,
        creditsConfirmed: true,
      };
    });
    const importedIds = new Set(imported.map((module) => module.id));
    const assignedIds = new Set(
      assignments.map((assignment) => assignment.moduleId),
    );
    const preservedAssignedModules = modules.filter(
      (module) => assignedIds.has(module.id) && !importedIds.has(module.id),
    );
    setTimetableEntries(nextEntries);
    setModules([...imported, ...preservedAssignedModules]);
    setSelectedEntryId(null);
    setReviewEntries(null);
    setReviewWarnings([]);
    setReviewError("");
    setPreparedTimetableImage(null);
    setImportState("complete");
    setImportMessage(
      `Saved ${nextEntries.length} recurring teaching sessions across ${imported.length} modules.`,
    );
    setShowImporter(false);
  }

  function saveSelectedEntryAttendance(attendance: TimetableAttendanceChoice) {
    if (!selectedEntry || !selectedEntryWeekKey) return;
    setTimetableEntries((current) =>
      current.map((entry) =>
        entry.id === selectedEntry.id
          ? {
              ...entry,
              attendance:
                attendance === "skip-this-week" ? "attending" : attendance,
              skippedWeeks: attendance === "skip-this-week"
                ? entry.skippedWeeks.includes(selectedEntryWeekKey)
                  ? entry.skippedWeeks
                  : [...entry.skippedWeeks, selectedEntryWeekKey]
                : attendance === "attending"
                  ? entry.skippedWeeks.filter((week) => week !== selectedEntryWeekKey)
                  : entry.skippedWeeks,
            }
          : entry,
      ),
    );
    setSelectedEntryId(null);
  }
  const importControls = (
    <>
      <section
        aria-labelledby="upload-heading"
        className="grid gap-5 border-y border-[var(--line)] py-6 lg:grid-cols-[1.1fr_0.9fr] lg:items-center"
      >
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--accent-strong)]">
            {onboardingCompleted
              ? "Update timetable"
              : "Step 1"}
          </p>
          <h2
            id="upload-heading"
            className="mt-1 text-xl font-semibold tracking-[-0.03em]"
          >
            {onboardingCompleted
              ? "Replace your recurring teaching week."
              : "Import your teaching week."}
          </h2>
          <p className="mt-2 max-w-xl text-sm leading-6 text-[var(--muted-ink)]">
            Upload a screenshot or PDF. You&apos;ll review the extracted classes before
            saving.
          </p>
        </div>
        <div className="flex flex-wrap gap-3 lg:justify-end">
          <label className="inline-flex min-h-11 cursor-pointer items-center justify-center rounded-xl bg-[var(--accent)] px-4 text-sm font-semibold text-white hover:bg-[var(--accent-strong)]">
            {importState === "reading"
              ? "Reading timetable..."
              : isPreparingTimetableImage
                ? "Preparing timetable..."
                : "Upload timetable"}

            <input
              ref={timetableImageInput}
              className="sr-only"
              type="file"
              accept="image/png,image/jpeg,image/webp,application/pdf,.pdf"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";

                if (!file) return;

                const isPdf =
                  file.type === "application/pdf" ||
                  file.name.toLowerCase().endsWith(".pdf");

                if (isPdf) {
                  void importTimetable(file);
                } else {
                  void selectTimetableImage(file);
                }
              }}
              disabled={
                isPreparingTimetableImage ||
                isAnalysingTimetable ||
                importState === "reading"
              }
            />
          </label>

          <a
            href="/semester-1-timetable.pdf"
            download
            className="inline-flex min-h-11 items-center justify-center rounded-xl border border-[var(--line)] bg-[var(--surface)] px-4 text-sm font-semibold text-[var(--ink)] hover:border-[var(--accent)]"
          >
            Download sample
          </a>
        </div>
        <p className="text-sm leading-6 text-[var(--muted-ink)] lg:col-span-2">
          <span className="font-semibold text-[var(--ink)]">For a cleaner import:</span>{" "}
          use a timetable where the weekday labels, times and module names are all visible.
        </p>
        {importState !== "idle" ? (
          <p
            className={`text-sm leading-6 lg:col-span-2 ${importState === "error" ? "text-red-700" : "text-[var(--muted-ink)]"}`}
            role={importState === "error" ? "alert" : "status"}
          >
            {importState === "reading"
              ? `Reading ${uploadedFileName}...`
              : importMessage}
          </p>
        ) : null}
      </section>
      {preparedTimetableImage && !reviewEntries && (isAnalysingTimetable || timetableAnalysisError) ? (
        <section
          className={`grid border-y border-[var(--line)] py-5 ${isAnalysingTimetable ? "grid-cols-1" : "gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"}`}
          aria-live="polite"
        >
          <div>
            <p className="text-sm font-semibold">
              {isAnalysingTimetable
                ? `Analysing ${uploadedFileName || "your timetable"}...`
                : timetableAnalysisError
                  ? "Try again or choose another file."
                  : null}
            </p>
          </div>
          {!isAnalysingTimetable ? (
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => void analyseTimetableImage()}
                className="min-h-11 rounded-xl bg-[var(--accent)] px-4 text-sm font-semibold text-white hover:bg-[var(--accent-strong)]"
              >Try again</button>
              <button
                type="button"
                onClick={clearTimetableImage}
                className="min-h-11 rounded-xl border border-[var(--line)] px-4 text-sm font-semibold text-[var(--muted-ink)] hover:border-[var(--accent)]"
              >
                Remove
              </button>
            </div>
          ) : null}
        </section>
      ) : null}
      {timetableAnalysisError ? (
        <p
          className="border-y border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-800"
          role="alert"
        >
          {timetableAnalysisError}
        </p>
      ) : null}
    </>
  );

  if (!isLoaded)
    return (
      <div
        className="h-96 animate-pulse border-y border-[var(--line)] bg-[var(--surface-soft)]"
        aria-label="Loading calendar"
      />
    );
  return (
    <div className="space-y-8">
      {shouldShowImporter ? importControls : null}
      {reviewEntries ? (
        <TimetableReview
          entries={reviewEntries}
          existingModules={modules}
          warnings={reviewWarnings}
          error={reviewError}
          onChange={(entries) => {
            setReviewEntries(entries);
            setReviewError("");
          }}
          onConfirm={confirmReviewedTimetable}
          onCancel={() => {
            setReviewEntries(null);
            setReviewWarnings([]);
            setReviewError("");
          }}
        />
      ) : null}
      {!reviewEntries && timetableEntries.length ? (
        <>
          <section aria-labelledby="calendar-heading">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <h2
                  id="calendar-heading"
                  className="text-2xl font-semibold tracking-[-0.035em]"
                >
                  {onboardingCompleted ? "This week" : "Build your normal week."}
                </h2>
                <p className="mt-1 text-sm text-[var(--muted-ink)]">
                  {onboardingCompleted
                    ? "Your classes and commitments for this week. Click empty space to add an event."
                    : "Click empty space to add a recurring commitment."}
                </p>
              </div>
              {onboardingCompleted ? (
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={openNewEvent}
                    className="min-h-11 rounded-xl bg-[var(--accent)] px-4 text-sm font-semibold text-white hover:bg-[var(--accent-strong)]"
                  >
                    + Add event
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowImporter((current) => !current)}
                    className="min-h-11 rounded-xl border border-[var(--line)] px-4 text-sm font-semibold text-[var(--muted-ink)] hover:border-[var(--accent)]"
                  >
                    Update timetable
                  </button>
                </div>
              ) : (
                <span className="rounded-full bg-[var(--accent-soft)] px-3 py-1.5 text-xs font-semibold text-[var(--accent-strong)]">
                  {importedModuleCount} modules imported
                </span>
              )}
            </div>
            {onboardingCompleted ? (
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <div className="inline-flex items-center gap-1 rounded-xl border border-[var(--line)] p-1">
                  <button
                    type="button"
                    onClick={() =>
                      setVisibleCalendarWeekStart((current) => addCalendarWeeks(current, -1))
                    }
                    className="min-h-9 min-w-9 rounded-lg text-sm font-semibold text-[var(--muted-ink)] hover:bg-[var(--surface-soft)]"
                    aria-label="Previous week"
                  >
                    ‹
                  </button>
                  <button
                    type="button"
                    onClick={() => setVisibleCalendarWeekStart(getCalendarWeekStart())}
                    className="min-h-9 rounded-lg px-3 text-sm font-semibold text-[var(--muted-ink)] hover:bg-[var(--surface-soft)]"
                  >
                    Today
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setVisibleCalendarWeekStart((current) => addCalendarWeeks(current, 1))
                    }
                    className="min-h-9 min-w-9 rounded-lg text-sm font-semibold text-[var(--muted-ink)] hover:bg-[var(--surface-soft)]"
                    aria-label="Next week"
                  >
                    ›
                  </button>
                </div>
                <span className="text-sm font-semibold text-[var(--muted-ink)]">
                  {formatVisibleWeekRange(visibleCalendarWeekStart)}
                </span>
              </div>
            ) : null}
            <div className="mt-5">
              <WeeklyCalendar
                timetableEntries={timetableEntries}
                commitments={commitments}
                datedCommitments={onboardingCompleted ? datedCommitments : []}
                assignmentSessions={onboardingCompleted ? assignmentSessions : []}
                assignmentSessionLabels={assignmentSessionLabels}
                visibleWeekStart={
                  onboardingCompleted ? visibleCalendarWeekStart : undefined
                }
                selectedEntryId={selectedEntryId}
                isEntrySkipped={
                  onboardingCompleted ? isEntrySkippedOnDate : () => false
                }
                onSelectEntry={
                  onboardingCompleted
                    ? (entry) => {
                        setEventDraft(null);
                        setSelectedEntryId(entry.id);
                      }
                    : undefined
                }
                onSelectCommitment={(commitment) =>
                  openRecurringCommitment(commitment)
                }
                onSelectDatedCommitment={
                  onboardingCompleted
                    ? (commitment) => openDatedCommitment(commitment)
                    : undefined
                }
                onSelectAssignmentSession={
                  onboardingCompleted
                    ? (block) => {
                        setSelectedEntryId(null);
                        setEventDraft(null);
                        setAssignmentSessionDraft(block);
                      }
                    : undefined
                }
                onSelectEmptySlot={openSlot}
              />
            </div>
          </section>
          {!onboardingCompleted ? (
            <>
              <section className="border-t border-[var(--line)] pt-6">
                <h2 className="text-xl font-semibold tracking-[-0.03em]">
                  Your teaching week is set.
                </h2>
                <p className="mt-2 text-sm leading-6 text-[var(--muted-ink)]">
                  Add work, exercise and other regular commitments next. Then
                  you&apos;ll be ready to add an assignment and create its plan.
                </p>
                <button
                  type="button"
                  onClick={() =>
                  setEventDraft({
                    mode: "recurring",
                    label: "",
                    dayOfWeek: 1,
                    selectedDays: [1],
                    date: "",
                    start: "16:00",
                    end: "17:00",
                    category: "other",
                  })
                }
                  className="mt-4 min-h-11 rounded-xl border border-[var(--accent)] px-4 text-sm font-semibold text-[var(--accent-strong)] hover:bg-[var(--accent-soft)]"
                >
                  + Add recurring commitment
                </button>
              </section>
              <section className="border-t border-[var(--line)] pt-6">
                <button
                  type="button"
                  onClick={onCompleteOnboarding}
                  disabled={!canCompleteSetup}
                  className="mt-3 inline-flex min-h-11 items-center justify-center rounded-xl bg-[var(--accent)] px-5 text-sm font-semibold text-white hover:bg-[var(--accent-strong)] disabled:cursor-not-allowed disabled:bg-[var(--line)] disabled:text-[var(--muted-ink)]"
                >
                  {hasBaseline ? "Complete setup" : "Add a recurring constraint"}
                </button>
              </section>
            </>
          ) : (
            <section className="border-t border-[var(--line)] pt-5">
              <p className="text-sm leading-6 text-[var(--muted-ink)]">
                Click a class to manage attendance, a commitment to edit it, or a
                assignment session to adjust its time or mark it missed.
              </p>
            </section>
          )}
        </>
      ) : null}
      {eventDraft ? (
        <EventDialog
          draft={eventDraft}
          onboardingCompleted={onboardingCompleted}
          onChange={(draft) => {
            setEventDraft(draft);
            setEventError("");
          }}
          onSave={saveCalendarEvent}
          onDelete={eventDraft.id ? deleteCalendarEvent : undefined}
          onClose={() => {
            setEventDraft(null);
            setEventError("");
          }}
          error={eventError}
        />
      ) : null}
      {assignmentSessionDraft ? (
        <AssignmentSessionDialog
          block={assignmentSessionDraft}
          onSave={saveAssignmentSession}
          onClose={() => setAssignmentSessionDraft(null)}
        />
      ) : null}
      {onboardingCompleted && selectedEntry ? (
        <TimetableEntryDialog
          key={`${selectedEntry.id}-${selectedEntryWeekKey ?? ""}`}
          entry={selectedEntry}
          weekKey={selectedEntryWeekKey ?? currentWeekKey}
          onSave={saveSelectedEntryAttendance}
          onClose={() => setSelectedEntryId(null)}
        />
      ) : null}
    </div>
  );
}

export function SetupWorkspace() {
  const { onboarding, isOnboardingLoaded, setOnboarding } =
    useOnboardingState();
  if (!isOnboardingLoaded)
    return (
      <div
        className="h-44 animate-pulse border-y border-[var(--line)] bg-[var(--surface-soft)]"
        aria-label="Loading setup"
      />
    );
  function completeOnboarding() {
    const nextState = {
      completed: true,
      completedAt: new Date().toISOString(),
    };
    writeStoredValue(storageKeys.onboarding, nextState);
    setOnboarding(nextState);
    window.dispatchEvent(new Event("planaround:onboarding"));
  }
  return (
    <SetupWorkspaceContent
      onboardingCompleted={onboarding.completed}
      onCompleteOnboarding={completeOnboarding}
    />
  );
}
