import type { Assignment } from "@/types";

export function assignmentPartNumber(assignment: Assignment, taskId: string) {
  const index = assignment.tasks.findIndex((task) => task.id === taskId);
  return index === -1 ? null : index + 1;
}

export function formatAssignmentPart(name: string, partNumber: number | null) {
  return partNumber === null ? name : `Pt ${partNumber}: ${name}`;
}
