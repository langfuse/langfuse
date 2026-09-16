export function logLlmConnectionDebug(entry: {
  hypothesisId: string;
  location: string;
  message: string;
  data: Record<string, unknown>;
}) {
  fetch("http://localhost:8765", {
    method: "POST",
    mode: "no-cors",
    headers: { "content-type": "text/plain" },
    body: JSON.stringify({ ...entry, timestamp: Date.now() }),
    keepalive: true,
  }).catch(() => undefined);
}
