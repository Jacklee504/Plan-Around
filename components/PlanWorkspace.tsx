"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { calculateOverallInsights } from "@/lib/insights";
import { assignmentPartNumber, formatAssignmentPart } from "@/lib/assignmentParts";
import { createPlanFingerprint, getPlanChangeReasons, getReservableAssignmentSessions, type PlanChangeReason } from "@/lib/planSnapshot";
import { generateAssignmentSchedule } from "@/lib/scheduler";
import { readStoredValue, storageKeys, writeStoredValue } from "@/lib/storage";
import { calculateWorkloadBreakdown } from "@/lib/workload";
import { calculateRemainingWorkload, canCompleteAssignmentSession, completedMinutes, replaceIncompleteBlocksForAssignment, assignmentSessionMinutes, assignmentSessionScheduledStart } from "@/lib/assignmentProgress";
import { summarizeReplan, type ReplanSummary } from "@/lib/replanSummary";
import { DEFAULT_PLANNING_PREFERENCES, normalizePlanningPreferences } from "@/lib/planningPreferences";
import { OnboardingRequired } from "@/components/OnboardingRequired";
import { useOnboardingState } from "@/lib/onboarding";
import type { Assignment, Commitment, DatedCommitment, Module, PlanningPreferences, ScheduleResult, AssignmentSession, TimetableEntry } from "@/types";

type PlanStatus = ScheduleResult["status"];

