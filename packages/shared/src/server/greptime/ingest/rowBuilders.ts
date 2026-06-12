import {
  type DatasetRunItemRecordInsertType,
  type ObservationRecordInsertType,
  type ScoreRecordInsertType,
  type TraceRecordInsertType,
} from "../../repositories/definitions";
import { GreptimeTable } from "./tableSchemas";

/**
 * Record -> GreptimeDB gRPC row mappers + EAV fan-out (02-write-path.md, step 5).
 *
 * Extracted from the worker `GreptimeWriter` so the worker write path and the shared
 * seeder produce byte-identical projection + EAV rows. A logical entity fans out to its
 * projection row plus EAV subtable rows (metadata key/value, tags); `buildGreptimeRowsForRecord`
 * is the single reusable unit both call sites use.
 */

export type GreptimeRow = Record<string, unknown>;

/** A projection/EAV physical table name paired with the rows destined for it. */
export type GreptimeTableRows = { table: string; rows: GreptimeRow[] };

const jsonOrNull = (v: unknown): string | null =>
  v == null ? null : typeof v === "string" ? v : JSON.stringify(v);

const num = (v: number | null | undefined): number | null => v ?? null;

export const traceRow = (r: TraceRecordInsertType): GreptimeRow => ({
  project_id: r.project_id,
  id: r.id,
  timestamp: r.timestamp,
  name: r.name ?? null,
  environment: r.environment,
  session_id: r.session_id ?? null,
  user_id: r.user_id ?? null,
  release: r.release ?? null,
  version: r.version ?? null,
  tags: jsonOrNull(r.tags ?? []),
  metadata: jsonOrNull(r.metadata ?? {}),
  bookmarked: r.bookmarked ?? null,
  public: r.public ?? null,
  input: r.input ?? null,
  output: r.output ?? null,
  created_at: r.created_at,
  updated_at: r.updated_at,
  is_deleted: Boolean(r.is_deleted),
});

export const observationRow = (r: ObservationRecordInsertType): GreptimeRow => {
  const cost = r.cost_details ?? {};
  const usage = r.usage_details ?? {};
  return {
    project_id: r.project_id,
    id: r.id,
    start_time: r.start_time,
    type: r.type ?? null,
    trace_id: r.trace_id ?? null,
    parent_observation_id: r.parent_observation_id ?? null,
    environment: r.environment,
    name: r.name ?? null,
    level: r.level ?? null,
    status_message: r.status_message ?? null,
    version: r.version ?? null,
    end_time: num(r.end_time),
    completion_start_time: num(r.completion_start_time),
    provided_model_name: r.provided_model_name ?? null,
    internal_model_id: r.internal_model_id ?? null,
    model_parameters: jsonOrNull(r.model_parameters),
    input: r.input ?? null,
    output: r.output ?? null,
    metadata: jsonOrNull(r.metadata ?? {}),
    // Flattened cost/usage columns; full maps preserved in the JSON columns below.
    input_cost: num(cost["input"]),
    output_cost: num(cost["output"]),
    total_cost: num(r.total_cost ?? cost["total"]),
    input_usage: num(usage["input"]),
    output_usage: num(usage["output"]),
    total_usage: num(usage["total"]),
    usage_details: jsonOrNull(usage),
    cost_details: jsonOrNull(cost),
    provided_usage_details: jsonOrNull(r.provided_usage_details ?? {}),
    provided_cost_details: jsonOrNull(r.provided_cost_details ?? {}),
    usage_pricing_tier_id: r.usage_pricing_tier_id ?? null,
    usage_pricing_tier_name: r.usage_pricing_tier_name ?? null,
    prompt_id: r.prompt_id ?? null,
    prompt_name: r.prompt_name ?? null,
    prompt_version: num(r.prompt_version),
    tool_definitions: jsonOrNull(r.tool_definitions ?? {}),
    tool_calls: jsonOrNull(r.tool_calls ?? []),
    tool_call_names: jsonOrNull(r.tool_call_names ?? []),
    created_at: r.created_at,
    updated_at: r.updated_at,
    is_deleted: Boolean(r.is_deleted),
  };
};

export const scoreRow = (r: ScoreRecordInsertType): GreptimeRow => ({
  project_id: r.project_id,
  id: r.id,
  timestamp: r.timestamp,
  name: r.name,
  environment: r.environment,
  source: r.source,
  data_type: r.data_type,
  value: r.value ?? null,
  string_value: r.string_value ?? null,
  long_string_value: r.long_string_value ?? null,
  comment: r.comment ?? null,
  metadata: jsonOrNull(r.metadata ?? {}),
  trace_id: r.trace_id ?? null,
  observation_id: r.observation_id ?? null,
  session_id: r.session_id ?? null,
  dataset_run_id: r.dataset_run_id ?? null,
  execution_trace_id: r.execution_trace_id ?? null,
  author_user_id: r.author_user_id ?? null,
  config_id: r.config_id ?? null,
  queue_id: r.queue_id ?? null,
  created_at: r.created_at,
  updated_at: r.updated_at,
  is_deleted: Boolean(r.is_deleted),
});

