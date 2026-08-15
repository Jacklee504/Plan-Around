"use client";

import type { Assignment, Module } from "@/types";
import { calculateWorkloadBreakdown, COMPLEXITY_MULTIPLIERS } from "@/lib/workload";

type WorkloadBreakdownProps = {
  assignment: Assignment;
  module: Module;
  onOverrideChange: (hours: number | undefined) => void;
};

const complexityLabels: Record<number, string> = { 1: "low", 2: "medium", 3: "high" };

function formatHours(hours: number) {
  return `${Number.isInteger(hours) ? hours.toFixed(0) : hours.toFixed(1)}h`;
}

function formatPercentage(value: number) {
  return `${Math.round(value * 100)}%`;
}

function formatWeight(value: number) {
  return Number.isInteger(value) ? value.toFixed(0) : value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

export function WorkloadBreakdown({ assignment, module, onOverrideChange }: WorkloadBreakdownProps) {
  const workload = calculateWorkloadBreakdown(module.credits, assignment);

  return (
    <section className="border-y border-[var(--line)] py-8" aria-labelledby="workload-heading">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_13rem] lg:items-end">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--accent-strong)]">Workload recommendation</p>
          <h2 id="workload-heading" className="mt-1 text-2xl font-semibold tracking-[-0.035em]">{formatHours(workload.totalHours)} for {assignment.title}</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted-ink)]">A transparent prototype estimate based on {module.credits} ECTS, the {assignment.moduleWeight}% assessment weighting and the rubric you entered.</p>
        </div>
        <label className="text-sm font-medium">
          Override total hours
          <span className="relative mt-1.5 block"><input value={assignment.workloadOverrideHours ?? ""} onChange={(event) => {
            const value = event.target.value === "" ? undefined : Number(event.target.value);
            onOverrideChange(Number.isFinite(value) && (value ?? 0) > 0 ? value : undefined);
          }} className="min-h-11 w-full rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 pr-9 text-sm text-[var(--ink)] outline-none transition-colors focus:border-[var(--accent)]" type="number" min="0.5" step="0.5" placeholder={formatHours(workload.totalHours).replace("h", "")} /><span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-[var(--muted-ink)]">h</span></span>
          <span className="mt-1 block text-xs font-normal leading-5 text-[var(--muted-ink)]">Leave blank to use the recommendation.</span>
        </label>
      </div>

      {workload.isOverridden ? <p className="mt-4 rounded-xl bg-[var(--accent-soft)] px-4 py-3 text-sm leading-6 text-[var(--accent-strong)]" role="status">Using your {formatHours(workload.totalHours)} override. Task time and buffer have been recalculated.</p> : null}

      <dl className="mt-6 grid border-y border-[var(--line)] sm:grid-cols-3">
        <div className="py-4 sm:border-r sm:border-[var(--line)] sm:pr-5"><dt className="text-sm text-[var(--muted-ink)]">Focused task time</dt><dd className="mt-1 text-2xl font-semibold tracking-[-0.03em]">{formatHours(workload.usableHours)}</dd></div>
        <div className="border-t border-[var(--line)] py-4 sm:border-t-0 sm:px-5 sm:border-r"><dt className="text-sm text-[var(--muted-ink)]">Deadline buffer</dt><dd className="mt-1 text-2xl font-semibold tracking-[-0.03em]">{formatHours(workload.bufferHours)}</dd></div>
        <div className="border-t border-[var(--line)] py-4 sm:border-t-0 sm:pl-5"><dt className="text-sm text-[var(--muted-ink)]">Total recommendation</dt><dd className="mt-1 text-2xl font-semibold tracking-[-0.03em]">{formatHours(workload.totalHours)}</dd></div>
      </dl>

      <section className="mt-7" aria-labelledby="task-allocation-heading">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--accent-strong)]">Task allocation</p>
            <h3 id="task-allocation-heading" className="mt-1 text-lg font-semibold tracking-[-0.025em]">Why each task received that time.</h3>
          </div>
          <p className="text-sm text-[var(--muted-ink)]">Marks × effort adjustment</p>
        </div>

        {assignment.tasks.length === 0 ? <p className="mt-4 rounded-xl bg-[var(--surface-soft)] px-4 py-3 text-sm leading-6 text-[var(--muted-ink)]">Add rubric tasks above to divide this recommendation more precisely. Until then, the focused time is kept together as assignment work.</p> : null}

        <ul className="mt-4 divide-y divide-[var(--line)] border-y border-[var(--line)]">
          {workload.taskHours.map((task) => (
            <li key={task.id} className="grid gap-2 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
              <div>
                <p className="font-semibold">{task.name}</p>
                <p className="mt-1 text-sm leading-6 text-[var(--muted-ink)]">{task.isFallback ? "No task split has been added yet." : `${task.marks} marks × ${COMPLEXITY_MULTIPLIERS[task.complexity] ?? 1} (${complexityLabels[task.complexity] ?? "custom"}) = ${formatWeight(task.adjustedWeight)} weighting points, ${formatPercentage(task.proportion)} of focused task time.`}</p>
              </div>
              <span className="text-lg font-semibold tabular-nums sm:text-right">{formatHours(task.recommendedHours)}</span>
            </li>
          ))}
        </ul>
      </section>

      <p className="mt-6 text-sm leading-6 text-[var(--muted-ink)]">{formatHours(workload.moduleWorkloadHours)} module workload × 40% assessment pool = {formatHours(workload.assessmentPoolHours)}. That pool × {assignment.moduleWeight}% = {formatHours(workload.calculatedTotalHours)}{workload.isOverridden ? `, then you changed the total to ${formatHours(workload.totalHours)}.` : "."}</p>
    </section>
  );
}
