import { env } from "@/src/env.mjs";
import { datadogRum } from "@datadog/browser-rum";
import { getLangfuseUrl } from "@langfuse/shared";

export const DATADOG_SITE = env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION
  ? env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION == "US"
    ? "datadoghq.com"
    : env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION == "EU"
      ? "datadoghq.eu"
      : env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION == "STAGING"
        ? "datadoghq.eu"
        : "datadoghq.com"
  : "datadoghq.com";

// Initialize Datadog RUM
if (
  env.NEXT_PUBLIC_DATADOG_APPLICATION_ID &&
  env.NEXT_PUBLIC_DATADOG_CLIENT_TOKEN
) {
  console.log("Initializing Datadog RUM");
  datadogRum.init({
    applicationId: env.NEXT_PUBLIC_DATADOG_APPLICATION_ID,
    clientToken: env.NEXT_PUBLIC_DATADOG_CLIENT_TOKEN,
    site: DATADOG_SITE,
    service: "web-frontend",
    env: env.NEXT_PUBLIC_DATADOG_ENVIRONMENT,
    sessionSampleRate: env.NEXT_PUBLIC_DATADOG_SESSION_SAMPLE_RATE,
    sessionReplaySampleRate: env.NEXT_PUBLIC_DATADOG_SESSION_REPLAY_SAMPLE_RATE,
    defaultPrivacyLevel: "mask-user-input",
    trackUserInteractions: true,
    trackResources: true,
    trackLongTasks: true,
    allowedTracingUrls: env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION
      ? [
          {
            match: getLangfuseUrl(env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION),
            propagatorTypes: ["tracecontext"],
          },
        ]
      : [],
  });
}

export default function DatadogInit() {
  // Render nothing - this component is only included so that the init code
  // above will run client-side
  return null;
}
