import { describe, expect, it } from "vitest";
import {
  completedMinutes,
  completedMinutesByTask,
  completedStudyBlocks,
  incompleteStudyBlocks,
  studyBlockMinutes,
} from "../lib/studyProgress";
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
