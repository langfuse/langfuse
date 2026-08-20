import { getActiveSpan, getRootSpan, setTag } from "@sentry/nextjs";

/**
 * Isolation-scope tag so browser pageload/navigation metric alerts can split
 * v3 vs v4. Boolean only — never user or project IDs (those stay on `setUser`).
 */
export const V4_BETA_ENABLED_SENTRY_TAG = "v4BetaEnabled";

function stampActiveRootSpan(value: boolean): void {
  const activeSpan = getActiveSpan();
  if (!activeSpan) {
    return;
  }
  getRootSpan(activeSpan).setAttribute(V4_BETA_ENABLED_SENTRY_TAG, value);
}

/**
 * Apply `v4BetaEnabled` to the current Sentry isolation scope and, when a
 * pageload/navigation span is still open, to that root span. Isolation-scope
 * tags are copied onto the transaction event at send time, which is after
 * session hydrate on idle-until-quiet pageloads such as `/traces`.
 */
export function setV4BetaEnabledSentryTag(enabled: boolean | undefined): void {
  const value = enabled === true;
  setTag(V4_BETA_ENABLED_SENTRY_TAG, value);
  stampActiveRootSpan(value);
}

/** Drop the tag on logout so anonymous events are not labeled as v3. */
export function clearV4BetaEnabledSentryTag(): void {
  setTag(V4_BETA_ENABLED_SENTRY_TAG, undefined);
}
