import {
  EventsQueryBuilder,
  NoProjectId,
} from "../queries/clickhouse-sql/event-query-builder";
import { queryClickhouseStream, TupleParam } from "./clickhouse";

export type EventsDispatchEventRow = {
  project_id: string;
  trace_id: string;
  session_id: string;
  environment: string;
  trace_name: string;
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
  level: string;
  status_message: string | null;
};

const TRACE_QUERY_BUFFER_MS = 2 * 60_000;
// Chunk sizes keep a 10,000-trace job with UUID-sized IDs under ClickHouse's
// default 1,000 HTTP fields and 128 KiB per field. Unrolling one predicate per
// window would also exceed default max_query_size.
const TIME_GROUP_PARAM_CHUNK_SIZE = 50;
const TRACE_ID_PARAM_CHUNK_SIZE = 2_000;
const TRACE_PAIR_PARAM_CHUNK_SIZE = 1_000;

const chunkItems = <T>(items: readonly T[], size: number) => {
  const chunks: T[][] = [];
  for (let offset = 0; offset < items.length; offset += size) {
    chunks.push(items.slice(offset, offset + size));
  }
  return chunks;
};

type EventsDispatchEventStreamProps = {
  traces: ReadonlyArray<{
    projectId: string;
    traceId: string;
    minStart: number;
    maxStart: number;
  }>;
};

