import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import {
  analysisSystemPrompt,
  createAnalysisPrompt,
  createTextAnalysisProvenance,
  MAX_BRIEF_CHARACTERS,
  type AssignmentAnalysis,
  validateAssignmentAnalysis,
} from "../lib/assignmentAnalysis";

const port = Number(process.env.ANALYZER_PORT ?? 8787);
const ollamaUrl = "http://127.0.0.1:11434/v1/chat/completions";
const model = process.env.OLLAMA_MODEL ?? "qwen3.5:9b";
const maxBodyBytes = 25_000;

type ChatCompletionResponse = { choices?: Array<{ message?: { content?: string } }> };

function setCors(response: ServerResponse, request: IncomingMessage) {
  const origin = request.headers.origin;
  if (origin === "http://localhost:3000") response.setHeader("Access-Control-Allow-Origin", origin);
  response.setHeader("Vary", "Origin");
  response.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function respond(response: ServerResponse, status: number, body: unknown) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  response.end(JSON.stringify(body));
}

async function readJsonBody(request: IncomingMessage): Promise<{ briefText: string }> {
  let body = "";
  for await (const chunk of request) {
    body += chunk;
    if (body.length > maxBodyBytes) throw new Error("Body too large");
  }
  const payload = JSON.parse(body) as { briefText?: unknown };
  if (typeof payload.briefText !== "string" || !payload.briefText.trim() || payload.briefText.length > MAX_BRIEF_CHARACTERS) {
    throw new Error("Invalid assignment brief");
  }
  return { briefText: payload.briefText };
}

function contentFromCompletion(payload: ChatCompletionResponse) {
  const content = payload.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) throw new Error("Missing model response");
  return content.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
}

async function requestAnalysis(briefText: string, correction?: string): Promise<AssignmentAnalysis> {
  const response = await fetch(ollamaUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      temperature: 0.1,
      max_tokens: 1200,
      reasoning_effort: "none",
      stream: false,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: analysisSystemPrompt },
        { role: "user", content: createAnalysisPrompt(briefText) },
        ...(correction ? [{ role: "system", content: `Your previous response was invalid: ${correction}. Return the requested JSON object only.` }] : []),
      ],
    }),
  });
  if (!response.ok) throw new Error("Ollama unavailable");
  const completion = await response.json() as ChatCompletionResponse;
  return validateAssignmentAnalysis(JSON.parse(contentFromCompletion(completion)));
}

async function analyseWithRetry(briefText: string) {
  try {
    return await requestAnalysis(briefText);
  } catch (firstError) {
    return requestAnalysis(briefText, firstError instanceof Error ? firstError.message : "Invalid JSON");
  }
}

const server = createServer(async (request, response) => {
  setCors(response, request);
  if (request.method === "OPTIONS") return respond(response, 204, undefined);
  if (request.method !== "POST" || request.url !== "/analyze" || request.headers.origin && request.headers.origin !== "http://localhost:3000") {
    return respond(response, 404, { error: "Not found" });
  }

  try {
    const { briefText } = await readJsonBody(request);
    const analysis = await analyseWithRetry(briefText);
    return respond(response, 200, {
      analysis,
      provenance: createTextAnalysisProvenance(briefText, analysis),
      provider: "local-ollama",
      model,
      verifier: { used: false, model: null, reasons: [] },
    });
  } catch {
    return respond(response, 502, { error: "Analysis unavailable" });
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`PlanAround local analyser listening at http://localhost:${port}/analyze using ${model}`);
});
