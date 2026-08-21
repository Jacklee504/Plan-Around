import { beforeEach, describe, expect, it } from "vitest";
import {
  applyPlanAroundImport,
  buildPlanAroundExport,
  parsePlanAroundExport,
  serializePlanAroundExport,
} from "../lib/dataPortability";
import { readStoredValue, storageKeys, writeStoredValue } from "../lib/storage";

// lib/storage.ts no-ops without `window`/localStorage (see its SSR guard), so
// these tests provide a minimal in-memory shim rather than exercising real
// browser storage - vitest's default node environment has no `window` at all.
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

describe("dataPortability", () => {
  beforeEach(() => {
    installFakeLocalStorage();
  });

  it("round-trips every known storage key through export, serialize, parse and import", () => {
    writeStoredValue(storageKeys.modules, [{ id: "m1", name: "Databases", credits: 5 }]);
    writeStoredValue(storageKeys.studyBlocks, [{ id: "b1", assignmentId: "a1", date: "2026-08-20", start: "09:00", end: "10:00", taskId: "t1", taskName: "Draft" }]);

    const exportPayload = buildPlanAroundExport();
    expect(exportPayload.version).toBe(1);
    expect(exportPayload.data[storageKeys.modules]).toEqual([{ id: "m1", name: "Databases", credits: 5 }]);

    const json = serializePlanAroundExport(exportPayload);
    const parsed = parsePlanAroundExport(json);
    expect(parsed).not.toBeNull();

    writeStoredValue(storageKeys.modules, []);
    writeStoredValue(storageKeys.studyBlocks, []);

    applyPlanAroundImport(parsed!);

    expect(readStoredValue(storageKeys.modules, [])).toEqual([{ id: "m1", name: "Databases", credits: 5 }]);
    expect(readStoredValue(storageKeys.studyBlocks, [])).toEqual([
      { id: "b1", assignmentId: "a1", date: "2026-08-20", start: "09:00", end: "10:00", taskId: "t1", taskName: "Draft" },
    ]);
  });

  it("rejects invalid JSON and malformed payloads", () => {
    expect(parsePlanAroundExport("not json")).toBeNull();
    expect(parsePlanAroundExport(JSON.stringify({ version: 1 }))).toBeNull();
    expect(parsePlanAroundExport(JSON.stringify({ data: null }))).toBeNull();
  });

  it("only writes back recognised storage keys, ignoring unrelated ones", () => {
    const parsed = parsePlanAroundExport(JSON.stringify({ version: 1, exportedAt: "now", data: { "some.unknown.key": "x", [storageKeys.commitments]: [{ id: "c1" }] } }));
    expect(parsed).not.toBeNull();

    applyPlanAroundImport(parsed!);

    expect(readStoredValue(storageKeys.commitments, [])).toEqual([{ id: "c1" }]);
    expect(readStoredValue("some.unknown.key", null)).toBeNull();
  });
});
