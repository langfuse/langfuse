import {
  CircularRedirectError,
  MaxRedirectsExceededError,
  OutboundUrlValidationError,
  RedirectValidationError,
} from "@langfuse/shared/src/server";

/**
 * Walk an error's `cause` chain looking for a connect-time secure-outbound
 * validation failure: a blocked resolved IP (SSRF/TOCTOU) or a rejected
 * redirect target. undici surfaces the connect-time block as a generic
 * "fetch failed" TypeError whose `cause` is the real validation error, and
 * SDKs (e.g. posthog-node) may wrap it again, so the signal only shows up by
 * walking the chain. Mirrors `findSecureLlmValidationError` in the shared
 * secureLlmFetch helper.
 */
export function findOutboundUrlValidationError(
  error: unknown,
): Error | undefined {
  const visited = new Set<unknown>();
  let current: unknown = error;

  while (current !== null && current !== undefined && !visited.has(current)) {
    visited.add(current);
    if (
      current instanceof OutboundUrlValidationError ||
      current instanceof RedirectValidationError ||
      current instanceof MaxRedirectsExceededError ||
      current instanceof CircularRedirectError
    ) {
      return current;
    }

    current =
      typeof current === "object" && current !== null && "cause" in current
        ? (current as { cause: unknown }).cause
        : undefined;
  }

  return undefined;
}
