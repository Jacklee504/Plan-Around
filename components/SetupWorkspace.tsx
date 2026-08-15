"use client";

import Link from "next/link";
import { type ChangeEvent, type FormEvent, useEffect, useState } from "react";
import { parseTimetablePdf } from "@/lib/timetableParser";
import { readStoredValue, storageKeys, writeStoredValue } from "@/lib/storage";
import type { Commitment, CommitmentCategory, Module, TimetableAttendance, TimetableEntry } from "@/types";

const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const calendarDays = [1, 2, 3, 4, 5];
const calendarStartHour = 9;
const calendarEndHour = 18;
const hourHeight = 58;

const categoryLabels: Record<CommitmentCategory, string> = {
  class: "Class",
  work: "Work",
  gym: "Gym",
  meal: "Meal",
  social: "Social",
  other: "Other",
};

const sessionLabels = { lecture: "Lecture", lab: "Lab", tutorial: "Tutorial" } as const;

const inputClassName =
  "mt-1.5 min-h-11 w-full rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 text-sm text-[var(--ink)] outline-none transition-colors placeholder:text-[var(--muted-ink)] focus:border-[var(--accent)]";

type ModuleDraft = { name: string; code: string; credits: string };
type CommitmentDraft = { label: string; dayOfWeek: string; start: string; end: string; category: CommitmentCategory };

const emptyModuleDraft: ModuleDraft = { name: "", code: "", credits: "5" };
const emptyCommitmentDraft: CommitmentDraft = { label: "", dayOfWeek: "1", start: "16:00", end: "17:00", category: "other" };

const createId = () => window.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const minutesFromTime = (time: string) => {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
};

function blockPosition(start: string, end: string) {
  const startOffset = Math.max(0, minutesFromTime(start) - calendarStartHour * 60);
  const duration = Math.max(30, minutesFromTime(end) - minutesFromTime(start));
  return {
    top: `${(startOffset / 60) * hourHeight + 3}px`,
    height: `${Math.max(30, (duration / 60) * hourHeight - 6)}px`,
  };
}

