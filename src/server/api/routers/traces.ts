import { z } from "zod";

import {
  createTRPCRouter,
  protectedProcedure,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import {
  type Observation,
  Prisma,
  type Score,
  type Trace,
} from "@prisma/client";

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
      const userIdCondition = input.userId
        ? Prisma.sql`AND t."user_id" = ${input.userId}`
        : Prisma.empty;

      const createNamesFilter = (names: string[]) => {
        return Prisma.sql`AND t."name" IN (${Prisma.join(names)})`;
      };

      const nameCondition = input.name
        ? createNamesFilter(input.name)
        : Prisma.empty;

      let scoreCondition = Prisma.empty;
      if (input.scores) {
        switch (input.scores.operator) {
          case "lt":
            scoreCondition = Prisma.sql`AND s.value < ${input.scores.value}`;
            break;
          case "gt":
            scoreCondition = Prisma.sql`AND s.value > ${input.scores.value}`;
            break;
          case "equals":
            scoreCondition = Prisma.sql`AND s.value = ${input.scores.value}`;
            break;
          case "lte":
            scoreCondition = Prisma.sql`AND s.value <= ${input.scores.value}`;
            break;
          case "gte":
            scoreCondition = Prisma.sql`AND s.value >= ${input.scores.value}`;
            break;
        }
      }

      const searchCondition = input.searchQuery
        ? Prisma.sql`AND (
          t."id" ILIKE ${`%${input.searchQuery}%`} OR 
          t."external_id" ILIKE ${`%${input.searchQuery}%`} OR 
          t."user_id" ILIKE ${`%${input.searchQuery}%`} OR 
          t."name" ILIKE ${`%${input.searchQuery}%`}
        )`
        : Prisma.empty;

      const traces = await ctx.prisma.$queryRaw<Trace[]>(
        Prisma.sql`
          SELECT t.*
          FROM "traces" AS t
          WHERE 
            t."project_id" = ${input.projectId}
            ${userIdCondition}
            ${nameCondition}
            ${searchCondition}
            ${scoreCondition}
          ORDER BY t."timestamp" DESC
          LIMIT 50;
        `
      );

      console.log(traces);
      const traceIds = traces.map((trace) => `'${trace.id}'`).join(", ");

      const [scores, observations] = await Promise.all([
        ctx.prisma.$queryRaw<Score[]>(
          Prisma.sql`
          SELECT s.*
          FROM "scores" AS s
          WHERE s."trace_id" IN (${traceIds})`
        ),
        ctx.prisma.$queryRaw<Observation[]>(
          Prisma.sql`
            SELECT o.*
            FROM "observations" AS o
            WHERE o."trace_id" IN (${traceIds})`
        ),
      ]);

      return traces.map((trace) => {
        const filteredScores = scores.filter(
          (score) => score.traceId === trace.id
        );

        const filteredObservations = observations.filter(
          (o) => o.traceId === trace.id
        );

        return {
          ...trace,
          scores: filteredScores,
          usage: {
            promptTokens: filteredObservations.reduce(
              (acc, cur) => acc + cur.promptTokens,
              0
            ),
            completionTokens: filteredObservations.reduce(
              (acc, cur) => acc + cur.completionTokens,
              0
            ),
            totalTokens: filteredObservations.reduce(
              (acc, cur) => acc + cur.totalTokens,
              0
            ),
          },
        };
      });
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
          Project: {
            members: {
              some: {
                userId: ctx.session.user.id,
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
