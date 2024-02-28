import { type z } from "zod";

import { protectedProjectProcedure } from "@/src/server/api/trpc";
import { paginationZod } from "@/src/utils/zod";
import { type ObservationView, Prisma } from "@prisma/client";

import { GenerationTableOptions } from "./utils/GenerationTableOptions";
import { getAllGenerationsSqlQuery } from "@/src/server/api/routers/generations/db/getAllGenerationsSqlQuery";

const getAllGenerationsInput = GenerationTableOptions.extend({
  ...paginationZod,
});
export type GetAllGenerationsInput = z.infer<typeof getAllGenerationsInput>;

export const getAllQuery = protectedProjectProcedure
  .input(getAllGenerationsInput)
  .query(async ({ input, ctx }) => {
    const { rawSqlQuery, datetimeFilter, filterCondition, searchCondition } =
      getAllGenerationsSqlQuery({ input, type: "paginate" });

    const generations = await ctx.prisma.$queryRaw<
      (ObservationView & {
        traceId: string;
        traceName: string;
        promptName: string | null;
        promptVersion: string | null;
      })[]
    >(rawSqlQuery);

    const totalGenerations = await ctx.prisma.$queryRaw<
      Array<{ count: bigint }>
    >(
      Prisma.sql`
      WITH scores_avg AS (
        SELECT
          trace_id,
          observation_id,
          jsonb_object_agg(name::text, avg_value::double precision) AS scores_avg
        FROM (
          SELECT
            trace_id,
            observation_id,
            name,
            avg(value) avg_value
          FROM
            scores
          GROUP BY
            1,
            2,
            3
          ORDER BY
            1) tmp
        GROUP BY
          1, 2
      )
      SELECT
        count(*)
      FROM observations_view o
      JOIN traces t ON t.id = o.trace_id AND t.project_id = o.project_id
      LEFT JOIN scores_avg AS s_avg ON s_avg.trace_id = t.id and s_avg.observation_id = o.id
      WHERE
        t.project_id = ${input.projectId}
        AND o.type = 'GENERATION'
        AND o.project_id = ${input.projectId}
        ${datetimeFilter}
        ${searchCondition}
        ${filterCondition}
    `,
    );

    const scores = await ctx.prisma.score.findMany({
      where: {
        trace: {
          projectId: input.projectId,
        },
        observationId: {
          in: generations.map((gen) => gen.id),
        },
      },
    });
    const count = totalGenerations[0]?.count;
    return {
      totalCount: count ? Number(count) : undefined,
      generations: generations.map((generation) => {
        const filteredScores = scores.filter(
          (s) => s.observationId === generation.id,
        );
        return {
          ...generation,
          scores: filteredScores,
        };
      }),
    };
  });
