import type { Module } from "@/types";

function normaliseModuleValue(value: string) {
  return value.normalize("NFKC").replace(/&/g, " and ").replace(/[^a-z0-9]/gi, "").toLocaleLowerCase();
}

function uniqueMatch(modules: Module[], matches: (module: Module) => boolean) {
  const results = modules.filter(matches);
  return results.length === 1 ? results[0] : null;
}

export function findMatchingModule(
  modules: Module[],
  moduleCode: string | null,
  moduleName: string | null,
) {
  const normalisedCode = moduleCode ? normaliseModuleValue(moduleCode) : "";
  if (normalisedCode) {
    const byCode = uniqueMatch(
      modules,
      (module) => Boolean(module.code) && normaliseModuleValue(module.code!) === normalisedCode,
    );
    if (byCode) return byCode;
  }

  const normalisedName = moduleName ? normaliseModuleValue(moduleName) : "";
  if (!normalisedName) return null;
  return uniqueMatch(modules, (module) => normaliseModuleValue(module.name) === normalisedName);
}
