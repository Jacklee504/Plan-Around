"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { analyzeAssignmentBrief, imageAnalysisIsAvailable } from "@/lib/assignmentAnalyzer";
import { prepareAnalysisImage, type PreparedAnalysisImage } from "@/lib/analysisImage";
import { extractPdfEmbeddedText, hasUsefulEmbeddedText, isPdfFile, renderPdfToImageFile } from "@/lib/pdfDocument";
import { assignmentAnalysisInputKey, MAX_BRIEF_CHARACTERS, type AssignmentAnalysisInput, type AssignmentAnalysisResponse } from "@/lib/assignmentAnalysis";
import { findMatchingModule } from "@/lib/moduleMatch";
import { readStoredValue, storageKeys, writeStoredValue } from "@/lib/storage";
import { removeAssignmentPlanningState, restoreAssignmentPlanningState } from "@/lib/studyProgress";
import type { Assignment, AssignmentTask, Module, StudyBlock } from "@/types";
import { OnboardingRequired } from "@/components/OnboardingRequired";
import { useOnboardingState } from "@/lib/onboarding";

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

type DeletedAssignmentUndo = {
  assignment: Assignment;
  studyBlocks: StudyBlock[];
  planSnapshot: string | undefined;
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

export function AssignmentWorkspace() {
  const router = useRouter();
  const { onboarding, isOnboardingLoaded } = useOnboardingState();
  const [modules, setModules] = useState<Module[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [draft, setDraft] = useState<AssignmentDraft>(emptyAssignmentDraft);
  const [tasks, setTasks] = useState<TaskDraft[]>([]);
  const [showTasks, setShowTasks] = useState(false);
  const [showAnalysis, setShowAnalysis] = useState(false);
  const [briefText, setBriefText] = useState("");
  const [analysisImage, setAnalysisImage] = useState<PreparedAnalysisImage | null>(null);
  const currentAnalysisInputKey = useRef("");
  const imagePreparationVersion = useRef(0);
  const imageInput = useRef<HTMLInputElement>(null);
  const [hasAnalysedBrief, setHasAnalysedBrief] = useState(false);
  const [isAnalysing, setIsAnalysing] = useState(false);
  const [isPreparingImage, setIsPreparingImage] = useState(false);
  const [analysisError, setAnalysisError] = useState("");
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [deletedAssignment, setDeletedAssignment] = useState<DeletedAssignmentUndo | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    const hydrationTimer = window.setTimeout(() => {
      setModules(readStoredValue<Module[]>(storageKeys.modules, []));
      const storedAssignments = readStoredValue<Assignment[]>(storageKeys.assignments, []);
      setAssignments(storedAssignments);
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
  const canAnalyseScreenshot = imageAnalysisIsAvailable();
  const hasDraftContent = Boolean(
    draft.moduleId ||
      draft.title ||
      draft.deadline ||
      draft.moduleWeight ||
      tasks.length ||
      briefText.trim() ||
      analysisImage ||
      hasAnalysedBrief,
  );

  function resetForm() {
    setDraft(emptyAssignmentDraft);
    setTasks([]);
    setShowTasks(false);
    updateBriefText("");
    setHasAnalysedBrief(false);
    setAnalysisError("");
    setError("");
  }

  function discardDraft() {
    if (
      hasDraftContent &&
      !window.confirm("Discard this unsaved assignment draft?")
    )
      return;
    resetForm();
    setStatus("");
  }

  function updateTask(id: string, changes: Partial<TaskDraft>) {
    setTasks((current) => current.map((task) => task.id === id ? { ...task, ...changes } : task));
  }

  function updateBriefText(nextBriefText: string) {
    imagePreparationVersion.current += 1;
    setIsPreparingImage(false);
    currentAnalysisInputKey.current = assignmentAnalysisInputKey({ kind: "text", text: nextBriefText });
    setBriefText(nextBriefText);
    setAnalysisImage(null);
    setHasAnalysedBrief(false);
    if (imageInput.current) imageInput.current.value = "";
    setAnalysisError("");
  }

  function clearAnalysisImage() {
    imagePreparationVersion.current += 1;
    setIsPreparingImage(false);
    currentAnalysisInputKey.current = assignmentAnalysisInputKey({ kind: "text", text: "" });
    setAnalysisImage(null);
    setHasAnalysedBrief(false);
    if (imageInput.current) imageInput.current.value = "";
    setAnalysisError("");
  }

  async function selectAnalysisFile(file: File | undefined) {
    if (!file) return;
    const version = imagePreparationVersion.current + 1;
    imagePreparationVersion.current = version;
    currentAnalysisInputKey.current = `preparing-image:${version}`;
    setIsPreparingImage(true);
    setBriefText("");
    setAnalysisImage(null);
    setHasAnalysedBrief(false);
    setAnalysisError("");
    try {
      // A PDF is routed client-side, never sent to Featherless as raw bytes:
      // embedded text goes through the existing text-analysis path, and only
      // a scanned/image-only PDF is rendered locally into an image that then
      // goes through the existing hosted image-analysis path unchanged.
      if (isPdfFile(file)) {
        const extractedText = await extractPdfEmbeddedText(file);
        if (imagePreparationVersion.current !== version) return;
        if (hasUsefulEmbeddedText(extractedText)) {
          if (extractedText.length > MAX_BRIEF_CHARACTERS) {
            throw new Error("This PDF contains more text than PlanAround can analyse at once. Upload the assignment brief rather than the full module handbook, or use a shorter PDF.");
          }
          currentAnalysisInputKey.current = assignmentAnalysisInputKey({ kind: "text", text: extractedText });
          setBriefText(extractedText);
          setAnalysisImage(null);
          return;
        }
        if (!canAnalyseScreenshot) {
          throw new Error("This PDF looks scanned or image-only, which needs the hosted analyser to read. Use the deployed app or configure NEXT_PUBLIC_ANALYZER_URL locally.");
        }
        const renderedImage = await renderPdfToImageFile(file);
        if (imagePreparationVersion.current !== version) return;
        const image = await prepareAnalysisImage(renderedImage);
        if (imagePreparationVersion.current !== version) return;
        currentAnalysisInputKey.current = assignmentAnalysisInputKey(image);
        setBriefText("");
        setAnalysisImage(image);
        return;
      }

      if (!canAnalyseScreenshot) {
        throw new Error("Screenshot analysis uses the hosted analyser. Use the deployed app or configure NEXT_PUBLIC_ANALYZER_URL locally.");
      }
      const image = await prepareAnalysisImage(file);
      if (imagePreparationVersion.current !== version) return;
      currentAnalysisInputKey.current = assignmentAnalysisInputKey(image);
      setBriefText("");
      setAnalysisImage(image);
    } catch (fileError) {
      if (imagePreparationVersion.current !== version) return;
      setAnalysisImage(null);
      setAnalysisError(fileError instanceof Error ? fileError.message : "This file could not be prepared.");
    } finally {
      if (imagePreparationVersion.current === version) setIsPreparingImage(false);
      if (imageInput.current) imageInput.current.value = "";
    }
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
      setError("Confirm this module's credits in Calendar before saving an assignment for it.");
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
    };

    const nextAssignments = [...assignments, assignment];
    // Persist before navigating so Plan can load the newly saved assignment on
    // its first render rather than waiting for this component's effect.
    writeStoredValue(storageKeys.assignments, nextAssignments);
    writeStoredValue(storageKeys.activeAssignmentId, assignment.id);
    setAssignments(nextAssignments);
    setDeletedAssignment(null);
    router.push(`/plan?assignment=${encodeURIComponent(assignment.id)}`);
  }

  function loadDemo() {
    const demoModule = modules.find((module) => module.code === "CS301") ?? modules[0];
    if (!demoModule) {
      setError("Import your teaching week or add a module before loading the demo assignment.");
      return;
    }

    updateBriefText("");
    setShowAnalysis(false);
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
    setHasAnalysedBrief(false);
    setAnalysisError("");
    setStatus("Demo details loaded. Review them, then save when ready.");
    setError("");
    setDeletedAssignment(null);
  }

  async function analyseBrief() {
    const input: AssignmentAnalysisInput = analysisImage
      ? { kind: "image", mimeType: analysisImage.mimeType, base64: analysisImage.base64 }
      : { kind: "text", text: briefText };
    const analysedInputKey = assignmentAnalysisInputKey(input);
    setIsAnalysing(true);
    setAnalysisError("");
    setStatus("");
    try {
      const result = await analyzeAssignmentBrief(input);
      if (currentAnalysisInputKey.current !== analysedInputKey) return;
      applyAnalysis(result);
    } catch (analysisFailure) {
      if (currentAnalysisInputKey.current !== analysedInputKey) return;
      setAnalysisError(analysisFailure instanceof Error ? analysisFailure.message : "The analyser could not read this brief. You can still enter the rubric manually.");
    } finally {
      setIsAnalysing(false);
    }
  }

  function applyAnalysis(result: AssignmentAnalysisResponse) {
    const { analysis } = result;
    const matchedModule = findMatchingModule(
      modules,
      analysis.moduleCode,
      analysis.moduleName,
    );
    setDraft((current) => ({
      ...current,
      moduleId: matchedModule?.id ?? current.moduleId,
      title: analysis.title ?? current.title,
      deadline: analysis.deadline ?? current.deadline,
      moduleWeight: analysis.moduleWeight ? String(analysis.moduleWeight) : current.moduleWeight,
    }));
    // A brief is one coherent source of truth for its rubric. A successful
    // analysis always replaces the current list; the editable task list is
    // where the student verifies and adjusts the result.
    setTasks(analysis.tasks.map((task) => ({
      id: createId(),
      name: task.name,
      marks: task.marks === null ? "" : String(task.marks),
      complexity: String(task.complexity) as TaskDraft["complexity"],
      notes: task.requirements.join("\n"),
    })));
    setShowTasks(true);
    setHasAnalysedBrief(true);
    setShowAnalysis(false);
    setStatus(analysis.tasks.length
      ? `Brief analysed. Review the ${analysis.tasks.length} task${analysis.tasks.length === 1 ? "" : "s"}, then save when ready.`
      : "Brief analysed. Add any task parts you want to use, then save when ready.");
    setError("");
  }

  function deleteAssignment(assignment: Assignment) {
    // Deletion removes the assignment's planning state (StudyBlocks, plan
    // snapshot) as one coherent operation, not just the Assignment record -
    // otherwise orphaned StudyBlocks keep appearing in Calendar and can keep
    // reserving time for a deleted assignment. Undo restores all three together.
    const { remainingStudyBlocks, remainingPlanSnapshots, removedStudyBlocks, removedPlanSnapshot } = removeAssignmentPlanningState(
      readStoredValue<StudyBlock[]>(storageKeys.studyBlocks, []),
      readStoredValue<Record<string, string>>(storageKeys.planSnapshots, {}),
      assignment.id,
    );

    setAssignments((current) => current.filter((item) => item.id !== assignment.id));

    if (removedStudyBlocks.length) writeStoredValue(storageKeys.studyBlocks, remainingStudyBlocks);
    if (removedPlanSnapshot !== undefined) writeStoredValue(storageKeys.planSnapshots, remainingPlanSnapshots);

    setDeletedAssignment({ assignment, studyBlocks: removedStudyBlocks, planSnapshot: removedPlanSnapshot });
    setStatus("");
  }

  function restoreDeletedAssignment() {
    if (!deletedAssignment) return;
    const { assignment, studyBlocks, planSnapshot } = deletedAssignment;

    setAssignments((current) => [...current, assignment]);

    const { restoredStudyBlocks, restoredPlanSnapshots } = restoreAssignmentPlanningState(
      readStoredValue<StudyBlock[]>(storageKeys.studyBlocks, []),
      readStoredValue<Record<string, string>>(storageKeys.planSnapshots, {}),
      assignment.id,
      studyBlocks,
      planSnapshot,
    );
    if (studyBlocks.length) writeStoredValue(storageKeys.studyBlocks, restoredStudyBlocks);
    if (planSnapshot !== undefined) writeStoredValue(storageKeys.planSnapshots, restoredPlanSnapshots);

    setDeletedAssignment(null);
    setStatus("Assignment restored.");
  }

  if (!isLoaded || !isOnboardingLoaded) {
    return <div className="h-44 animate-pulse border-y border-[var(--line)] bg-[var(--surface-soft)]" aria-label="Loading assignment" />;
  }

  if (!onboarding.completed) return <OnboardingRequired />;

  return (
    <div className="space-y-10">
      <section className="grid gap-5 border-y border-[var(--line)] py-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center" aria-labelledby="assignment-form-heading">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--accent-strong)]">Assignment details</p>
          <h2 id="assignment-form-heading" className="mt-1 text-xl font-semibold tracking-[-0.03em]">Start with the essentials.</h2>
          <p className="mt-2 max-w-xl text-sm leading-6 text-[var(--muted-ink)]">Module, deadline and weighting are enough. Add a brief or tasks when you have them.</p>
        </div>
        <button type="button" onClick={loadDemo} className="inline-flex min-h-11 items-center justify-center rounded-xl border border-[var(--accent)] px-4 text-sm font-semibold text-[var(--accent-strong)] transition-colors hover:bg-[var(--accent-soft)]">
          Load demo assignment
        </button>
      </section>

      {!modules.length && isLoaded ? (
        <section className="border-y border-[var(--line)] bg-[var(--surface-soft)] px-5 py-6 text-sm leading-6 text-[var(--muted-ink)]">
          <p className="font-semibold text-[var(--ink)]">Set up your Calendar first.</p>
          <p className="mt-1">Its modules are used to connect an assignment to the week you actually have.</p>
          <Link href="/setup" className="mt-4 inline-flex min-h-11 items-center rounded-xl bg-[var(--accent)] px-4 font-semibold text-white transition-colors hover:bg-[var(--accent-strong)]">Go to Calendar</Link>
        </section>
      ) : (
        <form onSubmit={saveAssignment} className="max-w-3xl space-y-7">
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

            {hasUnconfirmedSelection ? <p className="rounded-xl bg-[var(--surface-soft)] px-4 py-3 text-sm leading-6 text-[var(--muted-ink)]">This module still needs its credits confirmed in <Link href="/setup" className="font-semibold text-[var(--accent-strong)] underline underline-offset-2">Calendar</Link>.</p> : null}

            <section className="border-t border-[var(--line)] pt-6" aria-labelledby="analysis-heading">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--accent-strong)]">Optional</p>
                  <h3 id="analysis-heading" className="mt-1 text-lg font-semibold tracking-[-0.025em]">Use an assignment brief.</h3>
                  <p className="mt-1 max-w-xl text-sm leading-6 text-[var(--muted-ink)]">Paste or upload a brief to draft the assignment details and rubric.</p>
                </div>
                {hasAnalysedBrief ? (
                  <button type="button" onClick={() => { updateBriefText(""); setShowAnalysis(true); }} className="min-h-11 rounded-xl border border-[var(--line)] px-4 text-sm font-semibold text-[var(--ink)] transition-colors hover:border-[var(--accent)]">Replace brief</button>
                ) : showAnalysis ? (
                  <button type="button" onClick={() => updateBriefText("CS301 Coursework Project\n\nThis coursework contributes 40% of the module grade.\nSubmission deadline: 28 August 2026.\n\nAssessment:\nDesign and implementation, 45 marks\nDevelop a working application implementing the required core functionality.\n\nTesting and evaluation, 25 marks\nProvide appropriate test cases and critically evaluate the finished solution.\n\nTechnical report, 20 marks\nSubmit a report of approximately 2,500 words documenting architecture, implementation decisions and evaluation.\n\nPresentation, 10 marks\nDeliver a five-minute presentation demonstrating the completed system.")} className="min-h-11 rounded-xl border border-[var(--line)] px-4 text-sm font-semibold text-[var(--ink)] transition-colors hover:border-[var(--accent)]">Load sample brief</button>
                ) : (
                  <button type="button" onClick={() => setShowAnalysis(true)} className="min-h-11 rounded-xl border border-[var(--line)] px-4 text-sm font-semibold text-[var(--ink)] transition-colors hover:border-[var(--accent)]">Add a brief to analyse</button>
                )}
              </div>
              {showAnalysis ? (
                <>
                  <label className="mt-4 block text-sm font-medium">
                    Assignment brief
                    <textarea value={briefText} onChange={(event) => updateBriefText(event.target.value)} disabled={Boolean(analysisImage)} className={`${inputClassName} min-h-36 py-3 disabled:cursor-not-allowed disabled:bg-[var(--surface-soft)]`} placeholder="Paste the assessment brief or rubric here" />
                  </label>
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted-ink)]">or</span>
                    <label className={`inline-flex min-h-11 cursor-pointer items-center justify-center rounded-xl border border-[var(--line)] px-4 text-sm font-semibold text-[var(--ink)] transition-colors hover:border-[var(--accent)] ${isPreparingImage ? "cursor-not-allowed opacity-60" : ""}`}>
                      <input ref={imageInput} type="file" accept="image/png,image/jpeg,image/webp,application/pdf,.pdf" onChange={(event) => void selectAnalysisFile(event.target.files?.[0])} disabled={isPreparingImage} className="sr-only" />
                      {isPreparingImage ? "Preparing file…" : "Upload screenshot or PDF"}
                    </label>
                    <p className="text-sm text-[var(--muted-ink)]">PNG, JPEG, WebP or PDF, up to 8 MB (15 MB for PDF). A PDF&apos;s text is read locally first; a scanned PDF is prepared as an image instead. Sent to the hosted analyser only when you click Analyse.</p>
                  </div>
                  {analysisImage ? <div className="mt-3 flex flex-wrap items-center gap-3 border-y border-[var(--line)] py-3 text-sm"><p className="font-semibold text-[var(--ink)]">Screenshot ready: {analysisImage.filename}</p><p className="text-[var(--muted-ink)]">Prepared for analysis, not saved.</p><button type="button" onClick={clearAnalysisImage} className="min-h-10 font-semibold text-[var(--accent-strong)] underline underline-offset-2">Remove screenshot</button></div> : null}
                  {!canAnalyseScreenshot ? <p className="mt-3 text-sm leading-6 text-[var(--muted-ink)]">Screenshots and scanned PDFs use the hosted analyser. A PDF with a text layer still works locally. Use the deployed app or configure <code>NEXT_PUBLIC_ANALYZER_URL</code> to enable the rest.</p> : null}
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <button type="button" onClick={analyseBrief} disabled={(!briefText.trim() && !analysisImage) || isAnalysing || isPreparingImage} className="inline-flex min-h-11 items-center justify-center rounded-xl bg-[var(--accent)] px-4 text-sm font-semibold text-white transition-colors hover:bg-[var(--accent-strong)] disabled:cursor-not-allowed disabled:bg-[var(--line)] disabled:text-[var(--muted-ink)]">
                      {isAnalysing ? "Analysing source…" : analysisImage ? "Analyse screenshot with AI" : "Analyse brief with AI"}
                    </button>
                    <p className="text-sm text-[var(--muted-ink)]">It fills this form and replaces the task list. You can edit everything before saving.</p>
                  </div>
                  {analysisError ? <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm leading-6 text-red-800" role="alert">{analysisError}</p> : null}
                </>
              ) : null}

              {hasAnalysedBrief ? (
                <details className="mt-5 border-y border-[var(--line)] py-4 text-sm leading-6 text-[var(--muted-ink)]">
                  <summary className="cursor-pointer font-semibold text-[var(--accent-strong)]">View analysed brief</summary>
                  {briefText ? <p className="mt-3 max-h-80 overflow-y-auto whitespace-pre-wrap">{briefText}</p> : null}
                  {analysisImage ? <Image src={`data:${analysisImage.mimeType};base64,${analysisImage.base64}`} alt="Uploaded assignment brief" width={800} height={1100} unoptimized className="mt-3 h-auto max-h-[32rem] w-full rounded-lg border border-[var(--line)] object-contain" /> : null}
                </details>
              ) : null}
            </section>

            <section className="border-t border-[var(--line)] pt-6" aria-labelledby="tasks-heading">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 id="tasks-heading" className="text-lg font-semibold tracking-[-0.025em]">Rubric tasks</h3>

                {tasks.length ? (
                  <p className="text-sm font-semibold text-[var(--muted-ink)]">{taskMarks}% of weighting allocated</p>
                ) : !showTasks ? (
                  <button
                    type="button"
                    onClick={() => { setShowTasks(true); setError(""); }}
                    className="min-h-11 rounded-xl border border-[var(--line)] px-4 text-sm font-semibold text-[var(--ink)] transition-colors hover:border-[var(--accent)]"
                  >
                    Add tasks manually
                  </button>
                ) : null}
              </div>

              {showTasks ? (
                <div className="mt-5 space-y-4">
                  {tasks.map((task, index) => (
                    <fieldset key={task.id} className="border-t border-[var(--line)] pt-4">
                      <legend className="sr-only">Part {index + 1}</legend>
                      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_7rem_9rem_auto] sm:items-end">
                        <label className="text-sm font-medium">Pt {index + 1}<input value={task.name} onChange={(event) => updateTask(task.id, { name: event.target.value })} className={inputClassName} placeholder="Technical report" /></label>
                        <label className="text-sm font-medium">Marks<input value={task.marks} onChange={(event) => updateTask(task.id, { marks: event.target.value })} className={inputClassName} type="number" min="1" placeholder="20" /></label>
                        <label className="text-sm font-medium">Complexity<select value={task.complexity} onChange={(event) => updateTask(task.id, { complexity: event.target.value as TaskDraft["complexity"] })} className={inputClassName}><option value="1">Low</option><option value="2">Medium</option><option value="3">High</option></select></label>
                        <button type="button" onClick={() => setTasks((current) => current.filter((item) => item.id !== task.id))} aria-label={`Remove part ${index + 1}`} className="min-h-11 rounded-xl border border-[var(--line)] px-3 text-sm font-semibold text-[var(--muted-ink)] transition-colors hover:border-red-300 hover:text-red-700">Remove</button>
                      </div>
                      <details className="mt-3 text-sm">
                        <summary className="cursor-pointer font-semibold text-[var(--accent-strong)]">{task.notes.trim() ? "Edit notes" : "Add notes"}</summary>
                        <label className="mt-2 block text-sm font-medium">Notes<textarea value={task.notes} onChange={(event) => updateTask(task.id, { notes: event.target.value })} className={`${inputClassName} min-h-20 py-2`} placeholder="e.g. 2,500 words or a five-minute presentation" /></label>
                      </details>
                    </fieldset>
                  ))}

                  <button type="button" onClick={() => setTasks((current) => [...current, createEmptyTask()])} className="min-h-11 rounded-xl border border-[var(--accent)] px-4 text-sm font-semibold text-[var(--accent-strong)] transition-colors hover:bg-[var(--accent-soft)]">Add task</button>
                </div>
              ) : null}
            </section>

          <section className="border-t border-[var(--line)] pt-6" aria-labelledby="save-assignment-heading">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--accent-strong)]">Ready when you are</p>
            <h2 id="save-assignment-heading" className="mt-2 text-xl font-semibold tracking-[-0.03em]">Save and review your plan.</h2>
            <p className="mt-2 max-w-xl text-sm leading-6 text-[var(--muted-ink)]">PlanAround will take this reviewed assignment straight to its workload and plan.</p>
            {error ? <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm leading-6 text-red-800" role="alert">{error}</p> : null}
            {status ? <p className="mt-4 rounded-xl bg-[var(--accent-soft)] px-4 py-3 text-sm leading-6 text-[var(--accent-strong)]" role="status">{status}</p> : null}
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <button type="submit" disabled={!modules.length || hasUnconfirmedSelection} className="inline-flex min-h-11 items-center justify-center rounded-xl bg-[var(--accent)] px-5 text-sm font-semibold text-white transition-colors hover:bg-[var(--accent-strong)] disabled:cursor-not-allowed disabled:bg-[var(--line)] disabled:text-[var(--muted-ink)]">Save assignment and review plan</button>
              <button type="button" onClick={discardDraft} className="inline-flex min-h-11 items-center justify-center rounded-xl px-4 text-sm font-semibold text-[var(--muted-ink)] transition-colors hover:text-red-700">Discard draft</button>
            </div>
          </section>
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

        {deletedAssignment ? <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[var(--surface-soft)] px-4 py-3 text-sm"><span><span className="font-semibold">{deletedAssignment.assignment.title}</span> was deleted.</span><button type="button" onClick={restoreDeletedAssignment} className="min-h-10 rounded-lg px-3 font-semibold text-[var(--accent-strong)] hover:bg-[var(--accent-soft)]">Undo</button></div> : null}

        {assignments.length ? (
          <ul className="mt-4 divide-y divide-[var(--line)] border-y border-[var(--line)]">
            {assignments.map((assignment) => {
              const linkedModule = modules.find((item) => item.id === assignment.moduleId);
              return (
                <li key={assignment.id} className="grid gap-3 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                  <div>
                    <p className="font-semibold">{assignment.title}</p>
                    <p className="mt-1 text-sm text-[var(--muted-ink)]">{linkedModule?.code ?? linkedModule?.name ?? "Module removed"} · Due {formatDeadline(assignment.deadline)} · {assignment.moduleWeight}% · {assignment.tasks.length ? `${assignment.tasks.length} task${assignment.tasks.length === 1 ? "" : "s"}` : "No task breakdown"}</p>
                  </div>
                  <div className="flex flex-wrap gap-1 sm:justify-self-end">
                    <Link href={`/plan?assignment=${encodeURIComponent(assignment.id)}`} className="inline-flex min-h-10 items-center rounded-lg px-3 text-sm font-semibold text-[var(--accent-strong)] transition-colors hover:bg-[var(--accent-soft)]">Open plan</Link>
                    <button type="button" onClick={() => deleteAssignment(assignment)} className="min-h-10 rounded-lg px-3 text-sm font-semibold text-[var(--muted-ink)] transition-colors hover:bg-red-50 hover:text-red-700">Delete</button>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : <p className="mt-4 text-sm leading-6 text-[var(--muted-ink)]">No assignments saved yet. Add one above, or load the demo details to see the full flow.</p>}
      </section>

    </div>
  );
}