const buildEventsDispatchEventQuery = (
  props: EventsDispatchEventStreamProps,
) => {
  // Bound the total IDs before grouping: one popular time window may contain
  // the entire job, and still must fit into a single HTTP parameter field.
  const timeGroupChunks = chunkItems(
    props.traces,
    TRACE_ID_PARAM_CHUNK_SIZE,
  ).flatMap((traceChunk) => {
    const bufferedGroups = new Map<
      string,
      {
        projectId: string;
        minStart: number;
        maxStart: number;
        traceIds: Set<string>;
      }
    >();
    for (const trace of traceChunk) {
      const minStart = trace.minStart - TRACE_QUERY_BUFFER_MS;
      const maxStart = trace.maxStart + TRACE_QUERY_BUFFER_MS;
      const key = JSON.stringify([trace.projectId, minStart, maxStart]);
      const group = bufferedGroups.get(key);
      if (group) {
        group.traceIds.add(trace.traceId);
      } else {
        bufferedGroups.set(key, {
          projectId: trace.projectId,
          minStart,
          maxStart,
          traceIds: new Set([trace.traceId]),
        });
      }
    }
    return chunkItems(
      [...bufferedGroups.values()],
      TIME_GROUP_PARAM_CHUNK_SIZE,
    );
  });
  const timeGroupParams: Record<string, unknown> = {};
  const timeGroupPredicates: string[] = [];
  for (const [chunkIndex, chunk] of timeGroupChunks.entries()) {
    const projectParam = `g${chunkIndex}p`;
    const tracesParam = `g${chunkIndex}t`;
    const minParam = `g${chunkIndex}l`;
    const maxParam = `g${chunkIndex}u`;
    timeGroupParams[projectParam] = chunk.map(({ projectId }) => projectId);
    timeGroupParams[tracesParam] = chunk.map(({ traceIds }) => [...traceIds]);
    timeGroupParams[minParam] = chunk.map(({ minStart }) => minStart);
    timeGroupParams[maxParam] = chunk.map(({ maxStart }) => maxStart);
    timeGroupPredicates.push(
      `arrayExists((group_project_id, group_trace_ids, min_ms, max_ms) -> e.project_id = group_project_id AND has(group_trace_ids, e.trace_id) AND e.start_time BETWEEN fromUnixTimestamp64Milli(min_ms) AND fromUnixTimestamp64Milli(max_ms), {${projectParam}:Array(String)}, {${tracesParam}:Array(Array(String))}, {${minParam}:Array(Int64)}, {${maxParam}:Array(Int64)})`,
    );
  }
  const projectIds = [...new Set(props.traces.map((trace) => trace.projectId))];
  const traceIds = [...new Set(props.traces.map((trace) => trace.traceId))];
  const projectParams: Record<string, unknown> = {};
  const projectPredicates = chunkItems(
    projectIds,
    TRACE_ID_PARAM_CHUNK_SIZE,
  ).map((chunk, index) => {
    const name = `projectIds${index}`;
    projectParams[name] = chunk;
    return `e.project_id IN ({${name}: Array(String)})`;
  });
  const traceIdParams: Record<string, unknown> = {};
  const traceIdPredicates = chunkItems(traceIds, TRACE_ID_PARAM_CHUNK_SIZE).map(
    (chunk, index) => {
      const name = `traceIds${index}`;
      traceIdParams[name] = chunk;
      return `e.trace_id IN ({${name}: Array(String)})`;
    },
  );
  const hashPredicates = Object.keys(traceIdParams).map(
    (name) =>
      `xxHash32(e.trace_id) IN (SELECT arrayJoin(arrayMap(id -> xxHash32(id), {${name}: Array(String)})))`,
  );
  const pairParams: Record<string, unknown> = {};
  const pairPredicates = chunkItems(
    props.traces,
    TRACE_PAIR_PARAM_CHUNK_SIZE,
  ).map((chunk, index) => {
    const name = `tracePairs${index}`;
    pairParams[name] = chunk.map(
      ({ projectId, traceId }) => new TupleParam([projectId, traceId]),
    );
    return `(e.project_id, e.trace_id) IN {${name}: Array(Tuple(String, String))}`;
  });
  const builder = new EventsQueryBuilder({ projectId: NoProjectId })
    .selectRaw(
      "e.project_id",
      "e.trace_id",
      "e.session_id",
      "e.environment",
      "e.trace_name",
      "e.span_id",
      "e.parent_span_id",
      "e.start_time",
      "e.event_ts",
      "e.type",
      "e.name",
      // The Topics renderer turns ERROR/WARNING levels into transcript error signals.
      "e.level",
      "e.status_message",
    )
    // Load full input/output (false = no truncation) and every metadata key.
    .selectIO(false)
    .selectMetadataExpanded()
    .selectFieldSet("tools")
    // Read events_full rather than the smaller, truncated events_core table.
    .forceFullTable()
    // Separate filters retain project-prefix and trace-index pruning.
    .whereRaw(`(${projectPredicates.join(" OR ")})`, projectParams)
    .whereRaw(`(${traceIdPredicates.join(" OR ")})`, traceIdParams)
    // Independent IN lists also match crossed pairs. Only these exact tenant/
    // trace pairs may return payloads, even when projects share trace IDs.
    .whereRaw(`(${pairPredicates.join(" OR ")})`, pairParams)
    // Equality filters add this primary-key hash condition automatically; IN
    // needs it explicitly. The exact IDs above also exclude hash collisions.
    .whereRaw(`(${hashPredicates.join(" OR ")})`)
    // Keep one shared outer window for partition/granule pruning.
    .whereRaw(
      "e.start_time >= fromUnixTimestamp64Milli({batchMinStart: Int64}) AND e.start_time <= fromUnixTimestamp64Milli({batchMaxStart: Int64})",
      {
        batchMinStart:
          Math.min(...props.traces.map(({ minStart }) => minStart)) -
          TRACE_QUERY_BUFFER_MS,
        batchMaxStart:
          Math.max(...props.traces.map(({ maxStart }) => maxStart)) +
          TRACE_QUERY_BUFFER_MS,
      },
    )
    // Batch companions must not widen another trace's required coverage.
    // Identical project/time windows share one ID list; repeated pair intervals
    // remain separate OR branches and therefore return each matching row once.
    .whereRaw(
      `(${timeGroupPredicates.join(`
      OR `)})`,
      timeGroupParams,
    )
    // Keep each tenant/trace contiguous across time buckets and result blocks.
    // The transcript assembler orders observations within each trace in memory.
    .orderByColumns([
      { column: "e.project_id", direction: "ASC" },
      { column: "e.trace_id", direction: "ASC" },
    ]);

  return {
    ...builder.buildWithParams(),
    projectIds,
  };
};

/**
 * Stream full events_full payloads into the worker without retaining a whole batch.
 * Rows are contiguous per (project_id, trace_id); a pair change or successful EOF
 * completes that trace's query window, not its lifetime of possible late arrivals.
 * Rows reflect the events table's current merge state, as in other event reads;
 * this read does not deduplicate versions or enrich model data.
 */
