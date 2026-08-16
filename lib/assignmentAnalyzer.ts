import {
  MAX_BRIEF_CHARACTERS,
  type AssignmentAnalysisResponse,
  validateAssignmentAnalysis,
} from "@/lib/assignmentAnalysis";

function getAnalyzerUrl() {
  return process.env.NEXT_PUBLIC_ANALYZER_URL?.trim() || "http://localhost:8787/analyze";
}

export async function analyzeAssignmentBrief(briefText: string): Promise<AssignmentAnalysisResponse> {
  if (!briefText.trim()) throw new Error("Paste an assignment brief before analysing it.");
  if (briefText.length > MAX_BRIEF_CHARACTERS) throw new Error("This brief is too long for the prototype analyser.");

  let response: Response;
  try {
    response = await fetch(getAnalyzerUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ briefText }),
    });
  } catch {
    throw new Error("The local analyser is not available. You can still enter the rubric manually.");
  }

  if (!response.ok) {
    throw new Error("The analyser could not read this brief. You can still enter the rubric manually.");
  }

  const payload = await response.json() as Partial<AssignmentAnalysisResponse>;
  if (!payload.analysis || (payload.provider !== "local-ollama" && payload.provider !== "featherless") || typeof payload.model !== "string") {
    throw new Error("The analyser returned an unsupported response. You can still enter the rubric manually.");
  }

  return { analysis: validateAssignmentAnalysis(payload.analysis), provider: payload.provider, model: payload.model };
}
