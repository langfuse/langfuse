/**
 * Walk an error's `cause` chain looking for a connect-time secure-outbound
 * validation failure: a blocked resolved IP (SSRF/TOCTOU) or a rejected
 * redirect target. undici surfaces the connect-time block as a generic
 * "fetch failed" TypeError whose `cause` is the real validation error, and
 * SDKs (e.g. posthog-node) may wrap it again, so the signal only shows up by
 * walking the chain.
 *
 * Matching is by error NAME, not `instanceof`. The shared original
 * (findSecureLlmValidationError in
 * packages/shared/src/server/llm/secureLlmFetch.ts) can use `instanceof`
 * because it lives in the same module graph as the classes it tests. From the
 * worker, importing those four classes as VALUES made this module explode
 * wherever a test replaces the `@langfuse/shared/src/server` barrel without
 * `importOriginal`: the right-hand side of `instanceof` was undefined, and
 * because classification is the first statement in the exporters' catch
 * blocks, the resulting TypeError replaced the original error and destroyed
 * the diagnosable cause. Each class sets `this.name` in its constructor, so
 * name matching carries the same signal with no module bindings to resolve and
 * nothing that can throw.
 *
 * DRIFT WARNING: the names below are declared in
 * packages/shared/src/server/outbound-url/{validation,fetch}.ts. If a new
 * failure mode is added there, add its name HERE too; otherwise this classifier
 * silently stops recognising it and the exporters' terminal branches stop
 * firing for that mode.
 */
const TERMINAL_OUTBOUND_ERROR_NAMES = new Set([
  "OutboundUrlValidationError",
  "RedirectValidationError",
  "MaxRedirectsExceededError",
  "CircularRedirectError",
]);

export function findOutboundUrlValidationError(
  error: unknown,
): Error | undefined {
  const visited = new Set<unknown>();
  let current: unknown = error;

  while (current !== null && current !== undefined && !visited.has(current)) {
    visited.add(current);

    if (
      current instanceof Error &&
      TERMINAL_OUTBOUND_ERROR_NAMES.has(current.name)
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
