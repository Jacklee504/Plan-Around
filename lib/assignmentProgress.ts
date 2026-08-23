import { hoursFromMinutes } from "./scheduler";
import { dateFromDateKey } from "./calendarWeek";
import type { AssignmentSession, WorkloadBreakdown } from "@/types";

export function assignmentSessionMinutes(block: AssignmentSession) {
  const [startHours, startMinutes] = block.start.split(":").map(Number);
  const [endHours, endMinutes] = block.end.split(":").map(Number);
  return endHours * 60 + endMinutes - (startHours * 60 + startMinutes);
}

/**
 * Local calendar-date/time construction, deliberately not `new Date(iso + "Z")`,
 * so a block's scheduled start compares correctly regardless of the reader's
 * assumptions about UTC - see canCompleteAssignmentSession.
 */
export function assignmentSessionScheduledStart(block: Pick<AssignmentSession, "date" | "start">) {
  const scheduledStart = dateFromDateKey(block.date);
  const [hours, minutes] = block.start.split(":").map(Number);
  scheduledStart.setHours(hours, minutes, 0, 0);
  return scheduledStart;
}

/**
 * A AssignmentSession represents scheduled work on a real future date/time, so
 * marking it complete before that time would make "completed" ambiguous
 * (did the work happen early, or is the slot still occupied?). Already
 * completed blocks remain undoable regardless of their scheduled time so
 * legacy/unusual data is never trapped.
 */
export function canCompleteAssignmentSession(block: Pick<AssignmentSession, "date" | "start" | "completedAt">, now: Date = new Date()) {
  if (block.completedAt) return true;
  return assignmentSessionScheduledStart(block).getTime() <= now.getTime();
}

export function completedAssignmentSessions(blocks: AssignmentSession[]) {
  return blocks.filter((block) => Boolean(block.completedAt));
}

export function incompleteAssignmentSessions(blocks: AssignmentSession[]) {
  return blocks.filter((block) => !block.completedAt);
}

export function completedMinutes(blocks: AssignmentSession[]) {
  return completedAssignmentSessions(blocks).reduce((total, block) => total + assignmentSessionMinutes(block), 0);
}

export function completedMinutesByTask(blocks: AssignmentSession[]) {
  return completedAssignmentSessions(blocks).reduce<Record<string, number>>((totals, block) => {
    totals[block.taskId] = (totals[block.taskId] ?? 0) + assignmentSessionMinutes(block);
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
export function calculateRemainingWorkload(workload: WorkloadBreakdown, completedBlocks: AssignmentSession[]): WorkloadBreakdown {
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
 * Preserves every completed AssignmentSession for the given assignment (and every
 * block belonging to other assignments), replacing only its incomplete
 * blocks with a freshly generated set.
 */
export function replaceIncompleteBlocksForAssignment(
  currentBlocks: AssignmentSession[],
  assignmentId: string,
  newIncompleteBlocks: AssignmentSession[],
): AssignmentSession[] {
  return [
    ...currentBlocks.filter((block) => block.assignmentId !== assignmentId || block.completedAt),
    ...newIncompleteBlocks,
  ];
}

export type RemovedAssignmentPlanningState = {
  remainingAssignmentSessions: AssignmentSession[];
  remainingPlanSnapshots: Record<string, string>;
  removedAssignmentSessions: AssignmentSession[];
  removedPlanSnapshot: string | undefined;
};

/**
 * Deleting an assignment must remove its AssignmentSessions and plan snapshot along
 * with the assignment record itself - otherwise orphaned AssignmentSessions keep
 * appearing in Calendar and can keep reserving time for an assignment that no
 * longer exists. The removed state is returned so Undo can restore it.
 */
export function removeAssignmentPlanningState(
  assignmentSessions: AssignmentSession[],
  planSnapshots: Record<string, string>,
  assignmentId: string,
): RemovedAssignmentPlanningState {
  const remainingPlanSnapshots = { ...planSnapshots };
  delete remainingPlanSnapshots[assignmentId];

  return {
    remainingAssignmentSessions: assignmentSessions.filter((block) => block.assignmentId !== assignmentId),
    remainingPlanSnapshots,
    removedAssignmentSessions: assignmentSessions.filter((block) => block.assignmentId === assignmentId),
    removedPlanSnapshot: planSnapshots[assignmentId],
  };
}

/**
 * The inverse of removeAssignmentPlanningState, used to undo a delete: restores
 * the assignment's AssignmentSessions and plan snapshot together, not just the
 * assignment record.
 */
export function restoreAssignmentPlanningState(
  assignmentSessions: AssignmentSession[],
  planSnapshots: Record<string, string>,
  assignmentId: string,
  removedAssignmentSessions: AssignmentSession[],
  removedPlanSnapshot: string | undefined,
) {
  return {
    restoredAssignmentSessions: removedAssignmentSessions.length ? [...assignmentSessions, ...removedAssignmentSessions] : assignmentSessions,
    restoredPlanSnapshots: removedPlanSnapshot !== undefined
      ? { ...planSnapshots, [assignmentId]: removedPlanSnapshot }
      : planSnapshots,
  };
}
