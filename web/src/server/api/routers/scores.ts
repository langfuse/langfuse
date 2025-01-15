import { z } from "zod";

import { throwIfNoProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import {
  type ScoreOptions,
  scoresTableCols,
} from "@/src/server/api/definitions/scoresTable";
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
  CreateAnnotationScoreData,
  orderBy,
  paginationZod,
  singleFilter,
  timeFilter,
  UpdateAnnotationScoreData,
  validateDbScore,
  ScoreSource,
  LangfuseNotFoundError,
  InvalidRequestError,
  InternalServerError,
} from "@langfuse/shared";
import { Prisma, type Score } from "@langfuse/shared/src/db";
import {
  datetimeFilterToPrisma,
  datetimeFilterToPrismaSql,
  getScoresGroupedByNameSourceType,
  getScoresUiCount,
  getScoresUiTable,
  orderByToPrismaSql,
  tableColumnsToSqlFilterAndPrefix,
  getScoreNames,
  getTracesGroupedByTags,
  deleteScore,
  upsertScore,
  logger,
  getTraceById,
  getScoreById,
  convertDateToClickhouseDateTime,
  searchExistingAnnotationScore,
} from "@langfuse/shared/src/server";
import { measureAndReturnApi } from "@/src/server/utils/checkClickhouseAccess";
import { env } from "@/src/env.mjs";
import { v4 } from "uuid";

const ScoreFilterOptions = z.object({
  projectId: z.string(), // Required for protectedProjectProcedure
  filter: z.array(singleFilter),
  orderBy: orderBy,
});

const ScoreAllOptions = ScoreFilterOptions.extend({
  ...paginationZod,
});
type AllScoresReturnType = Score & {
  traceName: string | null;
  traceUserId: string | null;
  traceTags: Array<string> | null;
  jobConfigurationId: string | null;
  authorUserImage: string | null;
  authorUserName: string | null;
};