export const datasetRunItemRow = (
  r: DatasetRunItemRecordInsertType,
): GreptimeRow => ({
  project_id: r.project_id,
  id: r.id,
  dataset_run_created_at: r.dataset_run_created_at,
  dataset_id: r.dataset_id ?? null,
  dataset_run_id: r.dataset_run_id ?? null,
  dataset_item_id: r.dataset_item_id ?? null,
  trace_id: r.trace_id ?? null,
  observation_id: r.observation_id ?? null,
  error: r.error ?? null,
  dataset_run_name: r.dataset_run_name ?? null,
  dataset_run_description: r.dataset_run_description ?? null,
  dataset_run_metadata: jsonOrNull(r.dataset_run_metadata ?? {}),
  dataset_item_input: r.dataset_item_input ?? null,
  dataset_item_expected_output: r.dataset_item_expected_output ?? null,
  dataset_item_metadata: jsonOrNull(r.dataset_item_metadata ?? {}),
  dataset_item_version: num(r.dataset_item_version),
  created_at: r.created_at,
  updated_at: r.updated_at,
  is_deleted: Boolean(r.is_deleted),
});

export const metadataRows = (params: {
  metadata: Record<string, string> | undefined;
  projectId: string;
  entityId: string;
  timestamp: number;
  isDeleted: boolean;
}): GreptimeRow[] =>
  Object.entries(params.metadata ?? {}).map(([key, value]) => ({
    project_id: params.projectId,
    entity_id: params.entityId,
    key,
    timestamp: params.timestamp,
    value: value ?? null,
    is_deleted: params.isDeleted,
  }));

export const tagRows = (params: {
  tags: string[] | undefined;
  projectId: string;
  entityId: string;
  timestamp: number;
  isDeleted: boolean;
}): GreptimeRow[] =>
  (params.tags ?? []).map((tag) => ({
    project_id: params.projectId,
    entity_id: params.entityId,
    tag,
    timestamp: params.timestamp,
    is_deleted: params.isDeleted,
  }));

/**
 * Map a logical record to all physical rows it produces: the projection row plus its EAV
 * subtable rows (traces -> traces + traces_metadata + traces_tags; observations -> observations
 * + observations_metadata; scores -> scores + scores_metadata; dataset_run_items -> projection
 * only, metadata is display-only JSON). Empty EAV groups are omitted so callers don't emit
 * no-op writes. This is the shared fan-out both the worker writer and the seeder rely on.
 */
export const buildGreptimeRowsForRecord = (
  table: GreptimeTable,
  record:
    | TraceRecordInsertType
    | ObservationRecordInsertType
    | ScoreRecordInsertType
    | DatasetRunItemRecordInsertType,
): GreptimeTableRows[] => {
  const out: GreptimeTableRows[] = [];
  const pushRows = (name: string, rows: GreptimeRow[]) => {
    if (rows.length > 0) out.push({ table: name, rows });
  };

  switch (table) {
    case GreptimeTable.Traces: {
      const r = record as TraceRecordInsertType;
      out.push({ table: "traces", rows: [traceRow(r)] });
      pushRows(
        "traces_metadata",
        metadataRows({
          metadata: r.metadata,
          projectId: r.project_id,
          entityId: r.id,
          timestamp: r.timestamp,
          isDeleted: Boolean(r.is_deleted),
        }),
      );
      pushRows(
        "traces_tags",
        tagRows({
          tags: r.tags,
          projectId: r.project_id,
          entityId: r.id,
          timestamp: r.timestamp,
          isDeleted: Boolean(r.is_deleted),
        }),
      );
      break;
    }
    case GreptimeTable.Observations: {
      const r = record as ObservationRecordInsertType;
      out.push({ table: "observations", rows: [observationRow(r)] });
      pushRows(
        "observations_metadata",
        metadataRows({
          metadata: r.metadata,
          projectId: r.project_id,
          entityId: r.id,
          timestamp: r.start_time,
          isDeleted: Boolean(r.is_deleted),
        }),
      );
      break;
    }
    case GreptimeTable.Scores: {
      const r = record as ScoreRecordInsertType;
      out.push({ table: "scores", rows: [scoreRow(r)] });
      pushRows(
        "scores_metadata",
        metadataRows({
          metadata: r.metadata,
          projectId: r.project_id,
          entityId: r.id,
          timestamp: r.timestamp,
          isDeleted: Boolean(r.is_deleted),
        }),
      );
      break;
    }
    case GreptimeTable.DatasetRunItems: {
      out.push({
        table: "dataset_run_items",
        rows: [datasetRunItemRow(record as DatasetRunItemRecordInsertType)],
      });
      break;
    }
  }
  return out;
};
