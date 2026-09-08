import { Role } from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import {
  getLangfuseAITraceSinkParams,
  logger,
  recordIncrement,
  redis,
  traceException,
} from "@langfuse/shared/src/server";
import {
  createAndAddApiKeysToDb,
  deleteInAppAgentMcpApiKeyFromDb,
} from "@langfuse/shared/src/server/auth/apiKeys";
import {
  InAppAgentRunErrorCode,
  InAppAgentRunRequestSchema,
  InAppAgentRunStatus,
  getInAppAgentInstrumentationTraceId,
  parseInAppAgentInterruptEvent,
  type AgUiEvent,
  type InAppAgentRunRequest,
  type InAppAgentToolApprovalRequest,
} from "@langfuse/shared/in-app-agent";
import {
  createSandboxToolCallFileAccumulator,
  flushPendingRunEvents,
  getConversationEvents,
  getConversationMessagesForReplay,
  shouldFlushPersistedEvent,
  toPersistableAgentEvent,
  type PersistedConversationEvent,
} from "@langfuse/shared/in-app-agent/server/persistence";
import {
  getInAppAgentModelConfig,
  isInAppAgentInstanceEnabled,
  LANGFUSE_AI_MODEL_UNCONFIGURED_MESSAGE,
} from "@langfuse/shared/in-app-agent/server/modelProvider";
import {
  claimQueuedRun,
  cleanupTerminalRunMcpApiKeys,
  clearRunMcpApiKeyPointer,
  finishClaimedRun,
  heartbeatClaimedRun,
  isMissingInAppAgentMcpApiKeyError,
  reconcileConversationRuns,
} from "@langfuse/shared/in-app-agent/server/runLifecycle";
import {
  buildInAppAgentToolApprovalSidecar,
  createInAppAgentMcpRunOverride,
  createInAppAgentToolPolicy,
  getInAppAgentMcpAllowedToolNames,
  getInAppAgentRegistryToolName,
  type InAppAgentUserAccess,
} from "@langfuse/shared/in-app-agent/server/mcpPolicy";
import { IN_APP_AGENT_HEARTBEAT_INTERVAL_MS } from "@langfuse/shared/in-app-agent/server/tunables";
import {
  createInAppAgentSandboxProvider,
  getDefaultInAppAgentSandboxProviderType,
} from "./runtime/sandbox/config";
import { createInAppAgentSandbox } from "./runtime/sandbox";
import { createAgUiStream } from "./runtime/agent";
import { getInAppAgentPromptClient } from "./runtime/promptClient";
import { resolveLangfuseMcpUrl } from "./resolveLangfuseMcpUrl";
import type { AgUiRunAgentInput } from "./runtime/types";

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

async function deleteInAppAgentMcpApiKey(params: {
  projectId: string;
  apiKeyId: string;
}): Promise<void> {
  try {
    await deleteInAppAgentMcpApiKeyFromDb({
      prisma,
      id: params.apiKeyId,
      projectId: params.projectId,
      redis,
    });
  } catch (error) {
    // Concurrent cleanup or a prior delete already removed the row. Treat
    // that as success so the mcpApiKeyId pointer can still be cleared.
    if (!isMissingInAppAgentMcpApiKeyError(error)) {
      throw error;
    }
  }
}

