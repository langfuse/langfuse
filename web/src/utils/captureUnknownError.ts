import { reportError } from "@/src/utils/reportError";

/**
 * Report an unknown (possibly non-Error) value to Sentry as a legible Error.
 *
 * Thin wrapper over the {@link reportError} seam kept for its existing call
 * sites (playground/auth). It maps the legacy `(context, value, extra)` shape
 * onto `reportError`, which owns the single unknown→`Error` coercion and the
 * single `captureException` path:
 * - real `Error`s pass through untouched (stack preserved);
 * - anything else is synthesized into an `Error` with a readable `[context]`
 *   message (never `[object Object]` / `[object ErrorEvent]`);
 * - it tags `area: context` and logs via `console.warn` (not `console.error`,
 *   which `captureConsoleIntegration` would double-capture).
 *
 * `context` is also mirrored into `extra` to preserve the exact payload legacy
 * callers have always sent. Prefer `reportError` directly in new code.
 */
export function captureUnknownError(
  context: string,
  value: unknown,
  extra?: Record<string, unknown>,
): void {
  reportError(value, {
    area: context,
    extra: { context, ...extra },
  });
}
