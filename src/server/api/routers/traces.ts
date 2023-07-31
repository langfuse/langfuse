import { z } from "zod";

import {
  createTRPCRouter,
  protectedProcedure,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";

const ScoreFilter = z.object({
  name: z.string(),
  operator: z.enum(["lt", "gt", "equals", "lte", "gte"]),
  value: z.number(),
});

type ScoreFilter = z.infer<typeof ScoreFilter>;

const TraceFilterOptions = z.object({
  projectId: z.string(), // Required for protectedProjectProcedure
  userId: z.string().nullable(),
  name: z.array(z.string()).nullable(),
  scores: ScoreFilter.nullable(),
  searchQuery: z.string().nullable(),
});

export const traceRouter = createTRPCRouter({
  all: protectedProjectProcedure
    .input(TraceFilterOptions)
    .query(async ({ input, ctx }) => {
      const traces = await ctx.prisma.trace.findMany({
        where: {
          AND: [
            {
              projectId: input.projectId,
              ...(input.userId ? { userId: input.userId } : undefined),
              ...(input.name ? { name: { in: input.name } } : undefined),
              ...(input.scores
                ? { scores: { some: createScoreCondition(input.scores) } }
                : undefined),
            },
            input.searchQuery
              ? {
                  OR: [
                    { id: { contains: input.searchQuery } },
                    { externalId: { contains: input.searchQuery } },
                    { userId: { contains: input.searchQuery } },
                    { name: { contains: input.searchQuery } },
                  ],
                }
              : {},
          ],
        },
        orderBy: {
          timestamp: "desc",
        },
        include: {
          scores: true,
          observations: {
            select: {
              promptTokens: true,
              completionTokens: true,
              totalTokens: true,
            },
          },
        },
        take: 50, // TODO: pagination
      });

      const res = traces.map((trace) => {
        const { observations, ...t } = trace;
        return {
          ...t,
          usage: {
            promptTokens: observations.reduce(
              (acc, cur) => acc + cur.promptTokens,
              0
            ),
            completionTokens: observations.reduce(
              (acc, cur) => acc + cur.completionTokens,
              0
            ),
            totalTokens: observations.reduce(
              (acc, cur) => acc + cur.totalTokens,
              0
            ),
          },
        };
      });

      return res;
    }),
  availableFilterOptions: protectedProjectProcedure
    .input(TraceFilterOptions)
    .query(async ({ input, ctx }) => {
      const filter = {
        AND: [
          {
            projectId: input.projectId,
            ...(input.userId ? { userId: input.userId } : undefined),
            ...(input.name ? { name: { in: input.name } } : undefined),
            ...(input.scores
              ? { scores: { some: createScoreCondition(input.scores) } }
              : undefined),
          },
          input.searchQuery
            ? {
                OR: [
                  { id: { contains: input.searchQuery } },
                  { externalId: { contains: input.searchQuery } },
                  { userId: { contains: input.searchQuery } },
                  { name: { contains: input.searchQuery } },
                ],
              }
            : {},
        ],
      };

      const [scores, names] = await Promise.all([
        ctx.prisma.score.groupBy({
          where: {
            trace: filter,
          },
          by: ["name", "traceId"],
          _count: {
            _all: true,
          },
        }),
        ctx.prisma.trace.groupBy({
          where: filter,
          by: ["name"],
          _count: {
            _all: true,
          },
        }),
      ]);

      let groupedCounts: Map<string, number> = new Map();

      for (const item of scores) {
        const current = groupedCounts.get(item.name);
        groupedCounts = groupedCounts.set(item.name, current ? current + 1 : 1);
      }

      const scoresArray: { key: string; value: number }[] = [];
      for (const [key, value] of groupedCounts) {
        scoresArray.push({ key, value });
      }

      return [
        {
          key: "name",
          occurrences: names.map((i) => {
            return { key: i.name ?? "undefined", count: i._count };
          }),
        },
        {
          key: "scores",
          occurrences: scoresArray.map((i) => {
            return { key: i.key, count: { _all: i.value } };
          }),
        },
      ];
    }),

  byId: protectedProcedure.input(z.string()).query(async ({ input, ctx }) => {
    const [trace, observations] = await Promise.all([
      ctx.prisma.trace.findFirstOrThrow({
        where: {
          id: input,
          project: {
            members: {
              some: {
                userId: ctx.session.user.id,
              },
            },
          },
        },
        include: {
          scores: true,
        },
      }),
      ctx.prisma.observation.findMany({
        where: {
          traceId: input,
          trace: {
            project: {
              members: {
                some: {
                  userId: ctx.session.user.id,
                },
              },
            },
          },
        },
      }),
    ]);

    return {
      ...trace,
      observations,
    };
  }),
});

function createScoreCondition(score: ScoreFilter) {
  let filter = {};
  switch (score.operator) {
    case "lt":
      filter = { lt: score.value };
      break;
    case "gt":
      filter = { gt: score.value };
      break;
    case "equals":
      filter = { equals: score.value };
      break;
    case "lte":
      filter = { lte: score.value };
      break;
    case "gte":
      filter = { gte: score.value };
      break;
  }

  return {
    name: score.name,
    value: filter,
  };
}