const planChangeReasonCopy: Record<PlanChangeReason, string> = {
  assignment: "Assignment details changed",
  "module-workload": "Module workload changed",
  timetable: "Timetable availability changed",
  "recurring-commitments": "Recurring commitments changed",
  "dated-commitments": "One-off availability changed",
  "planning-preferences": "Availability preferences changed",
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

const MAX_TIMER_DELAY_MS = 24 * 60 * 60 * 1000;

function formatHours(hours: number) {
  return `${Number.isInteger(hours) ? hours.toFixed(0) : hours.toFixed(1)}h`;
}

function formatDate(date: string) {
  return new Intl.DateTimeFormat("en-IE", { weekday: "long", day: "numeric", month: "short" }).format(new Date(`${date}T12:00:00`));
}

function formatDeadline(date: string) {
  return new Intl.DateTimeFormat("en-IE", { day: "numeric", month: "short", year: "numeric" }).format(new Date(`${date}T12:00:00`));
}

function blockDuration(block: AssignmentSession) {
  return formatHours(assignmentSessionMinutes(block) / 60);
}

function getResultForExistingBlocks(blocks: AssignmentSession[], recalculatedResult: ScheduleResult): ScheduleResult | null {
  if (!blocks.length) return null;
  const scheduledHours = blocks.reduce((total, block) => total + assignmentSessionMinutes(block) / 60, 0);

  return {
    ...recalculatedResult,
    assignmentSessions: blocks,
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
  const [assignmentSessions, setAssignmentSessions] = useState<AssignmentSession[]>([]);
  const [planSnapshots, setPlanSnapshots] = useState<Record<string, string>>({});
  const [planningPreferences, setPlanningPreferences] = useState<PlanningPreferences>(DEFAULT_PLANNING_PREFERENCES);
  const [selectedAssignmentId, setSelectedAssignmentId] = useState("");
  const [generatedResult, setGeneratedResult] = useState<ScheduleResult | null>(null);
  const [lastReplanUpdate, setLastReplanUpdate] = useState<ReplanUpdate | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const hydrationTimer = window.setTimeout(() => {
      const storedModules = readStoredValue<Module[]>(storageKeys.modules, []);
      const storedAssignments = readStoredValue<Assignment[]>(storageKeys.assignments, []);
      setModules(storedModules);
      setAssignments(storedAssignments);
      setCommitments(readStoredValue<Commitment[]>(storageKeys.commitments, []));
      setDatedCommitments(readStoredValue<DatedCommitment[]>(storageKeys.datedCommitments, []));
      setTimetableEntries(readStoredValue<TimetableEntry[]>(storageKeys.timetableEntries, []));
      setAssignmentSessions(readStoredValue<AssignmentSession[]>(storageKeys.assignmentSessions, []));
      setPlanSnapshots(readStoredValue<Record<string, string>>(storageKeys.planSnapshots, {}));
      setPlanningPreferences(normalizePlanningPreferences(readStoredValue<unknown>(storageKeys.planningPreferences, DEFAULT_PLANNING_PREFERENCES)));
      const requestedAssignmentId = new URLSearchParams(window.location.search).get("assignment");
      const requestedAssignment = requestedAssignmentId
        ? storedAssignments.find((assignment) => assignment.id === requestedAssignmentId && storedModules.some((module) => module.id === assignment.moduleId))
        : null;
      const latestSchedulableAssignment = [...storedAssignments].reverse().find((assignment) => storedModules.some((module) => module.id === assignment.moduleId));
      const initialAssignmentId = requestedAssignment?.id ?? latestSchedulableAssignment?.id ?? "";
      setSelectedAssignmentId(initialAssignmentId);
      if (initialAssignmentId) writeStoredValue(storageKeys.activeAssignmentId, initialAssignmentId);
      setIsLoaded(true);
    }, 0);

    return () => window.clearTimeout(hydrationTimer);
  }, []);

  useEffect(() => {
    if (isLoaded) writeStoredValue(storageKeys.assignmentSessions, assignmentSessions);
  }, [isLoaded, assignmentSessions]);

  useEffect(() => {
    if (isLoaded) writeStoredValue(storageKeys.planSnapshots, planSnapshots);
  }, [isLoaded, planSnapshots]);

  // Re-renders the moment the nearest not-yet-completable session's scheduled
  // start passes, instead of leaving it stuck on "Scheduled" until something
  // else happens to trigger a render.
  useEffect(() => {
    const nextBoundary = assignmentSessions.reduce<number | null>((earliest, block) => {
      if (block.completedAt) return earliest;
      const startMs = assignmentSessionScheduledStart(block).getTime();
      if (startMs <= now.getTime()) return earliest;
      return earliest === null ? startMs : Math.min(earliest, startMs);
    }, null);
    if (nextBoundary === null) return;
    // Browser timers pass their delay through a Web IDL `long` (signed 32-bit):
    // a delay beyond ~24.86 days overflows and gets treated as 0, which would
    // otherwise let a far-future block schedule an immediate, self-repeating
    // timeout. Capping the delay just re-checks at most once a day until the
    // boundary is close enough to target exactly.
    const delay = Math.min(nextBoundary - now.getTime() + 1000, MAX_TIMER_DELAY_MS);
    const timer = window.setTimeout(() => setNow(new Date()), delay);
    return () => window.clearTimeout(timer);
  }, [assignmentSessions, now]);

  const schedulableAssignments = useMemo(
    () => assignments.filter((assignment) => modules.some((module) => module.id === assignment.moduleId)),
    [assignments, modules],
  );
  const overallInsights = useMemo(
    () => calculateOverallInsights(assignments, modules, assignmentSessions, now),
    [assignments, modules, assignmentSessions, now],
  );
  const selectedAssignment = schedulableAssignments.find((assignment) => assignment.id === selectedAssignmentId) ?? null;
  const selectedModule = selectedAssignment ? modules.find((module) => module.id === selectedAssignment.moduleId) ?? null : null;
  const workload = selectedAssignment && selectedModule ? calculateWorkloadBreakdown(selectedModule.credits, selectedAssignment) : null;
  const storedSelectedBlocks = selectedAssignment ? assignmentSessions.filter((block) => block.assignmentId === selectedAssignment.id) : [];
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
    ? getReservableAssignmentSessions({
      currentAssignmentId: selectedAssignment.id,
      assignments,
      modules,
      assignmentSessions,
      planSnapshots,
      timetableEntries,
      commitments,
      datedCommitments,
      planningPreferences,
    })
    : [];
  // The scheduler only exempts a same-assignment block from reserving time
  // when it is completed (finished history at a real time), so this assignment's
  // own completed sessions must be included here alongside other assignments'.
  const assignmentReservedBlocks = [...reservedBlocks, ...completedSelectedBlocks];
  const currentFingerprint = selectedAssignment && selectedModule
    ? createPlanFingerprint({ assignment: selectedAssignment, module: selectedModule, timetableEntries, commitments, datedCommitments, planningPreferences })
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
    ? getPlanChangeReasons(planSnapshots[selectedAssignment.id], { assignment: selectedAssignment, module: selectedModule, timetableEntries, commitments, datedCommitments, planningPreferences })
    : [];
  const recalculatedResult = selectedAssignment && workload
    ? generateAssignmentSchedule({ assignment: selectedAssignment, workload, timetableEntries, commitments, datedCommitments, reservedBlocks: assignmentReservedBlocks, preferences: planningPreferences })
    : null;
  // Preview of what replanning would actually change, shown before the click
  // instead of only after - built the same way generateOrReplan() itself
  // schedules (against remainingWorkload, so completed work is excluded from
  // what's being re-placed), not reused from recalculatedResult above, which
  // is scheduled against the full workload for a different purpose (the
  // always-visible schedule-status stats) and would overstate the change.
  const replanPreview = isStoredPlanStale && selectedAssignment && remainingWorkload
    ? summarizeReplan(
      storedSelectedBlocks,
      generateAssignmentSchedule({
        assignment: selectedAssignment,
        workload: remainingWorkload,
        timetableEntries,
        commitments,
        datedCommitments,
        reservedBlocks: assignmentReservedBlocks,
        preferences: planningPreferences,
      }).assignmentSessions,
    )
    : null;
  // While stale, only completed sessions remain valid history - obsolete
  // incomplete sessions are hidden until the user replans the remainder.
  const existingResult = recalculatedResult
    ? getResultForExistingBlocks(isStoredPlanStale ? completedSelectedBlocks : storedSelectedBlocks, recalculatedResult)
    : null;
  const result = generatedResult ?? existingResult;
  const isCompletedHistoryOnly = isStoredPlanStale && !generatedResult;
  // `result.assignmentSessions` can be a snapshot taken at generation time, so completion
  // toggles (which only update the `assignmentSessions` state) would not appear here
  // without re-reading each block's current state by id.
  const liveBlocksById = new Map(assignmentSessions.map((block) => [block.id, block]));
  const groupedBlocks = (result?.assignmentSessions ?? []).reduce<Record<string, AssignmentSession[]>>((groups, resultBlock) => {
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
    const scheduled = generateAssignmentSchedule({
      assignment: selectedAssignment,
      workload: remainingWorkload,
      timetableEntries,
      commitments,
      datedCommitments,
      reservedBlocks: assignmentReservedBlocks,
      preferences: planningPreferences,
    });
    // The scheduler only returns newly placed blocks, so completed history
    // is added back in for display - the same blocks already preserved in
    // storage below - to avoid a stale-looking list until the next reload.
    const allPlacedBlocks = [...completedSelectedBlocks, ...scheduled.assignmentSessions];

    setAssignmentSessions((current) => replaceIncompleteBlocksForAssignment(current, selectedAssignment.id, scheduled.assignmentSessions));
    setPlanSnapshots((current) => ({
      ...current,
      [selectedAssignment.id]: createPlanFingerprint({ assignment: selectedAssignment, module: selectedModule, timetableEntries, commitments, datedCommitments, planningPreferences }),
    }));
    setGeneratedResult({
      ...scheduled,
      assignmentSessions: allPlacedBlocks,
      scheduledHours: allPlacedBlocks.reduce((total, block) => total + assignmentSessionMinutes(block) / 60, 0),
    });
    // Only a regenerate or replan is an "update" - a first-time generate has
    // no prior plan to compare against, so there is nothing to explain yet.
    setLastReplanUpdate(
      storedSelectedBlocks.length
        ? { summary: summarizeReplan(storedSelectedBlocks, scheduled.assignmentSessions), reasons: staleReasons, status: scheduled.status }
        : null,
    );
  }

  function chooseAssignment(id: string) {
    setSelectedAssignmentId(id);
    writeStoredValue(storageKeys.activeAssignmentId, id);
    setGeneratedResult(null);
    setLastReplanUpdate(null);
  }

  function toggleAssignmentSessionCompletion(blockId: string) {
    setAssignmentSessions((current) =>
      current.map((block) => {
        if (block.id !== blockId) return block;
        if (block.completedAt) return { ...block, completedAt: undefined };
        // A future session cannot be newly marked complete - see canCompleteAssignmentSession.
        if (!canCompleteAssignmentSession(block)) return block;
        // Completing a session supersedes an earlier missed mark.
        return { ...block, completedAt: new Date().toISOString(), missedAt: undefined };
      }),
    );
  }

  // Unlike completion, missed isn't gated by scheduled time - deciding a session
  // will be skipped doesn't require waiting for it to start, and a completed
  // session can't also be missed, so the toggle is a no-op once completed.
  function toggleAssignmentSessionMissed(blockId: string) {
    setAssignmentSessions((current) =>
      current.map((block) => {
        if (block.id !== blockId || block.completedAt) return block;
        if (block.missedAt) return { ...block, missedAt: undefined };
        return { ...block, missedAt: new Date().toISOString() };
      }),
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
        <p className="mt-2 max-w-xl text-sm leading-6 text-[var(--muted-ink)]">PlanAround needs an assignment linked to one of your Calendar modules before it can find time for assignment work.</p>
        <Link href="/assignment" className="mt-5 inline-flex min-h-11 items-center rounded-xl bg-[var(--accent)] px-4 text-sm font-semibold text-white transition-colors hover:bg-[var(--accent-strong)]">Go to assignment</Link>
      </section>
    );
  }

  const selectedStatus = result ? statusCopy[result.status] : null;

  return (
    <div className="space-y-9">
      <section className="border-b border-[var(--line)] pb-6" aria-labelledby="overview-heading">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--accent-strong)]">Overview</p>
        <h2 id="overview-heading" className="mt-1 text-xl font-semibold tracking-[-0.03em]">Progress across everything</h2>
        <dl className="mt-4 grid gap-4 sm:grid-cols-3">
          <div><dt className="text-sm text-[var(--muted-ink)]">Completed overall</dt><dd className="mt-1 text-xl font-semibold tracking-[-0.03em]">{formatHours(overallInsights.totalCompletedMinutes / 60)}</dd></div>
          <div><dt className="text-sm text-[var(--muted-ink)]">Completed this week</dt><dd className="mt-1 text-xl font-semibold tracking-[-0.03em]">{formatHours(overallInsights.thisWeekCompletedMinutes / 60)}</dd></div>
          <div><dt className="text-sm text-[var(--muted-ink)]">Sessions completed</dt><dd className="mt-1 text-xl font-semibold tracking-[-0.03em]">{overallInsights.completedSessionCount}</dd></div>
        </dl>
        {overallInsights.perAssignment.length ? (
          <ul className="mt-4 divide-y divide-[var(--line)] border-y border-[var(--line)]">
            {overallInsights.perAssignment.map((insight) => (
              <li key={insight.assignmentId} className="flex items-center justify-between gap-4 py-2.5 text-sm">
                <span>{insight.title}</span>
                <span className="font-semibold tabular-nums">{Math.round(insight.completionRate * 100)}% · {formatHours(insight.completedMinutes / 60)} of {formatHours(insight.recommendedMinutes / 60)}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <section className="grid gap-5 border-y border-[var(--line)] py-6 lg:grid-cols-[minmax(0,1fr)_14rem] lg:items-end" aria-labelledby="plan-controls-heading">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--accent-strong)]">Assignment plan</p>
          <h2 id="plan-controls-heading" className="mt-1 text-xl font-semibold tracking-[-0.03em]">Make room for the work.</h2>
          <p className="mt-2 max-w-xl text-sm leading-6 text-[var(--muted-ink)]">PlanAround checks the Calendar and commitments you entered, then places the workload into the remaining time before the deadline.</p>
        </div>
        <div className="lg:justify-self-end">
          <label className="text-sm font-medium">
            Assignment
            <select value={selectedAssignmentId} onChange={(event) => chooseAssignment(event.target.value)} className="mt-1.5 min-h-11 w-full rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 text-sm text-[var(--ink)] outline-none transition-colors focus:border-[var(--accent)]">
              {schedulableAssignments.map((assignment) => <option key={assignment.id} value={assignment.id}>{assignment.title}</option>)}
            </select>
          </label>
          <Link href="/assignment" className="mt-2 inline-flex min-h-10 items-center text-sm font-semibold text-[var(--accent-strong)] underline underline-offset-2">Add another assignment</Link>
        </div>
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
              {workload.taskHours.map((task) => <li key={task.id} className="flex items-center justify-between gap-4 py-2.5 text-sm"><span>{formatAssignmentPart(task.name, task.isFallback ? null : assignmentPartNumber(selectedAssignment, task.id))}</span><span className="font-semibold tabular-nums">{formatHours(task.recommendedHours)}</span></li>)}
            </ul>
          </section>

          {isStoredPlanStale ? (
            <section className="border-y border-amber-200 bg-amber-50 px-5 py-4 text-amber-950" role="status">
              <p className="font-semibold">Your plan needs updating.</p>
              <p className="mt-1 text-sm leading-6">Replan the remaining work to keep this schedule realistic. Completed assignment work will be preserved.</p>
              {staleReasons.length ? <p className="mt-1 text-sm leading-6">Reason: {staleReasons.map((reason) => planChangeReasonCopy[reason]).join(", ")}</p> : null}
              {replanPreview ? (
                <p className="mt-1 text-sm leading-6">
                  {completedSelectedBlocks.length ? `Keeps your ${completedSelectedBlocks.length} completed session${completedSelectedBlocks.length === 1 ? "" : "s"}. ` : ""}
                  {replanPreview.previousIncompleteBlocks || replanPreview.newIncompleteBlocks
                    ? `Replaces ${replanPreview.previousIncompleteBlocks} upcoming session${replanPreview.previousIncompleteBlocks === 1 ? "" : "s"} with ${replanPreview.newIncompleteBlocks} new one${replanPreview.newIncompleteBlocks === 1 ? "" : "s"}.`
                    : "No upcoming sessions to replace."}
                </p>
              ) : null}
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
                  <p>{formatHours(lastReplanUpdate.summary.rescheduledMinutes / 60)} of remaining assignment work was rescheduled.</p>
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
            <section aria-labelledby="assignment-sessions-heading">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--accent-strong)]">Generated sessions</p>
                  <h2 id="assignment-sessions-heading" className="mt-1 text-xl font-semibold tracking-[-0.03em]">Your assignment sessions</h2>
                </div>
                <p className="text-sm text-[var(--muted-ink)]">Aims for {formatHours(planningPreferences.dailyAssignmentTargetMinutes / 60)} a day where possible</p>
              </div>
              {Object.keys(groupedBlocks).length ? (
                <div className="mt-5 space-y-6">
                  {Object.entries(groupedBlocks).sort(([first], [second]) => first.localeCompare(second)).map(([date, blocks]) => (
                    <section key={date} className="border-t border-[var(--line)] pt-4" aria-label={formatDate(date)}>
                      <h3 className="text-sm font-semibold">{formatDate(date)}</h3>
                      <ul className="mt-3 divide-y divide-[var(--line)] border-y border-[var(--line)]">
                        {blocks.map((block) => (
                          <li key={block.id} className={`grid gap-1 py-3 sm:grid-cols-[8rem_minmax(0,1fr)_auto_auto] sm:items-center ${block.completedAt ? "text-[var(--muted-ink)]" : block.missedAt ? "text-red-700" : ""}`}>
                            <p className="font-semibold tabular-nums">{block.start}–{block.end}</p>
                            <p className="text-sm text-[var(--muted-ink)]">{formatAssignmentPart(block.taskName, assignmentPartNumber(selectedAssignment, block.taskId))}</p>
                            <p className="text-sm font-semibold tabular-nums sm:text-right">{blockDuration(block)}</p>
                            <div className="flex flex-wrap items-center justify-end gap-2">
                              {block.completedAt || canCompleteAssignmentSession(block) ? (
                                <button
                                  type="button"
                                  onClick={() => toggleAssignmentSessionCompletion(block.id)}
                                  className={`min-h-9 rounded-lg px-3 text-xs font-semibold ${block.completedAt ? "bg-[var(--accent-soft)] text-[var(--accent-strong)]" : "border border-[var(--line)] text-[var(--muted-ink)] hover:border-[var(--accent)]"}`}
                                >
                                  {block.completedAt ? "Completed" : "Mark complete"}
                                </button>
                              ) : (
                                <span
                                  className="min-h-9 content-center px-3 text-xs font-semibold text-[var(--muted-ink)] text-right"
                                  title="You can mark this complete once the session starts."
                                >
                                  Scheduled
                                </span>
                              )}
                              {!block.completedAt ? (
                                <button
                                  type="button"
                                  onClick={() => toggleAssignmentSessionMissed(block.id)}
                                  className={`min-h-9 rounded-lg px-3 text-xs font-semibold ${block.missedAt ? "bg-red-50 text-red-700" : "border border-[var(--line)] text-[var(--muted-ink)] hover:border-red-300 hover:text-red-700"}`}
                                >
                                  {block.missedAt ? "Missed" : "Mark missed"}
                                </button>
                              ) : null}
                            </div>
                          </li>
                        ))}
                      </ul>
                    </section>
                  ))}
                </div>
              ) : <p className="mt-5 border-y border-[var(--line)] py-5 text-sm leading-6 text-[var(--muted-ink)]">No suitable time for assignment work was found. Check the deadline and commitments in Calendar.</p>}
            </section>
          ) : !isStoredPlanStale ? <section className="border-y border-[var(--line)] bg-[var(--surface-soft)] px-5 py-6 text-sm leading-6 text-[var(--muted-ink)]"><p className="font-semibold text-[var(--ink)]">Ready to build a realistic plan.</p><p className="mt-1">It will use sessions of roughly 60 to 120 minutes, avoid your recurring commitments, and aim to finish before the deadline date when capacity allows it.</p></section> : null}
        </>
      ) : null}
    </div>
  );
}
