// Export source options for analytics integrations (PostHog, Mixpanel, Blob Storage)
// This is a client-safe file that can be imported from @langfuse/shared

import { AnalyticsIntegrationExportSource } from "@prisma/client";

export const EXPORT_SOURCE_OPTIONS: Array<{
  value: AnalyticsIntegrationExportSource;
  label: string;
  description: string;
}> = [
  {
    value: "TRACES_OBSERVATIONS" as const,
    label: "Traces and observations (legacy)",
    description:
      "Export traces, observations and scores. This is the legacy behavior prior to tracking traces and observations in separate tables. It is recommended to use the enriched observations option instead.",
  },
  {
    value: "TRACES_OBSERVATIONS_EVENTS" as const,
    label: "Traces and observations (legacy) and enriched observations",
    description:
      "Export traces, observations, scores and enriched observations. This exports both the legacy data source (traces, observations) and the new one (enriched observations) and essentially exports duplicate data. Therefore, it should only be used to migrate existing integrations to the new recommended enriched observations and check validity of the data for downstream consumers of the export data.",
  },
  {
    value: "EVENTS" as const,
    label: "Enriched observations (recommended)",
    description:
      "Export enriched observations and scores. This is the recommended data source for integrations and will be the default for new integrations.",
  },
] as const;

export type ExportSourceOption = (typeof EXPORT_SOURCE_OPTIONS)[number];
export type ExportSourceValue = ExportSourceOption["value"];
