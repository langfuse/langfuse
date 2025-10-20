import {
  FilterCondition,
  ScoreDataType,
  TimeFilter,
  TracingSearchType,
} from "@langfuse/shared";
import {
  getDistinctScoreNames,
  queryClickhouseStream,
  logger,
  convertObservation,
  ObservationRecordReadType,
  StringFilter,
  FilterList,
  createFilterFromFilterState,
  observationsTableUiColumnDefinitions,
  enrichObservationWithModelData,
  clickhouseSearchCondition,
} from "@langfuse/shared/src/server";
import { prisma } from "@langfuse/shared/src/db";
import { Readable } from "stream";
import { env } from "../../env";
import {
  getChunkWithFlattenedScores,
  prepareScoresForOutput,
} from "./getDatabaseReadStream";
import type { Model, Price } from "@prisma/client";

type ModelWithPrice = Model & { Price: Price[] };

/**
 * Creates a model cache that fetches models from the database on demand and stores them in memory.
 * Only queries the database if a model ID is not already in the cache.
 *
 * @param projectId - The project ID to filter models by
 * @returns Object with getModel function to retrieve models by ID
 */
const createModelCache = (projectId: string) => {
  const modelCache = new Map<string, ModelWithPrice | null>();

  const getModel = async (
    internalModelId: string | null | undefined,
  ): Promise<ModelWithPrice | null> => {
    if (!internalModelId) return null;

    // Check if model is already in cache
    if (modelCache.has(internalModelId)) {
      return modelCache.get(internalModelId) ?? null;
    }

    // Fetch model from database
    const model = await prisma.model.findFirst({
      where: {
        id: internalModelId,
        OR: [{ projectId }, { projectId: null }],
      },
      include: {
        Price: true,
      },
    });

    // Store in cache (even if null to avoid repeated queries)
    modelCache.set(internalModelId, model);

    logger.debug(`Model ${internalModelId} fetched from database`);
    return model;
  };

  return { getModel };
};

export const getObservationStream = async (props: {
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

  const distinctScoreNames = await getDistinctScoreNames({
    projectId,
    cutoffCreatedAt,
    filter: filter ?? [],
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
        ...(filter ?? []),
        {
          column: "startTime",
          operator: "<" as const,
          value: cutoffCreatedAt,
          type: "datetime" as const,
        },
      ],
      observationsTableUiColumnDefinitions,
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
        o.input, 
        o.output, 
        o.metadata, 
        t.name as traceName,
        t.tags as traceTags,
        t.timestamp as traceTimestamp,
        t.user_id as userId,
        sa.scores_avg as scores_avg,
        sa.score_categories as score_categories
      FROM observations o
        LEFT JOIN traces t ON t.id = o.trace_id AND t.project_id = o.project_id
        LEFT JOIN scores_agg sa ON sa.trace_id = o.trace_id AND sa.observation_id = o.id
      WHERE ${appliedObservationsFilter.query}
        ${search.query}
      LIMIT 1 BY o.id, o.project_id
      limit {rowLimit: Int64}
  `;

  const asyncGenerator = queryClickhouseStream<
    ObservationRecordReadType & {
      scores_avg:
        | {
            name: string;
            value: number;
            dataType: ScoreDataType;
            stringValue: string;
          }[]
        | undefined;
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
    },
    clickhouseConfigs,
    tags: {
      feature: "batch-export",
      type: "observation",
      kind: "export",
      projectId,
    },
  });

  // Convert async generator to Node.js Readable stream
  let recordsProcessed = 0;
  const modelCache = createModelCache(projectId);

  return Readable.from(
    (async function* () {
      for await (const row of asyncGenerator) {
        recordsProcessed++;
        if (recordsProcessed % 10000 === 0)
          logger.info(
            `Streaming observations for project ${projectId}: processed ${recordsProcessed} rows`,
          );

        // Fetch model data from cache (or database if not cached)
        const model = await modelCache.getModel(row.internal_model_id);
        const modelData = enrichObservationWithModelData(model);

        yield getChunkWithFlattenedScores(
          [
            {
              ...convertObservation(row, {
                truncated: false,
                shouldJsonParse: true,
              }),
              traceName: row.traceName,
              traceTags: row.traceTags,
              traceTimestamp: row.traceTimestamp,
              userId: row.userId,
              ...modelData,
              scores: prepareScoresForOutput(
                (row.scores_avg ?? []).map((score: any) => ({
                  name: score[0],
                  value: score[1],
                  dataType: score[2],
                  stringValue: score[3],
                })),
              ),
            },
          ],
          distinctScoreNames.reduce(
            (acc, name) => ({ ...acc, [name]: null }),
            {} as Record<string, null>,
          ),
        )[0];
      }
    })(),
  );
};
