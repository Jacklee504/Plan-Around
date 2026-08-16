"use client";

import Link from "next/link";
import { type ChangeEvent, type FormEvent, useEffect, useRef, useState } from "react";
import { parseTimetablePdf } from "@/lib/timetableParser";
import { clearPlanAroundStorage, readStoredValue, storageKeys, writeStoredValue } from "@/lib/storage";
import { CALENDAR_DAYS } from "@/lib/calendarLayout";
import { WeeklyCalendar } from "@/components/WeeklyCalendar";
import { initialOnboardingState, useOnboardingState } from "@/lib/onboarding";
import { prepareAnalysisImage, type PreparedAnalysisImage } from "@/lib/analysisImage";
import { analyzeTimetableScreenshot } from "@/lib/timetableAnalyzer";
import type { TimetableAnalysisEntry } from "@/lib/timetableAnalysis";
import { TimetableReview } from "@/components/TimetableReview";
import type { Commitment, CommitmentCategory, DatedCommitment, Module, TimetableAttendance, TimetableEntry } from "@/types";

const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const calendarDays = CALENDAR_DAYS;

const categoryLabels: Record<CommitmentCategory, string> = {
  class: "Class",
  work: "Work",
  gym: "Gym",
  meal: "Meal",
  social: "Social",
  other: "Other",
};

const sessionLabels = { lecture: "Lecture", lab: "Lab", tutorial: "Tutorial", other: "Class" } as const;

const inputClassName =
  "mt-1.5 min-h-11 w-full rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 text-sm text-[var(--ink)] outline-none transition-colors placeholder:text-[var(--muted-ink)] focus:border-[var(--accent)]";

type ModuleDraft = { name: string; code: string; credits: string };
type CommitmentDraft = { label: string; dayOfWeek: string; start: string; end: string; category: CommitmentCategory };
type DatedCommitmentDraft = { label: string; date: string; start: string; end: string; category: CommitmentCategory };

const emptyModuleDraft: ModuleDraft = { name: "", code: "", credits: "5" };
const emptyCommitmentDraft: CommitmentDraft = { label: "", dayOfWeek: "1", start: "16:00", end: "17:00", category: "other" };
const emptyDatedCommitmentDraft: DatedCommitmentDraft = { label: "", date: "", start: "16:00", end: "17:00", category: "other" };

const createId = () => window.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;

