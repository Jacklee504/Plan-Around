import { describe, expect, it } from "vitest";
import {
  calculateRemainingWorkload,
  canCompleteStudyBlock,
  completedMinutes,
  completedMinutesByTask,
  completedStudyBlocks,
  incompleteStudyBlocks,
  removeAssignmentPlanningState,
  replaceIncompleteBlocksForAssignment,
  restoreAssignmentPlanningState,
  studyBlockMinutes,
} from "../lib/studyProgress";
import type { StudyBlock, WorkloadBreakdown } from "../types";

function block(overrides: Partial<StudyBlock> = {}): StudyBlock {
  return {
    id: "block-1",
    assignmentId: "assignment-1",
    date: "2026-08-17",
    start: "09:00",
    end: "10:00",
    taskId: "implementation",
    taskName: "Implementation",
    ...overrides,
  };
}

describe("studyProgress", () => {
  it("calculates block duration in minutes for 60, 90 and 120 minute blocks", () => {
    expect(studyBlockMinutes(block({ start: "09:00", end: "10:00" }))).toBe(60);
    expect(studyBlockMinutes(block({ start: "09:00", end: "10:30" }))).toBe(90);
    expect(studyBlockMinutes(block({ start: "09:00", end: "11:00" }))).toBe(120);
  });

  it("filters completed and incomplete blocks", () => {
    const complete = block({ id: "a", completedAt: "2026-08-17T09:30:00.000Z" });
    const incomplete = block({ id: "b" });

    expect(completedStudyBlocks([complete, incomplete])).toEqual([complete]);
    expect(incompleteStudyBlocks([complete, incomplete])).toEqual([incomplete]);
  });

  it("sums total completed minutes", () => {
    const blocks = [
      block({ id: "a", start: "09:00", end: "10:00", completedAt: "2026-08-17T10:00:00.000Z" }),
      block({ id: "b", start: "10:00", end: "11:30", completedAt: "2026-08-17T11:30:00.000Z" }),
      block({ id: "c", start: "12:00", end: "13:00" }),
    ];

    expect(completedMinutes(blocks)).toBe(150);
  });

  it("groups completed minutes by task", () => {
    const blocks = [
      block({ id: "a", taskId: "implementation", start: "09:00", end: "10:00", completedAt: "2026-08-17T10:00:00.000Z" }),
      block({ id: "b", taskId: "testing", start: "10:00", end: "10:30", completedAt: "2026-08-17T10:30:00.000Z" }),
      block({ id: "c", taskId: "implementation", start: "11:00", end: "12:00", completedAt: "2026-08-17T12:00:00.000Z" }),
      block({ id: "d", taskId: "testing", start: "12:00", end: "13:00" }),
    ];

    expect(completedMinutesByTask(blocks)).toEqual({ implementation: 120, testing: 30 });
  });

  it("treats legacy blocks without a completedAt field as incomplete", () => {
    const legacyBlock = block({ id: "legacy" });
    delete (legacyBlock as { completedAt?: string }).completedAt;

    expect(completedStudyBlocks([legacyBlock])).toEqual([]);
    expect(incompleteStudyBlocks([legacyBlock])).toEqual([legacyBlock]);
    expect(completedMinutes([legacyBlock])).toBe(0);
  });
});

describe("canCompleteStudyBlock", () => {
  it("allows completion when the scheduled start was 1 minute ago", () => {
    const now = new Date(2026, 7, 17, 9, 1);
    expect(canCompleteStudyBlock(block({ date: "2026-08-17", start: "09:00" }), now)).toBe(true);
  });

  it("allows completion exactly at the scheduled start", () => {
    const now = new Date(2026, 7, 17, 9, 0);
    expect(canCompleteStudyBlock(block({ date: "2026-08-17", start: "09:00" }), now)).toBe(true);
  });

  it("blocks completion 1 minute before the scheduled start", () => {
    const now = new Date(2026, 7, 17, 8, 59);
    expect(canCompleteStudyBlock(block({ date: "2026-08-17", start: "09:00" }), now)).toBe(false);
  });

  it("allows completion for a session scheduled yesterday", () => {
    const now = new Date(2026, 7, 18, 9, 0);
    expect(canCompleteStudyBlock(block({ date: "2026-08-17", start: "09:00" }), now)).toBe(true);
  });

  it("blocks completion for a session scheduled tomorrow", () => {
    const now = new Date(2026, 7, 17, 9, 0);
    expect(canCompleteStudyBlock(block({ date: "2026-08-18", start: "09:00" }), now)).toBe(false);
  });

  it("compares correctly across the late-March DST boundary using local date components", () => {
    const now = new Date(2026, 2, 30, 3, 0);
    expect(canCompleteStudyBlock(block({ date: "2026-03-29", start: "23:00" }), now)).toBe(true);
    expect(canCompleteStudyBlock(block({ date: "2026-03-31", start: "01:00" }), now)).toBe(false);
  });

  it("compares correctly across the late-October DST boundary using local date components", () => {
    const now = new Date(2026, 9, 26, 3, 0);
    expect(canCompleteStudyBlock(block({ date: "2026-10-25", start: "23:00" }), now)).toBe(true);
    expect(canCompleteStudyBlock(block({ date: "2026-10-27", start: "01:00" }), now)).toBe(false);
  });

  it("treats an already-completed block as undoable regardless of its scheduled time", () => {
    const now = new Date(2026, 7, 1, 0, 0);
    const completedFutureBlock = block({ date: "2026-08-17", start: "09:00", completedAt: "2026-08-17T09:05:00.000Z" });
    expect(canCompleteStudyBlock(completedFutureBlock, now)).toBe(true);
  });
});

