import { env } from "@/src/env.mjs";
import { datadogRum } from "@datadog/browser-rum";
import { getLangfuseUrl } from "@langfuse/shared";

// Initialize Datadog RUM
if (
  env.NEXT_PUBLIC_DATADOG_APPLICATION_ID &&
  env.NEXT_PUBLIC_DATADOG_CLIENT_TOKEN
) {
  datadogRum.init({
    applicationId: env.NEXT_PUBLIC_DATADOG_APPLICATION_ID,
    clientToken: env.NEXT_PUBLIC_DATADOG_CLIENT_TOKEN,
    site: env.NEXT_PUBLIC_DATADOG_SITE || "datadoghq.com",
    service: "web-frontend",
    env: process.env.NODE_ENV,
    sessionSampleRate: 10,
    sessionReplaySampleRate: 1,
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
