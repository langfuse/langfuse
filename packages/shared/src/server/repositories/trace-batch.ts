import { EventsQueryBuilder } from "../queries/clickhouse-sql/event-query-builder";
import { queryClickhouseStream } from "./clickhouse";

type TraceBatchEventRow = {
  trace_id: string;
  span_id: string;
  parent_span_id: string | null;
  start_time: string;
  event_ts: string;
  type: string;
  name: string;
  input: string;
  output: string;
  metadata: Record<string, string>;
  tool_definitions: Record<string, string>;
  tool_calls: string[];
  tool_call_names: string[];
};

const TRACE_QUERY_BUFFER_MS = 2 * 60_000;

/**
 * Stream full events_full payloads into the worker without retaining a whole batch.
 * Rows reflect the events table's current merge state, as in other event reads;
 * this read-only experiment does not deduplicate versions or enrich model data.
 */
export async function* getTraceBatchEventStream(props: {
  projectId: string;
  traces: ReadonlyArray<{
    traceId: string;
    minStart: number;
    maxStart: number;
  }>;
}): AsyncGenerator<TraceBatchEventRow> {
  if (props.traces.length === 0) return;

  const traceIds = props.traces.map((trace) => trace.traceId);
  const builder = new EventsQueryBuilder({ projectId: props.projectId })
    .selectRaw(
      "e.trace_id",
      "e.span_id",
      "e.parent_span_id",
      "e.start_time",
      "e.event_ts",
      "e.type",
      "e.name",
    )
    // Load full input/output (false = no truncation) and every metadata key.
    .selectIO(false)
    .selectMetadataExpanded()
    .selectFieldSet("tools")
    // Read events_full rather than the smaller, truncated events_core table.
    .forceFullTable()
    .whereRaw("e.trace_id IN ({traceIds: Array(String)})", { traceIds })
    // Equality filters add this primary-key hash condition automatically; IN
    // needs it explicitly. The exact IDs above also exclude hash collisions.
    .whereRaw(
      "xxHash32(e.trace_id) IN (SELECT arrayJoin(arrayMap(id -> xxHash32(id), {traceIds: Array(String)})))",
    )
    // One shared window enables partition/granule pruning. It can include
    // observations beyond a selected trace's own bounds when another trace
    // widens the batch window; per-trace predicates can narrow that coverage.
    .whereRaw(
      "e.start_time >= fromUnixTimestamp64Milli({batchMinStart: Int64}) AND e.start_time <= fromUnixTimestamp64Milli({batchMaxStart: Int64})",
      {
        batchMinStart:
          Math.min(...props.traces.map((trace) => trace.minStart)) -
          TRACE_QUERY_BUFFER_MS,
        batchMaxStart:
          Math.max(...props.traces.map((trace) => trace.maxStart)) +
          TRACE_QUERY_BUFFER_MS,
      },
    );

  const { query, params } = builder.buildWithParams();
  yield* queryClickhouseStream<TraceBatchEventRow>({
    query,
    params,
    tags: { projectId: props.projectId },
    preferredClickhouseService: "EventsReadOnly",
    // Bound background-read CPU/time; timeouts fail instead of returning partial results.
    clickhouseSettings: {
      max_threads: 2,
      max_execution_time: 30,
      timeout_overflow_mode: "throw",
    },
  });
}
