import {
  createTRPCRouter,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import { createSupabaseAdminClient } from "@/src/server/supabase";
import { TRPCError } from "@trpc/server";
import z from "zod";

export const accountsRouter = createTRPCRouter({
  getUsers: protectedProjectProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ input }) => {
      const supabase = createSupabaseAdminClient();

      const { data, error } = await supabase
        .from("test_users")
        .select("username, id");

      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message,
        });
      }

      return data.map((user) => ({
        ...user,
        projectId: input.projectId, // adding projectId for convenience in table definitions
      })) satisfies { username: string; projectId: string; id: string }[]; // todo consider loading supabase
    }),
  createUser: protectedProjectProcedure
    .input(
      z.object({
        username: z.string(),
        password: z.string(),
      }),
    )
    .mutation(async ({ input }) => {
      const supabase = createSupabaseAdminClient();

      const { data, error } = await supabase.from("test_users").insert({
        username: input.username,
        password: input.password,
      });

      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message,
        });
      }

      return data;
    }),
});
