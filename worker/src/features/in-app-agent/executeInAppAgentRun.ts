import {
  InAppAgentRunErrorCode,
  InAppAgentRunRequestSchema,
  InAppAgentRunStatus,
  Role,
  type InAppAgentRunRequest,
} from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import { env as sharedEnv } from "@langfuse/shared/src/env";
import {
  getLangfuseAITraceSinkParams,
  logger,
  redis,
} from "@langfuse/shared/src/server";
import {
  createAndAddApiKeysToDb,
  deleteApiKeyFromDb,
} from "@langfuse/shared/src/server/auth/apiKeys";
import {
  getInAppAgentInstrumentationTraceId,
  type AgUiEvent,
  type AgUiRunAgentInput,
  type InAppAgentToolApprovalRequest,
} from "@langfuse/shared/in-app-agent";
import {
  claimQueuedRun,
  clearRunMcpApiKeyPointer,
  createAgUiStream,
  createInAppAgentMcpRunOverride,
  createInAppAgentSandbox,
  finishClaimedRun,
  flushPendingRunEvents,
  getConversationEvents,
  getConversationMessagesForReplay,
  getInAppAgentPromptClient,
  getSandboxToolCallFiles,
  heartbeatClaimedRun,
  IN_APP_AGENT_HEARTBEAT_INTERVAL_MS,
  isInAppAgentConversationWriteLocked,
  isMcpToolName,
  maybeInferAndPersistConversationTitle,
  parseInAppAgentInterruptEvent,
  shouldFlushPersistedEvent,
  toPersistableAgentEvent,
  type InAppAgentUserAccess,
  type PersistedConversationEvent,
} from "@langfuse/shared/in-app-agent/server";
import {
  createInAppAgentSandboxProvider,
  getDefaultInAppAgentSandboxProviderType,
} from "@langfuse/shared/in-app-agent/server/sandbox/config";

import { env } from "../../env";

const IN_APP_AGENT_API_KEY_NOTE = "In-app agent MCP session";

type AbortReason = "cancelled" | "fenced" | "worker_shutdown";

// Active runs register their AbortController so SIGTERM can abort every loop
// at its next step boundary before WorkerManager waits for jobs to drain.
const activeRunAborts = new Set<AbortController>();

export function abortActiveInAppAgentRuns(): void {
  for (const controller of activeRunAborts) {
    controller.abort("worker_shutdown" satisfies AbortReason);
  }
}

/** Thrown for claim-time revalidation failures; maps to FAILED (init_failed). */
class InAppAgentRunInitError extends Error {}

