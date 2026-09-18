import {
  EventsQueryBuilder,
  NoProjectId,
} from "../queries/clickhouse-sql/event-query-builder";
import { queryClickhouseStream, TupleParam } from "./clickhouse";

type TraceBatchEventRow = {
  project_id: string;
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

type TraceBatchEventStreamProps = {
  traces: ReadonlyArray<{
    projectId: string;
    traceId: string;
    minStart: number;
    maxStart: number;
  }>;
};

const buildTraceBatchEventQuery = (props: TraceBatchEventStreamProps) => {
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
    // orderByColumns with start_time prepends minute ordering and splits traces.
    .orderBy(
      "ORDER BY e.project_id ASC, e.trace_id ASC, e.start_time ASC, e.span_id ASC, e.event_ts DESC",
    );

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
 * this read-only experiment does not deduplicate versions or enrich model data.
 */
export async function* getTraceBatchEventStream(
  props: TraceBatchEventStreamProps,
  options: {
    maxThreads?: number;
    maxBlockSize?: number;
    experimentId?: string;
    queryId?: string;
  } = {},
): AsyncGenerator<TraceBatchEventRow> {
  if (props.traces.length === 0) return;

  const { query, params, projectIds } = buildTraceBatchEventQuery(props);
  yield* queryClickhouseStream<TraceBatchEventRow>({
    query,
    queryId: options.queryId,
    params,
    useMultipartParamsAuto: true,
    tags: {
      projectId: projectIds.length === 1 ? projectIds[0] : "MULTI_PROJECT",
      ...(options.experimentId ? { experimentId: options.experimentId } : {}),
    },
    preferredClickhouseService: "EventsReadOnly",
    clickhouseConfigs: {
      compression: { response: true },
    },
    // Bound background-read CPU/time; timeouts fail instead of returning partial results.
    clickhouseSettings: {
      max_threads: options.maxThreads ?? 2,
      ...(options.maxBlockSize === undefined
        ? {}
        : { max_block_size: String(options.maxBlockSize) }),
      max_execution_time: 30,
      timeout_overflow_mode: "throw",
    },
  });
}
