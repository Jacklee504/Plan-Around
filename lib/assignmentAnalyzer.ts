import {
  MAX_BRIEF_CHARACTERS,
  type AssignmentAnalysisInput,
  type AssignmentAnalysisResponse,
  validateAssignmentAnalysisResponse,
} from "@/lib/assignmentAnalysis";
import { getAnalyzerEndpoint, imageAnalysisIsAvailable } from "@/lib/analyzerEndpoint";

const ANALYZER_TIMEOUT_MS = 35_000;

export { imageAnalysisIsAvailable };

export async function analyzeAssignmentBrief(input: AssignmentAnalysisInput): Promise<AssignmentAnalysisResponse> {
  if (input.kind === "text" && !input.text.trim()) throw new Error("Paste an assignment brief before analysing it.");
  if (input.kind === "text" && input.text.length > MAX_BRIEF_CHARACTERS) throw new Error("This brief is too long for the prototype analyser.");
  if (input.kind === "image" && !imageAnalysisIsAvailable()) {
    throw new Error("Screenshot analysis uses the hosted analyser. Use the deployed app or configure NEXT_PUBLIC_ANALYZER_URL locally.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ANALYZER_TIMEOUT_MS);
  let payload: Partial<AssignmentAnalysisResponse>;
  try {
    const response = await fetch(getAnalyzerEndpoint(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source: input }),
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
