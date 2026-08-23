import { describe, expect, it } from "vitest";
import { assignmentPartNumber, formatAssignmentPart } from "../lib/assignmentParts";
import type { Assignment } from "../types";

const assignment: Assignment = {
  id: "assignment-1",
  moduleId: "module-1",
  title: "Coursework",
  deadline: "2026-09-01",
  moduleWeight: 40,
  tasks: [
    { id: "task-1", name: "Planning", marks: 20, complexity: 1, requirements: [] },
    { id: "task-2", name: "Implementation", marks: 80, complexity: 3, requirements: [] },
  ],
};

describe("assignment parts", () => {
  it("uses rubric order as the part number", () => {
    expect(assignmentPartNumber(assignment, "task-1")).toBe(1);
    expect(assignmentPartNumber(assignment, "task-2")).toBe(2);
    expect(assignmentPartNumber(assignment, "missing")).toBeNull();
  });

  it("prefixes known parts without changing fallback task names", () => {
    expect(formatAssignmentPart("Planning", 1)).toBe("Pt 1: Planning");
    expect(formatAssignmentPart("Assignment work", null)).toBe("Assignment work");
  });
});
