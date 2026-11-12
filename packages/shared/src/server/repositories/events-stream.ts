import { Readable } from "stream";
import { normalizeEventsTraceName } from "../../eventsTable";
import type { FilterCondition } from "../../types";
import type { TracingSearchType } from "../../interfaces/search";
import type { EventsStreamCursor } from "../../domain/eventsStreamCursor";
import { buildEventsStreamQuery } from "../queries/clickhouse-sql/events-stream-query";
import { queryClickhouseStream } from "./clickhouse";

// Each page is its own query, so a slow consumer only has to finish one page
// within the query timeout, not the whole stream.
const EVAL_STREAM_PAGE_SIZE = 5_000;

/**
 * Lightweight event stream for batch observation evaluation.
 * Selects the eval field set and maps ClickHouse aliases toward ObservationForEval.
 *
 * Rows come in `(start_time, span_id)` descending order, read in keyset pages.
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
  const { rowLimit, after, pageSize = EVAL_STREAM_PAGE_SIZE } = props;

  // Remap ClickHouse aliases to schema field names.
  // Schema validation is left to the consumer so per-row errors can be handled gracefully.
  return Readable.from(
    (async function* () {
      let cursor = after;
      let remaining = rowLimit;

      while (remaining > 0) {
        const limit = Math.min(pageSize, remaining);
        let pageRowCount = 0;

        for await (const row of streamEvalPage({
          ...props,
          after: cursor,
          limit,
        })) {
          const { cursor_start_time, ...eventRow } = row;
          cursor = { startTime: cursor_start_time, spanId: row.id };
          pageRowCount++;

          yield {
            ...eventRow,
            span_id: row.id,
            parent_span_id: row.parent_observation_id,
            trace_name: normalizeEventsTraceName(row.trace_name),
            cursor,
          };
        }

        remaining -= pageRowCount;
        if (pageRowCount < limit) return;
      }
    })(),
  );
};

function streamEvalPage(
  params: Omit<
    Parameters<typeof getEventsStreamForEval>[0],
    "rowLimit" | "pageSize"
  > & { limit: number },
) {
  const {
    projectId,
    cutoffCreatedAt,
    filter = [],
    searchQuery,
    searchType,
    after,
    limit,
  } = params;

  const { queryBuilder } = buildEventsStreamQuery({
    projectId,
    cutoffCreatedAt,
    filter,
    searchQuery,
    searchType,
    rowLimit: limit,
  });

  if (after) {
    // The plain start_time bound lets ClickHouse prune parts; the OR breaks ties.
    queryBuilder.whereRaw(
      "e.start_time <= {afterStartTime: DateTime64(6)} AND (e.start_time < {afterStartTime: DateTime64(6)} OR e.span_id < {afterSpanId: String})",
      { afterStartTime: after.startTime, afterSpanId: after.spanId },
    );
  }

  const { query, params: queryParams } = queryBuilder
    .orderByColumns([
      { column: "e.start_time", direction: "DESC" },
      { column: "e.span_id", direction: "DESC" },
    ])
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
    tags: { projectId },
    preferredClickhouseService: "EventsReadOnly",
  });
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
