const baseUrl = process.env.AI_BASE_URL?.trim() || "https://api.featherless.ai/v1";
const primaryModel = process.env.AI_PRIMARY_MODEL?.trim() || "Qwen/Qwen3-VL-30B-A3B-Instruct";
const apiKey = process.env.FEATHERLESS_API_KEY?.trim();

export type JsonObject = Record<string, unknown>;

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}

async function fetchJson(path: string): Promise<JsonObject> {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!response.ok) {
    throw new Error(`${path} returned ${response.status}`);
  }
  const body = await response.json();
  if (!body || typeof body !== "object") throw new Error(`${path} returned an unexpected response shape.`);
  return body as JsonObject;
}

export type PlanSummary = {
  name: string | undefined;
  contextCeiling: number | undefined;
  concurrency: number | undefined;
};

export function interpretPlan(plan: JsonObject): PlanSummary {
  const limits = plan.limits as JsonObject | undefined;
  return {
    name: asString(plan.name) ?? asString(plan.id),
    // Featherless has been observed to report this as max_context_length
    // rather than the originally assumed max_context/limits.max_context.
    contextCeiling: asNumber(plan.max_context_length) ?? asNumber(plan.max_context) ?? asNumber(limits?.max_context),
    concurrency: asNumber(plan.concurrency) ?? asNumber(limits?.concurrency),
  };
}

export type ModelAvailability = {
  found: boolean;
  // undefined when the provider response doesn't expose an availability field
  // at all - not the same as a confirmed "unavailable".
  available: boolean | undefined;
  status: string | undefined;
};

export function interpretModelAvailability(models: JsonObject, modelId: string): ModelAvailability {
  const list = Array.isArray(models.data) ? models.data : Array.isArray(models.models) ? models.models : [];
  const found = list.find((entry) => entry && typeof entry === "object" && asString((entry as JsonObject).id) === modelId) as
    | JsonObject
    | undefined;

  if (!found) return { found: false, available: undefined, status: undefined };

  const availableOnPlan = found.available_on_current_plan;
  return {
    found: true,
    available: typeof availableOnPlan === "boolean" ? availableOnPlan : undefined,
    status: asString(found.status) ?? asString(found.availability),
  };
}

// A missing model, or one explicitly reported unavailable, must fail the
// preflight - a demo/release check that can silently exit 0 while the
// configured production model is unreachable is worse than no check at all.
export function modelPassesPreflight(model: ModelAvailability) {
  return model.found && model.available !== false;
}

// A malformed or empty `/plan` body (e.g. `{}`) must also fail: it means the
// provider did not actually return recognizable account state, which is just
// as unusable for a release check as a request that errored outright.
export function planPassesPreflight(plan: PlanSummary) {
  return Boolean(plan.name);
}

function reportPlan(plan: PlanSummary) {
  console.log("Plan:");
  console.log(`  name/id: ${plan.name ?? "(not reported)"}`);
  console.log(`  context ceiling: ${plan.contextCeiling ?? "(not reported)"}`);
  console.log(`  concurrency: ${plan.concurrency ?? "(not reported)"}`);
}

function reportModel(model: ModelAvailability, modelId: string) {
  console.log(`Primary model (${modelId}):`);
  console.log(`  found: ${model.found ? "yes" : "no"}`);
  if (model.found) {
    console.log(`  available on current plan: ${model.available === undefined ? "(not reported)" : model.available ? "yes" : "no"}`);
    console.log(`  status: ${model.status ?? "(not reported)"}`);
  }
}

async function main() {
  if (!apiKey) {
    console.error("FEATHERLESS_API_KEY must be set in the shell environment to run this preflight.");
    process.exit(1);
  }

  console.log(`Featherless provider preflight against ${baseUrl}`);
  console.log("");

  try {
    const plan = interpretPlan(await fetchJson("/plan"));
    reportPlan(plan);
    if (!planPassesPreflight(plan)) {
      console.error("");
      console.error("Plan response did not include a recognizable name or id.");
      process.exitCode = 1;
    }
  } catch (error) {
    console.error(`Could not read plan/account state: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }

  console.log("");

  try {
    const model = interpretModelAvailability(await fetchJson("/models"), primaryModel);
    reportModel(model, primaryModel);
    if (!modelPassesPreflight(model)) {
      console.error("");
      console.error(model.found ? "Primary model is not available on the current plan." : "Primary model was not returned by /models.");
      process.exitCode = 1;
    }
  } catch (error) {
    console.error(`Could not read model availability: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}

if (process.env.VITEST !== "true") {
  main().catch((error) => {
    console.error("Provider preflight crashed:", error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
