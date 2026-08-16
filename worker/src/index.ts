import {
  analysisSystemPrompt,
  createAnalysisPrompt,
  createTextAnalysisProvenance,
  MAX_BRIEF_CHARACTERS,
  type AssignmentAnalysis,
  type AssignmentAnalysisResponse,
  validateAssignmentAnalysis,
} from "../../lib/assignmentAnalysis";

const MAX_REQUEST_BYTES = 25_000;
const MAX_UPSTREAM_RESPONSE_BYTES = 100_000;
const ANALYSIS_TIMEOUT_MS = 30_000;
const PROVIDER_TIMEOUT_MS = 25_000;
const PROVIDER_RETRY_DELAY_MS = 500;
const MIN_PROVIDER_WINDOW_MS = 1_000;
const MAX_PROVIDER_CALLS = 3;
const RETRYABLE_PROVIDER_STATUSES = new Set([429, 500, 502, 503, 504]);

type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

class ClientInputError extends Error {}
class ProviderResponseError extends Error {}
class TransientProviderError extends Error {}
class AnalysisBudgetError extends Error {}

type Wait = (milliseconds: number) => Promise<void>;

function wait(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

class AnalysisBudget {
  readonly controller = new AbortController();
  readonly deadline = Date.now() + ANALYSIS_TIMEOUT_MS;
  providerCalls = 0;
  private readonly timeout = setTimeout(() => this.controller.abort(), ANALYSIS_TIMEOUT_MS);

  remainingMilliseconds() {
    return Math.max(0, this.deadline - Date.now());
  }

  isExhausted() {
    return this.controller.signal.aborted || this.remainingMilliseconds() < MIN_PROVIDER_WINDOW_MS;
  }

  takeProviderCall() {
    if (this.providerCalls >= MAX_PROVIDER_CALLS) {
      throw new AnalysisBudgetError("The analyser exhausted its provider-call budget.");
    }
    if (this.isExhausted()) {
      throw new AnalysisBudgetError("The analyser ran out of time.");
    }

    this.providerCalls += 1;
    return Math.min(PROVIDER_TIMEOUT_MS, this.remainingMilliseconds());
  }

  async pauseBeforeRetry(pause: Wait) {
    if (this.remainingMilliseconds() <= PROVIDER_RETRY_DELAY_MS + MIN_PROVIDER_WINDOW_MS) {
      throw new AnalysisBudgetError("The analyser ran out of time before retrying.");
    }
    await pause(PROVIDER_RETRY_DELAY_MS);
    if (this.isExhausted()) throw new AnalysisBudgetError("The analyser ran out of time.");
  }

  dispose() {
    clearTimeout(this.timeout);
  }
}

function corsHeaders(origin: string | null, env: Env) {
  const headers = new Headers({
    "Cache-Control": "no-store",
    "Content-Type": "application/json",
    Vary: "Origin",
  });

  if (origin && isAllowedOrigin(origin, env)) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    headers.set("Access-Control-Allow-Headers", "Content-Type");
    headers.set("Access-Control-Max-Age", "86400");
  }

  return headers;
}

function isAllowedOrigin(origin: string, env: Env) {
  return origin === env.ALLOWED_PRODUCTION_ORIGIN || origin === "http://localhost:3000";
}

function rateLimitKey(request: Request) {
  return request.headers.get("CF-Connecting-IP") || "unknown-client";
}

async function canAnalyse(request: Request, env: Env) {
  const [client, global] = await Promise.all([
    env.ANALYZE_CLIENT_RATE_LIMITER.limit({ key: rateLimitKey(request) }),
    env.ANALYZE_GLOBAL_RATE_LIMITER.limit({ key: "analyze" }),
  ]);
  return client.success && global.success;
}

function jsonResponse(body: unknown, status: number, origin: string | null, env: Env) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders(origin, env) });
}

async function readBoundedText(
  stream: ReadableStream<Uint8Array> | null,
  maxBytes: number,
  createTooLargeError: () => Error,
) {
  if (!stream) return "";

  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) throw createTooLargeError();
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(body);
}

function parseBriefRequest(body: string) {
  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    throw new ClientInputError("Request body must be valid JSON.");
  }

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new ClientInputError("Request body was invalid.");
  }

  const briefText = (payload as { briefText?: unknown }).briefText;
  if (typeof briefText !== "string" || !briefText.trim()) {
    throw new ClientInputError("A non-empty assignment brief is required.");
  }
  if (briefText.length > MAX_BRIEF_CHARACTERS) {
    throw new ClientInputError("Assignment brief is too long.");
  }
  return briefText;
}

function stripJsonCodeFence(content: string) {
  return content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
}

function contentFromProviderPayload(payload: unknown) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("Provider response was invalid.");
  const choices = (payload as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) throw new Error("Provider response had no choices.");
  const firstChoice = choices[0];
  if (!firstChoice || typeof firstChoice !== "object" || Array.isArray(firstChoice)) throw new Error("Provider response was invalid.");
  const message = (firstChoice as { message?: unknown }).message;
  if (!message || typeof message !== "object" || Array.isArray(message)) throw new Error("Provider response was invalid.");
  const content = (message as { content?: unknown }).content;
  if (typeof content !== "string" || !content.trim()) throw new Error("Provider response had no content.");
  return content;
}

