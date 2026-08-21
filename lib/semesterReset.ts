import { storageKeys, writeStoredValue } from "./storage";
import type { OnboardingState } from "@/types";

/**
 * What "starting a new semester" clears - everything tied to a specific
 * term's classes and workload. Planning preferences and the notification
 * opt-in are personal device settings, not term data, so they're left alone.
 * Callers are expected to archive the current data (see dataPortability.ts)
 * before calling this, since it is not reversible on its own.
 */
export function resetForNewSemester() {
  writeStoredValue(storageKeys.modules, []);
  writeStoredValue(storageKeys.assignments, []);
  writeStoredValue(storageKeys.commitments, []);
  writeStoredValue(storageKeys.datedCommitments, []);
  writeStoredValue(storageKeys.timetableEntries, []);
  writeStoredValue(storageKeys.studyBlocks, []);
  writeStoredValue(storageKeys.planSnapshots, {});
  writeStoredValue(storageKeys.onboarding, { completed: false } satisfies OnboardingState);
}
