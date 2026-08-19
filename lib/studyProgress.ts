import { hoursFromMinutes } from "./scheduler";
import { dateFromDateKey } from "./calendarWeek";
import type { StudyBlock, WorkloadBreakdown } from "@/types";

export function studyBlockMinutes(block: StudyBlock) {
  const [startHours, startMinutes] = block.start.split(":").map(Number);
  const [endHours, endMinutes] = block.end.split(":").map(Number);
  return endHours * 60 + endMinutes - (startHours * 60 + startMinutes);
}

/**
 * Local calendar-date/time construction, deliberately not `new Date(iso + "Z")`,
 * so a block's scheduled start compares correctly regardless of the reader's
 * assumptions about UTC - see canCompleteStudyBlock.
 */
export function studyBlockScheduledStart(block: Pick<StudyBlock, "date" | "start">) {
  const scheduledStart = dateFromDateKey(block.date);
  const [hours, minutes] = block.start.split(":").map(Number);
  scheduledStart.setHours(hours, minutes, 0, 0);
  return scheduledStart;
}

/**
 * A StudyBlock represents scheduled work on a real future date/time, so
 * marking it complete before that time would make "completed" ambiguous
 * (did the work happen early, or is the slot still occupied?). Already
 * completed blocks remain undoable regardless of their scheduled time so
 * legacy/unusual data is never trapped.
 */
export function canCompleteStudyBlock(block: Pick<StudyBlock, "date" | "start" | "completedAt">, now: Date = new Date()) {
  if (block.completedAt) return true;
  return studyBlockScheduledStart(block).getTime() <= now.getTime();
}

export function completedStudyBlocks(blocks: StudyBlock[]) {
  return blocks.filter((block) => Boolean(block.completedAt));
}

export function incompleteStudyBlocks(blocks: StudyBlock[]) {
  return blocks.filter((block) => !block.completedAt);
}

export function completedMinutes(blocks: StudyBlock[]) {
  return completedStudyBlocks(blocks).reduce((total, block) => total + studyBlockMinutes(block), 0);
}

export function completedMinutesByTask(blocks: StudyBlock[]) {
  return completedStudyBlocks(blocks).reduce<Record<string, number>>((totals, block) => {
    totals[block.taskId] = (totals[block.taskId] ?? 0) + studyBlockMinutes(block);
    return totals;
  }, {});
}

/**
 * Subtracts completed work from the deterministic workload, per task, so
 * replanning only schedules what remains. A task's own completed minutes
 * reduce only that task's recommendation, never another task's - and
 * completed time for a task that no longer exists in the workload is simply
 * ignored rather than clawed back from an unrelated task.
 */
export function calculateRemainingWorkload(workload: WorkloadBreakdown, completedBlocks: StudyBlock[]): WorkloadBreakdown {
  const completedByTask = completedMinutesByTask(completedBlocks);
  const remainingTaskHours = workload.taskHours.map((task) => {
    const recommendedMinutes = Math.round(task.recommendedHours * 60);
    const remainingMinutes = Math.max(0, recommendedMinutes - (completedByTask[task.id] ?? 0));
    return { ...task, recommendedHours: hoursFromMinutes(remainingMinutes) };
  });
  const remainingMinutes = remainingTaskHours.reduce((total, task) => total + Math.round(task.recommendedHours * 60), 0);

  return {
    ...workload,
    usableHours: hoursFromMinutes(remainingMinutes),
    taskHours: remainingTaskHours,
  };
}

/**
 * Preserves every completed StudyBlock for the given assignment (and every
 * block belonging to other assignments), replacing only its incomplete
 * blocks with a freshly generated set.
 */
export function replaceIncompleteBlocksForAssignment(
  currentBlocks: StudyBlock[],
  assignmentId: string,
  newIncompleteBlocks: StudyBlock[],
): StudyBlock[] {
  return [
    ...currentBlocks.filter((block) => block.assignmentId !== assignmentId || block.completedAt),
    ...newIncompleteBlocks,
  ];
}

export type RemovedAssignmentPlanningState = {
  remainingStudyBlocks: StudyBlock[];
  remainingPlanSnapshots: Record<string, string>;
  removedStudyBlocks: StudyBlock[];
  removedPlanSnapshot: string | undefined;
};

/**
 * Deleting an assignment must remove its StudyBlocks and plan snapshot along
 * with the assignment record itself - otherwise orphaned StudyBlocks keep
 * appearing in Calendar and can keep reserving time for an assignment that no
 * longer exists. The removed state is returned so Undo can restore it.
 */
export function removeAssignmentPlanningState(
  studyBlocks: StudyBlock[],
  planSnapshots: Record<string, string>,
  assignmentId: string,
): RemovedAssignmentPlanningState {
  const remainingPlanSnapshots = { ...planSnapshots };
  delete remainingPlanSnapshots[assignmentId];

  return {
    remainingStudyBlocks: studyBlocks.filter((block) => block.assignmentId !== assignmentId),
    remainingPlanSnapshots,
    removedStudyBlocks: studyBlocks.filter((block) => block.assignmentId === assignmentId),
    removedPlanSnapshot: planSnapshots[assignmentId],
  };
}

/**
 * The inverse of removeAssignmentPlanningState, used to undo a delete: restores
 * the assignment's StudyBlocks and plan snapshot together, not just the
 * assignment record.
 */
export function restoreAssignmentPlanningState(
  studyBlocks: StudyBlock[],
  planSnapshots: Record<string, string>,
  assignmentId: string,
  removedStudyBlocks: StudyBlock[],
  removedPlanSnapshot: string | undefined,
) {
  return {
    restoredStudyBlocks: removedStudyBlocks.length ? [...studyBlocks, ...removedStudyBlocks] : studyBlocks,
    restoredPlanSnapshots: removedPlanSnapshot !== undefined
      ? { ...planSnapshots, [assignmentId]: removedPlanSnapshot }
      : planSnapshots,
  };
}
