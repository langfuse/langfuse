import { EventType } from "@ag-ui/core";
import { type Session } from "next-auth";
import { getServerSession } from "next-auth";

import { env } from "@/src/env.mjs";
import {
  createInAppAgentMessageId,
  createInAppAgentRunId,
} from "@/src/ee/features/in-app-agent/ids";
import {
  getInAppAgentMessageEntryPointTraceMetadata,
  getInAppAgentQuickActionTraceMetadata,
  sanitizeInAppAgentContext,
} from "@/src/ee/features/in-app-agent/context";
import { getInAppAgentInstrumentationTraceId } from "@/src/ee/features/in-app-agent/constants";
import {
  AgUiRunAgentInputSchema,
  type AgUiRunAgentInput,
  type AgUiEvent,
  InAppAgentRuntimeStateSchema,
  type AgUiMessage,
  ResumeForwardedPropsSchema,
  type ResumeForwardedProps,
} from "@/src/ee/features/in-app-agent/schema";
import { createAgUiStream } from "@/src/ee/features/in-app-agent/server/agent";
import {
  consumeAndValidatePendingToolApproval,
  createInAppAgentMcpRunOverride,
  parseInAppAgentInterruptEvent,
  storePendingToolApproval,
  validatePendingToolApproval,
} from "@/src/ee/features/in-app-agent/server/human-in-the-loop";
import {
  isMcpToolName,
  type InAppAgentUserAccess,
} from "@/src/ee/features/in-app-agent/server/tools";
import type { McpToolName } from "@/src/features/mcp/server/bootstrap";
import {
  createRun,
  ensureOwnedConversation,
  finishRun,
  getConversationEvents,
  getConversationMessagesForReplay,
  isInAppAgentConversationWriteLocked,
  maybeInferAndPersistConversationTitle,
  getSandboxToolCallFiles,
  replaceRunEvents,
  shouldFlushPersistedEvent,
  toPersistableAgentEvent,
} from "@/src/ee/features/in-app-agent/server/persistence";
import { createInAppAgentSandbox } from "@/src/ee/features/in-app-agent/server/sandbox";
import {
  createInAppAgentSandboxProvider,
  getDefaultInAppAgentSandboxProviderType,
} from "@/src/ee/features/in-app-agent/server/sandbox/config";
import { getLangfuseClient } from "@/src/features/natural-language-filters/server/utils";
import { getAuthOptions } from "@/src/server/auth";
import { hasEntitlement } from "@/src/features/entitlements/server/hasEntitlement";
import { getOrganizationPlanServerSide } from "@/src/features/entitlements/server/getPlan";
import {
  createHttpHeaderFromRateLimit,
  RateLimitService,
} from "@/src/features/public-api/server/RateLimitService";
import { getLangfuseAITraceSinkParams } from "@/src/features/ai-features/server/bedrockCompletion";
import { isProjectMemberOrAdmin } from "@/src/server/utils/checkProjectMembershipOrAdmin";
import { getProductBaseUrl } from "@/src/utils/base-url";
import { assertUnreachable } from "@/src/utils/types";
import {
  BaseError,
  ForbiddenError,
  InvalidRequestError,
  type RateLimitResult,
  UnauthorizedError,
  CloudConfigSchema,
} from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import {
  logger,
  redis,
  type ApiAccessScope,
} from "@langfuse/shared/src/server";
import {
  createAndAddApiKeysToDb,
  deleteApiKeyFromDb,
} from "@langfuse/shared/src/server/auth/apiKeys";

const IN_APP_AGENT_API_KEY_NOTE = "In-app agent MCP session";
const MAX_IN_APP_AGENT_INPUT_BYTES = 1024 * 1024;
const SANDBOX_CONVERSATION_WRITE_LOCK_MESSAGE =
  "Sandbox-enabled conversations become read-only after 8 hours. Start a new conversation to continue.";

