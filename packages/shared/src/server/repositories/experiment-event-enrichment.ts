import { flattenJsonToPathArrays } from "../otel/utils";
import { convertDateToClickhouseDateTime } from "../clickhouse/client";
import { commandClickhouse, queryClickhouse } from "./clickhouse";
import { logger } from "../logger";

const MAX_SPANS_PER_TRACE = 50_000;

const EVENTS_FULL_INSERT_COLUMNS = [
  "project_id",
  "trace_id",
  "span_id",
  "parent_span_id",
  "start_time",
  "end_time",
  "name",
  "type",
  "environment",
  "version",
  "release",
  "trace_name",
  "user_id",
  "session_id",
  "tags",
  "level",
  "status_message",
  "completion_start_time",
  "is_app_root",
  "bookmarked",
  "public",
  "prompt_id",
  "prompt_name",
  "prompt_version",
  "model_id",
  "provided_model_name",
  "model_parameters",
  "provided_usage_details",
  "usage_details",
  "provided_cost_details",
  "cost_details",
  "usage_pricing_tier_id",
  "usage_pricing_tier_name",
  "tool_definitions",
  "tool_calls",
  "tool_call_names",
  "input",
  "output",
  "metadata_names",
  "metadata_values",
  "experiment_id",
  "experiment_name",
  "experiment_metadata_names",
  "experiment_metadata_values",
  "experiment_description",
  "experiment_dataset_id",
  "experiment_item_id",
  "experiment_item_version",
  "experiment_item_expected_output",
  "experiment_item_metadata_names",
  "experiment_item_metadata_values",
  "experiment_item_root_span_id",
  "source",
  "service_name",
  "service_version",
  "scope_name",
  "scope_version",
  "telemetry_sdk_language",
  "telemetry_sdk_name",
  "telemetry_sdk_version",
  "ingestion_api_key",
  "ingestion_sdk_name",
  "ingestion_sdk_version",
  "blob_storage_file_path",
  "event_bytes",
  "created_at",
  "updated_at",
  "event_ts",
  "is_deleted",
] as const;

export type ExperimentEventEnrichmentInput = {
  projectId: string;
  traceId: string;
  rootSpanId?: string | null;
  experimentId: string;
  experimentName: string;
  experimentDescription?: string | null;
  experimentDatasetId: string;
  experimentItemId: string;
  experimentItemVersion?: Date | null;
  experimentItemExpectedOutput?: unknown;
  experimentMetadata?: unknown;
  experimentItemMetadata?: unknown;
};

const asJsonObjectRecord = (value: unknown): Record<string, unknown> => {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
};

const serializeExpectedOutput = (value: unknown): string => {
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "string") {
    return value;
  }
  return JSON.stringify(value);
};

const toStringArray = (values: Array<string | null | undefined>): string[] =>
  values.map((value) => value ?? "");

/**
 * Re-inserts the latest copy of every span in a trace into events_full with
 * experiment_* columns populated. Experiments list and item views only return
 * rows where experiment_id != ''.
 *
 * Uses an append-only ReplacingMergeTree insert (newer event_ts wins).
 */
