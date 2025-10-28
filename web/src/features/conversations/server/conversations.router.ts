import {
  createTRPCRouter,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import { createSupabaseAdminClient } from "@/src/server/supabase";
import { orderBy, paginationZod } from "@langfuse/shared";
import { getSessionsTable, logger } from "@langfuse/shared/src/server";
import { TRPCError } from "@trpc/server";
import z from "zod/v4";
import { getFilteredSessions } from "./conversations-service";

const SessionFilterOptions = z.object({
  projectId: z.string(), // Required for protectedProjectProcedure
  orderBy: orderBy,
  accountId: z.string().optional(), // Optional accountId filter
  ...paginationZod,
});

export const conversationsRouter = createTRPCRouter({
  all: protectedProjectProcedure
    .input(SessionFilterOptions)
    .query(async ({ input }) => {
      try {
        const isDev = process.env.NODE_ENV === "development";

        let sessions;

        if (isDev) {
          // Dev mode: getAllSessions, respect input.accountId, ignore test_users
          if (input.accountId) {
            // Filter by specific accountId in dev mode
            sessions = await getFilteredSessions({
              projectId: input.projectId,
              allowedUserIds: [input.accountId], // Only the specified account
              orderBy: input.orderBy,
              page: input.page,
              limit: input.limit,
            });
          } else {
            // Get all sessions in dev mode
            sessions = await getSessionsTable({
              projectId: input.projectId,
              filter: [],
              orderBy: input.orderBy,
              page: input.page,
              limit: input.limit,
            });
          }
        } else {
          // Non-dev mode: getFilteredSessions, only allow test_users
          const supabase = createSupabaseAdminClient();

          const allowedUsersIds = await supabase
            .schema("public")
            .from("test_users")
            .select("username");

          if (allowedUsersIds.error) {
            throw new TRPCError({
              code: "INTERNAL_SERVER_ERROR",
              message: "unable to get allowed users",
            });
          }

          const usernames = allowedUsersIds.data.map((user) => user.username);

          // Filter for specific accountId if provided, within allowed users
          const filteredUsernames = input.accountId
            ? usernames.filter((username) => username === input.accountId)
            : usernames;

          sessions = await getFilteredSessions({
            projectId: input.projectId,
            allowedUserIds: filteredUsernames,
            orderBy: input.orderBy,
            page: input.page,
            limit: input.limit,
          });
        }

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
