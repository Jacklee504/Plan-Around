import {
  MAX_BRIEF_CHARACTERS,
  type AssignmentAnalysisResponse,
  validateAssignmentAnalysisResponse,
} from "@/lib/assignmentAnalysis";

const ANALYZER_TIMEOUT_MS = 35_000;

function getAnalyzerUrl() {
  const configuredUrl = process.env.NEXT_PUBLIC_ANALYZER_URL?.trim();
  if (configuredUrl) return configuredUrl;
  if (process.env.NODE_ENV === "development") return "http://localhost:8787/analyze";
  throw new Error("The analyser is not configured for this build.");
}

export async function analyzeAssignmentBrief(briefText: string): Promise<AssignmentAnalysisResponse> {
  if (!briefText.trim()) throw new Error("Paste an assignment brief before analysing it.");
  if (briefText.length > MAX_BRIEF_CHARACTERS) throw new Error("This brief is too long for the prototype analyser.");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ANALYZER_TIMEOUT_MS);
  let payload: Partial<AssignmentAnalysisResponse>;
  try {
    const response = await fetch(getAnalyzerUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ briefText }),
      signal: controller.signal,
    });

    if (response.status === 429) {
      throw new Error("Too many analysis requests. Please wait a minute before trying again.");
    }
    if (!response.ok) {
      throw new Error("The analyser could not read this brief. You can still enter the rubric manually.");
    }

    payload = await response.json() as Partial<AssignmentAnalysisResponse>;
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error("The analyser took too long. You can still enter the rubric manually.");
    }
    if (
      error instanceof Error
      && (error.message === "The analyser could not read this brief. You can still enter the rubric manually."
        || error.message === "Too many analysis requests. Please wait a minute before trying again.")
    ) {
      throw error;
    }
    throw new Error("The analyser is not available. You can still enter the rubric manually.");
  } finally {
    clearTimeout(timeout);
  }

  try {
    return validateAssignmentAnalysisResponse(payload);
  } catch {
    throw new Error("The analyser returned an unsupported response. You can still enter the rubric manually.");
  }
}
