export type CommitmentCategory = "class" | "work" | "gym" | "meal" | "social" | "other";

export type Module = {
  id: string;
  name: string;
  code?: string;
  credits: number;
  creditsConfirmed?: boolean;
};

export type Commitment = {
  id: string;
  label: string;
  dayOfWeek: number;
  start: string;
  end: string;
  category: CommitmentCategory;
};

export type DatedCommitment = {
  id: string;
  label: string;
  date: string;
  start: string;
  end: string;
  category: CommitmentCategory;
};

export type TimetableSessionType = "lecture" | "lab" | "tutorial" | "other";

export type OnboardingState = {
  completed: boolean;
  completedAt?: string;
};

export type TimetableAttendance = "attending" | "skip-every-week";

export type TimetableEntry = {
  id: string;
  moduleCode: string;
  moduleName: string;
  dayOfWeek: number;
  start: string;
  end: string;
  sessionType: TimetableSessionType;
  attendance: TimetableAttendance;
  skippedWeeks: string[];
};

export type AssignmentTask = {
  id: string;
  name: string;
  marks: number;
  complexity: number;
  requirements: string[];
};

export type Assignment = {
  id: string;
  moduleId: string;
  title: string;
  deadline: string;
  moduleWeight: number;
  tasks: AssignmentTask[];
  workloadOverrideHours?: number;
  analysisSource?: {
    provider: "local-ollama" | "featherless";
    model: string;
  };
};

export type WorkloadTask = AssignmentTask & {
  recommendedHours: number;
  adjustedWeight: number;
  proportion: number;
  isFallback?: boolean;
};

export type WorkloadBreakdown = {
  totalHours: number;
  bufferHours: number;
  usableHours: number;
  moduleWorkloadHours: number;
  assessmentPoolHours: number;
  calculatedTotalHours: number;
  isOverridden: boolean;
  taskHours: WorkloadTask[];
};

export type AssignmentSession = {
  id: string;
  assignmentId: string;
  date: string;
  start: string;
  end: string;
  taskId: string;
  taskName: string;
  completedAt?: string;
  missedAt?: string;
};

export type PreferredAssignmentTime = "none" | "morning" | "afternoon" | "evening";

export type PlanningPreferences = {
  assignmentStart: string;
  assignmentEnd: string;
  preferredSessionMinutes: 60 | 90 | 120;
  dailyAssignmentTargetMinutes: 120 | 180 | 240 | 300;
  preferredTimeOfDay: PreferredAssignmentTime;
  enabledAssignmentDays: number[];
};

export type ScheduleStatus = "on-track" | "tight" | "not-enough-time";

export type ScheduleResult = {
  assignmentSessions: AssignmentSession[];
  status: ScheduleStatus;
  requiredHours: number;
  scheduledHours: number;
  unscheduledHours: number;
  bufferedAvailableHours: number;
  deadlineAvailableHours: number;
  usesDeadlineBuffer: boolean;
};
