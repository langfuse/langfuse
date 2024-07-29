import { timeFilterToPrismaSql } from "@/src/server/api/routers/generations/db/timeFilterToPrismaSql";
import { protectedProjectProcedure } from "@/src/server/api/trpc";
import { timeFilter } from "@langfuse/shared";
import { z } from "zod";

export const getScoreNamesQuery = protectedProjectProcedure
  .input(
    z.object({ projectId: z.string(), startTimeFilter: timeFilter.optional() }),
  )
  .query(async ({ input, ctx }) => {
    const { startTimeFilter } = input;
    const prismaStartTimeFilter = timeFilterToPrismaSql(startTimeFilter);

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
