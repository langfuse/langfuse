import { reportError } from "@/src/utils/reportError";

/**
 * Turn a JSON-parser Web Worker `onerror` ErrorEvent into a legible,
 * Sentry-reportable error.
 *
 * `Worker.onerror` fires when the worker *script* itself fails to load or throws
 * during init — the dominant cause is a stale-deploy chunk 404. The previous
 * handlers did `console.error("... Worker error:", event)` with the raw
 * ErrorEvent; Sentry's captureConsoleIntegration stringifies that to
 * "[object ErrorEvent]", discarding message/filename/lineno and making the
 * resulting issues undiagnosable.
 *
 * This extracts the real fields and reports one proper Error with structured
 * context through the {@link reportError} seam, which tags `area` and logs the
 * companion line via `console.warn` (NOT `console.error`, so
 * captureConsoleIntegration — which captures the "error" level — does not
 * double-capture a second, opaque event for the same failure).
 *
 * Note: in-worker parse failures are a separate, already-legible path — they
 * post a "Parse error" string back over the message channel and are handled in
 * the message callback, not here.
 */
export function reportParserWorkerError(
  hookName: string,
  event: ErrorEvent,
): void {
  const details = `${event.message || "unknown"} @ ${event.filename || "?"}:${event.lineno ?? "?"}:${event.colno ?? "?"}`;

  // Prefer the real Error when the worker threw during init; otherwise
  // synthesize one from the ErrorEvent's fields so the message is legible.
  const realError =
    event.error instanceof Error
      ? event.error
      : new Error(`[${hookName}] worker failed to load: ${details}`);

  reportError(realError, {
    area: "io-parse-worker",
    extra: {
      workerHook: hookName,
      message: event.message,
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
    },
  });
}