export async function* getEventsDispatchEventStream(
  props: EventsDispatchEventStreamProps,
  options: {
    maxThreads?: number;
    maxBlockSize?: number;
    requestTimeoutMs?: number;
    /** Server-side query limit; the client timeout should exceed it. */
    maxExecutionTimeS?: number;
    queryId?: string;
  } = {},
): AsyncGenerator<EventsDispatchEventRow> {
  if (props.traces.length === 0) return;

  const { query, params, projectIds } = buildEventsDispatchEventQuery(props);
  yield* queryClickhouseStream<EventsDispatchEventRow>({
    query,
    queryId: options.queryId,
    params,
    useMultipartParamsAuto: true,
    tags: {
      projectId: projectIds.length === 1 ? projectIds[0] : "MULTI_PROJECT",
    },
    preferredClickhouseService: "EventsReadOnly",
    clickhouseConfigs: {
      compression: { response: true },
      ...(options.requestTimeoutMs === undefined
        ? {}
        : { request_timeout: options.requestTimeoutMs }),
    },
    // Bound background-read CPU/time; timeouts fail instead of returning partial results.
    clickhouseSettings: {
      max_threads: options.maxThreads ?? 2,
      ...(options.maxBlockSize === undefined
        ? {}
        : { max_block_size: String(options.maxBlockSize) }),
      max_execution_time: options.maxExecutionTimeS ?? 30,
      timeout_overflow_mode: "throw",
    },
  });
}

/**
 * Full payloads of a few traces of one project that may lie days apart, for
 * the Topics cost estimate, with the same columns as trace dispatch reads.
 * Each trace keeps its own plain time window: unlike the grouped array
 * predicate above, ClickHouse uses these for primary-key pruning, so a batch
 * spread over a week reads only the granules around each trace.
 */
export async function* getTopicCostEstimateEventStream(props: {
  projectId: string;
  traces: ReadonlyArray<{
    traceId: string;
    minStart: number;
    maxStart: number;
  }>;
}): AsyncGenerator<EventsDispatchEventRow> {
  if (props.traces.length === 0) return;
  const windowParams: Record<string, unknown> = {};
  const windowPredicates = props.traces.map((trace, index) => {
    windowParams[`w${index}t`] = trace.traceId;
    windowParams[`w${index}l`] = trace.minStart - TRACE_QUERY_BUFFER_MS;
    windowParams[`w${index}u`] = trace.maxStart + TRACE_QUERY_BUFFER_MS;
    return `(e.trace_id = {w${index}t: String} AND e.start_time BETWEEN fromUnixTimestamp64Milli({w${index}l: Int64}) AND fromUnixTimestamp64Milli({w${index}u: Int64}))`;
  });
  const { query, params } = new EventsQueryBuilder({
    projectId: props.projectId,
  })
    .selectRaw(
      "e.project_id",
      "e.trace_id",
      "e.session_id",
      "e.environment",
      "e.trace_name",
      "e.span_id",
      "e.parent_span_id",
      "e.start_time",
      "e.event_ts",
      "e.type",
      "e.name",
      "e.level",
      "e.status_message",
    )
    .selectIO(false)
    .selectMetadataExpanded()
    .selectFieldSet("tools")
    .forceFullTable()
    .whereRaw("e.trace_id IN ({traceIds: Array(String)})", {
      traceIds: props.traces.map(({ traceId }) => traceId),
    })
    .whereRaw(
      "xxHash32(e.trace_id) IN (SELECT arrayJoin(arrayMap(id -> xxHash32(id), {traceIds: Array(String)})))",
    )
    .whereRaw(
      "e.start_time >= fromUnixTimestamp64Milli({batchMinStart: Int64}) AND e.start_time <= fromUnixTimestamp64Milli({batchMaxStart: Int64})",
      {
        batchMinStart:
          Math.min(...props.traces.map(({ minStart }) => minStart)) -
          TRACE_QUERY_BUFFER_MS,
        batchMaxStart:
          Math.max(...props.traces.map(({ maxStart }) => maxStart)) +
          TRACE_QUERY_BUFFER_MS,
      },
    )
    .whereRaw(`(${windowPredicates.join(" OR ")})`, windowParams)
    .orderByColumns([{ column: "e.trace_id", direction: "ASC" }])
    .buildWithParams();
  yield* queryClickhouseStream<EventsDispatchEventRow>({
    query,
    params,
    useMultipartParamsAuto: true,
    tags: {
      route: "topics-cost-estimate-events",
      projectId: props.projectId,
    },
    preferredClickhouseService: "EventsReadOnly",
    clickhouseConfigs: { compression: { response: true } },
    clickhouseSettings: {
      max_threads: 2,
      max_execution_time: 30,
      timeout_overflow_mode: "throw",
      max_result_bytes: String(64 * 1024 * 1024),
      result_overflow_mode: "throw",
    },
  });
}
