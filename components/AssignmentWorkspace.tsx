"use client";

import Link from "next/link";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { analyzeAssignmentBrief } from "@/lib/assignmentAnalyzer";
import type { AssignmentAnalysisResponse, GroundedField } from "@/lib/assignmentAnalysis";
import { readStoredValue, storageKeys, writeStoredValue } from "@/lib/storage";
import type { Assignment, AssignmentTask, Module } from "@/types";
import { WorkloadBreakdown } from "@/components/WorkloadBreakdown";

type AssignmentDraft = {
  moduleId: string;
  title: string;
  deadline: string;
  moduleWeight: string;
};

type TaskDraft = {
  id: string;
  name: string;
  marks: string;
  complexity: "1" | "2" | "3";
  notes: string;
};

const emptyAssignmentDraft: AssignmentDraft = {
  moduleId: "",
  title: "",
  deadline: "",
  moduleWeight: "",
};

const inputClassName =
  "mt-1.5 min-h-11 w-full rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 text-sm text-[var(--ink)] outline-none transition-colors placeholder:text-[var(--muted-ink)] focus:border-[var(--accent)]";

const createId = () => window.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;

function createEmptyTask(): TaskDraft {
  return { id: createId(), name: "", marks: "", complexity: "2", notes: "" };
}

function getDemoDeadline() {
  const deadline = new Date();
  deadline.setDate(deadline.getDate() + 21);
  const timezoneOffset = deadline.getTimezoneOffset() * 60_000;
  return new Date(deadline.getTime() - timezoneOffset).toISOString().slice(0, 10);
}

function formatDeadline(date: string) {
  return new Intl.DateTimeFormat("en-IE", { day: "numeric", month: "short", year: "numeric" }).format(new Date(`${date}T12:00:00`));
}

function formatAnalysisProvider(provider: AssignmentAnalysisResponse["provider"]) {
  return provider === "local-ollama" ? "Local AI" : "Featherless AI";
}

function sourceStatus(field: GroundedField) {
  if (field.state === "verified-text") return "Verified from text";
  if (field.state === "evidence-mismatch") return "Source excerpt needs review";
  return "Needs confirmation";
}

function EvidenceDetail({ field }: { field: GroundedField }) {
  return (
    <details className="mt-2 text-xs leading-5 text-[var(--muted-ink)]">
      <summary className="cursor-pointer font-semibold text-[var(--accent-strong)]">{sourceStatus(field)}</summary>
      {field.evidence ? <p className="mt-1">“{field.evidence}”</p> : <p className="mt-1">No exact source excerpt was found for this suggestion.</p>}
    </details>
  );
}

