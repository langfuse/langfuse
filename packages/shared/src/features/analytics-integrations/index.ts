// Export source options for analytics integrations (PostHog, Mixpanel, Blob Storage)
// This is a client-safe file that can be imported from @langfuse/shared

import { AnalyticsIntegrationExportSource } from "@prisma/client";
import {
  LEGACY_OBSERVATION_EXPORT_FIELDS,
  OBSERVATION_FIELD_GROUPS_FULL,
  type ObservationFieldGroupFull,
} from "../../domain/observation-field-groups";

export * from "./blob-export-gate";
export * from "./blob-export-tuning";

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

// Keyed by ObservationFieldGroupFull so TypeScript errors if a group is added
// to OBSERVATION_FIELD_GROUPS_FULL without a corresponding label/description here.
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
    description:
      "provided_model_name, model_id, model_parameters, input_price, output_price, total_price",
  },
  usage: {
    label: "Usage",
    description:
      "usage_details, cost_details, total_cost, usage_pricing_tier_id, usage_pricing_tier_name",
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
    description: "tags, release, trace_name",
  },
} satisfies Record<
  ObservationFieldGroupFull,
  { label: string; description: string }
>;

// Pricing fields added by the export enrichment (not part of the SQL contract)
// whenever the model group is selected — for both export paths.
const MODEL_ENRICHMENT_FIELDS = ["input_price", "output_price", "total_price"];

const legacyFieldsForGroup = (group: ObservationFieldGroupFull): string[] =>
  LEGACY_OBSERVATION_EXPORT_FIELDS.filter((f) => f.group === group).map(
    (f) => f.field,
  );

const joinFields = (fields: string[]): string =>
  fields.length > 0
    ? fields.join(", ")
    : "Not included in the legacy observations export";

const withoutPrices = (csv: string): string =>
  csv
    .split(", ")
    .filter((field) => !MODEL_ENRICHMENT_FIELDS.includes(field))
    .join(", ");

// EXPORT_FIELD_GROUP_LABELS describes the enriched schema; the legacy
// observations table is narrower. Derive legacy from the export contract so it
// stays in sync. The legacy standard export still enriches model prices, so
// they're listed here.
const legacyDescriptionForGroup = (
  group: ObservationFieldGroupFull,
): string => {
  const fields = legacyFieldsForGroup(group);
  if (group === "model") fields.push(...MODEL_ENRICHMENT_FIELDS);
  return joinFields(fields);
};

// Parquet runs no JS enrichment, so model price columns are absent. The two
// variants differ by source: enriched parquet uses the enriched schema, legacy
// parquet the (already narrower) legacy schema.
const parquetDescriptionForGroup = (group: ObservationFieldGroupFull): string =>
  withoutPrices(EXPORT_FIELD_GROUP_LABELS[group].description);

const legacyParquetDescriptionForGroup = (
  group: ObservationFieldGroupFull,
): string => joinFields(legacyFieldsForGroup(group));

export const EXPORT_FIELD_GROUP_OPTIONS = OBSERVATION_FIELD_GROUPS_FULL.map(
  (value) => ({
    value,
    ...EXPORT_FIELD_GROUP_LABELS[value],
    legacyDescription: legacyDescriptionForGroup(value),
    parquetDescription: parquetDescriptionForGroup(value),
    legacyParquetDescription: legacyParquetDescriptionForGroup(value),
  }),
);
