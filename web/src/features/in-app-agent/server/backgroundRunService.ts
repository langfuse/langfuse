import { EventType } from "@ag-ui/core";
import { randomUUID } from "crypto";

import {
  BaseError,
  InAppAgentRunErrorCode,
  InAppAgentRunStatus,
  InAppAgentRunStatusSchema,
  LangfuseNotFoundError,
  type Plan,
} from "@langfuse/shared";
import { Prisma, type PrismaClient } from "@langfuse/shared/src/db";
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
  IN_APP_AGENT_UNSETTLED_RUN_STATUSES,
  parseInAppAgentApprovalDecisionEvent,
  type AgUiRunAgentInput,
} from "@langfuse/shared/in-app-agent";
import { parseInAppAgentInterruptEvent } from "@langfuse/shared/in-app-agent/server/human-in-the-loop";
import { getInAppAgentPrefixedToolName } from "@langfuse/shared/in-app-agent/server/tools";
import {
  ensureOwnedConversation,
  getConversationEvents,
  getOwnedConversationOrThrow,
  isInAppAgentConversationWriteLocked,
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
  requestRunCancellation,
} from "@langfuse/shared/in-app-agent/server/runLifecycle";

import { serializeInAppAgentDisplayState } from "@/src/features/in-app-agent/lib/display";
import { assertInAppAgentRunCapacity } from "@/src/features/in-app-agent/server/runCapacity";
import { resolveInAppAgentRunContext } from "@/src/features/in-app-agent/server/runContext";
import { getConversationSnapshotFromEvents } from "@/src/features/in-app-agent/server/conversationSnapshot";

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
    conversation: serializeConversation(conversation, {
      isWriteLocked: isInAppAgentConversationWriteLocked({
        conversation,
        events,
      }),
    }),
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

export type InAppAgentActivityRun = {
  conversationId: string;
  title: string | null;
  runId: string;
  status: InAppAgentRunStatus;
  errorCode: string | null;
  cancelRequested: boolean;
};

const IN_APP_AGENT_ACTIVITY_RUN_SELECT = {
  id: true,
  conversationId: true,
  status: true,
  errorCode: true,
  cancelRequestedAt: true,
  // Everything `classifyStaleRun` reads, carried on the row we already fetch.
  createdAt: true,
  claimedAt: true,
  heartbeatAt: true,
  finishedAt: true,
  conversation: { select: { title: true } },
} as const;

/**
 * Run summaries for the assistant's cross-conversation activity surface.
 *
 * Summaries, not transcripts: the caller renders a badge and a row indicator,
 * so it never needs the event log of a conversation it is not showing. That is
 * what lets one polled query replace one watch stream per active conversation.
 *
 * Two reads, and never a per-conversation loop:
 * - the attention set, every unsettled run the caller owns in this project;
 * - the runs the caller is still tracking, by primary key
 *   (`@@id([id, projectId])`), which is how a run that finished while the app
 *   was closed is discovered at all — it is in neither the attention set nor
 *   any in-memory state that survived the reload.
 *
 * Stale runs are classified but **not** written. A dead worker leaves a row
 * RUNNING until something reconciles it, and reconciliation is conversation
 * scoped, so without this the badge would spin forever on a conversation nobody
 * opens. Persisting the verdict stays with `reconcileConversationRuns` on the
 * read paths that already own it; polling must not write.
 */
export async function getInAppAgentActivity(params: {
  prisma: PrismaClient;
  projectId: string;
  userId: string;
  trackedRunIds: readonly string[];
}): Promise<InAppAgentActivityRun[]> {
  const ownedByCaller = {
    projectId: params.projectId,
    conversation: { createdByUserId: params.userId, deletedAt: null },
  };

  const [attentionRuns, trackedRuns] = await Promise.all([
    params.prisma.inAppAgentRun.findMany({
      where: {
        ...ownedByCaller,
        status: { in: [...IN_APP_AGENT_UNSETTLED_RUN_STATUSES] },
      },
      select: IN_APP_AGENT_ACTIVITY_RUN_SELECT,
    }),
    params.trackedRunIds.length === 0
      ? []
      : params.prisma.inAppAgentRun.findMany({
          where: { ...ownedByCaller, id: { in: [...params.trackedRunIds] } },
          select: IN_APP_AGENT_ACTIVITY_RUN_SELECT,
        }),
  ]);

  const now = Date.now();
  const byRunId = new Map<string, InAppAgentActivityRun>();

  for (const run of [...attentionRuns, ...trackedRuns]) {
    if (byRunId.has(run.id)) {
      continue;
    }

    // Legacy rows predate the status column and cannot be described.
    const parsedStatus = InAppAgentRunStatusSchema.safeParse(run.status);
    if (!parsedStatus.success) {
      continue;
    }

    const stale = classifyStaleRun(run, now);

    byRunId.set(run.id, {
      conversationId: run.conversationId,
      title: run.conversation.title,
      runId: run.id,
      status: stale ? InAppAgentRunStatus.FAILED : parsedStatus.data,
      errorCode: stale ? stale.errorCode : run.errorCode,
      cancelRequested: Boolean(run.cancelRequestedAt),
    });
  }

  return [...byRunId.values()];
}

export async function startBackgroundRun(params: {
  prisma: PrismaClient;
  projectId: string;
  orgId: string;
  plan: Plan;
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

  const cancelledRunIds = await params.prisma.$transaction(async (tx) => {
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

  // Avoid spending a worker slot on jobs whose runs are already cancelled.
  await Promise.all(cancelledRunIds.map(removeInAppAgentRunJob));

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
