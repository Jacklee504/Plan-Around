import { arePlanningPreferencesDefault, normalizePlanningPreferences } from "./planningPreferences";
import type { Assignment, Commitment, DatedCommitment, Module, PlanningPreferences, AssignmentSession, TimetableEntry } from "@/types";

export type PlanInputs = {
  assignment: Assignment;
  module: Module;
  timetableEntries: TimetableEntry[];
  commitments: Commitment[];
  datedCommitments?: DatedCommitment[];
  planningPreferences?: PlanningPreferences;
};

function sortByValue<T>(items: T[]) {
  return [...items].sort((first, second) => JSON.stringify(first).localeCompare(JSON.stringify(second)));
}

/**
 * A plan is only safe to show while the inputs that shaped it are unchanged.
 * IDs are intentionally omitted from recurring constraints so re-importing an
 * identical timetable does not invalidate a plan purely because entries were rebuilt.
 */
function createPlanInputSnapshot({ assignment, module, timetableEntries, commitments, datedCommitments = [], planningPreferences }: PlanInputs) {
  // Default preferences are omitted entirely so a plan saved before Settings
  // existed produces the exact same fingerprint as one saved under explicit
  // defaults afterwards - only a real preference change is detectable.
  const normalizedPreferences = normalizePlanningPreferences(planningPreferences);

  return {
    assignment: {
      moduleId: assignment.moduleId,
      title: assignment.title,
      deadline: assignment.deadline,
      moduleWeight: assignment.moduleWeight,
      tasks: assignment.tasks,
      workloadOverrideHours: assignment.workloadOverrideHours,
    },
    module: { id: module.id, credits: module.credits },
    timetableEntries: sortByValue(timetableEntries.map((entry) => ({
      moduleCode: entry.moduleCode,
      dayOfWeek: entry.dayOfWeek,
      start: entry.start,
      end: entry.end,
      sessionType: entry.sessionType,
      attendance: entry.attendance,
      skippedWeeks: [...entry.skippedWeeks].sort(),
    }))),
    commitments: sortByValue(commitments.map((commitment) => ({
      label: commitment.label,
      dayOfWeek: commitment.dayOfWeek,
      start: commitment.start,
      end: commitment.end,
      category: commitment.category,
    }))),
    datedCommitments: sortByValue(datedCommitments.map((commitment) => ({
      label: commitment.label,
      date: commitment.date,
      start: commitment.start,
      end: commitment.end,
      category: commitment.category,
    }))),
    ...(arePlanningPreferencesDefault(normalizedPreferences) ? {} : { planningPreferences: normalizedPreferences }),
  };
}

export function createPlanInputFingerprint(inputs: PlanInputs) {
  return JSON.stringify(createPlanInputSnapshot(inputs));
}

/**
 * A plan remains valid while the inputs that shaped its own workload and
 * recurring availability are unchanged. Other plans reserve availability only
 * when making a new schedule; their later creation must not stale this plan.
 */
export function createPlanFingerprint(inputs: PlanInputs) {
  return createPlanInputFingerprint(inputs);
}

type ReservableBlocksInput = Pick<PlanInputs, "timetableEntries" | "commitments" | "datedCommitments" | "planningPreferences"> & {
  currentAssignmentId: string;
  assignments: Assignment[];
  modules: Module[];
  assignmentSessions: AssignmentSession[];
  planSnapshots: Record<string, string>;
};

/**
 * Only saved plans whose own assignment/module/timetable/preference inputs
 * are unchanged reserve time. This prevents removed assignments and plans
 * made stale by an edited timetable, commitment, workload, or planning
 * preference from blocking a new plan.
 */
export function getReservableAssignmentSessions({
  currentAssignmentId,
  assignments,
  modules,
  assignmentSessions,
  planSnapshots,
  timetableEntries,
  commitments,
  datedCommitments,
  planningPreferences,
}: ReservableBlocksInput) {
  const reservableAssignmentIds = new Set(
    assignments
      .filter((assignment) => assignment.id !== currentAssignmentId)
      .filter((assignment) => {
        const assignmentModule = modules.find((candidate) => candidate.id === assignment.moduleId);
        if (!assignmentModule) return false;

        return planSnapshots[assignment.id] === createPlanInputFingerprint({
          assignment,
          module: assignmentModule,
          timetableEntries,
          commitments,
          datedCommitments,
          planningPreferences,
        });
      })
      .map((assignment) => assignment.id),
  );

  // A completed block is finished history, not a future obligation, so it
  // should not reserve time away from a different assignment's plan.
  return assignmentSessions.filter((block) => reservableAssignmentIds.has(block.assignmentId) && !block.completedAt);
}

export type PlanChangeReason =
  | "assignment"
  | "module-workload"
  | "timetable"
  | "recurring-commitments"
  | "dated-commitments"
  | "planning-preferences";

// The minimum fields a fingerprint needs before per-category comparison is
// meaningful. planningPreferences is deliberately excluded - it's omitted
// for default preferences by design, not a sign of a malformed/legacy shape.
const REQUIRED_SNAPSHOT_FIELDS = ["assignment", "module", "timetableEntries", "commitments", "datedCommitments"] as const;

function parseStoredSnapshot(storedFingerprint: string): ReturnType<typeof createPlanInputSnapshot> | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(storedFingerprint);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  if (!REQUIRED_SNAPSHOT_FIELDS.every((field) => field in parsed)) return null;
  return parsed as ReturnType<typeof createPlanInputSnapshot>;
}

/**
 * Explains why a stored plan is stale by comparing the stored fingerprint
 * against the current inputs category by category, reusing the same
 * snapshot shape createPlanFingerprint already produces. Deterministic only
 * - no AI call.
 */
export function getPlanChangeReasons(storedFingerprint: string | undefined, currentInputs: PlanInputs): PlanChangeReason[] {
  if (!storedFingerprint) return [];

  const currentSnapshot = createPlanInputSnapshot(currentInputs);
  const storedSnapshot = parseStoredSnapshot(storedFingerprint);
  // A legacy or corrupted fingerprint can't be compared field by field, so
  // fall back to the broadest, most conservative reason instead of crashing.
  if (!storedSnapshot) return ["assignment"];

  const reasons: PlanChangeReason[] = [];
  if (JSON.stringify(storedSnapshot.assignment) !== JSON.stringify(currentSnapshot.assignment)) reasons.push("assignment");
  if (JSON.stringify(storedSnapshot.module) !== JSON.stringify(currentSnapshot.module)) reasons.push("module-workload");
  if (JSON.stringify(storedSnapshot.timetableEntries) !== JSON.stringify(currentSnapshot.timetableEntries)) reasons.push("timetable");
  if (JSON.stringify(storedSnapshot.commitments) !== JSON.stringify(currentSnapshot.commitments)) reasons.push("recurring-commitments");
  if (JSON.stringify(storedSnapshot.datedCommitments) !== JSON.stringify(currentSnapshot.datedCommitments)) reasons.push("dated-commitments");
  if (JSON.stringify(storedSnapshot.planningPreferences) !== JSON.stringify(currentSnapshot.planningPreferences)) reasons.push("planning-preferences");

  return reasons;
}
