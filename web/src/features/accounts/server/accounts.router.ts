import {
  createTRPCRouter,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import { createSupabaseAdminClient } from "@/src/server/supabase";
import { TRPCError } from "@trpc/server";
import z from "zod";
import { env } from "@/src/env.mjs";
import * as crypto from "crypto";

export const accountsRouter = createTRPCRouter({
  getUsers: protectedProjectProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ input }) => {
      const supabase = createSupabaseAdminClient();

      const { data, error } = await supabase
        .from("test_users")
        .select("username, id")
        .order("created_at", { ascending: false });

      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message,
        });
      }

      // TODO - add any langfuse user checks here

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
        projectId: z.string(),
      }),
    )
    .mutation(async ({ input }) => {
      const supabase = createSupabaseAdminClient();

      // Hash password using SHA256 with auth_secret (CHAINLIT_AUTH_SECRET)
      const authSecret = env.CHAINLIT_AUTH_SECRET;
      if (!authSecret) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "CHAINLIT_AUTH_SECRET is not configured",
        });
      }

      const hashedPassword = crypto
        .createHash("sha256")
        .update(input.password + authSecret)
        .digest("hex");

      const { data, error } = await supabase.from("test_users").insert({
        username: input.username,
        password: hashedPassword,
      });

      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message,
        });
      }

      return data;
    }),
  updateUser: protectedProjectProcedure
    .input(
      z.object({
        id: z.string(),
        username: z.string(),
        password: z.string(),
        projectId: z.string(),
      }),
    )
    .mutation(async ({ input }) => {
      const supabase = createSupabaseAdminClient();

      const userRes = await supabase
        .from("test_users")
        .select("*")
        .eq("id", input.id)
        .single();

      if (userRes.error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: userRes.error.message,
        });
      }

      // Hash password using SHA256 with auth_secret (CHAINLIT_AUTH_SECRET)
      const authSecret = env.CHAINLIT_AUTH_SECRET;
      if (!authSecret) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "CHAINLIT_AUTH_SECRET is not configured",
        });
      }

      const newHashedPassword =
        input.password.trim() === ""
          ? null
          : crypto
              .createHash("sha256")
              .update(input.password + authSecret)
              .digest("hex");

      // Prepare update data - keep existing password if input password is empty
      const updateData: { username: string; password: string } = {
        username: input.username,
        password: !newHashedPassword
          ? userRes.data.password
          : newHashedPassword,
      };

      const { data, error } = await supabase
        .from("test_users")
        .update(updateData)
        .eq("id", input.id)
        .select("username")
        .single();

      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message,
        });
      }

      const userUpdateRes = await supabase
        .from("User")
        .update({
          identifier: data.username,
        })
        .eq("identifier", data.username);

      if (userUpdateRes.error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: userUpdateRes.error.message,
        });
      }

      // TODO - add any langfuse user updates here

      return data;
    }),
  deleteUser: protectedProjectProcedure
    .input(z.object({ id: z.string(), projectId: z.string() }))
    .mutation(async ({ input }) => {
      const supabase = createSupabaseAdminClient();

      const testUserRes = await supabase
        .from("test_users")
        .delete()
        .eq("id", input.id)
        .select("username")
        .single();

      if (testUserRes.error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: testUserRes.error.message,
        });
      }

      const userRes = await supabase
        .from("User")
        .delete()
        .eq("identifier", testUserRes.data?.username);

      if (userRes.error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: userRes.error.message,
        });
      }

      // TODO - add any langfuse user deletes here

      return testUserRes.data;
    }),
});
