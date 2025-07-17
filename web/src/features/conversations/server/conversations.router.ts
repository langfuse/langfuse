import {
  createTRPCRouter,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import { createSupabaseAdminClient } from "@/src/server/supabase";
import { orderBy, paginationZod } from "@langfuse/shared";
import { logger } from "@langfuse/shared/src/server";
import { TRPCError } from "@trpc/server";
import z from "zod/v4";
import { getFilteredSessions } from "./conversations-service";

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
        const supabase = createSupabaseAdminClient();

        const allowedUsersIds = await supabase
          .from("test_users")
          .select("username");

        if (allowedUsersIds.error) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "unable to get allowed users",
          });
        }

        const usernames = allowedUsersIds.data.map((user) => user.username);

        const sessions = await getFilteredSessions({
          projectId: input.projectId,
          allowedUserIds: usernames,
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