export async function executeInAppAgentRun(params: {
  projectId: string;
  runId: string;
}): Promise<void> {
  const { projectId, runId } = params;

  // Claim CAS: zero rows means duplicate delivery or a run reconciled away
  // while queued — ack and exit, Postgres owns correctness.
  const run = await claimQueuedRun({ prisma, projectId, runId });

  if (!run) {
    logger.info("In-app agent run not claimable, acknowledging delivery", {
      projectId,
      runId,
    });
    return;
  }

  const abortController = new AbortController();
  activeRunAborts.add(abortController);

  let heartbeatTimer: NodeJS.Timeout | undefined;
  let mcpApiKey: { id: string; publicKey: string; secretKey: string } | null =
    null;
  let mcpApiKeyCleanup: Promise<void> | undefined;
  let isApprovedContinuation = false;
  let approvedToolResultPersisted = false;
  // True once createAgUiStream returned: from here on, errors reaching the
  // outer catch are loop failures surfaced through the errored stream, not
  // initialization failures.
  let agentLoopStarted = false;

  // The uncovered durability window: an approved mutation may have started
  // but its result never persisted. Never generically retried. Hoisted to
  // function scope because both the loop callbacks and the outer catch can
  // record the terminal state (failStream races the drain rejection).
  const failureCode = () =>
    isApprovedContinuation && !approvedToolResultPersisted
      ? {
          errorCode: InAppAgentRunErrorCode.OUTCOME_UNKNOWN,
          errorMessage:
            "The approved action may have completed. Verify before retrying.",
        }
      : undefined;

  // Single-flight (same shape as web's withInAppAgentMcpApiKeyCleanup): the
  // loop's onFinish and the outer catch can invoke this concurrently because
  // failStream errors the stream without awaiting its onError/onFinish chain.
  const cleanupMcpApiKey = (): Promise<void> => {
    if (!mcpApiKey) return Promise.resolve();
    const keyId = mcpApiKey.id;
    mcpApiKeyCleanup ??= (async () => {
      await deleteApiKeyFromDb({
        prisma,
        id: keyId,
        entityId: projectId,
        scope: "PROJECT",
        redis,
      });
      // Pointer is nulled only after the delete is confirmed; if the delete
      // failed above, the terminal run keeps the pointer so reconciliation
      // retries the cleanup.
      await clearRunMcpApiKeyPointer({ prisma, projectId, runId });
    })().catch((error: unknown) => {
      mcpApiKeyCleanup = undefined;
      throw error;
    });
    return mcpApiKeyCleanup;
  };

  const cleanupMcpApiKeyLogged = () =>
    cleanupMcpApiKey().catch((error) =>
      logger.error("Failed to clean up in-app agent MCP API key", {
        error,
        projectId,
        runId,
      }),
    );

  try {
    // ---- Revalidate at claim; nothing from enqueue time is trusted. ----
    if (!env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION) {
      throw new InAppAgentRunInitError(
        "In-app agent is only available on Langfuse Cloud",
      );
    }

    const bedrockModelId = run.model ?? sharedEnv.LANGFUSE_AWS_BEDROCK_MODEL;

    if (!bedrockModelId || !sharedEnv.LANGFUSE_AWS_BEDROCK_REGION) {
      throw new InAppAgentRunInitError(
        "Assistant Bedrock model is not configured",
      );
    }

    const conversation = await prisma.inAppAgentConversation.findFirst({
      where: { id: run.conversationId, projectId, deletedAt: null },
    });

    // Owner-only v1: the run principal must own the conversation.
    if (
      !conversation ||
      conversation.createdByUserId !== run.triggeredByUserId
    ) {
      throw new InAppAgentRunInitError("Agent conversation not found");
    }

    const project = await prisma.project.findFirst({
      where: { id: projectId, deletedAt: null },
      include: { organization: true },
    });

    if (!project) {
      throw new InAppAgentRunInitError("Project not found");
    }

    if (!project.organization.aiFeaturesEnabled) {
      throw new InAppAgentRunInitError(
        "AI features are disabled for this organization",
      );
    }

    if (!run.triggeredByUserId) {
      // Pre-committed platform guardrail: a missing user must never
      // implicitly mean "trusted system".
      throw new InAppAgentRunInitError("Run has no triggering user");
    }

    const access = await resolveUserProjectAccess({
      userId: run.triggeredByUserId,
      projectId,
      orgId: project.orgId,
    });

    if (!access) {
      throw new InAppAgentRunInitError(
        "User is no longer a member of this project",
      );
    }

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
      throw new InAppAgentRunInitError(
        "Conversation is write-locked (sandbox session expired)",
      );
    }

    // ---- Build the agent input from the run request + persisted history. ----
    const parsedRequest = InAppAgentRunRequestSchema.safeParse(run.request);

    if (!parsedRequest.success) {
      throw new InAppAgentRunInitError("Run request payload is invalid");
    }

    const request = parsedRequest.data;
    const replayMessages = await getConversationMessagesForReplay({
      prisma,
      projectId,
      conversationId: conversation.id,
    });
    const approvalRequest =
      request.kind === "approvalDecision"
        ? findPersistedApprovalRequest(conversationEvents, request)
        : undefined;

    if (request.kind === "approvalDecision" && !approvalRequest) {
      throw new InAppAgentRunInitError(
        "Approval request not found in conversation history",
      );
    }

    // The submitter persisted the RUN_STARTED event (carrying the user
    // message / decision) in the same transaction that inserted the run, so
    // the replayed history is complete and the worker never writes
    // RUN_STARTED itself.
    const agentInput: AgUiRunAgentInput = {
      threadId: conversation.id,
      runId,
      state: null,
      messages: [...replayMessages],
      tools: [],
      context: request.kind === "userMessage" ? request.context : [],
      forwardedProps:
        request.kind === "approvalDecision" && approvalRequest
          ? {
              command: {
                resume: {
                  approved: request.approved,
                  approvalRequest,
                },
              },
            }
          : {},
    };

    isApprovedContinuation =
      request.kind === "approvalDecision" && request.approved;
    const approvedRegistryToolName = isApprovedContinuation
      ? getRegistryToolName(approvalRequest?.toolName)
      : undefined;
    const runOverride = approvedRegistryToolName
      ? await createInAppAgentMcpRunOverride({
          toolName: approvedRegistryToolName,
        })
      : undefined;

    // ---- Sandbox (session created/resumed lazily per tool call). ----
    const sandboxProviderType = getDefaultInAppAgentSandboxProviderType();
    const sandboxProvider =
      sandboxProviderType === null || env.NODE_ENV === "test"
        ? undefined
        : await createInAppAgentSandboxProvider(sandboxProviderType);

    if (sandboxProviderType === "dangerous-docker" && sandboxProvider) {
      logger.warn(
        "Using dangerous-docker in-app agent sandbox provider. This is for local development only.",
      );
    }

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
              where: { id_projectId: { id: conversation.id, projectId } },
              data: state,
            });
          },
        })
      : undefined;

    // ---- Temp MCP key: mint + link to the run in one transaction, so no
    // crash window can leave a key that is not discoverable from its run. ----
    mcpApiKey = await prisma.$transaction(async (tx) => {
      const key = await createAndAddApiKeysToDb({
        prisma: tx,
        entityId: projectId,
        scope: "PROJECT",
        note: IN_APP_AGENT_API_KEY_NOTE,
        isInAppAgentKey: true,
        createdByUserId: run.triggeredByUserId ?? undefined,
      });

      await tx.inAppAgentRun.updateMany({
        where: { id: runId, projectId },
        data: { mcpApiKeyId: key.id },
      });

      return { id: key.id, publicKey: key.publicKey, secretKey: key.secretKey };
    });

    // ---- Heartbeat: lease renewal out, cancel signal back, one query. ----
    let heartbeatInFlight = false;
    heartbeatTimer = setInterval(() => {
      if (heartbeatInFlight || abortController.signal.aborted) return;
      heartbeatInFlight = true;
      heartbeatClaimedRun({ prisma, projectId, runId })
        .then((result) => {
          if (result.fenced) {
            abortController.abort("fenced" satisfies AbortReason);
          } else if (result.cancelRequestedAt) {
            abortController.abort("cancelled" satisfies AbortReason);
          }
        })
        .catch((error) =>
          logger.error("In-app agent heartbeat failed", {
            error,
            projectId,
            runId,
          }),
        )
        .finally(() => {
          heartbeatInFlight = false;
        });
    }, IN_APP_AGENT_HEARTBEAT_INTERVAL_MS);

    // ---- Run the loop; persistence via onEvent, no consumer for the SSE text. ----
    const pendingPersistedEvents: AgUiEvent[] = [];
    const flushPersistedRunEvents = (
      finish?: Parameters<typeof flushPendingRunEvents>[0]["finish"],
    ) =>
      flushPendingRunEvents({
        prisma,
        projectId,
        conversationId: conversation.id,
        runId,
        pendingEvents: pendingPersistedEvents,
        finish,
      });

    let interruptRequest: InAppAgentToolApprovalRequest | undefined;

    const userAccess: InAppAgentUserAccess = {
      projectRole: access.projectRole,
      isAdmin: access.isAdmin,
    };

    const stream = await createAgUiStream({
      input: agentInput,
      signal: abortController.signal,
      options: {
        onEvent: async (event) => {
          const parsedInterrupt = parseInAppAgentInterruptEvent(event);

          if (parsedInterrupt) {
            // Background approvals live on the run row + this persisted raw
            // interrupt event (no side table). toPersistableAgentEvent drops
            // CUSTOM events, so the row is pushed directly; the message
            // accumulators skip CUSTOM rows, so replay/display are unchanged.
            interruptRequest = parsedInterrupt;
            pendingPersistedEvents.push(event);
            return;
          }

          const persistedEvent = toPersistableAgentEvent(event);

          if (!persistedEvent || persistedEvent.type === "RUN_STARTED") {
            return;
          }

          // The flag flips only when the result event is queued for
          // persistence — deliberately NOT via onApprovedToolCallExecuted,
          // which fires at execution time, before the adapter
          // teardown/recreate window in which a crash would leave the
          // executed mutation unrecorded.
          if (
            persistedEvent.type === "TOOL_CALL_RESULT" &&
            persistedEvent.toolCallId === approvalRequest?.toolCallId
          ) {
            approvedToolResultPersisted = true;
          }

          pendingPersistedEvents.push(persistedEvent);

          if (!shouldFlushPersistedEvent(persistedEvent)) {
            return;
          }

          return flushPersistedRunEvents();
        },
        onComplete: async () => {
          await flushPersistedRunEvents(
            interruptRequest
              ? { status: InAppAgentRunStatus.AWAITING_APPROVAL }
              : { status: InAppAgentRunStatus.SUCCEEDED },
          );
          await maybeInferAndPersistConversationTitle({
            prisma,
            projectId,
            conversationId: conversation.id,
            userId: run.triggeredByUserId!,
            aiTelemetryEnabled: project.organization.aiTelemetryEnabled,
          }).catch((error) =>
            logger.error("Failed to infer in-app agent conversation title", {
              error,
              projectId,
              runId,
            }),
          );
        },
        onAbort: async () => {
          const reason = abortController.signal.reason as AbortReason;

          if (reason === "fenced") {
            // The run was reconciled away; its outcome is already recorded
            // and this worker lost ownership — no terminal CAS.
            return;
          }

          if (reason === "cancelled") {
            // The unrecorded-outcome window is cause-agnostic: a cancel can
            // interrupt an approved mutation mid-flight just like a deploy,
            // and recording plain CANCELLED would read as "nothing happened".
            const unknownOutcome = failureCode();

            await flushPersistedRunEvents(
              unknownOutcome
                ? { status: InAppAgentRunStatus.FAILED, ...unknownOutcome }
                : {
                    status: InAppAgentRunStatus.CANCELLED,
                    errorCode: InAppAgentRunErrorCode.CANCELLED,
                    errorMessage: "Run cancelled by user request",
                  },
            );
            return;
          }

          await flushPersistedRunEvents({
            status: InAppAgentRunStatus.FAILED,
            ...(failureCode() ?? {
              errorCode: InAppAgentRunErrorCode.WORKER_SHUTDOWN,
              errorMessage: "The run was interrupted by a deploy",
            }),
          });
        },
        onError: async (error) => {
          await flushPersistedRunEvents({
            status: InAppAgentRunStatus.FAILED,
            ...(failureCode() ?? {
              errorCode: InAppAgentRunErrorCode.AGENT_ERROR,
              errorMessage:
                error instanceof Error ? error.message : "Unknown agent error",
            }),
          });
        },
        onFinish: async () => {
          await cleanupMcpApiKeyLogged();
          await sandboxState?.onTurnEnded();
        },
        awsBedrock: {
          region: sharedEnv.LANGFUSE_AWS_BEDROCK_REGION,
          modelId: bedrockModelId,
          ...(sharedEnv.LANGFUSE_IN_APP_AGENT_AWS_PROFILE
            ? { profile: sharedEnv.LANGFUSE_IN_APP_AGENT_AWS_PROFILE }
            : {}),
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
          isV4Enabled: access.v4BetaEnabled,
        },
        langfuseClient: getInAppAgentPromptClient(),
        useLocalPrompt: env.NODE_ENV === "development",
        langfuseTracing: buildTracingConfig({
          aiTelemetryEnabled: project.organization.aiTelemetryEnabled,
          projectId,
          conversationId: conversation.id,
          runId,
          user: {
            id: run.triggeredByUserId,
            email: access.email,
            projectRole: userAccess.projectRole,
            isAdmin: userAccess.isAdmin,
          },
        }),
        sandbox: sandboxState?.sandbox,
      },
    });

    agentLoopStarted = true;
    await drainStream(stream);
  } catch (error) {
    // Two classes land here: pre-loop failures (revalidation, input build,
    // key minting) and loop failures surfaced through the errored stream —
    // failStream fires the loop's onError without awaiting it and errors the
    // stream synchronously, so this catch can RACE that onError and win the
    // terminal CAS. Both writers therefore classify identically: the
    // durability check first, then agent_error for loop-phase failures and
    // init_failed only before the loop existed.
    await finishClaimedRun({
      prisma,
      projectId,
      runId,
      status: InAppAgentRunStatus.FAILED,
      ...(failureCode() ?? {
        errorCode: agentLoopStarted
          ? InAppAgentRunErrorCode.AGENT_ERROR
          : InAppAgentRunErrorCode.INIT_FAILED,
        errorMessage:
          error instanceof Error
            ? error.message
            : "Agent initialization failed",
      }),
    });
    await cleanupMcpApiKeyLogged();

    if (!(error instanceof InAppAgentRunInitError)) {
      throw error;
    }
  } finally {
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    activeRunAborts.delete(abortController);
  }
}

