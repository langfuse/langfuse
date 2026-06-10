import { EventType } from "@ag-ui/core";
import { getServerSession } from "next-auth";

import { env } from "@/src/env.mjs";
import {
  createInAppAgentMessageId,
  createInAppAgentRunId,
} from "@/src/ee/features/in-app-agent/ids";
import {
  AgUiRunAgentInputSchema,
  type AgUiRunAgentInput,
  type AgUiEvent,
  InAppAgentRuntimeStateSchema,
  type InAppAgentRunInput,
  type AgUiMessage,
} from "@/src/ee/features/in-app-agent/schema";
import { createAgUiStream } from "@/src/ee/features/in-app-agent/server/agent";
import {
  createRun,
  ensureOwnedConversation,
  finishRun,
  getConversationMessagesForReplay,
  replaceRunEvents,
  shouldFlushPersistedEvent,
  toPersistableAgentEvent,
} from "@/src/ee/features/in-app-agent/server/persistence";
import { getAuthOptions } from "@/src/server/auth";
import { hasEntitlement } from "@/src/features/entitlements/server/hasEntitlement";
import { isProjectMemberOrAdmin } from "@/src/server/utils/checkProjectMembershipOrAdmin";
import { assertUnreachable } from "@/src/utils/types";
import {
  BaseError,
  ForbiddenError,
  InvalidRequestError,
  UnauthorizedError,
} from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import { logger, redis } from "@langfuse/shared/src/server";
import {
  createAndAddApiKeysToDb,
  deleteApiKeyFromDb,
} from "@langfuse/shared/src/server/auth/apiKeys";
import { sanitizeInAppAgentScreenContext } from "@/src/ee/features/in-app-agent/context";

const IN_APP_AGENT_API_KEY_NOTE = "In-app agent MCP session";
const MAX_IN_APP_AGENT_INPUT_BYTES = 1024 * 1024;