export const stampExperimentAttributesOnTraceEvents = async (
  input: ExperimentEventEnrichmentInput,
): Promise<{ stamped: boolean }> => {
  const rootSpanId = await resolveExperimentItemRootSpanId(input);
  if (!rootSpanId) {
    logger.info(
      "No events found to stamp with experiment attributes; the link will stay invisible until events exist",
      {
        projectId: input.projectId,
        traceId: input.traceId,
        experimentId: input.experimentId,
      },
    );
    return { stamped: false };
  }

  const experimentMetadata = flattenJsonToPathArrays(
    asJsonObjectRecord(input.experimentMetadata),
  );
  const experimentItemMetadata = flattenJsonToPathArrays(
    asJsonObjectRecord(input.experimentItemMetadata),
  );

  const insertColumns = EVENTS_FULL_INSERT_COLUMNS.join(",\n    ");
  const selectColumns = EVENTS_FULL_INSERT_COLUMNS.map((column) => {
    switch (column) {
      case "experiment_id":
        return "{experimentId: String} AS experiment_id";
      case "experiment_name":
        return "{experimentName: String} AS experiment_name";
      case "experiment_metadata_names":
        return "{experimentMetadataNames: Array(String)} AS experiment_metadata_names";
      case "experiment_metadata_values":
        return "{experimentMetadataValues: Array(String)} AS experiment_metadata_values";
      case "experiment_description":
        return "{experimentDescription: String} AS experiment_description";
      case "experiment_dataset_id":
        return "{experimentDatasetId: String} AS experiment_dataset_id";
      case "experiment_item_id":
        return "{experimentItemId: String} AS experiment_item_id";
      case "experiment_item_version":
        return "{experimentItemVersion: Nullable(DateTime64(3))} AS experiment_item_version";
      case "experiment_item_expected_output":
        return "{experimentItemExpectedOutput: String} AS experiment_item_expected_output";
      case "experiment_item_metadata_names":
        return "{experimentItemMetadataNames: Array(String)} AS experiment_item_metadata_names";
      case "experiment_item_metadata_values":
        return "{experimentItemMetadataValues: Array(String)} AS experiment_item_metadata_values";
      case "experiment_item_root_span_id":
        return "{rootSpanId: String} AS experiment_item_root_span_id";
      case "updated_at":
        return "now64(6) AS updated_at";
      case "event_ts":
        return "now64(6) AS event_ts";
      default:
        return column;
    }
  }).join(",\n    ");

  await commandClickhouse({
    query: `
      INSERT INTO events_full (
        ${insertColumns}
      )
      SELECT
        ${selectColumns}
      FROM events_full
      WHERE project_id = {projectId: String}
        AND trace_id = {traceId: String}
        AND is_deleted = 0
      ORDER BY event_ts DESC
      LIMIT 1 BY span_id
      LIMIT {maxSpans: UInt32}
    `,
    params: {
      projectId: input.projectId,
      traceId: input.traceId,
      experimentId: input.experimentId,
      experimentName: input.experimentName,
      experimentDescription: input.experimentDescription ?? "",
      experimentDatasetId: input.experimentDatasetId,
      experimentItemId: input.experimentItemId,
      experimentItemVersion: input.experimentItemVersion
        ? convertDateToClickhouseDateTime(input.experimentItemVersion)
        : null,
      experimentItemExpectedOutput: serializeExpectedOutput(
        input.experimentItemExpectedOutput,
      ),
      experimentMetadataNames: experimentMetadata.names,
      experimentMetadataValues: toStringArray(experimentMetadata.values),
      experimentItemMetadataNames: experimentItemMetadata.names,
      experimentItemMetadataValues: toStringArray(
        experimentItemMetadata.values,
      ),
      rootSpanId,
      maxSpans: MAX_SPANS_PER_TRACE,
    },
    tags: {
      route: "experiment-event-enrichment",
      projectId: input.projectId,
    },
  });

  return { stamped: true };
};

const resolveExperimentItemRootSpanId = async (
  input: ExperimentEventEnrichmentInput,
): Promise<string | null> => {
  if (input.rootSpanId) {
    return input.rootSpanId;
  }

  const rows = await queryClickhouse<{ span_id: string }>({
    query: `
      SELECT span_id
      FROM events_full
      WHERE project_id = {projectId: String}
        AND trace_id = {traceId: String}
        AND is_deleted = 0
      ORDER BY
        if(parent_span_id = '' OR span_id = concat('t-', {traceId: String}), 0, 1) ASC,
        event_ts DESC
      LIMIT 1
    `,
    params: {
      projectId: input.projectId,
      traceId: input.traceId,
    },
    tags: {
      route: "experiment-event-enrichment.resolve-root",
      projectId: input.projectId,
    },
  });

  return rows[0]?.span_id ?? null;
};
