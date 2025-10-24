import {
  FilterCondition,
  TracingSearchType,
  ScoreDataType,
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
  StringFilter,
} from "@langfuse/shared/src/server";
import { Readable } from "stream";
import { env } from "../../env";
import {
  getChunkWithFlattenedScores,
  isTraceTimestampFilter,
  prepareScoresForOutput,
} from "./getDatabaseReadStream";
import { fetchCommentsForExport } from "./fetchCommentsForExport";

const BATCH_SIZE = 1000; // Fetch comments in batches for efficiency

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

  // Filter out observation-level filters since we don't join the observations table
  // This prevents batch export failures when observation-level filters are present
  const traceOnlyFilters = (filter ?? []).filter((f) => {
    const columnDef = tracesTableUiColumnDefinitions.find(
      (col) => col.uiTableName === f.column || col.uiTableId === f.column,
    );
    // Keep the filter if it's not an observation-level filter
    return columnDef?.clickhouseTableName !== "observations";
  });

  // Get distinct score names for empty columns
  const distinctScoreNames = await getDistinctScoreNames({
    projectId,
    cutoffCreatedAt,
    filter: traceOnlyFilters,
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
        ...traceOnlyFilters,
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

  const scoresFilter = new FilterList([
    new StringFilter({
      clickhouseTable: "scores",
      field: "project_id",
      operator: "=",
      value: projectId,
    }),
  ]);

  const appliedScoresFilter = scoresFilter.apply();

  const search = clickhouseSearchCondition(searchQuery, searchType, "t");

  const query = `
    WITH scores_agg AS (
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
        WHERE ${appliedScoresFilter.query}
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
        s.scores_avg as scores_avg,
        s.score_categories as score_categories
      FROM traces t
        LEFT JOIN scores_agg s ON s.trace_id = t.id AND s.project_id = t.project_id
      WHERE t.project_id = {projectId: String}
        ${appliedTracesFilter.query ? `AND ${appliedTracesFilter.query}` : ""}
        ${search.query}
      LIMIT 1 BY id, project_id
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
      ...appliedTracesFilter.params,
      ...appliedScoresFilter.params,
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

  // Helper function to process a single trace row
  const processTraceRow = (
    bufferedRow: Awaited<ReturnType<typeof asyncGenerator.next>>["value"],
    commentsByTrace: Map<string, any[]>,
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
          dataType: "CATEGORICAL" as ScoreDataType,
          stringValue: valueParts.join(":"),
        };
      },
    );

    const outputScores: Record<string, string[] | number[]> =
      prepareScoresForOutput([...numericScores, ...categoricalScores]);

    // Get comments for this trace
    const traceComments = commentsByTrace.get(bufferedRow.id) ?? [];

    return getChunkWithFlattenedScores(
      [
        {
          id: bufferedRow.id,
          timestamp:
            bufferedRow.timestamp instanceof Date
              ? bufferedRow.timestamp
              : parseClickhouseUTCDateTimeFormat(bufferedRow.timestamp),
          name: bufferedRow.name ?? "",
          userId: bufferedRow.user_id,
          sessionId: bufferedRow.session_id,
          release: bufferedRow.release,
          version: bufferedRow.version,
          environment: bufferedRow.environment ?? undefined,
          tags: bufferedRow.tags,
          bookmarked: bufferedRow.bookmarked,
          public: bufferedRow.public,
          input: bufferedRow.input,
          output: bufferedRow.output,
          metadata: bufferedRow.metadata,
          scores: outputScores,
          comments: traceComments,
        },
      ],
      emptyScoreColumns,
    )[0];
  };

  // Convert async generator to Node.js Readable stream
  let recordsProcessed = 0;

  return Readable.from(
    (async function* () {
      let rowBuffer: Awaited<
        ReturnType<typeof asyncGenerator.next>
      >["value"][] = [];
      let traceIds: string[] = [];

      for await (const row of asyncGenerator) {
        rowBuffer.push(row);
        traceIds.push(row.id);

        // Process in batches
        if (rowBuffer.length >= BATCH_SIZE) {
          // Fetch comments for this batch
          const commentsByTrace = await fetchCommentsForExport(
            projectId,
            "TRACE",
            traceIds,
          );

          // Process each row in the buffer
          for (const bufferedRow of rowBuffer) {
            recordsProcessed++;
            if (recordsProcessed % 10000 === 0)
              logger.info(
                `Streaming traces for project ${projectId}: processed ${recordsProcessed} rows`,
              );

            yield processTraceRow(bufferedRow, commentsByTrace);
          }

          // Reset buffers
          rowBuffer = [];
          traceIds = [];
        }
      }

      // Process remaining rows in buffer
      if (rowBuffer.length > 0) {
        const commentsByTrace = await fetchCommentsForExport(
          projectId,
          "TRACE",
          traceIds,
        );

        for (const bufferedRow of rowBuffer) {
          recordsProcessed++;
          if (recordsProcessed % 10000 === 0)
            logger.info(
              `Streaming traces for project ${projectId}: processed ${recordsProcessed} rows`,
            );

          yield processTraceRow(bufferedRow, commentsByTrace);
        }
      }
    })(),
  );
};
