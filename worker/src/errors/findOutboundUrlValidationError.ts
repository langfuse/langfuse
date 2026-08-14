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

const OUTBOUND_VALIDATION_ERROR_NAMES = new Set([
  "OutboundUrlValidationError",
  "RedirectValidationError",
]);

// A resolver hiccup is not a policy block: the host may be legitimate and the
// next attempt may succeed, so it must stay retryable. RedirectValidationError
// re-wraps the inner failure by message only — no code, no cause — so a DNS
// failure on a redirect hop is recognisable only by its message text. The
// substring is imported from the throw site so the two stay in sync.
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