export default async function handler(request: Request) {
  try {
    const authOptions = await getAuthOptions();
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      throw new UnauthorizedError("Unauthenticated");
    }

    const user = session.user;
    const userId = user.id;

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

    if (!isProjectMemberOrAdmin(user, projectId)) {
      throw new ForbiddenError("User is not a member of this project");
    }

    if (
      !hasEntitlement({
        entitlement: "in-app-agent",
        sessionUser: user,
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
            id: true,
            cloudConfig: true,
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

    const sanitizedInput = sanitizeAgentInput(input, projectId);
    const awsProfile = env.LANGFUSE_IN_APP_AGENT_AWS_PROFILE;
    const bedrockModelId = env.LANGFUSE_AWS_BEDROCK_MODEL;
    const langfuseAiFeaturesPublicKey = env.LANGFUSE_AI_FEATURES_PUBLIC_KEY;
    const langfuseAiFeaturesSecretKey = env.LANGFUSE_AI_FEATURES_SECRET_KEY;
    const langfuseAiFeaturesHost = env.LANGFUSE_AI_FEATURES_HOST;

    if (!bedrockModelId) {
      throw new BaseError(
        "PreconditionFailedError",
        412,
        "Assistant Bedrock model is not configured.",
        true,
      );
    }

    const useLocalPrompt = env.NODE_ENV === "development";

    if (
      !useLocalPrompt &&
      (!langfuseAiFeaturesPublicKey || !langfuseAiFeaturesSecretKey)
    ) {
      throw new BaseError(
        "PreconditionFailedError",
        412,
        "Missing credentials required to initialize langfuse client.",
        true,
      );
    }

    const langfuseClient = getLangfuseClient(
      langfuseAiFeaturesPublicKey ?? "",
      langfuseAiFeaturesSecretKey ?? "",
      langfuseAiFeaturesHost,
      false,
    );

    // TODO: Add an additional user-level cap once the rate-limit service supports non-org keys.
    const rateLimitScope = getInAppAgentRateLimitScope(
      user,
      projectId,
      project.organization,
    );

    const rateLimitResponse = await rateLimitInAppAgentRequest(
      rateLimitScope,
      "in-app-agent-run",
    );

    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    const conversation = await ensureOwnedConversation({
      prisma,
      projectId,
      conversationId,
      userId: userId,
    });
    const conversationEvents = await getConversationEvents({
      prisma,
      projectId,
      conversationId: conversation.id,
    });

    if (
      isInAppAgentConversationWriteLocked({
        conversation,
        events: conversationEvents,
      })
    ) {
      throw new BaseError(
        "PreconditionFailedError",
        412,
        SANDBOX_CONVERSATION_WRITE_LOCK_MESSAGE,
        true,
      );
    }

    if (isResumeAgentInput(sanitizedInput)) {
      await validatePendingToolApproval({
        projectId,
        conversationId: conversation.id,
        forwardedProps: sanitizedInput.forwardedProps,
      });
    }

    const conversationMessages = await getConversationMessagesForReplay({
      prisma,
      projectId,
      conversationId: conversation.id,
    });
    const agentInput = withConversationHistory(
      sanitizedInput,
      conversationMessages,
    );
    const resumeApprovalRequest = isResumeAgentInput(sanitizedInput)
      ? sanitizedInput.forwardedProps.command.resume.approvalRequest
      : undefined;
    const sandboxProviderType = getDefaultInAppAgentSandboxProviderType();
    const sandboxProvider =
      await getInAppAgentSandboxProvider(sandboxProviderType);
    const sandboxState = sandboxProvider
      ? await createInAppAgentSandbox({
          conversationId: conversation.id,
          projectId,
          providerSessionId: conversation.providerSessionId,
          provider: sandboxProvider,
          getToolCallFiles: async () =>
            getSandboxToolCallFiles(conversationEvents),
          saveState: async (state) => {
            await prisma.inAppAgentConversation.update({
              where: {
                id_projectId: {
                  id: conversation.id,
                  projectId,
                },
              },
              data: state,
            });
          },
        })
      : undefined;

    const approvedResumeApprovalRequest =
      isResumeAgentInput(sanitizedInput) &&
      sanitizedInput.forwardedProps.command.resume.approved
        ? sanitizedInput.forwardedProps.command.resume.approvalRequest
        : undefined;

    return await withInAppAgentMcpApiKeyCleanup(
      {
        projectId,
        runId: sanitizedInput.runId,
        userId,
        toolName: getInAppAgentMcpRegistryToolName(
          approvedResumeApprovalRequest?.toolName,
        ),
      },
      async (mcpApiKey, runOverride, cleanupMcpApiKey) => {
        let runCreated = false;
        let pendingToolApprovalConsumed = false;
        let streamCreated = false;
        let approvedToolResultPersisted = false;

        const restorePendingToolApprovalIfRetryable = () => {
          if (
            !pendingToolApprovalConsumed ||
            !approvedResumeApprovalRequest ||
            approvedToolResultPersisted
          ) {
            return;
          }

          return storePendingToolApproval({
            projectId,
            conversationId: conversation.id,
            approvalRequest: approvedResumeApprovalRequest,
          });
        };

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

          if (isResumeAgentInput(sanitizedInput)) {
            await consumeAndValidatePendingToolApproval({
              projectId,
              conversationId: conversation.id,
              forwardedProps: sanitizedInput.forwardedProps,
            });
            pendingToolApprovalConsumed = true;
          }

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

          const userAccess = getInAppAgentUserAccess(user, projectId);

          const stream = await createAgUiStream({
            input: agentInput,
            signal: request.signal,
            options: {
              onEvent: async (event) => {
                const approvalRequest = parseInAppAgentInterruptEvent(event);

                if (approvalRequest) {
                  await storePendingToolApproval({
                    projectId,
                    conversationId: conversation.id,
                    approvalRequest,
                  });
                }

                const persistedEvent = toPersistableAgentEvent(event);

                if (!persistedEvent) {
                  return;
                }

                if (persistedEvent.type === EventType.RUN_STARTED) {
                  return;
                }

                if (
                  persistedEvent.type === EventType.TOOL_CALL_RESULT &&
                  persistedEvent.toolCallId ===
                    resumeApprovalRequest?.toolCallId
                ) {
                  approvedToolResultPersisted = true;
                }

                persistedEvents.push(persistedEvent);

                if (!shouldFlushPersistedEvent(persistedEvent)) {
                  return;
                }

                return replacePersistedRunEvents();
              },
              onApprovedToolCallExecuted: () => {
                approvedToolResultPersisted = true;
              },
              onComplete: () =>
                replacePersistedRunEvents()
                  .finally(() => finishCurrentRun())
                  .finally(() => {
                    if (request.signal.aborted) {
                      return;
                    }

                    // This call is intentionally not awaited, as we don't want to block the response on this operation.
                    maybeInferAndPersistConversationTitle({
                      prisma,
                      projectId,
                      conversationId: conversation.id,
                      userId,
                      aiTelemetryEnabled:
                        project.organization.aiTelemetryEnabled,
                    });
                  }),
              onAbort: () =>
                replacePersistedRunEvents()
                  .then(() => restorePendingToolApprovalIfRetryable())
                  .finally(() =>
                    finishCurrentRun({
                      errorCode: "cancelled",
                      errorMessage: "Client aborted request",
                    }),
                  ),
              onError: (error) =>
                replacePersistedRunEvents()
                  .then(() => restorePendingToolApprovalIfRetryable())
                  .finally(() =>
                    finishCurrentRun({
                      errorCode: "agent_error",
                      errorMessage:
                        error instanceof Error
                          ? error.message
                          : "Unknown agent error",
                    }),
                  ),
              sandbox: sandboxState?.sandbox,
              onFinish: async () => {
                await cleanupMcpApiKey();
                await sandboxState?.onTurnEnded();
              },
              awsBedrock: {
                region: env.LANGFUSE_AWS_BEDROCK_REGION,
                modelId: bedrockModelId,
                ...(awsProfile ? { profile: awsProfile } : {}),
              },
              langfuseMcp: {
                url: getLangfuseMcpUrl(),
                publicKey: mcpApiKey.publicKey,
                secretKey: mcpApiKey.secretKey,
                userAccess,
                runOverride,
              },
              redirectAction: {
                projectId,
                isV4Enabled: user?.v4BetaEnabled ?? false,
              },
              langfuseClient,
              useLocalPrompt,
              langfuseTracing: (() => {
                if (!project.organization.aiTelemetryEnabled) {
                  return undefined;
                }

                const traceSinkParams = getLangfuseAITraceSinkParams({
                  environment: "langfuse-in-app-agent",
                  feature: "in-app-agent",
                  projectId,
                  traceId: getInAppAgentInstrumentationTraceId(
                    sanitizedInput.runId,
                  ),
                  traceName: "agent-turn",
                  userId,
                  metadata: {
                    langfuse_ai_feature: "in-app-agent",
                    langfuse_user_id: userId,
                    langfuse_project_id: projectId,
                    langfuse_project_url: new URL(
                      `project/${encodeURIComponent(projectId)}`,
                      getProductBaseUrl(),
                    ).toString(),
                    conversation_id: conversation.id,
                    thread_id: sanitizedInput.threadId,
                    run_id: sanitizedInput.runId,
                    cloud_region: env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION,
                    agent_session_type:
                      parsedState.data.type === "existingConversation"
                        ? "existing"
                        : "new",
                    ...getInAppAgentQuickActionTraceMetadata(input.context),
                    ...getInAppAgentMessageEntryPointTraceMetadata(
                      input.context,
                    ),
                  },
                });

                return traceSinkParams
                  ? {
                      targetProjectId: traceSinkParams.targetProjectId,
                      environment: traceSinkParams.environment,
                      runId: sanitizedInput.runId,
                      user: {
                        id: userId,
                        email: user.email,
                        projectRole: userAccess.projectRole,
                        isAdmin: userAccess.isAdmin,
                      },
                      metadata: traceSinkParams.metadata ?? {},
                    }
                  : undefined;
              })(),
            },
          });
          streamCreated = true;

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

          if (!streamCreated) {
            await restorePendingToolApprovalIfRetryable();
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

async function getInAppAgentSandboxProvider(
  providerType: ReturnType<typeof getDefaultInAppAgentSandboxProviderType>,
) {
  if (providerType === null || env.NODE_ENV === "test") {
    return undefined;
  }

  if (providerType === "dangerous-docker") {
    logger.warn(
      "Using dangerous-docker in-app agent sandbox provider. This is for local development only.",
    );
    logger.warn(
      "The dangerous-docker sandbox provider executes commands in a local Docker container and should not be enabled in production.",
    );
  }

  return createInAppAgentSandboxProvider(providerType);
}

type SessionUser = NonNullable<Session["user"]>;

function getInAppAgentUserAccess(
  user: SessionUser,
  projectId: string,
): InAppAgentUserAccess {
  const projectRole = user.organizations
    .flatMap((organization) => organization.projects)
    .find((project) => project.id === projectId)?.role;

  return {
    projectRole,
    isAdmin: user.admin === true,
  };
}

function getInAppAgentRateLimitScope(
  user: SessionUser,
  projectId: string,
  projectOrganization: {
    id: string;
    cloudConfig: unknown;
  },
): ApiAccessScope {
  const organization = user.organizations.find((org) =>
    org.projects.some((project) => project.id === projectId),
  );

  if (!organization) {
    if (user.admin === true) {
      const cloudConfig = projectOrganization.cloudConfig
        ? CloudConfigSchema.parse(projectOrganization.cloudConfig)
        : undefined;

      return {
        orgId: projectOrganization.id,
        plan: getOrganizationPlanServerSide(cloudConfig),
        projectId,
        accessLevel: "project",
        rateLimitOverrides: cloudConfig?.rateLimitOverrides ?? [],
        apiKeyId: "in-app-agent-session",
        publicKey: "in-app-agent-session",
        isIngestionSuspended: false,
      };
    }

    throw new ForbiddenError("User is not a member of this project");
  }

  return {
    orgId: organization.id,
    plan: organization.plan,
    projectId,
    accessLevel: "project",
    rateLimitOverrides: organization.cloudConfig?.rateLimitOverrides ?? [],
    apiKeyId: "in-app-agent-session",
    publicKey: "in-app-agent-session",
    isIngestionSuspended: false,
  };
}

async function rateLimitInAppAgentRequest(
  scope: ApiAccessScope,
  resource: Parameters<RateLimitService["rateLimitRequest"]>[1],
): Promise<Response | undefined> {
  const rateLimit = await RateLimitService.getInstance().rateLimitRequest(
    scope,
    resource,
  );

  if (!rateLimit.isRateLimited() || !rateLimit.res) {
    return undefined;
  }

  return createInAppAgentRateLimitResponse(rateLimit.res);
}

function createInAppAgentRateLimitResponse(rateLimitRes: RateLimitResult) {
  const headers = new Headers();

  for (const [header, value] of Object.entries(
    createHttpHeaderFromRateLimit(rateLimitRes),
  )) {
    headers.set(header, String(value));
  }

  return Response.json(
    {
      code: "rate_limited",
      details: {
        retryAfterSeconds: Math.ceil(rateLimitRes.msBeforeNext / 1_000),
      },
    },
    { status: 429, headers },
  );
}

function getLangfuseMcpUrl(): string {
  const rawUrl = env.NEXTAUTH_URL.replace(/\/api\/auth\/?$/, "");
  const baseUrl = new URL(rawUrl);

  baseUrl.pathname = `${baseUrl.pathname.replace(/\/$/, "")}/api/public/mcp`;
  baseUrl.search = "";
  baseUrl.hash = "";

  return baseUrl.toString();
}

async function createInAppAgentMcpApiKey(
  projectId: string,
  createdByUserId: string,
) {
  return createAndAddApiKeysToDb({
    prisma,
    entityId: projectId,
    scope: "PROJECT",
    note: IN_APP_AGENT_API_KEY_NOTE,
    isInAppAgentKey: true,
    createdByUserId,
  });
}

async function withInAppAgentMcpApiKeyCleanup<T>(
  params: {
    projectId: string;
    runId: string;
    userId: string;
    toolName?: McpToolName;
  },
  createResponse: (
    mcpApiKey: Awaited<ReturnType<typeof createInAppAgentMcpApiKey>>,
    runOverride: string | undefined,
    cleanupMcpApiKey: () => Promise<void>,
  ) => T | Promise<T>,
): Promise<T> {
  // Each run gets a temporary in-app-agent API key. Approved MCP resumes also
  // get a tool-scoped run override for the single mutating registry tool.
  const mcpApiKey = await createInAppAgentMcpApiKey(
    params.projectId,
    params.userId,
  );
  let cleanupPromise: Promise<void> | undefined;

  const cleanupMcpApiKey = () => {
    if (!cleanupPromise) {
      cleanupPromise = cleanupInAppAgentMcpApiKey({
        apiKeyId: mcpApiKey.id,
        projectId: params.projectId,
      }).catch((cleanupErr) => {
        cleanupPromise = undefined;
        throw cleanupErr;
      });
    }

    return cleanupPromise;
  };

  try {
    const runOverride = params.toolName
      ? await createInAppAgentMcpRunOverride({
          toolName: params.toolName,
        })
      : undefined;

    return await createResponse(mcpApiKey, runOverride, cleanupMcpApiKey);
  } catch (err) {
    await cleanupMcpApiKey().catch((cleanupErr) => {
      logger.error("Failed to clean up in-app agent MCP API key", cleanupErr);
    });
    throw err;
  }
}

function getInAppAgentMcpRegistryToolName(toolName: string | undefined) {
  if (!toolName?.startsWith("langfuse_")) {
    return undefined;
  }

  const registryToolName = toolName.slice("langfuse_".length);

  return isMcpToolName(registryToolName) ? registryToolName : undefined;
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

type SanitizedAgentInput = Omit<
  AgUiRunAgentInput,
  "messages" | "forwardedProps"
> &
  (
    | {
        messages: [SanitizedUserMessage];
        forwardedProps: Record<string, never>;
      }
    | {
        messages: [];
        forwardedProps: ResumeForwardedProps;
      }
  );

function isResumeAgentInput(
  input: SanitizedAgentInput,
): input is AgUiRunAgentInput & {
  messages: [];
  forwardedProps: ResumeForwardedProps;
} {
  return "command" in input.forwardedProps;
}

function sanitizeAgentInput(
  input: AgUiRunAgentInput,
  projectId: string,
): SanitizedAgentInput {
  const forwardedProps: unknown = input.forwardedProps;

  if (
    forwardedProps !== undefined &&
    (forwardedProps === null ||
      typeof forwardedProps !== "object" ||
      Array.isArray(forwardedProps))
  ) {
    throw new InvalidRequestError("Invalid forwarded props");
  }

  if (forwardedProps && "command" in forwardedProps) {
    const resumeForwardedProps =
      ResumeForwardedPropsSchema.safeParse(forwardedProps);

    if (!resumeForwardedProps.success) {
      throw new InvalidRequestError("Invalid forwarded props");
    }

    return {
      threadId: input.threadId,
      runId: createInAppAgentRunId(),
      ...(input.parentRunId ? { parentRunId: input.parentRunId } : {}),
      state: null,
      messages: [],
      tools: [],
      context: sanitizeInAppAgentContext(input.context, projectId),
      forwardedProps: resumeForwardedProps.data,
    };
  }

  const lastUserMessage = getLastUserMessage(input.messages);

  if (!lastUserMessage) {
    throw new InvalidRequestError("Input payload must include a user message");
  }

  return {
    threadId: input.threadId,
    runId: createInAppAgentRunId(),
    ...(input.parentRunId ? { parentRunId: input.parentRunId } : {}),
    state: null,
    messages: [{ ...lastUserMessage, id: createInAppAgentMessageId() }],
    tools: [],
    context: sanitizeInAppAgentContext(input.context, projectId),
    forwardedProps: {},
  };
}

function withConversationHistory(
  input: SanitizedAgentInput,
  conversationMessages: readonly AgUiMessage[],
): AgUiRunAgentInput {
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
