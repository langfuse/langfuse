import { Readable } from "stream";
import { normalizeEventsTraceName } from "../../eventsTable";
import type { FilterCondition } from "../../types";
import type { TracingSearchType } from "../../interfaces/search";
import type { EventsStreamCursor } from "../../domain/eventsStreamCursor";
import { buildEventsStreamQuery } from "../queries/clickhouse-sql/events-stream-query";
import { groupEventsObservationFilters } from "../queries/clickhouse-sql/events-observation-row-selection";
import { queryClickhouse, queryClickhouseStream } from "./clickhouse";

// Each page is its own query, so a slow consumer only has to finish one page
// within the query timeout, not the whole stream.
const EVAL_STREAM_PAGE_SIZE = 5_000;

/**
 * Lightweight event stream for batch observation evaluation.
 * Selects the eval field set and maps ClickHouse aliases toward ObservationForEval.
 *
 * Rows come in `(start_time, span_id)` descending order, read in pages.
 * Each row carries its `cursor`; pass it back as `after` to continue behind it.
 */
export const getEventsStreamForEval = async (
  props: EvalStreamProps & { pageSize?: number },
): Promise<Readable> => {
  const { pageSize = EVAL_STREAM_PAGE_SIZE, ...streamProps } = props;
  const { observationScores, traceScores, events } =
    groupEventsObservationFilters(props.filter);
  const hasScoreFilter = observationScores.length + traceScores.length > 0;

  // Remap ClickHouse aliases to schema field names.
  // Schema validation is left to the consumer so per-row errors can be handled gracefully.
  return Readable.from(
    hasScoreFilter
      ? streamResolvedSpanPages(streamProps, events, pageSize)
      : streamKeysetPages(streamProps, pageSize),
  );
};

type EvalStreamProps = {
  projectId: string;
  cutoffCreatedAt?: Date;
  filter: FilterCondition[] | null;
  searchQuery?: string;
  searchType?: TracingSearchType[];
  rowLimit: number;
  after?: EventsStreamCursor;
};

async function* streamKeysetPages(props: EvalStreamProps, pageSize: number) {
  let cursor = props.after;
  let remaining = props.rowLimit;
  // `LIMIT 1 BY span_id` only dedupes within a page. A span stored with
  // several start times would otherwise reappear in a later page.
  const yieldedSpanIds = new Set<string>();

  while (remaining > 0) {
    const limit = Math.min(pageSize, remaining);
    let pageRowCount = 0;

    for await (const row of streamEvalPage({
      ...props,
      after: cursor,
      limit,
    })) {
      const record = toEvalRecord(row);
      cursor = record.cursor;
      pageRowCount++;

      if (yieldedSpanIds.has(row.id)) continue;
      yieldedSpanIds.add(row.id);
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
  const spanIds = await resolveEvalSpanIds(props);

  for (let i = 0; i < spanIds.length; i += pageSize) {
    const pageSpanIds = spanIds.slice(i, i + pageSize);
    for await (const row of streamEvalPage({
      ...props,
      filter: eventFilters,
      after: undefined,
      spanIds: pageSpanIds,
      limit: pageSpanIds.length,
    })) {
      yield toEvalRecord(row);
    }
  }
}

function toEvalRecord(row: EvalEventRow) {
  const { cursor_start_time, ...eventRow } = row;
  return {
    ...eventRow,
    span_id: row.id,
    parent_span_id: row.parent_observation_id,
    trace_name: normalizeEventsTraceName(row.trace_name),
    cursor: { startTime: cursor_start_time, spanId: row.id },
  };
}

async function resolveEvalSpanIds(props: EvalStreamProps) {
  const { query, params } = buildEvalQuery({ ...props, limit: props.rowLimit })
    .selectRaw("e.span_id AS id")
    .buildWithParams();

  const rows = await queryClickhouse<{ id: string }>({
    query,
    params,
    clickhouseConfigs: { request_timeout: 180_000 },
    tags: { projectId: props.projectId },
    preferredClickhouseService: "EventsReadOnly",
  });
  return rows.map((row) => row.id);
}

function streamEvalPage(
  params: EvalStreamProps & { limit: number; spanIds?: string[] },
) {
  const queryBuilder = buildEvalQuery(params);
  if (params.spanIds) {
    queryBuilder.whereRaw("e.span_id IN {spanIds: Array(String)}", {
      spanIds: params.spanIds,
    });
  }

  const { query, params: queryParams } = queryBuilder
    .selectFieldSet("eval")
    .selectIO(false)
    .selectFieldSet("metadata")
    .selectRaw("toString(e.start_time) AS cursor_start_time")
    .buildWithParams();

  return queryClickhouseStream<EvalEventRow>({
    query,
    params: queryParams,
    clickhouseConfigs: {
      request_timeout: 180_000,
      clickhouse_settings: {
        http_send_timeout: 300,
        http_receive_timeout: 300,
      },
    },
    tags: { projectId: params.projectId },
    preferredClickhouseService: "EventsReadOnly",
  });
}

/** The filtered, deduplicated rows behind `after`, in stream order. */
function buildEvalQuery(params: EvalStreamProps & { limit: number }) {
  const { queryBuilder } = buildEventsStreamQuery({
    projectId: params.projectId,
    cutoffCreatedAt: params.cutoffCreatedAt,
    filter: params.filter ?? [],
    searchQuery: params.searchQuery,
    searchType: params.searchType,
    rowLimit: params.limit,
  });

  if (params.after) {
    // The plain start_time bound lets ClickHouse prune parts; the OR breaks ties.
    queryBuilder.whereRaw(
      "e.start_time <= {afterStartTime: DateTime64(6)} AND (e.start_time < {afterStartTime: DateTime64(6)} OR e.span_id < {afterSpanId: String})",
      {
        afterStartTime: params.after.startTime,
        afterSpanId: params.after.spanId,
      },
    );
  }

  return queryBuilder.orderByColumns([
    { column: "e.start_time", direction: "DESC" },
    { column: "e.span_id", direction: "DESC" },
  ]);
}

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
