import { describe, expect, it } from "vitest";
import { calculateOverallInsights } from "../lib/insights";
import type { Assignment, Module, AssignmentSession } from "../types";

const NOW = new Date(2026, 7, 19, 9, 0, 0); // Wednesday 2026-08-19

const module1: Module = { id: "m1", name: "Databases", credits: 5 };
const assignment1: Assignment = {
  id: "a1",
  moduleId: "m1",
  title: "Coursework 1",
  deadline: "2026-12-01",
  moduleWeight: 40,
  tasks: [],
};

function block(overrides: Partial<AssignmentSession> = {}): AssignmentSession {
  return { id: "b1", assignmentId: "a1", date: "2026-08-18", start: "09:00", end: "10:00", taskId: "assignment-work", taskName: "Assignment work", ...overrides };
}

describe("calculateOverallInsights", () => {
  it("only includes assignments whose module still exists", () => {
    const orphaned: Assignment = { ...assignment1, id: "a2", moduleId: "missing-module" };
    const insights = calculateOverallInsights([assignment1, orphaned], [module1], []);

    expect(insights.perAssignment).toHaveLength(1);
    expect(insights.perAssignment[0].assignmentId).toBe("a1");
  });

  it("sums completed minutes per assignment and clamps at the recommended total", () => {
    const blocks = [
      block({ id: "b1", completedAt: "2026-08-18T10:00:00.000Z", start: "00:00", end: "20:00" }), // 20h, deliberately far more than the ~16h recommendation for this fixture
    ];
    const insights = calculateOverallInsights([assignment1], [module1], blocks);

    const assignmentInsight = insights.perAssignment[0];
    expect(assignmentInsight.completedMinutes).toBe(assignmentInsight.recommendedMinutes);
    expect(assignmentInsight.completionRate).toBe(1);
  });

  it("does not count incomplete blocks toward completed minutes", () => {
    const blocks = [block({ completedAt: undefined })];
    const insights = calculateOverallInsights([assignment1], [module1], blocks);

    expect(insights.perAssignment[0].completedMinutes).toBe(0);
    expect(insights.completedSessionCount).toBe(0);
  });

  it("only counts this week's completed minutes for thisWeekCompletedMinutes", () => {
    const thisWeekBlock = block({ id: "b1", date: "2026-08-18", completedAt: "2026-08-18T10:00:00.000Z" });
    const lastWeekBlock = block({ id: "b2", date: "2026-08-09", completedAt: "2026-08-09T10:00:00.000Z" });
    const insights = calculateOverallInsights([assignment1], [module1], [thisWeekBlock, lastWeekBlock], NOW);

    expect(insights.thisWeekCompletedMinutes).toBe(60);
    expect(insights.completedSessionCount).toBe(2);
  });
});