export default async function handler(request: Request) {
  try {
    const authOptions = await getAuthOptions();
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      throw new UnauthorizedError("Unauthenticated");
    }

    const userId = session.user.id;

    if (!env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION) {
      throw new BaseError(
        "PreconditionFailedError",
        412,
        "Assistant is not available in self-hosted deployments.",
        true,
      );
    }

    const bodyResult = await readBoundedJsonBody(
      request,
      MAX_IN_APP_AGENT_INPUT_BYTES,
    );

    if (!bodyResult.success) {
      if (bodyResult.error === "invalid_body") {
        throw new InvalidRequestError("Invalid input");
      }

      if (bodyResult.error === "payload_too_large") {
        throw new BaseError(
          "PayloadTooLargeError",
          413,
          "Input payload is too large",
          true,
        );
      }

      assertUnreachable(bodyResult.error);
    }

    const parsedInput = AgUiRunAgentInputSchema.safeParse(bodyResult.data);

    if (!parsedInput.success) {
      throw new InvalidRequestError("Invalid input");
    }

    const input = parsedInput.data;
    const parsedState = InAppAgentRuntimeStateSchema.safeParse(input.state);

    if (!parsedState.success) {
      throw new InvalidRequestError("Invalid agent state");
    }

    const auth = { userId: session.user.id, user: session.user };

    const { projectId, conversationId } = (() => {
      if (parsedState.data.type === "newConversation") {
        return {
          projectId: parsedState.data.projectId,
          conversationId: input.threadId,
        };
      }

      if (parsedState.data.conversationId !== input.threadId) {
        throw new InvalidRequestError("Conversation id does not match thread");
      }

      return {
        projectId: parsedState.data.projectId,
        conversationId: parsedState.data.conversationId,
      };
    })();

    if (!isProjectMemberOrAdmin(auth.user, projectId)) {
      throw new ForbiddenError("User is not a member of this project");
    }

    // This condition should match `useIsFeatureEnabled("inAppAgent")` in the frontend
    const isInAppAgentEnabled =
      auth.user.featureFlags.inAppAgent === true ||
      auth.user.admin === true ||
      session.environment.enableExperimentalFeatures === true;

    if (!isInAppAgentEnabled) {
      throw new ForbiddenError("Assistant is not enabled for this user");
    }

    if (
      !hasEntitlement({
        entitlement: "in-app-agent",
        sessionUser: auth.user,
        projectId,
      })
    ) {
      throw new ForbiddenError("Assistant is not enabled for this plan");
    }

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: {
        organization: {
          select: {
            aiFeaturesEnabled: true,
            aiTelemetryEnabled: true,
          },
        },
      },
    });

    if (!project?.organization.aiFeaturesEnabled) {
      throw new ForbiddenError(
        "Assistant is not enabled for this organization",
      );
    }

    const sanitizedInput = sanitizeAgentInput(input);
    const awsProfile = env.LANGFUSE_IN_APP_AGENT_AWS_PROFILE;
    const bedrockModelId = env.LANGFUSE_AWS_BEDROCK_MODEL;
    const targetProjectId = env.LANGFUSE_AI_FEATURES_PROJECT_ID;

    if (!bedrockModelId) {
      throw new BaseError(
        "PreconditionFailedError",
        412,
        "Assistant Bedrock model is not configured.",
        true,
      );
    }

    const conversation = await ensureOwnedConversation({
      prisma,
      projectId,
      conversationId,
      userId: auth.userId,
    });
    const conversationMessages = await getConversationMessagesForReplay({
      prisma,
      projectId,
      conversationId: conversation.id,
    });
    const agentInput = withConversationHistory(
      sanitizedInput,
      conversationMessages,
    );

    return await withInAppAgentMcpApiKeyCleanup(
      projectId,
      async (mcpApiKey, cleanupMcpApiKey) => {
        let runCreated = false;

        try {
          await createRun({
            prisma,
            runId: sanitizedInput.runId,
            projectId,
            conversationId: conversation.id,
            triggeredByUserId: userId,
            model: bedrockModelId,
            mcpApiKeyId: mcpApiKey.id,
          });
          runCreated = true;

          const persistedEvents: AgUiEvent[] = [
            {
              type: EventType.RUN_STARTED,
              threadId: sanitizedInput.threadId,
              runId: sanitizedInput.runId,
              ...(sanitizedInput.parentRunId
                ? { parentRunId: sanitizedInput.parentRunId }
                : {}),
              input: sanitizedInput,
            },
          ];

          const replacePersistedRunEvents = () =>
            replaceRunEvents({
              prisma,
              projectId,
              conversationId: conversation.id,
              runId: sanitizedInput.runId,
              events: persistedEvents,
            });

          await replacePersistedRunEvents();

          const finishCurrentRun = (error?: {
            errorCode: string;
            errorMessage: string;
          }) =>
            finishRun({
              prisma,
              runId: sanitizedInput.runId,
              projectId,
              ...error,
            });

          const stream = createAgUiStream({
            input: agentInput,
            signal: request.signal,
            options: {
              onEvent: (event) => {
                const persistedEvent = toPersistableAgentEvent(event);

                if (!persistedEvent) {
                  return;
                }

                if (persistedEvent.type === EventType.RUN_STARTED) {
                  return;
                }

                persistedEvents.push(persistedEvent);

                if (!shouldFlushPersistedEvent(persistedEvent)) {
                  return;
                }

                return replacePersistedRunEvents();
              },
              onComplete: () =>
                replacePersistedRunEvents().finally(() => finishCurrentRun()),
              onAbort: () =>
                replacePersistedRunEvents().finally(() =>
                  finishCurrentRun({
                    errorCode: "cancelled",
                    errorMessage: "Client aborted request",
                  }),
                ),
              onError: (error) =>
                replacePersistedRunEvents().finally(() =>
                  finishCurrentRun({
                    errorCode: "agent_error",
                    errorMessage:
                      error instanceof Error
                        ? error.message
                        : "Unknown agent error",
                  }),
                ),
              onFinish: cleanupMcpApiKey,
              awsBedrock: {
                region: env.LANGFUSE_AWS_BEDROCK_REGION,
                modelId: bedrockModelId,
                ...(awsProfile ? { profile: awsProfile } : {}),
              },
              langfuseMcp: {
                url: getLangfuseMcpUrl(),
                publicKey: mcpApiKey.publicKey,
                secretKey: mcpApiKey.secretKey,
              },
              langfuseTracing:
                project.organization.aiTelemetryEnabled && targetProjectId
                  ? {
                      targetProjectId,
                      environment: "langfuse-in-app-agent",
                      userId: auth.userId,
                      traceId: conversation.id,
                      metadata: {
                        langfuse_ai_feature: "in-app-agent",
                        langfuse_user_id: auth.userId,
                        langfuse_project_id: projectId,
                        conversation_id: conversation.id,
                        thread_id: sanitizedInput.threadId,
                        run_id: sanitizedInput.runId,
                        cloud_region: env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION,
                        agent_session_type:
                          parsedState.data.type === "existingConversation"
                            ? "existing"
                            : "new",
                      },
                    }
                  : undefined,
            },
          });

          return new Response(stream, {
            headers: {
              "Content-Type": "text/event-stream; charset=utf-8",
              "Content-Encoding": "none",
              "Cache-Control": "no-cache, no-transform",
              Connection: "keep-alive",
              "X-Accel-Buffering": "no",
            },
          });
        } catch (error) {
          if (runCreated) {
            await finishRun({
              prisma,
              runId: sanitizedInput.runId,
              projectId,
              errorCode: "init_failed",
              errorMessage:
                error instanceof Error
                  ? error.message
                  : "Agent initialization failed",
            });
          }

          throw error;
        }
      },
    );
  } catch (err) {
    if (err instanceof BaseError) {
      return Response.json({ error: err.message }, { status: err.httpCode });
    }

    throw err;
  }
}

