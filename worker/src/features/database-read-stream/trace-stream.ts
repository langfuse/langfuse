import {
  FilterCondition,
  TimeFilter,
  TracingSearchType,
} from "@langfuse/shared";
import {
  getDistinctScoreNames,
  queryClickhouseStream,
  logger,
  FilterList,
  createFilterFromFilterState,
  tracesTableUiColumnDefinitions,
  clickhouseSearchCondition,
  parseClickhouseUTCDateTimeFormat,
  reduceUsageOrCostDetails,
  OBSERVATIONS_TO_TRACE_INTERVAL,
  SCORE_TO_TRACE_OBSERVATIONS_INTERVAL,
  DateTimeFilter,
} from "@langfuse/shared/src/server";
import { ScoreDataType } from "@langfuse/shared/src/features/scores";
import { Readable } from "stream";
import { env } from "../../env";
import {
  getChunkWithFlattenedScores,
  prepareScoresForOutput,
} from "./getDatabaseReadStream";
import Decimal from "decimal.js";
import { ObservationLevelType } from "@langfuse/shared/src/domain";

const isTraceTimestampFilter = (
  filter: FilterCondition,
): filter is TimeFilter => {
  return filter.column === "Timestamp" && filter.type === "datetime";
};

export const getTraceStream = async (props: {
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
    request_timeout: 120_000,
    join_algorithm: "partial_merge",
  };

  // Get distinct score names for empty columns
  const distinctScoreNames = await getDistinctScoreNames({
    projectId,
    cutoffCreatedAt,
    filter: filter ?? [],
    isTimestampFilter: isTraceTimestampFilter,
    clickhouseConfigs,
  });

  const emptyScoreColumns = distinctScoreNames.reduce(
    (acc, name) => ({ ...acc, [name]: null }),
    {} as Record<string, null>,
  );

  // Build filters for traces
  const tracesFilter = new FilterList([]);

  tracesFilter.push(
    ...createFilterFromFilterState(
      [
        ...(filter ?? []),
        {
          column: "timestamp",
          operator: "<" as const,
          value: cutoffCreatedAt,
          type: "datetime" as const,
        },
      ],
      tracesTableUiColumnDefinitions,
    ),
  );

  const appliedTracesFilter = tracesFilter.apply();

  // Check if there's a timestamp filter for optimizing observations/scores queries
  const timeStampFilter = tracesFilter.find(
    (f) =>
      f.field === "timestamp" && (f.operator === ">=" || f.operator === ">"),
  ) as DateTimeFilter | undefined;

  const search = clickhouseSearchCondition(searchQuery, searchType, "t");

  const query = `
    WITH observations_stats AS (
      SELECT
        COUNT(*) AS observation_count,
        sumMap(usage_details) as usage_details,
        SUM(total_cost) AS total_cost,
        date_diff('millisecond', least(min(start_time), min(end_time)), greatest(max(start_time), max(end_time))) as latency_milliseconds,
        countIf(level = 'ERROR') as error_count,
        countIf(level = 'WARNING') as warning_count,
        countIf(level = 'DEFAULT') as default_count,
        countIf(level = 'DEBUG') as debug_count,
        multiIf(
          arrayExists(x -> x = 'ERROR', groupArray(level)), 'ERROR',
          arrayExists(x -> x = 'WARNING', groupArray(level)), 'WARNING',
          arrayExists(x -> x = 'DEFAULT', groupArray(level)), 'DEFAULT',
          'DEBUG'
        ) AS aggregated_level,
        sumMap(cost_details) as cost_details,
        trace_id,
        project_id
      FROM observations FINAL
      WHERE project_id = {projectId: String}
        ${timeStampFilter ? `AND start_time >= {traceTimestamp: DateTime64(3)} - ${OBSERVATIONS_TO_TRACE_INTERVAL}` : ""}
      GROUP BY trace_id, project_id
    ),
    scores_agg AS (
      SELECT
        project_id,
        trace_id,
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
          project_id,
          trace_id,
          name,
          data_type,
          string_value,
          avg(value) as avg_value
        FROM scores FINAL
        WHERE project_id = {projectId: String}
          ${timeStampFilter ? `AND timestamp >= {traceTimestamp: DateTime64(3)} - ${SCORE_TO_TRACE_OBSERVATIONS_INTERVAL}` : ""}
        GROUP BY
          project_id,
          trace_id,
          name,
          data_type,
          string_value,
          execution_trace_id
      ) tmp
      GROUP BY project_id, trace_id
    )
    SELECT
      t.id as id,
      t.project_id as project_id,
      t.timestamp as timestamp,
      t.name as name,
      t.user_id as user_id,
      t.session_id as session_id,
      t.release as release,
      t.version as version,
      t.environment as environment,
      t.tags as tags,
      t.bookmarked as bookmarked,
      t.public as public,
      t.input as input,
      t.output as output,
      t.metadata as metadata,
      o.latency_milliseconds / 1000 as latency,
      o.cost_details as cost_details,
      o.usage_details as usage_details,
      o.aggregated_level as level,
      o.error_count as error_count,
      o.warning_count as warning_count,
      o.default_count as default_count,
      o.debug_count as debug_count,
      o.observation_count as observation_count,
      sa.scores_avg as scores_avg,
      sa.score_categories as score_categories
    FROM traces t
      LEFT JOIN observations_stats o ON o.project_id = t.project_id AND o.trace_id = t.id
      LEFT JOIN scores_agg sa ON sa.project_id = t.project_id AND sa.trace_id = t.id
    WHERE t.project_id = {projectId: String}
      ${appliedTracesFilter.query ? `AND ${appliedTracesFilter.query}` : ""}
      ${search.query}
    LIMIT 1 BY t.id, t.project_id
    LIMIT {rowLimit: Int64}
  `;

  const asyncGenerator = queryClickhouseStream<{
    id: string;
    project_id: string;
    timestamp: Date;
    name: string | null;
    user_id: string | null;
    session_id: string | null;
    release: string | null;
    version: string | null;
    environment: string | null;
    tags: string[];
    bookmarked: boolean;
    public: boolean;
    input: unknown;
    output: unknown;
    metadata: unknown;
    latency: string | null;
    cost_details: Record<string, number>;
    usage_details: Record<string, number>;
    level: ObservationLevelType | null;
    error_count: number | null;
    warning_count: number | null;
    default_count: number | null;
    debug_count: number | null;
    observation_count: number | null;
    scores_avg:
      | {
          name: string;
          avg_value: number;
          data_type: ScoreDataType;
          string_value: string;
        }[]
      | undefined;
    score_categories: string[] | undefined;
  }>({
    query,
    params: {
      projectId,
      rowLimit,
      traceTimestamp: timeStampFilter?.value.getTime(),
      ...appliedTracesFilter.params,
      ...search.params,
    },
    clickhouseConfigs,
    tags: {
      feature: "batch-export",
      type: "trace",
      kind: "export",
      projectId,
    },
  });

  // Convert async generator to Node.js Readable stream
  let recordsProcessed = 0;

  return Readable.from(
    (async function* () {
      for await (const row of asyncGenerator) {
        recordsProcessed++;
        if (recordsProcessed % 10000 === 0)
          logger.info(
            `Streaming traces for project ${projectId}: processed ${recordsProcessed} rows`,
          );

        const usageDetails = reduceUsageOrCostDetails(row.usage_details ?? {});

        const outputScores: Record<string, string[] | number[]> =
          prepareScoresForOutput(
            (row.scores_avg ?? []).map((score: any) => ({
              name: score[0],
              value: score[1],
              dataType: score[2],
              stringValue: score[3],
            })),
          );

        yield getChunkWithFlattenedScores(
          [
            {
              id: row.id,
              timestamp:
                row.timestamp instanceof Date
                  ? row.timestamp
                  : parseClickhouseUTCDateTimeFormat(row.timestamp),
              name: row.name ?? "",
              userId: row.user_id,
              sessionId: row.session_id,
              release: row.release,
              version: row.version,
              environment: row.environment,
              tags: row.tags,
              bookmarked: row.bookmarked,
              public: row.public,
              input: row.input,
              output: row.output,
              metadata: row.metadata,
              latency: row.latency ? Number(row.latency) : null,
              usage: {
                promptTokens: BigInt(usageDetails.input ?? 0),
                completionTokens: BigInt(usageDetails.output ?? 0),
                totalTokens: BigInt(usageDetails.total ?? 0),
              },
              inputCost: row.cost_details?.input
                ? new Decimal(row.cost_details.input)
                : null,
              outputCost: row.cost_details?.output
                ? new Decimal(row.cost_details.output)
                : null,
              totalCost: row.cost_details?.total
                ? new Decimal(row.cost_details.total)
                : null,
              level: row.level ?? "DEBUG",
              errorCount: BigInt(row.error_count ?? 0),
              warningCount: BigInt(row.warning_count ?? 0),
              defaultCount: BigInt(row.default_count ?? 0),
              debugCount: BigInt(row.debug_count ?? 0),
              observationCount: Number(row.observation_count ?? 0),
              inputTokens: BigInt(usageDetails.input ?? 0),
              outputTokens: BigInt(usageDetails.output ?? 0),
              totalTokens: BigInt(usageDetails.total ?? 0),
              scores: outputScores,
            },
          ],
          emptyScoreColumns,
        )[0];
      }
    })(),
  );
};
