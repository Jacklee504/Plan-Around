import type { Assignment, Commitment, Module, TimetableEntry } from "@/types";

type PlanInputs = {
  assignment: Assignment;
  module: Module;
  timetableEntries: TimetableEntry[];
  commitments: Commitment[];
};

function sortByValue<T>(items: T[]) {
  return [...items].sort((first, second) => JSON.stringify(first).localeCompare(JSON.stringify(second)));
}

/**
 * A plan is only safe to show while the inputs that shaped it are unchanged.
 * IDs are intentionally omitted from recurring constraints so re-importing an
 * identical timetable does not invalidate a plan purely because entries were rebuilt.
 */
export function createPlanFingerprint({ assignment, module, timetableEntries, commitments }: PlanInputs) {
  return JSON.stringify({
    assignment: {
      moduleId: assignment.moduleId,
      title: assignment.title,
      deadline: assignment.deadline,
      moduleWeight: assignment.moduleWeight,
      tasks: assignment.tasks,
      workloadOverrideHours: assignment.workloadOverrideHours,
    },
    module: { id: module.id, credits: module.credits },
    timetableEntries: sortByValue(timetableEntries.map((entry) => ({
      moduleCode: entry.moduleCode,
      dayOfWeek: entry.dayOfWeek,
      start: entry.start,
      end: entry.end,
      sessionType: entry.sessionType,
      attendance: entry.attendance,
      skippedWeeks: [...entry.skippedWeeks].sort(),
    }))),
    commitments: sortByValue(commitments.map((commitment) => ({
      label: commitment.label,
      dayOfWeek: commitment.dayOfWeek,
      start: commitment.start,
      end: commitment.end,
      category: commitment.category,
    }))),
  });
}
