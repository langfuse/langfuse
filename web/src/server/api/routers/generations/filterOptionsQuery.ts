import { z } from "zod";

import {
  datetimeFilterToPrismaSql,
  timeFilter,
  type ObservationOptions,
} from "@langfuse/shared";
import { protectedProjectProcedure } from "@/src/server/api/trpc";
import { Prisma } from "@langfuse/shared/src/db";

export const filterOptionsQuery = protectedProjectProcedure
  .input(
    z.object({ projectId: z.string(), startTimeFilter: timeFilter.optional() }),
  )
  .query(async ({ input, ctx }) => {
    const { startTimeFilter } = input;
    const prismaStartTimeFilter =
      startTimeFilter?.type === "datetime"
        ? startTimeFilter?.operator === ">="
          ? { gte: startTimeFilter.value }
          : startTimeFilter?.operator === ">"
            ? { gt: startTimeFilter.value }
            : startTimeFilter?.operator === "<="
              ? { lte: startTimeFilter.value }
              : startTimeFilter?.operator === "<"
                ? { lt: startTimeFilter.value }
                : {}
        : {};

    const queryFilter = {
      projectId: input.projectId,
      type: "GENERATION",
    } as const;

    // Score names
    const scores = await ctx.prisma.score.groupBy({
      where: {
        projectId: input.projectId,
        timestamp: prismaStartTimeFilter,
        dataType: { in: ["NUMERIC", "BOOLEAN"] },
      },
      take: 1000,
      orderBy: {
        name: "asc",
      },
      by: ["name"],
    });

    // Model names
    const model = await ctx.prisma.observation.groupBy({
      by: ["model"],
      where: { ...queryFilter, startTime: prismaStartTimeFilter },
      take: 1000,
      orderBy: { model: "asc" },
    });

    // Observation names
    const name = await ctx.prisma.observation.groupBy({
      by: ["name"],
      where: { ...queryFilter, startTime: prismaStartTimeFilter },
      take: 1000,
      orderBy: { name: "asc" },
    });

    const rawStartTimeFilter =
      startTimeFilter && startTimeFilter.type === "datetime"
        ? datetimeFilterToPrismaSql(
            "start_time",
            startTimeFilter.operator,
            startTimeFilter.value,
          )
        : Prisma.empty;

    // Prompt names
    const promptNames = await ctx.prisma.$queryRaw<
      Array<{
        promptName: string | null;
      }>
    >(Prisma.sql`
        SELECT
          p.name "promptName"
        FROM prompts p
        JOIN observations o ON o.prompt_id = p.id
        WHERE o.type = 'GENERATION'
          AND o.project_id = ${input.projectId}
          AND o.prompt_id IS NOT NULL
          AND p.project_id = ${input.projectId}
          ${rawStartTimeFilter}
        GROUP BY p.name
        ORDER BY p.name ASC
        LIMIT 1000;
      `);

    // Trace names
    const traceName = await ctx.prisma.$queryRaw<
      Array<{
        traceName: string | null;
      }>
    >(Prisma.sql`
        SELECT
          t.name "traceName"
        FROM traces t
        JOIN observations o ON o.trace_id = t.id
        WHERE o.type = 'GENERATION'
          AND o.project_id = ${input.projectId}
          AND t.project_id = ${input.projectId}
          ${rawStartTimeFilter}
        GROUP BY t.name
        ORDER BY t.name ASC
        LIMIT 1000;
      `);

    // typecheck filter options, needs to include all columns with options
    const res: ObservationOptions = {
      model: model
        .filter((i) => i.model !== null)
        .map((i) => ({ value: i.model as string })),
      name: name
        .filter((i) => i.name !== null)
        .map((i) => ({ value: i.name as string })),
      traceName: traceName
        .filter((i) => i.traceName !== null)
        .map((i) => ({
          value: i.traceName as string,
        })),
      scores_avg: scores.map((score) => score.name),
      promptName: promptNames
        .filter((i) => i.promptName !== null)
        .map((i) => ({
          value: i.promptName as string,
        })),
    };

    return res;
  });
