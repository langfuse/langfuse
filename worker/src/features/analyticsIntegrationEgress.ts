import {
  logger,
  validateWebhookURL,
  whitelistFromEnv,
  type RedirectOptions,
} from "@langfuse/shared/src/server";
import { UnrecoverableError } from "../errors/UnrecoverableError";
import { findOutboundUrlValidationError } from "../errors/findOutboundUrlValidationError";

/**
 * Redirect budget for the analytics integration exporters. Both senders
 * previously used a plain fetch, which auto-follows up to 20 redirects, so the
 * budget stays generous enough not to break a self-hosted endpoint behind a
 * redirecting edge. Mirrors MAX_LLM_REDIRECTS on the LLM egress path.
 */
const ANALYTICS_INTEGRATION_MAX_REDIRECTS = 10;

/**
 * Connect-time-pinned egress settings shared by both analytics senders, so the
 * redirect budget, the validator and the whitelist source cannot drift apart
 * between them. `logContext` is the only per-sender part.
 */
export const buildAnalyticsRedirectOptions = (
  logContext: string,
): RedirectOptions => ({
  maxRedirects: ANALYTICS_INTEGRATION_MAX_REDIRECTS,
  redirectValidation: {
    validateUrl: validateWebhookURL,
    whitelist: whitelistFromEnv(),
    logContext,
  },
});

// A rejected redirect target is reported with its URL embedded verbatim, and a
// Location header may carry userinfo, so the message can hold a password.
const URL_CREDENTIALS = /([a-z][a-z0-9+.-]*:\/\/)[^/?#\s@]*@/gi;

const redactUrlCredentials = (text: string): string =>
  text.replace(URL_CREDENTIALS, "$1***@");

/**
 * A serialization-safe stand-in for the validation error. The original holds the
 * offending URL three times over — in its message, in its stack, and, for a
 * rejected redirect, in an enumerable `redirectUrl` field — and the generic
 * queue failure handler both logs the thrown error and reports it to tracing,
 * so everything reachable from `cause` is written out verbatim.
 */
const sanitizedCause = (validationError: Error): Error => {
  const sanitized = new Error(redactUrlCredentials(validationError.message));
  sanitized.name = validationError.name;
  if (validationError.stack) {
    sanitized.stack = redactUrlCredentials(validationError.stack);
  }
  return sanitized;
};

/**
 * Rethrow a connect-time SSRF block as terminal, so BullMQ stops re-attempting
 * a send that cannot succeed; no-op for anything else, which the caller keeps
 * handling as retryable.
 *
 * Nothing the thrown error carries may hold a credential: the message, the
 * retained cause and that cause's own stack all outlive the job, via the log
 * line and via the `failedReason` BullMQ persists.
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
  // Non-enumerable, because a structured logger handed this error copies every
  // enumerable field into the log line — which is how the raw URL escaped a
  // redacted message before.
  Object.defineProperty(unrecoverable, "cause", {
    value: sanitizedCause(validationError),
    enumerable: false,
    configurable: true,
    writable: true,
  });
  throw unrecoverable;
}
