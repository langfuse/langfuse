import {
  greptimeBool,
  greptimeDate,
  greptimeJson,
  greptimeString,
  requireGreptimeDate,
  requireGreptimeString,
  selectJsonColumn,
} from "../../greptime/sql/rowContract";
import { quoteIdent } from "../../greptime/schemaUtils";
import { parseMetadataCHRecordToDomain } from "../../utils/metadata_conversion";
import {
  type RenderingProps,
  DEFAULT_RENDERING_PROPS,
  applyInputOutputRendering,
} from "../../utils/rendering";
import { parseJsonPrioritised } from "../../../utils/json";
import {
  type TraceDomain,
  type Observation,
  type ObservationType,
  type ObservationLevelType,
  type ScoreByDataType,
  type ScoreDataTypeType,
  type ScoreSourceType,
} from "../../../domain";
import {
  reduceUsageOrCostDetails,
  convertNumericRecord,
} from "../observations_converters";

/**
 * GreptimeDB row -> domain converters (04-read-path.md, P1). Unlike the ClickHouse converters these
 * read the GreptimeDB MySQL-wire row contract directly (`rowContract.ts`): timestamps already arrive
 * as JS `Date` (the read pool is pinned to UTC), JSON columns are projected through `json_to_string`
 * and parsed, BOOLEAN comes back as 0/1. Required columns fail fast rather than coercing to null.
 *
 * Metadata is reversed with the SAME `parseMetadataCHRecordToDomain` the ClickHouse path uses — not
 * a CH-shape assumption: the write path stores the projection `metadata` JSON column as the
 * `Record<string,string>` (key -> JSON-encoded value) shape (`GreptimeWriter.traceRow` etc.), so the
 * reverse is identical.
 */

type Row = Record<string, unknown>;

// ---------------------------------------------------------------------------
// SELECT-list builders (JSON columns MUST be projected through json_to_string)
// ---------------------------------------------------------------------------

const buildSelectList = (
  scalarCols: readonly string[],
  jsonCols: readonly string[],
  prefix?: string,
): string =>
  [
    ...scalarCols.map((c) =>
      prefix ? `${prefix}.${quoteIdent(c)}` : quoteIdent(c),
    ),
    ...jsonCols.map((c) =>
      selectJsonColumn(c, prefix ? { tablePrefix: prefix } : undefined),
    ),
  ].join(", ");

const TRACE_SCALAR_BASE = [
  "timestamp",
  "project_id",
  "id",
  "name",
  "environment",
  "session_id",
  "user_id",
  "release",
  "version",
  "bookmarked",
  "public",
  "created_at",
  "updated_at",
] as const;

export const greptimeTraceSelect = (opts?: {
  prefix?: string;
  excludeIo?: boolean;
  excludeMetadata?: boolean;
}): string => {
  const scalar: string[] = [...TRACE_SCALAR_BASE];
  if (!opts?.excludeIo) scalar.push("input", "output");
  const json = opts?.excludeMetadata ? ["tags"] : ["tags", "metadata"];
  return buildSelectList(scalar, json, opts?.prefix);
};

const OBSERVATION_SCALAR_BASE = [
  "start_time",
  "project_id",
  "id",
  "type",
  "trace_id",
  "parent_observation_id",
  "environment",
  "name",
  "level",
  "status_message",
  "version",
  "end_time",
  "completion_start_time",
  "provided_model_name",
  "internal_model_id",
  "usage_pricing_tier_id",
  "usage_pricing_tier_name",
  "prompt_id",
  "prompt_name",
  "prompt_version",
  "created_at",
  "updated_at",
] as const;

const OBSERVATION_JSON_BASE = [
  "model_parameters",
  "usage_details",
  "cost_details",
  "provided_usage_details",
  "provided_cost_details",
  "tool_definitions",
  "tool_calls",
  "tool_call_names",
] as const;

export const greptimeObservationSelect = (opts?: {
  prefix?: string;
  excludeIo?: boolean;
  excludeMetadata?: boolean;
}): string => {
  const scalar: string[] = [...OBSERVATION_SCALAR_BASE];
  if (!opts?.excludeIo) scalar.push("input", "output");
  const json = opts?.excludeMetadata
    ? [...OBSERVATION_JSON_BASE]
    : [...OBSERVATION_JSON_BASE, "metadata"];
  return buildSelectList(scalar, json, opts?.prefix);
};

