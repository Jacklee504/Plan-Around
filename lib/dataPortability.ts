import { readStoredValue, storageKeys, writeStoredValue } from "./storage";

export const DATA_EXPORT_VERSION = 1;

export type PlanAroundExport = {
  version: number;
  exportedAt: string;
  data: Record<string, unknown>;
};

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
 * Only structural validation - this never runs the imported data through
 * per-type checks. A malformed value simply fails to load in whichever
 * workspace reads it, the same way hand-edited localStorage would.
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
  return {
    version: typeof candidate.version === "number" ? candidate.version : 0,
    exportedAt: typeof candidate.exportedAt === "string" ? candidate.exportedAt : "",
    data: candidate.data,
  };
}

/**
 * Writes back only recognised storage keys present in the import, so an
 * export from a newer/older PlanAround version degrades gracefully instead
 * of throwing away unrelated localStorage keys or crashing on unknown ones.
 */
export function applyPlanAroundImport(exportPayload: PlanAroundExport) {
  Object.values(storageKeys).forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(exportPayload.data, key)) {
      writeStoredValue(key, exportPayload.data[key]);
    }
  });
}
