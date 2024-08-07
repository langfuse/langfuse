"use client";

import { datadogRum } from "@datadog/browser-rum";

datadogRum.init({
  // `site` refers to the Datadog site parameter of your organization
  // see https://docs.datadoghq.com/getting_started/site/
  site: "datadoghq.eu",
  service: "web",
  env: "staging",
  // Specify a version number to identify the deployed version of your application in Datadog
  // version: '1.0.0',
  sessionSampleRate: 100,
  sessionReplaySampleRate: 20,
  trackUserInteractions: true,
  trackResources: true,
  trackLongTasks: true,
  defaultPrivacyLevel: "mask-user-input",
  // Specify URLs to propagate trace headers for connection between RUM and backend trace
  allowedTracingUrls: [
    {
      match: "https://cloud.langfuse.com/",
      propagatorTypes: ["tracecontext"],
    },
  ],
});

export default function DatadogInit() {
  // Render nothing - this component is only included so that the init code
  // above will run client-side
  return null;
}
