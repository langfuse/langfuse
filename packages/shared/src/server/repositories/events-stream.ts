import { Readable } from "stream";
import type { FilterCondition } from "../../types";
import type { TracingSearchType } from "../../interfaces/search";
import { buildEventsStreamQuery } from "../queries";
import { queryClickhouseStream } from "./clickhouse";

/**
 * Lightweight event stream for batch observation evaluation.
 * Selects the eval field set and maps ClickHouse aliases toward ObservationForEval.
 */
export const getEventsStreamForEval = async (props: {
  projectId: string;
  cutoffCreatedAt?: Date;
  filter: FilterCondition[] | null;
  searchQuery?: string;
  searchType?: TracingSearchType[];
  rowLimit: number;
}): Promise<Readable> => {
  const {
    projectId,
    cutoffCreatedAt,
    filter = [],
    searchQuery,
    searchType,
    rowLimit,
  } = props;

  const { queryBuilder } = buildEventsStreamQuery({
    projectId,
    cutoffCreatedAt,
    filter,
    searchQuery,
    searchType,
    rowLimit,
  });
  const { query, params: queryParams } = queryBuilder
    .selectFieldSet("eval")
    .selectIO(false)
    .selectFieldSet("metadata")
    .buildWithParams();

  type EvalEventRow = {
    id: string;
    trace_id: string;
    project_id: string;
    parent_observation_id: string | null;
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
    experiment_item_root_span_id: string | null;
    experiment_item_expected_output: string | null;
    experiment_item_metadata: Record<string, unknown> | null;
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
      for await (const row of asyncGenerator) {
        yield {
          ...row,
          span_id: row.id,
          parent_span_id: row.parent_observation_id,
        };
      }
    })(),
  );
};