async function resolveUserProjectAccess(params: {
  userId: string;
  projectId: string;
  orgId: string;
}): Promise<{
  projectRole?: Role;
  isAdmin: boolean;
  email: string | null;
  v4BetaEnabled: boolean;
} | null> {
  const user = await prisma.user.findUnique({
    where: { id: params.userId },
    select: { id: true, email: true, admin: true, v4BetaEnabled: true },
  });

  if (!user) return null;

  if (user.admin) {
    return {
      isAdmin: true,
      email: user.email,
      v4BetaEnabled: user.v4BetaEnabled,
    };
  }

  const orgMembership = await prisma.organizationMembership.findFirst({
    where: { userId: params.userId, orgId: params.orgId },
  });

  if (!orgMembership) return null;

  const projectMembership = await prisma.projectMembership.findFirst({
    where: {
      userId: params.userId,
      projectId: params.projectId,
      orgMembershipId: orgMembership.id,
    },
  });

  const projectRole = projectMembership?.role ?? orgMembership.role;

  if (projectRole === Role.NONE) return null;

  return {
    projectRole,
    isAdmin: false,
    email: user.email,
    v4BetaEnabled: user.v4BetaEnabled,
  };
}

function findPersistedApprovalRequest(
  events: readonly PersistedConversationEvent[],
  request: Extract<InAppAgentRunRequest, { kind: "approvalDecision" }>,
): InAppAgentToolApprovalRequest | undefined {
  // Zero-trust: the decision mutation stores only IDs; tool name and args are
  // read back from the interrupt event the parent run persisted.
  for (const { event, runId } of events) {
    if (runId !== request.parentRunId) continue;

    const approvalRequest = parseInAppAgentInterruptEvent(event);

    if (approvalRequest?.toolCallId === request.toolCallId) {
      return approvalRequest;
    }
  }

  return undefined;
}

