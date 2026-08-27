/**
 * The one gate for Langfuse's own PostHog product analytics.
 *
 * PostHog is disabled altogether in the HIPAA cloud region: the browser SDK is
 * never initialized and the server client is never constructed, so no pageview,
 * identify, capture, signup conversion event or backend-activity event can
 * leave that deployment. Because `ServerPosthog` falls back to Langfuse's own
 * telemetry key when no key is configured, "just don't set the env vars" is not
 * a sufficient gate — the region check has to live in code.
 *
 * Every PostHog call site routes through here instead of carrying its own
 * region list, so the rule stays in one place and cannot drift per surface.
 *
 * The region and keys are read from `process.env` rather than the validated
 * `env` object so this module also works at module scope in the app shell,
 * where PostHog is initialized before React renders. Next.js inlines
 * `NEXT_PUBLIC_*` into the browser bundle at build time, and each Langfuse
 * Cloud region builds its own image with its own
 * `NEXT_PUBLIC_LANGFUSE_CLOUD_REGION` build arg (see web/Dockerfile), so the
 * HIPAA bundle ships with the gate already closed.
 */

/** Cloud regions that must never run Langfuse product analytics. */
export const PRODUCT_ANALYTICS_DISABLED_CLOUD_REGIONS = ["HIPAA"] as const;

/** Whether product analytics may run in the given deployment region. */
export const isProductAnalyticsAllowedInRegion = (
  region: string | undefined | null,
): boolean =>
  region == null ||
  !(PRODUCT_ANALYTICS_DISABLED_CLOUD_REGIONS as readonly string[]).includes(
    region,
  );

/**
 * Whether Langfuse product analytics may run in this deployment at all.
 * Server-side capture paths gate on this; it says nothing about whether a
 * PostHog key is configured.
 */
export const isProductAnalyticsAvailable = (): boolean =>
  isProductAnalyticsAllowedInRegion(
    process.env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION,
  );

/**
 * The key/host the PostHog browser SDK should be initialized with, or null when
 * the browser SDK must stay dormant — either because no key/host pair is
 * configured or because the region runs no product analytics.
 */
export const getPostHogClientConfig = (): {
  key: string;
  host: string;
} | null => {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST;
  if (!isProductAnalyticsAvailable() || !key || !host) return null;
  return { key, host };
};

/**
 * Whether the PostHog browser SDK is live: the deployment allows product
 * analytics and a client key/host pair is configured. Guards the capture,
 * identify and reset call sites that run after initialization.
 */
export const isPostHogClientEnabled = (): boolean =>
  getPostHogClientConfig() !== null;
