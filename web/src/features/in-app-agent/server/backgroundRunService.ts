import { EventType } from "@ag-ui/core";
import { randomUUID } from "crypto";

import { BaseError, LangfuseNotFoundError, type Plan } from "@langfuse/shared";
import { Prisma, type PrismaClient } from "@langfuse/shared/src/db";
import {
  InAppAgentRunQueue,
  logger,
  QueueJobs,
  redis,
} from "@langfuse/shared/src/server";
import { deleteInAppAgentMcpApiKeyFromDb } from "@langfuse/shared/src/server/auth/apiKeys";
import {
  InAppAgentRunErrorCode,
  InAppAgentRunStatus,
  InAppAgentRunStatusSchema,
  parseInAppAgentApprovalDecisionEvent,
  parseInAppAgentInterruptEvent,
  type AgUiContext,
} from "@langfuse/shared/in-app-agent";
import { getInAppAgentPrefixedToolName } from "@langfuse/shared/in-app-agent/server/mcpPolicy";
import { createInAppAgentMessageId, createInAppAgentRunId } from "../ids";
import {
  ensureOwnedConversation,
  getConversationEvents,
  getOwnedConversationOrThrow,
  maybeInferAndPersistConversationTitle,
  serializeConversation,
  type PersistedConversationEvent,
} from "@langfuse/shared/in-app-agent/server/persistence";
import {
  cancelConversationRunsInTransaction,
  cleanupTerminalRunMcpApiKeys,
  classifyStaleRun,
  createQueuedRun,
  decideToolApproval,
  reconcileConversationRuns,
  recordImmediateCancelOutcomes,
  requestRunCancellation,
} from "@langfuse/shared/in-app-agent/server/runLifecycle";

import { serializeInAppAgentDisplayState } from "@/src/features/in-app-agent/lib/display";
import { assertInAppAgentRunCapacity } from "@/src/features/in-app-agent/server/runCapacity";
import { resolveInAppAgentRunContext } from "@/src/features/in-app-agent/server/runContext";
import { getConversationSnapshotFromEvents } from "@/src/features/in-app-agent/server/conversationSnapshot";

export async function getBackgroundConversationSnapshot(params: {
  prisma: PrismaClient;
  projectId: string;
  conversationId: string;
  userId: string;
}) {
  const conversation = await getOwnedConversationOrThrow({
    ...params,
  });

  await reconcileConversationRuns({
    prisma: params.prisma,
    projectId: params.projectId,
    conversationId: params.conversationId,
  });

  await cleanupTerminalRunMcpApiKeys({
    prisma: params.prisma,
    projectId: params.projectId,
    conversationId: params.conversationId,
    deleteApiKey: async (apiKeyId) => {
      await deleteInAppAgentMcpApiKeyFromDb({
        prisma: params.prisma,
        id: apiKeyId,
        projectId: params.projectId,
        redis,
      });
    },
  });

  // The worker commits terminal status and its final events atomically. Keep
  // both reads on one version so the cursor cannot describe an older prefix.
  const [events, runs] = await params.prisma.$transaction(
    (tx) =>
      Promise.all([
        getConversationEvents({
          prisma: tx,
          projectId: params.projectId,
          conversationId: params.conversationId,
        }),
        tx.inAppAgentRun.findMany({
          where: {
            projectId: params.projectId,
            conversationId: params.conversationId,
          },
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            status: true,
            errorCode: true,
            cancelRequestedAt: true,
          },
        }),
      ]),
    { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
  );
  const { messages, displayState } = getConversationSnapshotFromEvents(events);

  const latestRun = runs.at(-1) ?? null;

  return {
    conversation: serializeConversation(conversation),
    messages,
    displayState: serializeInAppAgentDisplayState(displayState),
    eventCursor: events.reduce(
      (max, event) => Math.max(max, event.sequenceNumber),
      -1,
    ),
    latestRun:
      latestRun && latestRun.status
        ? {
            id: latestRun.id,
            status: latestRun.status as InAppAgentRunStatus,
            errorCode: latestRun.errorCode,
            cancelRequested: Boolean(latestRun.cancelRequestedAt),
          }
        : null,
    pendingToolApprovals: getPendingToolApprovals(
      events,
      new Set(
        runs
          .filter((run) => run.status === InAppAgentRunStatus.AWAITING_APPROVAL)
          .map((run) => run.id),
      ),
    ),
    state: {
      type: "existingConversation" as const,
      projectId: params.projectId,
      conversationId: params.conversationId,
    },
  };
}

export type ConversationLatestRunSummary = {
  id: string;
  status: InAppAgentRunStatus;
  errorCode: string | null;
  cancelRequested: boolean;
};

