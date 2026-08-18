"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createPlanFingerprint, getPlanChangeReasons, getReservableStudyBlocks, type PlanChangeReason } from "@/lib/planSnapshot";
import { generateStudySchedule } from "@/lib/scheduler";
import { readStoredValue, storageKeys, writeStoredValue } from "@/lib/storage";
import { calculateWorkloadBreakdown } from "@/lib/workload";
import { calculateRemainingWorkload, completedMinutes, replaceIncompleteBlocksForAssignment, studyBlockMinutes } from "@/lib/studyProgress";
import { summarizeReplan, type ReplanSummary } from "@/lib/replanSummary";
import { OnboardingRequired } from "@/components/OnboardingRequired";
import { useOnboardingState } from "@/lib/onboarding";
import type { Assignment, Commitment, DatedCommitment, Module, ScheduleResult, StudyBlock, TimetableEntry } from "@/types";

type PlanStatus = ScheduleResult["status"];

const planChangeReasonCopy: Record<PlanChangeReason, string> = {
  assignment: "Assignment details changed",
  "module-workload": "Module workload changed",
  timetable: "Timetable availability changed",
  "recurring-commitments": "Recurring commitments changed",
  "dated-commitments": "One-off availability changed",
};

type ReplanUpdate = { summary: ReplanSummary; reasons: PlanChangeReason[]; status: PlanStatus };

const statusCopy: Record<PlanStatus, { label: string; detail: string; className: string }> = {
  "on-track": {
    label: "On track",
    detail: "The focused work fits before the deadline date.",
    className: "bg-[var(--accent-soft)] text-[var(--accent-strong)]",
  },
  tight: {
    label: "Tight",
    detail: "The work fits only by using time on the deadline date.",
    className: "bg-amber-50 text-amber-900",
  },
  "not-enough-time": {
    label: "Not enough time",
    detail: "Even the full available window cannot hold the recommended focused time.",
    className: "bg-red-50 text-red-800",
  },
};

function formatHours(hours: number) {
  return `${Number.isInteger(hours) ? hours.toFixed(0) : hours.toFixed(1)}h`;
}

function formatDate(date: string) {
  return new Intl.DateTimeFormat("en-IE", { weekday: "long", day: "numeric", month: "short" }).format(new Date(`${date}T12:00:00`));
}

function formatDeadline(date: string) {
  return new Intl.DateTimeFormat("en-IE", { day: "numeric", month: "short", year: "numeric" }).format(new Date(`${date}T12:00:00`));
}

function blockDuration(block: StudyBlock) {
  return formatHours(studyBlockMinutes(block) / 60);
}

function getResultForExistingBlocks(blocks: StudyBlock[], recalculatedResult: ScheduleResult): ScheduleResult | null {
  if (!blocks.length) return null;
  const scheduledHours = blocks.reduce((total, block) => total + studyBlockMinutes(block) / 60, 0);

  return {
    ...recalculatedResult,
    studyBlocks: blocks,
    scheduledHours,
    unscheduledHours: Math.max(0, recalculatedResult.requiredHours - scheduledHours),
  };
}

