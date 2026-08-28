/**
 * Walk an error's `cause` chain looking for a connect-time secure-outbound
 * validation failure: a blocked resolved IP or a rejected redirect target.
 * undici surfaces the connect-time block as a generic "fetch failed" TypeError
 * whose `cause` holds the real validation error, and SDKs (e.g. posthog-node)
 * may wrap it again, so the signal only shows up by walking the chain.
 *
 * Matched by error NAME rather than `instanceof`: importing the shared error
 * classes as values breaks in tests that replace the
 * `@langfuse/shared/src/server` barrel without `importOriginal`, and a
 * classifier that throws would destroy the very error it is meant to describe.
 */
import { DNS_LOOKUP_FAILED_MESSAGE_PREFIX } from "@langfuse/shared/src/server";

// Host/IP policy blocks — the SSRF signal proper. RedirectValidationError
// belongs here: it means a redirect TARGET failed host validation.
const POLICY_BLOCK_ERROR_NAMES = new Set([
  "OutboundUrlValidationError",
  "RedirectValidationError",
]);

// Redirect budget exhaustion and loops. Also permanent — retrying re-reads the
// same events and hits the same chain — but the SSRF status is genuinely
// UNKNOWN: outbound-url/fetch.ts detects both before validating the hop that
// would have closed the loop or exceeded the budget, so that target was never
// checked. Reporting must say so instead of claiming a security block.
const REDIRECT_BUDGET_ERROR_NAME = "MaxRedirectsExceededError";
const REDIRECT_LOOP_ERROR_NAME = "CircularRedirectError";

const OUTBOUND_VALIDATION_ERROR_NAMES = new Set([
  ...POLICY_BLOCK_ERROR_NAMES,
  REDIRECT_BUDGET_ERROR_NAME,
  REDIRECT_LOOP_ERROR_NAME,
]);

// A resolver hiccup may succeed on the next attempt, so it stays retryable. A
// redirect hop restates the reason in its own message, so match that too;
// substring imported from the throw site to stay in sync.
const isTransientDnsFailure = (error: Error): boolean =>
  (error as { code?: unknown }).code === "dns-lookup-failed" ||
  error.message.includes(DNS_LOOKUP_FAILED_MESSAGE_PREFIX);

/**
 * The validation error, but only when the block is permanent. Returns undefined
 * when nothing in the chain is a validation error, or when the failure is a
 * transient DNS-resolution error that deserves a retry.
 */
export function findOutboundUrlValidationError(
  error: unknown,
): Error | undefined {
  const visited = new Set<unknown>();
  let current: unknown = error;

  while (current !== null && current !== undefined && !visited.has(current)) {
    visited.add(current);

    if (
      current instanceof Error &&
      OUTBOUND_VALIDATION_ERROR_NAMES.has(current.name)
    ) {
      return isTransientDnsFailure(current) ? undefined : current;
    }

    current =
      typeof current === "object" && current !== null && "cause" in current
        ? (current as { cause: unknown }).cause
        : undefined;
  }

  return undefined;
}

/**
 * How to describe a terminal outbound failure in a log line and in the error
 * that reaches BullMQ's `failedReason`.
 *
 * A host/IP policy block is stated as one. A redirect budget or loop fault is
 * NOT: it only asserts that the chain stopped before its final target was
 * validated, so it must not claim the destination was blocked (nothing checked
 * it) or fine (it might be the metadata service).
 */
export function describeOutboundFailure(error: Error): string {
  if (error.name === REDIRECT_BUDGET_ERROR_NAME) {
    return "too many redirects; final destination not verified";
  }
  if (error.name === REDIRECT_LOOP_ERROR_NAME) {
    return "redirect loop; final destination not verified";
  }
  return "blocked by SSRF protection";
}
