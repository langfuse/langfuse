import {
  createTRPCRouter,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import { createSupabaseAdminClient } from "@/src/server/supabase";
import { globalConfig } from "@/src/server/global-config";
import { TRPCError } from "@trpc/server";
import z from "zod";
import {
  generateSyntheticUsername,
  HARDCODED_USER_PASSWORD,
  hashChainlitPassword,
} from "@/src/features/accounts/utils";
import { createPrompt } from "@/src/features/prompts/server/actions/createPrompt";
import {
  SYNTHETIC_CONVERSATION_TEMPLATE,
  createSyntheticPromptName,
} from "./synthetic-prompt-template";

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
        isGbaUser: z.boolean().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const supabase = createSupabaseAdminClient();

      const hashedPassword = hashChainlitPassword(input.password);

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

      // Prepare djb_metadata based on GBA user flag
      const djbMetadata = input.isGbaUser ? { ta_only: true } : {};

      const userRes = await supabase.from("User").insert({
        identifier: input.username,
        metadata: { role: "admin", provider: "credentials" },
        djb_metadata: djbMetadata,
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
        notes: z.string(),
        projectId: z.string(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const supabase = createSupabaseAdminClient();

      // Generate synthetic username
      const syntheticUsername = generateSyntheticUsername({
        name: input.username,
      });

      // Use hardcoded password for synthetic users
      const hashedPassword = hashChainlitPassword(HARDCODED_USER_PASSWORD);

      // Create test user in test_users table
      const testUserRes = await supabase
        .from("test_users")
        .insert({
          username: syntheticUsername,
          password: hashedPassword,
        })
        .select("id")
        .single();

      if (testUserRes.error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: testUserRes.error.message,
        });
      }

      // Create prompt for the synthetic user
      const promptName = createSyntheticPromptName(input.username);

      // Create user in User table with synthetic metadata
      const userRes = await supabase
        .from("User")
        .insert({
          identifier: syntheticUsername,
          metadata: {
            role: "synthetic",
            provider: "credentials",
          },
          djb_metadata: {
            synthetic: {
              prompt_name: promptName,
              notes: input.notes,
            },
          },
        })
        .select("id")
        .single();

      if (userRes.error) {
        // Clean up test user if User creation fails
        await supabase
          .from("test_users")
          .delete()
          .eq("id", testUserRes.data.id);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: userRes.error.message,
        });
      }

      try {
        const prompt = await createPrompt({
          projectId: input.projectId,
          name: promptName,
          type: SYNTHETIC_CONVERSATION_TEMPLATE.type,
          prompt: SYNTHETIC_CONVERSATION_TEMPLATE.prompt,
          config: SYNTHETIC_CONVERSATION_TEMPLATE.config,
          tags: ["synthetic"],
          labels: SYNTHETIC_CONVERSATION_TEMPLATE.labels,
          createdBy: ctx.session.user.id,
          prisma: ctx.prisma,
          commitMessage: `Created synthetic conversation prompt for user ${input.username}`,
        });

        console.log("created prompt", prompt);

        return {
          username: syntheticUsername,
          promptName: promptName,
          promptId: prompt.id,
          metadata: {
            originalName: input.username,
            notes: input.notes,
            synthetic: true,
          },
        };
      } catch (error) {
        console.log("error creating prompt", error);

        // If prompt creation fails, we should clean up both users
        await supabase.from("User").delete().eq("id", userRes.data?.id);
        await supabase
          .from("test_users")
          .delete()
          .eq("id", testUserRes.data.id);

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to create prompt: ${error instanceof Error ? error.message : "Unknown error"}`,
        });
      }
    }),
  updateSyntheticUser: protectedProjectProcedure
    .input(
      z.object({
        id: z.string(),
        username: z.string(),
        notes: z.string(),
        projectId: z.string(),
      }),
    )
    .mutation(async ({ input }) => {
      const supabase = createSupabaseAdminClient();

      // Generate new synthetic username
      const syntheticUsername = generateSyntheticUsername({
        name: input.username,
      });

      // Update user in User table
      const { error: userError } = await supabase
        .from("User")
        .update({
          identifier: syntheticUsername,
          djb_metadata: {
            synthetic: {
              prompt_name: createSyntheticPromptName(input.username),
              notes: input.notes,
            },
          },
        })
        .eq("id", input.id);

      if (userError) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: userError.message,
        });
      }

      // Also update the test_users table with the new username
      const { error: testUserError } = await supabase
        .from("test_users")
        .update({
          username: syntheticUsername,
        })
        .eq("username", `SYNTH_${input.username}`);

      if (testUserError) {
        console.warn(
          "Failed to update test_users table:",
          testUserError.message,
        );
      }

      return {
        username: syntheticUsername,
        notes: input.notes,
      };
    }),
  createSnapshotUser: protectedProjectProcedure
    .input(
      z.object({
        username: z.string(),
        sessionNumber: z.string(),
        turnNumber: z.number(),
        projectId: z.string(),
        traceId: z.string(),
        sessionId: z.string(),
        snapshotUsername: z.string(),
      }),
    )
    .mutation(async ({ input }) => {
      // Use the snapshot username generated by the frontend
      const snapshotUsername = input.snapshotUsername;

      await notifyBackendToCreateSnapshotUser(
        input.username, // origin identifier
        snapshotUsername, // target-identifier
        input.traceId,
        HARDCODED_USER_PASSWORD,
      );
    }),
  generateConversation: protectedProjectProcedure
    .input(
      z.object({
        username: z.string(),
        projectId: z.string(),
      }),
    )
    .mutation(async ({ input }) => {
      await notifyBackendToGenerateConversation(input.username);
    }),
  threadReplay: protectedProjectProcedure
    .input(
      z.object({
        threadId: z.string(),
        userIdentifier: z.string(),
        projectId: z.string(),
      }),
    )
    .mutation(async ({ input }) => {
      await notifyBackendToReplayThread(input.threadId, input.userIdentifier);
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

      const currentUserRes = await supabase
        .from("User")
        .select("*")
        .eq("id", input.id)
        .single();

      if (currentUserRes.error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: currentUserRes.error.message,
        });
      }

      const currentTestUserRes = await supabase
        .from("test_users")
        .select("*")
        .eq("username", currentUserRes.data.identifier)
        .single();

      if (currentTestUserRes.error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: currentTestUserRes.error.message,
        });
      }

      // Prepare update data - keep existing password if input password is empty
      const updateData: { username: string; password: string } = {
        username: input.username,
        password:
          input.password.trim() === ""
            ? currentTestUserRes.data.password
            : hashChainlitPassword(input.password),
      };

      const { data, error } = await supabase
        .from("test_users")
        .update(updateData)
        .eq("id", currentTestUserRes.data.id)
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
          identifier: input.username,
        })
        .eq("id", input.id);

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

      const userRes = await supabase
        .from("User")
        .delete()
        .eq("id", input.id)
        .select("identifier")
        .single();

      if (userRes.error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: userRes.error.message,
        });
      }
      const testUserRes = await supabase
        .from("test_users")
        .delete()
        .eq("username", userRes.data?.identifier);

      if (testUserRes.error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: testUserRes.error.message,
        });
      }

      // TODO - add any langfuse user deletes here

      return testUserRes.data;
    }),
});

/**
 * Ensures that a URL has a protocol (http:// or https://)
 * If no protocol is present, defaults to https://
 */
function ensureUrlHasProtocol(url: string): string {
  if (url.startsWith("http://") || url.startsWith("https://")) {
    return url;
  }

  // Default to https:// for production URLs
  return `https://${url}`;
}