const SCORE_SCALAR_BASE = [
  "timestamp",
  "project_id",
  "id",
  "name",
  "environment",
  "source",
  "data_type",
  "value",
  "string_value",
  "long_string_value",
  "comment",
  "trace_id",
  "observation_id",
  "session_id",
  "dataset_run_id",
  "execution_trace_id",
  "author_user_id",
  "config_id",
  "queue_id",
  "created_at",
  "updated_at",
] as const;

export const greptimeScoreSelect = (opts?: {
  prefix?: string;
  excludeMetadata?: boolean;
}): string => {
  const json = opts?.excludeMetadata ? [] : ["metadata"];
  return buildSelectList(SCORE_SCALAR_BASE, json, opts?.prefix);
};

// ---------------------------------------------------------------------------
// row -> domain
// ---------------------------------------------------------------------------

export const convertGreptimeTraceRowToDomain = (
  row: Row,
  renderingProps: RenderingProps = DEFAULT_RENDERING_PROPS,
): TraceDomain => ({
  id: requireGreptimeString(row.id, "traces.id"),
  projectId: requireGreptimeString(row.project_id, "traces.project_id"),
  name: greptimeString(row.name),
  timestamp: requireGreptimeDate(row.timestamp, "traces.timestamp"),
  environment: requireGreptimeString(row.environment, "traces.environment"),
  tags: greptimeJson<string[]>(row.tags, []),
  bookmarked: greptimeBool(row.bookmarked),
  public: greptimeBool(row.public),
  release: greptimeString(row.release),
  version: greptimeString(row.version),
  userId: greptimeString(row.user_id),
  sessionId: greptimeString(row.session_id),
  input: applyInputOutputRendering(greptimeString(row.input), renderingProps),
  output: applyInputOutputRendering(greptimeString(row.output), renderingProps),
  metadata: parseMetadataCHRecordToDomain(
    greptimeJson<Record<string, string>>(row.metadata, {}),
  ),
  createdAt: requireGreptimeDate(row.created_at, "traces.created_at"),
  updatedAt: requireGreptimeDate(row.updated_at, "traces.updated_at"),
});

/** model_parameters is free-form: JSON.parse when it is JSON text, else keep the raw value. */
const parseModelParameters = (v: unknown): Observation["modelParameters"] => {
  if (v == null) return null;
  if (typeof v === "string") {
    if (v === "") return null;
    return (parseJsonPrioritised(v) ?? v) as Observation["modelParameters"];
  }
  return v as Observation["modelParameters"];
};

