const baseUrl = process.env.AI_BASE_URL?.trim() || "https://api.featherless.ai/v1";
const primaryModel = process.env.AI_PRIMARY_MODEL?.trim() || "Qwen/Qwen3-VL-30B-A3B-Instruct";
const apiKey = process.env.FEATHERLESS_API_KEY?.trim();

type JsonObject = Record<string, unknown>;

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

function reportPlan(plan: JsonObject) {
  console.log("Plan:");
  console.log(`  name/id: ${asString(plan.name) ?? asString(plan.id) ?? "(not reported)"}`);
  const contextCeiling = asNumber(plan.max_context) ?? asNumber((plan.limits as JsonObject | undefined)?.max_context);
  console.log(`  context ceiling: ${contextCeiling ?? "(not reported)"}`);
  const concurrency = asNumber(plan.concurrency) ?? asNumber((plan.limits as JsonObject | undefined)?.concurrency);
  console.log(`  concurrency: ${concurrency ?? "(not reported)"}`);
}

function reportModel(models: JsonObject) {
  const list = Array.isArray(models.data) ? models.data : Array.isArray(models.models) ? models.models : [];
  const found = list.find((entry) => entry && typeof entry === "object" && asString((entry as JsonObject).id) === primaryModel) as
    | JsonObject
    | undefined;

  console.log(`Primary model (${primaryModel}):`);
  console.log(`  found: ${found ? "yes" : "no"}`);
  if (found) {
    const status = asString(found.status) ?? asString(found.availability);
    console.log(`  status: ${status ?? "(not reported)"}`);
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
    reportPlan(await fetchJson("/plan"));
  } catch (error) {
    console.error(`Could not read plan/account state: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }

  console.log("");

  try {
    reportModel(await fetchJson("/models"));
  } catch (error) {
    console.error(`Could not read model availability: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("Provider preflight crashed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
