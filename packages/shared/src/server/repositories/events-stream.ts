import { Readable } from "stream";
import { normalizeEventsTraceName } from "../../eventsTable";
import type { FilterCondition } from "../../types";
import type { TracingSearchType } from "../../interfaces/search";
import type { EventsStreamCursor } from "../../domain/eventsStreamCursor";
import type { EventsQueryBuilder } from "../queries/clickhouse-sql/event-query-builder";
import { groupEventsObservationFilters } from "../queries/clickhouse-sql/events-observation-row-selection";
import { buildEventsStreamQuery } from "../queries/clickhouse-sql/events-stream-query";
import { queryClickhouse, queryClickhouseStream } from "./clickhouse";

// Each page is its own query, so a slow consumer only has to finish one page
// within the query timeout, not the whole stream.
const EVAL_STREAM_PAGE_SIZE = 5_000;
// Keeps UUID-sized span ids under ClickHouse's default 128 KiB per field.
const SPAN_ID_PARAM_CHUNK_SIZE = 2_000;

/**
 * Lightweight event stream for batch observation evaluation.
 * Selects the eval field set and maps ClickHouse aliases toward ObservationForEval.
 *
 * Rows come in `(start_time, span_id)` descending order, read in pages.
 * Each row carries its `cursor`; pass it back as `after` to continue behind it.
 */
export const getEventsStreamForEval = async (props: {
  projectId: string;
  cutoffCreatedAt?: Date;
  filter: FilterCondition[] | null;
  searchQuery?: string;
  searchType?: TracingSearchType[];
  rowLimit: number;
  after?: EventsStreamCursor;
  pageSize?: number;
}): Promise<Readable> => {
  const { pageSize = EVAL_STREAM_PAGE_SIZE, ...streamProps } = props;
  const { observationScores, traceScores, events } =
    groupEventsObservationFilters(props.filter);

  return Readable.from(
    observationScores.length + traceScores.length > 0
      ? streamResolvedSpanPages(streamProps, events, pageSize)
      : streamKeysetPages(streamProps, pageSize),
  );
};

type EvalStreamProps = Parameters<typeof getEventsStreamForEval>[0];
type EvalRecord = { span_id: string; cursor: EventsStreamCursor };

async function* streamKeysetPages(props: EvalStreamProps, pageSize: number) {
  let cursor = props.after;
  let remaining = props.rowLimit;
  // `LIMIT 1 BY span_id` only dedupes within a page. A span stored with
  // several start times would otherwise reappear in a later page.
  const yieldedSpanIds = new Set<string>();

  while (remaining > 0) {
    const limit = Math.min(pageSize, remaining);
    let pageRowCount = 0;

    for await (const record of streamEvalPage({
      ...props,
      after: cursor,
      rowLimit: limit,
    }) as AsyncIterable<EvalRecord>) {
      cursor = record.cursor;
      pageRowCount++;

      if (yieldedSpanIds.has(record.span_id)) continue;
      yieldedSpanIds.add(record.span_id);
      remaining--;
      yield record;
    }

    if (pageRowCount < limit) return;
  }
}

/**
 * Score filters join score aggregations over the whole project, and no page
 * bound narrows them: scores are written after the observation starts. So the
 * matching span ids are resolved in one query, and each page is read by id
 * with the remaining filters.
 */
async function* streamResolvedSpanPages(
  props: EvalStreamProps,
  eventFilters: FilterCondition[],
  pageSize: number,
) {
  const spans = await resolveEvalSpans(props);
  const chunkSize = Math.min(pageSize, SPAN_ID_PARAM_CHUNK_SIZE);

  for (let i = 0; i < spans.length; i += chunkSize) {
    const chunk = spans.slice(i, i + chunkSize);
    yield* streamEvalPage({
      ...props,
      filter: eventFilters,
      after: undefined,
      spanPage: {
        ids: chunk.map((span) => span.id),
        // Spans come newest first; the range lets ClickHouse prune parts.
        startTimeFrom: chunk[chunk.length - 1].start_time,
        startTimeTo: chunk[0].start_time,
      },
      rowLimit: chunk.length,
    });
  }
}

