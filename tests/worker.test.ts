import { describe, expect, it, vi } from "vitest";
import { createWorker } from "../worker/src/index";

function createTestEnv(overrides: Partial<Env> = {}): Env {
  const rateLimiter = { limit: async () => ({ success: true }) } as unknown as Env["ANALYZE_CLIENT_RATE_LIMITER"];
  return {
    AI_BASE_URL: "https://api.featherless.ai/v1",
    AI_PRIMARY_MODEL: "Qwen/Qwen3-VL-30B-A3B-Instruct",
    AI_TIMETABLE_MODEL: "Qwen/Qwen2.5-VL-72B-Instruct",
    AI_VERIFIER_MODEL: "moonshotai/Kimi-K3",
    ALLOWED_PRODUCTION_ORIGIN: "https://plan-around.vercel.app",
    FEATHERLESS_API_KEY: "test-key",
    ANALYZE_CLIENT_RATE_LIMITER: rateLimiter,
    ANALYZE_GLOBAL_RATE_LIMITER: rateLimiter,
    ...overrides,
  };
}

const workerUrl = "https://planaround-ai.example.workers.dev/health";
const allowedOrigin = "https://planaround.vercel.app";

describe("worker /health", () => {
  it("returns ok without calling the AI provider", async () => {
    const upstreamFetch = vi.fn();
    const worker = createWorker(upstreamFetch as unknown as typeof fetch);

    const response = await worker.fetch(new Request(workerUrl, { headers: { Origin: allowedOrigin } }), createTestEnv());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, service: "planaround-ai" });
    expect(upstreamFetch).not.toHaveBeenCalled();
  });

  it("answers CORS preflight without a body", async () => {
    const worker = createWorker(vi.fn() as unknown as typeof fetch);

    const response = await worker.fetch(
      new Request(workerUrl, { method: "OPTIONS", headers: { Origin: allowedOrigin } }),
      createTestEnv(),
    );

    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(allowedOrigin);
  });

  it("rejects disallowed origins", async () => {
    const worker = createWorker(vi.fn() as unknown as typeof fetch);

    const response = await worker.fetch(
      new Request(workerUrl, { headers: { Origin: "https://evil.example.com" } }),
      createTestEnv(),
    );

    expect(response.status).toBe(403);
  });

  it("rejects methods other than GET/OPTIONS", async () => {
    const worker = createWorker(vi.fn() as unknown as typeof fetch);

    const response = await worker.fetch(
      new Request(workerUrl, { method: "POST", headers: { Origin: allowedOrigin } }),
      createTestEnv(),
    );

    expect(response.status).toBe(404);
  });

  it("still works with no Origin header", async () => {
    const worker = createWorker(vi.fn() as unknown as typeof fetch);

    const response = await worker.fetch(new Request(workerUrl), createTestEnv());

    expect(response.status).toBe(200);
  });
});

describe("worker unknown routes", () => {
  it("returns 404 for unrecognised paths", async () => {
    const worker = createWorker(vi.fn() as unknown as typeof fetch);

    const response = await worker.fetch(
      new Request("https://planaround-ai.example.workers.dev/nope", { headers: { Origin: allowedOrigin } }),
      createTestEnv(),
    );

    expect(response.status).toBe(404);
  });
});
