export type CommitmentCategory = "class" | "work" | "gym" | "meal" | "social" | "other";

export type Module = {
  id: string;
  name: string;
  code?: string;
  credits: number;
};

export type Commitment = {
  id: string;
  label: string;
  dayOfWeek: number;
  start: string;
  end: string;
  category: CommitmentCategory;
};

export type TimetableSessionType = "lecture" | "lab" | "tutorial";

export type TimetableAttendance = "attending" | "skip-this-week" | "skip-every-week";

export type TimetableEntry = {
  id: string;
  moduleCode: string;
  moduleName: string;
  dayOfWeek: number;
  start: string;
  end: string;
  sessionType: TimetableSessionType;
  attendance: TimetableAttendance;
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
};

export type WorkloadTask = AssignmentTask & {
  recommendedHours: number;
};

export type WorkloadBreakdown = {
  totalHours: number;
  bufferHours: number;
  taskHours: WorkloadTask[];
};

export type StudyBlock = {
  id: string;
  date: string;
  start: string;
  end: string;
  taskId: string;
  taskName: string;
};
