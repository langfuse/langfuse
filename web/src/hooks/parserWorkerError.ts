import { reportWorkerLoadError } from "@/src/utils/reportWorkerLoadError";

/**
 * Report a JSON-parser Web Worker `onerror` for the hook that owns it.
 *
 * The extraction itself is shared — see {@link reportWorkerLoadError} for why a
 * raw ErrorEvent must never be logged. This only pins the parser's `area` tag and
 * the `workerHook` context key.
 *
 * Note: in-worker parse failures are a separate, already-legible path — they post
 * a "Parse error" string back over the message channel and are handled in the
 * message callback, not here.
 */
export function reportParserWorkerError(
  hookName: string,
  event: ErrorEvent,
): void {
  reportWorkerLoadError({
    area: "io-parse-worker",
    source: hookName,
    event,
    extra: { workerHook: hookName },
  });
}
