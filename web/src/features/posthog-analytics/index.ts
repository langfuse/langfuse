// The product-analytics feature's public client surface (RFC rule 8). Named
// re-exports only — exactly what other features already imported, nothing
// added for the future.
//
// Client-safe by construction: `server/` and `ServerPosthog` are absent, so
// importing this cannot pull posthog-node into a browser bundle. Server
// consumers of `ServerPosthog` import `@/src/features/posthog-analytics/server`.

export {
  usePostHogClientCapture,
  V4_BETA_ENABLED_POSTHOG_PROPERTY,
} from "@/src/features/posthog-analytics/usePostHogClientCapture";

export {
  getPostHogClientConfig,
  isPostHogClientEnabled,
  isProductAnalyticsAvailable,
} from "@/src/features/posthog-analytics/productAnalyticsAvailability";
