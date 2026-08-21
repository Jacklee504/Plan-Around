import { beforeEach, describe, expect, it } from "vitest";
import { resetForNewSemester } from "../lib/semesterReset";
import { readStoredValue, storageKeys, writeStoredValue } from "../lib/storage";

// See tests/dataPortability.test.ts for why this shim exists - lib/storage.ts
// no-ops without `window`/localStorage, which vitest's node environment lacks.
function installFakeLocalStorage() {
  const store = new Map<string, string>();
  (globalThis as unknown as { window: unknown }).window = {
    localStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, value),
      removeItem: (key: string) => store.delete(key),
    },
  };
}

describe("resetForNewSemester", () => {
  beforeEach(() => {
    installFakeLocalStorage();
    writeStoredValue(storageKeys.modules, [{ id: "m1", name: "Databases", credits: 5 }]);
    writeStoredValue(storageKeys.assignments, [{ id: "a1" }]);
    writeStoredValue(storageKeys.commitments, [{ id: "c1" }]);
    writeStoredValue(storageKeys.datedCommitments, [{ id: "d1" }]);
    writeStoredValue(storageKeys.timetableEntries, [{ id: "e1" }]);
    writeStoredValue(storageKeys.studyBlocks, [{ id: "b1" }]);
    writeStoredValue(storageKeys.planSnapshots, { a1: "fingerprint" });
    writeStoredValue(storageKeys.onboarding, { completed: true, completedAt: "2026-01-01T00:00:00.000Z" });
    writeStoredValue(storageKeys.planningPreferences, { studyStart: "09:00" });
    writeStoredValue(storageKeys.notificationsEnabled, true);
  });

  it("clears every term-scoped key back to empty", () => {
    resetForNewSemester();

    expect(readStoredValue(storageKeys.modules, ["not-empty"])).toEqual([]);
    expect(readStoredValue(storageKeys.assignments, ["not-empty"])).toEqual([]);
    expect(readStoredValue(storageKeys.commitments, ["not-empty"])).toEqual([]);
    expect(readStoredValue(storageKeys.datedCommitments, ["not-empty"])).toEqual([]);
    expect(readStoredValue(storageKeys.timetableEntries, ["not-empty"])).toEqual([]);
    expect(readStoredValue(storageKeys.studyBlocks, ["not-empty"])).toEqual([]);
    expect(readStoredValue(storageKeys.planSnapshots, { keep: true })).toEqual({});
  });

  it("resets onboarding so the setup flow runs again for the new term", () => {
    resetForNewSemester();

    expect(readStoredValue(storageKeys.onboarding, { completed: true })).toEqual({ completed: false });
  });

  it("leaves personal device settings untouched", () => {
    resetForNewSemester();

    expect(readStoredValue(storageKeys.planningPreferences, {})).toEqual({ studyStart: "09:00" });
    expect(readStoredValue(storageKeys.notificationsEnabled, false)).toBe(true);
  });
});