export function AssignmentWorkspace() {
  const [modules, setModules] = useState<Module[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [draft, setDraft] = useState<AssignmentDraft>(emptyAssignmentDraft);
  const [tasks, setTasks] = useState<TaskDraft[]>([]);
  const [showTasks, setShowTasks] = useState(false);
  const [briefText, setBriefText] = useState("");
  const currentBriefText = useRef("");
  const [analysisResult, setAnalysisResult] = useState<AssignmentAnalysisResponse | null>(null);
  const [analysisSource, setAnalysisSource] = useState<Assignment["analysisSource"]>();
  const [isAnalysing, setIsAnalysing] = useState(false);
  const [analysisError, setAnalysisError] = useState("");
  const [needsReplacementConfirmation, setNeedsReplacementConfirmation] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [deletedAssignment, setDeletedAssignment] = useState<Assignment | null>(null);
  const [selectedWorkloadAssignmentId, setSelectedWorkloadAssignmentId] = useState<string | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    const hydrationTimer = window.setTimeout(() => {
      setModules(readStoredValue<Module[]>(storageKeys.modules, []));
      const storedAssignments = readStoredValue<Assignment[]>(storageKeys.assignments, []);
      setAssignments(storedAssignments);
      setSelectedWorkloadAssignmentId(storedAssignments.at(-1)?.id ?? null);
      setIsLoaded(true);
    }, 0);

    return () => window.clearTimeout(hydrationTimer);
  }, []);

  useEffect(() => {
    if (isLoaded) writeStoredValue(storageKeys.assignments, assignments);
  }, [assignments, isLoaded]);

  const selectedModule = modules.find((module) => module.id === draft.moduleId);
  const hasUnconfirmedSelection = selectedModule?.creditsConfirmed === false;
  const taskMarks = tasks.reduce((total, task) => total + (Number(task.marks) || 0), 0);

  function resetForm() {
    setDraft(emptyAssignmentDraft);
    setTasks([]);
    setShowTasks(false);
    updateBriefText("");
    setAnalysisResult(null);
    setAnalysisSource(undefined);
    setAnalysisError("");
    setNeedsReplacementConfirmation(false);
    setError("");
  }

  function updateTask(id: string, changes: Partial<TaskDraft>) {
    setTasks((current) => current.map((task) => task.id === id ? { ...task, ...changes } : task));
  }

  function updateBriefText(nextBriefText: string) {
    currentBriefText.current = nextBriefText;
    setBriefText(nextBriefText);
    setAnalysisError("");
    setAnalysisResult(null);
    setNeedsReplacementConfirmation(false);
  }

  function saveAssignment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const title = draft.title.trim();
    const moduleWeight = Number(draft.moduleWeight);

    if (!draft.moduleId || !title || !draft.deadline || !Number.isFinite(moduleWeight) || moduleWeight <= 0 || moduleWeight > 100) {
      setError("Choose a module, then add a title, deadline and weighting between 1% and 100%.");
      return;
    }

    if (hasUnconfirmedSelection) {
      setError("Confirm this module's ECTS in Timetable before saving an assignment for it.");
      return;
    }

    if (tasks.some((task) => !task.name.trim() || !Number.isFinite(Number(task.marks)) || Number(task.marks) <= 0)) {
      setError("Each added task needs a name and a positive mark value, or remove the unfinished task.");
      return;
    }

    const savedTasks: AssignmentTask[] = tasks.map((task) => ({
      id: task.id,
      name: task.name.trim(),
      marks: Number(task.marks),
      complexity: Number(task.complexity),
      requirements: task.notes.split(/\r?\n/).map((requirement) => requirement.trim()).filter(Boolean),
    }));
    const assignment: Assignment = {
      id: createId(),
      moduleId: draft.moduleId,
      title,
      deadline: draft.deadline,
      moduleWeight,
      tasks: savedTasks,
      ...(analysisSource ? { analysisSource } : {}),
    };

    setAssignments((current) => [...current, assignment]);
    setSelectedWorkloadAssignmentId(assignment.id);
    setStatus(`${title} is saved and ready for workload planning.`);
    setDeletedAssignment(null);
    resetForm();
  }

  function loadDemo() {
    const demoModule = modules.find((module) => module.code === "CS301") ?? modules[0];
    if (!demoModule) {
      setError("Import a timetable or add a module before loading the demo assignment.");
      return;
    }

    setDraft({
      moduleId: demoModule.id,
      title: "Coursework project",
      deadline: getDemoDeadline(),
      moduleWeight: "40",
    });
    setTasks([
      { id: createId(), name: "Design and implementation", marks: "45", complexity: "3", notes: "Working prototype and core functionality." },
      { id: createId(), name: "Testing and evaluation", marks: "25", complexity: "2", notes: "Test cases and a short evaluation." },
      { id: createId(), name: "Technical report", marks: "20", complexity: "2", notes: "2,500-word report." },
      { id: createId(), name: "Presentation", marks: "10", complexity: "1", notes: "Five-minute presentation." },
    ]);
    setShowTasks(true);
    setAnalysisResult(null);
    setAnalysisSource(undefined);
    setAnalysisError("");
    setNeedsReplacementConfirmation(false);
    setStatus("Demo details loaded. Review them, then save when ready.");
    setError("");
    setDeletedAssignment(null);
  }

  async function analyseBrief() {
    const analysedBriefText = briefText;
    setIsAnalysing(true);
    setAnalysisError("");
    setStatus("");
    setNeedsReplacementConfirmation(false);
    try {
      const result = await analyzeAssignmentBrief(analysedBriefText);
      if (currentBriefText.current !== analysedBriefText) return;
      setAnalysisResult(result);
    } catch (analysisFailure) {
      if (currentBriefText.current !== analysedBriefText) return;
      setAnalysisResult(null);
      setAnalysisError(analysisFailure instanceof Error ? analysisFailure.message : "The analyser could not read this brief. You can still enter the rubric manually.");
    } finally {
      setIsAnalysing(false);
    }
  }

  function applySuggestions(forceReplace = false) {
    if (!analysisResult) return;
    if (analysisResult.analysis.tasks.length && tasks.length && !forceReplace) {
      setNeedsReplacementConfirmation(true);
      return;
    }

    const { analysis } = analysisResult;
    setDraft((current) => ({
      ...current,
      title: current.title.trim() || analysis.title || "",
      deadline: current.deadline || analysis.deadline || "",
      moduleWeight: current.moduleWeight || (analysis.moduleWeight ? String(analysis.moduleWeight) : ""),
    }));
    if (analysis.tasks.length) {
      setTasks(analysis.tasks.map((task) => ({
        id: createId(),
        name: task.name,
        marks: task.marks === null ? "" : String(task.marks),
        complexity: String(task.complexity) as TaskDraft["complexity"],
        notes: task.requirements.join("\n"),
      })));
      setShowTasks(true);
    }
    setAnalysisSource({ provider: analysisResult.provider, model: analysisResult.model });
    setAnalysisResult(null);
    setNeedsReplacementConfirmation(false);
    setStatus(analysis.tasks.some((task) => task.marks === null)
      ? "Suggestions applied. Add the missing task marks before saving."
      : "Suggestions applied. Review every field, then save when ready.");
    setError("");
  }

  function deleteAssignment(assignment: Assignment) {
    setAssignments((current) => current.filter((item) => item.id !== assignment.id));
    if (selectedWorkloadAssignmentId === assignment.id) setSelectedWorkloadAssignmentId(null);
    setDeletedAssignment(assignment);
    setStatus("");
  }

  function restoreDeletedAssignment() {
    if (!deletedAssignment) return;
    setAssignments((current) => [...current, deletedAssignment]);
    setSelectedWorkloadAssignmentId(deletedAssignment.id);
    setDeletedAssignment(null);
    setStatus("Assignment restored.");
  }

  function updateWorkloadOverride(assignmentId: string, workloadOverrideHours: number | undefined) {
    setAssignments((current) => current.map((assignment) => assignment.id === assignmentId ? { ...assignment, workloadOverrideHours } : assignment));
  }

  const selectedWorkloadAssignment = assignments.find((assignment) => assignment.id === selectedWorkloadAssignmentId) ?? null;
  const selectedWorkloadModule = selectedWorkloadAssignment ? modules.find((module) => module.id === selectedWorkloadAssignment.moduleId) ?? null : null;

  return (
    <div className="space-y-10">
      <section className="grid gap-5 border-y border-[var(--line)] py-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center" aria-labelledby="assignment-form-heading">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--accent-strong)]">Assignment details</p>
          <h2 id="assignment-form-heading" className="mt-1 text-xl font-semibold tracking-[-0.03em]">Start with what you already know.</h2>
          <p className="mt-2 max-w-xl text-sm leading-6 text-[var(--muted-ink)]">Module, deadline and weighting are enough to begin. Add rubric tasks only when you have them.</p>
        </div>
        <button type="button" onClick={loadDemo} className="inline-flex min-h-11 items-center justify-center rounded-xl border border-[var(--accent)] px-4 text-sm font-semibold text-[var(--accent-strong)] transition-colors hover:bg-[var(--accent-soft)]">
          Load demo assignment
        </button>
      </section>

      {!modules.length && isLoaded ? (
        <section className="border-y border-[var(--line)] bg-[var(--surface-soft)] px-5 py-6 text-sm leading-6 text-[var(--muted-ink)]">
          <p className="font-semibold text-[var(--ink)]">Add your timetable first.</p>
          <p className="mt-1">Its modules are used to connect an assignment to the week you actually have.</p>
          <Link href="/setup" className="mt-4 inline-flex min-h-11 items-center rounded-xl bg-[var(--accent)] px-4 font-semibold text-white transition-colors hover:bg-[var(--accent-strong)]">Go to timetable</Link>
        </section>
      ) : (
        <form onSubmit={saveAssignment} className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(17rem,0.58fr)]">
          <div className="space-y-7">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="text-sm font-medium sm:col-span-2">
                Module
                <select value={draft.moduleId} onChange={(event) => { setDraft((current) => ({ ...current, moduleId: event.target.value })); setError(""); }} className={inputClassName} required>
                  <option value="">Choose a module</option>
                  {modules.map((module) => <option key={module.id} value={module.id}>{module.code ? `${module.code} · ${module.name}` : module.name}</option>)}
                </select>
              </label>
              <label className="text-sm font-medium sm:col-span-2">
                Assignment title
                <input value={draft.title} onChange={(event) => { setDraft((current) => ({ ...current, title: event.target.value })); setError(""); }} className={inputClassName} placeholder="e.g. Coursework project" autoComplete="off" required />
              </label>
              <label className="text-sm font-medium">
                Deadline
                <input value={draft.deadline} onChange={(event) => { setDraft((current) => ({ ...current, deadline: event.target.value })); setError(""); }} className={inputClassName} type="date" required />
              </label>
              <label className="text-sm font-medium">
                Weighting in this module
                <span className="relative mt-1.5 block"><input value={draft.moduleWeight} onChange={(event) => { setDraft((current) => ({ ...current, moduleWeight: event.target.value })); setError(""); }} className="min-h-11 w-full rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 pr-9 text-sm text-[var(--ink)] outline-none transition-colors placeholder:text-[var(--muted-ink)] focus:border-[var(--accent)]" type="number" min="1" max="100" placeholder="40" required /><span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-[var(--muted-ink)]">%</span></span>
              </label>
            </div>

            {hasUnconfirmedSelection ? <p className="rounded-xl bg-[var(--surface-soft)] px-4 py-3 text-sm leading-6 text-[var(--muted-ink)]">This module still needs its ECTS confirmed in <Link href="/setup" className="font-semibold text-[var(--accent-strong)] underline underline-offset-2">Timetable</Link>.</p> : null}

            <section className="border-t border-[var(--line)] pt-6" aria-labelledby="analysis-heading">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--accent-strong)]">Optional</p>
                  <h3 id="analysis-heading" className="mt-1 text-lg font-semibold tracking-[-0.025em]">Analyse an assignment brief.</h3>
                  <p className="mt-1 max-w-xl text-sm leading-6 text-[var(--muted-ink)]">Paste the assessment text to extract a draft rubric. You review it before anything is added.</p>
                </div>
                <button type="button" onClick={() => updateBriefText("CS301 Coursework Project\n\nThis coursework contributes 40% of the module grade.\nSubmission deadline: 28 August 2026.\n\nAssessment:\nDesign and implementation, 45 marks\nDevelop a working application implementing the required core functionality.\n\nTesting and evaluation, 25 marks\nProvide appropriate test cases and critically evaluate the finished solution.\n\nTechnical report, 20 marks\nSubmit a report of approximately 2,500 words documenting architecture, implementation decisions and evaluation.\n\nPresentation, 10 marks\nDeliver a five-minute presentation demonstrating the completed system.")} className="min-h-11 rounded-xl border border-[var(--line)] px-4 text-sm font-semibold text-[var(--ink)] transition-colors hover:border-[var(--accent)]">Load sample brief</button>
              </div>
              <label className="mt-4 block text-sm font-medium">
                Assignment brief
                <textarea value={briefText} onChange={(event) => updateBriefText(event.target.value)} className={`${inputClassName} min-h-36 py-3`} placeholder="Paste the assessment brief or rubric here" />
              </label>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <button type="button" onClick={analyseBrief} disabled={!briefText.trim() || isAnalysing} className="inline-flex min-h-11 items-center justify-center rounded-xl bg-[var(--accent)] px-4 text-sm font-semibold text-white transition-colors hover:bg-[var(--accent-strong)] disabled:cursor-not-allowed disabled:bg-[var(--line)] disabled:text-[var(--muted-ink)]">
                  {isAnalysing ? "Analysing brief…" : "Analyse brief with AI"}
                </button>
                <p className="text-sm text-[var(--muted-ink)]">It extracts details only. Workload and scheduling stay explainable.</p>
              </div>
              {analysisError ? <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm leading-6 text-red-800" role="alert">{analysisError}</p> : null}

              {analysisResult ? (
                <div className="mt-5 border-y border-[var(--line)] py-5" aria-live="polite">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--accent-strong)]">Review suggestions</p>
                      <h4 className="mt-1 text-base font-semibold">Nothing is added until you use these suggestions.</h4>
                    </div>
                    <span className="rounded-full bg-[var(--accent-soft)] px-3 py-1.5 text-xs font-semibold text-[var(--accent-strong)]">{formatAnalysisProvider(analysisResult.provider)} · {analysisResult.model}</span>
                  </div>
                  <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
                    <div><dt className="text-[var(--muted-ink)]">Title</dt><dd className="mt-1 font-semibold">{analysisResult.analysis.title ?? "Not found"}</dd><EvidenceDetail field={analysisResult.provenance.fields.title} /></div>
                    <div><dt className="text-[var(--muted-ink)]">Deadline</dt><dd className="mt-1 font-semibold">{analysisResult.analysis.deadline ? formatDeadline(analysisResult.analysis.deadline) : "Not found"}</dd><EvidenceDetail field={analysisResult.provenance.fields.deadline} /></div>
                    <div><dt className="text-[var(--muted-ink)]">Module weighting</dt><dd className="mt-1 font-semibold">{analysisResult.analysis.moduleWeight ? `${analysisResult.analysis.moduleWeight}%` : "Not found"}</dd><EvidenceDetail field={analysisResult.provenance.fields.moduleWeight} /></div>
                  </dl>
                  {analysisResult.analysis.tasks.length ? <ul className="mt-5 divide-y divide-[var(--line)] border-y border-[var(--line)]">{analysisResult.analysis.tasks.map((task, index) => <li key={`${task.name}-${task.marks}`} className="py-3"><p className="font-semibold">{task.name}</p><p className="mt-1 text-sm text-[var(--muted-ink)]">{task.marks === null ? "Marks need confirmation" : `${task.marks} marks`} · {task.complexity === 1 ? "Low" : task.complexity === 2 ? "Medium" : "High"} complexity</p><p className="mt-2 text-sm leading-6 text-[var(--muted-ink)]"><span className="font-semibold text-[var(--ink)]">Why this complexity?</span> {task.complexityRationale}</p><EvidenceDetail field={task.marks === null ? analysisResult.provenance.tasks[index].name : analysisResult.provenance.tasks[index].marks} />{task.requirements.length ? <ul className="mt-2 space-y-1 text-sm leading-6 text-[var(--muted-ink)]">{task.requirements.map((requirement) => <li key={requirement}>• {requirement}</li>)}</ul> : null}</li>)}</ul> : <p className="mt-4 text-sm leading-6 text-[var(--muted-ink)]">No clear rubric tasks were found. You can still use any title, deadline or weighting suggestion.</p>}
                  {analysisResult.analysis.warnings.length ? <ul className="mt-4 space-y-1 text-sm leading-6 text-[var(--muted-ink)]">{analysisResult.analysis.warnings.map((warning) => <li key={warning}>• {warning}</li>)}</ul> : null}
                  {needsReplacementConfirmation ? <p className="mt-4 rounded-xl bg-[var(--surface-soft)] px-4 py-3 text-sm leading-6 text-[var(--muted-ink)]">Using the task suggestions will replace the {tasks.length} task{tasks.length === 1 ? "" : "s"} currently in this form.</p> : null}
                  <div className="mt-5 flex flex-wrap gap-3">
                    <button type="button" onClick={() => applySuggestions(needsReplacementConfirmation)} className="min-h-11 rounded-xl bg-[var(--accent)] px-4 text-sm font-semibold text-white transition-colors hover:bg-[var(--accent-strong)]">{needsReplacementConfirmation ? "Replace with suggestions" : "Use suggestions"}</button>
                    <button type="button" onClick={() => { setAnalysisResult(null); setNeedsReplacementConfirmation(false); }} className="min-h-11 rounded-xl border border-[var(--line)] px-4 text-sm font-semibold text-[var(--muted-ink)] transition-colors hover:border-[var(--accent)]">Discard</button>
                  </div>
                </div>
              ) : null}
            </section>

            <section className="border-t border-[var(--line)] pt-6" aria-labelledby="tasks-heading">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--accent-strong)]">Optional</p>
                  <h3 id="tasks-heading" className="mt-1 text-lg font-semibold tracking-[-0.025em]">Add tasks from the rubric.</h3>
                  <p className="mt-1 max-w-xl text-sm leading-6 text-[var(--muted-ink)]">This gives the later workload estimate more detail. You can save without tasks.</p>
                </div>
                <button type="button" onClick={() => { setShowTasks((current) => !current); setError(""); }} className="min-h-11 rounded-xl border border-[var(--line)] px-4 text-sm font-semibold text-[var(--ink)] transition-colors hover:border-[var(--accent)]">
                  {showTasks ? "Hide tasks" : "Add tasks manually"}
                </button>
              </div>

              {showTasks ? (
                <div className="mt-5 space-y-4">
                  {tasks.length ? <p className="text-sm text-[var(--muted-ink)]">Task marks entered: <span className="font-semibold text-[var(--ink)]">{taskMarks}</span>{taskMarks === 100 ? "%" : ""}{taskMarks && taskMarks !== 100 ? " total" : ""}</p> : <p className="text-sm text-[var(--muted-ink)]">Break the assignment into the parts you are assessed on.</p>}
                  {tasks.map((task, index) => (
                    <fieldset key={task.id} className="border-t border-[var(--line)] pt-4">
                      <div className="flex items-center justify-between gap-3">
                        <legend className="text-sm font-semibold">Task {index + 1}</legend>
                        <button type="button" onClick={() => setTasks((current) => current.filter((item) => item.id !== task.id))} className="min-h-10 px-2 text-sm font-semibold text-[var(--muted-ink)] transition-colors hover:text-red-700">Delete task</button>
                      </div>
                      <div className="mt-2 grid gap-3 sm:grid-cols-[minmax(0,1fr)_8rem_9.5rem]">
                        <label className="text-sm font-medium">Task name<input value={task.name} onChange={(event) => updateTask(task.id, { name: event.target.value })} className={inputClassName} placeholder="Technical report" /></label>
                        <label className="text-sm font-medium">Marks<input value={task.marks} onChange={(event) => updateTask(task.id, { marks: event.target.value })} className={inputClassName} type="number" min="1" placeholder="20" /></label>
                        <label className="text-sm font-medium">Complexity<select value={task.complexity} onChange={(event) => updateTask(task.id, { complexity: event.target.value as TaskDraft["complexity"] })} className={inputClassName}><option value="1">Low</option><option value="2">Medium</option><option value="3">High</option></select></label>
                      </div>
                      <label className="mt-3 block text-sm font-medium">Notes <span className="font-normal text-[var(--muted-ink)]">(optional)</span><textarea value={task.notes} onChange={(event) => updateTask(task.id, { notes: event.target.value })} className={`${inputClassName} min-h-20 py-2`} placeholder="e.g. 2,500 words or a five-minute presentation" /></label>
                    </fieldset>
                  ))}
                  <button type="button" onClick={() => setTasks((current) => [...current, createEmptyTask()])} className="min-h-11 rounded-xl border border-[var(--accent)] px-4 text-sm font-semibold text-[var(--accent-strong)] transition-colors hover:bg-[var(--accent-soft)]">Add another task</button>
                </div>
              ) : null}
            </section>
          </div>

          <aside className="h-fit border-t border-[var(--line)] pt-5 lg:sticky lg:top-6">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--accent-strong)]">Ready when you are</p>
            <h2 className="mt-2 text-xl font-semibold tracking-[-0.03em]">Save the assignment.</h2>
            <p className="mt-2 text-sm leading-6 text-[var(--muted-ink)]">The next step will use these details to explain the workload before it schedules anything.</p>
            {error ? <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm leading-6 text-red-800" role="alert">{error}</p> : null}
            {status ? <p className="mt-4 rounded-xl bg-[var(--accent-soft)] px-4 py-3 text-sm leading-6 text-[var(--accent-strong)]" role="status">{status}</p> : null}
            <button type="submit" disabled={!modules.length || hasUnconfirmedSelection} className="mt-5 inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-[var(--accent)] px-4 text-sm font-semibold text-white transition-colors hover:bg-[var(--accent-strong)] disabled:cursor-not-allowed disabled:bg-[var(--line)] disabled:text-[var(--muted-ink)]">Save assignment</button>
            <button type="button" onClick={resetForm} className="mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-[var(--line)] px-4 text-sm font-semibold text-[var(--muted-ink)] transition-colors hover:border-[var(--accent)]">Clear form</button>
          </aside>
        </form>
      )}

      <section className="border-t border-[var(--line)] pt-8" aria-labelledby="saved-assignments-heading">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--accent-strong)]">Saved locally</p>
            <h2 id="saved-assignments-heading" className="mt-1 text-xl font-semibold tracking-[-0.03em]">Your assignments</h2>
          </div>
          <span className="rounded-full bg-[var(--surface-soft)] px-3 py-1.5 text-xs font-semibold text-[var(--muted-ink)]">{assignments.length} saved</span>
        </div>

        {deletedAssignment ? <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[var(--surface-soft)] px-4 py-3 text-sm"><span><span className="font-semibold">{deletedAssignment.title}</span> was deleted.</span><button type="button" onClick={restoreDeletedAssignment} className="min-h-10 rounded-lg px-3 font-semibold text-[var(--accent-strong)] hover:bg-[var(--accent-soft)]">Undo</button></div> : null}

        {assignments.length ? (
          <ul className="mt-4 divide-y divide-[var(--line)] border-y border-[var(--line)]">
            {assignments.map((assignment) => {
              const linkedModule = modules.find((item) => item.id === assignment.moduleId);
              return (
                <li key={assignment.id} className="grid gap-3 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                  <div>
                    <p className="font-semibold">{assignment.title}</p>
                    <p className="mt-1 text-sm text-[var(--muted-ink)]">{linkedModule?.code ?? linkedModule?.name ?? "Module removed"} · Due {formatDeadline(assignment.deadline)} · {assignment.moduleWeight}% · {assignment.tasks.length ? `${assignment.tasks.length} tasks` : "No task breakdown"}</p>
                    {assignment.analysisSource ? <p className="mt-2 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--accent-strong)]">AI-assisted rubric · {formatAnalysisProvider(assignment.analysisSource.provider)}</p> : null}
                  </div>
                  <div className="flex flex-wrap gap-1 sm:justify-self-end">
                    <button type="button" onClick={() => setSelectedWorkloadAssignmentId(assignment.id)} className="min-h-10 rounded-lg px-3 text-sm font-semibold text-[var(--accent-strong)] transition-colors hover:bg-[var(--accent-soft)]">{selectedWorkloadAssignmentId === assignment.id ? "Viewing workload" : "View workload"}</button>
                    <button type="button" onClick={() => deleteAssignment(assignment)} className="min-h-10 rounded-lg px-3 text-sm font-semibold text-[var(--muted-ink)] transition-colors hover:bg-red-50 hover:text-red-700">Delete</button>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : <p className="mt-4 text-sm leading-6 text-[var(--muted-ink)]">No assignments saved yet. Add one above, or load the demo details to see the full flow.</p>}
      </section>

      {selectedWorkloadAssignment && selectedWorkloadModule ? <WorkloadBreakdown assignment={selectedWorkloadAssignment} module={selectedWorkloadModule} onOverrideChange={(hours) => updateWorkloadOverride(selectedWorkloadAssignment.id, hours)} /> : null}
    </div>
  );
}
