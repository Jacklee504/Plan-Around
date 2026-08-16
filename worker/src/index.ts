import {
  analysisSystemPrompt,
  createAnalysisPrompt,
  MAX_BRIEF_CHARACTERS,
  type AssignmentAnalysis,
  type AssignmentAnalysisResponse,
  validateAssignmentAnalysis,
} from "../../lib/assignmentAnalysis";

const MAX_REQUEST_BYTES = 25_000;
const MAX_UPSTREAM_RESPONSE_BYTES = 100_000;

type ChatMessage = { role: "system" | "user"; content: string };

class ClientInputError extends Error {}

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

function jsonResponse(body: unknown, status: number, origin: string | null, env: Env) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders(origin, env) });
}

async function readBoundedText(stream: ReadableStream<Uint8Array> | null, maxBytes: number) {
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
      if (totalBytes > maxBytes) throw new ClientInputError("Request body is too large.");
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

async function requestProvider(messages: ChatMessage[], env: Env, upstreamFetch: typeof fetch) {
  if (!env.FEATHERLESS_API_KEY) throw new Error("AI provider is not configured.");

  const response = await upstreamFetch(`${env.AI_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.FEATHERLESS_API_KEY}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://jacklee504.github.io/PlanAround/",
      "X-Title": "PlanAround",
    },
    body: JSON.stringify({
      model: env.AI_MODEL,
      temperature: 0.1,
      max_tokens: 1200,
      response_format: { type: "json_object" },
      chat_template_kwargs: { enable_thinking: false },
      messages,
    }),
  });

  if (!response.ok) throw new Error("AI provider request failed.");
  return contentFromProviderPayload(JSON.parse(await readBoundedText(response.body, MAX_UPSTREAM_RESPONSE_BYTES)));
}

async function analyseBrief(briefText: string, env: Env, upstreamFetch: typeof fetch) {
  const messages: ChatMessage[] = [
    { role: "system", content: analysisSystemPrompt },
    { role: "user", content: createAnalysisPrompt(briefText) },
  ];

  const firstContent = await requestProvider(messages, env, upstreamFetch);
  try {
    return parseAnalysis(firstContent);
  } catch {
    const repairedMessages: ChatMessage[] = [
      ...messages,
      { role: "user", content: "Your previous response was invalid. Return only the exact requested JSON object, following every schema rule." },
    ];
    return parseAnalysis(await requestProvider(repairedMessages, env, upstreamFetch));
  }
}

export function createWorker(upstreamFetch: typeof fetch = fetch) {
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
        const briefText = parseBriefRequest(await readBoundedText(request.body, MAX_REQUEST_BYTES));
        const analysis = await analyseBrief(briefText, env, upstreamFetch);
        const response: AssignmentAnalysisResponse = { analysis, provider: "featherless", model: env.AI_MODEL };
        return jsonResponse(response, 200, origin, env);
      } catch (error) {
        if (error instanceof ClientInputError) return jsonResponse({ error: error.message }, 400, origin, env);
        return jsonResponse({ error: "The analyser could not read this brief." }, 502, origin, env);
      }
    },
  } satisfies ExportedHandler<Env>;
}

export default createWorker();