function getLangfuseMcpUrl(): string {
  const rawUrl = env.NEXTAUTH_URL.replace(/\/api\/auth\/?$/, "");
  const baseUrl = new URL(rawUrl);

  baseUrl.pathname = `${baseUrl.pathname.replace(/\/$/, "")}/api/public/mcp`;
  baseUrl.search = "";
  baseUrl.hash = "";

  return baseUrl.toString();
}

async function createInAppAgentMcpApiKey(projectId: string) {
  return createAndAddApiKeysToDb({
    prisma,
    entityId: projectId,
    scope: "PROJECT",
    note: IN_APP_AGENT_API_KEY_NOTE,
    isInAppAgentKey: true,
  });
}

async function withInAppAgentMcpApiKeyCleanup<T>(
  projectId: string,
  createResponse: (
    mcpApiKey: Awaited<ReturnType<typeof createInAppAgentMcpApiKey>>,
    cleanupMcpApiKey: () => Promise<void>,
  ) => T | Promise<T>,
): Promise<T> {
  const mcpApiKey = await createInAppAgentMcpApiKey(projectId);
  let cleanupPromise: Promise<void> | undefined;

  const cleanupMcpApiKey = () => {
    if (!cleanupPromise) {
      cleanupPromise = cleanupInAppAgentMcpApiKey({
        apiKeyId: mcpApiKey.id,
        projectId,
      }).catch((cleanupErr) => {
        cleanupPromise = undefined;
        throw cleanupErr;
      });
    }

    return cleanupPromise;
  };

  try {
    return await createResponse(mcpApiKey, cleanupMcpApiKey);
  } catch (err) {
    await cleanupMcpApiKey().catch((cleanupErr) => {
      logger.error("Failed to clean up in-app agent MCP API key", cleanupErr);
    });
    throw err;
  }
}

async function cleanupInAppAgentMcpApiKey(params: {
  apiKeyId: string;
  projectId: string;
}) {
  await deleteApiKeyFromDb({
    prisma,
    id: params.apiKeyId,
    entityId: params.projectId,
    scope: "PROJECT",
    redis,
  });
}

type SanitizedAgentInput = InAppAgentRunInput & {
  messages: [SanitizedUserMessage];
};

function sanitizeAgentInput(input: AgUiRunAgentInput): SanitizedAgentInput {
  const lastUserMessage = getLastUserMessage(input.messages);

  if (!lastUserMessage) {
    throw new InvalidRequestError("Input payload must include a user message");
  }

  const [context, didSanitizeScreenContextUrl] =
    sanitizeInAppAgentScreenContext(input.context);

  if (didSanitizeScreenContextUrl) {
    logger.warn("Sanitized in-app agent screen context URL", {
      unsanitizedUrl: input.context.find(
        (item) => item.description === "currentUrl",
      )?.value,
      sanitizedContext: context,
    });
  }

  return {
    threadId: input.threadId,
    runId: createInAppAgentRunId(),
    ...(input.parentRunId ? { parentRunId: input.parentRunId } : {}),
    state: null,
    messages: [{ ...lastUserMessage, id: createInAppAgentMessageId() }],
    tools: [],
    context,
    forwardedProps: {},
  };
}

function withConversationHistory(
  input: SanitizedAgentInput,
  conversationMessages: readonly AgUiMessage[],
): InAppAgentRunInput {
  return {
    ...input,
    messages: [...conversationMessages, ...input.messages],
  };
}

type SanitizedUserMessage = {
  id: string;
  role: "user";
  content: string;
};

function getLastUserMessage(
  messages: AgUiMessage[],
): SanitizedUserMessage | undefined {
  const lastMessage = messages.at(-1);

  if (lastMessage?.role !== "user") {
    return undefined;
  }

  const text =
    typeof lastMessage.content === "string"
      ? lastMessage.content
      : lastMessage.content
          .flatMap((part) => (part.type === "text" ? [part.text] : []))
          .join("");

  if (!text.trim()) {
    return undefined;
  }

  return {
    id: lastMessage.id,
    role: "user",
    content: text,
  };
}

type BoundedJsonBodyResult =
  | { success: true; data: unknown }
  | { success: false; error: "invalid_body" | "payload_too_large" };

async function readBoundedJsonBody(
  request: Request,
  maxSizeBytes: number,
): Promise<BoundedJsonBodyResult> {
  const contentLength = Number(request.headers.get("content-length"));

  if (Number.isFinite(contentLength) && contentLength > maxSizeBytes) {
    return { success: false, error: "payload_too_large" };
  }

  const reader = request.body?.getReader();
  const chunks: Uint8Array[] = [];
  let receivedBytes = 0;

  if (!reader) {
    return { success: false, error: "invalid_body" };
  }

  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    receivedBytes += value.byteLength;

    if (receivedBytes > maxSizeBytes) {
      await reader.cancel().catch(() => undefined);
      return { success: false, error: "payload_too_large" };
    }

    chunks.push(value);
  }

  const bodyText = new TextDecoder().decode(Buffer.concat(chunks));

  try {
    return { success: true, data: bodyText ? JSON.parse(bodyText) : null };
  } catch {
    return { success: false, error: "invalid_body" };
  }
}
