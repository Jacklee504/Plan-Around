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
