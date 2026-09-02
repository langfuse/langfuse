// The product-analytics feature's public client surface (RFC rule 8). Named
// re-exports only — exactly what other features already imported from this
// feature's client modules, nothing added for the future.
//
// `ServerPosthog` stays a deep import. Re-exporting it here pulled
// `posthog-node` into every client that only needed the capture hook (Storybook
// and the Next web build both failed). Callers in `auth/lib` and `telemetry`
// are not under `server/`, so a `server/index.ts` is rule 10. Those two inbound
// paths remain until those callers move.
//
// `server/backendActivity` stays a direct import from the tRPC root, which is
// not a feature.

export {
  usePostHogClientCapture,
  V4_BETA_ENABLED_POSTHOG_PROPERTY,
} from "@/src/features/posthog-analytics/usePostHogClientCapture";

export { isPostHogClientEnabled } from "@/src/features/posthog-analytics/productAnalyticsAvailability";
