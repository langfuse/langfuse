import { recordIncrement } from "./instrumentation";
import { logger } from "./logger";

let installed = false;

function onUnhandledRejection(
  reason: unknown,
  _promise: Promise<unknown>,
): void {
  try {
    logger.error(
      "Unhandled promise rejection captured; process kept alive",
      reason,
    );
    recordIncrement("langfuse.process.unhandled_rejection", 1);
  } catch {
    // Capture must never throw: a failure here would still kill the process.
  }
}

/**
 * Log unhandled promise rejections and emit a metric without exiting.
 * Idempotent. Call after dd.init.
 */
export function installUnhandledRejectionCapture(): void {
  if (installed) {
    return;
  }
  installed = true;
  process.on("unhandledRejection", onUnhandledRejection);
}
