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
import { createPrompt } from "@/src/features/prompts/server/actions/createPrompt";
import {
  SYNTHETIC_CONVERSATION_TEMPLATE,
  createSyntheticPromptName,
} from "./synthetic-prompt-template";

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
    .mutation(async ({ input, ctx }) => {
      const supabase = createSupabaseAdminClient();

      // Generate synthetic username
      const syntheticUsername = generateSyntheticUsername({
        name: input.username,
        tag: input.tag,
      });

      // Hash password using SHA256 with auth_secret (CHAINLIT_AUTH_SECRET)
      const authSecret = env.CHAINLIT_AUTH_SECRET;
      if (!authSecret) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "CHAINLIT_AUTH_SECRET is not configured",
        });
      }

      // Use hardcoded password for synthetic users
      const hardcodedPassword = "synthetic_user_password_123";
      const hashedPassword = crypto
        .createHash("sha256")
        .update(hardcodedPassword + authSecret, "utf-8")
        .digest("hex");

      // Create test user in test_users table
      const testUserRes = await supabase.from("test_users").insert({
        username: syntheticUsername,
        password: hashedPassword,
      });

      if (testUserRes.error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: testUserRes.error.message,
        });
      }

      // Create user in User table with synthetic metadata
      const userRes = await supabase.from("User").insert({
        identifier: syntheticUsername,
        metadata: {
          role: "user",
          provider: "synthetic",
          synthetic: true,
          originalName: input.username,
          tag: input.tag,
        },
      });

      if (userRes.error) {
        // Clean up test user if User creation fails
        await supabase
          .from("test_users")
          .delete()
          .eq("username", syntheticUsername);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: userRes.error.message,
        });
      }

      // Create prompt for the synthetic user
      const promptName = createSyntheticPromptName(input.username, input.tag);

      try {
        const prompt = await createPrompt({
          projectId: input.projectId,
          name: promptName,
          type: SYNTHETIC_CONVERSATION_TEMPLATE.type,
          prompt: SYNTHETIC_CONVERSATION_TEMPLATE.prompt,
          config: SYNTHETIC_CONVERSATION_TEMPLATE.config,
          tags: [
            ...SYNTHETIC_CONVERSATION_TEMPLATE.tags,
            `user-${input.username}`,
            `tag-${input.tag}`,
          ],
          labels: SYNTHETIC_CONVERSATION_TEMPLATE.labels,
          createdBy: ctx.session.user.id,
          prisma: ctx.prisma,
          commitMessage: `Created synthetic conversation prompt for user ${input.username} with tag ${input.tag}`,
        });

        return {
          username: syntheticUsername,
          promptName: promptName,
          promptId: prompt.id,
          metadata: {
            originalName: input.username,
            tag: input.tag,
            synthetic: true,
          },
        };
      } catch (error) {
        // If prompt creation fails, we should clean up both users
        await supabase
          .from("User")
          .delete()
          .eq("identifier", syntheticUsername);
        await supabase
          .from("test_users")
          .delete()
          .eq("username", syntheticUsername);

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to create prompt: ${error instanceof Error ? error.message : "Unknown error"}`,
        });
      }
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
    .mutation(async ({ input, ctx }) => {
      const supabase = createSupabaseAdminClient();

      // Generate snapshot username
      const snapshotUsername = generateSnapshotUsername({
        name: input.username,
        sessionNumber: input.sessionNumber.toString(),
        turnNumber: input.turnNumber.toString(),
      });

      // Hash password using SHA256 with auth_secret (CHAINLIT_AUTH_SECRET)
      const authSecret = env.CHAINLIT_AUTH_SECRET;
      if (!authSecret) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "CHAINLIT_AUTH_SECRET is not configured",
        });
      }

      // Use hardcoded password for snapshot users
      const hardcodedPassword = "snapshot_user_password_123";
      const hashedPassword = crypto
        .createHash("sha256")
        .update(hardcodedPassword + authSecret, "utf-8")
        .digest("hex");

      // Create test user in test_users table
      const testUserRes = await supabase.from("test_users").insert({
        username: snapshotUsername,
        password: hashedPassword,
      });

      if (testUserRes.error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: testUserRes.error.message,
        });
      }

      // Create user in User table with snapshot metadata
      const userRes = await supabase.from("User").insert({
        identifier: snapshotUsername,
        metadata: {
          role: "user",
          provider: "snapshot",
          snapshot: true,
          originalName: input.username,
          sessionNumber: input.sessionNumber,
          turnNumber: input.turnNumber,
          traceId: input.traceId,
        },
      });

      if (userRes.error) {
        // Clean up test user if User creation fails
        await supabase
          .from("test_users")
          .delete()
          .eq("username", snapshotUsername);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: userRes.error.message,
        });
      }

      // Create prompt for the snapshot user
      const promptName = `Snapshot Conversation - ${input.username}-s${input.sessionNumber}-t${input.turnNumber}`;

      try {
        const prompt = await createPrompt({
          projectId: input.projectId,
          name: promptName,
          type: SYNTHETIC_CONVERSATION_TEMPLATE.type,
          prompt: SYNTHETIC_CONVERSATION_TEMPLATE.prompt,
          config: SYNTHETIC_CONVERSATION_TEMPLATE.config,
          tags: [
            ...SYNTHETIC_CONVERSATION_TEMPLATE.tags,
            "snapshot",
            `user-${input.username}`,
            `session-${input.sessionNumber}`,
            `turn-${input.turnNumber}`,
          ],
          labels: SYNTHETIC_CONVERSATION_TEMPLATE.labels,
          createdBy: ctx.session.user.id,
          prisma: ctx.prisma,
          commitMessage: `Created snapshot conversation prompt for user ${input.username} session ${input.sessionNumber} turn ${input.turnNumber}`,
        });

        return {
          username: snapshotUsername,
          promptName: promptName,
          promptId: prompt.id,
          metadata: {
            originalName: input.username,
            sessionNumber: input.sessionNumber,
            turnNumber: input.turnNumber,
            traceId: input.traceId,
            snapshot: true,
          },
        };
      } catch (error) {
        // If prompt creation fails, we should clean up both users
        await supabase.from("User").delete().eq("identifier", snapshotUsername);
        await supabase
          .from("test_users")
          .delete()
          .eq("username", snapshotUsername);

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to create prompt: ${error instanceof Error ? error.message : "Unknown error"}`,
        });
      }
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
