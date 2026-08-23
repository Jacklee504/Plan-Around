import { readStoredValue, storageKeys, writeStoredValue } from "./storage";

export const DATA_EXPORT_VERSION = 1;

export type PlanAroundExport = {
  version: number;
  exportedAt: string;
  data: Record<string, unknown>;
};

type StoredValueShape = "array" | "object" | "boolean" | "string";

/**
 * The broad runtime shape each recognised key's stored value must have.
 * Deliberately shallow - this is a guard against a structurally wrong value
 * (e.g. an object where every reader expects an array) reaching localStorage
 * and breaking hydration on the next load, not a full per-field schema.
 */
const storageKeyShapes: Record<string, StoredValueShape> = {
  [storageKeys.modules]: "array",
  [storageKeys.commitments]: "array",
  [storageKeys.timetableEntries]: "array",
  [storageKeys.datedCommitments]: "array",
  [storageKeys.onboarding]: "object",
  [storageKeys.assignments]: "array",
  [storageKeys.activeAssignmentId]: "string",
  [storageKeys.studyBlocks]: "array",
  [storageKeys.planSnapshots]: "object",
  [storageKeys.planningPreferences]: "object",
  [storageKeys.notificationsEnabled]: "boolean",
};

/**
 * `null` is always accepted regardless of shape: buildPlanAroundExport uses
 * it as the "this key was never set on the source device" sentinel, so a
 * genuine partial export must round-trip. applyPlanAroundImport treats it
 * the same way readStoredValue treats an absent key - see there.
 */
function matchesShape(value: unknown, shape: StoredValueShape): boolean {
  if (value === null) return true;
  switch (shape) {
    case "array":
      return Array.isArray(value);
    case "object":
      return typeof value === "object" && !Array.isArray(value);
    case "boolean":
      return typeof value === "boolean";
    case "string":
      return typeof value === "string";
  }
}

/**
 * Reads every known PlanAround localStorage key into one portable JSON
 * document, so a device's data can be backed up or moved without an account.
 */
export function buildPlanAroundExport(): PlanAroundExport {
  const data: Record<string, unknown> = {};
  Object.values(storageKeys).forEach((key) => {
    data[key] = readStoredValue<unknown>(key, null);
  });

  return {
    version: DATA_EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    data,
  };
}

export function serializePlanAroundExport(exportPayload: PlanAroundExport) {
  return JSON.stringify(exportPayload, null, 2);
}

/**
 * Structural validation, plus a broad shape check (array/object/boolean) on
 * every recognised key's value - not a full schema, but enough to reject a
 * corrupt/hand-edited backup up front rather than writing a wrong-shaped
 * value into localStorage that then breaks hydration on the next load.
 * The whole import is rejected if any recognised key fails its shape check;
 * unrecognised keys are left for applyPlanAroundImport to ignore as before.
 */
export function parsePlanAroundExport(json: string): PlanAroundExport | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return null;
  }

  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !("data" in parsed) ||
    typeof (parsed as { data: unknown }).data !== "object" ||
    (parsed as { data: unknown }).data === null
  ) {
    return null;
  }

  const candidate = parsed as PlanAroundExport;
  const data = candidate.data;

  for (const [key, shape] of Object.entries(storageKeyShapes)) {
    if (Object.prototype.hasOwnProperty.call(data, key) && !matchesShape(data[key], shape)) {
      return null;
    }
  }

  return {
    version: typeof candidate.version === "number" ? candidate.version : 0,
    exportedAt: typeof candidate.exportedAt === "string" ? candidate.exportedAt : "",
    data,
  };
}

/**
 * Writes back only recognised storage keys present in the import, so an
 * export from a newer/older PlanAround version degrades gracefully instead
 * of throwing away unrelated localStorage keys or crashing on unknown ones.
 * A `null` value (the source device never set that key) is skipped rather
 * than written literally: readStoredValue only falls back to its default
 * for a genuinely absent key, so writing the string "null" would make every
 * future read return `null` instead of that default - the same class of
 * poisoned-state bug the shape check above exists to prevent.
 */
export function applyPlanAroundImport(exportPayload: PlanAroundExport) {
  Object.values(storageKeys).forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(exportPayload.data, key) && exportPayload.data[key] !== null) {
      writeStoredValue(key, exportPayload.data[key]);
    }
  });
}