function workload(taskRecommendedHours: Record<string, number>): WorkloadBreakdown {
  const usableHours = Object.values(taskRecommendedHours).reduce((total, hours) => total + hours, 0);
  const taskIds = Object.keys(taskRecommendedHours);

  return {
    totalHours: usableHours + 1,
    bufferHours: 1,
    usableHours,
    moduleWorkloadHours: 225,
    assessmentPoolHours: 90,
    calculatedTotalHours: usableHours + 1,
    isOverridden: false,
    taskHours: taskIds.map((id) => ({
      id,
      name: id,
      marks: 50,
      complexity: 2,
      requirements: [],
      recommendedHours: taskRecommendedHours[id],
      adjustedWeight: 1,
      proportion: 1 / taskIds.length,
    })),
  };
}

describe("calculateRemainingWorkload", () => {
  it("returns the original workload unchanged when nothing is completed", () => {
    const original = workload({ implementation: 4, testing: 2 });

    const remaining = calculateRemainingWorkload(original, []);

    expect(remaining.usableHours).toBe(6);
    expect(remaining.taskHours.map((task) => task.recommendedHours)).toEqual([4, 2]);
  });

  it("reduces only the completed task, not the total spread across every task", () => {
    const original = workload({ implementation: 4, testing: 2 });
    const completed = [block({ id: "a", taskId: "implementation", start: "09:00", end: "11:00", completedAt: "2026-08-17T11:00:00.000Z" })];

    const remaining = calculateRemainingWorkload(original, completed);

    expect(remaining.taskHours.find((task) => task.id === "implementation")?.recommendedHours).toBe(2);
    expect(remaining.taskHours.find((task) => task.id === "testing")?.recommendedHours).toBe(2);
    expect(remaining.usableHours).toBe(4);
  });

  it("clamps a fully completed task to zero", () => {
    const original = workload({ implementation: 4, testing: 2 });
    const completed = [block({ id: "a", taskId: "implementation", start: "09:00", end: "13:00", completedAt: "2026-08-17T13:00:00.000Z" })];

    const remaining = calculateRemainingWorkload(original, completed);

    expect(remaining.taskHours.find((task) => task.id === "implementation")?.recommendedHours).toBe(0);
    expect(remaining.usableHours).toBe(2);
  });

  it("sums completed minutes across multiple tasks", () => {
    const original = workload({ implementation: 4, testing: 2 });
    const completed = [
      block({ id: "a", taskId: "implementation", start: "09:00", end: "10:00", completedAt: "2026-08-17T10:00:00.000Z" }),
      block({ id: "b", taskId: "testing", start: "10:00", end: "11:00", completedAt: "2026-08-17T11:00:00.000Z" }),
    ];

    const remaining = calculateRemainingWorkload(original, completed);

    expect(remaining.taskHours.find((task) => task.id === "implementation")?.recommendedHours).toBe(3);
    expect(remaining.taskHours.find((task) => task.id === "testing")?.recommendedHours).toBe(1);
    expect(remaining.usableHours).toBe(4);
  });

  it("never goes negative from excess completed time, and ignores completed time for a task no longer in the workload", () => {
    const original = workload({ implementation: 1, testing: 3 });
    const completed = [
      // Over-completed relative to its own recommendation - must not offset "testing".
      block({ id: "a", taskId: "implementation", start: "09:00", end: "12:00", completedAt: "2026-08-17T12:00:00.000Z" }),
      // Belongs to a task the current workload no longer has (e.g. an edited rubric).
      block({ id: "b", taskId: "removed-task", start: "13:00", end: "14:00", completedAt: "2026-08-17T14:00:00.000Z" }),
    ];

    const remaining = calculateRemainingWorkload(original, completed);

    expect(remaining.taskHours.find((task) => task.id === "implementation")?.recommendedHours).toBe(0);
    expect(remaining.taskHours.find((task) => task.id === "testing")?.recommendedHours).toBe(3);
    expect(remaining.usableHours).toBe(3);
  });

  it("preserves explanatory source values from the original workload", () => {
    const original = workload({ implementation: 4 });

    const remaining = calculateRemainingWorkload(original, []);

    expect(remaining.totalHours).toBe(original.totalHours);
    expect(remaining.bufferHours).toBe(original.bufferHours);
    expect(remaining.moduleWorkloadHours).toBe(original.moduleWorkloadHours);
    expect(remaining.assessmentPoolHours).toBe(original.assessmentPoolHours);
    expect(remaining.calculatedTotalHours).toBe(original.calculatedTotalHours);
    expect(remaining.isOverridden).toBe(original.isOverridden);
  });
});

