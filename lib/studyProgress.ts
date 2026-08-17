import { hoursFromMinutes } from "./scheduler";
import type { StudyBlock, WorkloadBreakdown } from "@/types";

export function studyBlockMinutes(block: StudyBlock) {
  const [startHours, startMinutes] = block.start.split(":").map(Number);
  const [endHours, endMinutes] = block.end.split(":").map(Number);
  return endHours * 60 + endMinutes - (startHours * 60 + startMinutes);
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
