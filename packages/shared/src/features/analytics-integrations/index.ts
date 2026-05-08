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

export const BLOB_EXPORT_FIELD_GROUPS = [
  "core",
  "basic",
  "time",
  "io",
  "metadata",
  "model",
  "usage",
  "prompt",
  "metrics",
  "tools",
  "trace_context",
] as const;

export type BlobExportFieldGroup = (typeof BLOB_EXPORT_FIELD_GROUPS)[number];

// Keyed by BlobExportFieldGroup so TypeScript errors if a group is added to
// BLOB_EXPORT_FIELD_GROUPS without a corresponding label/description here.
const EXPORT_FIELD_GROUP_LABELS = {
  core: {
    label: "Core",
    description:
      "id, trace_id, start_time, end_time, project_id, parent_observation_id, type",
  },
  basic: {
    label: "Basic",
    description:
      "name, level, status_message, version, environment, bookmarked, public, user_id, session_id",
  },
  time: {
    label: "Time",
    description: "completion_start_time, created_at, updated_at",
  },
  io: {
    label: "Input / Output",
    description: "input, output",
  },
  metadata: {
    label: "Metadata",
    description: "metadata",
  },
  model: {
    label: "Model",
    description: "provided_model_name, model_id, model_parameters",
  },
  usage: {
    label: "Usage",
    description:
      "usage_details, cost_details, total_cost, input_price, output_price, total_price",
  },
  prompt: {
    label: "Prompt",
    description: "prompt_id, prompt_name, prompt_version",
  },
  metrics: {
    label: "Metrics",
    description: "latency, time_to_first_token",
  },
  tools: {
    label: "Tools",
    description: "tool_definitions, tool_calls, tool_call_names",
  },
  trace_context: {
    label: "Trace Context",
    description: "tags, release, trace_name, usage_pricing_tier_name",
  },
} satisfies Record<
  BlobExportFieldGroup,
  { label: string; description: string }
>;

export const EXPORT_FIELD_GROUP_OPTIONS = BLOB_EXPORT_FIELD_GROUPS.map(
  (value) => ({ value, ...EXPORT_FIELD_GROUP_LABELS[value] }),
);