function parseAnalysis(content: string): AssignmentAnalysis {
  return validateAssignmentAnalysis(JSON.parse(stripJsonCodeFence(content)));
}

async function requestProviderOnce(
  messages: ChatMessage[],
  env: Env,
  upstreamFetch: typeof fetch,
  budget: AnalysisBudget,
) {
  if (!env.FEATHERLESS_API_KEY) throw new Error("AI provider is not configured.");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), budget.takeProviderCall());
  const signal = AbortSignal.any([budget.controller.signal, controller.signal]);

  try {
    const response = await upstreamFetch(`${env.AI_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.FEATHERLESS_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://jacklee504.github.io/PlanAround/",
        "X-Title": "PlanAround",
      },
      body: JSON.stringify({
        model: env.AI_PRIMARY_MODEL,
        temperature: 0.1,
        max_tokens: 1200,
        response_format: { type: "json_object" },
        chat_template_kwargs: { enable_thinking: false },
        messages,
      }),
      signal,
    });
    if (!response.ok) {
      await response.body?.cancel();
      if (RETRYABLE_PROVIDER_STATUSES.has(response.status)) {
        throw new TransientProviderError("AI provider was temporarily unavailable.");
      }
      throw new ProviderResponseError("AI provider rejected the request.");
    }

    const providerBody = await readBoundedText(
      response.body,
      MAX_UPSTREAM_RESPONSE_BYTES,
      () => new ProviderResponseError("AI provider response was too large."),
    );

    try {
      return contentFromProviderPayload(JSON.parse(providerBody));
    } catch {
      throw new ProviderResponseError("AI provider response was invalid.");
    }
  } catch (error) {
    if (error instanceof AnalysisBudgetError || error instanceof ProviderResponseError || error instanceof TransientProviderError) throw error;
    if (budget.controller.signal.aborted || budget.remainingMilliseconds() < MIN_PROVIDER_WINDOW_MS) {
      throw new AnalysisBudgetError("The analyser ran out of time.");
    }
    throw new TransientProviderError("AI provider request did not complete.");
  } finally {
    clearTimeout(timeout);
  }
}

async function requestProvider(
  messages: ChatMessage[],
  env: Env,
  upstreamFetch: typeof fetch,
  pause: Wait,
  budget: AnalysisBudget,
) {
  try {
    return await requestProviderOnce(messages, env, upstreamFetch, budget);
  } catch (error) {
    if (!(error instanceof TransientProviderError)) throw error;
    await budget.pauseBeforeRetry(pause);
    return requestProviderOnce(messages, env, upstreamFetch, budget);
  }
}

async function analyseBrief(briefText: string, env: Env, upstreamFetch: typeof fetch, pause: Wait) {
  const budget = new AnalysisBudget();
  const messages: ChatMessage[] = [
    { role: "system", content: analysisSystemPrompt },
    { role: "user", content: createAnalysisPrompt(briefText) },
  ];

  try {
    const firstContent = await requestProvider(messages, env, upstreamFetch, pause, budget);
    try {
      return parseAnalysis(firstContent);
    } catch {
      const repairedMessages: ChatMessage[] = [
        ...messages,
        { role: "assistant", content: firstContent },
        { role: "user", content: "Your previous response was invalid. Return only the exact requested JSON object, following every schema rule." },
      ];
      return parseAnalysis(await requestProvider(repairedMessages, env, upstreamFetch, pause, budget));
    }
  } finally {
    budget.dispose();
  }
}

export function createWorker(upstreamFetch: typeof fetch = fetch, pause: Wait = wait) {
  return {
    async fetch(request: Request, env: Env): Promise<Response> {
      const url = new URL(request.url);
      const origin = request.headers.get("Origin");

      if (url.pathname !== "/analyze") return jsonResponse({ error: "Not found." }, 404, origin, env);
      if (origin && !isAllowedOrigin(origin, env)) return jsonResponse({ error: "Origin is not allowed." }, 403, null, env);
      if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(origin, env) });
      if (request.method !== "POST") return jsonResponse({ error: "Not found." }, 404, origin, env);

      const contentLength = Number(request.headers.get("Content-Length"));
      if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES) {
        return jsonResponse({ error: "Request body is too large." }, 400, origin, env);
      }

      try {
        if (!(await canAnalyse(request, env))) {
          return jsonResponse({ error: "Too many analysis requests. Please try again in a minute." }, 429, origin, env);
        }
        const requestBody = await readBoundedText(
          request.body,
          MAX_REQUEST_BYTES,
          () => new ClientInputError("Request body is too large."),
        );
        const briefText = parseBriefRequest(requestBody);
        const analysis = await analyseBrief(briefText, env, upstreamFetch, pause);
        const response: AssignmentAnalysisResponse = {
          analysis,
          provenance: createTextAnalysisProvenance(briefText, analysis),
          provider: "featherless",
          model: env.AI_PRIMARY_MODEL,
          verifier: { used: false, model: null, reasons: [] },
        };
        return jsonResponse(response, 200, origin, env);
      } catch (error) {
        if (error instanceof ClientInputError) return jsonResponse({ error: error.message }, 400, origin, env);
        return jsonResponse({ error: "The analyser could not read this brief." }, 502, origin, env);
      }
    },
  } satisfies ExportedHandler<Env>;
}

export default createWorker();
