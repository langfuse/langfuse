import {
  createTRPCRouter,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import { logger } from "@langfuse/shared/src/server";
import { TRPCError } from "@trpc/server";

export const conversationRouter = createTRPCRouter({
  all: protectedProjectProcedure.query(async ({ input, ctx }) => {
    try {
    } catch (e) {
      logger.error("Unable to call sessions.all", e);
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "unable to get sessions",
      });
    }
  }),
});
