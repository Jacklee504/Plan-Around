import { describe, expect, it } from "vitest";
import { createPlanFingerprint } from "../lib/planSnapshot";
import { generateStudySchedule } from "../lib/scheduler";
import { calculateWorkloadBreakdown } from "../lib/workload";
import type { Assignment, Commitment, TimetableEntry } from "../types";

const softwareModule = { id: "cs301", code: "CS301", name: "Software Engineering", credits: 10, creditsConfirmed: true };

function assignment(overrides: Partial<Assignment> = {}): Assignment {
  return {
    id: "assignment-1",
    moduleId: softwareModule.id,
    title: "Coursework project",
    deadline: "2026-08-19",
    moduleWeight: 40,
    tasks: [{ id: "implementation", name: "Implementation", marks: 100, complexity: 2, requirements: [] }],
    ...overrides,
  };
}

function commitment(overrides: Partial<Commitment> = {}): Commitment {
  return { id: "work", label: "Work", dayOfWeek: 1, start: "08:00", end: "20:00", category: "work", ...overrides };
}

function timetableEntry(overrides: Partial<TimetableEntry> = {}): TimetableEntry {
  return {
    id: "class-1",
    moduleCode: "CS301",
    moduleName: "Software Engineering",
    dayOfWeek: 1,
    start: "08:00",
    end: "22:00",
    sessionType: "lecture",
    attendance: "attending",
    skippedWeeks: [],
    ...overrides,
  };
}

describe("workload model", () => {
  it("calculates a 10 ECTS, 40% assessment as 36h with a 3.5h project buffer", () => {
    const result = calculateWorkloadBreakdown(softwareModule.credits, assignment());

    expect(result.totalHours).toBe(36);
    expect(result.usableHours).toBe(32.5);
    expect(result.bufferHours).toBe(3.5);
  });

  it("uses complexity as a moderate adjustment to marks", () => {
    const result = calculateWorkloadBreakdown(softwareModule.credits, assignment({
      tasks: [
        { id: "low", name: "Low complexity", marks: 50, complexity: 1, requirements: [] },
        { id: "high", name: "High complexity", marks: 50, complexity: 3, requirements: [] },
      ],
    }));

    expect(result.taskHours.map((task) => task.recommendedHours)).toEqual([12.5, 20]);
  });
});

describe("scheduler", () => {
  it("never places a study block inside a personal commitment", () => {
    const task = assignment({ workloadOverrideHours: 3 });
    const result = generateStudySchedule({
      assignment: task,
      workload: calculateWorkloadBreakdown(softwareModule.credits, task),
      timetableEntries: [],
      commitments: [commitment()],
      now: new Date(2026, 7, 17, 7),
    });

    expect(result.studyBlocks.every((block) => block.date !== "2026-08-17" || block.start >= "20:00")).toBe(true);
  });

  it("creates usable availability when a class is skipped", () => {
    const task = assignment({ deadline: "2026-08-18", workloadOverrideHours: 3 });
    const result = generateStudySchedule({
      assignment: task,
      workload: calculateWorkloadBreakdown(softwareModule.credits, task),
      timetableEntries: [timetableEntry({ attendance: "skip-every-week" })],
      commitments: [],
      now: new Date(2026, 7, 17, 7),
    });

    expect(result.status).toBe("on-track");
    expect(result.studyBlocks.some((block) => block.date === "2026-08-17")).toBe(true);
  });

  it("marks a plan Tight when it must use the deadline date", () => {
    const task = assignment({ deadline: "2026-08-18", workloadOverrideHours: 3 });
    const result = generateStudySchedule({
      assignment: task,
      workload: calculateWorkloadBreakdown(softwareModule.credits, task),
      timetableEntries: [],
      commitments: [],
      now: new Date(2026, 7, 17, 21),
    });

    expect(result.status).toBe("tight");
    expect(result.studyBlocks.some((block) => block.date === "2026-08-18")).toBe(true);
  });

  it("reports Not enough time when the full deadline window cannot fit the work", () => {
    const task = assignment({ deadline: "2026-08-17", workloadOverrideHours: 3 });
    const result = generateStudySchedule({
      assignment: task,
      workload: calculateWorkloadBreakdown(softwareModule.credits, task),
      timetableEntries: [],
      commitments: [],
      now: new Date(2026, 7, 17, 21),
    });

    expect(result.status).toBe("not-enough-time");
    expect(result.unscheduledHours).toBeGreaterThan(0);
  });
});

describe("saved-plan freshness", () => {
  it("changes the fingerprint when a scheduling input changes", () => {
    const task = assignment();
    const baseInputs = { assignment: task, module: softwareModule, timetableEntries: [timetableEntry()], commitments: [] };
    const original = createPlanFingerprint(baseInputs);
    const changedCommitment = createPlanFingerprint({ ...baseInputs, commitments: [commitment()] });

    expect(changedCommitment).not.toBe(original);
  });
});
