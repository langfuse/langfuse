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
 *
 * DRIFT WARNING: this is a deliberate fork of the (module-private)
 * findSecureLlmValidationError in
 * packages/shared/src/server/llm/secureLlmFetch.ts — same four instanceof arms,
 * same visited-set walk. If a new failure mode is added to
 * packages/shared/src/server/outbound-url/fetch.ts, add its arm HERE too:
 * otherwise this copy silently stops classifying it, the terminal branches in
 * the PostHog/Mixpanel exporters stop firing, and both go back to burning every
 * BullMQ attempt on a permanent block with no test failing.
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
