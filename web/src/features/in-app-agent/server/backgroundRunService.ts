import { EventType } from "@ag-ui/core";
import { randomUUID } from "crypto";

import {
  BaseError,
  InAppAgentRunErrorCode,
  InAppAgentRunStatus,
  LangfuseNotFoundError,
} from "@langfuse/shared";
import type { PrismaClient } from "@langfuse/shared/src/db";
import {
  InAppAgentRunQueue,
  logger,
  QueueJobs,
  redis,
} from "@langfuse/shared/src/server";
import { deleteApiKeyFromDb } from "@langfuse/shared/src/server/auth/apiKeys";
import {
  createInAppAgentMessageId,
  createInAppAgentRunId,
  parseInAppAgentApprovalDecisionEvent,
  type AgUiRunAgentInput,
} from "@langfuse/shared/in-app-agent";
import { parseInAppAgentInterruptEvent } from "@langfuse/shared/in-app-agent/server/human-in-the-loop";
import {
  ensureOwnedConversation,
  getConversationEvents,
  getConversationMessagesForDisplayFromEvents,
  getOwnedConversationOrThrow,
  isInAppAgentConversationWriteLocked,
  maybeInferAndPersistConversationTitle,
  serializeConversation,
  type PersistedConversationEvent,
} from "@langfuse/shared/in-app-agent/server/persistence";
import {
  cleanupTerminalRunMcpApiKeys,
  createQueuedRun,
  decideToolApproval,
  reconcileConversationRuns,
  requestRunCancellation,
} from "@langfuse/shared/in-app-agent/server/runLifecycle";

import { resolveInAppAgentRunContext } from "@/src/features/in-app-agent/server/runContext";

const SANDBOX_CONVERSATION_WRITE_LOCK_MESSAGE =
  "Sandbox-enabled conversations become read-only after 8 hours. Start a new conversation to continue.";

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
      await deleteApiKeyFromDb({
        prisma: params.prisma,
        id: apiKeyId,
        entityId: params.projectId,
        scope: "PROJECT",
        redis,
      });
    },
  });

  const [events, runs] = await Promise.all([
    getConversationEvents({
      prisma: params.prisma,
      projectId: params.projectId,
      conversationId: params.conversationId,
    }),
    params.prisma.inAppAgentRun.findMany({
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
  ]);
  const messages = getConversationMessagesForDisplayFromEvents(events);

  const latestRun = runs.at(-1) ?? null;

  return {
    conversation: serializeConversation(conversation, {
      isWriteLocked: isInAppAgentConversationWriteLocked({
        conversation,
        events,
      }),
    }),
    messages,
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

export async function startBackgroundRun(params: {
  prisma: PrismaClient;
  projectId: string;
  conversationId: string;
  userId: string;
  message: string;
  context: AgUiRunAgentInput["context"];
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
  const events = await getConversationEvents({
    prisma: params.prisma,
    projectId: params.projectId,
    conversationId: params.conversationId,
  });

  if (isInAppAgentConversationWriteLocked({ conversation, events })) {
    throw new BaseError(
      "PreconditionFailedError",
      412,
      SANDBOX_CONVERSATION_WRITE_LOCK_MESSAGE,
      true,
    );
  }

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

  return { runId: run.id };
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
  userId: string;
  model: string | undefined;
}) {
  const conversation = await getOwnedConversationOrThrow({
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

  if (isInAppAgentConversationWriteLocked({ conversation, events })) {
    throw new BaseError(
      "PreconditionFailedError",
      412,
      SANDBOX_CONVERSATION_WRITE_LOCK_MESSAGE,
      true,
    );
  }

  const approvalRequest = events.find(
    (persisted) =>
      persisted.runId === params.runId &&
      parseInAppAgentInterruptEvent(persisted.event)?.toolCallId ===
        params.toolCallId,
  );

  if (!approvalRequest) {
    throw new LangfuseNotFoundError("Approval request not found");
  }

  const continuationRun = await decideToolApproval({
    prisma: params.prisma,
    projectId: params.projectId,
    conversationId: params.conversationId,
    parentRunId: params.runId,
    continuationRunId: createInAppAgentRunId(),
    toolCallId: params.toolCallId,
    approved: params.approved,
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