function getRegistryToolName(toolName: string | undefined) {
  if (!toolName?.startsWith("langfuse_")) {
    return undefined;
  }

  const registryToolName = toolName.slice("langfuse_".length);

  return isMcpToolName(registryToolName) ? registryToolName : undefined;
}

function getLangfuseMcpUrl(): string {
  if (!env.NEXTAUTH_URL) {
    throw new InAppAgentRunInitError(
      "NEXTAUTH_URL must be configured to derive the MCP endpoint",
    );
  }

  const rawUrl = env.NEXTAUTH_URL.replace(/\/api\/auth\/?$/, "");
  const baseUrl = new URL(rawUrl);

  baseUrl.pathname = `${baseUrl.pathname.replace(/\/$/, "")}/api/public/mcp`;
  baseUrl.search = "";
  baseUrl.hash = "";

  return baseUrl.toString();
}

function buildTracingConfig(params: {
  aiTelemetryEnabled: boolean;
  projectId: string;
  conversationId: string;
  runId: string;
  user: {
    id: string;
    email: string | null;
    projectRole?: Role;
    isAdmin: boolean;
  };
}) {
  if (!params.aiTelemetryEnabled) {
    return undefined;
  }

  const traceSinkParams = getLangfuseAITraceSinkParams({
    environment: "langfuse-in-app-agent",
    feature: "in-app-agent",
    projectId: params.projectId,
    traceId: getInAppAgentInstrumentationTraceId(params.runId),
    traceName: "agent-turn",
    userId: params.user.id,
    metadata: {
      langfuse_ai_feature: "in-app-agent",
      langfuse_user_id: params.user.id,
      langfuse_project_id: params.projectId,
      conversation_id: params.conversationId,
      run_id: params.runId,
      cloud_region: env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION,
      execution_runtime: "worker",
    },
  });

  return traceSinkParams
    ? {
        targetProjectId: traceSinkParams.targetProjectId,
        environment: traceSinkParams.environment,
        runId: params.runId,
        user: {
          id: params.user.id,
          email: params.user.email,
          projectRole: params.user.projectRole,
          isAdmin: params.user.isAdmin,
        },
        metadata: traceSinkParams.metadata ?? {},
      }
    : undefined;
}

async function drainStream(stream: {
  getReader: () => { read: () => Promise<{ done: boolean }> };
}): Promise<void> {
  const reader = stream.getReader();

  // The SSE frames have no consumer on the background path; reading drives
  // the loop to completion and the onEvent callbacks persist everything.
  for (;;) {
    const { done } = await reader.read();
    if (done) return;
  }
}