export const scoresRouter = createTRPCRouter({
  all: protectedProjectProcedure
    .input(
      ScoreAllOptions.extend({ queryClickhouse: z.boolean().default(false) }),
    )
    .query(async ({ input, ctx }) => {
      return await measureAndReturnApi({
        input,
        operation: "scores.all",
        user: ctx.session.user,
        pgExecution: async () => {
          const { filterCondition, orderByCondition } =
            parseScoresGetAllOptions(input);

          const scores = await ctx.prisma.$queryRaw<Array<AllScoresReturnType>>(
            generateScoresQuery(
              Prisma.sql` 
          s.id,
          s.name,
          s.value,
          s.string_value AS "stringValue",
          s.timestamp,
          s.source,
          s.data_type AS "dataType",
          s.comment,
          s.trace_id AS "traceId",
          s.observation_id AS "observationId",
          s.author_user_id AS "authorUserId",
          t.user_id AS "traceUserId",
          t.name AS "traceName",
          t.tags AS "traceTags",
          je.job_configuration_id AS "jobConfigurationId",
          u.image AS "authorUserImage", 
          u.name AS "authorUserName"
          `,
              input.projectId,
              ctx.session.orgId,
              filterCondition,
              orderByCondition,
              input.limit,
              input.page,
            ),
          );

          return {
            scores,
          };
        },
        clickhouseExecution: async () => {
          const clickhouseScoreData = await getScoresUiTable({
            projectId: input.projectId,
            filter: input.filter ?? [],
            orderBy: input.orderBy,
            limit: input.limit,
            offset: input.page * input.limit,
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
        },
      });
    }),
  countAll: protectedProjectProcedure
    .input(
      ScoreAllOptions.extend({ queryClickhouse: z.boolean().default(false) }),
    )
    .query(async ({ input, ctx }) => {
      return await measureAndReturnApi({
        input,
        operation: "scores.countAll",
        user: ctx.session.user,
        pgExecution: async () => {
          const { filterCondition } = parseScoresGetAllOptions(input);

          const scoresCount = await ctx.prisma.$queryRaw<
            Array<{ totalCount: bigint }>
          >(
            generateScoresQuery(
              Prisma.sql` count(*) AS "totalCount"`,
              input.projectId,
              ctx.session.orgId,
              filterCondition,
              Prisma.empty,
              1, // limit
              0, // page
            ),
          );

          return {
            totalCount:
              scoresCount.length > 0 ? Number(scoresCount[0]?.totalCount) : 0,
          };
        },
        clickhouseExecution: async () => {
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
        },
      });
    }),
  filterOptions: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        timestampFilter: timeFilter.optional(),
        queryClickhouse: z.boolean().default(false),
      }),
    )
    .query(async ({ input, ctx }) => {
      const { timestampFilter } = input;
      return await measureAndReturnApi({
        input,
        operation: "scores.filterOptions",
        user: ctx.session.user,
        pgExecution: async () => {
          const prismaTimestampFilter = timestampFilter
            ? datetimeFilterToPrisma(timestampFilter)
            : {};

          const rawTimestampFilter =
            timestampFilter && timestampFilter.type === "datetime"
              ? datetimeFilterToPrismaSql(
                  "timestamp",
                  timestampFilter.operator,
                  timestampFilter.value,
                )
              : Prisma.empty;
          const [names, tags] = await Promise.all([
            ctx.prisma.score.groupBy({
              where: {
                projectId: input.projectId,
                timestamp: prismaTimestampFilter,
              },
              by: ["name"],
              _count: {
                _all: true,
              },
              take: 1000,
              orderBy: {
                _count: {
                  id: "desc",
                },
              },
            }),
            ctx.prisma.$queryRaw<{ value: string }[]>`
        SELECT tags.tag as value
        FROM traces, UNNEST(traces.tags) AS tags(tag)
        WHERE traces.project_id = ${input.projectId} ${rawTimestampFilter}
        GROUP BY tags.tag
        ORDER BY tags.tag ASC
        LIMIT 1000
      `,
          ]);

          const res: ScoreOptions = {
            name: names.map((i) => ({ value: i.name, count: i._count._all })),
            tags: tags,
          };

          return res;
        },
        clickhouseExecution: async () => {
          const [names, tags] = await Promise.all([
            getScoreNames(
              input.projectId,
              timestampFilter ? [timestampFilter] : [],
            ),
            getTracesGroupedByTags({
              projectId: input.projectId,
              filter: timestampFilter ? [timestampFilter] : [],
            }),
          ]);

          const res: ScoreOptions = {
            name: names.map((i) => ({ value: i.name, count: i.count })),
            tags: tags,
          };
          return res;
        },
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

      const score = {
        id: v4(),
        projectId: input.projectId,
        traceId: input.traceId,
        observationId: input.observationId ?? null,
        value: input.value ?? null,
        stringValue: input.stringValue ?? null,
        dataType: input.dataType ?? null,
        configId: input.configId ?? null,
        name: input.name,
        comment: input.comment ?? null,
        authorUserId: ctx.session.user.id,
        source: ScoreSource.ANNOTATION,
        queueId: input.queueId ?? null,
        createdAt: new Date(),
        updatedAt: new Date(),
        timestamp: new Date(),
      };

      const hasClickhouseConfigured = env.CLICKHOUSE_URL;

      if (hasClickhouseConfigured) {
        const clickhouseTrace = await getTraceById(
          input.traceId,
          input.projectId,
        );

        if (!clickhouseTrace) {
          logger.error(
            `No trace with id ${input.traceId} in project ${input.projectId} in Clickhouse`,
          );
          throw new LangfuseNotFoundError(
            `No trace with id ${input.traceId} in project ${input.projectId} in Clickhouse`,
          );
        }

        const clickhouseScore = await searchExistingAnnotationScore(
          input.projectId,
          input.traceId,
          input.observationId ?? null,
          input.name,
          input.configId,
        );

        if (clickhouseScore) {
          logger.error(
            `Score for name ${input.name} already exists for trace ${input.traceId} in project ${input.projectId}`,
          );
          throw new InvalidRequestError(
            `Score for name ${input.name} already exists for trace ${input.traceId} in project ${input.projectId}`,
          );
        }

        await upsertScore({
          id: score.id, // Reuse ID that was generated by Prisma
          timestamp: convertDateToClickhouseDateTime(new Date()),
          project_id: input.projectId,
          trace_id: input.traceId,
          observation_id: input.observationId,
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
      }

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

      let updatedScore: Score | null | undefined = null;

      // Fetch the current score from Clickhouse
      const score = await getScoreById(
        input.projectId,
        input.id,
        ScoreSource.ANNOTATION,
      );
      if (!score) {
        logger.warn(
          `No annotation score with id ${input.id} in project ${input.projectId} in Clickhouse`,
        );
        throw new LangfuseNotFoundError(
          `No annotation score with id ${input.id} in project ${input.projectId} in Clickhouse`,
        );
      } else {
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
        });

        updatedScore = {
          ...score,
          value: input.value ?? null,
          stringValue: input.stringValue ?? null,
          comment: input.comment ?? null,
          authorUserId: ctx.session.user.id,
          queueId: input.queueId ?? null,
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

      let score: Score | null | undefined = null;

      // Fetch the current score from Clickhouse
      const clickhouseScore = await getScoreById(
        input.projectId,
        input.id,
        ScoreSource.ANNOTATION,
      );
      if (!clickhouseScore) {
        logger.warn(
          `No annotation score with id ${input.id} in project ${input.projectId} in Clickhouse`,
        );
        throw new LangfuseNotFoundError(
          `No annotation score with id ${input.id} in project ${input.projectId} in Clickhouse`,
        );
      } else {
        await auditLog({
          session: ctx.session,
          resourceType: "score",
          resourceId: input.id,
          action: "delete",
          before: clickhouseScore,
        });

        // Delete the score from Clickhouse
        await deleteScore(input.projectId, clickhouseScore.id);
        score = clickhouseScore;
      }

      if (!score) {
        throw new InternalServerError(
          `Annotation score could not be deleted in project ${input.projectId}`,
        );
      }

      return validateDbScore(score);
    }),
  getScoreKeysAndProps: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        selectedTimeOption: SelectedTimeOptionSchema,
        queryClickhouse: z.boolean().default(false),
      }),
    )
    .query(async ({ input, ctx }) => {
      const date = getDateFromOption(input.selectedTimeOption);

      return await measureAndReturnApi({
        input,
        operation: "scores.getScoreKeysAndProps",
        user: ctx.session.user,
        pgExecution: async () => {
          const scores = await ctx.prisma.score.groupBy({
            where: {
              projectId: input.projectId,
              ...(date ? { timestamp: { gte: date } } : {}),
            },
            take: 1000,
            orderBy: {
              _count: {
                id: "desc",
              },
            },
            by: ["name", "source", "dataType"],
          });

          if (scores.length === 0) return [];
          return scores.map(({ name, source, dataType }) => ({
            key: composeAggregateScoreKey({ name, source, dataType }),
            name: name,
            source: source,
            dataType: dataType,
          }));
        },
        clickhouseExecution: async () => {
          const res = await getScoresGroupedByNameSourceType(input.projectId);

          return res.map(({ name, source, dataType }) => ({
            key: composeAggregateScoreKey({ name, source, dataType }),
            name: name,
            source: source,
            dataType: dataType,
          }));
        },
      });
    }),
});

const parseScoresGetAllOptions = (input: z.infer<typeof ScoreAllOptions>) => {
  const filterCondition = tableColumnsToSqlFilterAndPrefix(
    input.filter,
    scoresTableCols,
    "traces_scores",
  );

  const orderByCondition = orderByToPrismaSql(input.orderBy, scoresTableCols);
  return { filterCondition, orderByCondition };
};

const generateScoresQuery = (
  select: Prisma.Sql,
  projectId: string,
  orgId: string,
  filterCondition: Prisma.Sql,
  orderCondition: Prisma.Sql,
  limit: number,
  page: number,
) => {
  return Prisma.sql`
  SELECT
   ${select}
  FROM scores s
  LEFT JOIN traces t ON t.id = s.trace_id AND t.project_id = ${projectId}
  LEFT JOIN job_executions je ON je.job_output_score_id = s.id AND je.project_id = ${projectId}
  LEFT JOIN users u ON u.id = s.author_user_id AND u.id in (SELECT user_id FROM organization_memberships WHERE org_id = ${orgId})
  WHERE s.project_id = ${projectId}
  ${filterCondition}
  ${orderCondition}
  LIMIT ${limit}
  OFFSET ${page * limit}
`;
};
