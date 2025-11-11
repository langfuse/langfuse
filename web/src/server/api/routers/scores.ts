import { z } from "zod/v4";

import { throwIfNoProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { auditLog } from "@/src/features/audit-logs/auditLog";
import { composeAggregateScoreKey } from "@/src/features/scores/lib/aggregateScores";
import {
  normalizeIntervalForClickHouse,
  getClickHouseTimeBucketFunction,
} from "@/src/features/scores/components/score-analytics/libs/clickhouse-time-utils";
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
  getScoreStringValues,
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

/**
 * Threshold for adaptive FINAL optimization
 * Use FINAL for datasets smaller than this to ensure accuracy (scores can be updated)
 * Skip FINAL for larger datasets to avoid expensive merge overhead
 */
const ADAPTIVE_FINAL_THRESHOLD = 100_000;

/**
 * Hash-based sampling thresholds
 * - SAMPLING_THRESHOLD: Sample when either score table exceeds this count
 * - TARGET_SAMPLE_SIZE: Target number of rows to sample from each table
 */
const SAMPLING_THRESHOLD = 100_000; // Start sampling if either table > 100k
const TARGET_SAMPLE_SIZE = 100_000; // Aim for 100k samples from each table

/**
 * Helper function: Estimate score match count using lightweight preflight query
 * Uses 1% hash sample for fast approximation without FINAL merge overhead
 * Returns estimates for score1 count, score2 count, and matched count
 */
async function estimateScoreMatchCount(params: {
  projectId: string;
  score1Name: string;
  score1Source: string;
  score1DataType: string;
  score2Name: string;
  score2Source: string;
  score2DataType: string;
  fromTimestamp: Date;
  toTimestamp: Date;
  objectTypeFilter: string;
}): Promise<{
  score1Count: number;
  score2Count: number;
  estimatedMatchedCount: number;
}> {
  const {
    projectId,
    score1Name,
    score1Source,
    score1DataType,
    score2Name,
    score2Source,
    score2DataType,
    fromTimestamp,
    toTimestamp,
    objectTypeFilter,
  } = params;

  // Use 1% hash sample for fast count estimation
  // cityHash64 provides uniform distribution for sampling
  const samplingExpression = `
    cityHash64(
      coalesce(trace_id, ''),
      coalesce(observation_id, ''),
      coalesce(session_id, ''),
      coalesce(dataset_run_id, '')
    ) % 100 < 1
  `;

  const preflightQuery = `
    WITH
      score1_sample AS (
        SELECT trace_id, observation_id, session_id, dataset_run_id
        FROM scores
        PREWHERE project_id = {projectId: String}
          AND name = {score1Name: String}
        WHERE source = {score1Source: String}
          AND data_type = {score1DataType: String}
          AND timestamp >= {fromTimestamp: DateTime64(3)}
          AND timestamp <= {toTimestamp: DateTime64(3)}
          AND is_deleted = 0
          AND ${samplingExpression}
          ${objectTypeFilter}
      ),
      score2_sample AS (
        SELECT trace_id, observation_id, session_id, dataset_run_id
        FROM scores
        PREWHERE project_id = {projectId: String}
          AND name = {score2Name: String}
        WHERE source = {score2Source: String}
          AND data_type = {score2DataType: String}
          AND timestamp >= {fromTimestamp: DateTime64(3)}
          AND timestamp <= {toTimestamp: DateTime64(3)}
          AND is_deleted = 0
          AND ${samplingExpression}
          ${objectTypeFilter}
      )
    SELECT
      (SELECT count() FROM score1_sample) * 100 as score1_count,
      (SELECT count() FROM score2_sample) * 100 as score2_count,
      (
        SELECT count() * 100
        FROM score1_sample s1
        INNER JOIN score2_sample s2
          ON ifNull(s1.trace_id, '') = ifNull(s2.trace_id, '')
          AND ifNull(s1.observation_id, '') = ifNull(s2.observation_id, '')
          AND ifNull(s1.session_id, '') = ifNull(s2.session_id, '')
          AND ifNull(s1.dataset_run_id, '') = ifNull(s2.dataset_run_id, '')
      ) as estimated_matched_count
  `;

  const result = await queryClickhouse<{
    score1_count: string;
    score2_count: string;
    estimated_matched_count: string;
  }>({
    query: preflightQuery,
    params: {
      projectId,
      score1Name,
      score1Source,
      score1DataType: score1DataType,
      score2Name,
      score2Source,
      score2DataType: score2DataType,
      fromTimestamp,
      toTimestamp,
    },
  });

  const row = result[0];
  return {
    score1Count: parseInt(row?.score1_count ?? "0", 10),
    score2Count: parseInt(row?.score2_count ?? "0", 10),
    estimatedMatchedCount: parseInt(row?.estimated_matched_count ?? "0", 10),
  };
}

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
      const [names, tags, traceNames, userIds, stringValues] =
        await Promise.all([
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
          getScoreStringValues(input.projectId, timestampFilter ?? []),
        ]);

      return {
        name: names.map((i) => ({ value: i.name, count: i.count })),
        tags: tags,
        traceName: traceNames.map((tn) => ({
          value: tn.name,
          count: tn.count,
        })),
        userId: userIds.map((u) => ({ value: u.user, count: u.count })),
        stringValue: stringValues,
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

      const timestamp = input.timestamp ?? new Date();

      const score = !!clickhouseScore
        ? {
            ...clickhouseScore,
            value: input.value ?? null,
            stringValue: input.stringValue ?? null,
            comment: input.comment ?? null,
            metadata: {},
            authorUserId: ctx.session.user.id,
            queueId: input.queueId ?? null,
            timestamp,
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
            timestamp,
          };

      await upsertScore({
        id: score.id, // Reuse ID that was generated by Prisma
        timestamp: convertDateToClickhouseDateTime(timestamp),
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
        // Clickhouse is eventually consistent; if client provided timestamp, we can upsert along the ordering key
        if (!input.timestamp) {
          logger.warn(
            `No annotation score with id ${input.id} in project ${input.projectId} in Clickhouse, and no timestamp provided`,
          );
          throw new LangfuseNotFoundError(
            `No annotation score with id ${input.id} in project ${input.projectId} in Clickhouse`,
          );
        }

        logger.info(
          `Score ${input.id} not found in ClickHouse for project ${input.projectId}, upserting with provided timestamp`,
        );

        // Validate config if provided
        const config = await ctx.prisma.scoreConfig.findFirst({
          where: {
            id: input.configId,
            projectId: input.projectId,
          },
        });
        if (!config) {
          throw new LangfuseNotFoundError(
            `No score config with id ${input.configId} in project ${input.projectId}`,
          );
        }

        // Upsert with provided data
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

        const timestamp = input.timestamp;

        await upsertScore({
          id: input.id,
          timestamp: convertDateToClickhouseDateTime(timestamp),
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

        updatedScore = {
          id: input.id,
          projectId: input.projectId,
          environment: input.environment ?? "default",
          traceId: inflatedParams.traceId,
          observationId: inflatedParams.observationId,
          sessionId: inflatedParams.sessionId,
          datasetRunId: null,
          name: input.name,
          dataType: input.dataType ?? null,
          configId: input.configId ?? null,
          metadata: {},
          executionTraceId: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          source: ScoreSource.ANNOTATION,
          value: input.value ?? null,
          stringValue: input.stringValue ?? null,
          comment: input.comment ?? null,
          authorUserId: ctx.session.user.id,
          queueId: input.queueId ?? null,
          timestamp,
        };

        await auditLog({
          session: ctx.session,
          resourceType: "score",
          resourceId: input.id,
          action: "update",
          after: updatedScore,
        });
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
          timestamp: score.timestamp,
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
        logger.error(
          `Annotation score ${input.id} could not be updated in project ${input.projectId}`,
        );
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
   * Estimate score comparison size for UI loading indicators
   * Returns quick estimates without running full analytics query
   */
  estimateScoreComparisonSize: protectedProjectProcedure
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
        objectType: z
          .enum(["all", "trace", "session", "observation", "dataset_run"])
          .default("all"),
        mode: z.enum(["single", "two"]).optional(), // Frontend passes "single" when only score1 selected
      }),
    )
    .query(async ({ input }) => {
      const {
        projectId,
        score1,
        score2,
        fromTimestamp,
        toTimestamp,
        objectType,
      } = input;

      // Build object type filter
      const objectTypeFilter =
        objectType === "all"
          ? ""
          : objectType === "trace"
            ? "AND trace_id IS NOT NULL AND observation_id IS NULL AND session_id IS NULL AND dataset_run_id IS NULL"
            : objectType === "session"
              ? "AND session_id IS NOT NULL"
              : objectType === "observation"
                ? "AND observation_id IS NOT NULL"
                : objectType === "dataset_run"
                  ? "AND dataset_run_id IS NOT NULL"
                  : "";

      // Run preflight estimate (uses 1% sampling)
      const estimates = await estimateScoreMatchCount({
        projectId,
        score1Name: score1.name,
        score1Source: score1.source,
        score1DataType: score1.dataType,
        score2Name: score2.name,
        score2Source: score2.source,
        score2DataType: score2.dataType,
        fromTimestamp,
        toTimestamp,
        objectTypeFilter,
      });

      // Determine if sampling and FINAL will be used
      const willSample =
        estimates.score1Count > SAMPLING_THRESHOLD ||
        estimates.score2Count > SAMPLING_THRESHOLD;

      const willSkipFinal =
        estimates.score1Count >= ADAPTIVE_FINAL_THRESHOLD ||
        estimates.score2Count >= ADAPTIVE_FINAL_THRESHOLD;

      // Estimate query time based on dataset size
      const estimatedQueryTime =
        estimates.estimatedMatchedCount > 1_000_000
          ? "30-60s"
          : estimates.estimatedMatchedCount > 500_000
            ? "15-30s"
            : estimates.estimatedMatchedCount > 100_000
              ? "10-20s"
              : "<10s";

      return {
        score1Count: estimates.score1Count,
        score2Count: estimates.score2Count,
        estimatedMatchedCount: estimates.estimatedMatchedCount,
        willSample,
        willSkipFinal,
        estimatedQueryTime,
        mode: input.mode ?? "two", // Echo back the mode from frontend
      };
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
        mode: z.enum(["single", "two"]).optional(), // Frontend passes "single" when only score1 selected
        fromTimestamp: z.date(),
        toTimestamp: z.date(),
        interval: z
          .object({
            count: z.number().int().positive(),
            unit: z.enum(["second", "minute", "hour", "day", "month", "year"]),
          })
          .refine(
            (val) => {
              // Validate against allowed intervals
              const allowed = [
                // Seconds
                { count: 1, unit: "second" },
                { count: 5, unit: "second" },
                { count: 10, unit: "second" },
                { count: 30, unit: "second" },
                // Minutes
                { count: 1, unit: "minute" },
                { count: 5, unit: "minute" },
                { count: 10, unit: "minute" },
                { count: 30, unit: "minute" },
                // Hours
                { count: 1, unit: "hour" },
                { count: 3, unit: "hour" },
                { count: 6, unit: "hour" },
                { count: 12, unit: "hour" },
                // Days
                { count: 1, unit: "day" },
                { count: 2, unit: "day" },
                { count: 5, unit: "day" },
                { count: 7, unit: "day" },
                { count: 14, unit: "day" },
                // Months
                { count: 1, unit: "month" },
                { count: 3, unit: "month" },
                { count: 6, unit: "month" },
                // Years
                { count: 1, unit: "year" },
              ];
              return allowed.some(
                (a) => a.count === val.count && a.unit === val.unit,
              );
            },
            {
              message:
                "Invalid interval. Must be one of the allowed interval combinations.",
            },
          )
          .default({ count: 1, unit: "day" }),
        nBins: z.number().int().min(5).max(50).default(10),
        objectType: z
          .enum(["all", "trace", "session", "observation", "dataset_run"])
          .default("all"),
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
        objectType,
      } = input;

      // Note: The backend always returns both matched and unmatched datasets,
      // as well as individual-bound distributions. The frontend chooses which
      // to display based on the selected tab.

      // Detect if comparing identical scores (same name, source, and dataType)
      // When true, certain statistical calculations (like Spearman correlation)
      // will be skipped since they're undefined for identical datasets
      const isIdenticalScores =
        score1.name === score2.name &&
        score1.source === score2.source &&
        score1.dataType === score2.dataType;

      /**
       * Normalize interval to single-unit for ClickHouse aggregation.
       *
       * IMPORTANT: ClickHouse's toStartOfInterval with multi-unit intervals (e.g., INTERVAL 2 DAY)
       * aligns to Unix epoch (Jan 1, 1970), which causes unintuitive bucketing. For example,
       * with 7-day intervals, buckets start on Thursdays instead of Mondays.
       *
       * WORKAROUND: We always query ClickHouse with SINGLE-UNIT intervals (1 second, 1 minute,
       * 1 hour, 1 day, 1 month, 1 year) which use calendar-aligned functions. The frontend
       * then aggregates these single-unit buckets into the requested multi-unit buckets,
       * working backwards from toTimestamp to ensure "today's" data appears in the rightmost bucket.
       *
       * This approach ensures consistent, calendar-aligned behavior across all time ranges.
       *
       * See: /web/src/features/scores/lib/clickhouse-time-utils.ts for implementation details
       */

      // Normalize the interval for ClickHouse (always single-unit except 7-day weeks)
      const normalizedInterval = normalizeIntervalForClickHouse(interval);

      // Build object type filter based on selection
      const objectTypeFilter =
        objectType === "all"
          ? ""
          : objectType === "trace"
            ? "AND trace_id IS NOT NULL AND observation_id IS NULL AND session_id IS NULL AND dataset_run_id IS NULL"
            : objectType === "observation"
              ? "AND observation_id IS NOT NULL"
              : objectType === "session"
                ? "AND session_id IS NOT NULL AND observation_id IS NULL AND trace_id IS NULL AND dataset_run_id IS NULL"
                : objectType === "dataset_run"
                  ? "AND dataset_run_id IS NOT NULL"
                  : "";

      // Run preflight query to estimate data size and determine optimization strategy
      const estimates = await estimateScoreMatchCount({
        projectId,
        score1Name: score1.name,
        score1Source: score1.source,
        score1DataType: score1.dataType,
        score2Name: score2.name,
        score2Source: score2.source,
        score2DataType: score2.dataType,
        fromTimestamp,
        toTimestamp,
        objectTypeFilter,
      });

      // Adaptive FINAL logic: Only use FINAL for small datasets to avoid expensive merge
      // For large datasets, skip FINAL to improve performance (scores can be updated, so accuracy matters for recent data)
      const shouldUseFinal =
        estimates.score1Count < ADAPTIVE_FINAL_THRESHOLD &&
        estimates.score2Count < ADAPTIVE_FINAL_THRESHOLD;

      // Hash-based sampling decision: Sample when either score table exceeds threshold
      const shouldSample =
        estimates.score1Count > SAMPLING_THRESHOLD ||
        estimates.score2Count > SAMPLING_THRESHOLD;

      // Calculate rate based on larger table to ensure both tables sample to ~100k rows
      const maxCount = Math.max(estimates.score1Count, estimates.score2Count);
      const samplingRate = shouldSample
        ? Math.min(1.0, TARGET_SAMPLE_SIZE / maxCount)
        : 1.0;
      const samplingPercent = Math.round(samplingRate * 100); // Convert to 0-100 for modulo

      // Sampling expression using cityHash64 on composite key (trace_id, observation_id, session_id, dataset_run_id)
      // This ensures deterministic pseudo-random sampling that preserves matched pairs
      const samplingExpression = shouldSample
        ? `cityHash64(
            coalesce(trace_id, ''),
            coalesce(observation_id, ''),
            coalesce(session_id, ''),
            coalesce(dataset_run_id, '')
          ) % 100 < ${samplingPercent}`
        : null;

      // Determine if this is a single-score or two-score query
      const isSingleScore =
        score1.name === score2.name && score1.source === score2.source;

      // Determine if we're dealing with numeric or categorical/boolean data
      // Cross-type comparisons: treat as categorical if either score is non-numeric
      const isCrossType =
        score1.dataType !== score2.dataType &&
        (score1.dataType !== "NUMERIC" || score2.dataType !== "NUMERIC");

      const isNumeric =
        score1.dataType === "NUMERIC" && score2.dataType === "NUMERIC";
      const isCategoricalComparison =
        !isNumeric && // Any non-numeric comparison
        (score1.dataType === "CATEGORICAL" ||
          score2.dataType === "CATEGORICAL" ||
          isCrossType);

      // Build distribution CTEs conditionally based on data type
      const distribution1CTE = isNumeric
        ? `-- CTE 9: Distribution for score1 (numeric, using global bounds)
          distribution1 AS (
            SELECT
              floor((s.value - b.global_min) /
                    ((b.global_max - b.global_min + 0.0001) / {nBins: UInt8})) as bin_index,
              count() as count
            FROM score1_filtered s
            CROSS JOIN bounds b
            GROUP BY bin_index
          )`
        : `-- CTE 9: Distribution for score1 (categorical/boolean or cross-type)
          distribution1 AS (
            SELECT
              (ROW_NUMBER() OVER (ORDER BY COALESCE(string_value, toString(value))) - 1) as bin_index,
              count() as count
            FROM score1_filtered
            WHERE string_value IS NOT NULL OR value IS NOT NULL
            GROUP BY COALESCE(string_value, toString(value))
            ORDER BY bin_index
          )`;

      const distribution2CTE = isNumeric
        ? `-- CTE 10: Distribution for score2 (numeric, using global bounds)
          distribution2 AS (
            SELECT
              floor((s.value - b.global_min) /
                    ((b.global_max - b.global_min + 0.0001) / {nBins: UInt8})) as bin_index,
              count() as count
            FROM score2_filtered s
            CROSS JOIN bounds b
            GROUP BY bin_index
          )`
        : `-- CTE 10: Distribution for score2 (categorical/boolean or cross-type)
          distribution2 AS (
            SELECT
              (ROW_NUMBER() OVER (ORDER BY COALESCE(string_value, toString(value))) - 1) as bin_index,
              count() as count
            FROM score2_filtered
            WHERE string_value IS NOT NULL OR value IS NOT NULL
            GROUP BY COALESCE(string_value, toString(value))
            ORDER BY bin_index
          )`;

      // Build time series CTE conditionally based on single vs two-score
      const timeseriesCTE = isSingleScore
        ? `-- CTE 8: Time series (single score)
          timeseries AS (
            SELECT
              ${getClickHouseTimeBucketFunction("timestamp", normalizedInterval)} as ts,
              avg(value) as avg1,
              CAST(NULL AS Nullable(Float64)) as avg2,
              count() as count
            FROM score1_filtered
            WHERE value IS NOT NULL
            GROUP BY ts
            ORDER BY ts
          )`
        : `-- CTE 8: Time series (two scores - ALL data, includes unmatched)
          timeseries AS (
            WITH
              score1_time_agg AS (
                SELECT
                  ${getClickHouseTimeBucketFunction("timestamp", normalizedInterval)} as ts,
                  avg(value) as avg1,
                  count() as count1
                FROM score1_filtered
                WHERE value IS NOT NULL
                GROUP BY ts
              ),
              score2_time_agg AS (
                SELECT
                  ${getClickHouseTimeBucketFunction("timestamp", normalizedInterval)} as ts,
                  avg(value) as avg2,
                  count() as count2
                FROM score2_filtered
                WHERE value IS NOT NULL
                GROUP BY ts
              )
            SELECT
              COALESCE(s1.ts, s2.ts) as ts,
              s1.avg1 as avg1,
              s2.avg2 as avg2,
              (COALESCE(s1.count1, 0) + COALESCE(s2.count2, 0)) as count
            FROM score1_time_agg s1
            FULL OUTER JOIN score2_time_agg s2 ON s1.ts = s2.ts
            ORDER BY ts
          )`;

      // Build matched-only CTEs for distributions and single-score time series
      const distribution1MatchedCTE = isNumeric
        ? `-- CTE 11: Distribution for score1 (numeric, matched only)
          distribution1_matched AS (
            SELECT
              floor((m.value1 - b.global_min) /
                    ((b.global_max - b.global_min + 0.0001) / {nBins: UInt8})) as bin_index,
              count() as count
            FROM matched_scores m
            CROSS JOIN bounds b
            GROUP BY bin_index
          )`
        : `-- CTE 11: Distribution for score1 (categorical/boolean or cross-type, matched only)
          distribution1_matched AS (
            SELECT
              (ROW_NUMBER() OVER (ORDER BY COALESCE(string_value1, toString(value1))) - 1) as bin_index,
              count() as count
            FROM matched_scores
            WHERE string_value1 IS NOT NULL OR value1 IS NOT NULL
            GROUP BY COALESCE(string_value1, toString(value1))
            ORDER BY bin_index
          )`;

      const distribution2MatchedCTE = isNumeric
        ? `-- CTE 12: Distribution for score2 (numeric, matched only)
          distribution2_matched AS (
            SELECT
              floor((m.value2 - b.global_min) /
                    ((b.global_max - b.global_min + 0.0001) / {nBins: UInt8})) as bin_index,
              count() as count
            FROM matched_scores m
            CROSS JOIN bounds b
            GROUP BY bin_index
          )`
        : `-- CTE 12: Distribution for score2 (categorical/boolean or cross-type, matched only)
          distribution2_matched AS (
            SELECT
              (ROW_NUMBER() OVER (ORDER BY COALESCE(string_value2, toString(value2))) - 1) as bin_index,
              count() as count
            FROM matched_scores
            WHERE string_value2 IS NOT NULL OR value2 IS NOT NULL
            GROUP BY COALESCE(string_value2, toString(value2))
            ORDER BY bin_index
          )`;

      // Build individual-bound distributions for single-score display
      const distribution1IndividualCTE = isNumeric
        ? `-- CTE 13: Distribution for score1 (numeric, using individual bounds for single-score view)
          distribution1_individual AS (
            SELECT
              floor((s.value - b.min1) /
                    ((b.max1 - b.min1 + 0.0001) / {nBins: UInt8})) as bin_index,
              count() as count
            FROM score1_filtered s
            CROSS JOIN bounds b
            GROUP BY bin_index
          )`
        : `-- CTE 13: Distribution for score1 (categorical/boolean, same as distribution1)
          distribution1_individual AS (
            SELECT bin_index, count
            FROM distribution1
            ORDER BY bin_index
          )`;

      const distribution2IndividualCTE = isNumeric
        ? `-- CTE 14: Distribution for score2 (numeric, using individual bounds for single-score view)
          distribution2_individual AS (
            SELECT
              floor((s.value - b.min2) /
                    ((b.max2 - b.min2 + 0.0001) / {nBins: UInt8})) as bin_index,
              count() as count
            FROM score2_filtered s
            CROSS JOIN bounds b
            GROUP BY bin_index
          )`
        : `-- CTE 14: Distribution for score2 (categorical/boolean, same as distribution2)
          distribution2_individual AS (
            SELECT bin_index, count
            FROM distribution2
            ORDER BY bin_index
          )`;

      // Build matched-only time series for single-score mode
      const timeseriesMatchedCTE = isSingleScore
        ? `-- CTE 15: Time series (single score, matched only)
          timeseries_matched AS (
            SELECT
              ${getClickHouseTimeBucketFunction("timestamp1", normalizedInterval)} as ts,
              avg(value1) as avg1,
              CAST(NULL AS Nullable(Float64)) as avg2,
              count() as count
            FROM matched_scores
            WHERE value1 IS NOT NULL
            GROUP BY ts
            ORDER BY ts
          )`
        : `-- CTE 15: Time series (two scores, matched only - re-query matched_scores)
          timeseries_matched AS (
            SELECT
              ${getClickHouseTimeBucketFunction("timestamp1", normalizedInterval)} as ts,
              avg(value1) as avg1,
              avg(value2) as avg2,
              count() as count
            FROM matched_scores
            GROUP BY ts
            ORDER BY ts
          )`;

      // Build categorical/boolean time series CTEs
      // These show counts per category over time (not averages)
      const timeseriesCategorical1CTE = isSingleScore
        ? `-- CTE 16: Categorical time series for score1 (single score mode)
          timeseries_categorical1 AS (
            SELECT
              ${getClickHouseTimeBucketFunction("timestamp", normalizedInterval)} as ts,
              COALESCE(string_value, toString(value)) as category,
              count() as count
            FROM score1_filtered
            WHERE string_value IS NOT NULL OR value IS NOT NULL
            GROUP BY ts, category
            ORDER BY ts, category
          )`
        : `-- CTE 16: Categorical time series for score1 (two score mode)
          timeseries_categorical1 AS (
            SELECT
              ${getClickHouseTimeBucketFunction("timestamp", normalizedInterval)} as ts,
              COALESCE(string_value, toString(value)) as category,
              count() as count
            FROM score1_filtered
            WHERE string_value IS NOT NULL OR value IS NOT NULL
            GROUP BY ts, category
            ORDER BY ts, category
          )`;

      const timeseriesCategorical2CTE = isSingleScore
        ? `-- CTE 17: Categorical time series for score2 (not needed in single score mode)
          timeseries_categorical2 AS (
            SELECT
              CAST(NULL AS Nullable(DateTime)) as ts,
              CAST(NULL AS Nullable(String)) as category,
              CAST(NULL AS Nullable(UInt64)) as count
            WHERE 1 = 0
          )`
        : `-- CTE 17: Categorical time series for score2 (two score mode)
          timeseries_categorical2 AS (
            SELECT
              ${getClickHouseTimeBucketFunction("timestamp", normalizedInterval)} as ts,
              COALESCE(string_value, toString(value)) as category,
              count() as count
            FROM score2_filtered
            WHERE string_value IS NOT NULL OR value IS NOT NULL
            GROUP BY ts, category
            ORDER BY ts, category
          )`;

      const timeseriesCategorical1MatchedCTE = isSingleScore
        ? `-- CTE 18: Categorical time series for score1 (single score, matched only)
          timeseries_categorical1_matched AS (
            SELECT
              ${getClickHouseTimeBucketFunction("timestamp1", normalizedInterval)} as ts,
              COALESCE(string_value1, toString(value1)) as category,
              count() as count
            FROM matched_scores
            WHERE string_value1 IS NOT NULL OR value1 IS NOT NULL
            GROUP BY ts, category
            ORDER BY ts, category
          )`
        : `-- CTE 18: Categorical time series for score1 (two scores, matched only)
          timeseries_categorical1_matched AS (
            SELECT
              ${getClickHouseTimeBucketFunction("timestamp1", normalizedInterval)} as ts,
              COALESCE(string_value1, toString(value1)) as category,
              count() as count
            FROM matched_scores
            WHERE string_value1 IS NOT NULL OR value1 IS NOT NULL
            GROUP BY ts, category
            ORDER BY ts, category
          )`;

      const timeseriesCategorical2MatchedCTE = isSingleScore
        ? `-- CTE 19: Categorical time series for score2 (not needed in single score mode)
          timeseries_categorical2_matched AS (
            SELECT
              CAST(NULL AS Nullable(DateTime)) as ts,
              CAST(NULL AS Nullable(String)) as category,
              CAST(NULL AS Nullable(UInt64)) as count
            WHERE 1 = 0
          )`
        : `-- CTE 19: Categorical time series for score2 (two scores, matched only)
          timeseries_categorical2_matched AS (
            SELECT
              ${getClickHouseTimeBucketFunction("timestamp1", normalizedInterval)} as ts,
              COALESCE(string_value2, toString(value2)) as category,
              count() as count
            FROM matched_scores
            WHERE string_value2 IS NOT NULL OR value2 IS NOT NULL
            GROUP BY ts, category
            ORDER BY ts, category
          )`;

      // Construct comprehensive UNION ALL query
      const query = `
        WITH
          -- CTE 1: Filter score 1
          -- PREWHERE optimization: Apply most selective filters (project_id, name) early
          -- to reduce data read from disk before applying other filters
          -- Adaptive FINAL: Only use FINAL for small datasets (<100k) to balance accuracy vs performance
          -- Hash-based sampling: Applied when estimated matched count exceeds threshold
          score1_filtered AS (
            SELECT
              id, value, string_value,
              trace_id, observation_id, session_id, dataset_run_id as run_id,
              timestamp
            FROM scores ${shouldUseFinal ? "FINAL" : ""}
            PREWHERE project_id = {projectId: String}
              AND name = {score1Name: String}
            WHERE source = {score1Source: String}
              AND data_type = {dataType1: String}
              AND timestamp >= {fromTimestamp: DateTime64(3)}
              AND timestamp <= {toTimestamp: DateTime64(3)}
              AND is_deleted = 0
              ${objectTypeFilter}
              ${shouldSample ? `AND ${samplingExpression}` : ""}
          ),

          -- CTE 2: Filter score 2
          -- PREWHERE optimization: Apply most selective filters (project_id, name) early
          -- Adaptive FINAL: Only use FINAL for small datasets (<100k)
          -- Hash-based sampling: Applied when estimated matched count exceeds threshold
          -- Special case: When comparing identical scores, reuse score1_filtered to ensure perfect correlation
          score2_filtered AS (
            ${
              isIdenticalScores
                ? `SELECT * FROM score1_filtered`
                : `SELECT
                     id, value, string_value,
                     trace_id, observation_id, session_id, dataset_run_id as run_id,
                     timestamp
                   FROM scores ${shouldUseFinal ? "FINAL" : ""}
                   PREWHERE project_id = {projectId: String}
                     AND name = {score2Name: String}
                   WHERE source = {score2Source: String}
                     AND data_type = {dataType2: String}
                     AND timestamp >= {fromTimestamp: DateTime64(3)}
                     AND timestamp <= {toTimestamp: DateTime64(3)}
                     AND is_deleted = 0
                     ${objectTypeFilter}
                     ${shouldSample ? `AND ${samplingExpression}` : ""}`
            }
          ),

          -- CTE 3: Match scores - must have exact same attachment (trace/obs/session/run)
          -- NULL-safe comparison: convert NULL to empty string for comparison
          -- Special case: For identical scores, use self-join on ID to ensure perfect pairing
          -- Note: No LIMIT needed - sampling already ensures score1_filtered and score2_filtered are ~100k rows max
          matched_scores AS (
            SELECT
              s1.value as value1,
              s1.string_value as string_value1,
              ${isIdenticalScores ? "s1.value" : "s2.value"} as value2,
              ${isIdenticalScores ? "s1.string_value" : "s2.string_value"} as string_value2,
              s1.timestamp as timestamp1,
              ${isIdenticalScores ? "s1.timestamp" : "s2.timestamp"} as timestamp2,
              ${isIdenticalScores ? "s1.trace_id" : "coalesce(s1.trace_id, s2.trace_id)"} as trace_id,
              ${isIdenticalScores ? "s1.observation_id" : "coalesce(s1.observation_id, s2.observation_id)"} as observation_id,
              ${isIdenticalScores ? "s1.session_id" : "coalesce(s1.session_id, s2.session_id)"} as session_id,
              ${isIdenticalScores ? "s1.run_id" : "coalesce(s1.run_id, s2.run_id)"} as run_id
            FROM score1_filtered s1
            INNER JOIN ${isIdenticalScores ? "score1_filtered" : "score2_filtered"} s2
              ON ${
                isIdenticalScores
                  ? "s1.id = s2.id"
                  : `ifNull(s1.trace_id, '') = ifNull(s2.trace_id, '')
              AND ifNull(s1.observation_id, '') = ifNull(s2.observation_id, '')
              AND ifNull(s1.session_id, '') = ifNull(s2.session_id, '')
              AND ifNull(s1.run_id, '') = ifNull(s2.run_id, '')`
              }
            LIMIT 1000000 -- Safety limit to prevent Cartesian product explosions when multiple scores of same name/source exist on one attachment point (trace/observation/session/run)
          ),

          -- CTE 3a: Count all matched score pairs
          -- Counts all rows in matched_scores (not unique attachment points).
          -- NOTE: When multiple scores of same name/source exist on one attachment point,
          -- matched count can exceed both score1Total and score2Total due to Cartesian product.
          -- Example: 2 "gpt4" scores + 3 "gemini" scores on same trace = 6 matched pairs (2 × 3 = 6).
          -- This is correct behavior - each score pair combination is a valid match.
          matched_count AS (
            SELECT count(*) as cnt
            FROM matched_scores
          ),

          -- CTE 4: Bounds (for numeric heatmap and distribution binning)
          -- Calculate global bounds across ALL scores (not just matched) for consistent binning
          bounds AS (
            SELECT
              least(
                (SELECT min(value) FROM score1_filtered),
                (SELECT min(value) FROM score2_filtered)
              ) as global_min,
              greatest(
                (SELECT max(value) FROM score1_filtered),
                (SELECT max(value) FROM score2_filtered)
              ) as global_max,
              -- Keep individual bounds for reference (used in response)
              (SELECT min(value) FROM score1_filtered) as min1,
              (SELECT max(value) FROM score1_filtered) as max1,
              (SELECT min(value) FROM score2_filtered) as min2,
              (SELECT max(value) FROM score2_filtered) as max2
          ),

          -- CTE 5: Heatmap (numeric only, NxN grid using independent bounds per score)
          heatmap AS (
            SELECT
              floor((m.value1 - b.min1) / ((b.max1 - b.min1 + 0.0001) / {nBins: UInt8})) as bin_x,
              floor((m.value2 - b.min2) / ((b.max2 - b.min2 + 0.0001) / {nBins: UInt8})) as bin_y,
              count() as count,
              b.global_min, b.global_max,
              b.min1, b.max1, b.min2, b.max2
            FROM matched_scores m
            CROSS JOIN bounds b
            GROUP BY bin_x, bin_y, b.global_min, b.global_max, b.min1, b.max1, b.min2, b.max2
          ),

          -- CTE 6: Confusion matrix (categorical/boolean and cross-type)
          confusion AS (
            SELECT
              COALESCE(string_value1, toString(value1)) as row_category,
              COALESCE(string_value2, toString(value2)) as col_category,
              count() as count
            FROM matched_scores
            GROUP BY row_category, col_category
          ),

          ${
            isCategoricalComparison
              ? `-- CTE 6a: LEFT JOIN score1 with score2 for stacked distribution
          score1_with_score2 AS (
            SELECT
              -- Use string_value for categorical/boolean, convert value to string for numeric
              COALESCE(s1.string_value, toString(s1.value)) as score1_category,
              COALESCE(s2.string_value, toString(s2.value)) as score2_category
            FROM score1_filtered s1
            LEFT JOIN score2_filtered s2
              ON ifNull(s1.trace_id, '') = ifNull(s2.trace_id, '')
              AND ifNull(s1.observation_id, '') = ifNull(s2.observation_id, '')
              AND ifNull(s1.session_id, '') = ifNull(s2.session_id, '')
              AND ifNull(s1.run_id, '') = ifNull(s2.run_id, '')
            LIMIT 1000000  -- Safety limit for categorical LEFT JOIN (more prone to expansion than INNER JOIN)
          ),

          -- CTE 6b: Stacked distribution (score1 categories with score2 breakdowns)
          stacked_distribution AS (
            SELECT
              score1_category,
              coalesce(score2_category, '__unmatched__') as score2_stack,
              count() as count
            FROM score1_with_score2
            WHERE score1_category IS NOT NULL
            GROUP BY score1_category, score2_stack
            ORDER BY score1_category, score2_stack
          ),

          -- CTE 6c: All score2 categories for legend
          score2_categories AS (
            SELECT DISTINCT COALESCE(string_value, toString(value)) as category
            FROM score2_filtered
            WHERE string_value IS NOT NULL OR value IS NOT NULL
            ORDER BY category
          ),

          -- CTE 6d: Stacked distribution (matched only - no __unmatched__)
          stacked_distribution_matched AS (
            SELECT
              COALESCE(string_value1, toString(value1)) as score1_category,
              COALESCE(string_value2, toString(value2)) as score2_stack,
              count() as count
            FROM matched_scores
            WHERE (string_value1 IS NOT NULL OR value1 IS NOT NULL)
              AND (string_value2 IS NOT NULL OR value2 IS NOT NULL)
            GROUP BY score1_category, score2_stack
            ORDER BY score1_category, score2_stack
          ),`
              : ""
          }

          -- CTE 7: Correlation safety check
          -- Pre-compute whether it's safe to calculate correlations
          -- Requires at least 2 data points and non-zero variance in both samples
          correlation_check AS (
            SELECT
              count() >= 2
                AND stddevPop(value1) > 0
                AND stddevPop(value2) > 0 as is_safe
            FROM matched_scores
          ),

          -- CTE 8: Statistics
          -- IMPORTANT: Calculate mean/std from individual filtered scores, NOT matched_scores
          -- This ensures statistics are available even when matchedCount = 0
          -- Comparison metrics (mae/rmse/correlations) still use matched_scores since they require pairs
          stats AS (
            SELECT
              (SELECT count() FROM matched_scores) as matched_count,
              ${
                isNumeric
                  ? `-- Individual score statistics from filtered tables (not matched pairs)
              (SELECT avg(value) FROM score1_filtered) as mean1,
              (SELECT avg(value) FROM score2_filtered) as mean2,
              (SELECT stddevPop(value) FROM score1_filtered) as std1,
              (SELECT stddevPop(value) FROM score2_filtered) as std2,
              -- Comparison metrics require matched pairs
              (SELECT avg(abs(value1 - value2)) FROM matched_scores) as mae,
              (SELECT sqrt(avg(pow(value1 - value2, 2))) FROM matched_scores) as rmse,
              -- Conditional correlation: only execute subquery if safe
              -- Uses short-circuit evaluation to prevent errors with insufficient data
              ${
                isIdenticalScores
                  ? "NULL"
                  : `if(
                (SELECT is_safe FROM correlation_check),
                (SELECT corr(value1, value2) FROM matched_scores),
                NULL
              )`
              } as pearson_correlation,
              ${
                isIdenticalScores
                  ? "NULL"
                  : `if(
                (SELECT is_safe FROM correlation_check),
                (SELECT rankCorr(value1, value2) FROM matched_scores),
                NULL
              )`
              } as spearman_correlation`
                  : `-- Categorical/boolean scores: statistical metrics are not meaningful
              NULL as mean1,
              NULL as mean2,
              NULL as std1,
              NULL as std2,
              NULL as pearson_correlation,
              NULL as spearman_correlation,
              NULL as mae,
              NULL as rmse`
              }
          ),

          ${timeseriesCTE},

          ${distribution1CTE},

          ${distribution2CTE},

          ${distribution1MatchedCTE},

          ${distribution2MatchedCTE},

          ${distribution1IndividualCTE},

          ${distribution2IndividualCTE},

          ${timeseriesMatchedCTE},

          ${timeseriesCategorical1CTE},

          ${timeseriesCategorical2CTE},

          ${timeseriesCategorical1MatchedCTE},

          ${timeseriesCategorical2MatchedCTE}

        -- Return multiple result sets via UNION ALL
        SELECT
          'counts' as result_type,
          CAST((SELECT count() FROM score1_filtered) AS Float64) as col1,
          CAST((SELECT count() FROM score2_filtered) AS Float64) as col2,
          CAST((SELECT cnt FROM matched_count) AS Float64) as col3,
          CAST(NULL AS Nullable(Float64)) as col4,
          CAST(NULL AS Nullable(Float64)) as col5,
          CAST(NULL AS Nullable(Float64)) as col6,
          CAST(NULL AS Nullable(Float64)) as col7,
          CAST(NULL AS Nullable(Float64)) as col8,
          CAST(NULL AS Nullable(String)) as col9,
          CAST(NULL AS Nullable(String)) as col10,
          CAST(NULL AS Nullable(Float64)) as col11,
          CAST(NULL AS Nullable(Float64)) as col12

        UNION ALL

        SELECT
          'heatmap' as result_type,
          CAST(bin_x AS Float64) as col1,
          CAST(bin_y AS Float64) as col2,
          CAST(count AS Float64) as col3,
          min1 as col4,          -- Individual bounds for score1
          max1 as col5,
          min2 as col6,          -- Individual bounds for score2
          max2 as col7,
          CAST(NULL AS Nullable(Float64)) as col8,
          CAST(NULL AS Nullable(String)) as col9,
          CAST(NULL AS Nullable(String)) as col10,
          global_min as col11,   -- Global bounds for comparison
          global_max as col12
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
          col_category as col10,
          CAST(NULL AS Nullable(Float64)) as col11,
          CAST(NULL AS Nullable(Float64)) as col12
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
          CAST(NULL AS Nullable(String)) as col10,
          CAST(NULL AS Nullable(Float64)) as col11,
          spearman_correlation as col12
        FROM stats

        UNION ALL

        SELECT
          'timeseries' as result_type,
          CAST(toUnixTimestamp(ts) AS Float64) as col1,
          CAST(avg1 AS Nullable(Float64)) as col2,
          CAST(avg2 AS Nullable(Float64)) as col3,
          CAST(count AS Float64) as col4,
          CAST(NULL AS Nullable(Float64)) as col5,
          CAST(NULL AS Nullable(Float64)) as col6,
          CAST(NULL AS Nullable(Float64)) as col7,
          CAST(NULL AS Nullable(Float64)) as col8,
          CAST(NULL AS Nullable(String)) as col9,
          CAST(NULL AS Nullable(String)) as col10,
          CAST(NULL AS Nullable(Float64)) as col11,
          CAST(NULL AS Nullable(Float64)) as col12
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
          CAST(NULL AS Nullable(String)) as col10,
          CAST(NULL AS Nullable(Float64)) as col11,
          CAST(NULL AS Nullable(Float64)) as col12
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
          CAST(NULL AS Nullable(String)) as col10,
          CAST(NULL AS Nullable(Float64)) as col11,
          CAST(NULL AS Nullable(Float64)) as col12
        FROM distribution2

        ${
          isCategoricalComparison
            ? `
        UNION ALL

        SELECT
          'stacked' as result_type,
          CAST(count AS Float64) as col1,
          CAST(NULL AS Nullable(Float64)) as col2,
          CAST(NULL AS Nullable(Float64)) as col3,
          CAST(NULL AS Nullable(Float64)) as col4,
          CAST(NULL AS Nullable(Float64)) as col5,
          CAST(NULL AS Nullable(Float64)) as col6,
          CAST(NULL AS Nullable(Float64)) as col7,
          CAST(NULL AS Nullable(Float64)) as col8,
          score1_category as col9,
          score2_stack as col10,
          CAST(NULL AS Nullable(Float64)) as col11,
          CAST(NULL AS Nullable(Float64)) as col12
        FROM stacked_distribution

        UNION ALL

        SELECT
          'score2_categories' as result_type,
          CAST(NULL AS Nullable(Float64)) as col1,
          CAST(NULL AS Nullable(Float64)) as col2,
          CAST(NULL AS Nullable(Float64)) as col3,
          CAST(NULL AS Nullable(Float64)) as col4,
          CAST(NULL AS Nullable(Float64)) as col5,
          CAST(NULL AS Nullable(Float64)) as col6,
          CAST(NULL AS Nullable(Float64)) as col7,
          CAST(NULL AS Nullable(Float64)) as col8,
          category as col9,
          CAST(NULL AS Nullable(String)) as col10,
          CAST(NULL AS Nullable(Float64)) as col11,
          CAST(NULL AS Nullable(Float64)) as col12
        FROM score2_categories

        UNION ALL

        SELECT
          'stacked_matched' as result_type,
          CAST(count AS Float64) as col1,
          CAST(NULL AS Nullable(Float64)) as col2,
          CAST(NULL AS Nullable(Float64)) as col3,
          CAST(NULL AS Nullable(Float64)) as col4,
          CAST(NULL AS Nullable(Float64)) as col5,
          CAST(NULL AS Nullable(Float64)) as col6,
          CAST(NULL AS Nullable(Float64)) as col7,
          CAST(NULL AS Nullable(Float64)) as col8,
          score1_category as col9,
          score2_stack as col10,
          CAST(NULL AS Nullable(Float64)) as col11,
          CAST(NULL AS Nullable(Float64)) as col12
        FROM stacked_distribution_matched`
            : ""
        }

        UNION ALL

        SELECT
          'distribution1_matched' as result_type,
          CAST(bin_index AS Float64) as col1,
          CAST(count AS Float64) as col2,
          CAST(NULL AS Nullable(Float64)) as col3,
          CAST(NULL AS Nullable(Float64)) as col4,
          CAST(NULL AS Nullable(Float64)) as col5,
          CAST(NULL AS Nullable(Float64)) as col6,
          CAST(NULL AS Nullable(Float64)) as col7,
          CAST(NULL AS Nullable(Float64)) as col8,
          CAST(NULL AS Nullable(String)) as col9,
          CAST(NULL AS Nullable(String)) as col10,
          CAST(NULL AS Nullable(Float64)) as col11,
          CAST(NULL AS Nullable(Float64)) as col12
        FROM distribution1_matched

        UNION ALL

        SELECT
          'distribution2_matched' as result_type,
          CAST(bin_index AS Float64) as col1,
          CAST(count AS Float64) as col2,
          CAST(NULL AS Nullable(Float64)) as col3,
          CAST(NULL AS Nullable(Float64)) as col4,
          CAST(NULL AS Nullable(Float64)) as col5,
          CAST(NULL AS Nullable(Float64)) as col6,
          CAST(NULL AS Nullable(Float64)) as col7,
          CAST(NULL AS Nullable(Float64)) as col8,
          CAST(NULL AS Nullable(String)) as col9,
          CAST(NULL AS Nullable(String)) as col10,
          CAST(NULL AS Nullable(Float64)) as col11,
          CAST(NULL AS Nullable(Float64)) as col12
        FROM distribution2_matched

        UNION ALL

        SELECT
          'distribution1_individual' as result_type,
          CAST(bin_index AS Float64) as col1,
          CAST(count AS Float64) as col2,
          CAST(NULL AS Nullable(Float64)) as col3,
          CAST(NULL AS Nullable(Float64)) as col4,
          CAST(NULL AS Nullable(Float64)) as col5,
          CAST(NULL AS Nullable(Float64)) as col6,
          CAST(NULL AS Nullable(Float64)) as col7,
          CAST(NULL AS Nullable(Float64)) as col8,
          CAST(NULL AS Nullable(String)) as col9,
          CAST(NULL AS Nullable(String)) as col10,
          CAST(NULL AS Nullable(Float64)) as col11,
          CAST(NULL AS Nullable(Float64)) as col12
        FROM distribution1_individual

        UNION ALL

        SELECT
          'distribution2_individual' as result_type,
          CAST(bin_index AS Float64) as col1,
          CAST(count AS Float64) as col2,
          CAST(NULL AS Nullable(Float64)) as col3,
          CAST(NULL AS Nullable(Float64)) as col4,
          CAST(NULL AS Nullable(Float64)) as col5,
          CAST(NULL AS Nullable(Float64)) as col6,
          CAST(NULL AS Nullable(Float64)) as col7,
          CAST(NULL AS Nullable(Float64)) as col8,
          CAST(NULL AS Nullable(String)) as col9,
          CAST(NULL AS Nullable(String)) as col10,
          CAST(NULL AS Nullable(Float64)) as col11,
          CAST(NULL AS Nullable(Float64)) as col12
        FROM distribution2_individual

        UNION ALL

        SELECT
          'timeseries_matched' as result_type,
          CAST(toUnixTimestamp(ts) AS Float64) as col1,
          CAST(avg1 AS Nullable(Float64)) as col2,
          CAST(avg2 AS Nullable(Float64)) as col3,
          CAST(count AS Float64) as col4,
          CAST(NULL AS Nullable(Float64)) as col5,
          CAST(NULL AS Nullable(Float64)) as col6,
          CAST(NULL AS Nullable(Float64)) as col7,
          CAST(NULL AS Nullable(Float64)) as col8,
          CAST(NULL AS Nullable(String)) as col9,
          CAST(NULL AS Nullable(String)) as col10,
          CAST(NULL AS Nullable(Float64)) as col11,
          CAST(NULL AS Nullable(Float64)) as col12
        FROM timeseries_matched

        UNION ALL

        SELECT
          'timeseries_categorical1' as result_type,
          CAST(toUnixTimestamp(ts) AS Nullable(Float64)) as col1,
          CAST(NULL AS Nullable(Float64)) as col2,
          CAST(NULL AS Nullable(Float64)) as col3,
          CAST(count AS Nullable(Float64)) as col4,
          CAST(NULL AS Nullable(Float64)) as col5,
          CAST(NULL AS Nullable(Float64)) as col6,
          CAST(NULL AS Nullable(Float64)) as col7,
          CAST(NULL AS Nullable(Float64)) as col8,
          category as col9,
          CAST(NULL AS Nullable(String)) as col10,
          CAST(NULL AS Nullable(Float64)) as col11,
          CAST(NULL AS Nullable(Float64)) as col12
        FROM timeseries_categorical1

        UNION ALL

        SELECT
          'timeseries_categorical2' as result_type,
          CAST(toUnixTimestamp(ts) AS Nullable(Float64)) as col1,
          CAST(NULL AS Nullable(Float64)) as col2,
          CAST(NULL AS Nullable(Float64)) as col3,
          CAST(count AS Nullable(Float64)) as col4,
          CAST(NULL AS Nullable(Float64)) as col5,
          CAST(NULL AS Nullable(Float64)) as col6,
          CAST(NULL AS Nullable(Float64)) as col7,
          CAST(NULL AS Nullable(Float64)) as col8,
          category as col9,
          CAST(NULL AS Nullable(String)) as col10,
          CAST(NULL AS Nullable(Float64)) as col11,
          CAST(NULL AS Nullable(Float64)) as col12
        FROM timeseries_categorical2

        UNION ALL

        SELECT
          'timeseries_categorical1_matched' as result_type,
          CAST(toUnixTimestamp(ts) AS Nullable(Float64)) as col1,
          CAST(NULL AS Nullable(Float64)) as col2,
          CAST(NULL AS Nullable(Float64)) as col3,
          CAST(count AS Nullable(Float64)) as col4,
          CAST(NULL AS Nullable(Float64)) as col5,
          CAST(NULL AS Nullable(Float64)) as col6,
          CAST(NULL AS Nullable(Float64)) as col7,
          CAST(NULL AS Nullable(Float64)) as col8,
          category as col9,
          CAST(NULL AS Nullable(String)) as col10,
          CAST(NULL AS Nullable(Float64)) as col11,
          CAST(NULL AS Nullable(Float64)) as col12
        FROM timeseries_categorical1_matched

        UNION ALL

        SELECT
          'timeseries_categorical2_matched' as result_type,
          CAST(toUnixTimestamp(ts) AS Nullable(Float64)) as col1,
          CAST(NULL AS Nullable(Float64)) as col2,
          CAST(NULL AS Nullable(Float64)) as col3,
          CAST(count AS Nullable(Float64)) as col4,
          CAST(NULL AS Nullable(Float64)) as col5,
          CAST(NULL AS Nullable(Float64)) as col6,
          CAST(NULL AS Nullable(Float64)) as col7,
          CAST(NULL AS Nullable(Float64)) as col8,
          category as col9,
          CAST(NULL AS Nullable(String)) as col10,
          CAST(NULL AS Nullable(Float64)) as col11,
          CAST(NULL AS Nullable(Float64)) as col12
        FROM timeseries_categorical2_matched
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
        col11: number | null;
        col12: number | null;
      }>({
        query,
        params: {
          projectId,
          score1Name: score1.name,
          score1Source: score1.source,
          score2Name: score2.name,
          score2Source: score2.source,
          dataType1: score1.dataType,
          dataType2: score2.dataType,
          fromTimestamp: convertDateToClickhouseDateTime(fromTimestamp),
          toTimestamp: convertDateToClickhouseDateTime(toTimestamp),
          nBins,
        },
        tags: {
          feature: "scores",
          type: "analytics",
          kind: "comparison",
          projectId,
        },
        clickhouseSettings: {
          // Enable short-circuit evaluation to prevent correlation errors
          // This ensures if() conditions are evaluated before function calls
          short_circuit_function_evaluation: "enable",
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
      const stackedRows = results.filter((r) => r.result_type === "stacked");
      const stackedMatchedRows = results.filter(
        (r) => r.result_type === "stacked_matched",
      );
      const score2CategoriesRows = results.filter(
        (r) => r.result_type === "score2_categories",
      );
      const dist1MatchedRows = results.filter(
        (r) => r.result_type === "distribution1_matched",
      );
      const dist2MatchedRows = results.filter(
        (r) => r.result_type === "distribution2_matched",
      );
      const dist1IndividualRows = results.filter(
        (r) => r.result_type === "distribution1_individual",
      );
      const dist2IndividualRows = results.filter(
        (r) => r.result_type === "distribution2_individual",
      );
      const timeseriesMatchedRows = results.filter(
        (r) => r.result_type === "timeseries_matched",
      );
      const timeseriesCategorical1Rows = results.filter(
        (r) => r.result_type === "timeseries_categorical1",
      );
      const timeseriesCategorical2Rows = results.filter(
        (r) => r.result_type === "timeseries_categorical2",
      );
      const timeseriesCategorical1MatchedRows = results.filter(
        (r) => r.result_type === "timeseries_categorical1_matched",
      );
      const timeseriesCategorical2MatchedRows = results.filter(
        (r) => r.result_type === "timeseries_categorical2_matched",
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
          globalMin: row.col11 ?? 0,
          globalMax: row.col12 ?? 0,
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
              spearmanCorrelation: statsRow.col12 ?? null,
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
        stackedDistribution: stackedRows.map((row) => ({
          score1Category: row.col9 ?? "",
          score2Stack: row.col10 ?? "",
          count: row.col1 ?? 0,
        })),
        stackedDistributionMatched: stackedMatchedRows.map((row) => ({
          score1Category: row.col9 ?? "",
          score2Stack: row.col10 ?? "",
          count: row.col1 ?? 0,
        })),
        score2Categories: score2CategoriesRows
          .map((row) => row.col9 ?? "")
          .filter((c) => c !== ""),
        // Matched-only datasets for toggle
        timeSeriesMatched: timeseriesMatchedRows.map((row) => ({
          timestamp: new Date((row.col1 ?? 0) * 1000),
          avg1: row.col2 ?? null,
          avg2: row.col3 ?? null,
          count: row.col4 ?? 0,
        })),
        distribution1Matched: dist1MatchedRows.map((row) => ({
          binIndex: row.col1 ?? 0,
          count: row.col2 ?? 0,
        })),
        distribution2Matched: dist2MatchedRows.map((row) => ({
          binIndex: row.col1 ?? 0,
          count: row.col2 ?? 0,
        })),
        // Individual-bound distributions for single-score display
        distribution1Individual: dist1IndividualRows.map((row) => ({
          binIndex: row.col1 ?? 0,
          count: row.col2 ?? 0,
        })),
        distribution2Individual: dist2IndividualRows.map((row) => ({
          binIndex: row.col1 ?? 0,
          count: row.col2 ?? 0,
        })),
        // Categorical/boolean time series (counts per category over time)
        timeSeriesCategorical1: timeseriesCategorical1Rows.map((row) => ({
          timestamp: new Date((row.col1 ?? 0) * 1000),
          category: row.col9 ?? "",
          count: row.col4 ?? 0,
        })),
        timeSeriesCategorical2: timeseriesCategorical2Rows.map((row) => ({
          timestamp: new Date((row.col1 ?? 0) * 1000),
          category: row.col9 ?? "",
          count: row.col4 ?? 0,
        })),
        timeSeriesCategorical1Matched: timeseriesCategorical1MatchedRows.map(
          (row) => ({
            timestamp: new Date((row.col1 ?? 0) * 1000),
            category: row.col9 ?? "",
            count: row.col4 ?? 0,
          }),
        ),
        timeSeriesCategorical2Matched: timeseriesCategorical2MatchedRows.map(
          (row) => ({
            timestamp: new Date((row.col1 ?? 0) * 1000),
            category: row.col9 ?? "",
            count: row.col4 ?? 0,
          }),
        ),
        // Sampling metadata for transparency
        samplingMetadata: {
          isSampled: shouldSample,
          samplingMethod: shouldSample ? ("hash" as const) : ("none" as const),
          samplingRate,
          estimatedTotalMatches: estimates.estimatedMatchedCount,
          actualSampleSize: countsRow?.col3 ?? 0,
          samplingExpression,
          // Include preflight estimates for testing and transparency
          preflightEstimates: {
            score1Count: estimates.score1Count,
            score2Count: estimates.score2Count,
            estimatedMatchedCount: estimates.estimatedMatchedCount,
          },
          // Include adaptive FINAL decision for testing and transparency
          adaptiveFinal: {
            usedFinal: shouldUseFinal,
            reason: shouldUseFinal
              ? "Small dataset - using FINAL for accuracy"
              : "Large dataset - skipping FINAL for performance",
          },
        },
        // Metadata about query mode and score comparison
        metadata: {
          mode: input.mode ?? "two", // Echo back the mode from frontend
          isSameScore: isIdenticalScores,
          dataType: score1.dataType,
        },
      };
    }),
});
