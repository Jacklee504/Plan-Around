import type { Assignment, Commitment, Module, StudyBlock, TimetableEntry } from "@/types";

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
function createPlanInputSnapshot({ assignment, module, timetableEntries, commitments }: PlanInputs) {
  return {
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
  };
}

export function createPlanInputFingerprint(inputs: PlanInputs) {
  return JSON.stringify(createPlanInputSnapshot(inputs));
}

/**
 * A plan remains valid while the inputs that shaped its own workload and
 * recurring availability are unchanged. Other plans reserve availability only
 * when making a new schedule; their later creation must not stale this plan.
 */
export function createPlanFingerprint(inputs: PlanInputs) {
  return createPlanInputFingerprint(inputs);
}

type ReservableBlocksInput = Pick<PlanInputs, "timetableEntries" | "commitments"> & {
  currentAssignmentId: string;
  assignments: Assignment[];
  modules: Module[];
  studyBlocks: StudyBlock[];
  planSnapshots: Record<string, string>;
};

/**
 * Only saved plans whose own assignment/module/timetable inputs are unchanged
 * reserve time. This prevents removed assignments and plans made stale by an
 * edited timetable, commitment, or workload from blocking a new plan.
 */
export function getReservableStudyBlocks({
  currentAssignmentId,
  assignments,
  modules,
  studyBlocks,
  planSnapshots,
  timetableEntries,
  commitments,
}: ReservableBlocksInput) {
  const reservableAssignmentIds = new Set(
    assignments
      .filter((assignment) => assignment.id !== currentAssignmentId)
      .filter((assignment) => {
        const assignmentModule = modules.find((candidate) => candidate.id === assignment.moduleId);
        if (!assignmentModule) return false;

        return planSnapshots[assignment.id] === createPlanInputFingerprint({
          assignment,
          module: assignmentModule,
          timetableEntries,
          commitments,
        });
      })
      .map((assignment) => assignment.id),
  );

  return studyBlocks.filter((block) => reservableAssignmentIds.has(block.assignmentId));
}
