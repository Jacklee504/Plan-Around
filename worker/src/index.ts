import {
  analysisSystemPrompt,
  createAnalysisPrompt,
  createImageAnalysisPrompt,
  createImageAnalysisProvenance,
  createTextAnalysisProvenance,
  type AssignmentAnalysisInput,
  MAX_ANALYSIS_COMPLETION_TOKENS,
  type AssignmentAnalysis,
  type AssignmentAnalysisResponse,
  validateAssignmentAnalysis,
  validateAssignmentAnalysisInput,
} from "../../lib/assignmentAnalysis";
import {
  createTimetableImageAnalysisPrompt,
  MAX_TIMETABLE_COMPLETION_TOKENS,
  timetableAnalysisSystemPrompt,
  type TimetableAnalysis,
  type TimetableAnalysisResponse,
  type TimetableAnalysisInput,
  validateTimetableAnalysis,
} from "../../lib/timetableAnalysis";

const MAX_TEXT_REQUEST_BYTES = 25_000;
const MAX_IMAGE_REQUEST_BYTES = 2_100_000;
const MAX_UPSTREAM_RESPONSE_BYTES = 100_000;
const ANALYSIS_TIMEOUT_MS = 60_000;
const PROVIDER_TIMEOUT_MS = 50_000;
const PROVIDER_RETRY_DELAY_MS = 500;
const MIN_PROVIDER_WINDOW_MS = 1_000;
const MAX_PROVIDER_CALLS = 3;
const RETRYABLE_PROVIDER_STATUSES = new Set([429, 500, 502, 503, 504]);

type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string | Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }>;
};

type TimetableAnalysisSource =
  | TimetableAnalysisInput
  | { kind: "image-batch"; images: TimetableAnalysisInput[] };
type AnalysisSource = AssignmentAnalysisInput | TimetableAnalysisSource;

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
  return (
    origin === env.ALLOWED_PRODUCTION_ORIGIN ||
    // HA1 production origin.
    origin === "https://plan-around.vercel.app" ||
    // HA2 production origin.
    origin === "https://planaround.vercel.app" ||
    origin === "https://jacklee504.github.io" ||
    origin === "http://localhost:3000"
  );
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

function parseRequestPayload(body: string) {
  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    throw new ClientInputError("Request body must be valid JSON.");
  }

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new ClientInputError("Request body was invalid.");
  }
  return payload as { source?: unknown; sources?: unknown };
}

function parseAnalysisRequest(body: string) {
  const payload = parseRequestPayload(body);

  let source: AssignmentAnalysisInput;
  try {
    source = validateAssignmentAnalysisInput(payload.source);
  } catch (error) {
    throw new ClientInputError(error instanceof Error ? error.message : "Analysis input was invalid.");
  }

  const bodyBytes = new TextEncoder().encode(body).byteLength;
  if (source.kind === "text" && bodyBytes > MAX_TEXT_REQUEST_BYTES) {
    throw new ClientInputError("Text analysis request is too large.");
  }
  if (source.kind === "image" && bodyBytes > MAX_IMAGE_REQUEST_BYTES) {
    throw new ClientInputError("Screenshot analysis request is too large.");
  }
  return source;
}