describe("removeAssignmentPlanningState / restoreAssignmentPlanningState", () => {
  it("removes only the deleted assignment's StudyBlocks and plan snapshot, leaving other assignments untouched", () => {
    const forDeletedIncomplete = block({ id: "a", assignmentId: "assignment-1" });
    const forDeletedCompleted = block({ id: "b", assignmentId: "assignment-1", completedAt: "2026-08-17T10:00:00.000Z" });
    const forOther = block({ id: "c", assignmentId: "assignment-2" });
    const planSnapshots = { "assignment-1": "fingerprint-1", "assignment-2": "fingerprint-2" };

    const result = removeAssignmentPlanningState(
      [forDeletedIncomplete, forDeletedCompleted, forOther],
      planSnapshots,
      "assignment-1",
    );

    expect(result.remainingStudyBlocks).toEqual([forOther]);
    expect(result.removedStudyBlocks).toEqual([forDeletedIncomplete, forDeletedCompleted]);
    expect(result.remainingPlanSnapshots).toEqual({ "assignment-2": "fingerprint-2" });
    expect(result.removedPlanSnapshot).toBe("fingerprint-1");
  });

  it("is a no-op for an assignment with no StudyBlocks or snapshot", () => {
    const forOther = block({ id: "c", assignmentId: "assignment-2" });

    const result = removeAssignmentPlanningState([forOther], { "assignment-2": "fingerprint-2" }, "assignment-1");

    expect(result.remainingStudyBlocks).toEqual([forOther]);
    expect(result.removedStudyBlocks).toEqual([]);
    expect(result.remainingPlanSnapshots).toEqual({ "assignment-2": "fingerprint-2" });
    expect(result.removedPlanSnapshot).toBeUndefined();
  });

  it("restores a deleted assignment's StudyBlocks and plan snapshot together (Undo)", () => {
    const forOther = block({ id: "c", assignmentId: "assignment-2" });
    const planSnapshots = { "assignment-2": "fingerprint-2" };
    const removed = removeAssignmentPlanningState(
      [block({ id: "a", assignmentId: "assignment-1" }), forOther],
      { "assignment-1": "fingerprint-1", ...planSnapshots },
      "assignment-1",
    );

    const restored = restoreAssignmentPlanningState(
      removed.remainingStudyBlocks,
      removed.remainingPlanSnapshots,
      "assignment-1",
      removed.removedStudyBlocks,
      removed.removedPlanSnapshot,
    );

    expect(restored.restoredStudyBlocks).toEqual([forOther, block({ id: "a", assignmentId: "assignment-1" })]);
    expect(restored.restoredPlanSnapshots).toEqual({ "assignment-1": "fingerprint-1", "assignment-2": "fingerprint-2" });
  });

  it("restoring an assignment that never had blocks/snapshot changes nothing", () => {
    const forOther = block({ id: "c", assignmentId: "assignment-2" });

    const restored = restoreAssignmentPlanningState([forOther], { "assignment-2": "fingerprint-2" }, "assignment-1", [], undefined);

    expect(restored.restoredStudyBlocks).toEqual([forOther]);
    expect(restored.restoredPlanSnapshots).toEqual({ "assignment-2": "fingerprint-2" });
  });
});

describe("replaceIncompleteBlocksForAssignment", () => {
  it("preserves completed blocks and every other assignment's blocks, replacing only the selected assignment's incomplete blocks", () => {
    const completedForSelected = block({ id: "completed", assignmentId: "assignment-1", completedAt: "2026-08-17T10:00:00.000Z" });
    const staleIncompleteForSelected = block({ id: "stale", assignmentId: "assignment-1" });
    const otherAssignmentBlock = block({ id: "other", assignmentId: "assignment-2" });
    const newBlock = block({ id: "new", assignmentId: "assignment-1", start: "14:00", end: "15:00" });

    const result = replaceIncompleteBlocksForAssignment(
      [completedForSelected, staleIncompleteForSelected, otherAssignmentBlock],
      "assignment-1",
      [newBlock],
    );

    expect(result).toEqual([completedForSelected, otherAssignmentBlock, newBlock]);
  });

  it("does not duplicate completed blocks when replanning with no new blocks", () => {
    const completedForSelected = block({ id: "completed", assignmentId: "assignment-1", completedAt: "2026-08-17T10:00:00.000Z" });

    const result = replaceIncompleteBlocksForAssignment([completedForSelected], "assignment-1", []);

    expect(result).toEqual([completedForSelected]);
  });
});
