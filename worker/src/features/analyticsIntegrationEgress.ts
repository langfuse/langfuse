import { logger } from "@langfuse/shared/src/server";
import { UnrecoverableError } from "../errors/UnrecoverableError";
import { findOutboundUrlValidationError } from "../errors/findOutboundUrlValidationError";

/**
 * Redirect budget for the analytics integration exporters. Both senders
 * previously used a plain fetch, which auto-follows up to 20 redirects, so the
 * budget stays generous enough not to break a self-hosted endpoint behind a
 * redirecting edge. Mirrors MAX_LLM_REDIRECTS on the LLM egress path.
 */
export const ANALYTICS_INTEGRATION_MAX_REDIRECTS = 10;

// A rejected redirect target is reported with its URL embedded verbatim, and a
// Location header may carry userinfo, so the message can hold a password.
const URL_CREDENTIALS = /([a-z][a-z0-9+.-]*:\/\/)[^/?#\s@]*@/gi;

const redactUrlCredentials = (text: string): string =>
  text.replace(URL_CREDENTIALS, "$1***@");

/**
 * Rethrow a connect-time SSRF block as terminal, so BullMQ stops re-attempting
 * a send that cannot succeed; no-op for anything else, which the caller keeps
 * handling as retryable.
 *
 * Both surfaces written here outlive the job — the log line, and the error
 * message BullMQ persists as the job's `failedReason` — so the reason is
 * credential-redacted. The raw error stays reachable as `cause` for tests and
 * in-process inspection, but is not handed to the logger.
 */
export function rethrowIfOutboundValidationFailure(
  error: unknown,
  labels: { logSubject: string; jobSubject: string },
): void {
  const validationError = findOutboundUrlValidationError(error);
  if (!validationError) return;

  const reason = redactUrlCredentials(validationError.message);
  logger.error(`${labels.logSubject} blocked by SSRF protection: ${reason}`, {
    errorName: validationError.name,
  });

  const unrecoverable = new UnrecoverableError(
    `${labels.jobSubject} blocked by SSRF protection: ${reason}`,
  );
  unrecoverable.cause = error;
  throw unrecoverable;
}
