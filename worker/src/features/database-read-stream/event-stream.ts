/**
 * Event stream for batch exports.
 * Queries the ClickHouse events table with filters and streams results
 * for efficient batch export processing.
 *
 * The events table is denormalized with trace data already included,
 * so no JOINs are needed for trace-level fields.
 */

import {
  FilterCondition,
  ScoreDataTypeEnum,
  type ScoreDataTypeType,
  TimeFilter,
  TracingSearchType,
} from "@langfuse/shared";
import {
  getDistinctScoreNames,
  queryClickhouseStream,
  logger,
  FilterList,
  createFilterFromFilterState,
  eventsTableUiColumnDefinitions,
  clickhouseSearchCondition,
  StringFilter,
} from "@langfuse/shared/src/server";
import { Readable } from "stream";
import { env } from "../../env";
import {
  getChunkWithFlattenedScores,
  prepareScoresForOutput,
} from "./getDatabaseReadStream";
import { fetchCommentsForExport } from "./fetchCommentsForExport";
import { BatchExportEventsRow } from "./types";

const BATCH_SIZE = 1000; // Fetch comments in batches for efficiency

/**
 * Creates a stream of events from ClickHouse for batch export.
 * Includes comments fetched in batches and flattened scores.
 *
 * @param props - Query parameters including projectId, filters, and limits
 * @returns A Node.js Readable stream of event records
 */
