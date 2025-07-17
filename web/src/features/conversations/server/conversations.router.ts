import {
  createTRPCRouter,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import { orderBy, paginationZod } from "@langfuse/shared";
import {
  getPublicSessionsFilter,
  getSessionsTable,
  logger,
} from "@langfuse/shared/src/server";
import { TRPCError } from "@trpc/server";
import z from "zod/v4";

const SessionFilterOptions = z.object({
  projectId: z.string(), // Required for protectedProjectProcedure
  orderBy: orderBy,
  ...paginationZod,
});

export const conversationsRouter = createTRPCRouter({
  all: protectedProjectProcedure
    .input(SessionFilterOptions)
    .query(async ({ input, ctx }) => {
      try {
        const finalFilter = await getPublicSessionsFilter(input.projectId, []);

        const sessions = await getSessionsTable({
          projectId: input.projectId,
          filter: finalFilter,
          orderBy: input.orderBy,
          page: input.page,
          limit: input.limit,
        });

        return {
          sessions: sessions.map((s) => ({
            id: s.session_id,
            userIds: s.user_ids,

            createdAt: new Date(s.min_timestamp),
          })),
        };
      } catch (e) {
        logger.error("Unable to call sessions.all", e);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "unable to get sessions",
        });
      }
    }),
});
