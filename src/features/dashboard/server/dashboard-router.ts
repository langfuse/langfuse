import { z } from "zod";

import {
  createTRPCRouter,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import { executeQuery } from "@/src/server/api/services/query-builder";
import { sqlInterface } from "@/src/server/api/services/sqlInterface";

export const dashboardRouter = createTRPCRouter({
  chart: protectedProjectProcedure
    .input(sqlInterface.extend({ projectId: z.string() }))
    .query(async ({ input, ctx }) => {
      return await executeQuery(ctx.prisma, input.projectId, input);
    }),
});
