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
// Host/IP policy blocks — the SSRF signal proper. RedirectValidationError
// belongs here: it means a redirect TARGET failed host validation.
const POLICY_BLOCK_ERROR_NAMES = new Set([
  "OutboundUrlValidationError",
  "RedirectValidationError",
]);

// Redirect budget exhaustion and loops. Permanent, but the SSRF status is
// genuinely UNKNOWN: outbound-url/fetch.ts checks the budget and the loop
// BEFORE validating the hop's target, so the chain's final target was never
// checked. It may be a benign over-long chain of the operator's own hosts, or a
// deliberate attempt to land on an internal address after burning the budget.
// Callers must claim neither, and must surface the unvalidated target so an
// operator can tell the two apart.
const REDIRECT_CHAIN_ERROR_NAMES = new Set([
  "MaxRedirectsExceededError",
  "CircularRedirectError",
]);

const OUTBOUND_VALIDATION_ERROR_NAMES = new Set([
  ...POLICY_BLOCK_ERROR_NAMES,
  ...REDIRECT_CHAIN_ERROR_NAMES,
]);

/**
 * Distinguishes a redirect budget/loop fault from a host/IP policy block, so
 * callers can describe the failure accurately instead of labelling every
 * terminal outbound failure an SSRF block.
 */
export function isRedirectChainFailure(error: Error): boolean {
  return REDIRECT_CHAIN_ERROR_NAMES.has(error.name);
}

/**
 * The redirect target that was NEVER validated, for a truncated or looping
 * chain. Both shared errors carry the chain with that target appended last
 * (MaxRedirectsExceededError: [...chain, redirectUrl]; CircularRedirectError:
 * the same). Surfacing it is the whole detection signal for this branch: an
 * operator seeing their own hostname has an over-long chain, while one seeing
 * 169.254.169.254 has something redirecting the exporter at cloud metadata.
 *
 * Read as a plain property, not via instanceof, for the same reason the rest of
 * this module matches on name: no module bindings to resolve, nothing to throw.
 */
/**
 * How to describe a terminal outbound failure in a log line and in the error
 * that reaches BullMQ's failedReason.
 *
 * A host/IP policy block is stated as one. A truncated or looping redirect
 * chain is NOT: it asserts only that the chain stopped before its final target
 * was validated, and names that target. Claiming an SSRF block there would cry
 * wolf on a benign over-long chain; claiming a benign chain would bury a
 * redirect aimed at an internal address.
 */
export function describeOutboundFailure(error: Error): string {
  if (!isRedirectChainFailure(error)) {
    return "blocked by outbound SSRF protection";
  }

  const finalTarget = unvalidatedRedirectTarget(error);
  const targetSuffix = finalTarget
    ? `; unvalidated final target: ${finalTarget}`
    : "";

  return `rejected: redirect chain stopped before its final target was validated${targetSuffix}`;
}

export function unvalidatedRedirectTarget(error: Error): string | undefined {
  if (!REDIRECT_CHAIN_ERROR_NAMES.has(error.name)) return undefined;

  const chain: unknown = (error as { redirectChain?: unknown }).redirectChain;
  if (!Array.isArray(chain) || chain.length === 0) return undefined;

  const finalTarget: unknown = chain[chain.length - 1];
  return typeof finalTarget === "string" ? finalTarget : undefined;
}

// A resolver hiccup is not a policy block: the host may be perfectly legitimate
// and the very next attempt may succeed, so it must stay retryable. The shared
// LLM classifier draws the same line by mapping this code to
// "endpoint-unreachable" rather than "invalid-connection".
const DNS_LOOKUP_FAILED_CODE = "dns-lookup-failed";

// RedirectValidationError (outbound-url/fetch.ts) re-wraps a failed
// redirect-target validation using only the inner error's MESSAGE — it keeps
// neither the code nor the cause — so a DNS failure surfaced through the
// redirect path can only be recognised by its message text, declared at
// outbound-url/validation.ts (`DNS lookup failed for ${hostname}`). If that
// wording drifts, this stops matching and a resolver blip is again treated as
// terminal; that is the safe drift direction (a genuine block never becomes
// retryable), but it is why the marker is pinned here with a name.
const DNS_LOOKUP_FAILED_MESSAGE_MARKER = "DNS lookup failed for";

function isTransientDnsFailure(error: Error): boolean {
  const code: unknown = (error as { code?: unknown }).code;
  return (
    code === DNS_LOOKUP_FAILED_CODE ||
    error.message.includes(DNS_LOOKUP_FAILED_MESSAGE_MARKER)
  );
}

/**
 * Returns the validation error only when the block is PERMANENT (an IP/hostname
 * policy block, an unusable redirect chain). Returns undefined when nothing in
 * the chain is a validation error, or when the failure is a transient
 * DNS-resolution error that deserves a retry.
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
