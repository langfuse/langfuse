import { reportError } from "@/src/utils/reportError";

/**
 * Turn a Web Worker `onerror` ErrorEvent into one legible, Sentry-reportable
 * error.
 *
 * `Worker.onerror` fires when the worker *script* itself fails to load or throws
 * during init — the dominant cause is a stale-deploy chunk 404. Handlers used to
 * do `console.error("... Worker error:", event)` with the raw ErrorEvent; Sentry's
 * captureConsoleIntegration stringifies that to "[object ErrorEvent]", discarding
 * message/filename/lineno and making the resulting issues undiagnosable.
 *
 * This extracts the real fields and reports one proper Error with structured
 * context through the {@link reportError} seam, which tags `area` and logs the
 * companion line via `console.warn` (NOT `console.error`, so
 * captureConsoleIntegration — which captures the "error" level — does not
 * double-capture a second, opaque event for the same failure).
 *
 * One implementation for every worker: each caller supplies its `area` tag, the
 * `source` name the message should read as, and any extra context.
 */
export function reportWorkerLoadError({
  area,
  source,
  event,
  extra,
}: {
  area: string;
  /** What failed, as it should read in the message: a hook or worker name. */
  source: string;
  event: ErrorEvent;
  extra?: Record<string, unknown>;
}): void {
  const details = `${event.message || "unknown"} @ ${event.filename || "?"}:${event.lineno ?? "?"}:${event.colno ?? "?"}`;

  // Prefer the real Error when the worker threw during init; otherwise
  // synthesize one from the ErrorEvent's fields so the message is legible.
  const realError =
    event.error instanceof Error
      ? event.error
      : new Error(`[${source}] worker failed to load: ${details}`);

  reportError(realError, {
    area,
    extra: {
      ...extra,
      message: event.message,
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
    },
    // Companion console line: carry source + location details exactly once in
    // both branches — the pass-through Error's message lacks them, the
    // synthesized one already embeds them. Console-only; the captured event is
    // the Error above.
    warnMessage: `${source} worker failed to load: ${details}`,
  });
}