async function resolveEvalSpans(props: EvalStreamProps) {
  const { queryBuilder } = buildEventsStreamQuery({
    ...props,
    filter: props.filter ?? [],
  });
  const { query, params } = orderBehind(queryBuilder, props.after)
    .selectRaw("e.span_id AS id", "toString(e.start_time) AS start_time")
    .buildWithParams();

  return queryClickhouse<{ id: string; start_time: string }>({
    query,
    params,
    clickhouseConfigs: { request_timeout: 180_000 },
    tags: { projectId: props.projectId },
    preferredClickhouseService: "EventsReadOnly",
  });
}

/** Keeps the rows behind `after`, in stream order. */
function orderBehind(
  queryBuilder: EventsQueryBuilder,
  after: EventsStreamCursor | undefined,
) {
  if (after) {
    // The plain start_time bound lets ClickHouse prune parts; the OR breaks ties.
    queryBuilder.whereRaw(
      "e.start_time <= {afterStartTime: DateTime64(6)} AND (e.start_time < {afterStartTime: DateTime64(6)} OR e.span_id < {afterSpanId: String})",
      { afterStartTime: after.startTime, afterSpanId: after.spanId },
    );
  }

  return queryBuilder.orderByColumns([
    { column: "e.start_time", direction: "DESC" },
    { column: "e.span_id", direction: "DESC" },
  ]);
}

function streamEvalPage(
  props: EvalStreamProps & {
    spanPage?: { ids: string[]; startTimeFrom: string; startTimeTo: string };
  },
) {
  const {
    projectId,
    cutoffCreatedAt,
    filter = [],
    searchQuery,
    searchType,
    rowLimit,
    after,
    spanPage,
  } = props;

  const { queryBuilder } = buildEventsStreamQuery({
    projectId,
    cutoffCreatedAt,
    filter,
    searchQuery,
    searchType,
    rowLimit,
  });
  if (spanPage) {
    queryBuilder.whereRaw(
      "e.span_id IN {spanIds: Array(String)} AND e.start_time >= {pageStartTimeFrom: DateTime64(6)} AND e.start_time <= {pageStartTimeTo: DateTime64(6)}",
      {
        spanIds: spanPage.ids,
        pageStartTimeFrom: spanPage.startTimeFrom,
        pageStartTimeTo: spanPage.startTimeTo,
      },
    );
  }
  const { query, params: queryParams } = orderBehind(queryBuilder, after)
    .selectFieldSet("eval")
    .selectIO(false)
    .selectFieldSet("metadata")
    .selectRaw("toString(e.start_time) AS cursor_start_time")
    .buildWithParams();

  type EvalEventRow = {
    id: string;
    trace_id: string;
    project_id: string;
    parent_observation_id: string | null;
    is_app_root: boolean;
    type: string;
    name: string | null;
    environment: string | null;
    version: string | null;
    level: string;
    status_message: string | null;
    trace_name: string | null;
    user_id: string | null;
    session_id: string | null;
    tags: string[];
    release: string | null;
    provided_model_name: string | null;
    model_parameters: unknown;
    prompt_id: string | null;
    prompt_name: string | null;
    prompt_version: number | null;
    provided_usage_details: Record<string, number>;
    usage_details: Record<string, number>;
    provided_cost_details: Record<string, number>;
    cost_details: Record<string, number>;
    tool_definitions: Record<string, unknown>;
    tool_calls: unknown[];
    tool_call_names: string[];
    input: unknown;
    output: unknown;
    metadata: Record<string, unknown> | null;
    experiment_id: string | null;
    experiment_name: string | null;
    experiment_item_root_span_id: string | null;
    experiment_item_expected_output: string | null;
    experiment_item_metadata: Record<string, unknown> | null;
    cursor_start_time: string;
  };

  const asyncGenerator = queryClickhouseStream<EvalEventRow>({
    query,
    params: queryParams,
    clickhouseConfigs: {
      request_timeout: 180_000,
      clickhouse_settings: {
        http_send_timeout: 300,
        http_receive_timeout: 300,
      },
    },
    tags: { projectId },
    preferredClickhouseService: "EventsReadOnly",
  });

  // Remap ClickHouse aliases to schema field names.
  // Schema validation is left to the consumer so per-row errors can be handled gracefully.
  return Readable.from(
    (async function* () {
      for await (const { cursor_start_time, ...row } of asyncGenerator) {
        yield {
          ...row,
          span_id: row.id,
          parent_span_id: row.parent_observation_id,
          trace_name: normalizeEventsTraceName(row.trace_name),
          cursor: { startTime: cursor_start_time, spanId: row.id },
        };
      }
    })(),
  );
}