/** Compact newest-run summary for list rows. Stale overlay is read-only. */
export function serializeConversationLatestRun(
  run:
    | {
        id: string;
        status: string | null;
        errorCode: string | null;
        cancelRequestedAt: Date | null;
        createdAt: Date;
        claimedAt: Date | null;
        heartbeatAt: Date | null;
        finishedAt: Date | null;
      }
    | null
    | undefined,
): ConversationLatestRunSummary | null {
  if (!run) {
    return null;
  }

  const parsedStatus = InAppAgentRunStatusSchema.safeParse(run.status);
  if (!parsedStatus.success) {
    return null;
  }

  const stale = classifyStaleRun(run, Date.now());

  return {
    id: run.id,
    status: stale ? InAppAgentRunStatus.FAILED : parsedStatus.data,
    errorCode: stale ? stale.errorCode : run.errorCode,
    cancelRequested: Boolean(run.cancelRequestedAt),
  };
}

export async function startBackgroundRun(params: {
  prisma: PrismaClient;
  projectId: string;
  orgId: string;
  plan: Plan;
  conversationId: string;
  userId: string;
  message: string;
  context: AgUiContext;
  isV4Enabled: boolean;
  model: string | undefined;
  aiTelemetryEnabled: boolean;
}) {
  const conversation = await ensureOwnedConversation({
    prisma: params.prisma,
    projectId: params.projectId,
    conversationId: params.conversationId,
    userId: params.userId,
  });

  // Reconcile before counting capacity: this turn is allowed to replace a run
  // of its own conversation that already lost its worker or timed out, which
  // `createQueuedRun` does under the lock further down. Counting that row would
  // reject the replacement with a ceiling error instead. Ownership is verified
  // above first, because reconciliation writes.
  await reconcileConversationRuns({
    prisma: params.prisma,
    projectId: params.projectId,
    conversationId: conversation.id,
  });
  await assertInAppAgentRunCapacity({
    prisma: params.prisma,
    orgId: params.orgId,
    plan: params.plan,
    userId: params.userId,
  });

  if (!params.model) {
    throw new BaseError(
      "PreconditionFailedError",
      412,
      "Assistant model is not configured.",
      true,
    );
  }

  const context = await resolveInAppAgentRunContext({
    context: params.context,
    projectId: params.projectId,
    isV4Enabled: params.isV4Enabled,
  });
  const runId = createInAppAgentRunId();
  const userMessage = {
    id: createInAppAgentMessageId(),
    role: "user" as const,
    content: params.message,
  };
  const run = await createQueuedRun({
    prisma: params.prisma,
    runId,
    projectId: params.projectId,
    conversationId: conversation.id,
    triggeredByUserId: params.userId,
    model: params.model,
    request: { kind: "userMessage", context },
    runStartedEvent: {
      type: EventType.RUN_STARTED,
      threadId: conversation.id,
      runId,
      input: {
        threadId: conversation.id,
        runId,
        state: null,
        messages: [userMessage],
        tools: [],
        context,
        forwardedProps: {},
      },
    },
  });

  await enqueueInAppAgentRun({
    prisma: params.prisma,
    projectId: params.projectId,
    runId: run.id,
  });

  maybeInferAndPersistConversationTitle({
    prisma: params.prisma,
    projectId: params.projectId,
    conversationId: conversation.id,
    userId: params.userId,
    aiTelemetryEnabled: params.aiTelemetryEnabled,
  });

  return { conversationId: conversation.id, runId: run.id };
}

/** Soft-delete a conversation and cancel its unsettled runs atomically. */
export async function deleteBackgroundConversation(params: {
  prisma: PrismaClient;
  projectId: string;
  conversationId: string;
  userId: string;
}) {
  await getOwnedConversationOrThrow({
    prisma: params.prisma,
    projectId: params.projectId,
    conversationId: params.conversationId,
    userId: params.userId,
  });

  const cancelledRuns = await params.prisma.$transaction(async (tx) => {
    const cancelledImmediately = await cancelConversationRunsInTransaction({
      tx,
      projectId: params.projectId,
      conversationId: params.conversationId,
    });

    await tx.inAppAgentConversation.update({
      where: {
        id_projectId: {
          id: params.conversationId,
          projectId: params.projectId,
        },
      },
      data: {
        providerSessionId: null,
        deletedAt: new Date(),
      },
    });

    return cancelledImmediately;
  });

  recordImmediateCancelOutcomes(cancelledRuns);

  // Avoid spending a worker slot on jobs whose runs are already cancelled.
  await Promise.all(
    cancelledRuns.map((run) => removeInAppAgentRunJob(run.runId)),
  );

  return { success: true };
}

