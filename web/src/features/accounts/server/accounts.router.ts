import {
  createTRPCRouter,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import { createSupabaseAdminClient } from "@/src/server/supabase";
import { TRPCError } from "@trpc/server";
import z from "zod";
import { env } from "@/src/env.mjs";
import * as crypto from "crypto";
import { getTracesGroupedByAllowedUsers } from "@/src/features/accounts/server/queries";
import {
  generateSnapshotUsername,
  generateSyntheticUsername,
} from "@/src/features/accounts/utils";

// todo configure custom sidebar only for admin users

export const accountsRouter = createTRPCRouter({
  getUsers: protectedProjectProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ input }) => {
      const supabase = createSupabaseAdminClient();

      // Fetch all users with djb_metadata, then filter in JavaScript
      const { data: allUsers, error: supabaseError } = await supabase
        .from("User")
        .select("identifier, id, djb_metadata")
        .order("createdAt", { ascending: false });

      if (supabaseError) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: supabaseError.message,
        });
      }

      // Filter for real users (no djb_metadata or no synthetic/snapshot keys)
      const realUsers = allUsers.filter((user) => {
        if (!user.djb_metadata) return true;
        return !user.djb_metadata.synthetic && !user.djb_metadata.snapshot;
      });

      // Extract allowed usernames
      // const allowedUsernames = realUsers.map((user) => user.username);

      // // Fetch Langfuse users filtered by allowed usernames on the database side
      // const langfuseUsers = await getTracesGroupedByAllowedUsers(
      //   input.projectId,
      //   allowedUsernames,
      // );

      // Transform Langfuse users to match the expected format
      return realUsers.map((user) => ({
        username: user.identifier,
        id: user.id, // using user ID as the ID
        projectId: input.projectId,
      })) satisfies {
        username: string;
        projectId: string;
        id: string;
      }[];
    }),
  getSyntheticUsers: protectedProjectProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ input }) => {
      const supabase = createSupabaseAdminClient();

      // Fetch all users with djb_metadata, then filter in JavaScript
      const { data: allUsers, error: supabaseError } = await supabase
        .from("User")
        .select("identifier, id, djb_metadata")
        .order("createdAt", { ascending: false });

      if (supabaseError) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: supabaseError.message,
        });
      }

      // Filter for synthetic users (djb_metadata has "synthetic" key)
      const syntheticUsers = allUsers.filter((user) => {
        return user.djb_metadata && user.djb_metadata.synthetic;
      });

      return syntheticUsers.map((user) => ({
        username: user.identifier,
        id: user.id,
        metadata: user.djb_metadata,
        projectId: input.projectId,
      })) satisfies {
        username: string;
        projectId: string;
        id: string;
        metadata: any;
      }[];
    }),

  getSnapshotUsers: protectedProjectProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ input }) => {
      const supabase = createSupabaseAdminClient();

      // Fetch all users with djb_metadata, then filter in JavaScript
      const { data: allUsers, error: supabaseError } = await supabase
        .from("User")
        .select("identifier, id, djb_metadata, createdAt")
        .order("createdAt", { ascending: false });

      if (supabaseError) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: supabaseError.message,
        });
      }

      // Filter for snapshot users (djb_metadata has "snapshot" key)
      const snapshotUsers = allUsers.filter((user) => {
        return user.djb_metadata && user.djb_metadata.snapshot;
      });

      return snapshotUsers.map((user) => ({
        username: user.identifier,
        id: user.id,
        metadata: user.djb_metadata,
        createdAt: user.createdAt,
        projectId: input.projectId,
      })) satisfies {
        username: string;
        projectId: string;
        id: string;
        metadata: any;
        createdAt: string;
      }[];
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
        .update(input.password + authSecret, "utf-8")
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

      const userRes = await supabase.from("User").insert({
        identifier: input.username,
        metadata: { role: "admin", provider: "credentials" },
      });

      if (userRes.error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: userRes.error.message,
        });
      }

      return data;
    }),

  createSyntheticUser: protectedProjectProcedure
    .input(
      z.object({
        username: z.string(),
        tag: z.string(),
        projectId: z.string(),
      }),
    )
    .mutation(async ({ input }) => {
      const username = generateSyntheticUsername({
        name: input.username,
        tag: input.tag,
      });

      // todo
      return null;
    }),
  createSnapshotUser: protectedProjectProcedure
    .input(
      z.object({
        username: z.string(),
        sessionNumber: z.number(),
        turnNumber: z.number(),
        projectId: z.string(),
        traceId: z.string(),
      }),
    )
    .mutation(async ({ input }) => {
      // todo

      const username = generateSnapshotUsername({
        name: input.username,
        sessionNumber: input.sessionNumber.toString(),
        turnNumber: input.turnNumber.toString(),
      });

      return null;
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
              .update(input.password + authSecret, "utf-8")
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
