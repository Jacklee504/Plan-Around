import { getAnalyzerEndpoint, imageAnalysisIsAvailable } from "@/lib/analyzerEndpoint";
import {
  applyDetectedTimetableSlots,
  type TimetableAnalysisInput,
  type TimetableAnalysisResponse,
  validateTimetableAnalysisResponse,
} from "@/lib/timetableAnalysis";
import type { PreparedTimetableImage } from "@/lib/timetableImage";

const ANALYZER_TIMEOUT_MS = 110_000;

export async function analyzeTimetableScreenshot(
  input: (TimetableAnalysisInput | PreparedTimetableImage) | (TimetableAnalysisInput | PreparedTimetableImage)[],
  signal?: AbortSignal,
): Promise<TimetableAnalysisResponse> {
  if (!imageAnalysisIsAvailable()) throw new Error("Timetable screenshot analysis uses the hosted analyser. Use the deployed app or configure NEXT_PUBLIC_ANALYZER_URL locally.");

  const controller = new AbortController();
  let cancelledByCaller = false;
  const cancelFromCaller = () => {
    cancelledByCaller = true;
    controller.abort();
  };
  if (signal?.aborted) cancelFromCaller();
  else signal?.addEventListener("abort", cancelFromCaller, { once: true });
  const timeout = setTimeout(() => controller.abort(), ANALYZER_TIMEOUT_MS);
  try {
    const response = await fetch(getAnalyzerEndpoint("/analyze-timetable"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(Array.isArray(input) ? { sources: input } : { source: input }),
      signal: controller.signal,
    });
    if (response.status === 429) throw new Error("Too many timetable analysis requests. Please wait a minute before trying again.");
    if (response.status === 504) throw new Error("The timetable analyser took too long. Please try again.");
    if (!response.ok) throw new Error("The analyser could not read this timetable. Try another readable file.");
    const parsed = validateTimetableAnalysisResponse(await response.json());
    const images = Array.isArray(input) ? input : [input];
    const slots = images.flatMap((image) => "slots" in image && image.slots ? image.slots : []);
    if (!slots.length) return parsed;
    return {
      ...parsed,
      analysis: {
        ...parsed.analysis,
        entries: applyDetectedTimetableSlots(parsed.analysis.entries, slots),
      },
    };
  } catch (error) {
    if (cancelledByCaller) throw new Error("Timetable analysis was cancelled.");
    if (controller.signal.aborted) throw new Error("The timetable analyser took too long. Please try again.");
    if (error instanceof Error && (error.message.startsWith("Too many timetable") || error.message.startsWith("The timetable analyser took too long") || error.message.startsWith("The analyser could not read"))) throw error;
    throw new Error("The timetable analyser is not available. Try again shortly.");
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", cancelFromCaller);
  }
}
