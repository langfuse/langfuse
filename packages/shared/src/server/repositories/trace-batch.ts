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
 * Read full payloads for a project batch without retaining them in memory.
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

  const bounds = props.traces.map((trace) => ({
    traceId: trace.traceId,
    minStart: trace.minStart - TRACE_QUERY_BUFFER_MS,
    maxStart: trace.maxStart + TRACE_QUERY_BUFFER_MS,
  }));
  const traceIds = bounds.map((trace) => trace.traceId);
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
    .selectIO(false)
    .selectMetadataExpanded()
    .selectFieldSet("tools")
    .forceFullTable()
    .whereRaw("e.trace_id IN ({traceIds: Array(String)})", { traceIds })
    .whereRaw(
      `xxHash32(e.trace_id) IN (${bounds.map((_, index) => `xxHash32({traceId${index}: String})`).join(", ")})`,
    )
    .whereRaw(
      "e.start_time >= fromUnixTimestamp64Milli({batchMinStart: Int64}) AND e.start_time <= fromUnixTimestamp64Milli({batchMaxStart: Int64})",
      {
        batchMinStart: Math.min(...bounds.map((trace) => trace.minStart)),
        batchMaxStart: Math.max(...bounds.map((trace) => trace.maxStart)),
      },
    );

  // Keep each trace's bounds even when another trace expands the batch window.
  const tracePredicates: string[] = [];
  const traceParams: Record<string, string | number> = {};
  bounds.forEach((trace, index) => {
    tracePredicates.push(
      `(e.trace_id = {traceId${index}: String} AND e.start_time >= fromUnixTimestamp64Milli({minStart${index}: Int64}) AND e.start_time <= fromUnixTimestamp64Milli({maxStart${index}: Int64}))`,
    );
    traceParams[`traceId${index}`] = trace.traceId;
    traceParams[`minStart${index}`] = trace.minStart;
    traceParams[`maxStart${index}`] = trace.maxStart;
  });
  builder.whereRaw(`(${tracePredicates.join(" OR ")})`, traceParams);

  const { query, params } = builder.buildWithParams();
  yield* queryClickhouseStream<TraceBatchEventRow>({
    query,
    params,
    tags: { projectId: props.projectId },
    preferredClickhouseService: "EventsReadOnly",
    clickhouseSettings: {
      max_threads: 2,
      max_execution_time: 30,
      timeout_overflow_mode: "throw",
    },
  });
}
