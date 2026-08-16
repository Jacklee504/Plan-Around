"use client";

import { type ChangeEvent, useEffect, useRef, useState } from "react";
import { parseTimetablePdf } from "@/lib/timetableParser";
import {
  clearPlanAroundStorage,
  readStoredValue,
  storageKeys,
  writeStoredValue,
} from "@/lib/storage";
import { CALENDAR_DAYS } from "@/lib/calendarLayout";
import { WeeklyCalendar, type CalendarSlot } from "@/components/WeeklyCalendar";
import { initialOnboardingState, useOnboardingState } from "@/lib/onboarding";
import {
  prepareAnalysisImage,
  type PreparedAnalysisImage,
} from "@/lib/analysisImage";
import { analyzeTimetableScreenshot } from "@/lib/timetableAnalyzer";
import type { TimetableAnalysisEntry } from "@/lib/timetableAnalysis";
import { TimetableReview } from "@/components/TimetableReview";
import type {
  Assignment,
  Commitment,
  CommitmentCategory,
  DatedCommitment,
  Module,
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
const categoryLabels: Record<CommitmentCategory, string> = {
  class: "Class",
  work: "Work",
  gym: "Gym",
  meal: "Meal",
  social: "Social",
  other: "Other",
};
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
  date: string;
  start: string;
  end: string;
  category: CommitmentCategory;
};
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
  onResetOnboarding: () => void;
};

const createId = () =>
  window.crypto?.randomUUID?.() ??
  `${Date.now()}-${Math.random().toString(16).slice(2)}`;

function localDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function getWeekKey(date = new Date()) {
  const monday = new Date(date);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  monday.setHours(0, 0, 0, 0);
  return localDateKey(monday);
}
function plusHour(time: string) {
  const [hour, minute] = time.split(":").map(Number);
  const endMinutes = Math.min(hour * 60 + minute + 60, 22 * 60);
  return `${String(Math.floor(endMinutes / 60)).padStart(2, "0")}:${String(endMinutes % 60).padStart(2, "0")}`;
}
const currentWeekKey = getWeekKey();

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
          ) : (
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
          <label className="text-sm font-medium sm:col-span-2">
            Type
            <select
              value={draft.category}
              onChange={(event) =>
                onChange({
                  ...draft,
                  category: event.target.value as CommitmentCategory,
                })
              }
              className={inputClassName}
            >
              {Object.entries(categoryLabels)
                .filter(([category]) => category !== "class")
                .map(([category, label]) => (
                  <option key={category} value={category}>
                    {label}
                  </option>
                ))}
            </select>
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

function SetupWorkspaceContent({
  onboardingCompleted,
  onCompleteOnboarding,
  onResetOnboarding,
}: SetupWorkspaceContentProps) {
  const [modules, setModules] = useState<Module[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [commitments, setCommitments] = useState<Commitment[]>([]);
  const [datedCommitments, setDatedCommitments] = useState<DatedCommitment[]>(
    [],
  );
  const [timetableEntries, setTimetableEntries] = useState<TimetableEntry[]>(
    [],
  );
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
  const [eventDraft, setEventDraft] = useState<CalendarEventDraft | null>(null);
  const [eventError, setEventError] = useState("");
  const [showImporter, setShowImporter] = useState(!onboardingCompleted);
  const [importState, setImportState] = useState<
    "idle" | "reading" | "complete" | "error"
  >("idle");
  const [uploadedFileName, setUploadedFileName] = useState("");
  const [importMessage, setImportMessage] = useState("");
  const [preparedTimetableImage, setPreparedTimetableImage] =
    useState<PreparedAnalysisImage | null>(null);
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
  const importedModuleCount = new Set(
    timetableEntries.map((entry) => entry.moduleCode),
  ).size;
  const isSkippedThisWeek = (entry: TimetableEntry) =>
    entry.attendance === "skip-every-week" ||
    entry.skippedWeeks.includes(currentWeekKey);
  const unconfirmedCreditCount = modules.filter(
    (module) => module.creditsConfirmed !== true,
  ).length;
  const totalBlockedTime = timetableEntries.length + commitments.length;
  const hasBaseline = totalBlockedTime > 0;
  const canCompleteSetup = hasBaseline && unconfirmedCreditCount === 0;
  const shouldShowImporter =
    !reviewEntries && (showImporter || !timetableEntries.length);

  function openSlot(slot: CalendarSlot) {
    setSelectedEntryId(null);
    setEventError("");
    setEventDraft({
      mode: onboardingCompleted ? "dated" : "recurring",
      label: "",
      dayOfWeek: slot.dayOfWeek,
      date: onboardingCompleted ? (slot.date ?? "") : "",
      start: slot.start,
      end: plusHour(slot.start),
      category: "other",
    });
  }
  function openNewEvent() {
    openSlot({ dayOfWeek: 1, date: currentWeekKey, start: "16:00" });
  }
  function openRecurringCommitment(commitment: Commitment) {
    setSelectedEntryId(null);
    setEventError("");
    setEventDraft({
      mode: "recurring",
      id: commitment.id,
      label: commitment.label,
      dayOfWeek: commitment.dayOfWeek,
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
    if (
      !label ||
      eventDraft.end <= eventDraft.start ||
      (eventDraft.mode === "dated" && !eventDraft.date)
    ) {
      setEventError("Add a label and valid start and end time.");
      return;
    }
    if (eventDraft.mode === "recurring") {
      const next: Commitment = {
        id: eventDraft.id ?? createId(),
        label,
        dayOfWeek: eventDraft.dayOfWeek,
        start: eventDraft.start,
        end: eventDraft.end,
        category: eventDraft.category,
      };
      setCommitments((current) =>
        eventDraft.id
          ? current.map((item) => (item.id === eventDraft.id ? next : item))
          : [...current, next],
      );
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

  function updateModuleCredits(moduleId: string, value: string) {
    const credits = Number(value);
    if (Number.isFinite(credits) && credits > 0)
      setModules((current) =>
        current.map((module) =>
          module.id === moduleId
            ? { ...module, credits, creditsConfirmed: false }
            : module,
        ),
      );
  }
  function confirmModuleCredits(moduleId: string) {
    setModules((current) =>
      current.map((module) =>
        module.id === moduleId ? { ...module, creditsConfirmed: true } : module,
      ),
    );
  }

  async function importTimetable(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      setImportState("error");
      setImportMessage(
        "Choose the supplied supported sample PDF for this prototype.",
      );
      return;
    }
    setImportState("reading");
    setUploadedFileName(file.name);
    setImportMessage("");
    try {
      const parsed = parseTimetablePdf(await file.text());
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
      setReviewWarnings([]);
      setReviewError("");
      setImportState("complete");
      setImportMessage(
        `Read ${parsed.entries.length} sample sessions across ${parsed.moduleCount} modules. Review them before saving.`,
      );
    } catch (error) {
      setImportState("error");
      setImportMessage(
        error instanceof Error
          ? error.message
          : "We could not read that timetable.",
      );
    }
  }
  async function selectTimetableImage(file: File | undefined) {
    if (!file) return;
    const version = timetableImageVersion.current + 1;
    timetableImageVersion.current = version;
    setIsPreparingTimetableImage(true);
    setPreparedTimetableImage(null);
    setTimetableAnalysisError("");
    setReviewEntries(null);
    setReviewWarnings([]);
    setReviewError("");
    try {
      const prepared = await prepareAnalysisImage(file);
      if (timetableImageVersion.current === version)
        setPreparedTimetableImage(prepared);
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
  async function analyseTimetableImage() {
    if (!preparedTimetableImage) return;
    setIsAnalysingTimetable(true);
    setTimetableAnalysisError("");
    setReviewEntries(null);
    setReviewWarnings([]);
    setReviewError("");
    try {
      const response = await analyzeTimetableScreenshot(preparedTimetableImage);
      setReviewEntries(response.analysis.entries);
      setReviewWarnings(response.analysis.warnings);
    } catch (error) {
      setTimetableAnalysisError(
        error instanceof Error
          ? error.message
          : "This timetable could not be analysed.",
      );
    } finally {
      setIsAnalysingTimetable(false);
    }
  }
  function confirmReviewedTimetable() {
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
        credits: existing?.credits ?? 5,
        creditsConfirmed: existing?.creditsConfirmed ?? false,
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

  function updateAttendance(attendance: TimetableAttendance) {
    if (!selectedEntry) return;
    setTimetableEntries((current) =>
      current.map((entry) =>
        entry.id === selectedEntry.id
          ? {
              ...entry,
              attendance,
              skippedWeeks:
                attendance === "attending"
                  ? entry.skippedWeeks.filter((week) => week !== currentWeekKey)
                  : entry.skippedWeeks,
            }
          : entry,
      ),
    );
  }
  function skipSelectedEntryThisWeek() {
    if (!selectedEntry) return;
    setTimetableEntries((current) =>
      current.map((entry) =>
        entry.id === selectedEntry.id
          ? {
              ...entry,
              attendance: "attending",
              skippedWeeks: entry.skippedWeeks.includes(currentWeekKey)
                ? entry.skippedWeeks
                : [...entry.skippedWeeks, currentWeekKey],
            }
          : entry,
      ),
    );
  }
  function resetPlanAround() {
    if (
      !window.confirm(
        "Reset all saved PlanAround data on this device? This cannot be undone.",
      )
    )
      return;
    clearPlanAroundStorage();
    setModules([]);
    setAssignments([]);
    setCommitments([]);
    setDatedCommitments([]);
    setTimetableEntries([]);
    setSelectedEntryId(null);
    setEventDraft(null);
    setImportState("idle");
    setUploadedFileName("");
    setImportMessage("");
    onResetOnboarding();
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
              : "Step 1 · Import timetable"}
          </p>
          <h2
            id="upload-heading"
            className="mt-1 text-xl font-semibold tracking-[-0.03em]"
          >
            {onboardingCompleted
              ? "Replace your recurring teaching week."
              : "Import your normal teaching week."}
          </h2>
          <p className="mt-2 max-w-xl text-sm leading-6 text-[var(--muted-ink)]">
            Upload a clear timetable screenshot for AI-assisted extraction,
            then review every detected class in the calendar before confirming.
          </p>
        </div>
        <div className="flex flex-wrap gap-3 lg:justify-end">
          <a
            href="/semester-1-timetable.pdf"
            download
            className="inline-flex min-h-11 items-center justify-center rounded-xl border border-[var(--line)] bg-[var(--surface)] px-4 text-sm font-semibold text-[var(--ink)] hover:border-[var(--accent)]"
          >
            Download sample PDF
          </a>
          <label className="inline-flex min-h-11 cursor-pointer items-center justify-center rounded-xl bg-[var(--accent)] px-4 text-sm font-semibold text-white hover:bg-[var(--accent-strong)]">
            {isPreparingTimetableImage
              ? "Preparing screenshot..."
              : "Upload timetable screenshot"}
            <input
              ref={timetableImageInput}
              className="sr-only"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(event) =>
                void selectTimetableImage(event.target.files?.[0])
              }
              disabled={isPreparingTimetableImage || isAnalysingTimetable}
            />
          </label>
          <label className="inline-flex min-h-11 cursor-pointer items-center justify-center rounded-xl border border-[var(--line)] bg-[var(--surface)] px-4 text-sm font-semibold text-[var(--ink)] hover:border-[var(--accent)]">
            {importState === "reading" ? "Reading sample..." : "Try sample PDF"}
            <input
              className="sr-only"
              type="file"
              accept="application/pdf,.pdf"
              onChange={importTimetable}
              disabled={importState === "reading"}
            />
          </label>
        </div>
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
      {preparedTimetableImage ? (
        <section
          className="grid gap-4 border-y border-[var(--line)] py-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
          aria-live="polite"
        >
          <div>
            <p className="text-sm font-semibold">
              {preparedTimetableImage.filename} is ready to analyse.
            </p>
            <p className="mt-1 text-sm leading-6 text-[var(--muted-ink)]">
              The screenshot is prepared locally and sent only when you choose
              Analyse.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => void analyseTimetableImage()}
              disabled={isAnalysingTimetable}
              className="min-h-11 rounded-xl bg-[var(--accent)] px-4 text-sm font-semibold text-white hover:bg-[var(--accent-strong)] disabled:cursor-wait disabled:opacity-70"
            >
              {isAnalysingTimetable
                ? "Analysing timetable..."
                : "Analyse timetable"}
            </button>
            <button
              type="button"
              onClick={clearTimetableImage}
              disabled={isAnalysingTimetable}
              className="min-h-11 rounded-xl border border-[var(--line)] px-4 text-sm font-semibold text-[var(--muted-ink)] hover:border-[var(--accent)]"
            >
              Remove
            </button>
          </div>
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
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--accent-strong)]">
                  {onboardingCompleted ? "Calendar" : "Your recurring week"}
                </p>
                <h2
                  id="calendar-heading"
                  className="mt-1 text-2xl font-semibold tracking-[-0.035em]"
                >
                  {onboardingCompleted ? "Calendar" : "Build your normal week."}
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
            <div className="mt-5">
              <WeeklyCalendar
                timetableEntries={timetableEntries}
                commitments={commitments}
                datedCommitments={onboardingCompleted ? datedCommitments : []}
                visibleWeekStart={
                  onboardingCompleted ? currentWeekKey : undefined
                }
                selectedEntryId={selectedEntryId}
                isEntrySkipped={
                  onboardingCompleted ? isSkippedThisWeek : () => false
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
                onSelectEmptySlot={openSlot}
              />
            </div>
            {onboardingCompleted && selectedEntry ? (
              <div className="mt-4 grid gap-4 border-y border-[var(--line)] py-4 sm:grid-cols-[1fr_auto] sm:items-center">
                <div>
                  <p className="text-sm font-semibold">
                    {selectedEntry.moduleCode} · {selectedEntry.moduleName}
                  </p>
                  <p className="mt-1 text-sm text-[var(--muted-ink)]">
                    {days[selectedEntry.dayOfWeek]}, {selectedEntry.start} to{" "}
                    {selectedEntry.end} ·{" "}
                    {sessionLabels[selectedEntry.sessionType]}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => updateAttendance("attending")}
                    className={`min-h-10 rounded-lg px-3 text-sm font-semibold ${selectedEntry.attendance === "attending" ? "bg-[var(--accent)] text-white" : "border border-[var(--line)]"}`}
                  >
                    Going
                  </button>
                  <button
                    type="button"
                    onClick={skipSelectedEntryThisWeek}
                    className={`min-h-10 rounded-lg px-3 text-sm font-semibold ${selectedEntry.skippedWeeks.includes(currentWeekKey) ? "bg-[var(--ink)] text-white" : "border border-[var(--line)]"}`}
                  >
                    Not going this week
                  </button>
                  <button
                    type="button"
                    onClick={() => updateAttendance("skip-every-week")}
                    className={`min-h-10 rounded-lg px-3 text-sm font-semibold ${selectedEntry.attendance === "skip-every-week" ? "bg-[var(--ink)] text-white" : "border border-[var(--line)]"}`}
                  >
                    Not going every week
                  </button>
                </div>
              </div>
            ) : null}
          </section>
          {!onboardingCompleted ? (
            <>
              <section className="border-t border-[var(--line)] pt-6">
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--accent-strong)]">
                  Step 2 · Add normal commitments
                </p>
                <h2 className="mt-1 text-xl font-semibold tracking-[-0.03em]">
                  Keep your recurring life in view.
                </h2>
                <p className="mt-2 text-sm leading-6 text-[var(--muted-ink)]">
                  Click an empty part of the calendar to add a recurring
                  commitment.
                </p>
                <button
                  type="button"
                  onClick={() =>
                    setEventDraft({
                      mode: "recurring",
                      label: "",
                      dayOfWeek: 1,
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
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--accent-strong)]">
                  Step 3 · Check your normal week
                </p>
                <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm">
                  <span>
                    <strong>{modules.length}</strong> modules
                  </span>
                  <span>
                    <strong>{totalBlockedTime}</strong> weekly blocks
                  </span>
                  <span>
                    {timetableEntries.length
                      ? "✓ Calendar reviewed"
                      : "! Calendar needed"}
                  </span>
                  <span>
                    {commitments.length
                      ? "✓ Recurring commitments added"
                      : "Add commitments if needed"}
                  </span>
                  <span
                    className={
                      unconfirmedCreditCount
                        ? "text-amber-800"
                        : "text-[var(--accent-strong)]"
                    }
                  >
                    {unconfirmedCreditCount
                      ? `! ${unconfirmedCreditCount} module credit value${unconfirmedCreditCount === 1 ? "" : "s"} need confirmation`
                      : "✓ Module credits confirmed"}
                  </span>
                </div>
                {modules.length ? (
                  <div className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {modules.map((module) => (
                      <div
                        key={module.id}
                        className="rounded-xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3"
                      >
                        <p className="text-sm font-semibold">{module.name}</p>
                        <p className="mt-1 text-xs text-[var(--muted-ink)]">
                          {module.code ?? "No code"}
                        </p>
                        <label className="mt-3 block text-xs font-semibold text-[var(--muted-ink)]">
                          ECTS
                          <input
                            value={module.credits}
                            onChange={(event) =>
                              updateModuleCredits(module.id, event.target.value)
                            }
                            className="mt-1 min-h-10 w-full rounded-lg border border-[var(--line)] bg-[var(--surface-soft)] px-3 text-sm text-[var(--ink)]"
                            type="number"
                            min="0.5"
                            step="0.5"
                          />
                        </label>
                        <button
                          type="button"
                          onClick={() => confirmModuleCredits(module.id)}
                          className={`mt-3 min-h-10 w-full rounded-lg px-3 text-sm font-semibold ${module.creditsConfirmed ? "bg-[var(--accent-soft)] text-[var(--accent-strong)]" : "bg-[var(--accent)] text-white hover:bg-[var(--accent-strong)]"}`}
                        >
                          {module.creditsConfirmed
                            ? "Credits confirmed"
                            : `Confirm ${module.credits} ECTS`}
                        </button>
                      </div>
                    ))}
                  </div>
                ) : null}
                <button
                  type="button"
                  onClick={onCompleteOnboarding}
                  disabled={!canCompleteSetup}
                  className="mt-5 inline-flex min-h-11 items-center justify-center rounded-xl bg-[var(--accent)] px-5 text-sm font-semibold text-white hover:bg-[var(--accent-strong)] disabled:cursor-not-allowed disabled:bg-[var(--line)] disabled:text-[var(--muted-ink)]"
                >
                  {unconfirmedCreditCount
                    ? "Confirm credits to continue"
                    : hasBaseline
                      ? "Complete setup"
                      : "Add a recurring constraint"}
                </button>
                <button
                  type="button"
                  onClick={resetPlanAround}
                  className="mt-3 min-h-10 px-2 text-sm font-semibold text-[var(--muted-ink)] hover:text-red-700"
                >
                  Reset PlanAround
                </button>
              </section>
            </>
          ) : (
            <section className="flex flex-wrap items-center justify-between gap-4 border-t border-[var(--line)] pt-5">
              <p className="text-sm leading-6 text-[var(--muted-ink)]">
                Click a class to manage attendance, or any commitment to edit or
                delete it.
              </p>
              <button
                type="button"
                onClick={resetPlanAround}
                className="min-h-10 px-2 text-sm font-semibold text-[var(--muted-ink)] hover:text-red-700"
              >
                Reset all PlanAround data
              </button>
            </section>
          )}
        </>
      ) : !reviewEntries ? (
        <section className="rounded-2xl border border-dashed border-[var(--line)] bg-[var(--surface-soft)] px-5 py-8 text-sm leading-6 text-[var(--muted-ink)]">
          Import a timetable screenshot, or use the supported sample PDF, to
          start your editable Semester 1 calendar.
        </section>
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
  function resetOnboarding() {
    writeStoredValue(storageKeys.onboarding, initialOnboardingState);
    setOnboarding(initialOnboardingState);
    window.dispatchEvent(new Event("planaround:onboarding"));
  }
  return (
    <SetupWorkspaceContent
      onboardingCompleted={onboarding.completed}
      onCompleteOnboarding={completeOnboarding}
      onResetOnboarding={resetOnboarding}
    />
  );
}
