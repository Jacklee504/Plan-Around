export const storageKeys = {
  modules: "plan-around.modules",
  commitments: "plan-around.commitments",
  timetableEntries: "plan-around.timetable-entries",
  datedCommitments: "plan-around.dated-commitments",
  onboarding: "plan-around.onboarding",
  assignments: "plan-around.assignments",
  studyBlocks: "plan-around.study-blocks",
  planSnapshots: "plan-around.plan-snapshots",
  planningPreferences: "plan-around.planning-preferences",
} as const;

export function readStoredValue<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") {
    return fallback;
  }

  try {
    const savedValue = window.localStorage.getItem(key);
    return savedValue ? (JSON.parse(savedValue) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function writeStoredValue<T>(key: string, value: T) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(key, JSON.stringify(value));
}

export function clearPlanAroundStorage() {
  if (typeof window === "undefined") {
    return;
  }

  Object.values(storageKeys).forEach((key) => window.localStorage.removeItem(key));
}
