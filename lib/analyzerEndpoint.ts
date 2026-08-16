function configuredAnalyzerUrl() {
  return process.env.NEXT_PUBLIC_ANALYZER_URL?.trim() || (process.env.NODE_ENV === "development" ? "http://localhost:8787/analyze" : "");
}

export function getAnalyzerEndpoint(pathname = "/analyze") {
  const configuredUrl = configuredAnalyzerUrl();
  if (!configuredUrl) throw new Error("The analyser is not configured for this build.");
  const endpoint = new URL(configuredUrl);
  endpoint.pathname = pathname;
  endpoint.search = "";
  endpoint.hash = "";
  return endpoint.toString();
}

export function imageAnalysisIsAvailable() {
  const configuredUrl = configuredAnalyzerUrl();
  if (!configuredUrl) return false;
  try {
    const hostname = new URL(configuredUrl).hostname;
    return hostname !== "localhost" && hostname !== "127.0.0.1";
  } catch {
    return false;
  }
}
