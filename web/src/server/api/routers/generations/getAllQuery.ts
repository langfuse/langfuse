import { type z } from "zod";

import { protectedProjectProcedure } from "@/src/server/api/trpc";
import { paginationZod } from "@/src/utils/zod";
import { type ObservationView, Prisma } from "@langfuse/shared/src/db";

import { GenerationTableOptions } from "./utils/GenerationTableOptions";
import { getAllGenerations } from "@/src/server/api/routers/generations/db/getAllGenerationsSqlQuery";

const getAllGenerationsInput = GenerationTableOptions.extend({
  ...paginationZod,
});

export type ScoreSimplified = {
  name: string;
  value: number;
  comment?: string | null;
};

export type GetAllGenerationsInput = z.infer<typeof getAllGenerationsInput>;

export type ObservationViewWithScores = ObservationView & {
  traceId: string | null;
  traceName: string | null;
  promptName: string | null;
  promptVersion: string | null;
  scores: ScoreSimplified[] | null;
};

export const getAllQuery = protectedProjectProcedure
  .input(getAllGenerationsInput)
  .query(async ({ input, ctx }) => {
    const { generations, datetimeFilter, filterCondition, searchCondition } =
      await getAllGenerations({ input, selectIO: false });

    const totalGenerations = await ctx.prisma.$queryRaw<
      Array<{ count: bigint }>
    >(
      Prisma.sql`
      SELECT
        count(*)
      FROM observations_view o
      JOIN traces t ON t.id = o.trace_id AND t.project_id = o.project_id
      LEFT JOIN prompts p ON p.id = o.prompt_id
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
                scores."trace_id" = t.id
                AND scores."observation_id" = o.id
            GROUP BY
                name
        ) tmp
      ) AS s_avg ON true
      WHERE
        t.project_id = ${input.projectId}
        AND o.type = 'GENERATION'
        AND o.project_id = ${input.projectId}
        ${datetimeFilter}
        ${searchCondition}
        ${filterCondition}
    `,
    );
    const count = totalGenerations[0]?.count;
    return {
      totalCount: count ? Number(count) : undefined,
      generations: generations,
    };
  });
