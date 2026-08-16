"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createPlanFingerprint, getReservableStudyBlocks } from "@/lib/planSnapshot";
import { generateStudySchedule } from "@/lib/scheduler";
import { readStoredValue, storageKeys, writeStoredValue } from "@/lib/storage";
import { calculateWorkloadBreakdown } from "@/lib/workload";
import { OnboardingRequired } from "@/components/OnboardingRequired";
import { useOnboardingState } from "@/lib/onboarding";
import type { Assignment, Commitment, DatedCommitment, Module, ScheduleResult, StudyBlock, TimetableEntry } from "@/types";

type PlanStatus = ScheduleResult["status"];

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
  const [startHours, startMinutes] = block.start.split(":").map(Number);
  const [endHours, endMinutes] = block.end.split(":").map(Number);
  const minutes = endHours * 60 + endMinutes - (startHours * 60 + startMinutes);
  return formatHours(minutes / 60);
}

function getResultForExistingBlocks(blocks: StudyBlock[], recalculatedResult: ScheduleResult): ScheduleResult | null {
  if (!blocks.length) return null;
  const scheduledHours = blocks.reduce((total, block) => {
    const [startHours, startMinutes] = block.start.split(":").map(Number);
    const [endHours, endMinutes] = block.end.split(":").map(Number);
    return total + (endHours * 60 + endMinutes - (startHours * 60 + startMinutes)) / 60;
  }, 0);

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
  const currentFingerprint = selectedAssignment && selectedModule
    ? createPlanFingerprint({ assignment: selectedAssignment, module: selectedModule, timetableEntries, commitments, datedCommitments })
    : null;
  const isStoredPlanStale = Boolean(
    selectedAssignment
      && storedSelectedBlocks.length
      && currentFingerprint
      && planSnapshots[selectedAssignment.id] !== currentFingerprint,
  );
  const recalculatedResult = selectedAssignment && workload
    ? generateStudySchedule({ assignment: selectedAssignment, workload, timetableEntries, commitments, datedCommitments, reservedBlocks })
    : null;
  const existingResult = recalculatedResult && !isStoredPlanStale ? getResultForExistingBlocks(storedSelectedBlocks, recalculatedResult) : null;
  const result = generatedResult ?? existingResult;
  const groupedBlocks = (result?.studyBlocks ?? []).reduce<Record<string, StudyBlock[]>>((groups, block) => {
    (groups[block.date] ??= []).push(block);
    return groups;
  }, {});

  function generatePlan() {
    if (!selectedAssignment || !workload) return;
    const nextResult = generateStudySchedule({ assignment: selectedAssignment, workload, timetableEntries, commitments, datedCommitments, reservedBlocks });
    setStudyBlocks((current) => [
      ...current.filter((block) => block.assignmentId !== selectedAssignment.id),
      ...nextResult.studyBlocks,
    ]);
    setPlanSnapshots((current) => ({
      ...current,
      [selectedAssignment.id]: createPlanFingerprint({ assignment: selectedAssignment, module: selectedModule!, timetableEntries, commitments, datedCommitments }),
    }));
    setGeneratedResult(nextResult);
  }

  function chooseAssignment(id: string) {
    setSelectedAssignmentId(id);
    setGeneratedResult(null);
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
        <p className="mt-2 max-w-xl text-sm leading-6 text-[var(--muted-ink)]">PlanAround needs an assignment linked to one of your timetable modules before it can find focused study periods.</p>
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
          <p className="mt-2 max-w-xl text-sm leading-6 text-[var(--muted-ink)]">PlanAround checks the timetable and commitments you entered, then places the workload into the remaining time before the deadline.</p>
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
            <button type="button" onClick={generatePlan} className="inline-flex min-h-11 items-center justify-center rounded-xl bg-[var(--accent)] px-5 text-sm font-semibold text-white transition-colors hover:bg-[var(--accent-strong)]">
              {result || isStoredPlanStale ? "Regenerate plan" : "Generate plan"}
            </button>
          </section>

          <dl className="grid border-y border-[var(--line)] sm:grid-cols-4">
            <div className="py-4 sm:border-r sm:border-[var(--line)] sm:pr-5"><dt className="text-sm text-[var(--muted-ink)]">Total recommendation</dt><dd className="mt-1 text-2xl font-semibold tracking-[-0.03em]">{formatHours(workload.totalHours)}</dd></div>
            <div className="border-t border-[var(--line)] py-4 sm:border-t-0 sm:border-r sm:px-5"><dt className="text-sm text-[var(--muted-ink)]">Focused work</dt><dd className="mt-1 text-2xl font-semibold tracking-[-0.03em]">{formatHours(workload.usableHours)}</dd></div>
            <div className="border-t border-[var(--line)] py-4 sm:border-t-0 sm:border-r sm:px-5"><dt className="text-sm text-[var(--muted-ink)]">Project buffer</dt><dd className="mt-1 text-2xl font-semibold tracking-[-0.03em]">{formatHours(workload.bufferHours)}</dd></div>
            <div className="border-t border-[var(--line)] py-4 sm:border-t-0 sm:pl-5"><dt className="text-sm text-[var(--muted-ink)]">Focused work scheduled</dt><dd className="mt-1 text-2xl font-semibold tracking-[-0.03em]">{result ? formatHours(result.scheduledHours) : "Not yet"}</dd></div>
          </dl>

          <section className="border-b border-[var(--line)] pb-5" aria-labelledby="plan-task-summary-heading">
            <h3 id="plan-task-summary-heading" className="text-sm font-semibold">Work split</h3>
            <ul className="mt-3 divide-y divide-[var(--line)] border-y border-[var(--line)]">
              {workload.taskHours.map((task) => <li key={task.id} className="flex items-center justify-between gap-4 py-2.5 text-sm"><span>{task.name}</span><span className="font-semibold tabular-nums">{formatHours(task.recommendedHours)}</span></li>)}
            </ul>
          </section>

          {isStoredPlanStale ? <section className="border-y border-amber-200 bg-amber-50 px-5 py-4 text-amber-950" role="status"><p className="font-semibold">Your inputs changed. Regenerate this plan.</p><p className="mt-1 text-sm leading-6">The saved study blocks are hidden because they may no longer fit your timetable, commitments or workload.</p></section> : null}

          {result && selectedStatus ? (
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
              {result.status === "not-enough-time" ? <p className="text-sm leading-6 text-[var(--muted-ink)]">There are {formatHours(result.deadlineAvailableHours)} available through the deadline date, so {formatHours(result.unscheduledHours)} remains unplaced. Reduce the workload estimate or free up time in Timetable.</p> : null}

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
                            <li key={block.id} className="grid gap-1 py-3 sm:grid-cols-[8rem_minmax(0,1fr)_auto] sm:items-center">
                              <p className="font-semibold tabular-nums">{block.start}–{block.end}</p>
                              <p className="text-sm text-[var(--muted-ink)]">{block.taskName}</p>
                              <p className="text-sm font-semibold tabular-nums sm:text-right">{blockDuration(block)}</p>
                            </li>
                          ))}
                        </ul>
                      </section>
                    ))}
                  </div>
                ) : <p className="mt-5 border-y border-[var(--line)] py-5 text-sm leading-6 text-[var(--muted-ink)]">No suitable study periods were found. Check the deadline and the commitments in your timetable.</p>}
              </section>
            </>
          ) : !isStoredPlanStale ? <section className="border-y border-[var(--line)] bg-[var(--surface-soft)] px-5 py-6 text-sm leading-6 text-[var(--muted-ink)]"><p className="font-semibold text-[var(--ink)]">Ready to build a realistic plan.</p><p className="mt-1">It will use sessions of roughly 60 to 120 minutes, avoid your recurring commitments, and aim to finish before the deadline date when capacity allows it.</p></section> : null}
        </>
      ) : null}
    </div>
  );
}
