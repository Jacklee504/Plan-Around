import { describe, expect, it } from "vitest";
import { summarizeReplan } from "../lib/replanSummary";
import type { StudyBlock } from "../types";

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

describe("summarizeReplan", () => {
  it("treats identical old and new blocks as entirely unchanged", () => {
    const previous = [block({ id: "a" }), block({ id: "b", taskId: "testing", start: "10:00", end: "11:00" })];
    // Different ids, but the same semantic key (task/date/start/end).
    const next = [block({ id: "a2" }), block({ id: "b2", taskId: "testing", start: "10:00", end: "11:00" })];

    const summary = summarizeReplan(previous, next);

    expect(summary).toEqual({
      previousIncompleteBlocks: 2,
      newIncompleteBlocks: 2,
      removedBlocks: 0,
      addedBlocks: 0,
      unchangedBlocks: 2,
      rescheduledMinutes: 0,
    });
  });

  it("reports removed and added blocks with nonzero rescheduled minutes when placement changes", () => {
    const previous = [block({ id: "a", start: "09:00", end: "10:30" })];
    const next = [block({ id: "b", start: "14:00", end: "15:30" })];

    const summary = summarizeReplan(previous, next);

    expect(summary.removedBlocks).toBe(1);
    expect(summary.addedBlocks).toBe(1);
    expect(summary.unchangedBlocks).toBe(0);
    expect(summary.rescheduledMinutes).toBe(90);
  });

  it("does not treat a different task at the same time as unchanged", () => {
    const previous = [block({ id: "a", taskId: "implementation", start: "09:00", end: "10:00" })];
    const next = [block({ id: "b", taskId: "testing", start: "09:00", end: "10:00" })];

    const summary = summarizeReplan(previous, next);

    expect(summary.unchangedBlocks).toBe(0);
    expect(summary.removedBlocks).toBe(1);
    expect(summary.addedBlocks).toBe(1);
  });

  it("excludes completed blocks from the movement summary on both sides", () => {
    const previous = [
      block({ id: "done", completedAt: "2026-08-17T10:00:00.000Z" }),
      block({ id: "pending", taskId: "testing", start: "10:00", end: "11:00" }),
    ];
    const next = [block({ id: "new", taskId: "testing", start: "14:00", end: "15:00" })];

    const summary = summarizeReplan(previous, next);

    expect(summary.previousIncompleteBlocks).toBe(1);
    expect(summary.newIncompleteBlocks).toBe(1);
    expect(summary.removedBlocks).toBe(1);
    expect(summary.addedBlocks).toBe(1);
  });
});
