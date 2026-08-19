import { validateAssignmentAnalysisResponse } from "../lib/assignmentAnalysis";

const frontendUrl = (process.env.PLANAROUND_FRONTEND_URL?.trim() || "https://planaround.vercel.app/").replace(/\/+$/, "") + "/";
const analyzerUrl = process.env.PLANAROUND_ANALYZER_URL?.trim() || "https://planaround-ai.0jacklee05.workers.dev/analyze";
const healthUrl = new URL("/health", analyzerUrl).toString();
const runAi = process.env.SMOKE_RUN_AI === "1";

type CheckResult = { name: string; ok: boolean; detail: string };

async function checkFrontend(): Promise<CheckResult> {
  const response = await fetch(frontendUrl);
  return {
    name: "Frontend reachable",
    ok: response.ok,
    detail: `${response.status} from ${frontendUrl}`,
  };
}

async function checkWorkerHealth(): Promise<CheckResult> {
  const response = await fetch(healthUrl);
  const body = response.ok ? await response.json().catch(() => null) : null;
  const ok = response.status === 200 && !!body && typeof body === "object" && (body as { ok?: unknown }).ok === true;
  return {
    name: "Worker /health",
    ok,
    detail: `${response.status} from ${healthUrl}`,
  };
}

async function checkInvalidRequestIsRejected(): Promise<CheckResult> {
  const response = await fetch(analyzerUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ source: { kind: "not-a-real-kind" } }),
  });
  return {
    name: "Analyzer rejects an invalid request without a provider call",
    ok: response.status === 400,
    detail: `${response.status} from ${analyzerUrl}`,
  };
}

async function checkRealAiRequest(): Promise<CheckResult> {
  const response = await fetch(analyzerUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      source: {
        kind: "text",
        text:
          "Coursework: Database Design Report. Deadline 2026-11-14. Worth 40% of the module. " +
          "Task 1 (60 marks): design a normalised schema. Task 2 (40 marks): write a 500-word justification.",
      },
    }),
  });

  if (!response.ok) {
    return { name: "Real AI smoke request", ok: false, detail: `${response.status} from ${analyzerUrl}` };
  }

  const payload = await response.json();
  try {
    const parsed = validateAssignmentAnalysisResponse(payload);
    const ok = parsed.provider === "featherless" && typeof parsed.model === "string" && parsed.model.length > 0;
    return {
      name: "Real AI smoke request",
      ok,
      detail: `provider=${parsed.provider} model=${parsed.model}`,
    };
  } catch (error) {
    return {
      name: "Real AI smoke request",
      ok: false,
      detail: `Response failed structural validation: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

async function main() {
  console.log(`Production smoke test${runAi ? " (including one real AI request)" : ""}`);
  console.log(`  Frontend: ${frontendUrl}`);
  console.log(`  Analyzer: ${analyzerUrl}`);
  console.log("");

  const checks = [checkFrontend, checkWorkerHealth, checkInvalidRequestIsRejected, ...(runAi ? [checkRealAiRequest] : [])];

  let allOk = true;
  for (const check of checks) {
    const result = await check();
    allOk = allOk && result.ok;
    console.log(`  ${result.ok ? "PASS" : "FAIL"}  ${result.name} - ${result.detail}`);
  }

  console.log("");
  if (!runAi) {
    console.log("Skipped the real AI request. Set SMOKE_RUN_AI=1 to spend one Featherless call and verify it end-to-end.");
  }

  if (!allOk) {
    console.error("Production smoke test failed.");
    process.exit(1);
  }
  console.log("Production smoke test passed.");
}

main().catch((error) => {
  console.error("Production smoke test crashed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
