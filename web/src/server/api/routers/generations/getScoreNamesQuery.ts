import { protectedProjectProcedure } from "@/src/server/api/trpc";
import { timeFilter } from "@langfuse/shared";
import { z } from "zod";

export const getScoreNamesQuery = protectedProjectProcedure
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

    // Score names
    const scores = await ctx.prisma.score.groupBy({
      where: {
        projectId: input.projectId,
        timestamp: prismaStartTimeFilter,
      },
      take: 1000,
      orderBy: {
        name: "desc",
      },
      by: ["name", "source", "dataType"],
    });

    return {
      scoreColumns: scores.map(
        ({ name, source, dataType }) => `${name}.${source}.${dataType}`,
      ),
    };
  });
