// The product-analytics feature's public client surface (RFC rule 8). Named
// re-exports only — exactly what other features already imported, nothing
// added for the future.
//
// `server/backendActivity` stays a direct import from the tRPC root, which is
// not a feature. `ServerPosthog` already lived outside `server/` and is used
// from `auth/lib` and `telemetry`, which rule 10 treats as client paths, so it
// is re-exported here rather than from `server/index.ts`.

export {
  usePostHogClientCapture,
  V4_BETA_ENABLED_POSTHOG_PROPERTY,
} from "@/src/features/posthog-analytics/usePostHogClientCapture";

export {
  getPostHogClientConfig,
  isPostHogClientEnabled,
  isProductAnalyticsAvailable,
} from "@/src/features/posthog-analytics/productAnalyticsAvailability";

export { ServerPosthog } from "@/src/features/posthog-analytics/ServerPosthog";
