// Export source options for analytics integrations (PostHog, Mixpanel, Blob Storage)
// This is a client-safe file that can be imported from @langfuse/shared

export const EXPORT_SOURCE_OPTIONS = [
  {
    value: "TRACES_OBSERVATIONS" as const,
    label: "Traces & Observations",
    description: "Export traces, observations, and scores",
  },
  {
    value: "TRACES_OBSERVATIONS_EVENTS" as const,
    label: "Traces, Observations & Events",
    description: "Export traces, observations, scores, and events",
  },
  {
    value: "EVENTS" as const,
    label: "Events Only",
    description: "Export events and scores",
  },
] as const;

export type ExportSourceOption = (typeof EXPORT_SOURCE_OPTIONS)[number];
export type ExportSourceValue = ExportSourceOption["value"];