export function PlanWorkspace() {
  const { onboarding, isOnboardingLoaded } = useOnboardingState();
  const [modules, setModules] = useState<Module[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [commitments, setCommitments] = useState<Commitment[]>([]);
  const [datedCommitments, setDatedCommitments] = useState<DatedCommitment[]>([]);
  const [timetableEntries, setTimetableEntries] = useState<TimetableEntry[]>([]);
  const [studyBlocks, setStudyBlocks] = useState<StudyBlock[]>([]);
  const [planSnapshots, setPlanSnapshots] = useState<Record<string, string>>({});
  const [selectedAssignmentId, setSelectedAssignmentId] = useState("");
  const [generatedResult, setGeneratedResult] = useState<ScheduleResult | null>(null);
  const [lastReplanUpdate, setLastReplanUpdate] = useState<ReplanUpdate | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    const hydrationTimer = window.setTimeout(() => {
      const storedModules = readStoredValue<Module[]>(storageKeys.modules, []);
      const storedAssignments = readStoredValue<Assignment[]>(storageKeys.assignments, []);
      setModules(storedModules);
      setAssignments(storedAssignments);
      setCommitments(readStoredValue<Commitment[]>(storageKeys.commitments, []));
      setDatedCommitments(readStoredValue<DatedCommitment[]>(storageKeys.datedCommitments, []));
      setTimetableEntries(readStoredValue<TimetableEntry[]>(storageKeys.timetableEntries, []));
      setStudyBlocks(readStoredValue<StudyBlock[]>(storageKeys.studyBlocks, []));
      setPlanSnapshots(readStoredValue<Record<string, string>>(storageKeys.planSnapshots, {}));
      const latestSchedulableAssignment = [...storedAssignments].reverse().find((assignment) => storedModules.some((module) => module.id === assignment.moduleId));
      setSelectedAssignmentId(latestSchedulableAssignment?.id ?? "");
      setIsLoaded(true);
    }, 0);

    return () => window.clearTimeout(hydrationTimer);
  }, []);

  useEffect(() => {
    if (isLoaded) writeStoredValue(storageKeys.studyBlocks, studyBlocks);
  }, [isLoaded, studyBlocks]);

  useEffect(() => {
    if (isLoaded) writeStoredValue(storageKeys.planSnapshots, planSnapshots);
  }, [isLoaded, planSnapshots]);

  const schedulableAssignments = useMemo(
    () => assignments.filter((assignment) => modules.some((module) => module.id === assignment.moduleId)),
    [assignments, modules],
  );
  const selectedAssignment = schedulableAssignments.find((assignment) => assignment.id === selectedAssignmentId) ?? null;
  const selectedModule = selectedAssignment ? modules.find((module) => module.id === selectedAssignment.moduleId) ?? null : null;
  const workload = selectedAssignment && selectedModule ? calculateWorkloadBreakdown(selectedModule.credits, selectedAssignment) : null;
  const storedSelectedBlocks = selectedAssignment ? studyBlocks.filter((block) => block.assignmentId === selectedAssignment.id) : [];
  const completedSelectedBlocks = storedSelectedBlocks.filter((block) => block.completedAt);
  const focusedMinutes = workload ? Math.round(workload.usableHours * 60) : 0;
  // Clamp so legacy or edge-case data can't show completed time exceeding the
  // current focused-work recommendation, or a negative remainder.
  const completedFocusedMinutes = Math.min(focusedMinutes, completedMinutes(storedSelectedBlocks));
  // Remaining is computed per task (see calculateRemainingWorkload), not by a
  // single global subtraction: a task completed ahead of schedule must not
  // offset an unrelated task that still needs its full recommended time.
  const remainingWorkload = workload ? calculateRemainingWorkload(workload, completedSelectedBlocks) : null;
  const remainingFocusedHours = remainingWorkload?.usableHours ?? 0;
  const isFullyCompleted = !remainingWorkload
    ? false
    : Math.round(remainingWorkload.usableHours * 60) <= 0 && completedSelectedBlocks.length > 0;
  const reservedBlocks = selectedAssignment && selectedModule
    ? getReservableStudyBlocks({
      currentAssignmentId: selectedAssignment.id,
      assignments,
      modules,
      studyBlocks,
      planSnapshots,
      timetableEntries,
      commitments,
      datedCommitments,
    })
    : [];
  // The scheduler only exempts a same-assignment block from reserving time
  // when it is completed (finished history at a real time), so this assignment's
  // own completed sessions must be included here alongside other assignments'.
  const assignmentReservedBlocks = [...reservedBlocks, ...completedSelectedBlocks];
  const currentFingerprint = selectedAssignment && selectedModule
    ? createPlanFingerprint({ assignment: selectedAssignment, module: selectedModule, timetableEntries, commitments, datedCommitments })
    : null;
  const isStoredPlanStale = Boolean(
    selectedAssignment
      && storedSelectedBlocks.length
      && currentFingerprint
      && planSnapshots[selectedAssignment.id] !== currentFingerprint,
  );
  // Deterministic, not AI-derived: compares the stored fingerprint against
  // current inputs category by category so the stale banner can say what
  // actually changed instead of just that something did.
  const staleReasons = isStoredPlanStale && selectedAssignment && selectedModule
    ? getPlanChangeReasons(planSnapshots[selectedAssignment.id], { assignment: selectedAssignment, module: selectedModule, timetableEntries, commitments, datedCommitments })
    : [];
  const recalculatedResult = selectedAssignment && workload
    ? generateStudySchedule({ assignment: selectedAssignment, workload, timetableEntries, commitments, datedCommitments, reservedBlocks: assignmentReservedBlocks })
    : null;
  // While stale, only completed sessions remain valid history - obsolete
  // incomplete sessions are hidden until the user replans the remainder.
  const existingResult = recalculatedResult
    ? getResultForExistingBlocks(isStoredPlanStale ? completedSelectedBlocks : storedSelectedBlocks, recalculatedResult)
    : null;
  const result = generatedResult ?? existingResult;
  const isCompletedHistoryOnly = isStoredPlanStale && !generatedResult;
  // `result.studyBlocks` can be a snapshot taken at generation time, so completion
  // toggles (which only update the `studyBlocks` state) would not appear here
  // without re-reading each block's current state by id.
  const liveBlocksById = new Map(studyBlocks.map((block) => [block.id, block]));
  const groupedBlocks = (result?.studyBlocks ?? []).reduce<Record<string, StudyBlock[]>>((groups, resultBlock) => {
    const block = liveBlocksById.get(resultBlock.id) ?? resultBlock;
    (groups[block.date] ??= []).push(block);
    return groups;
  }, {});
  const planActionLabel = !storedSelectedBlocks.length && !generatedResult
    ? "Generate plan"
    : isFullyCompleted
      ? "Regenerate plan"
      : isStoredPlanStale || completedSelectedBlocks.length > 0
        ? "Replan remaining work"
        : "Regenerate plan";

  function generateOrReplan() {
    if (!selectedAssignment || !selectedModule || !remainingWorkload) return;

    // Scheduling only the remaining workload naturally covers every case: a
    // fresh assignment (remaining equals the full recommendation), a plain
    // regenerate (no completed work to preserve), and a true replan (some
    // work done, only the rest gets rescheduled). A remaining workload of
    // zero simply produces no new blocks, so completed history stands alone.
    const scheduled = generateStudySchedule({
      assignment: selectedAssignment,
      workload: remainingWorkload,
      timetableEntries,
      commitments,
      datedCommitments,
      reservedBlocks: assignmentReservedBlocks,
    });
    // The scheduler only returns newly placed blocks, so completed history
    // is added back in for display - the same blocks already preserved in
    // storage below - to avoid a stale-looking list until the next reload.
    const allPlacedBlocks = [...completedSelectedBlocks, ...scheduled.studyBlocks];

    setStudyBlocks((current) => replaceIncompleteBlocksForAssignment(current, selectedAssignment.id, scheduled.studyBlocks));
    setPlanSnapshots((current) => ({
      ...current,
      [selectedAssignment.id]: createPlanFingerprint({ assignment: selectedAssignment, module: selectedModule, timetableEntries, commitments, datedCommitments }),
    }));
    setGeneratedResult({
      ...scheduled,
      studyBlocks: allPlacedBlocks,
      scheduledHours: allPlacedBlocks.reduce((total, block) => total + studyBlockMinutes(block) / 60, 0),
    });
    // Only a regenerate or replan is an "update" - a first-time generate has
    // no prior plan to compare against, so there is nothing to explain yet.
    setLastReplanUpdate(
      storedSelectedBlocks.length
        ? { summary: summarizeReplan(storedSelectedBlocks, scheduled.studyBlocks), reasons: staleReasons, status: scheduled.status }
        : null,
    );
  }

  function chooseAssignment(id: string) {
    setSelectedAssignmentId(id);
    setGeneratedResult(null);
    setLastReplanUpdate(null);
  }

  function toggleStudyBlockCompletion(blockId: string) {
    setStudyBlocks((current) =>
      current.map((block) =>
        block.id === blockId
          ? { ...block, completedAt: block.completedAt ? undefined : new Date().toISOString() }
          : block,
      ),
    );
  }

  if (!isLoaded || !isOnboardingLoaded) {
    return <div className="h-44 animate-pulse border-y border-[var(--line)] bg-[var(--surface-soft)]" aria-label="Loading plan" />;
  }

  if (!onboarding.completed) return <OnboardingRequired destination="plan" />;

  if (!schedulableAssignments.length) {
    return (
      <section className="border-y border-[var(--line)] bg-[var(--surface-soft)] px-5 py-7" aria-labelledby="plan-empty-heading">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--accent-strong)]">Ready to schedule</p>
        <h2 id="plan-empty-heading" className="mt-1 text-xl font-semibold tracking-[-0.03em]">Add an assignment first.</h2>
        <p className="mt-2 max-w-xl text-sm leading-6 text-[var(--muted-ink)]">PlanAround needs an assignment linked to one of your Calendar modules before it can find focused study periods.</p>
        <Link href="/assignment" className="mt-5 inline-flex min-h-11 items-center rounded-xl bg-[var(--accent)] px-4 text-sm font-semibold text-white transition-colors hover:bg-[var(--accent-strong)]">Go to assignment</Link>
      </section>
    );
  }

  const selectedStatus = result ? statusCopy[result.status] : null;

  return (
    <div className="space-y-9">
      <section className="grid gap-5 border-y border-[var(--line)] py-6 lg:grid-cols-[minmax(0,1fr)_14rem] lg:items-end" aria-labelledby="plan-controls-heading">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--accent-strong)]">Assignment plan</p>
          <h2 id="plan-controls-heading" className="mt-1 text-xl font-semibold tracking-[-0.03em]">Make room for the work.</h2>
          <p className="mt-2 max-w-xl text-sm leading-6 text-[var(--muted-ink)]">PlanAround checks the Calendar and commitments you entered, then places the workload into the remaining time before the deadline.</p>
        </div>
        <label className="text-sm font-medium">
          Assignment
          <select value={selectedAssignmentId} onChange={(event) => chooseAssignment(event.target.value)} className="mt-1.5 min-h-11 w-full rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 text-sm text-[var(--ink)] outline-none transition-colors focus:border-[var(--accent)]">
            {schedulableAssignments.map((assignment) => <option key={assignment.id} value={assignment.id}>{assignment.title}</option>)}
          </select>
        </label>
      </section>

      {selectedAssignment && selectedModule && workload ? (
        <>
          <section className="grid gap-5 border-y border-[var(--line)] py-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center" aria-labelledby="plan-summary-heading">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--accent-strong)]">{selectedModule.code ?? selectedModule.name}</p>
              <h2 id="plan-summary-heading" className="mt-1 text-2xl font-semibold tracking-[-0.035em]">{selectedAssignment.title}</h2>
              <p className="mt-2 text-sm leading-6 text-[var(--muted-ink)]">Due {formatDeadline(selectedAssignment.deadline)}. Finish before the deadline date where possible.</p>
            </div>
            <button type="button" onClick={generateOrReplan} className="inline-flex min-h-11 items-center justify-center rounded-xl bg-[var(--accent)] px-5 text-sm font-semibold text-white transition-colors hover:bg-[var(--accent-strong)]">
              {planActionLabel}
            </button>
          </section>

          <dl className="grid border-y border-[var(--line)] sm:grid-cols-4">
            <div className="py-4 sm:border-r sm:border-[var(--line)] sm:pr-5"><dt className="text-sm text-[var(--muted-ink)]">Total recommendation</dt><dd className="mt-1 text-2xl font-semibold tracking-[-0.03em]">{formatHours(workload.totalHours)}</dd></div>
            <div className="border-t border-[var(--line)] py-4 sm:border-t-0 sm:border-r sm:px-5"><dt className="text-sm text-[var(--muted-ink)]">Focused work</dt><dd className="mt-1 text-2xl font-semibold tracking-[-0.03em]">{formatHours(workload.usableHours)}</dd></div>
            <div className="border-t border-[var(--line)] py-4 sm:border-t-0 sm:border-r sm:px-5"><dt className="text-sm text-[var(--muted-ink)]">Project buffer</dt><dd className="mt-1 text-2xl font-semibold tracking-[-0.03em]">{formatHours(workload.bufferHours)}</dd></div>
            <div className="border-t border-[var(--line)] py-4 sm:border-t-0 sm:pl-5"><dt className="text-sm text-[var(--muted-ink)]">Focused work scheduled</dt><dd className="mt-1 text-2xl font-semibold tracking-[-0.03em]">{result ? formatHours(result.scheduledHours) : "Not yet"}</dd></div>
          </dl>

          <section className="border-b border-[var(--line)] pb-5" aria-labelledby="plan-progress-heading">
            <h3 id="plan-progress-heading" className="text-sm font-semibold">Progress</h3>
            <dl className="mt-3 grid gap-4 sm:grid-cols-3">
              <div><dt className="text-sm text-[var(--muted-ink)]">Focused work</dt><dd className="mt-1 text-xl font-semibold tracking-[-0.03em]">{formatHours(workload.usableHours)}</dd></div>
              <div><dt className="text-sm text-[var(--muted-ink)]">Completed</dt><dd className="mt-1 text-xl font-semibold tracking-[-0.03em]">{formatHours(completedFocusedMinutes / 60)}</dd></div>
              <div><dt className="text-sm text-[var(--muted-ink)]">Remaining</dt><dd className="mt-1 text-xl font-semibold tracking-[-0.03em]">{formatHours(remainingFocusedHours)}</dd></div>
            </dl>
          </section>

          <section className="border-b border-[var(--line)] pb-5" aria-labelledby="plan-task-summary-heading">
            <h3 id="plan-task-summary-heading" className="text-sm font-semibold">Work split</h3>
            <ul className="mt-3 divide-y divide-[var(--line)] border-y border-[var(--line)]">
              {workload.taskHours.map((task) => <li key={task.id} className="flex items-center justify-between gap-4 py-2.5 text-sm"><span>{task.name}</span><span className="font-semibold tabular-nums">{formatHours(task.recommendedHours)}</span></li>)}
            </ul>
          </section>

          {isStoredPlanStale ? (
            <section className="border-y border-amber-200 bg-amber-50 px-5 py-4 text-amber-950" role="status">
              <p className="font-semibold">Your availability changed.</p>
              <p className="mt-1 text-sm leading-6">Replan the remaining work to keep this schedule realistic. Completed study time will be preserved.</p>
              {staleReasons.length ? <p className="mt-1 text-sm leading-6">Reason: {staleReasons.map((reason) => planChangeReasonCopy[reason]).join(", ")}</p> : null}
            </section>
          ) : null}

          {lastReplanUpdate ? (
            <section className="border-y border-[var(--line)] bg-[var(--surface-soft)] px-5 py-4 text-sm leading-6" role="status" aria-live="polite">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--accent-strong)]">Plan updated</p>
              {lastReplanUpdate.summary.removedBlocks === 0 && lastReplanUpdate.summary.addedBlocks === 0 ? (
                <p className="mt-1">The plan was checked and recalculated with no change to session placement.</p>
              ) : (
                <>
                  <p className="mt-1">{lastReplanUpdate.summary.removedBlocks} old session{lastReplanUpdate.summary.removedBlocks === 1 ? "" : "s"} replaced with {lastReplanUpdate.summary.addedBlocks} new session{lastReplanUpdate.summary.addedBlocks === 1 ? "" : "s"}.</p>
                  <p>{formatHours(lastReplanUpdate.summary.rescheduledMinutes / 60)} of remaining study time was rescheduled.</p>
                </>
              )}
              {lastReplanUpdate.reasons.length ? <p>Reason: {lastReplanUpdate.reasons.map((reason) => planChangeReasonCopy[reason]).join(", ")}</p> : null}
              <p>Status: {statusCopy[lastReplanUpdate.status].label}</p>
            </section>
          ) : null}

          {isFullyCompleted ? (
            <section className="border-y border-[var(--line)] bg-[var(--accent-soft)] px-5 py-5 text-[var(--accent-strong)]" aria-live="polite">
              <p className="text-xs font-bold uppercase tracking-[0.14em]">Schedule status</p>
              <h2 className="mt-1 text-2xl font-semibold tracking-[-0.035em]">All done</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6">Every focused hour for this assignment is marked complete.</p>
            </section>
          ) : null}

          {result && selectedStatus && !isCompletedHistoryOnly && !isFullyCompleted ? (
            <>
              <section className={`border-y border-[var(--line)] px-5 py-5 ${selectedStatus.className}`} aria-live="polite">
                <div className="flex flex-wrap items-baseline justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.14em]">Schedule status</p>
                    <h2 className="mt-1 text-2xl font-semibold tracking-[-0.035em]">{selectedStatus.label}</h2>
                  </div>
                  <p className="text-lg font-semibold tabular-nums">{formatHours(result.scheduledHours)} scheduled</p>
                </div>
                <p className="mt-2 max-w-2xl text-sm leading-6">{selectedStatus.detail}</p>
              </section>

              <dl className="grid border-y border-[var(--line)] sm:grid-cols-3">
                <div className="py-4 sm:border-r sm:border-[var(--line)] sm:pr-5"><dt className="text-sm text-[var(--muted-ink)]">Focused work needed</dt><dd className="mt-1 text-2xl font-semibold tracking-[-0.03em]">{formatHours(result.requiredHours)}</dd></div>
                <div className="border-t border-[var(--line)] py-4 sm:border-t-0 sm:border-r sm:px-5"><dt className="text-sm text-[var(--muted-ink)]">Before deadline date</dt><dd className="mt-1 text-2xl font-semibold tracking-[-0.03em]">{result.bufferedAvailableHours ? formatHours(result.bufferedAvailableHours) : "Saved plan"}</dd></div>
                <div className="border-t border-[var(--line)] py-4 sm:border-t-0 sm:pl-5"><dt className="text-sm text-[var(--muted-ink)]">Still unplaced</dt><dd className="mt-1 text-2xl font-semibold tracking-[-0.03em]">{formatHours(result.unscheduledHours)}</dd></div>
              </dl>

              {result.status === "tight" ? <p className="text-sm leading-6 text-[var(--muted-ink)]">The plan uses the deadline date because the earlier window has {formatHours(result.bufferedAvailableHours)} available and the assignment needs {formatHours(result.requiredHours)}.</p> : null}
              {result.status === "not-enough-time" ? <p className="text-sm leading-6 text-[var(--muted-ink)]">There are {formatHours(result.deadlineAvailableHours)} available through the deadline date, so {formatHours(result.unscheduledHours)} remains unplaced. Reduce the workload estimate or free up time in Calendar.</p> : null}
            </>
          ) : null}

          {result ? (
            <section aria-labelledby="study-blocks-heading">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--accent-strong)]">Generated sessions</p>
                  <h2 id="study-blocks-heading" className="mt-1 text-xl font-semibold tracking-[-0.03em]">Your study blocks</h2>
                </div>
                <p className="text-sm text-[var(--muted-ink)]">Up to 3 hours a day where possible</p>
              </div>
              {Object.keys(groupedBlocks).length ? (
                <div className="mt-5 space-y-6">
                  {Object.entries(groupedBlocks).sort(([first], [second]) => first.localeCompare(second)).map(([date, blocks]) => (
                    <section key={date} className="border-t border-[var(--line)] pt-4" aria-label={formatDate(date)}>
                      <h3 className="text-sm font-semibold">{formatDate(date)}</h3>
                      <ul className="mt-3 divide-y divide-[var(--line)] border-y border-[var(--line)]">
                        {blocks.map((block) => (
                          <li key={block.id} className={`grid gap-1 py-3 sm:grid-cols-[8rem_minmax(0,1fr)_auto_auto] sm:items-center ${block.completedAt ? "text-[var(--muted-ink)]" : ""}`}>
                            <p className="font-semibold tabular-nums">{block.start}–{block.end}</p>
                            <p className="text-sm text-[var(--muted-ink)]">{block.taskName}</p>
                            <p className="text-sm font-semibold tabular-nums sm:text-right">{blockDuration(block)}</p>
                            <button
                              type="button"
                              onClick={() => toggleStudyBlockCompletion(block.id)}
                              className={`min-h-9 rounded-lg px-3 text-xs font-semibold sm:justify-self-end ${block.completedAt ? "bg-[var(--accent-soft)] text-[var(--accent-strong)]" : "border border-[var(--line)] text-[var(--muted-ink)] hover:border-[var(--accent)]"}`}
                            >
                              {block.completedAt ? "Completed" : "Mark complete"}
                            </button>
                          </li>
                        ))}
                      </ul>
                    </section>
                  ))}
                </div>
              ) : <p className="mt-5 border-y border-[var(--line)] py-5 text-sm leading-6 text-[var(--muted-ink)]">No suitable study periods were found. Check the deadline and commitments in Calendar.</p>}
            </section>
          ) : !isStoredPlanStale ? <section className="border-y border-[var(--line)] bg-[var(--surface-soft)] px-5 py-6 text-sm leading-6 text-[var(--muted-ink)]"><p className="font-semibold text-[var(--ink)]">Ready to build a realistic plan.</p><p className="mt-1">It will use sessions of roughly 60 to 120 minutes, avoid your recurring commitments, and aim to finish before the deadline date when capacity allows it.</p></section> : null}
        </>
      ) : null}
    </div>
  );
}
