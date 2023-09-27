import { throwIfNoAccess } from "@/src/features/rbac/utils/checkAccess";
import { createTRPCRouter, protectedProcedure } from "@/src/server/api/trpc";
import * as z from "zod";

export const publishTracesRouter = createTRPCRouter({
  update: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        traceId: z.string(),
        public: z.boolean(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      throwIfNoAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "traces:publish",
      });
      return ctx.prisma.trace.update({
        where: {
          id: input.traceId,
          projectId: input.projectId,
        },
        data: {
          public: input.public,
        },
      });
    }),
});