export async function cancelBackgroundRun(params: {
  prisma: PrismaClient;
  projectId: string;
  conversationId: string;
  runId: string;
  userId: string;
}) {
  await getOwnedConversationOrThrow({
    prisma: params.prisma,
    projectId: params.projectId,
    conversationId: params.conversationId,
    userId: params.userId,
  });

  const result = await requestRunCancellation({
    prisma: params.prisma,
    projectId: params.projectId,
    conversationId: params.conversationId,
    runId: params.runId,
  });

  if (result.cancelledImmediately) {
    await removeInAppAgentRunJob(params.runId);
  }

  return result;
}

export async function decideBackgroundApproval(params: {
  prisma: PrismaClient;
  projectId: string;
  conversationId: string;
  runId: string;
  toolCallId: string;
  approved: boolean;
  approvalScope?: "once" | "conversation";
  userId: string;
  model: string | undefined;
}) {
  await getOwnedConversationOrThrow({
    prisma: params.prisma,
    projectId: params.projectId,
    conversationId: params.conversationId,
    userId: params.userId,
  });

  const events = await getConversationEvents({
    prisma: params.prisma,
    projectId: params.projectId,
    conversationId: params.conversationId,
  });

  let approvalRequest: ReturnType<typeof parseInAppAgentInterruptEvent>;
  for (const persisted of events) {
    if (persisted.runId !== params.runId) {
      continue;
    }

    const parsedRequest = parseInAppAgentInterruptEvent(persisted.event);
    if (parsedRequest?.toolCallId === params.toolCallId) {
      approvalRequest = parsedRequest;
      break;
    }
  }

  if (!approvalRequest) {
    throw new LangfuseNotFoundError("Approval request not found");
  }

  // Resolve the granted tool from the persisted interrupt, never client input.
  const alwaysAllowToolName =
    params.approvalScope === "conversation" && params.approved
      ? getInAppAgentPrefixedToolName(approvalRequest.toolName)
      : undefined;

  const continuationRun = await decideToolApproval({
    prisma: params.prisma,
    projectId: params.projectId,
    conversationId: params.conversationId,
    parentRunId: params.runId,
    continuationRunId: createInAppAgentRunId(),
    toolCallId: params.toolCallId,
    approved: params.approved,
    alwaysAllowToolName,
    decidedByUserId: params.userId,
    model: params.model,
  });

  await enqueueInAppAgentRun({
    prisma: params.prisma,
    projectId: params.projectId,
    runId: continuationRun.id,
  });

  return { runId: continuationRun.id };
}

function getPendingToolApprovals(
  events: readonly PersistedConversationEvent[],
  parkedRunIds: ReadonlySet<string>,
) {
  const decidedToolCallIds = new Set(
    events.flatMap((persisted) => {
      const decision = parseInAppAgentApprovalDecisionEvent(persisted.event);
      return decision ? [decision.toolCallId] : [];
    }),
  );

  return events.flatMap((persisted) => {
    const approvalRequest = parseInAppAgentInterruptEvent(persisted.event);

    return approvalRequest &&
      parkedRunIds.has(persisted.runId) &&
      !decidedToolCallIds.has(approvalRequest.toolCallId)
      ? [{ runId: persisted.runId, approvalRequest }]
      : [];
  });
}

async function enqueueInAppAgentRun(params: {
  prisma: PrismaClient;
  projectId: string;
  runId: string;
}) {
  try {
    const queue = InAppAgentRunQueue.getInstance();

    if (!queue) {
      throw new Error("In-app agent run queue is unavailable");
    }

    await queue.add(
      QueueJobs.InAppAgentRunJob,
      {
        timestamp: new Date(),
        id: randomUUID(),
        name: QueueJobs.InAppAgentRunJob,
        payload: { projectId: params.projectId, runId: params.runId },
      },
      { jobId: params.runId },
    );
  } catch (error) {
    logger.error("Failed to enqueue in-app agent run", {
      error,
      projectId: params.projectId,
      runId: params.runId,
    });

    await params.prisma.inAppAgentRun.updateMany({
      where: {
        id: params.runId,
        projectId: params.projectId,
        status: InAppAgentRunStatus.QUEUED,
      },
      data: {
        status: InAppAgentRunStatus.FAILED,
        finishedAt: new Date(),
        errorCode: InAppAgentRunErrorCode.ENQUEUE_FAILED,
        errorMessage: "Couldn't start the run",
      },
    });

    throw new BaseError(
      "InternalServerError",
      500,
      "Couldn't start the run. Try again.",
      true,
    );
  }
}

async function removeInAppAgentRunJob(runId: string) {
  try {
    await InAppAgentRunQueue.getInstance()?.remove(runId);
  } catch (error) {
    logger.info("Failed to remove cancelled in-app agent run job", {
      error,
      runId,
    });
  }
}
