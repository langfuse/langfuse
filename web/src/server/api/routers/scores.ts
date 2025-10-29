import { z } from "zod/v4";

import { throwIfNoProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { auditLog } from "@/src/features/audit-logs/auditLog";
import { composeAggregateScoreKey } from "@/src/features/scores/lib/aggregateScores";
import {
  getDateFromOption,
  SelectedTimeOptionSchema,
} from "@/src/utils/date-range-utils";
import {
  createTRPCRouter,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import {
  orderBy,
  paginationZod,
  singleFilter,
  timeFilter,
  UpdateAnnotationScoreData,
  validateDbScore,
  ScoreSource,
  LangfuseNotFoundError,
  InternalServerError,
  BatchActionQuerySchema,
  BatchActionType,
  BatchExportTableName,
  type ScoreDomain,
  CreateAnnotationScoreData,
  type ScoreConfigDomain,
} from "@langfuse/shared";
import {
  getScoresGroupedByNameSourceType,
  getScoresUiCount,
  getScoresUiTable,
  getScoreNames,
  getTracesGroupedByTags,
  getTracesGroupedByName,
  getTracesGroupedByUsers,
  tracesTableUiColumnDefinitions,
  upsertScore,
  logger,
  getTraceById,
  getScoreById,
  queryClickhouse,
  convertDateToClickhouseDateTime,
  searchExistingAnnotationScore,
  hasAnyScore,
  ScoreDeleteQueue,
  QueueJobs,
  getScoreMetadataById,
  deleteScores,
  getTracesIdentifierForSession,
  validateConfigAgainstBody,
} from "@langfuse/shared/src/server";
import { v4 } from "uuid";
import { throwIfNoEntitlement } from "@/src/features/entitlements/server/hasEntitlement";
import { createBatchActionJob } from "@/src/features/table/server/createBatchActionJob";
import { TRPCError } from "@trpc/server";
import { randomUUID } from "crypto";
import { isTraceScore } from "@/src/features/scores/lib/helpers";

const ScoreFilterOptions = z.object({
  projectId: z.string(), // Required for protectedProjectProcedure
  filter: z.array(singleFilter),
  orderBy: orderBy,
});

const ScoreAllOptions = ScoreFilterOptions.extend({
  ...paginationZod,
});
type AllScoresReturnType = Omit<ScoreDomain, "metadata"> & {
  traceName: string | null;
  traceUserId: string | null;
  traceTags: Array<string> | null;
  jobConfigurationId: string | null;
  authorUserImage: string | null;
  authorUserName: string | null;
  hasMetadata: boolean;
  executionTraceId: string | null;
};

export const scoresRouter = createTRPCRouter({
  /**
   * Get all scores for a project, meant for internal use and *excludes metadata of scores*
   */
  all: protectedProjectProcedure
    .input(ScoreAllOptions)
    .query(async ({ input, ctx }) => {
      const clickhouseScoreData = await getScoresUiTable({
        projectId: input.projectId,
        filter: input.filter ?? [],
        orderBy: input.orderBy,
        limit: input.limit,
        offset: input.page * input.limit,
        excludeMetadata: true,
        includeHasMetadataFlag: true,
      });

      const [jobExecutions, users] = await Promise.all([
        ctx.prisma.jobExecution.findMany({
          where: {
            projectId: input.projectId,
            jobOutputScoreId: {
              in: clickhouseScoreData.map((score) => score.id),
            },
          },
          select: {
            id: true,
            jobConfigurationId: true,
            jobOutputScoreId: true,
          },
        }),
        ctx.prisma.user.findMany({
          where: {
            id: {
              in: clickhouseScoreData
                .map((score) => score.authorUserId)
                .filter((s): s is string => Boolean(s)),
            },
          },
          select: {
            id: true,
            name: true,
            image: true,
          },
        }),
      ]);

      return {
        scores: clickhouseScoreData.map<AllScoresReturnType>((score) => {
          const jobExecution = jobExecutions.find(
            (je) => je.jobOutputScoreId === score.id,
          );
          const user = users.find((u) => u.id === score.authorUserId);
          return {
            ...score,
            jobConfigurationId: jobExecution?.jobConfigurationId ?? null,
            authorUserImage: user?.image ?? null,
            authorUserName: user?.name ?? null,
          };
        }),
      };
    }),
  byId: protectedProjectProcedure
    .input(
      z.object({
        scoreId: z.string(), // used for matching
        projectId: z.string(), // used for security check
      }),
    )
    .query(async ({ input }) => {
      const score = await getScoreById({
        projectId: input.projectId,
        scoreId: input.scoreId,
      });
      if (!score) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `No score with id ${input.scoreId} in project ${input.projectId} in Clickhouse`,
        });
      }
      return {
        ...score,
        metadata: score.metadata ? JSON.stringify(score.metadata) : null,
      };
    }),
  countAll: protectedProjectProcedure
    .input(ScoreAllOptions)
    .query(async ({ input }) => {
      const clickhouseScoreData = await getScoresUiCount({
        projectId: input.projectId,
        filter: input.filter ?? [],
        orderBy: input.orderBy,
        limit: 1,
        offset: 0,
      });

      return {
        totalCount: clickhouseScoreData,
      };
    }),
  filterOptions: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        timestampFilter: z.array(timeFilter).optional(),
      }),
    )
    .query(async ({ input }) => {
      const { timestampFilter } = input;
      const [names, tags, traceNames, userIds] = await Promise.all([
        getScoreNames(input.projectId, timestampFilter ?? []),
        getTracesGroupedByTags({
          projectId: input.projectId,
          filter: timestampFilter ?? [],
        }),
        getTracesGroupedByName(
          input.projectId,
          tracesTableUiColumnDefinitions,
          timestampFilter ?? [],
        ),
        getTracesGroupedByUsers(
          input.projectId,
          timestampFilter ?? [],
          undefined,
          100, // limit to top 100 users
          0,
        ),
      ]);

      return {
        name: names.map((i) => ({ value: i.name, count: i.count })),
        tags: tags,
        traceName: traceNames.map((tn) => ({
          value: tn.name,
          count: tn.count,
        })),
        userId: userIds.map((u) => ({ value: u.user, count: u.count })),
      };
    }),
  deleteMany: protectedProjectProcedure
    .input(
      z.object({
        scoreIds: z
          .array(z.string())
          .min(1, "Minimum 1 scoreId is required.")
          .nullable(),
        projectId: z.string(),
        query: BatchActionQuerySchema.optional(),
        isBatchAction: z.boolean().default(false),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      // We reuse the trace-deletion entitlement here as this is a very similar and destructive operation.
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "traces:delete",
      });

      throwIfNoEntitlement({
        entitlement: "trace-deletion",
        projectId: input.projectId,
        sessionUser: ctx.session.user,
      });

      if (input.isBatchAction && input.query) {
        return createBatchActionJob({
          projectId: input.projectId,
          actionId: "score-delete",
          actionType: BatchActionType.Delete,
          tableName: BatchExportTableName.Scores,
          session: ctx.session,
          query: input.query,
        });
      }
      if (input.scoreIds) {
        const scoreDeleteQueue = ScoreDeleteQueue.getInstance();
        if (!scoreDeleteQueue) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "ScoreDeleteQueue not initialized",
          });
        }

        await Promise.all(
          input.scoreIds.map((scoreId) =>
            auditLog({
              resourceType: "score",
              resourceId: scoreId,
              action: "delete",
              session: ctx.session,
            }),
          ),
        );

        return scoreDeleteQueue.add(QueueJobs.ScoreDelete, {
          timestamp: new Date(),
          id: randomUUID(),
          payload: {
            projectId: input.projectId,
            scoreIds: input.scoreIds,
          },
          name: QueueJobs.ScoreDelete,
        });
      }
      throw new TRPCError({
        message:
          "Either batchAction or scoreIds must be provided to delete scores.",
        code: "BAD_REQUEST",
      });
    }),
  createAnnotationScore: protectedProjectProcedure
    .input(CreateAnnotationScoreData)
    .mutation(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "scores:CUD",
      });

      const inflatedParams = isTraceScore(input.scoreTarget)
        ? {
            observationId: input.scoreTarget.observationId ?? null,
            traceId: input.scoreTarget.traceId,
            sessionId: null,
          }
        : {
            observationId: null,
            traceId: null,
            sessionId: input.scoreTarget.sessionId,
          };

      if (inflatedParams.traceId) {
        const clickhouseTrace = await getTraceById({
          traceId: inflatedParams.traceId,
          projectId: input.projectId,
          clickhouseFeatureTag: "annotations-trpc",
        });

        if (!clickhouseTrace) {
          logger.error(
            `No trace with id ${inflatedParams.traceId} in project ${input.projectId} in Clickhouse`,
          );
          throw new LangfuseNotFoundError(
            `No trace with id ${inflatedParams.traceId} in project ${input.projectId} in Clickhouse`,
          );
        }
      } else if (inflatedParams.sessionId) {
        // We consider no longer writing all sessions into postgres, hence we should search for traces with the session id
        const traceIdentifiers = await getTracesIdentifierForSession(
          input.projectId,
          inflatedParams.sessionId,
        );
        if (traceIdentifiers.length === 0) {
          logger.error(
            `No trace referencing session with id ${inflatedParams.sessionId} in project ${input.projectId} in Clickhouse`,
          );
          throw new LangfuseNotFoundError(
            `No trace referencing session with id ${inflatedParams.sessionId} in project ${input.projectId} in Clickhouse`,
          );
        }
      }

      const clickhouseScore = await searchExistingAnnotationScore(
        input.projectId,
        inflatedParams.observationId,
        inflatedParams.traceId,
        inflatedParams.sessionId,
        input.name,
        input.configId,
        input.dataType,
      );

      const score = !!clickhouseScore
        ? {
            ...clickhouseScore,
            value: input.value ?? null,
            stringValue: input.stringValue ?? null,
            comment: input.comment ?? null,
            metadata: {},
            authorUserId: ctx.session.user.id,
            queueId: input.queueId ?? null,
            timestamp: new Date(),
          }
        : {
            id: input.id ?? v4(),
            projectId: input.projectId,
            environment: input.environment ?? "default",
            ...inflatedParams,
            // only trace and session scores are supported for annotation
            datasetRunId: null,
            value: input.value ?? null,
            stringValue: input.stringValue ?? null,
            dataType: input.dataType ?? null,
            configId: input.configId ?? null,
            name: input.name,
            comment: input.comment ?? null,
            metadata: {},
            authorUserId: ctx.session.user.id,
            source: ScoreSource.ANNOTATION,
            queueId: input.queueId ?? null,
            executionTraceId: null,
            createdAt: new Date(),
            updatedAt: new Date(),
            timestamp: new Date(),
          };

      await upsertScore({
        id: score.id, // Reuse ID that was generated by Prisma
        timestamp: convertDateToClickhouseDateTime(new Date()),
        project_id: input.projectId,
        environment: input.environment ?? "default",
        trace_id: inflatedParams.traceId,
        observation_id: inflatedParams.observationId,
        session_id: inflatedParams.sessionId,
        name: input.name,
        value: input.value !== null ? input.value : undefined,
        source: ScoreSource.ANNOTATION,
        comment: input.comment,
        author_user_id: ctx.session.user.id,
        config_id: input.configId,
        data_type: input.dataType,
        string_value: input.stringValue,
        queue_id: input.queueId,
      });

      await auditLog({
        session: ctx.session,
        resourceType: "score",
        resourceId: score.id,
        action: "create",
        after: score,
      });

      return validateDbScore(score);
    }),
  updateAnnotationScore: protectedProjectProcedure
    .input(UpdateAnnotationScoreData)
    .mutation(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "scores:CUD",
      });

      let updatedScore: ScoreDomain | null | undefined = null;

      // Fetch the current score from Clickhouse
      const score = await getScoreById({
        projectId: input.projectId,
        scoreId: input.id,
        source: ScoreSource.ANNOTATION,
      });
      if (!score) {
        logger.warn(
          `No annotation score with id ${input.id} in project ${input.projectId} in Clickhouse`,
        );
        throw new LangfuseNotFoundError(
          `No annotation score with id ${input.id} in project ${input.projectId} in Clickhouse`,
        );
      } else {
        // validate score against config
        if (score.configId) {
          const config = await ctx.prisma.scoreConfig.findFirst({
            where: {
              id: score.configId,
              projectId: input.projectId,
            },
          });
          if (!config) {
            throw new LangfuseNotFoundError(
              `No score config with id ${score.configId} in project ${input.projectId}`,
            );
          }
          try {
            validateConfigAgainstBody({
              body: {
                ...score,
                value: input.value ?? null,
                stringValue: input.stringValue ?? null,
                comment: input.comment ?? null,
              },
              config: config as ScoreConfigDomain,
              context: "ANNOTATION",
            });
          } catch (error) {
            throw new TRPCError({
              code: "PRECONDITION_FAILED",
              message:
                "Score does not comply with config schema. Please adjust or delete score.",
            });
          }
        }

        await upsertScore({
          id: input.id,
          project_id: input.projectId,
          timestamp: convertDateToClickhouseDateTime(score.timestamp),
          value: input.value !== null ? input.value : undefined,
          string_value: input.stringValue,
          comment: input.comment,
          author_user_id: ctx.session.user.id,
          queue_id: input.queueId,
          source: ScoreSource.ANNOTATION,
          name: score.name,
          data_type: score.dataType,
          config_id: score.configId,
          trace_id: score.traceId,
          observation_id: score.observationId,
          session_id: score.sessionId,
          environment: score.environment,
        });

        updatedScore = {
          ...score,
          value: input.value ?? null,
          stringValue: input.stringValue ?? null,
          comment: input.comment ?? null,
          authorUserId: ctx.session.user.id,
          queueId: input.queueId ?? null,
          timestamp: new Date(),
        };

        await auditLog({
          session: ctx.session,
          resourceType: "score",
          resourceId: input.id,
          action: "update",
          before: score,
          after: updatedScore,
        });
      }

      if (!updatedScore) {
        throw new InternalServerError(
          `Annotation score could not be updated in project ${input.projectId}`,
        );
      }

      return validateDbScore(updatedScore);
    }),
  deleteAnnotationScore: protectedProjectProcedure
    .input(z.object({ projectId: z.string(), id: z.string() }))
    .mutation(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "scores:CUD",
      });

      // Fetch the current score from Clickhouse
      const clickhouseScore = await getScoreById({
        projectId: input.projectId,
        scoreId: input.id,
        source: ScoreSource.ANNOTATION,
      });
      if (!clickhouseScore) {
        logger.warn(
          `No annotation score with id ${input.id} in project ${input.projectId} in Clickhouse`,
        );
        throw new LangfuseNotFoundError(
          `No annotation score with id ${input.id} in project ${input.projectId} in Clickhouse`,
        );
      }

      await auditLog({
        session: ctx.session,
        resourceType: "score",
        resourceId: input.id,
        action: "delete",
        before: clickhouseScore,
      });

      await deleteScores(input.projectId, [clickhouseScore.id]);

      return validateDbScore(clickhouseScore);
    }),
  /**
   * @deprecated, use getScoreColumns instead
   */
  getScoreKeysAndProps: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        selectedTimeOption: SelectedTimeOptionSchema,
      }),
    )
    .query(async ({ input }) => {
      const date = getDateFromOption(input.selectedTimeOption);
      const res = await getScoresGroupedByNameSourceType({
        projectId: input.projectId,
        fromTimestamp: date,
        filter: [],
      });
      return res.map(({ name, source, dataType }) => ({
        key: composeAggregateScoreKey({ name, source, dataType }),
        name: name,
        source: source,
        dataType: dataType,
      }));
    }),
  getScoreColumns: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        filter: z.array(singleFilter).optional(),
        fromTimestamp: z.date().optional(),
        toTimestamp: z.date().optional(),
      }),
    )
    .query(async ({ input }) => {
      const { projectId, filter, fromTimestamp, toTimestamp } = input;

      const groupedScores = await getScoresGroupedByNameSourceType({
        projectId,
        filter: filter || [],
        fromTimestamp,
        toTimestamp,
      });

      const scoreColumns = groupedScores.map(({ name, source, dataType }) => ({
        key: composeAggregateScoreKey({ name, source, dataType }),
        name,
        source,
        dataType,
      }));

      return { scoreColumns };
    }),
  hasAny: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
      }),
    )
    .query(async ({ input }) => {
      return await hasAnyScore(input.projectId);
    }),
  getScoreMetadataById: protectedProjectProcedure
    .input(z.object({ projectId: z.string(), id: z.string() }))
    .query(async ({ input }) => {
      return (await getScoreMetadataById(input.projectId, input.id)) ?? null;
    }),

  /**
   * Get available score identifiers for analytics dropdown
   */
  getScoreIdentifiers: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
      }),
    )
    .query(async ({ input }) => {
      const { projectId } = input;

      // Query ClickHouse for distinct score names, data types, and sources
      const groupedScores = await getScoresGroupedByNameSourceType({
        projectId,
        filter: [],
      });

      // Format for ScoreSelector component: "name-dataType-source"
      const scores = groupedScores.map(({ name, source, dataType }) => ({
        value: `${name}-${dataType}-${source}`,
        name,
        dataType,
        source,
      }));

      return { scores };
    }),

  /**
   * Get comprehensive score comparison analytics using single UNION ALL query
   * Returns counts, heatmap, confusion matrix, statistics, time series, and distributions
   */
  getScoreComparisonAnalytics: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        score1: z.object({
          name: z.string(),
          dataType: z.string(),
          source: z.string(),
        }),
        score2: z.object({
          name: z.string(),
          dataType: z.string(),
          source: z.string(),
        }),
        fromTimestamp: z.date(),
        toTimestamp: z.date(),
        interval: z.enum(["hour", "day", "week", "month"]).default("day"),
        nBins: z.number().int().min(5).max(50).default(10),
        maxMatchedScoresLimit: z.number().int().default(100000),
      }),
    )
    .query(async ({ input }) => {
      const {
        projectId,
        score1,
        score2,
        fromTimestamp,
        toTimestamp,
        interval,
        nBins,
        maxMatchedScoresLimit,
      } = input;

      // Convert interval to ClickHouse INTERVAL syntax
      const intervalMap: Record<string, string> = {
        hour: "INTERVAL 1 HOUR",
        day: "INTERVAL 1 DAY",
        week: "INTERVAL 1 WEEK",
        month: "INTERVAL 1 MONTH",
      };
      const clickhouseInterval = intervalMap[interval];

      // Construct comprehensive UNION ALL query
      const query = `
        WITH
          -- CTE 1: Filter score 1
          score1_filtered AS (
            SELECT
              id, value, string_value,
              trace_id, observation_id, session_id, dataset_run_id as run_id,
              timestamp
            FROM scores FINAL
            WHERE project_id = {projectId: String}
              AND name = {score1Name: String}
              AND source = {score1Source: String}
              AND data_type = {dataType: String}
              AND timestamp >= {fromTimestamp: DateTime64(3)}
              AND timestamp <= {toTimestamp: DateTime64(3)}
              AND is_deleted = 0
          ),

          -- CTE 2: Filter score 2
          score2_filtered AS (
            SELECT
              id, value, string_value,
              trace_id, observation_id, session_id, dataset_run_id as run_id,
              timestamp
            FROM scores FINAL
            WHERE project_id = {projectId: String}
              AND name = {score2Name: String}
              AND source = {score2Source: String}
              AND data_type = {dataType: String}
              AND timestamp >= {fromTimestamp: DateTime64(3)}
              AND timestamp <= {toTimestamp: DateTime64(3)}
              AND is_deleted = 0
          ),

          -- CTE 3: Match scores - must have exact same attachment (trace/obs/session/run)
          -- NULL-safe comparison: convert NULL to empty string for comparison
          matched_scores AS (
            SELECT
              s1.value as value1,
              s1.string_value as string_value1,
              s2.value as value2,
              s2.string_value as string_value2,
              s1.timestamp as timestamp1,
              s2.timestamp as timestamp2,
              coalesce(s1.trace_id, s2.trace_id) as trace_id,
              coalesce(s1.observation_id, s2.observation_id) as observation_id,
              coalesce(s1.session_id, s2.session_id) as session_id,
              coalesce(s1.run_id, s2.run_id) as run_id
            FROM score1_filtered s1
            INNER JOIN score2_filtered s2
              ON ifNull(s1.trace_id, '') = ifNull(s2.trace_id, '')
              AND ifNull(s1.observation_id, '') = ifNull(s2.observation_id, '')
              AND ifNull(s1.session_id, '') = ifNull(s2.session_id, '')
              AND ifNull(s1.run_id, '') = ifNull(s2.run_id, '')
            LIMIT {maxMatchedScoresLimit: UInt32}
          ),

          -- CTE 4: Bounds (for numeric heatmap binning)
          bounds AS (
            SELECT
              min(value1) as min1,
              max(value1) as max1,
              min(value2) as min2,
              max(value2) as max2
            FROM matched_scores
          ),

          -- CTE 5: Heatmap (numeric only, 10x10 grid)
          heatmap AS (
            SELECT
              floor((m.value1 - b.min1) / ((b.max1 - b.min1 + 0.0001) / {nBins: UInt8})) as bin_x,
              floor((m.value2 - b.min2) / ((b.max2 - b.min2 + 0.0001) / {nBins: UInt8})) as bin_y,
              count() as count,
              b.min1, b.max1, b.min2, b.max2
            FROM matched_scores m
            CROSS JOIN bounds b
            GROUP BY bin_x, bin_y, b.min1, b.max1, b.min2, b.max2
          ),

          -- CTE 6: Confusion matrix (categorical/boolean only)
          confusion AS (
            SELECT
              string_value1 as row_category,
              string_value2 as col_category,
              count() as count
            FROM matched_scores
            GROUP BY string_value1, string_value2
          ),

          -- CTE 7: Statistics
          stats AS (
            SELECT
              count() as matched_count,
              avg(value1) as mean1,
              avg(value2) as mean2,
              stddevPop(value1) as std1,
              stddevPop(value2) as std2,
              corr(value1, value2) as pearson_correlation,
              avg(abs(value1 - value2)) as mae,
              sqrt(avg(pow(value1 - value2, 2))) as rmse
            FROM matched_scores
          ),

          -- CTE 8: Time series
          timeseries AS (
            SELECT
              toStartOfInterval(timestamp1, ${clickhouseInterval}) as ts,
              avg(value1) as avg1,
              avg(value2) as avg2,
              count() as count
            FROM matched_scores
            GROUP BY ts
            ORDER BY ts
          ),

          -- CTE 9: Distribution for score1
          distribution1 AS (
            SELECT
              floor((value - (SELECT min(value) FROM score1_filtered)) /
                    (((SELECT max(value) FROM score1_filtered) - (SELECT min(value) FROM score1_filtered) + 0.0001) / {nBins: UInt8})) as bin_index,
              count() as count
            FROM score1_filtered
            GROUP BY bin_index
          ),

          -- CTE 10: Distribution for score2
          distribution2 AS (
            SELECT
              floor((value - (SELECT min(value) FROM score2_filtered)) /
                    (((SELECT max(value) FROM score2_filtered) - (SELECT min(value) FROM score2_filtered) + 0.0001) / {nBins: UInt8})) as bin_index,
              count() as count
            FROM score2_filtered
            GROUP BY bin_index
          )

        -- Return multiple result sets via UNION ALL
        SELECT
          'counts' as result_type,
          CAST((SELECT count() FROM score1_filtered) AS Float64) as col1,
          CAST((SELECT count() FROM score2_filtered) AS Float64) as col2,
          CAST((SELECT count() FROM matched_scores) AS Float64) as col3,
          CAST(NULL AS Nullable(Float64)) as col4,
          CAST(NULL AS Nullable(Float64)) as col5,
          CAST(NULL AS Nullable(Float64)) as col6,
          CAST(NULL AS Nullable(Float64)) as col7,
          CAST(NULL AS Nullable(Float64)) as col8,
          CAST(NULL AS Nullable(String)) as col9,
          CAST(NULL AS Nullable(String)) as col10

        UNION ALL

        SELECT
          'heatmap' as result_type,
          CAST(bin_x AS Float64) as col1,
          CAST(bin_y AS Float64) as col2,
          CAST(count AS Float64) as col3,
          min1 as col4,
          max1 as col5,
          min2 as col6,
          max2 as col7,
          CAST(NULL AS Nullable(Float64)) as col8,
          CAST(NULL AS Nullable(String)) as col9,
          CAST(NULL AS Nullable(String)) as col10
        FROM heatmap

        UNION ALL

        SELECT
          'confusion' as result_type,
          CAST(count AS Float64) as col1,
          CAST(NULL AS Nullable(Float64)) as col2,
          CAST(NULL AS Nullable(Float64)) as col3,
          CAST(NULL AS Nullable(Float64)) as col4,
          CAST(NULL AS Nullable(Float64)) as col5,
          CAST(NULL AS Nullable(Float64)) as col6,
          CAST(NULL AS Nullable(Float64)) as col7,
          CAST(NULL AS Nullable(Float64)) as col8,
          row_category as col9,
          col_category as col10
        FROM confusion

        UNION ALL

        SELECT
          'stats' as result_type,
          CAST(matched_count AS Float64) as col1,
          mean1 as col2,
          mean2 as col3,
          std1 as col4,
          std2 as col5,
          pearson_correlation as col6,
          mae as col7,
          rmse as col8,
          CAST(NULL AS Nullable(String)) as col9,
          CAST(NULL AS Nullable(String)) as col10
        FROM stats

        UNION ALL

        SELECT
          'timeseries' as result_type,
          CAST(toUnixTimestamp(ts) AS Float64) as col1,
          avg1 as col2,
          avg2 as col3,
          CAST(count AS Float64) as col4,
          CAST(NULL AS Nullable(Float64)) as col5,
          CAST(NULL AS Nullable(Float64)) as col6,
          CAST(NULL AS Nullable(Float64)) as col7,
          CAST(NULL AS Nullable(Float64)) as col8,
          CAST(NULL AS Nullable(String)) as col9,
          CAST(NULL AS Nullable(String)) as col10
        FROM timeseries

        UNION ALL

        SELECT
          'distribution1' as result_type,
          CAST(bin_index AS Float64) as col1,
          CAST(count AS Float64) as col2,
          CAST(NULL AS Nullable(Float64)) as col3,
          CAST(NULL AS Nullable(Float64)) as col4,
          CAST(NULL AS Nullable(Float64)) as col5,
          CAST(NULL AS Nullable(Float64)) as col6,
          CAST(NULL AS Nullable(Float64)) as col7,
          CAST(NULL AS Nullable(Float64)) as col8,
          CAST(NULL AS Nullable(String)) as col9,
          CAST(NULL AS Nullable(String)) as col10
        FROM distribution1

        UNION ALL

        SELECT
          'distribution2' as result_type,
          CAST(bin_index AS Float64) as col1,
          CAST(count AS Float64) as col2,
          CAST(NULL AS Nullable(Float64)) as col3,
          CAST(NULL AS Nullable(Float64)) as col4,
          CAST(NULL AS Nullable(Float64)) as col5,
          CAST(NULL AS Nullable(Float64)) as col6,
          CAST(NULL AS Nullable(Float64)) as col7,
          CAST(NULL AS Nullable(Float64)) as col8,
          CAST(NULL AS Nullable(String)) as col9,
          CAST(NULL AS Nullable(String)) as col10
        FROM distribution2
      `;

      // Execute query
      const results = await queryClickhouse<{
        result_type: string;
        col1: number | null;
        col2: number | null;
        col3: number | null;
        col4: number | null;
        col5: number | null;
        col6: number | null;
        col7: number | null;
        col8: number | null;
        col9: string | null;
        col10: string | null;
      }>({
        query,
        params: {
          projectId,
          score1Name: score1.name,
          score1Source: score1.source,
          score2Name: score2.name,
          score2Source: score2.source,
          dataType: score1.dataType,
          fromTimestamp: convertDateToClickhouseDateTime(fromTimestamp),
          toTimestamp: convertDateToClickhouseDateTime(toTimestamp),
          nBins,
          maxMatchedScoresLimit,
        },
        tags: {
          feature: "scores",
          type: "analytics",
          kind: "comparison",
          projectId,
        },
      });

      // Parse results by result_type
      const countsRow = results.find((r) => r.result_type === "counts");
      const heatmapRows = results.filter((r) => r.result_type === "heatmap");
      const confusionRows = results.filter(
        (r) => r.result_type === "confusion",
      );
      const statsRow = results.find((r) => r.result_type === "stats");
      const timeseriesRows = results.filter(
        (r) => r.result_type === "timeseries",
      );
      const dist1Rows = results.filter(
        (r) => r.result_type === "distribution1",
      );
      const dist2Rows = results.filter(
        (r) => r.result_type === "distribution2",
      );

      // Build structured response
      return {
        counts: {
          score1Total: countsRow?.col1 ?? 0,
          score2Total: countsRow?.col2 ?? 0,
          matchedCount: countsRow?.col3 ?? 0,
        },
        heatmap: heatmapRows.map((row) => ({
          binX: row.col1 ?? 0,
          binY: row.col2 ?? 0,
          count: row.col3 ?? 0,
          min1: row.col4 ?? 0,
          max1: row.col5 ?? 0,
          min2: row.col6 ?? 0,
          max2: row.col7 ?? 0,
        })),
        confusionMatrix: confusionRows.map((row) => ({
          rowCategory: row.col9 ?? "",
          colCategory: row.col10 ?? "",
          count: row.col1 ?? 0,
        })),
        statistics: statsRow
          ? {
              matchedCount: statsRow.col1 ?? 0,
              mean1: statsRow.col2 ?? null,
              mean2: statsRow.col3 ?? null,
              std1: statsRow.col4 ?? null,
              std2: statsRow.col5 ?? null,
              pearsonCorrelation: statsRow.col6 ?? null,
              mae: statsRow.col7 ?? null,
              rmse: statsRow.col8 ?? null,
            }
          : null,
        timeSeries: timeseriesRows.map((row) => ({
          timestamp: new Date((row.col1 ?? 0) * 1000),
          avg1: row.col2 ?? null,
          avg2: row.col3 ?? null,
          count: row.col4 ?? 0,
        })),
        distribution1: dist1Rows.map((row) => ({
          binIndex: row.col1 ?? 0,
          count: row.col2 ?? 0,
        })),
        distribution2: dist2Rows.map((row) => ({
          binIndex: row.col1 ?? 0,
          count: row.col2 ?? 0,
        })),
      };
    }),
});
