import type { Assignment, AssignmentTask, WorkloadBreakdown, WorkloadTask } from "@/types";

export const HOURS_PER_ECTS = 22.5;
export const ASSESSMENT_WORKLOAD_FACTOR = 0.4;
export const BUFFER_FACTOR = 0.1;
export const WORKLOAD_INCREMENT_HOURS = 0.5;
export const COMPLEXITY_MULTIPLIERS: Record<number, number> = {
  1: 0.8,
  2: 1,
  3: 1.25,
};

const fallbackTask: AssignmentTask = {
  id: "assignment-work",
  name: "Assignment work",
  marks: 1,
  complexity: 1,
  requirements: [],
};

export function roundToWorkloadIncrement(hours: number) {
  return Math.round(hours / WORKLOAD_INCREMENT_HOURS) * WORKLOAD_INCREMENT_HOURS;
}

export function calculateModuleWorkload(credits: number) {
  return credits * HOURS_PER_ECTS;
}

export function calculateAssessmentWorkloadPool(moduleWorkloadHours: number) {
  return moduleWorkloadHours * ASSESSMENT_WORKLOAD_FACTOR;
}

export function calculateAssignmentWorkload(assessmentPoolHours: number, moduleWeight: number) {
  return assessmentPoolHours * (moduleWeight / 100);
}

function allocateTaskHours(tasks: AssignmentTask[], usableHours: number): WorkloadTask[] {
  const sourceTasks = tasks.length ? tasks : [fallbackTask];
  const weights = sourceTasks.map((task) => Math.max(0, task.marks) * (COMPLEXITY_MULTIPLIERS[task.complexity] ?? 1));
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  const effectiveWeights = totalWeight > 0 ? weights : sourceTasks.map(() => 1);
  const effectiveTotalWeight = effectiveWeights.reduce((sum, weight) => sum + weight, 0);
  const totalUnits = Math.round(usableHours / WORKLOAD_INCREMENT_HOURS);
  const rawUnits = effectiveWeights.map((weight) => totalUnits * (weight / effectiveTotalWeight));
  const allocatedUnits = rawUnits.map(Math.floor);
  let remainingUnits = totalUnits - allocatedUnits.reduce((sum, units) => sum + units, 0);

  [...rawUnits.keys()]
    .sort((left, right) => {
      const fractionalDifference = (rawUnits[right] - Math.floor(rawUnits[right])) - (rawUnits[left] - Math.floor(rawUnits[left]));
      return fractionalDifference || left - right;
    })
    .forEach((index) => {
      if (remainingUnits > 0) {
        allocatedUnits[index] += 1;
        remainingUnits -= 1;
      }
    });

  return sourceTasks.map((task, index) => ({
    ...task,
    adjustedWeight: weights[index],
    proportion: effectiveWeights[index] / effectiveTotalWeight,
    recommendedHours: allocatedUnits[index] * WORKLOAD_INCREMENT_HOURS,
    isFallback: tasks.length === 0,
  }));
}

export function calculateWorkloadBreakdown(credits: number, assignment: Assignment): WorkloadBreakdown {
  const moduleWorkloadHours = calculateModuleWorkload(credits);
  const assessmentPoolHours = calculateAssessmentWorkloadPool(moduleWorkloadHours);
  const calculatedTotalHours = roundToWorkloadIncrement(calculateAssignmentWorkload(assessmentPoolHours, assignment.moduleWeight));
  const hasValidOverride = Number.isFinite(assignment.workloadOverrideHours) && (assignment.workloadOverrideHours ?? 0) > 0;
  const totalHours = roundToWorkloadIncrement(hasValidOverride ? assignment.workloadOverrideHours ?? 0 : calculatedTotalHours);
  const bufferHours = roundToWorkloadIncrement(totalHours * BUFFER_FACTOR);
  const usableHours = totalHours - bufferHours;

  return {
    totalHours,
    bufferHours,
    usableHours,
    moduleWorkloadHours,
    assessmentPoolHours,
    calculatedTotalHours,
    isOverridden: hasValidOverride,
    taskHours: allocateTaskHours(assignment.tasks, usableHours),
  };
}
