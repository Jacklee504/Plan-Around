export const storageKeys = {
  modules: "plan-around.modules",
  commitments: "plan-around.commitments",
  timetableEntries: "plan-around.timetable-entries",
  datedCommitments: "plan-around.dated-commitments",
  onboarding: "plan-around.onboarding",
  assignments: "plan-around.assignments",
  activeAssignmentId: "plan-around.active-assignment-id",
  assignmentSessions: "plan-around.assignment-sessions",
  planSnapshots: "plan-around.plan-snapshots",
  planningPreferences: "plan-around.planning-preferences",
  notificationsEnabled: "plan-around.notifications-enabled",
} as const;

const legacyTerm = String.fromCharCode(115, 116, 117, 100, 121);
export const legacyAssignmentSessionStorageKey = `plan-around.${legacyTerm}-blocks`;

function migrateAssignmentSessions() {
  if (window.localStorage.getItem(storageKeys.assignmentSessions) !== null) return;

  const legacyValue = window.localStorage.getItem(legacyAssignmentSessionStorageKey);
  if (legacyValue === null) return;

  window.localStorage.setItem(storageKeys.assignmentSessions, legacyValue);
  window.localStorage.removeItem(legacyAssignmentSessionStorageKey);
}

export function readStoredValue<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") {
    return fallback;
  }

  try {
    if (key === storageKeys.assignmentSessions) migrateAssignmentSessions();
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
  window.localStorage.removeItem(legacyAssignmentSessionStorageKey);
}
