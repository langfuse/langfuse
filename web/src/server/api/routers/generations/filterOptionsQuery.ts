import { z } from "zod";

import { type ObservationOptions } from "@langfuse/shared";
import { protectedProjectProcedure } from "@/src/server/api/trpc";
import { Prisma } from "@langfuse/shared/src/db";

export const filterOptionsQuery = protectedProjectProcedure
  .input(z.object({ projectId: z.string() }))
  .query(async ({ input, ctx }) => {
    const queryFilter = {
      projectId: input.projectId,
      type: "GENERATION",
    } as const;

    const scores = await ctx.prisma.score.groupBy({
      where: {
        projectId: input.projectId,
      },
      take: 1000,
      orderBy: {
        name: "desc",
      },
      by: ["name"],
    });

    const model = await ctx.prisma.observation.groupBy({
      by: ["model"],
      where: queryFilter,
      _count: { _all: true },
      take: 1000,
      orderBy: {
        model: "desc",
      },
    });
    const name = await ctx.prisma.observation.groupBy({
      by: ["name"],
      where: queryFilter,
      _count: { _all: true },
      take: 1000,
      orderBy: {
        name: "desc",
      },
    });
    const promptNames = await ctx.prisma.$queryRaw<
      Array<{
        promptName: string | null;
        count: number;
      }>
    >(Prisma.sql`
        SELECT
          p.name "promptName",
          count(*)::int AS count
        FROM prompts p
        JOIN observations o ON o.prompt_id = p.id
        WHERE o.type = 'GENERATION'
          AND o.project_id = ${input.projectId}
          AND o.prompt_id IS NOT NULL
          AND p.project_id = ${input.projectId}
        GROUP BY 1
        LIMIT 1000;
      `);
    const traceName = await ctx.prisma.$queryRaw<
      Array<{
        traceName: string | null;
        count: number;
      }>
    >(Prisma.sql`
        SELECT
          t.name "traceName",
          count(*)::int AS count
        FROM traces t
        JOIN observations o ON o.trace_id = t.id
        WHERE o.type = 'GENERATION'
          AND o.project_id = ${input.projectId}
          AND t.project_id = ${input.projectId}
        GROUP BY 1
        LIMIT 1000;
      `);

    // typecheck filter options, needs to include all columns with options
    const res: ObservationOptions = {
      model: model
        .filter((i) => i.model !== null)

        .map((i) => ({
          value: i.model as string,
          count: i._count._all,
        })),
      name: name
        .filter((i) => i.name !== null)
        .map((i) => ({
          value: i.name as string,
          count: i._count._all,
        })),
      traceName: traceName
        .filter((i) => i.traceName !== null)
        .map((i) => ({
          value: i.traceName as string,
          count: i.count,
        })),
      scores_avg: scores.map((score) => score.name),
      promptName: promptNames
        .filter((i) => i.promptName !== null)
        .map((i) => ({
          value: i.promptName as string,
          count: i.count,
        })),
    };

    return res;
  });
