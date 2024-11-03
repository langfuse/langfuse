import { z } from "zod";
import { protectedProjectProcedure } from "@/src/server/api/trpc";
import { paginationZod } from "@langfuse/shared";
import { Prisma } from "@langfuse/shared/src/db";
import { GenerationTableOptions } from "./utils/GenerationTableOptions";
import { getAllGenerations } from "@/src/server/api/routers/generations/db/getAllGenerationsSqlQuery";
import {
  getObservationsTableCount,
  parseGetAllGenerationsInput,
} from "@langfuse/shared/src/server";
import { TRPCError } from "@trpc/server";
import { isClickhouseEligible } from "@/src/server/utils/checkClickhouseAccess";

const GetAllGenerationsInput = GenerationTableOptions.extend({
  ...paginationZod,
});

export type GetAllGenerationsInput = z.infer<typeof GetAllGenerationsInput>;

export const getAllQueries = {
  all: protectedProjectProcedure
    .input(
      GetAllGenerationsInput.extend({
        queryClickhouse: z.boolean().default(false),
      }),
    )
    .query(async ({ input, ctx }) => {
      if (!input.queryClickhouse) {
        const { generations } = await getAllGenerations({
          input,
          selectIOAndMetadata: false,
        });

        return {
          generations: generations,
        };
      } else {
        if (!isClickhouseEligible(ctx.session.user)) {
          throw new TRPCError({
            code: "UNAUTHORIZED",
            message: "Not eligible to query clickhouse",
          });
        }

        const { generations } = await getAllGenerations({
          input,
          selectIOAndMetadata: false,
          queryClickhouse: true,
        });

        return {
          generations: generations,
        };
      }
    }),
  countAll: protectedProjectProcedure
    .input(
      GetAllGenerationsInput.extend({
        queryClickhouse: z.boolean().default(false),
      }),
    )
    .query(async ({ input, ctx }) => {
      if (!input.queryClickhouse) {
        const { searchCondition, filterCondition, datetimeFilter } =
          parseGetAllGenerationsInput(input);

        const totalGenerations = await ctx.prisma.$queryRaw<
          Array<{ count: bigint }>
        >(
          Prisma.sql`
          SELECT
            count(*)
          FROM observations_view o
          JOIN traces t ON t.id = o.trace_id AND t.project_id = ${input.projectId}
          LEFT JOIN prompts p ON p.id = o.prompt_id AND p.project_id = ${input.projectId}
          LEFT JOIN LATERAL (
            SELECT
              jsonb_object_agg(name::text, avg_value::double precision) AS "scores_avg"
            FROM (
                SELECT
                  name,
                  avg(value) avg_value
                FROM
                    scores
                WHERE
                    scores."project_id" = ${input.projectId}
                    AND scores."trace_id" = t.id
                    AND scores."observation_id" = o.id
                    AND scores."data_type" IN ('NUMERIC', 'BOOLEAN')
                GROUP BY
                    name
            ) tmp
          ) AS s_avg ON true
          WHERE
            o.type = 'GENERATION'
            AND o.project_id = ${input.projectId}
            ${datetimeFilter}
            ${searchCondition}
            ${filterCondition}
    `,
        );

        const count = totalGenerations[0]?.count;
        return {
          totalCount: count ? Number(count) : undefined,
        };
      } else {
        if (!isClickhouseEligible(ctx.session.user)) {
          throw new TRPCError({
            code: "UNAUTHORIZED",
            message: "Not eligible to query clickhouse",
          });
        }

        const countQuery = await getObservationsTableCount({
          projectId: ctx.session.projectId,
          filter: input.filter ?? [],
          limit: 1,
          offset: 0,
        });

        return {
          totalCount: countQuery.shift()?.count,
        };
      }
    }),
};
