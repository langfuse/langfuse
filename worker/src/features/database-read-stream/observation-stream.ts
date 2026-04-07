import {
  BatchExportFileFormat,
  FilterCondition,
  type ScoreDataTypeType,
  TimeFilter,
  TracingSearchType,
  observationsTableCols,
} from "@langfuse/shared";
import {
  getDistinctScoreNames,
  queryClickhouseStream,
  ObservationRecordReadType,
  StringFilter,
  FilterList,
  createFilterFromFilterState,
  observationsTableUiColumnDefinitions,
  enrichObservationWithModelData,
  createModelCache,
  clickhouseSearchCondition,
  convertObservation,
  shouldSkipObservationsFinal,
} from "@langfuse/shared/src/server";
import { Readable } from "stream";
import { env } from "../../env";
import {
  getChunkWithFlattenedScores,
  prepareScoresForOutput,
} from "./getDatabaseReadStream";
import { fetchCommentsForExport } from "./fetchCommentsForExport";

const DEFAULT_BATCH_SIZE = 1000;
const REDUCED_BATCH_SIZE = 200; // Smaller batch for JSON/JSONL which hold parsed objects in memory

export const getObservationStream = async (props: {
  projectId: string;
  cutoffCreatedAt: Date;
  filter: FilterCondition[] | null;
  searchQuery?: string;
  searchType?: TracingSearchType[];
  rowLimit?: number;
  fileFormat?: BatchExportFileFormat;
}): Promise<Readable> => {
  const {
    projectId,
    cutoffCreatedAt,
    filter = [],
    searchQuery,
    searchType,
    rowLimit = env.BATCH_EXPORT_ROW_LIMIT,
  } = props;

  const isCsv = props.fileFormat === BatchExportFileFormat.CSV;
  const batchSize = isCsv ? DEFAULT_BATCH_SIZE : REDUCED_BATCH_SIZE;

  // Check if we should skip deduplication for OTEL projects
  const skipDedup = await shouldSkipObservationsFinal(projectId);

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

  // Filter out trace-level filters since we don't join the traces table for filtering
  // This prevents batch export failures when trace-level filters are present
  const observationOnlyFilters = (filter ?? []).filter((f) => {
    const columnDef = observationsTableUiColumnDefinitions.find(
      (col) => col.uiTableName === f.column || col.uiTableId === f.column,
    );
    // Keep the filter if it's not a trace-level filter
    return columnDef?.clickhouseTableName !== "traces";
  });

  const distinctScoreNames = await getDistinctScoreNames({
    projectId,
    cutoffCreatedAt,
    filter: observationOnlyFilters,
    isTimestampFilter: (filter: FilterCondition): filter is TimeFilter => {
      return filter.column === "Start Time" && filter.type === "datetime";
    },
    clickhouseConfigs,
  });

  const scoresFilter = new FilterList([
    new StringFilter({
      clickhouseTable: "scores",
      field: "project_id",
      operator: "=",
      value: projectId,
    }),
  ]);

  const appliedScoresFilter = scoresFilter.apply();

  const observationsFilter = new FilterList([
    new StringFilter({
      clickhouseTable: "observations",
      field: "project_id",
      operator: "=",
      value: projectId,
      tablePrefix: "o",
    }),
  ]);

  observationsFilter.push(
    ...createFilterFromFilterState(
      [
        ...observationOnlyFilters,
        {
          column: "startTime",
          operator: "<" as const,
          value: cutoffCreatedAt,
          type: "datetime" as const,
        },
      ],
      observationsTableUiColumnDefinitions,
      observationsTableCols,
    ),
  );

  const appliedObservationsFilter = observationsFilter.apply();

  const search = clickhouseSearchCondition(searchQuery, searchType, "o");

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
          -- concat encoding for hasAny filter compatibility
          groupArrayIf(
            concat(name, ':', string_value),
            data_type IN ('CATEGORICAL', 'TEXT') AND notEmpty(string_value)
          ) AS score_categories,
          -- tuple encoding for accurate output parsing (names may contain colons)
          groupArrayIf(
            tuple(name, string_value, data_type),
            data_type IN ('CATEGORICAL', 'TEXT') AND notEmpty(string_value)
          ) AS score_categories_tuples
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
        o.id as id,
        o.type as type,
        o.project_id as "project_id",
        o.name as name,
        o."model_parameters" as model_parameters,
        o.start_time as "start_time",
        o.end_time as "end_time",
        o.trace_id as "trace_id",
        o.completion_start_time as "completion_start_time",
        o.provided_usage_details as "provided_usage_details",
        o.usage_details as "usage_details",
        o.provided_cost_details as "provided_cost_details",
        o.cost_details as "cost_details",
        o.level as level,
        o.environment as "environment",
        o.status_message as "status_message",
        o.version as version,
        o.parent_observation_id as "parent_observation_id",
        o.created_at as "created_at",
        o.updated_at as "updated_at",
        o.provided_model_name as "provided_model_name",
        o.total_cost as "total_cost",
        o.prompt_id as "prompt_id",
        o.prompt_name as "prompt_name",
        o.prompt_version as "prompt_version",
        internal_model_id as "internal_model_id",
        if(isNull(end_time), NULL, date_diff('millisecond', start_time, end_time)) as latency,
        if(isNull(completion_start_time), NULL,  date_diff('millisecond', start_time, completion_start_time)) as "time_to_first_token",
        o.input as input,
        o.output as output,
        o.metadata as metadata,
        t.name as traceName,
        t.tags as traceTags,
        t.timestamp as traceTimestamp,
        t.user_id as userId,
        s.scores_avg as scores_avg,
        s.score_categories as score_categories,
        s.score_categories_tuples as score_categories_tuples
      FROM observations o
        LEFT JOIN traces t ON t.id = o.trace_id AND t.project_id = o.project_id
        LEFT JOIN scores_agg s ON s.trace_id = o.trace_id AND s.observation_id = o.id
      WHERE ${appliedObservationsFilter.query}
        ${search.query}
      ${skipDedup ? "" : "LIMIT 1 BY o.id, o.project_id"}
      limit {rowLimit: Int64}
  `;

  const asyncGenerator = queryClickhouseStream<
    ObservationRecordReadType & {
      scores_avg:
        | {
            name: string;
            value: number;
            dataType: ScoreDataTypeType;
            stringValue: string;
          }[]
        | undefined;
      score_categories: string[] | undefined;
      score_categories_tuples: [string, string | null, string][] | undefined;
    } & {
      traceName: string;
      traceTags: string[];
      traceTimestamp: Date;
      userId: string | null;
    }
  >({
    query,
    params: {
      projectId,
      rowLimit,
      ...appliedScoresFilter.params,
      ...appliedObservationsFilter.params,
      ...search.params,
    },
    clickhouseConfigs,
    tags: {
      feature: "batch-export",
      type: "observation",
      kind: "export",
      projectId,
    },
  });

  // Helper function to process a single observation row
  const modelCache = createModelCache(projectId);
  const emptyScoreColumns = distinctScoreNames.reduce(
    (acc, name) => ({ ...acc, [name]: null }),
    {} as Record<string, null>,
  );

  type ObservationRow = ObservationRecordReadType & {
    scores_avg:
      | {
          name: string;
          value: number;
          dataType: ScoreDataTypeType;
          stringValue: string;
        }[]
      | undefined;
    score_categories: string[] | undefined;
    score_categories_tuples: [string, string | null, string][] | undefined;
  } & {
    traceName: string;
    traceTags: string[];
    traceTimestamp: Date;
    userId: string | null;
  };

  const processObservationRow = async (
    bufferedRow: ObservationRow,
    commentsByObservation: Map<string, any[]>,
  ) => {
    // Fetch model data from cache (or database if not cached)
    const model = await modelCache.getModel(bufferedRow.internal_model_id);
    const modelData = enrichObservationWithModelData(model);

    // Process numeric/boolean scores (tuples from ClickHouse)
    const numericScores = (bufferedRow.scores_avg ?? []).map((score: any) => ({
      name: score[0],
      value: score[1],
      dataType: score[2],
      stringValue: score[3],
    }));

    // Process categorical scores (tuples from ClickHouse)
    const categoricalScores = (bufferedRow.score_categories_tuples ?? []).map(
      (cat) => ({
        name: cat[0],
        value: null,
        dataType: cat[2],
        stringValue: cat[1],
      }),
    );

    const outputScores: Record<string, string[] | number[]> =
      prepareScoresForOutput([...numericScores, ...categoricalScores]);

    // Get comments for this observation
    const observationComments = commentsByObservation.get(bufferedRow.id) ?? [];

    return getChunkWithFlattenedScores(
      [
        {
          ...convertObservation(bufferedRow, {
            truncated: false,
            shouldJsonParse: props.fileFormat !== BatchExportFileFormat.CSV,
          }),
          traceName: bufferedRow.traceName,
          traceTags: bufferedRow.traceTags,
          traceTimestamp: bufferedRow.traceTimestamp,
          userId: bufferedRow.userId,
          toolDefinitionsCount: null,
          toolCallsCount: null,
          ...modelData,
          scores: outputScores,
          comments: observationComments,
        },
      ],
      emptyScoreColumns,
    )[0];
  };

  // Convert async generator to Node.js Readable stream

  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- Counter for potential future instrumentation
  let recordsProcessed = 0;

  return Readable.from(
    (async function* () {
      let rowBuffer: ObservationRow[] = [];
      let observationIds: string[] = [];

      for await (const row of asyncGenerator) {
        rowBuffer.push(row);
        observationIds.push(row.id);

        // Process in batches
        if (rowBuffer.length >= batchSize) {
          // Fetch comments for this batch
          const commentsByObservation = await fetchCommentsForExport(
            projectId,
            "OBSERVATION",
            observationIds,
          );

          // Process each row in the buffer
          for (const bufferedRow of rowBuffer) {
            recordsProcessed++;

            yield await processObservationRow(
              bufferedRow,
              commentsByObservation,
            );
          }

          // Reset buffers
          rowBuffer = [];
          observationIds = [];
        }
      }

      // Process remaining rows in buffer
      if (rowBuffer.length > 0) {
        const commentsByObservation = await fetchCommentsForExport(
          projectId,
          "OBSERVATION",
          observationIds,
        );

        for (const bufferedRow of rowBuffer) {
          recordsProcessed++;
          yield await processObservationRow(bufferedRow, commentsByObservation);
        }
      }
    })(),
  );
};
