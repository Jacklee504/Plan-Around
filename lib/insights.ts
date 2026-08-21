import { addCalendarWeeks, getCalendarWeekStart } from "./calendarWeek";
import { completedMinutes } from "./studyProgress";
import { calculateWorkloadBreakdown } from "./workload";
import type { Assignment, Module, StudyBlock } from "@/types";

export type AssignmentInsight = {
  assignmentId: string;
  title: string;
  completedMinutes: number;
  recommendedMinutes: number;
  /** 0-1, clamped so a task finished ahead of its own recommendation never exceeds 100%. */
  completionRate: number;
};

export type OverallInsights = {
  totalCompletedMinutes: number;
  totalRecommendedMinutes: number;
  completedSessionCount: number;
  thisWeekCompletedMinutes: number;
  perAssignment: AssignmentInsight[];
};

/**
 * Aggregates completion across every schedulable assignment (one with a
 * module still present), reusing the same workload/completed-minutes
 * calculations the Plan page already uses per assignment - this is purely a
 * read-side rollup, it does not change workload, scheduling or storage.
 */
export function calculateOverallInsights(
  assignments: Assignment[],
  modules: Module[],
  studyBlocks: StudyBlock[],
  now: Date = new Date(),
): OverallInsights {
  const weekStart = getCalendarWeekStart(now);
  const weekEnd = addCalendarWeeks(weekStart, 1);

  const perAssignment = assignments
    .map((assignment): AssignmentInsight | null => {
      const assignmentModule = modules.find((candidate) => candidate.id === assignment.moduleId);
      if (!assignmentModule) return null;

      const assignmentBlocks = studyBlocks.filter((block) => block.assignmentId === assignment.id);
      const workload = calculateWorkloadBreakdown(assignmentModule.credits, assignment);
      const recommendedMinutes = Math.round(workload.usableHours * 60);
      const completed = Math.min(recommendedMinutes, completedMinutes(assignmentBlocks));

      return {
        assignmentId: assignment.id,
        title: assignment.title,
        completedMinutes: completed,
        recommendedMinutes,
        completionRate: recommendedMinutes > 0 ? completed / recommendedMinutes : 0,
      };
    })
    .filter((insight): insight is AssignmentInsight => insight !== null);

  const completedBlocks = studyBlocks.filter((block) => block.completedAt);
  const thisWeekCompletedMinutes = completedMinutes(
    completedBlocks.filter((block) => block.date >= weekStart && block.date < weekEnd),
  );

  return {
    totalCompletedMinutes: perAssignment.reduce((total, insight) => total + insight.completedMinutes, 0),
    totalRecommendedMinutes: perAssignment.reduce((total, insight) => total + insight.recommendedMinutes, 0),
    completedSessionCount: completedBlocks.length,
    thisWeekCompletedMinutes,
    perAssignment,
  };
}
