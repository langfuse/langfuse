export function logLlmConnectionDebug(entry: {
  hypothesisId: string;
  location: string;
  message: string;
  data: Record<string, unknown>;
}) {
  if (process.env.NODE_ENV !== "development") return;

  fetch("/api/debug/llm-connection-lifecycle", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...entry, timestamp: Date.now() }),
  }).catch(() => undefined);
}
