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

/**
 * Stream full events_full payloads into the worker without retaining a whole batch.
 * Rows reflect the events table's current merge state, as in other event reads;
 * this read-only experiment does not deduplicate versions or enrich model data.
 */
export async function* getTraceBatchEventStream(props: {
  traces: ReadonlyArray<{
    projectId: string;
    traceId: string;
    minStart: number;
    maxStart: number;
  }>;
}): AsyncGenerator<TraceBatchEventRow> {
  if (props.traces.length === 0) return;

  const bufferedGroups = new Map<
    string,
    {
      projectId: string;
      minStart: number;
      maxStart: number;
      traceIds: Set<string>;
    }
  >();
  for (const trace of props.traces) {
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
  const timeGroupParams: Record<string, unknown> = {};
  const timeGroupPredicates = [...bufferedGroups.values()].map(
    ({ projectId, minStart, maxStart, traceIds }, index) => {
      const projectParam = `timeGroup${index}Project`;
      const tracesParam = `timeGroup${index}Traces`;
      const minParam = `timeGroup${index}Min`;
      const maxParam = `timeGroup${index}Max`;
      timeGroupParams[projectParam] = projectId;
      timeGroupParams[tracesParam] = [...traceIds];
      timeGroupParams[minParam] = minStart;
      timeGroupParams[maxParam] = maxStart;
      return `(e.project_id = {${projectParam}: String}
        AND e.trace_id IN ({${tracesParam}: Array(String)})
        AND e.start_time >= fromUnixTimestamp64Milli({${minParam}: Int64})
        AND e.start_time <= fromUnixTimestamp64Milli({${maxParam}: Int64}))`;
    },
  );
  const projectIds = [...new Set(props.traces.map((trace) => trace.projectId))];
  const traceIds = [...new Set(props.traces.map((trace) => trace.traceId))];
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
    .whereRaw("e.project_id IN ({projectIds: Array(String)})", { projectIds })
    .whereRaw("e.trace_id IN ({traceIds: Array(String)})", { traceIds })
    // Independent IN lists also match crossed pairs. Only these exact tenant/
    // trace pairs may return payloads, even when projects share trace IDs.
    .whereRaw(
      "(e.project_id, e.trace_id) IN {tracePairs: Array(Tuple(String, String))}",
      {
        tracePairs: props.traces.map(
          ({ projectId, traceId }) => new TupleParam([projectId, traceId]),
        ),
      },
    )
    // Equality filters add this primary-key hash condition automatically; IN
    // needs it explicitly. The exact IDs above also exclude hash collisions.
    .whereRaw(
      "xxHash32(e.trace_id) IN (SELECT arrayJoin(arrayMap(id -> xxHash32(id), {traceIds: Array(String)})))",
    )
    // Keep one shared outer window for partition/granule pruning.
    .whereRaw(
      "e.start_time >= fromUnixTimestamp64Milli({batchMinStart: Int64}) AND e.start_time <= fromUnixTimestamp64Milli({batchMaxStart: Int64})",
      {
        batchMinStart: Math.min(
          ...[...bufferedGroups.values()].map(({ minStart }) => minStart),
        ),
        batchMaxStart: Math.max(
          ...[...bufferedGroups.values()].map(({ maxStart }) => maxStart),
        ),
      },
    )
    // Batch companions must not widen another trace's required coverage.
    // Identical project/time windows share one ID list; repeated pair intervals
    // remain separate OR branches and therefore return each matching row once.
    .whereRaw(
      `(${timeGroupPredicates.join(`
      OR `)})`,
      timeGroupParams,
    );

  const { query, params } = builder.buildWithParams();
  yield* queryClickhouseStream<TraceBatchEventRow>({
    query,
    params,
    tags: {
      projectId: projectIds.length === 1 ? projectIds[0] : "MULTI_PROJECT",
    },
    preferredClickhouseService: "EventsReadOnly",
    clickhouseConfigs: {
      compression: { response: true },
    },
    // Bound background-read CPU/time; timeouts fail instead of returning partial results.
    clickhouseSettings: {
      max_threads: 2,
      max_execution_time: 30,
      timeout_overflow_mode: "throw",
    },
  });
}