export const getEventsStream = async (props: {
  projectId: string;
  cutoffCreatedAt: Date;
  filter: FilterCondition[] | null;
  searchQuery?: string;
  searchType?: TracingSearchType[];
  rowLimit?: number;
}): Promise<Readable> => {
  const {
    projectId,
    cutoffCreatedAt,
    filter = [],
    searchQuery,
    searchType,
    rowLimit = env.BATCH_EXPORT_ROW_LIMIT,
  } = props;

  const clickhouseConfigs = {
    request_timeout: 180_000, // 3 minutes
    clickhouse_settings: {
      join_algorithm: "partial_merge" as const,
      // Increase HTTP timeouts to prevent Code 209 errors during slow blob storage uploads
      // See: https://github.com/ClickHouse/ClickHouse/issues/64731
      http_send_timeout: 300,
      http_receive_timeout: 300,
    },
  };

  // Filter out score and comment filters since they require special handling
  const eventOnlyFilters = (filter ?? []).filter((f) => {
    const columnDef = eventsTableUiColumnDefinitions.find(
      (col) => col.uiTableName === f.column || col.uiTableId === f.column,
    );
    // Keep the filter if it's not a scores or comments filter
    return (
      columnDef?.clickhouseTableName !== "scores" &&
      columnDef?.clickhouseTableName !== "comments"
    );
  });

  // Get distinct score names for empty columns
  const distinctScoreNames = await getDistinctScoreNames({
    projectId,
    cutoffCreatedAt,
    filter: eventOnlyFilters,
    isTimestampFilter: (
      filterItem: FilterCondition,
    ): filterItem is TimeFilter =>
      filterItem.column === "Start Time" && filterItem.type === "datetime",
    clickhouseConfigs,
  });

  const emptyScoreColumns = distinctScoreNames.reduce(
    (acc, name) => ({ ...acc, [name]: null }),
    {} as Record<string, null>,
  );

  // Build filters for events
  const eventsFilter = new FilterList([
    new StringFilter({
      clickhouseTable: "events",
      field: "project_id",
      operator: "=",
      value: projectId,
      tablePrefix: "e",
    }),
  ]);

  eventsFilter.push(
    ...createFilterFromFilterState(
      [
        ...eventOnlyFilters,
        {
          column: "startTime",
          operator: "<" as const,
          value: cutoffCreatedAt,
          type: "datetime" as const,
        },
      ],
      eventsTableUiColumnDefinitions,
    ),
  );

  const appliedEventsFilter = eventsFilter.apply();

  // Scores filter
  const scoresFilter = new FilterList([
    new StringFilter({
      clickhouseTable: "scores",
      field: "project_id",
      operator: "=",
      value: projectId,
    }),
  ]);

  const appliedScoresFilter = scoresFilter.apply();

  const search = clickhouseSearchCondition(searchQuery, searchType, "e", [
    "span_id",
    "name",
    "user_id",
    "session_id",
    "trace_id",
  ]);

  const query = `
    WITH scores_agg AS (
      SELECT
        trace_id,
        observation_id,
        -- For numeric scores, use tuples of (name, avg_value, data_type, string_value)
        groupArrayIf(
          tuple(name, avg_value, data_type, string_value),
          data_type IN ('NUMERIC', 'BOOLEAN')
        ) AS scores_avg,
        -- For categorical scores, use name:value format for improved query performance
        groupArrayIf(
          concat(name, ':', string_value),
          data_type = 'CATEGORICAL' AND notEmpty(string_value)
        ) AS score_categories
      FROM (
        SELECT
          trace_id,
          observation_id,
          name,
          avg(value) avg_value,
          string_value,
          data_type,
          comment
        FROM
          scores final
        WHERE ${appliedScoresFilter.query}
        GROUP BY
          trace_id,
          observation_id,
          name,
          string_value,
          data_type,
          comment,
          execution_trace_id
        ORDER BY
          trace_id
      ) tmp
      GROUP BY
        trace_id,
        observation_id
    )
    SELECT
      e.span_id as id,
      e.trace_id as "trace_id",
      e.project_id as "project_id",
      e.start_time as "start_time",
      e.end_time as "end_time",
      e.name as name,
      e.type as type,
      e.environment as environment,
      e.version as version,
      e.user_id as "user_id",
      e.session_id as "session_id",
      e.level as level,
      e.status_message as "status_message",
      e.prompt_name as "prompt_name",
      e.prompt_id as "prompt_id",
      e.prompt_version as "prompt_version",
      e.model_id as "model_id",
      e.provided_model_name as "provided_model_name",
      e."model_parameters" as model_parameters,
      e.usage_details as "usage_details",
      e.cost_details as "cost_details",
      e.total_cost as "total_cost",
      e.input as input,
      e.output as output,
      e.metadata as metadata,
      e.completion_start_time as "completion_start_time",
      if(isNull(e.end_time), NULL, date_diff('millisecond', e.start_time, e.end_time)) as latency,
      if(isNull(e.completion_start_time), NULL, date_diff('millisecond', e.start_time, e.completion_start_time)) as "time_to_first_token",
      e.tags as tags,
      e.release as release,
      e.trace_name as "trace_name",
      e.parent_span_id as "parent_observation_id",
      s.scores_avg as scores_avg,
      s.score_categories as score_categories
    FROM events e
      LEFT JOIN scores_agg s ON s.trace_id = e.trace_id AND s.observation_id = e.span_id
    WHERE ${appliedEventsFilter.query}
      ${search.query}
    LIMIT 1 BY e.span_id, e.project_id
    LIMIT {rowLimit: Int64}
  `;

  type EventRow = {
    id: string;
    trace_id: string;
    project_id: string;
    start_time: Date;
    end_time: Date | null;
    name: string | null;
    type: string;
    environment: string | null;
    version: string | null;
    user_id: string | null;
    session_id: string | null;
    level: string;
    status_message: string | null;
    prompt_name: string | null;
    prompt_id: string | null;
    prompt_version: number | null;
    model_id: string | null;
    provided_model_name: string | null;
    model_parameters: unknown;
    usage_details: Record<string, number>;
    cost_details: Record<string, number>;
    total_cost: number | null;
    input: unknown;
    output: unknown;
    metadata: Record<string, unknown>;
    completion_start_time: Date | null;
    latency: number | null;
    time_to_first_token: number | null;
    tags: string[];
    release: string | null;
    trace_name: string | null;
    parent_observation_id: string | null;
    scores_avg:
      | {
          name: string;
          value: number;
          dataType: ScoreDataTypeType;
          stringValue: string;
        }[]
      | undefined;
    score_categories: string[] | undefined;
  };

  const asyncGenerator = queryClickhouseStream<EventRow>({
    query,
    params: {
      projectId,
      rowLimit,
      ...appliedEventsFilter.params,
      ...appliedScoresFilter.params,
      ...search.params,
    },
    clickhouseConfigs,
    tags: {
      feature: "batch-export",
      type: "event",
      kind: "export",
      projectId,
    },
  });

  // Helper function to process a single event row
  const processEventRow = (
    bufferedRow: EventRow,
    commentsByEvent: Map<string, any[]>,
  ) => {
    // Process numeric/boolean scores (tuples from ClickHouse)
    const numericScores = (bufferedRow.scores_avg ?? []).map((score: any) => ({
      name: score[0],
      value: score[1],
      dataType: score[2],
      stringValue: score[3],
    }));

    // Process categorical scores (format: "name:value")
    const categoricalScores = (bufferedRow.score_categories ?? []).map(
      (cat: string) => {
        const [name, ...valueParts] = cat.split(":");
        return {
          name,
          value: null,
          dataType: ScoreDataTypeEnum.CATEGORICAL,
          stringValue: valueParts.join(":"),
        };
      },
    );

    const outputScores: Record<string, string[] | number[]> =
      prepareScoresForOutput([...numericScores, ...categoricalScores]);

    // Get comments for this event (events use OBSERVATION type since they are observations)
    const eventComments = commentsByEvent.get(bufferedRow.id) ?? [];

    const eventRow: BatchExportEventsRow = {
      id: bufferedRow.id,
      traceId: bufferedRow.trace_id,
      traceName: bufferedRow.trace_name,
      type: bufferedRow.type,
      name: bufferedRow.name ?? "",
      startTime: bufferedRow.start_time,
      endTime: bufferedRow.end_time,
      completionStartTime: bufferedRow.completion_start_time,
      environment: bufferedRow.environment,
      version: bufferedRow.version,
      userId: bufferedRow.user_id,
      sessionId: bufferedRow.session_id,
      level: bufferedRow.level,
      statusMessage: bufferedRow.status_message,
      promptName: bufferedRow.prompt_name,
      promptId: bufferedRow.prompt_id,
      promptVersion: bufferedRow.prompt_version,
      modelId: bufferedRow.model_id,
      providedModelName: bufferedRow.provided_model_name,
      modelParameters: bufferedRow.model_parameters,
      usageDetails: bufferedRow.usage_details,
      costDetails: bufferedRow.cost_details,
      totalCost: bufferedRow.total_cost,
      input: bufferedRow.input,
      output: bufferedRow.output,
      metadata: bufferedRow.metadata,
      latencyMs: bufferedRow.latency,
      timeToFirstTokenMs: bufferedRow.time_to_first_token,
      tags: bufferedRow.tags,
      release: bufferedRow.release,
      parentObservationId: bufferedRow.parent_observation_id,
      scores: outputScores,
      comments: eventComments,
    };

    return getChunkWithFlattenedScores([eventRow], emptyScoreColumns)[0];
  };

  // Convert async generator to Node.js Readable stream
  let recordsProcessed = 0;

  return Readable.from(
    (async function* () {
      let rowBuffer: EventRow[] = [];
      let eventIds: string[] = [];

      for await (const row of asyncGenerator) {
        rowBuffer.push(row);
        eventIds.push(row.id);

        // Process in batches
        if (rowBuffer.length >= BATCH_SIZE) {
          // Fetch comments for this batch (events are observations)
          const commentsByEvent = await fetchCommentsForExport(
            projectId,
            "OBSERVATION",
            eventIds,
          );

          // Process each row in the buffer
          for (const bufferedRow of rowBuffer) {
            recordsProcessed++;
            if (recordsProcessed % 10000 === 0) {
              logger.info(
                `Streaming events for project ${projectId}: processed ${recordsProcessed} rows`,
              );
            }

            yield processEventRow(bufferedRow, commentsByEvent);
          }

          // Reset buffers
          rowBuffer = [];
          eventIds = [];
        }
      }

      // Process remaining rows in buffer
      if (rowBuffer.length > 0) {
        const commentsByEvent = await fetchCommentsForExport(
          projectId,
          "OBSERVATION",
          eventIds,
        );

        for (const bufferedRow of rowBuffer) {
          recordsProcessed++;
          if (recordsProcessed % 10000 === 0) {
            logger.info(
              `Streaming events for project ${projectId}: processed ${recordsProcessed} rows`,
            );
          }

          yield processEventRow(bufferedRow, commentsByEvent);
        }
      }
    })(),
  );
};
