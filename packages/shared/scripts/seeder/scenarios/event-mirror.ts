import {
  createEvent,
  EventRecordInsertType,
  ObservationRecordInsertType,
  TraceRecordInsertType,
} from "../../../src/server";

const toMicros = (ms: number | null | undefined): number | null =>
  ms === null || ms === undefined ? null : ms * 1000;

const utf8Bytes = (value: unknown): number =>
  typeof value === "string" ? Buffer.byteLength(value, "utf8") : 0;

const sortedMetadata = (metadata: Record<string, string>) => {
  const names = Object.keys(metadata).sort();
  return { names, values: names.map((name) => metadata[name]) };
};

/**
 * Mirrors v3 rows into v4 events_full following the canonical v3 -> v4
 * mapping in clickhouse/scripts/dev-tables.sh: one synthetic trace span per
 * trace (span_id = `t-<traceId>`, parent_span_id = '') carries the trace's
 * name/input/output/metadata — v4 trace-level queries aggregate with
 * `argMaxIf(..., parent_span_id = '')` — and every observation row points at
 * a real parent, with roots re-parented onto the synthetic span. events_core
 * fills automatically via the events_core_mv materialized view.
 */
export const traceToEvent = (
  trace: TraceRecordInsertType,
): EventRecordInsertType => {
  const { names, values } = sortedMetadata(
    (trace.metadata ?? {}) as Record<string, string>,
  );

  return createEvent({
    project_id: trace.project_id,
    trace_id: trace.id,
    span_id: `t-${trace.id}`,
    id: `t-${trace.id}`,
    parent_span_id: "",
    is_app_root: false,
    name: trace.name ?? "",
    trace_name: trace.name ?? "",
    type: "SPAN",
    environment: trace.environment ?? "default",
    level: "DEFAULT",
    status_message: null,
    version: trace.version ?? null,
    release: trace.release ?? null,
    tags: trace.tags ?? [],
    user_id: trace.user_id ?? null,
    session_id: trace.session_id ?? null,
    public: trace.public ?? false,
    bookmarked: trace.bookmarked ?? false,
    input: typeof trace.input === "string" ? trace.input : "",
    output: typeof trace.output === "string" ? trace.output : "",
    provided_model_name: null,
    model_id: null,
    model_parameters: "{}",
    provided_usage_details: {},
    usage_details: {},
    provided_cost_details: {},
    cost_details: {},
    prompt_id: null,
    prompt_name: null,
    prompt_version: null,
    metadata_names: names,
    metadata_values: values,
    start_time: toMicros(trace.timestamp) ?? Date.now() * 1000,
    end_time: null,
    completion_start_time: null,
    created_at: toMicros(trace.created_at) ?? Date.now() * 1000,
    updated_at: toMicros(trace.updated_at) ?? Date.now() * 1000,
    event_ts: toMicros(trace.event_ts) ?? Date.now() * 1000,
    event_bytes: utf8Bytes(trace.input) + utf8Bytes(trace.output),
    source: "API",
  });
};

export const observationToEvent = (
  observation: ObservationRecordInsertType,
  trace: TraceRecordInsertType,
): EventRecordInsertType => {
  const isRoot = !observation.parent_observation_id;
  const { names, values } = sortedMetadata(
    (observation.metadata ?? {}) as Record<string, string>,
  );

  return createEvent({
    project_id: observation.project_id,
    trace_id: observation.trace_id ?? trace.id,
    span_id: observation.id,
    id: observation.id,
    // parent_span_id = '' is reserved for the synthetic trace span; root
    // observations hang off it instead (see traceToEvent above).
    parent_span_id: observation.parent_observation_id ?? `t-${trace.id}`,
    is_app_root: false,
    name: observation.name ?? "",
    trace_name: trace.name ?? "",
    public: trace.public ?? false,
    bookmarked: (trace.bookmarked ?? false) && isRoot,
    type: observation.type,
    environment: observation.environment ?? "default",
    level: observation.level ?? "DEFAULT",
    status_message: observation.status_message ?? null,
    version: observation.version ?? null,
    release: trace.release ?? null,
    tags: trace.tags ?? [],
    user_id: trace.user_id ?? null,
    session_id: trace.session_id ?? null,
    input: typeof observation.input === "string" ? observation.input : "",
    output: typeof observation.output === "string" ? observation.output : "",
    provided_model_name: observation.provided_model_name ?? null,
    model_id: null,
    model_parameters: observation.model_parameters ?? "{}",
    provided_usage_details: observation.provided_usage_details ?? {},
    usage_details: observation.usage_details ?? {},
    provided_cost_details: observation.provided_cost_details ?? {},
    cost_details: observation.cost_details ?? {},
    prompt_id: observation.prompt_id ?? null,
    prompt_name: observation.prompt_name ?? null,
    prompt_version: observation.prompt_version ?? null,
    metadata_names: names,
    metadata_values: values,
    start_time: toMicros(observation.start_time) ?? Date.now() * 1000,
    end_time: toMicros(observation.end_time),
    completion_start_time: toMicros(observation.completion_start_time),
    created_at: toMicros(observation.created_at) ?? Date.now() * 1000,
    updated_at: toMicros(observation.updated_at) ?? Date.now() * 1000,
    event_ts: toMicros(observation.event_ts) ?? Date.now() * 1000,
    event_bytes: utf8Bytes(observation.input) + utf8Bytes(observation.output),
    source: "API",
  });
};
