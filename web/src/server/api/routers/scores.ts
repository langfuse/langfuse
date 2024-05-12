import { z } from "zod";

import {
  createTRPCRouter,
  protectedProcedure,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import { throwIfNoAccess } from "@/src/features/rbac/utils/checkAccess";
import { type ProjectRole, Prisma, type Score } from "@langfuse/shared/src/db";
import { paginationZod } from "@/src/utils/zod";
import { singleFilter } from "@langfuse/shared";
import { tableColumnsToSqlFilterAndPrefix } from "@langfuse/shared";
import {
  type ScoreOptions,
  scoresTableCols,
} from "@/src/server/api/definitions/scoresTable";
import { orderBy } from "@langfuse/shared";
import { orderByToPrismaSql } from "@/src/features/orderBy/server/orderByToPrisma";
import { auditLog } from "@/src/features/audit-logs/auditLog";

const ScoreFilterOptions = z.object({
  projectId: z.string(), // Required for protectedProjectProcedure
  filter: z.array(singleFilter),
  orderBy: orderBy,
});

const ScoreAllOptions = ScoreFilterOptions.extend({
  ...paginationZod,
});

export const scoresRouter = createTRPCRouter({
  all: protectedProjectProcedure
    .input(ScoreAllOptions)
    .query(async ({ input, ctx }) => {
      const filterCondition = tableColumnsToSqlFilterAndPrefix(
        input.filter,
        scoresTableCols,
        "traces_scores",
      );

      const orderByCondition = orderByToPrismaSql(
        input.orderBy,
        scoresTableCols,
      );

      const scores = await ctx.prisma.$queryRaw<
        Array<
          Score & {
            traceName: string | null;
            userId: string | null;
            jobConfigurationId: string | null;
          }
        >
      >(
        generateScoresQuery(
          Prisma.sql` 
          s.id,
          s.name,
          s.value,
          s.timestamp,
          s.comment,
          s.trace_id as "traceId",
          s.observation_id as "observationId",
          t.user_id as "userId",
          t.name as "traceName",
          je.job_configuration_id as "jobConfigurationId"
          `,
          input.projectId,
          filterCondition,
          orderByCondition,
          input.limit,
          input.page,
        ),
      );

      const scoresCount = await ctx.prisma.$queryRaw<
        Array<{ totalCount: bigint }>
      >(
        generateScoresQuery(
          Prisma.sql` count(*) AS "totalCount"`,
          input.projectId,
          filterCondition,
          Prisma.empty,
          1, // limit
          0, // page
        ),
      );

      return {
        scores,
        totalCount:
          scoresCount.length > 0 ? Number(scoresCount[0]?.totalCount) : 0,
      };
    }),
  filterOptions: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
      }),
    )
    .query(async ({ input, ctx }) => {
      const names = await ctx.prisma.score.groupBy({
        where: {
          trace: {
            projectId: input.projectId,
          },
        },
        by: ["name"],
        _count: {
          _all: true,
        },
      });

      const res: ScoreOptions = {
        name: names.map((i) => ({ value: i.name, count: i._count._all })),
      };

      return res;
    }),
  byId: protectedProcedure.input(z.string()).query(({ input, ctx }) =>
    ctx.prisma.score.findFirstOrThrow({
      where: {
        id: input,
        ...(ctx.session.user.admin === true
          ? undefined
          : {
              trace: {
                project: {
                  projectMembers: {
                    some: {
                      userId: ctx.session.user.id,
                    },
                  },
                },
              },
            }),
      },
    }),
  ),
  createReviewScore: protectedProcedure
    .input(
      z.object({
        traceId: z.string(),
        value: z.number(),
        name: z.string(),
        comment: z.string().optional(),
        observationId: z.string().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const trace = await ctx.prisma.trace.findFirstOrThrow({
        where: {
          id: input.traceId,
          project: {
            projectMembers: {
              some: {
                userId: ctx.session.user.id,
              },
            },
          },
        },
      });
      throwIfNoAccess({
        session: ctx.session,
        projectId: trace.projectId,
        scope: "scores:CUD",
      });

      const score = await ctx.prisma.score.create({
        data: {
          trace: {
            connect: {
              id: trace.id,
            },
          },
          ...(input.observationId
            ? {
                observation: {
                  connect: {
                    id: input.observationId,
                  },
                },
              }
            : undefined),
          value: input.value,
          name: input.name,
          comment: input.comment,
          projectId: trace.projectId,
          source: "REVIEW",
        },
      });
      await auditLog({
        projectId: trace.projectId,
        userId: ctx.session.user.id,
        userProjectRole: ctx.session.user.projects.find(
          (p) => p.id === trace.projectId,
        )?.role as ProjectRole, // throwIfNoAccess ensures this is defined
        resourceType: "score",
        resourceId: score.id,
        action: "create",
        after: score,
      });
      return score;
    }),
  updateReviewScore: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        value: z.number(),
        comment: z.string().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const score = await ctx.prisma.score.findFirstOrThrow({
        where: {
          id: input.id,
          source: "REVIEW",
          trace: {
            project: {
              projectMembers: {
                some: {
                  userId: ctx.session.user.id,
                },
              },
            },
          },
        },
        include: {
          trace: {
            select: {
              projectId: true,
            },
          },
        },
      });
      throwIfNoAccess({
        session: ctx.session,
        projectId: score.trace.projectId,
        scope: "scores:CUD",
      });

      // exclude trace object from audit log
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { trace, ...pureScore } = score;
      await auditLog({
        projectId: trace.projectId,
        userId: ctx.session.user.id,
        userProjectRole: ctx.session.user.projects.find(
          (p) => p.id === trace.projectId,
        )?.role as ProjectRole, // throwIfNoAccess ensures this is defined
        resourceType: "score",
        resourceId: score.id,
        action: "update",
        after: pureScore,
      });

      return ctx.prisma.score.update({
        where: {
          id: score.id,
        },
        data: {
          value: input.value,
          comment: input.comment,
        },
      });
    }),
  deleteReviewScore: protectedProcedure
    .input(z.string())
    .mutation(async ({ input, ctx }) => {
      const score = await ctx.prisma.score.findFirstOrThrow({
        where: {
          id: input,
          source: "REVIEW",
          trace: {
            project: {
              projectMembers: {
                some: {
                  userId: ctx.session.user.id,
                },
              },
            },
          },
        },
        include: {
          trace: {
            select: {
              projectId: true,
            },
          },
        },
      });
      throwIfNoAccess({
        session: ctx.session,
        projectId: score.trace.projectId,
        scope: "scores:CUD",
      });
      const { trace, ...pureScore } = score;
      await auditLog({
        projectId: trace.projectId,
        userId: ctx.session.user.id,
        userProjectRole: ctx.session.user.projects.find(
          (p) => p.id === trace.projectId,
        )?.role as ProjectRole, // throwIfNoAccess ensures this is defined
        resourceType: "score",
        resourceId: score.id,
        action: "delete",
        before: pureScore,
      });

      return ctx.prisma.score.delete({
        where: {
          id: score.id,
        },
      });
    }),
});

const generateScoresQuery = (
  select: Prisma.Sql,
  projectId: string,
  filterCondition: Prisma.Sql,
  orderCondition: Prisma.Sql,
  limit: number,
  page: number,
) => {
  return Prisma.sql`
  SELECT
   ${select}
  FROM scores s
  JOIN traces t ON t.id = s.trace_id LEFT JOIN job_executions je ON je.job_output_score_id = s.id AND je.project_id = ${projectId}
  WHERE t.project_id = ${projectId}
  ${filterCondition}
  ${orderCondition}
  LIMIT ${limit}
  OFFSET ${page * limit}
`;
};