export function SetupWorkspace() {
  const [modules, setModules] = useState<Module[]>([]);
  const [commitments, setCommitments] = useState<Commitment[]>([]);
  const [timetableEntries, setTimetableEntries] = useState<TimetableEntry[]>([]);
  const [moduleDraft, setModuleDraft] = useState<ModuleDraft>(emptyModuleDraft);
  const [commitmentDraft, setCommitmentDraft] = useState<CommitmentDraft>(emptyCommitmentDraft);
  const [editingModuleId, setEditingModuleId] = useState<string | null>(null);
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
  const [importState, setImportState] = useState<"idle" | "reading" | "complete" | "error">("idle");
  const [uploadedFileName, setUploadedFileName] = useState("");
  const [importMessage, setImportMessage] = useState("");
  const [moduleError, setModuleError] = useState("");
  const [commitmentError, setCommitmentError] = useState("");
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    const hydrationTimer = window.setTimeout(() => {
      setModules(readStoredValue<Module[]>(storageKeys.modules, []));
      setCommitments(readStoredValue<Commitment[]>(storageKeys.commitments, []));
      setTimetableEntries(readStoredValue<TimetableEntry[]>(storageKeys.timetableEntries, []));
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
    if (isLoaded) writeStoredValue(storageKeys.timetableEntries, timetableEntries);
  }, [isLoaded, timetableEntries]);

  const selectedEntry = timetableEntries.find((entry) => entry.id === selectedEntryId) ?? null;
  const importedModuleCount = new Set(timetableEntries.map((entry) => entry.moduleCode)).size;
  const hasTimetable = timetableEntries.length > 0;
  const totalBlockedTime = timetableEntries.filter((entry) => entry.attendance === "attending").length + commitments.length;

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

    const nextModule: Module = { id: editingModuleId ?? createId(), name, code: moduleDraft.code.trim() || undefined, credits };
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
      const nextEntries = parsed.entries.map((entry) => ({ ...entry, id: createId(), attendance: "attending" as const }));
      const importedModules = [...new Map(nextEntries.map((entry) => [entry.moduleCode, entry])).values()]
        .map((entry) => ({
          id: createId(),
          code: entry.moduleCode,
          name: entry.moduleName,
          credits: 5,
        }));

      setTimetableEntries(nextEntries);
      setModules(importedModules);
      setImportState("complete");
      setImportMessage(`Read ${parsed.entries.length} sessions across ${parsed.moduleCount} modules.`);
    } catch (error) {
      setImportState("error");
      setImportMessage(error instanceof Error ? error.message : "We could not read that timetable.");
    }
  }

  function updateAttendance(attendance: TimetableAttendance) {
    if (!selectedEntry) return;
    setTimetableEntries((current) => current.map((entry) => entry.id === selectedEntry.id ? { ...entry, attendance } : entry));
  }

  return (
    <div className="space-y-10">
      <section aria-labelledby="upload-heading" className="grid gap-5 border-y border-[var(--line)] py-6 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--accent-strong)]">Semester timetable</p>
          <h2 id="upload-heading" className="mt-1 text-xl font-semibold tracking-[-0.03em]">Import your real teaching week.</h2>
          <p className="mt-2 max-w-xl text-sm leading-6 text-[var(--muted-ink)]">Start with the supplied text-based PDF. PlanAround reads its weekday, time, module and session rows, then turns them into an editable calendar.</p>
        </div>
        <div className="flex flex-wrap gap-3 lg:justify-end">
          <Link href="/semester-1-timetable.pdf" download className="inline-flex min-h-11 items-center justify-center rounded-xl border border-[var(--line)] bg-[var(--surface)] px-4 text-sm font-semibold text-[var(--ink)] transition-colors hover:border-[var(--accent)]">
            Download sample PDF
          </Link>
          <label className="inline-flex min-h-11 cursor-pointer items-center justify-center rounded-xl bg-[var(--accent)] px-4 text-sm font-semibold text-white transition-colors hover:bg-[var(--accent-strong)]">
            {importState === "reading" ? "Reading timetable..." : "Select timetable PDF"}
            <input className="sr-only" type="file" accept="application/pdf,.pdf" onChange={importTimetable} disabled={importState === "reading"} />
          </label>
        </div>
        {importState !== "idle" ? (
          <p className={`text-sm leading-6 lg:col-span-2 ${importState === "error" ? "text-red-700" : "text-[var(--muted-ink)]"}`} role={importState === "error" ? "alert" : "status"}>
            {importState === "reading" ? `Reading ${uploadedFileName}...` : importMessage}
          </p>
        ) : null}
      </section>

      {hasTimetable ? (
        <>
          <section aria-labelledby="calendar-heading">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--accent-strong)]">Your actual week</p>
                <h2 id="calendar-heading" className="mt-1 text-2xl font-semibold tracking-[-0.035em]">Calendar</h2>
                <p className="mt-1 text-sm text-[var(--muted-ink)]">Select a teaching session to say whether you are attending it this week.</p>
              </div>
              <span className="rounded-full bg-[var(--accent-soft)] px-3 py-1.5 text-xs font-semibold text-[var(--accent-strong)]">{importedModuleCount} modules imported</span>
            </div>

            <div className="mt-5 overflow-x-auto rounded-2xl border border-[var(--line)] bg-[var(--surface)]">
              <div className="min-w-[46rem]">
                <div className="grid grid-cols-[3.5rem_repeat(5,minmax(8rem,1fr))] border-b border-[var(--line)] bg-[var(--surface-soft)]">
                  <div />
                  {calendarDays.map((dayOfWeek) => <div key={dayOfWeek} className="px-3 py-3 text-sm font-semibold">{days[dayOfWeek]}</div>)}
                </div>
                <div className="grid grid-cols-[3.5rem_repeat(5,minmax(8rem,1fr))]">
                  <div className="border-r border-[var(--line)] text-xs text-[var(--muted-ink)]">
                    {Array.from({ length: calendarEndHour - calendarStartHour + 1 }, (_, index) => <div key={index} className="pr-2 text-right" style={{ height: index === calendarEndHour - calendarStartHour ? 0 : hourHeight }}>{`${calendarStartHour + index}:00`}</div>)}
                  </div>
                  {calendarDays.map((dayOfWeek) => (
                    <div key={dayOfWeek} className="relative border-r border-[var(--line)] last:border-r-0" style={{ height: (calendarEndHour - calendarStartHour) * hourHeight, backgroundImage: "repeating-linear-gradient(to bottom, transparent 0, transparent 57px, var(--line) 58px)" }}>
                      {timetableEntries.filter((entry) => entry.dayOfWeek === dayOfWeek).map((entry) => {
                        const isSkipped = entry.attendance !== "attending";
                        return (
                          <button key={entry.id} type="button" onClick={() => setSelectedEntryId(entry.id)} className={`absolute left-1 right-1 overflow-hidden rounded-lg border px-2 py-1.5 text-left text-xs leading-4 transition-colors ${isSkipped ? "border-dashed border-[var(--line)] bg-[var(--surface-soft)] text-[var(--muted-ink)] line-through" : "border-[var(--accent-soft)] bg-[var(--accent-soft)] text-[var(--ink)] hover:border-[var(--accent)]"}`} style={blockPosition(entry.start, entry.end)}>
                            <span className="block truncate font-bold">{entry.moduleCode}</span>
                            <span className="block truncate">{sessionLabels[entry.sessionType]}</span>
                            <span className="block tabular-nums">{entry.start} to {entry.end}</span>
                          </button>
                        );
                      })}
                      {commitments.filter((commitment) => commitment.dayOfWeek === dayOfWeek).map((commitment) => (
                        <div key={commitment.id} className="absolute left-1 right-1 overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--surface)] px-2 py-1.5 text-left text-xs leading-4 text-[var(--ink)] shadow-sm" style={blockPosition(commitment.start, commitment.end)}>
                          <span className="block truncate font-bold">{commitment.label}</span>
                          <span className="block truncate text-[var(--muted-ink)]">{categoryLabels[commitment.category]}</span>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {selectedEntry ? (
              <div className="mt-4 grid gap-4 border-y border-[var(--line)] py-4 sm:grid-cols-[1fr_auto] sm:items-center">
                <div>
                  <p className="text-sm font-semibold">{selectedEntry.moduleCode} · {selectedEntry.moduleName}</p>
                  <p className="mt-1 text-sm text-[var(--muted-ink)]">{days[selectedEntry.dayOfWeek]}, {selectedEntry.start} to {selectedEntry.end} · {sessionLabels[selectedEntry.sessionType]}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => updateAttendance("attending")} className={`min-h-10 rounded-lg px-3 text-sm font-semibold ${selectedEntry.attendance === "attending" ? "bg-[var(--accent)] text-white" : "border border-[var(--line)]"}`}>Going</button>
                  <button type="button" onClick={() => updateAttendance("skip-this-week")} className={`min-h-10 rounded-lg px-3 text-sm font-semibold ${selectedEntry.attendance === "skip-this-week" ? "bg-[var(--ink)] text-white" : "border border-[var(--line)]"}`}>Not going this week</button>
                  <button type="button" onClick={() => updateAttendance("skip-every-week")} className={`min-h-10 rounded-lg px-3 text-sm font-semibold ${selectedEntry.attendance === "skip-every-week" ? "bg-[var(--ink)] text-white" : "border border-[var(--line)]"}`}>Not going every week</button>
                </div>
              </div>
            ) : null}
          </section>

          <section className="grid gap-8 border-t border-[var(--line)] pt-8 lg:grid-cols-[minmax(0,1fr)_minmax(19rem,0.72fr)]">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--accent-strong)]">Outside class</p>
              <h2 className="mt-1 text-xl font-semibold tracking-[-0.03em]">Add your commitments.</h2>
              <p className="mt-2 text-sm leading-6 text-[var(--muted-ink)]">Work, gym, meals and social time sit alongside your teaching schedule.</p>
              <form onSubmit={saveCommitment} className="mt-5 grid gap-3 rounded-2xl bg-[var(--surface-soft)] p-4 sm:grid-cols-2">
                <label className="text-sm font-medium sm:col-span-2">What is this time for?<input value={commitmentDraft.label} onChange={(event) => setCommitmentDraft((current) => ({ ...current, label: event.target.value }))} className={inputClassName} placeholder="Part-time work" autoComplete="off" /></label>
                <label className="text-sm font-medium">Day<select value={commitmentDraft.dayOfWeek} onChange={(event) => setCommitmentDraft((current) => ({ ...current, dayOfWeek: event.target.value }))} className={inputClassName}>{calendarDays.map((day) => <option key={day} value={day}>{days[day]}</option>)}</select></label>
                <label className="text-sm font-medium">Category<select value={commitmentDraft.category} onChange={(event) => setCommitmentDraft((current) => ({ ...current, category: event.target.value as CommitmentCategory }))} className={inputClassName}>{Object.entries(categoryLabels).filter(([category]) => category !== "class").map(([category, label]) => <option key={category} value={category}>{label}</option>)}</select></label>
                <label className="text-sm font-medium">Start<input value={commitmentDraft.start} onChange={(event) => setCommitmentDraft((current) => ({ ...current, start: event.target.value }))} className={inputClassName} type="time" /></label>
                <label className="text-sm font-medium">End<input value={commitmentDraft.end} onChange={(event) => setCommitmentDraft((current) => ({ ...current, end: event.target.value }))} className={inputClassName} type="time" /></label>
                {commitmentError ? <p className="text-sm text-red-700 sm:col-span-2">{commitmentError}</p> : null}
                <button type="submit" className="min-h-11 rounded-xl bg-[var(--accent)] px-4 text-sm font-semibold text-white transition-colors hover:bg-[var(--accent-strong)] sm:col-span-2">Add to calendar</button>
              </form>
            </div>

            <aside className="h-fit border-t border-[var(--line)] pt-5 lg:sticky lg:top-6">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--accent-strong)]">Setup status</p>
              <h2 className="mt-2 text-xl font-semibold tracking-[-0.03em]">Your constraints are ready.</h2>
              <dl className="mt-5 space-y-3 border-y border-[var(--line)] py-4 text-sm"><div className="flex justify-between gap-4"><dt className="text-[var(--muted-ink)]">Modules</dt><dd className="font-semibold">{modules.length}</dd></div><div className="flex justify-between gap-4"><dt className="text-[var(--muted-ink)]">Calendar blocks</dt><dd className="font-semibold">{totalBlockedTime}</dd></div></dl>
              <Link href="/assignment" className="mt-5 inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-[var(--accent)] px-4 text-sm font-semibold text-white transition-colors hover:bg-[var(--accent-strong)]">Continue to assignment</Link>
            </aside>
          </section>

          <section aria-labelledby="modules-heading" className="border-t border-[var(--line)] pt-8">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--accent-strong)]">Check the import</p>
            <h2 id="modules-heading" className="mt-1 text-xl font-semibold tracking-[-0.03em]">Modules</h2>
            <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{modules.map((module) => <div key={module.id} className="rounded-xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3"><p className="text-sm font-semibold">{module.name}</p><p className="mt-1 text-xs text-[var(--muted-ink)]">{module.code ?? "No code"} · {module.credits} ECTS</p></div>)}</div>
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