export const convertGreptimeObservationRowToDomain = (
  row: Row,
  renderingProps: RenderingProps = DEFAULT_RENDERING_PROPS,
): Observation => {
  const startTime = requireGreptimeDate(
    row.start_time,
    "observations.start_time",
  );
  const endTime = greptimeDate(row.end_time);
  const completionStartTime = greptimeDate(row.completion_start_time);

  const usage = greptimeJson<Record<string, number>>(row.usage_details, {});
  const cost = greptimeJson<Record<string, number>>(row.cost_details, {});
  const reducedUsage = reduceUsageOrCostDetails(usage);
  const reducedCost = reduceUsageOrCostDetails(cost);

  return {
    id: requireGreptimeString(row.id, "observations.id"),
    traceId: greptimeString(row.trace_id),
    projectId: requireGreptimeString(row.project_id, "observations.project_id"),
    environment: requireGreptimeString(
      row.environment,
      "observations.environment",
    ),
    type: requireGreptimeString(
      row.type,
      "observations.type",
    ) as ObservationType,
    startTime,
    endTime,
    name: greptimeString(row.name),
    metadata: parseMetadataCHRecordToDomain(
      greptimeJson<Record<string, string>>(row.metadata, {}),
    ),
    parentObservationId: greptimeString(row.parent_observation_id),
    level: (greptimeString(row.level) ?? "DEFAULT") as ObservationLevelType,
    statusMessage: greptimeString(row.status_message),
    version: greptimeString(row.version),
    createdAt: requireGreptimeDate(row.created_at, "observations.created_at"),
    updatedAt: requireGreptimeDate(row.updated_at, "observations.updated_at"),
    model: greptimeString(row.provided_model_name),
    internalModelId: greptimeString(row.internal_model_id),
    modelParameters: parseModelParameters(row.model_parameters),
    input: applyInputOutputRendering(greptimeString(row.input), renderingProps),
    output: applyInputOutputRendering(
      greptimeString(row.output),
      renderingProps,
    ),
    completionStartTime,
    promptId: greptimeString(row.prompt_id),
    promptName: greptimeString(row.prompt_name),
    promptVersion:
      row.prompt_version == null ? null : Number(row.prompt_version),
    latency: endTime ? (endTime.getTime() - startTime.getTime()) / 1000 : null,
    timeToFirstToken: completionStartTime
      ? (completionStartTime.getTime() - startTime.getTime()) / 1000
      : null,
    providedUsageDetails: convertNumericRecord(
      greptimeJson<Record<string, number>>(row.provided_usage_details, {}),
    ),
    usageDetails: convertNumericRecord(usage),
    costDetails: convertNumericRecord(cost),
    providedCostDetails: convertNumericRecord(
      greptimeJson<Record<string, number>>(row.provided_cost_details, {}),
    ),
    inputCost: reducedCost.input,
    outputCost: reducedCost.output,
    totalCost: reducedCost.total,
    inputUsage: reducedUsage.input ?? 0,
    outputUsage: reducedUsage.output ?? 0,
    totalUsage: reducedUsage.total ?? 0,
    usagePricingTierId: greptimeString(row.usage_pricing_tier_id),
    usagePricingTierName: greptimeString(row.usage_pricing_tier_name),
    toolDefinitions: greptimeJson<Record<string, string> | null>(
      row.tool_definitions,
      null,
    ),
    toolCalls: greptimeJson<string[] | null>(row.tool_calls, null),
    toolCallNames: greptimeJson<string[] | null>(row.tool_call_names, null),
  };
};

export const convertGreptimeScoreRowToDomain = <
  DataType extends ScoreDataTypeType = ScoreDataTypeType,
>(
  row: Row,
  includeMetadataPayload: boolean = true,
): ScoreByDataType<DataType> => {
  const dataType = requireGreptimeString(
    row.data_type,
    "scores.data_type",
  ) as DataType;

  const baseScore = {
    id: requireGreptimeString(row.id, "scores.id"),
    timestamp: requireGreptimeDate(row.timestamp, "scores.timestamp"),
    projectId: requireGreptimeString(row.project_id, "scores.project_id"),
    environment: requireGreptimeString(row.environment, "scores.environment"),
    traceId: greptimeString(row.trace_id),
    sessionId: greptimeString(row.session_id),
    observationId: greptimeString(row.observation_id),
    datasetRunId: greptimeString(row.dataset_run_id),
    name: requireGreptimeString(row.name, "scores.name"),
    value: row.value == null ? 0 : Number(row.value),
    longStringValue: greptimeString(row.long_string_value) ?? "",
    source: requireGreptimeString(
      row.source,
      "scores.source",
    ) as ScoreSourceType,
    comment: greptimeString(row.comment),
    authorUserId: greptimeString(row.author_user_id),
    configId: greptimeString(row.config_id),
    dataType,
    queueId: greptimeString(row.queue_id),
    executionTraceId: greptimeString(row.execution_trace_id),
    createdAt: requireGreptimeDate(row.created_at, "scores.created_at"),
    updatedAt: requireGreptimeDate(row.updated_at, "scores.updated_at"),
    metadata: (includeMetadataPayload
      ? parseMetadataCHRecordToDomain(
          greptimeJson<Record<string, string>>(row.metadata, {}),
        )
      : {}) as NonNullable<ReturnType<typeof parseMetadataCHRecordToDomain>>,
  };

  if (dataType === "NUMERIC" || dataType === "CORRECTION") {
    return {
      ...baseScore,
      stringValue: null,
    } as ScoreByDataType<DataType>;
  }
  return {
    ...baseScore,
    stringValue: greptimeString(row.string_value) ?? "",
  } as ScoreByDataType<DataType>;
};
