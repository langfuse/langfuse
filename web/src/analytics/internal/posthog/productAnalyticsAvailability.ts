// PostHog product analytics are off in the HIPAA cloud region. Not setting the
// env vars is not enough: ServerPosthog falls back to Langfuse's telemetry key.
//
// Read from process.env, not the validated env object, so this also works at
// module scope in the app shell where posthog-js is initialized. Next.js inlines
// NEXT_PUBLIC_* per region build (see web/Dockerfile).

export const isProductAnalyticsAvailable = (): boolean =>
  process.env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION !== "HIPAA";

/** Key/host for posthog-js, or null when the browser SDK must not initialize. */
export const getPostHogClientConfig = (): {
  key: string;
  host: string;
} | null => {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST;
  if (!isProductAnalyticsAvailable() || !key || !host) return null;
  return { key, host };
};

export const isPostHogClientEnabled = (): boolean =>
  getPostHogClientConfig() !== null;