export async function executeInAppAgentRun(params: {
  projectId: string;
  runId: string;
}): Promise<void> {
  const { projectId, runId } = params;
  const awsProfile = env.AWS_PROFILE ?? env.LANGFUSE_IN_APP_AGENT_AWS_PROFILE;

  // Claim CAS: zero rows means duplicate delivery or a run reconciled away
  // while queued. Reconcile then ack — Postgres owns correctness.
  const run = await claimQueuedRun({ prisma, projectId, runId });

  if (!run) {
    logger.info("In-app agent run not claimable, acknowledging delivery", {
      projectId,
      runId,
    });

    const existing = await prisma.inAppAgentRun.findUnique({
      where: { id_projectId: { id: runId, projectId } },
      select: { conversationId: true },
    });

    if (existing) {
      await reconcileConversationRuns({
        prisma,
        projectId,
        conversationId: existing.conversationId,
      });
      await cleanupTerminalRunMcpApiKeys({
        prisma,
        projectId,
        conversationId: existing.conversationId,
        deleteApiKey: (apiKeyId) =>
          deleteInAppAgentMcpApiKey({ projectId, apiKeyId }),
      });
    }

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
  // record the terminal state.
  const failureCode = () =>
    isApprovedContinuation && !approvedToolResultPersisted
      ? {
          errorCode: InAppAgentRunErrorCode.OUTCOME_UNKNOWN,
          errorMessage:
            "The approved action may have completed. Verify before retrying.",
        }
      : undefined;

  // Single-flight (same shape as web's withInAppAgentMcpApiKeyCleanup):
  // onFinish cleans up before the stream errors, then the outer catch
  // runs after drainStream rejects and may call this again.
  const cleanupMcpApiKey = (): Promise<void> => {
    if (!mcpApiKey) return Promise.resolve();
    const keyId = mcpApiKey.id;
    mcpApiKeyCleanup ??= (async () => {
      await deleteInAppAgentMcpApiKey({ projectId, apiKeyId: keyId });
      // Pointer is nulled after delete succeeds or the key is already gone.
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
    if (!isInAppAgentInstanceEnabled()) {
      throw new InAppAgentRunInitError(
        "In-app agent is not enabled on this instance",
      );
    }

    const modelConfig = getInAppAgentModelConfig({ modelId: run.model });

    if (!modelConfig) {
      throw new InAppAgentRunInitError(LANGFUSE_AI_MODEL_UNCONFIGURED_MESSAGE);
    }

    const useBundledPrompt =
      env.NODE_ENV === "development" || !env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION;

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
      context: request.context,
      forwardedProps:
        request.kind === "approvalDecision" && approvalRequest
          ? {
              command: {
                resume: {
                  approved: request.approved,
                  continuationNumber: request.continuationNumber ?? 1,
                  ...(request.rootRunId
                    ? { rootRunId: request.rootRunId }
                    : {}),
                  ...(request.traceStartedAt
                    ? { traceStartedAt: request.traceStartedAt }
                    : {}),
                  ...(request.approvalRequestedAt
                    ? { approvalRequestedAt: request.approvalRequestedAt }
                    : {}),
                  approvalDecidedAt: run.createdAt.toISOString(),
                  approvalRequest,
                },
              },
            }
          : {},
    };

    isApprovedContinuation =
      request.kind === "approvalDecision" && request.approved;
    const approvedRegistryToolName = isApprovedContinuation
      ? getInAppAgentRegistryToolName(approvalRequest?.toolName)
      : undefined;

    const userAccess: InAppAgentUserAccess = {
      projectRole: access.projectRole,
      isAdmin: access.isAdmin,
    };

    // Rebuild each run so grants invalidated by role changes drop out.
    const toolPolicy = createInAppAgentToolPolicy({
      userAccess,
      alwaysAllowedTools: conversation.alwaysAllowedTools,
    });

    const allowedToolNames = getInAppAgentMcpAllowedToolNames(
      toolPolicy,
      approvedRegistryToolName,
    );
    const runOverride =
      allowedToolNames.length > 0
        ? await createInAppAgentMcpRunOverride({ toolNames: allowedToolNames })
        : undefined;

    // ---- Sandbox (session created/resumed lazily per tool call). ----
    const sandboxProviderType = getDefaultInAppAgentSandboxProviderType();
    const sandboxProvider =
      sandboxProviderType === null
        ? undefined
        : await createInAppAgentSandboxProvider(sandboxProviderType);

    if (sandboxProviderType === "dangerous-docker" && sandboxProvider) {
      logger.warn(
        "Using dangerous-docker in-app agent sandbox provider. This is for local development only.",
      );
    }

    const sandboxToolCallFiles =
      createSandboxToolCallFileAccumulator(conversationEvents);
    const sandboxState = sandboxProvider
      ? await createInAppAgentSandbox({
          conversationId: conversation.id,
          projectId,
          providerSessionId: conversation.providerSessionId,
          provider: sandboxProvider,
          getToolCallFiles: async () => sandboxToolCallFiles.getFiles(),
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

          if (persistedEvent.type === "TOOL_CALL_START") {
            const toolCallId =
              typeof persistedEvent.toolCallId === "string"
                ? persistedEvent.toolCallId
                : undefined;
            const toolName =
              typeof persistedEvent.toolCallName === "string"
                ? persistedEvent.toolCallName
                : undefined;
            const sidecar =
              toolCallId && toolName
                ? buildInAppAgentToolApprovalSidecar({
                    toolCallId,
                    toolName,
                    policy: toolPolicy,
                    humanApprovedToolCallId: isApprovedContinuation
                      ? approvalRequest?.toolCallId
                      : undefined,
                  })
                : undefined;

            if (sidecar) {
              pendingPersistedEvents.push(sidecar);
            }
          }

          sandboxToolCallFiles.processEvent({
            event: persistedEvent,
            runId,
            createdAt: new Date(),
          });

          if (!shouldFlushPersistedEvent(persistedEvent)) {
            return;
          }

          return flushPersistedRunEvents();
        },
        onMcpToolCallCompleted: sandboxToolCallFiles.processToolCall,
        onComplete: async (outcome) => {
          // Truncation lands on run.completed via the error code below, but that
          // only counts turns wrap-up failed to rescue. Counting every turn that
          // reached the cap is what shows the cap becoming binding before users
          // see a cut-off answer.
          if (outcome?.reachedStepLimit) {
            recordIncrement("langfuse.in_app_agent.step_limit_reached", 1);
          }
          if (outcome?.truncatedByOutputLimit) {
            recordIncrement("langfuse.in_app_agent.output_limit_reached", 1);
          }

          await flushPersistedRunEvents(
            interruptRequest
              ? { status: InAppAgentRunStatus.AWAITING_APPROVAL }
              : resolveCompletedRunFinish(outcome),
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
          // The loop may close the stream after this callback instead of
          // erroring it. Mark the job span now so Datadog APM status:error
          // still has @error.message after we ACK the BullMQ job.
          traceException(error);
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
        model: modelConfig,
        ...(awsProfile ? { awsProfile } : {}),
        langfuseMcp: {
          url: getLangfuseMcpUrl(),
          publicKey: mcpApiKey.publicKey,
          secretKey: mcpApiKey.secretKey,
          toolPolicy,
          runOverride,
        },
        redirectAction: {
          projectId,
          isV4Enabled: access.v4BetaEnabled,
        },
        useLocalPrompt: useBundledPrompt,
        ...(useBundledPrompt
          ? {}
          : { langfuseClient: getInAppAgentPromptClient() }),
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
        // History still shows this agent's own earlier writes, so it needs telling.
        sandboxWorkspaceWasReset: sandboxState?.workspaceWasReset,
      },
    });

    agentLoopStarted = true;
    await drainStream(stream);
  } catch (error) {
    // Two classes land here: pre-loop failures (revalidation, input build,
    // key minting) and loop failures surfaced through the errored stream
    // after tracing flush, onError, and onFinish. finishClaimedRun is
    // idempotent, so a second write is a no-op if onError already recorded
    // FAILED. Both writers classify identically: the durability check first,
    // then agent_error for loop-phase failures and init_failed only before
    // the loop existed.
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
    // Terminal persist succeeded; ACK so the job does not sit in the DLQ.
    // Loop failures used to rethrow. Record the APM error without failing
    // the BullMQ job. Init failures were already ACK'd and stay off
    // Error Tracking.
    if (!(error instanceof InAppAgentRunInitError)) {
      traceException(error);
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

function resolveCompletedRunFinish(outcome?: {
  truncatedByStepLimit: boolean;
  truncatedByOutputLimit: boolean;
}): NonNullable<Parameters<typeof flushPendingRunEvents>[0]["finish"]> {
  if (outcome?.truncatedByOutputLimit) {
    return {
      status: InAppAgentRunStatus.SUCCEEDED,
      errorCode: InAppAgentRunErrorCode.OUTPUT_LIMIT,
      errorMessage:
        "The response hit the model's output-token limit before a final answer",
    };
  }
  if (outcome?.truncatedByStepLimit) {
    return {
      status: InAppAgentRunStatus.SUCCEEDED,
      errorCode: InAppAgentRunErrorCode.STEP_LIMIT,
      errorMessage: "The run reached the step limit before a final answer",
    };
  }
  return { status: InAppAgentRunStatus.SUCCEEDED };
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

function getLangfuseMcpUrl(): string {
  const url = resolveLangfuseMcpUrl({
    mcpBaseUrl: env.LANGFUSE_MCP_BASE_URL,
    nextAuthUrl: env.NEXTAUTH_URL,
  });

  if (!url) {
    throw new InAppAgentRunInitError(
      "LANGFUSE_MCP_BASE_URL or NEXTAUTH_URL must be configured to derive the MCP endpoint",
    );
  }

  return url;
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