function notifyBackendToCreateSnapshotUser(
  sourceUserIdentifier: string,
  destinationUserIdentifier: string,
  stepId: string,
  password: string,
) {
  const config = globalConfig.getDjbBackendConfig();
  const baseUrl = ensureUrlHasProtocol(config.url);
  const authToken = config.authKey;

  if (!authToken) {
    throw new Error("DJB backend auth key is not configured");
  }

  const requestBody = {
    source_user_identifier: sourceUserIdentifier,
    destination_user_identifier: destinationUserIdentifier,
    step_id: stepId,
    password: password,
  };

  console.log("request", {
    sourceUserIdentifier,
    destinationUserIdentifier,
    stepId,
    password,
  });
  console.log("request body:", requestBody);

  return fetch(`${baseUrl}/admin/user_clone`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${authToken}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody),
  }).then(async (res) => {
    if (!res.ok) {
      console.error("Failed to notify backend to create snapshot user", res);
      throw new Error("Failed to notify backend to create snapshot user");
    }
    const json = await res.json();

    return json;
  });
}

function notifyBackendToGenerateConversation(userIdentifier: string) {
  const config = globalConfig.getDjbBackendConfig();
  const baseUrl = ensureUrlHasProtocol(config.url);
  const authToken = config.authKey;

  if (!authToken) {
    throw new Error("DJB backend auth key is not configured");
  }

  const requestBody = {
    user_identifier: userIdentifier,
  };

  console.log("Generate conversation request:", {
    userIdentifier,
  });
  console.log("Request body:", requestBody);

  return fetch(`${baseUrl}/admin/synthetic_conversation`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${authToken}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody),
  }).then(async (res) => {
    if (!res.ok) {
      console.error("Failed to generate conversation", res);
      throw new Error("Failed to generate conversation");
    }
    const json = await res.json();

    return json;
  });
}

function notifyBackendToReplayThread(threadId: string, userIdentifier: string) {
  const config = globalConfig.getDjbBackendConfig();
  const baseUrl = ensureUrlHasProtocol(config.url);
  const authToken = config.authKey;

  if (!authToken) {
    throw new Error("DJB backend auth key is not configured");
  }

  const requestBody = {
    thread_id: threadId,
    user_identifier: userIdentifier,
  };

  console.log("Thread replay request:", {
    threadId,
    userIdentifier,
  });
  console.log("Request body:", requestBody);

  return fetch(`${baseUrl}/admin/thread_replay`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${authToken}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody),
  }).then(async (res) => {
    if (!res.ok) {
      console.error("Failed to replay thread", res);
      throw new Error("Failed to replay thread");
    }
    const json = await res.json();

    return json;
  });
}
