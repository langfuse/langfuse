import posthog from "posthog-js";
import {
  getPostHogClientConfig,
  isProductAnalyticsAvailable,
} from "@/src/features/posthog-analytics/productAnalyticsAvailability";

export type PostHogBrowserInitClient = Pick<typeof posthog, "init">;

/**
 * Initialize the browser PostHog SDK.
 *
 * Runs during `_app` module evaluation. Must not throw: an exception here
 * leaves Next.js with no App component, and the router then crashes reading
 * `getInitialProps` on `undefined`.
 *
 * Firefox can reject `crypto.getRandomValues` with `OperationError` while
 * posthog-js mints a device id (`uuidv7`). Analytics is skipped for that
 * session; the rest of the app keeps loading.
 */
export function initPostHogBrowserClient(
  client: PostHogBrowserInitClient = posthog,
): boolean {
  if (typeof window === "undefined") return false;

  const config = getPostHogClientConfig();
  if (!config) return false;

  // Session replay is a Langfuse Cloud feature, so self-hosted never records.
  // The product-analytics gate makes this redundant in HIPAA (PostHog is not
  // initialized there at all); it stays in the expression as defense in depth
  // for a compliance-sensitive flag.
  const sessionRecordingEnabled =
    process.env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION !== undefined &&
    isProductAnalyticsAvailable();

  try {
    client.init(config.key, {
      api_host: config.host,
      ui_host: "https://eu.posthog.com",
      loaded: (instance) => {
        if (process.env.NODE_ENV === "development") instance.debug();
      },
      disable_session_recording: !sessionRecordingEnabled,
      session_recording: {
        maskAllInputs: true,
        // Custom editors and the trace search composer render customer text in
        // contenteditable elements, which maskAllInputs does not cover.
        maskTextSelector: '[contenteditable="true"]',
        // Trace/observation payload renderers use this class so recordings show
        // the surrounding UI without capturing customer input/output values.
        blockClass: "ph-no-capture",
        maskCapturedNetworkRequestFn(request) {
          request.requestBody = request.requestBody ? "REDACTED" : undefined;
          request.responseBody = request.responseBody ? "REDACTED" : undefined;
          return request;
        },
      },
      autocapture: false,
      enable_heatmaps: true,
      persistence: "cookie",
    });
    return true;
  } catch (error) {
    // console.warn: console.error is captured by Sentry.
    console.warn("PostHog browser client failed to initialize", error);
    return false;
  }
}