function parseTimetableAnalysisRequest(body: string): TimetableAnalysisSource {
  const payload = parseRequestPayload(body);
  if (Array.isArray(payload.sources)) {
    if (payload.sources.length < 2 || payload.sources.length > 7) {
      throw new ClientInputError("A timetable grid must contain between 2 and 7 weekday panels.");
    }
    const images = payload.sources.map((source, index) => {
      let image: AssignmentAnalysisInput;
      try {
        image = validateAssignmentAnalysisInput(source);
      } catch (error) {
        throw new ClientInputError(
          error instanceof Error ? `Timetable panel ${index + 1}: ${error.message}` : "Timetable panel was invalid.",
        );
      }
      if (image.kind !== "image") throw new ClientInputError("A timetable panel must be a screenshot.");
      return image;
    });
    return { kind: "image-batch", images };
  }

  let source: AssignmentAnalysisInput;
  try {
    source = validateAssignmentAnalysisInput(payload.source);
  } catch (error) {
    throw new ClientInputError(error instanceof Error ? error.message : "Analysis input was invalid.");
  }
  if (source.kind !== "image") throw new ClientInputError("A timetable screenshot is required.");
  return source;
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

function parseAssignmentAnalysis(content: string): AssignmentAnalysis {
  return validateAssignmentAnalysis(JSON.parse(stripJsonCodeFence(content)));
}

async function requestProviderOnce(
  messages: ChatMessage[],
  env: Env,
  model: string,
  upstreamFetch: typeof fetch,
  budget: AnalysisBudget,
  completionTokens: number,
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
        "HTTP-Referer": "https://planaround.vercel.app/",
        "X-Title": "PlanAround",
      },
      body: JSON.stringify({
        model,
        temperature: 0.1,
        max_tokens: completionTokens,
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
      const content = contentFromProviderPayload(JSON.parse(providerBody));
      console.log("Featherless timetable output:", content);
      return content;
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
  model: string,
  upstreamFetch: typeof fetch,
  pause: Wait,
  budget: AnalysisBudget,
  completionTokens: number,
) {
  try {
    return await requestProviderOnce(messages, env, model, upstreamFetch, budget, completionTokens);
  } catch (error) {
    if (!(error instanceof TransientProviderError)) throw error;
    await budget.pauseBeforeRetry(pause);
    return requestProviderOnce(messages, env, model, upstreamFetch, budget, completionTokens);
  }
}

type AnalysisRoute<T> = {
  pathname: "/analyze" | "/analyze-timetable";
  systemPrompt: string;
  completionTokens: number;
  imagePrompt: () => string;
  parse: (content: string) => T;
  model: (env: Env) => string;
  repairPrompt: (validationError: string) => string;
  errorMessage: string;
  allowsText: boolean;
};

const assignmentRoute: AnalysisRoute<AssignmentAnalysis> = {
  pathname: "/analyze",
  systemPrompt: analysisSystemPrompt,
  completionTokens: MAX_ANALYSIS_COMPLETION_TOKENS,
  imagePrompt: createImageAnalysisPrompt,
  parse: parseAssignmentAnalysis,
  model: (env) => env.AI_PRIMARY_MODEL,
  repairPrompt: (validationError) =>
    `The previous response failed validation: ${validationError}\n\n` +
    "Start again. Return only compact valid JSON matching the schema. " +
    "Complexity must be exactly 1, 2 or 3. " +
    "Requirements must always be a JSON array of strings, or an empty array. " +
    "Keep rationales under 25 words, use at most 4 short requirements per task, " +
    "use YYYY-MM-DD for the deadline, and do not add commentary.",
  errorMessage: "The analyser could not read this brief.",
  allowsText: true,
};

const timetableRoute: AnalysisRoute<TimetableAnalysis> = {
  pathname: "/analyze-timetable",
  systemPrompt: timetableAnalysisSystemPrompt,
  completionTokens: MAX_TIMETABLE_COMPLETION_TOKENS,
  imagePrompt: createTimetableImageAnalysisPrompt,
  parse: (content) => validateTimetableAnalysis(JSON.parse(stripJsonCodeFence(content))),
  model: (env) => env.AI_TIMETABLE_MODEL,
  repairPrompt: (validationError) =>
    `The previous timetable response failed validation: ${validationError}\n\n` +
    "Start again from the supplied timetable panel(s). Return only compact valid JSON with entries and warnings arrays. " +
    "Each entry needs a full weekday name, HH:MM start and end, and an end after its start. " +
    "Use each panel's header and horizontal grid lines; preserve multi-hour blocks and do not invent sessions.",
  errorMessage: "The analyser could not read this timetable.",
  allowsText: false,
};

function createMessages(source: AnalysisSource, route: AnalysisRoute<unknown>): ChatMessage[] {
  const userContent = source.kind === "text"
    ? createAnalysisPrompt(source.text)
    : (() => {
      const images = source.kind === "image-batch" ? source.images : [source];
      return [
        { type: "text" as const, text: route.imagePrompt() },
        ...images.flatMap((image, index) => [
          ...(images.length > 1 ? [{ type: "text" as const, text: `Weekday panel ${index + 1}:` }] : []),
          { type: "image_url" as const, image_url: { url: `data:${image.mimeType};base64,${image.base64}` } },
        ]),
      ];
    })();
  return [
    { role: "system", content: route.systemPrompt },
    { role: "user", content: userContent },
  ];
}

async function analyseSource<T>(source: AnalysisSource, route: AnalysisRoute<T>, env: Env, upstreamFetch: typeof fetch, pause: Wait) {
  const budget = new AnalysisBudget();
  const messages = createMessages(source, route);
  const model = route.model(env);

  try {
    const firstContent = await requestProvider(
      messages,
      env,
      model,
      upstreamFetch,
      pause,
      budget,
      route.completionTokens,
    );

    try {
      return route.parse(firstContent);
    } catch (firstError) {
      const validationError =
        firstError instanceof Error
          ? firstError.message
          : String(firstError);

      console.error(
        "First analysis response rejected:",
        validationError,
      );

      const repairedMessages: ChatMessage[] = [
        ...messages,
        {
          role: "user",
          content: route.repairPrompt(validationError),
        },
      ];

      try {
        return route.parse(
          await requestProvider(
            repairedMessages,
            env,
            model,
            upstreamFetch,
            pause,
            budget,
            route.completionTokens,
          ),
        );
      } catch (repairError) {
        console.error(
          "Repair analysis failed:",
          repairError instanceof Error
            ? repairError.message
            : String(repairError),
        );

        throw repairError;
      }
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

      if (url.pathname === "/health") {
        if (origin && !isAllowedOrigin(origin, env)) return jsonResponse({ error: "Origin is not allowed." }, 403, null, env);
        if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(origin, env) });
        if (request.method !== "GET") return jsonResponse({ error: "Not found." }, 404, origin, env);
        return jsonResponse({ ok: true, service: "planaround-ai" }, 200, origin, env);
      }

      const route = url.pathname === assignmentRoute.pathname
        ? assignmentRoute
        : url.pathname === timetableRoute.pathname
          ? timetableRoute
          : null;

      if (!route) return jsonResponse({ error: "Not found." }, 404, origin, env);
      if (origin && !isAllowedOrigin(origin, env)) return jsonResponse({ error: "Origin is not allowed." }, 403, null, env);
      if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(origin, env) });
      if (request.method !== "POST") return jsonResponse({ error: "Not found." }, 404, origin, env);

      const contentLength = Number(request.headers.get("Content-Length"));
      if (Number.isFinite(contentLength) && contentLength > MAX_IMAGE_REQUEST_BYTES) {
        return jsonResponse({ error: "Request body is too large." }, 400, origin, env);
      }

      try {
        if (!(await canAnalyse(request, env))) {
          return jsonResponse({ error: "Too many analysis requests. Please try again in a minute." }, 429, origin, env);
        }
        const requestBody = await readBoundedText(
          request.body,
          MAX_IMAGE_REQUEST_BYTES,
          () => new ClientInputError("Request body is too large."),
        );
        if (route === assignmentRoute) {
          const source = parseAnalysisRequest(requestBody);
          const analysis = await analyseSource(source, assignmentRoute, env, upstreamFetch, pause);
          const response: AssignmentAnalysisResponse = {
            analysis,
            provenance: source.kind === "text"
              ? createTextAnalysisProvenance(source.text, analysis)
              : createImageAnalysisProvenance(analysis),
            provider: "featherless",
            model: assignmentRoute.model(env),
            verifier: { used: false, model: null, reasons: [] },
          };
          return jsonResponse(response, 200, origin, env);
        }

        const source = parseTimetableAnalysisRequest(requestBody);
        const analysis = await analyseSource(source, timetableRoute, env, upstreamFetch, pause);
        const response: TimetableAnalysisResponse = {
          analysis,
          provider: "featherless",
          model: timetableRoute.model(env),
          verifier: { used: false, model: null, reasons: [] },
        };
        return jsonResponse(response, 200, origin, env);
      } catch (error) {
        console.error(JSON.stringify({
          event: "analysis_request_failed",
          route: route.pathname,
          error: error instanceof Error ? error.message : "Unknown analysis error.",
        }));
        if (error instanceof ClientInputError) return jsonResponse({ error: error.message }, 400, origin, env);
        return jsonResponse({ error: route.errorMessage }, 502, origin, env);
      }
    },
  } satisfies ExportedHandler<Env>;
}

export default createWorker();