function localDateKey(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getWeekKey(date = new Date()) {
  const monday = new Date(date);
  const distanceFromMonday = (monday.getDay() + 6) % 7;
  monday.setDate(monday.getDate() - distanceFromMonday);
  monday.setHours(0, 0, 0, 0);
  return localDateKey(monday);
}

const currentWeekKey = getWeekKey();

type LegacyTimetableEntry = Omit<TimetableEntry, "attendance" | "skippedWeeks"> & {
  attendance?: TimetableAttendance | "skip-this-week";
  skippedWeeks?: string[];
};

type SetupWorkspaceContentProps = {
  onboardingCompleted: boolean;
  onCompleteOnboarding: () => void;
  onResetOnboarding: () => void;
};

function SetupWorkspaceContent({ onboardingCompleted, onCompleteOnboarding, onResetOnboarding }: SetupWorkspaceContentProps) {
  const [modules, setModules] = useState<Module[]>([]);
  const [commitments, setCommitments] = useState<Commitment[]>([]);
  const [datedCommitments, setDatedCommitments] = useState<DatedCommitment[]>([]);
  const [timetableEntries, setTimetableEntries] = useState<TimetableEntry[]>([]);
  const [moduleDraft, setModuleDraft] = useState<ModuleDraft>(emptyModuleDraft);
  const [commitmentDraft, setCommitmentDraft] = useState<CommitmentDraft>(emptyCommitmentDraft);
  const [datedCommitmentDraft, setDatedCommitmentDraft] = useState<DatedCommitmentDraft>(emptyDatedCommitmentDraft);
  const [editingModuleId, setEditingModuleId] = useState<string | null>(null);
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
  const [importState, setImportState] = useState<"idle" | "reading" | "complete" | "error">("idle");
  const [uploadedFileName, setUploadedFileName] = useState("");
  const [importMessage, setImportMessage] = useState("");
  const [preparedTimetableImage, setPreparedTimetableImage] = useState<PreparedAnalysisImage | null>(null);
  const [isPreparingTimetableImage, setIsPreparingTimetableImage] = useState(false);
  const [isAnalysingTimetable, setIsAnalysingTimetable] = useState(false);
  const [timetableAnalysisError, setTimetableAnalysisError] = useState("");
  const [reviewEntries, setReviewEntries] = useState<TimetableAnalysisEntry[] | null>(null);
  const [reviewWarnings, setReviewWarnings] = useState<string[]>([]);
  const [reviewError, setReviewError] = useState("");
  const timetableImageInput = useRef<HTMLInputElement>(null);
  const timetableImageVersion = useRef(0);
  const [moduleError, setModuleError] = useState("");
  const [commitmentError, setCommitmentError] = useState("");
  const [datedCommitmentError, setDatedCommitmentError] = useState("");
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    const hydrationTimer = window.setTimeout(() => {
      setModules(readStoredValue<Module[]>(storageKeys.modules, []));
      setCommitments(readStoredValue<Commitment[]>(storageKeys.commitments, []));
      setDatedCommitments(readStoredValue<DatedCommitment[]>(storageKeys.datedCommitments, []));
      const storedEntries = readStoredValue<LegacyTimetableEntry[]>(storageKeys.timetableEntries, []);
      setTimetableEntries(storedEntries.map((entry) => ({
        ...entry,
        attendance: entry.attendance === "skip-every-week" ? "skip-every-week" : "attending",
        skippedWeeks: entry.skippedWeeks ?? (entry.attendance === "skip-this-week" ? [currentWeekKey] : []),
      })));
      setIsLoaded(true);
    }, 0);

    return () => window.clearTimeout(hydrationTimer);
  }, []);

  useEffect(() => {
    if (isLoaded) writeStoredValue(storageKeys.modules, modules);
  }, [isLoaded, modules]);

  useEffect(() => {
    if (isLoaded) writeStoredValue(storageKeys.commitments, commitments);
  }, [commitments, isLoaded]);

  useEffect(() => {
    if (isLoaded) writeStoredValue(storageKeys.datedCommitments, datedCommitments);
  }, [datedCommitments, isLoaded]);

  useEffect(() => {
    if (isLoaded) writeStoredValue(storageKeys.timetableEntries, timetableEntries);
  }, [isLoaded, timetableEntries]);

  const selectedEntry = timetableEntries.find((entry) => entry.id === selectedEntryId) ?? null;
  const importedModuleCount = new Set(timetableEntries.map((entry) => entry.moduleCode)).size;
  const hasTimetable = timetableEntries.length > 0;
  const isSkippedThisWeek = (entry: TimetableEntry) => entry.attendance === "skip-every-week" || entry.skippedWeeks.includes(currentWeekKey);
  const totalBlockedTime = timetableEntries.filter((entry) => !isSkippedThisWeek(entry)).length + commitments.length;
  const unconfirmedCreditCount = modules.filter((module) => module.creditsConfirmed !== true).length;
  const hasBaseline = totalBlockedTime > 0;
  const canCompleteSetup = hasBaseline && unconfirmedCreditCount === 0;

  function resetModuleForm() {
    setModuleDraft(emptyModuleDraft);
    setEditingModuleId(null);
    setModuleError("");
  }

  function saveModule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = moduleDraft.name.trim();
    const credits = Number(moduleDraft.credits);
    if (!name || !Number.isFinite(credits) || credits <= 0) {
      setModuleError("Add a module name and a valid ECTS value.");
      return;
    }

    const nextModule: Module = { id: editingModuleId ?? createId(), name, code: moduleDraft.code.trim() || undefined, credits, creditsConfirmed: true };
    setModules((current) => editingModuleId ? current.map((module) => module.id === editingModuleId ? nextModule : module) : [...current, nextModule]);
    resetModuleForm();
  }

  function saveCommitment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const label = commitmentDraft.label.trim();
    const dayOfWeek = Number(commitmentDraft.dayOfWeek);
    if (!label || !Number.isInteger(dayOfWeek) || commitmentDraft.end <= commitmentDraft.start) {
      setCommitmentError("Add a label and a valid start and end time.");
      return;
    }

    setCommitments((current) => [...current, {
      id: createId(),
      label,
      dayOfWeek,
      start: commitmentDraft.start,
      end: commitmentDraft.end,
      category: commitmentDraft.category,
    }]);
    setCommitmentDraft(emptyCommitmentDraft);
    setCommitmentError("");
  }

  function saveDatedCommitment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const label = datedCommitmentDraft.label.trim();
    if (!label || !datedCommitmentDraft.date || datedCommitmentDraft.end <= datedCommitmentDraft.start) {
      setDatedCommitmentError("Add a label, date, and valid start and end time.");
      return;
    }
    setDatedCommitments((current) => [...current, {
      id: createId(),
      label,
      date: datedCommitmentDraft.date,
      start: datedCommitmentDraft.start,
      end: datedCommitmentDraft.end,
      category: datedCommitmentDraft.category,
    }]);
    setDatedCommitmentDraft(emptyDatedCommitmentDraft);
    setDatedCommitmentError("");
  }

  async function importTimetable(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    if (!file.name.toLowerCase().endsWith(".pdf")) {
      setImportState("error");
      setImportMessage("Choose a PDF timetable for this first prototype.");
      return;
    }

    setImportState("reading");
    setUploadedFileName(file.name);
    setImportMessage("");

    try {
      const pdfContent = await file.text();
      const parsed = parseTimetablePdf(pdfContent);
      setReviewEntries(parsed.entries.map((entry) => ({
        moduleCode: entry.moduleCode,
        moduleName: entry.moduleName,
        day: days[entry.dayOfWeek] as TimetableAnalysisEntry["day"],
        start: entry.start,
        end: entry.end,
        sessionType: entry.sessionType,
      })));
      setReviewWarnings([]);
      setReviewError("");
      setImportState("complete");
      setImportMessage(`Read ${parsed.entries.length} sample sessions across ${parsed.moduleCount} modules. Review them before saving.`);
    } catch (error) {
      setImportState("error");
      setImportMessage(error instanceof Error ? error.message : "We could not read that timetable.");
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
      const preparedImage = await prepareAnalysisImage(file);
      if (timetableImageVersion.current !== version) return;
      setPreparedTimetableImage(preparedImage);
    } catch (error) {
      if (timetableImageVersion.current !== version) return;
      setTimetableAnalysisError(error instanceof Error ? error.message : "This timetable screenshot could not be prepared.");
    } finally {
      if (timetableImageVersion.current === version) setIsPreparingTimetableImage(false);
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
      setTimetableAnalysisError(error instanceof Error ? error.message : "This timetable could not be analysed.");
    } finally {
      setIsAnalysingTimetable(false);
    }
  }

  function confirmReviewedTimetable() {
    if (!reviewEntries?.length) {
      setReviewError("Add at least one teaching session before confirming the timetable.");
      return;
    }
    const invalidEntry = reviewEntries.find((entry) => !entry.moduleCode?.trim() || !entry.moduleName.trim() || !/^\d{2}:\d{2}$/.test(entry.start) || !/^\d{2}:\d{2}$/.test(entry.end) || entry.end <= entry.start);
    if (invalidEntry) {
      setReviewError("Each session needs a module code, name, valid times, and an end time after its start.");
      return;
    }
    if (onboardingCompleted && timetableEntries.length && !window.confirm("Importing this timetable will replace your current recurring teaching sessions. Your personal commitments and assignments will remain.")) return;

    const nextEntries = reviewEntries.map((entry) => ({
      id: createId(),
      moduleCode: entry.moduleCode!.trim(),
      moduleName: entry.moduleName.trim(),
      dayOfWeek: days.indexOf(entry.day),
      start: entry.start,
      end: entry.end,
      sessionType: entry.sessionType,
      attendance: "attending" as const,
      skippedWeeks: [],
    }));
    const existingModulesByCode = new Map(modules.filter((module) => module.code).map((module) => [module.code!.trim().toUpperCase(), module]));
    const importedModules = [...new Map(nextEntries.map((entry) => [entry.moduleCode.toUpperCase(), entry])).values()].map((entry) => {
      const existingModule = existingModulesByCode.get(entry.moduleCode.toUpperCase());
      return {
        id: existingModule?.id ?? createId(),
        code: entry.moduleCode,
        name: entry.moduleName,
        credits: existingModule?.credits ?? 5,
        creditsConfirmed: existingModule?.creditsConfirmed ?? false,
      };
    });

    setTimetableEntries(nextEntries);
    setModules(importedModules);
    setSelectedEntryId(null);
    setReviewEntries(null);
    setReviewWarnings([]);
    setReviewError("");
    setPreparedTimetableImage(null);
    setImportState("complete");
    setImportMessage(`Saved ${nextEntries.length} recurring teaching sessions across ${importedModules.length} modules.`);
  }

  function updateAttendance(attendance: TimetableAttendance) {
    if (!selectedEntry) return;
    setTimetableEntries((current) => current.map((entry) => entry.id === selectedEntry.id ? {
      ...entry,
      attendance,
      skippedWeeks: attendance === "attending" ? entry.skippedWeeks.filter((week) => week !== currentWeekKey) : entry.skippedWeeks,
    } : entry));
  }

  function skipSelectedEntryThisWeek() {
    if (!selectedEntry) return;
    setTimetableEntries((current) => current.map((entry) => entry.id === selectedEntry.id ? {
      ...entry,
      attendance: "attending",
      skippedWeeks: entry.skippedWeeks.includes(currentWeekKey) ? entry.skippedWeeks : [...entry.skippedWeeks, currentWeekKey],
    } : entry));
  }

  function updateModuleCredits(moduleId: string, value: string) {
    const credits = Number(value);
    if (!Number.isFinite(credits) || credits <= 0) return;
    setModules((current) => current.map((module) => module.id === moduleId ? { ...module, credits, creditsConfirmed: false } : module));
  }

  function confirmModuleCredits(moduleId: string) {
    setModules((current) => current.map((module) => module.id === moduleId ? { ...module, creditsConfirmed: true } : module));
  }

  function resetPlanAround() {
    if (!window.confirm("Reset all saved PlanAround data on this device? This cannot be undone.")) {
      return;
    }

    clearPlanAroundStorage();
    setModules([]);
    setCommitments([]);
    setDatedCommitments([]);
    setTimetableEntries([]);
    setModuleDraft(emptyModuleDraft);
    setCommitmentDraft(emptyCommitmentDraft);
    setDatedCommitmentDraft(emptyDatedCommitmentDraft);
    setSelectedEntryId(null);
    setImportState("idle");
    setUploadedFileName("");
    setImportMessage("");
    setModuleError("");
    setCommitmentError("");
    setDatedCommitmentError("");
    onResetOnboarding();
  }

  return (
    <div className="space-y-10">
      {!onboardingCompleted ? <section className="border-y border-[var(--line)] py-4" aria-label="Setup progress"><ol className="grid gap-2 text-sm sm:grid-cols-3"><li className="font-semibold text-[var(--accent-strong)]">1. Timetable</li><li className="text-[var(--muted-ink)]">2. Recurring commitments</li><li className="text-[var(--muted-ink)]">3. Review week</li></ol></section> : null}
      <section aria-labelledby="upload-heading" className="grid gap-5 border-y border-[var(--line)] py-6 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--accent-strong)]">{onboardingCompleted ? "Recurring teaching timetable" : "Step 1: recurring teaching timetable"}</p>
          <h2 id="upload-heading" className="mt-1 text-xl font-semibold tracking-[-0.03em]">{onboardingCompleted ? "Update your normal teaching week." : "Import your normal teaching week."}</h2>
          <p className="mt-2 max-w-xl text-sm leading-6 text-[var(--muted-ink)]">Use the supplied supported sample PDF for this prototype, then check its modules and classes before you save the recurring baseline.</p>
        </div>
        <div className="flex flex-wrap gap-3 lg:justify-end">
          <Link href="/semester-1-timetable.pdf" download className="inline-flex min-h-11 items-center justify-center rounded-xl border border-[var(--line)] bg-[var(--surface)] px-4 text-sm font-semibold text-[var(--ink)] transition-colors hover:border-[var(--accent)]">
            Download sample PDF
          </Link>
          <label className="inline-flex min-h-11 cursor-pointer items-center justify-center rounded-xl bg-[var(--accent)] px-4 text-sm font-semibold text-white transition-colors hover:bg-[var(--accent-strong)]">
            {isPreparingTimetableImage ? "Preparing screenshot..." : "Upload timetable screenshot"}
            <input ref={timetableImageInput} className="sr-only" type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => void selectTimetableImage(event.target.files?.[0])} disabled={isPreparingTimetableImage || isAnalysingTimetable} />
          </label>
          <label className="inline-flex min-h-11 cursor-pointer items-center justify-center rounded-xl border border-[var(--line)] bg-[var(--surface)] px-4 text-sm font-semibold text-[var(--ink)] transition-colors hover:border-[var(--accent)]">
            {importState === "reading" ? "Reading sample..." : "Try sample PDF"}
            <input className="sr-only" type="file" accept="application/pdf,.pdf" onChange={importTimetable} disabled={importState === "reading"} />
          </label>
        </div>
        {importState !== "idle" ? (
          <p className={`text-sm leading-6 lg:col-span-2 ${importState === "error" ? "text-red-700" : "text-[var(--muted-ink)]"}`} role={importState === "error" ? "alert" : "status"}>
            {importState === "reading" ? `Reading ${uploadedFileName}...` : importMessage}
          </p>
        ) : null}
      </section>

      {preparedTimetableImage ? <section className="grid gap-4 border-y border-[var(--line)] py-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center" aria-live="polite"><div><p className="text-sm font-semibold">{preparedTimetableImage.filename} is ready to analyse.</p><p className="mt-1 text-sm leading-6 text-[var(--muted-ink)]">The screenshot was prepared locally and is sent to the hosted analyser only when you click Analyse.</p></div><div className="flex flex-wrap gap-3"><button type="button" onClick={() => void analyseTimetableImage()} disabled={isAnalysingTimetable} className="min-h-11 rounded-xl bg-[var(--accent)] px-4 text-sm font-semibold text-white hover:bg-[var(--accent-strong)] disabled:cursor-wait disabled:opacity-70">{isAnalysingTimetable ? "Analysing timetable..." : "Analyse timetable"}</button><button type="button" onClick={clearTimetableImage} disabled={isAnalysingTimetable} className="min-h-11 rounded-xl border border-[var(--line)] px-4 text-sm font-semibold text-[var(--muted-ink)] hover:border-[var(--accent)]">Remove</button></div></section> : null}
      {timetableAnalysisError ? <p className="border-y border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-800" role="alert">{timetableAnalysisError}</p> : null}
      {reviewEntries ? <TimetableReview entries={reviewEntries} warnings={reviewWarnings} error={reviewError} onChange={(entries) => { setReviewEntries(entries); setReviewError(""); }} onConfirm={confirmReviewedTimetable} onCancel={() => { setReviewEntries(null); setReviewWarnings([]); setReviewError(""); }} /> : null}

      {hasTimetable ? (
        <>
          <section aria-labelledby="calendar-heading">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--accent-strong)]">Your actual week</p>
                <h2 id="calendar-heading" className="mt-1 text-2xl font-semibold tracking-[-0.035em]">Calendar</h2>
                <p className="mt-1 text-sm text-[var(--muted-ink)]">{onboardingCompleted ? "Select a teaching session to manage your attendance for this week." : "Review your normal recurring sessions. Week-specific attendance changes come after setup."}</p>
              </div>
              <span className="rounded-full bg-[var(--accent-soft)] px-3 py-1.5 text-xs font-semibold text-[var(--accent-strong)]">{importedModuleCount} modules imported</span>
            </div>

            <div className="mt-5"><WeeklyCalendar timetableEntries={timetableEntries} commitments={commitments} datedCommitments={onboardingCompleted ? datedCommitments : []} visibleWeekStart={onboardingCompleted ? currentWeekKey : undefined} selectedEntryId={selectedEntryId} isEntrySkipped={onboardingCompleted ? isSkippedThisWeek : () => false} onSelectEntry={onboardingCompleted ? (entry) => setSelectedEntryId(entry.id) : undefined} /></div>

            {onboardingCompleted && selectedEntry ? (
              <div className="mt-4 grid gap-4 border-y border-[var(--line)] py-4 sm:grid-cols-[1fr_auto] sm:items-center">
                <div>
                  <p className="text-sm font-semibold">{selectedEntry.moduleCode} · {selectedEntry.moduleName}</p>
                  <p className="mt-1 text-sm text-[var(--muted-ink)]">{days[selectedEntry.dayOfWeek]}, {selectedEntry.start} to {selectedEntry.end} · {sessionLabels[selectedEntry.sessionType]}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => updateAttendance("attending")} className={`min-h-10 rounded-lg px-3 text-sm font-semibold ${selectedEntry.attendance === "attending" ? "bg-[var(--accent)] text-white" : "border border-[var(--line)]"}`}>Going</button>
                  <button type="button" onClick={skipSelectedEntryThisWeek} className={`min-h-10 rounded-lg px-3 text-sm font-semibold ${selectedEntry.skippedWeeks.includes(currentWeekKey) ? "bg-[var(--ink)] text-white" : "border border-[var(--line)]"}`}>Not going this week</button>
                  <button type="button" onClick={() => updateAttendance("skip-every-week")} className={`min-h-10 rounded-lg px-3 text-sm font-semibold ${selectedEntry.attendance === "skip-every-week" ? "bg-[var(--ink)] text-white" : "border border-[var(--line)]"}`}>Not going every week</button>
                </div>
              </div>
            ) : null}
          </section>

          <section className="grid gap-8 border-t border-[var(--line)] pt-8 lg:grid-cols-[minmax(0,1fr)_minmax(19rem,0.72fr)]">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--accent-strong)]">{onboardingCompleted ? "Recurring baseline" : "Step 2: recurring commitments"}</p>
              <h2 className="mt-1 text-xl font-semibold tracking-[-0.03em]">Add your regular weekly commitments.</h2>
              <p className="mt-2 text-sm leading-6 text-[var(--muted-ink)]">Add time that is reliably part of your normal week, such as work, gym, meals or a club. You can change it later.</p>
              <form onSubmit={saveCommitment} className="mt-5 grid gap-3 rounded-2xl bg-[var(--surface-soft)] p-4 sm:grid-cols-2">
                <label className="text-sm font-medium sm:col-span-2">What is this time for?<input value={commitmentDraft.label} onChange={(event) => setCommitmentDraft((current) => ({ ...current, label: event.target.value }))} className={inputClassName} placeholder="Part-time work" autoComplete="off" /></label>
                <label className="text-sm font-medium">Day<select value={commitmentDraft.dayOfWeek} onChange={(event) => setCommitmentDraft((current) => ({ ...current, dayOfWeek: event.target.value }))} className={inputClassName}>{calendarDays.map((day) => <option key={day} value={day}>{days[day]}</option>)}</select></label>
                <label className="text-sm font-medium">Category<select value={commitmentDraft.category} onChange={(event) => setCommitmentDraft((current) => ({ ...current, category: event.target.value as CommitmentCategory }))} className={inputClassName}>{Object.entries(categoryLabels).filter(([category]) => category !== "class").map(([category, label]) => <option key={category} value={category}>{label}</option>)}</select></label>
                <label className="text-sm font-medium">Start<input value={commitmentDraft.start} onChange={(event) => setCommitmentDraft((current) => ({ ...current, start: event.target.value }))} className={inputClassName} type="time" /></label>
                <label className="text-sm font-medium">End<input value={commitmentDraft.end} onChange={(event) => setCommitmentDraft((current) => ({ ...current, end: event.target.value }))} className={inputClassName} type="time" /></label>
                {commitmentError ? <p className="text-sm text-red-700 sm:col-span-2">{commitmentError}</p> : null}
                <button type="submit" className="min-h-11 rounded-xl bg-[var(--accent)] px-4 text-sm font-semibold text-white transition-colors hover:bg-[var(--accent-strong)] sm:col-span-2">Add to calendar</button>
              </form>
              {onboardingCompleted ? <section className="mt-7 border-t border-[var(--line)] pt-6" aria-labelledby="one-off-heading"><p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--accent-strong)]">One-off commitment</p><h3 id="one-off-heading" className="mt-1 text-lg font-semibold tracking-[-0.025em]">Protect a specific date.</h3><p className="mt-1 text-sm leading-6 text-[var(--muted-ink)]">Use this for something occasional, such as a shift, appointment, trip or event. It will not repeat next week.</p><form onSubmit={saveDatedCommitment} className="mt-4 grid gap-3 rounded-2xl bg-[var(--surface-soft)] p-4 sm:grid-cols-2"><label className="text-sm font-medium sm:col-span-2">What is this time for?<input value={datedCommitmentDraft.label} onChange={(event) => setDatedCommitmentDraft((current) => ({ ...current, label: event.target.value }))} className={inputClassName} placeholder="Dentist appointment" autoComplete="off" /></label><label className="text-sm font-medium">Date<input value={datedCommitmentDraft.date} onChange={(event) => setDatedCommitmentDraft((current) => ({ ...current, date: event.target.value }))} className={inputClassName} type="date" /></label><label className="text-sm font-medium">Category<select value={datedCommitmentDraft.category} onChange={(event) => setDatedCommitmentDraft((current) => ({ ...current, category: event.target.value as CommitmentCategory }))} className={inputClassName}>{Object.entries(categoryLabels).filter(([category]) => category !== "class").map(([category, label]) => <option key={category} value={category}>{label}</option>)}</select></label><label className="text-sm font-medium">Start<input value={datedCommitmentDraft.start} onChange={(event) => setDatedCommitmentDraft((current) => ({ ...current, start: event.target.value }))} className={inputClassName} type="time" /></label><label className="text-sm font-medium">End<input value={datedCommitmentDraft.end} onChange={(event) => setDatedCommitmentDraft((current) => ({ ...current, end: event.target.value }))} className={inputClassName} type="time" /></label>{datedCommitmentError ? <p className="text-sm text-red-700 sm:col-span-2">{datedCommitmentError}</p> : null}<button type="submit" className="min-h-11 rounded-xl border border-[var(--accent)] px-4 text-sm font-semibold text-[var(--accent-strong)] hover:bg-[var(--accent-soft)] sm:col-span-2">Add one-off commitment</button></form>{datedCommitments.length ? <ul className="mt-4 divide-y divide-[var(--line)] border-y border-[var(--line)]">{datedCommitments.slice().sort((first, second) => first.date.localeCompare(second.date) || first.start.localeCompare(second.start)).map((commitment) => <li key={commitment.id} className="flex items-center justify-between gap-3 py-3 text-sm"><span><span className="font-semibold">{commitment.label}</span><span className="text-[var(--muted-ink)]"> · {commitment.date}, {commitment.start}–{commitment.end}</span></span><button type="button" onClick={() => setDatedCommitments((current) => current.filter((item) => item.id !== commitment.id))} className="min-h-10 px-2 font-semibold text-[var(--muted-ink)] hover:text-red-700">Delete</button></li>)}</ul> : null}</section> : null}
            </div>

            <aside className="h-fit border-t border-[var(--line)] pt-5 lg:sticky lg:top-6">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--accent-strong)]">{onboardingCompleted ? "Calendar status" : "Step 3: review week"}</p>
              <h2 className="mt-2 text-xl font-semibold tracking-[-0.03em]">{unconfirmedCreditCount ? "Confirm your module credits." : hasBaseline ? onboardingCompleted ? "Your recurring week is ready." : "Your recurring week is ready to save." : "Add at least one recurring constraint."}</h2>
              <dl className="mt-5 space-y-3 border-y border-[var(--line)] py-4 text-sm"><div className="flex justify-between gap-4"><dt className="text-[var(--muted-ink)]">Modules</dt><dd className="font-semibold">{modules.length}</dd></div><div className="flex justify-between gap-4"><dt className="text-[var(--muted-ink)]">Calendar blocks</dt><dd className="font-semibold">{totalBlockedTime}</dd></div></dl>
              {unconfirmedCreditCount ? <p className="mt-4 text-sm leading-6 text-[var(--muted-ink)]">Confirm the ECTS for all {unconfirmedCreditCount} imported module{unconfirmedCreditCount === 1 ? "" : "s"} before workload planning.</p> : null}
              {!onboardingCompleted ? <button type="button" onClick={onCompleteOnboarding} disabled={!canCompleteSetup} className="mt-5 inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-[var(--accent)] px-4 text-sm font-semibold text-white transition-colors hover:bg-[var(--accent-strong)] disabled:cursor-not-allowed disabled:bg-[var(--line)] disabled:text-[var(--muted-ink)]">{unconfirmedCreditCount ? "Confirm credits to continue" : hasBaseline ? "Complete setup" : "Add a recurring constraint"}</button> : <Link href="/assignment" className="mt-5 inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-[var(--accent)] px-4 text-sm font-semibold text-white transition-colors hover:bg-[var(--accent-strong)]">Go to assignments</Link>}
              <button type="button" onClick={resetPlanAround} className="mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-[var(--line)] px-4 text-sm font-semibold text-[var(--muted-ink)] transition-colors hover:border-red-300 hover:bg-red-50 hover:text-red-800">Reset all PlanAround data</button>
            </aside>
          </section>

          <section aria-labelledby="modules-heading" className="border-t border-[var(--line)] pt-8">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--accent-strong)]">Check the import</p>
            <h2 id="modules-heading" className="mt-1 text-xl font-semibold tracking-[-0.03em]">Confirm module credits</h2>
            <p className="mt-2 text-sm leading-6 text-[var(--muted-ink)]">ECTS is pre-filled at 5 because the timetable does not include credit values. Confirm or adjust each value before building an assignment plan.</p>
            <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{modules.map((module) => <div key={module.id} className="rounded-xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3"><p className="text-sm font-semibold">{module.name}</p><p className="mt-1 text-xs text-[var(--muted-ink)]">{module.code ?? "No code"}</p><label className="mt-3 block text-xs font-semibold text-[var(--muted-ink)]">ECTS<input value={module.credits} onChange={(event) => updateModuleCredits(module.id, event.target.value)} className="mt-1 min-h-10 w-full rounded-lg border border-[var(--line)] bg-[var(--surface-soft)] px-3 text-sm text-[var(--ink)]" type="number" min="0.5" step="0.5" /></label><button type="button" onClick={() => confirmModuleCredits(module.id)} className={`mt-3 min-h-10 w-full rounded-lg px-3 text-sm font-semibold ${module.creditsConfirmed === true ? "bg-[var(--accent-soft)] text-[var(--accent-strong)]" : "bg-[var(--accent)] text-white hover:bg-[var(--accent-strong)]"}`}>{module.creditsConfirmed === true ? "Credits confirmed" : `Confirm ${module.credits} ECTS`}</button></div>)}</div>
            <form onSubmit={saveModule} className="mt-5 grid gap-3 border-t border-[var(--line)] pt-5 sm:grid-cols-[1fr_0.5fr_0.3fr_auto] sm:items-end">
              <label className="text-sm font-medium">Module name<input value={moduleDraft.name} onChange={(event) => setModuleDraft((current) => ({ ...current, name: event.target.value }))} className={inputClassName} placeholder="Optional module" /></label>
              <label className="text-sm font-medium">Code<input value={moduleDraft.code} onChange={(event) => setModuleDraft((current) => ({ ...current, code: event.target.value }))} className={inputClassName} placeholder="CS306" /></label>
              <label className="text-sm font-medium">ECTS<input value={moduleDraft.credits} onChange={(event) => setModuleDraft((current) => ({ ...current, credits: event.target.value }))} className={inputClassName} type="number" min="0.5" step="0.5" /></label>
              <button type="submit" className="min-h-11 rounded-xl border border-[var(--accent)] px-4 text-sm font-semibold text-[var(--accent-strong)] hover:bg-[var(--accent-soft)]">Add module</button>
              {moduleError ? <p className="text-sm text-red-700 sm:col-span-4">{moduleError}</p> : null}
            </form>
          </section>
        </>
      ) : (
        <section className="rounded-2xl border border-dashed border-[var(--line)] bg-[var(--surface-soft)] px-5 py-8 text-sm leading-6 text-[var(--muted-ink)]">
          Select the sample PDF above to create your editable Semester 1 calendar. Nothing is preloaded behind the scenes.
        </section>
      )}
    </div>
  );
}

export function SetupWorkspace() {
  const { onboarding, isOnboardingLoaded, setOnboarding } = useOnboardingState();

  if (!isOnboardingLoaded) {
    return <div className="h-44 animate-pulse border-y border-[var(--line)] bg-[var(--surface-soft)]" aria-label="Loading setup" />;
  }

  function completeOnboarding() {
    const nextState = { completed: true, completedAt: new Date().toISOString() };
    writeStoredValue(storageKeys.onboarding, nextState);
    setOnboarding(nextState);
    window.dispatchEvent(new Event("planaround:onboarding"));
  }

  function resetOnboarding() {
    writeStoredValue(storageKeys.onboarding, initialOnboardingState);
    setOnboarding(initialOnboardingState);
    window.dispatchEvent(new Event("planaround:onboarding"));
  }

  return <SetupWorkspaceContent onboardingCompleted={onboarding.completed} onCompleteOnboarding={completeOnboarding} onResetOnboarding={resetOnboarding} />;
}
