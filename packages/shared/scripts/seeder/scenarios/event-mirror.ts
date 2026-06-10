import {
  createEvent,
  EventRecordInsertType,
  ObservationRecordInsertType,
  TraceRecordInsertType,
} from "../../../src/server";

const toMicros = (ms: number | null | undefined): number | null =>
  ms === null || ms === undefined ? null : ms * 1000;

/**
 * Mirrors a v3 observation row into a v4 events_full row so the same logical
 * tree is visible on both read paths (LANGFUSE_MIGRATION_V4_WRITE_MODE).
 * events_core is populated automatically via the events_core_mv materialized
 * view, so writing events_full is sufficient.
 */
export const observationToEvent = (
  observation: ObservationRecordInsertType,
  trace: TraceRecordInsertType,
): EventRecordInsertType => {
  const isRoot = !observation.parent_observation_id;
  const metadata = (observation.metadata ?? {}) as Record<string, string>;
  const metadataNames = Object.keys(metadata).sort();

  return createEvent({
    project_id: observation.project_id,
    trace_id: observation.trace_id ?? trace.id,
    span_id: observation.id,
    id: observation.id,
    parent_span_id: isRoot ? "" : observation.parent_observation_id,
    is_app_root: isRoot,
    name: observation.name ?? "",
    // v4 list/metadata queries filter on trace_name <> '' — without it the
    // mirrored trace is nameless in the events trace list (see the
    // dev-tables.sh backfill for the canonical v3 -> v4 field mapping).
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
    metadata_names: metadataNames,
    metadata_values: metadataNames.map((name) => metadata[name]),
    start_time: toMicros(observation.start_time) ?? Date.now() * 1000,
    end_time: toMicros(observation.end_time),
    completion_start_time: toMicros(observation.completion_start_time),
    created_at: toMicros(observation.created_at) ?? Date.now() * 1000,
    updated_at: toMicros(observation.updated_at) ?? Date.now() * 1000,
    event_ts: toMicros(observation.event_ts) ?? Date.now() * 1000,
    event_bytes:
      Buffer.byteLength(
        typeof observation.input === "string" ? observation.input : "",
        "utf8",
      ) +
      Buffer.byteLength(
        typeof observation.output === "string" ? observation.output : "",
        "utf8",
      ),
    source: "API",
  });
};
