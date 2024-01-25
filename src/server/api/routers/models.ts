import { z } from "zod";

import {
  createTRPCRouter,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import { paginationZod } from "@/src/utils/zod";

const ModelAllOptions = z.object({
  projectId: z.string(),
  ...paginationZod,
});

export const modelRouter = createTRPCRouter({
  all: protectedProjectProcedure
    .input(ModelAllOptions)
    .query(async ({ input, ctx }) => {
      const models = await ctx.prisma.model.findMany({
        where: {
          OR: [{ projectId: input.projectId }, { projectId: null }],
        },
        skip: input.page * input.limit,
        orderBy: [{ modelName: "asc" }, { startDate: "desc" }],
        take: input.limit,
      });

      const totalAmount = await ctx.prisma.model.count({
        where: {
          OR: [{ projectId: input.projectId }, { projectId: null }],
        },
      });

      return {
        models,
        totalCount: totalAmount,
      };
    }),
});
