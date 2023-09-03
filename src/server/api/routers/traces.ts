import { z } from "zod";

import {
  createTRPCRouter,
  protectedProcedure,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import { Prisma, type Score, type Trace } from "@prisma/client";
import { calculateTokenCost } from "@/src/features/ingest/lib/usage";
import Decimal from "decimal.js";

const ScoreFilter = z.object({
  name: z.string(),
  operator: z.enum(["lt", "gt", "equals", "lte", "gte"]),
  value: z.number(),
});

type ScoreFilter = z.infer<typeof ScoreFilter>;

const TraceFilterOptions = z.object({
  projectId: z.string(), // Required for protectedProjectProcedure
  userId: z.array(z.string()).nullable(),
  name: z.array(z.string()).nullable(),
  scores: ScoreFilter.nullable(),
  searchQuery: z.string().nullable(),
  metadata: z
    .array(z.object({ key: z.string(), value: z.string() }))
    .nullable(),
});

export const traceRouter = createTRPCRouter({
  all: protectedProjectProcedure
    .input(TraceFilterOptions)
    .query(async ({ input, ctx }) => {
      const metadataCondition = input.metadata
        ? input.metadata.map(
            (m) => Prisma.sql`AND t."metadata"->>${m.key} = ${m.value}`
          )
        : undefined;

      const joinedMetadataCondition =
        metadataCondition && metadataCondition.length > 0
          ? Prisma.join(metadataCondition, " ")
          : Prisma.empty;

      const userIdCondition =
        input.userId !== null && input.userId.length
          ? Prisma.sql`AND t."user_id" IN (${Prisma.join(input.userId)})`
          : Prisma.empty;

      const nameCondition =
        input.name !== null && input.name.length
          ? Prisma.sql`AND t."name" IN (${Prisma.join(input.name)})`
          : Prisma.empty;

      let scoreCondition = Prisma.empty;
      if (input.scores) {
        switch (input.scores.operator) {
          case "lt":
            scoreCondition = Prisma.sql`AND "trace_id" in (SELECT distinct trace_id from scores WHERE trace_id IS NOT NULL AND scores.value < ${input.scores.value})`;
            break;
          case "gt":
            scoreCondition = Prisma.sql`AND "trace_id" in (SELECT distinct trace_id from scores WHERE trace_id IS NOT NULL AND scores.value > ${input.scores.value})`;
            break;
          case "equals":
            scoreCondition = Prisma.sql`AND "trace_id" in (SELECT distinct trace_id from scores WHERE trace_id IS NOT NULL AND scores.value = ${input.scores.value})`;
            break;
          case "lte":
            scoreCondition = Prisma.sql`AND "trace_id" in (SELECT distinct trace_id from scores WHERE trace_id IS NOT NULL AND scores.value <= ${input.scores.value})`;
            break;
          case "gte":
            scoreCondition = Prisma.sql`AND "trace_id" in (SELECT distinct trace_id from scores WHERE trace_id IS NOT NULL AND scores.value >= ${input.scores.value})`;
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

      const traces = await ctx.prisma.$queryRaw<
        Array<
          Trace & {
            promptTokens: number;
            completionTokens: number;
            totalTokens: number;
          }
        >
      >(Prisma.sql`
      WITH usage as (
        SELECT 
          trace_id,
          sum(prompt_tokens) AS "promptTokens",
          sum(completion_tokens) AS "completionTokens",
          sum(total_tokens) AS "totalTokens"
        FROM "observations"
        WHERE "trace_id" IS NOT NULL AND "project_id" = ${input.projectId}
        GROUP BY trace_id
      )
      SELECT
        t.*,
        t."external_id" AS "externalId",
        t."user_id" AS "userId",
        t."metadata" AS "metadata",
        COALESCE(u."promptTokens", 0)::int AS "promptTokens",
        COALESCE(u."completionTokens", 0)::int AS "completionTokens",
        COALESCE(u."totalTokens", 0)::int AS "totalTokens"
      FROM "traces" AS t
      LEFT JOIN usage AS u ON u.trace_id = t.id
      WHERE 
        t."project_id" = ${input.projectId}
        ${userIdCondition}
        ${nameCondition}
        ${searchCondition}
        ${scoreCondition}
        ${joinedMetadataCondition}
      ORDER BY t."timestamp" DESC
      LIMIT 50;
    `);

      const scores = traces.length
        ? await ctx.prisma.$queryRaw<Score[]>(
            Prisma.sql`
          SELECT
            s.*,
            s."trace_id" AS "traceId",
            s."observation_id" AS "observationId"
          FROM "scores" s
          WHERE s."trace_id" IN (${Prisma.join(
            traces.map((trace) => trace.id)
          )})`
          )
        : [];

      return traces.map((trace) => ({
        ...trace,
        scores: scores.filter((score) => score.traceId === trace.id),
      }));
    }),
  availableFilterOptions: protectedProjectProcedure
    .input(TraceFilterOptions)
    .query(async ({ input, ctx }) => {
      const metadataConditions = input.metadata
        ? input.metadata.map((m) => ({
            metadata: { path: [m.key], equals: m.value },
          }))
        : undefined;

      const filter = {
        AND: [
          {
            projectId: input.projectId,
            ...(input.name ? { name: { in: input.name } } : undefined),
            ...(input.userId ? { userId: { in: input.userId } } : undefined),
            ...(input.scores
              ? { scores: { some: createScoreCondition(input.scores) } }
              : undefined),
          },
          ...(metadataConditions ? metadataConditions : []),
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

      const [scores, names, userIds] = await Promise.all([
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
        ctx.prisma.trace.groupBy({
          where: filter,
          by: ["userId"],
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
          key: "userId",
          occurrences: userIds.map((i) => {
            return { key: i.userId ?? "undefined", count: i._count };
          }),
        },
        {
          key: "scores",
          occurrences: scoresArray.map((i) => {
            return { key: i.key, count: { _all: i.value } };
          }),
        },
        {
          key: "metadata",
          occurrences: [],
        },
      ];
    }),

  byId: protectedProcedure.input(z.string()).query(async ({ input, ctx }) => {
    const [trace, observations, pricings] = await Promise.all([
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
          traceId: {
            equals: input,
            not: null,
          },
          Project: {
            members: {
              some: {
                userId: ctx.session.user.id,
              },
            },
          },
        },
      }),
      ctx.prisma.pricing.findMany(),
    ]);

    const enrichedObservations = observations.map((observation) => {
      return {
        ...observation,
        price: observation.model
          ? calculateTokenCost(pricings, {
              model: observation.model,
              totalTokens: new Decimal(observation.totalTokens),
              promptTokens: new Decimal(observation.promptTokens),
              completionTokens: new Decimal(observation.completionTokens),
            })
          : undefined,
      };
    });

    return {
      ...trace,
      observations: enrichedObservations as Array<
        (typeof observations)[0] & { traceId: string } & { price?: Decimal }
      >,
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
