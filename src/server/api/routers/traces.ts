import { z } from "zod";

import {
  createTRPCRouter,
  protectedProcedure,
  protectedProjectProcedure,
  publicProcedure,
} from "@/src/server/api/trpc";
import { Prisma, type Score, type Trace } from "@prisma/client";
import { calculateTokenCost } from "@/src/features/ingest/lib/usage";
import Decimal from "decimal.js";
import { paginationZod } from "@/src/utils/zod";
import { singleFilter } from "@/src/server/api/interfaces/filters";
import {
  type TraceOptions,
  tracesTableCols,
} from "@/src/server/api/definitions/tracesTable";
import { filterToPrismaSql } from "@/src/features/filters/server/filterToPrisma";

const TraceFilterOptions = z.object({
  projectId: z.string(), // Required for protectedProjectProcedure
  searchQuery: z.string().nullable(),
  filter: z.array(singleFilter).nullable(),
  ...paginationZod,
});

export const traceRouter = createTRPCRouter({
  all: protectedProjectProcedure
    .input(TraceFilterOptions)
    .query(async ({ input, ctx }) => {
      const filterCondition = filterToPrismaSql(
        input.filter ?? [],
        tracesTableCols,
      );
      console.log("filters: ", filterCondition);

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
            totalCount: number;
            scores: Score[];
          }
        >
      >(Prisma.sql`
      WITH usage AS (
        SELECT
          trace_id,
          sum(prompt_tokens) AS "promptTokens",
          sum(completion_tokens) AS "completionTokens",
          sum(total_tokens) AS "totalTokens"
        FROM
          "observations"
        WHERE
          "trace_id" IS NOT NULL
          AND "type" = 'GENERATION'
          AND "project_id" = ${input.projectId}
        GROUP BY
          trace_id
      ),
      -- used for filtering
      scores_avg AS (
        SELECT
          trace_id,
          jsonb_object_agg(name::text, avg_value::double precision) AS scores_avg
        FROM (
          SELECT
            trace_id,
            name,
            avg(value) avg_value
          FROM
            scores
          GROUP BY
            1,
            2
          ORDER BY
            1) tmp
        GROUP BY
          1
      ),
      scores_json AS (
        SELECT
          trace_id,
          json_agg(json_build_object('id',
              "id",
              'timestamp',
              "timestamp",
              'name',
              "name",
              'value',
              "value",
              'traceId',
              "trace_id",
              'observationId',
              "observation_id",
              'comment',
              "comment")) AS scores
        FROM
          scores
        GROUP BY
          1
      )
      SELECT
        t.*,
        t."external_id" AS "externalId",
        t."user_id" AS "userId",
        t."metadata" AS "metadata",
        COALESCE(u."promptTokens", 0)::int AS "promptTokens",
        COALESCE(u."completionTokens", 0)::int AS "completionTokens",
        COALESCE(u."totalTokens", 0)::int AS "totalTokens",
        COALESCE(s_json.scores, '[]'::json) AS "scores",
        (count(*) OVER ())::int AS "totalCount"
      FROM
        "traces" AS t
        LEFT JOIN usage AS u ON u.trace_id = t.id
        -- used for filtering
        LEFT JOIN scores_avg AS s_avg ON s_avg.trace_id = t.id
        LEFT JOIN scores_json AS s_json ON s_json.trace_id = t.id
      WHERE 
        t."project_id" = ${input.projectId}
        ${searchCondition}
        ${filterCondition}
      ORDER BY
        t."timestamp" DESC
      LIMIT ${input.limit}
      OFFSET ${input.page * input.limit}
    `);
      return traces;
    }),
  filterOptions: protectedProjectProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ input, ctx }) => {
      const [scores, names] = await Promise.all([
        ctx.prisma.score.groupBy({
          where: {
            trace: {
              projectId: input.projectId,
            },
          },
          by: ["name"],
        }),
        ctx.prisma.trace.groupBy({
          where: {
            projectId: input.projectId,
          },
          by: ["name"],
          _count: {
            _all: true,
          },
        }),
      ]);
      const res: TraceOptions = {
        scores_avg: scores.map((score) => score.name),
        name: names
          .filter((n) => n.name !== null)
          .map((name) => ({
            value: name.name ?? "undefined",
            count: name._count._all,
          })),
      };
      return res;
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
          project: {
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

  // exact copy of previoud byId, but without the project member check
  // output must be the same as consumed by the same component
  byIdPublic: publicProcedure
    .input(z.string())
    .query(async ({ input, ctx }) => {
      const [trace, observations, pricings] = await Promise.all([
        ctx.prisma.trace.findFirst({
          where: {
            id: input,
            public: true,
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
          },
        }),
        ctx.prisma.pricing.findMany(),
      ]);

      if (!trace) {
        return null;
      }

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
