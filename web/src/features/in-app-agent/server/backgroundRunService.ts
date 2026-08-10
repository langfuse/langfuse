import { EventType } from "@ag-ui/core";
import { randomUUID } from "crypto";

import {
  BaseError,
  InAppAgentRunErrorCode,
  InAppAgentRunStatus,
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
  AgUiRunFinishedOutcomeSchema,
  parseInAppAgentApprovalDecisionEvent,
  type AgUiRunAgentInput,
  type InAppAgentApprovalResumeEntry,
} from "@langfuse/shared/in-app-agent";
import {
  getInAppAgentApprovalInterruptId,
  parseInAppAgentInterruptEvent,
  parseInAppAgentStructuredInterrupt,
} from "@langfuse/shared/in-app-agent/server/human-in-the-loop";
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
  createQueuedRun,
  decideToolApproval,
  decideToolApprovalBatch,
  findToolApprovalBatchContinuation,
  getInAppAgentApprovalBatchFingerprint,
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
    request: { kind: "userMessage", turnId: runId, context },
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

  const approvalRequest = events.find(
    (persisted) =>
      persisted.runId === params.runId &&
      parseInAppAgentInterruptEvent(persisted.event)?.toolCallId ===
        params.toolCallId,
  );

  if (!approvalRequest) {
    throw new LangfuseNotFoundError("Approval request not found");
  }

  // Resolve the granted tool from the persisted interrupt, never client input.
  const alwaysAllowToolName =
    params.approvalScope === "conversation" && params.approved
      ? getInAppAgentPrefixedToolName(
          parseInAppAgentInterruptEvent(approvalRequest.event)?.toolName,
        )
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

export async function decideBackgroundApprovalBatch(params: {
  prisma: PrismaClient;
  projectId: string;
  conversationId: string;
  runId: string;
  resume: InAppAgentApprovalResumeEntry[];
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

  const { approvalByInterruptId, openInterruptIds } = getApprovalRequestsForRun(
    events,
    params.runId,
  );
  if (openInterruptIds.length === 0) {
    throw new LangfuseNotFoundError("Approval request not found");
  }
  const alwaysAllowToolNamesByInterruptId = Object.fromEntries(
    params.resume.flatMap((entry) => {
      if (
        !entry.payload.approved ||
        entry.payload.approvalScope !== "conversation"
      ) {
        return [];
      }
      const approval = approvalByInterruptId.get(entry.interruptId);
      const toolName = getInAppAgentPrefixedToolName(approval?.toolName);
      return toolName ? [[entry.interruptId, toolName] as const] : [];
    }),
  );
  const continuationRunId = createInAppAgentRunId();
  const { run: continuationRun, shouldEnqueue } = await decideToolApprovalBatch(
    {
      prisma: params.prisma,
      projectId: params.projectId,
      conversationId: params.conversationId,
      interruptedRunId: params.runId,
      continuationRunId,
      openInterruptIds,
      resume: params.resume,
      toolCallIdsByInterruptId: Object.fromEntries(
        [...approvalByInterruptId].map(([interruptId, approval]) => [
          interruptId,
          approval.toolCallId,
        ]),
      ),
      alwaysAllowToolNamesByInterruptId,
      decidedByUserId: params.userId,
      model: params.model,
    },
  );

  if (shouldEnqueue) {
    if (continuationRun.id !== continuationRunId) {
      await removeInAppAgentRunJob(continuationRun.id);
    }
    await enqueueInAppAgentRun({
      prisma: params.prisma,
      projectId: params.projectId,
      runId: continuationRun.id,
    });
  }

  return { runId: continuationRun.id };
}

export async function getBackgroundApprovalBatchReplay(params: {
  prisma: PrismaClient;
  projectId: string;
  conversationId: string;
  runId: string;
  resume: InAppAgentApprovalResumeEntry[];
  userId: string;
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
  const { openInterruptIds } = getApprovalRequestsForRun(events, params.runId);
  if (openInterruptIds.length === 0) {
    return null;
  }

  const { batchFingerprint } = getInAppAgentApprovalBatchFingerprint({
    openInterruptIds,
    resume: params.resume,
  });
  const continuation = await findToolApprovalBatchContinuation({
    prisma: params.prisma,
    projectId: params.projectId,
    conversationId: params.conversationId,
    interruptedRunId: params.runId,
    batchFingerprint,
  });
  if (!continuation) {
    return null;
  }

  return {
    requiresCapacity:
      continuation.status === InAppAgentRunStatus.FAILED &&
      continuation.errorCode === InAppAgentRunErrorCode.ENQUEUE_FAILED,
  };
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

  return [...parkedRunIds].flatMap((runId) => {
    const { approvalByInterruptId, openInterruptIds } =
      getApprovalRequestsForRun(events, runId);

    return openInterruptIds.flatMap((interruptId) => {
      const approvalRequest = approvalByInterruptId.get(interruptId);
      return approvalRequest &&
        !decidedToolCallIds.has(approvalRequest.toolCallId)
        ? [{ runId, approvalRequest }]
        : [];
    });
  });
}

function getApprovalRequestsForRun(
  events: readonly PersistedConversationEvent[],
  runId: string,
) {
  const approvalByInterruptId = new Map(
    events.flatMap((persisted) => {
      if (persisted.runId !== runId) {
        return [];
      }
      const approvalRequest = parseInAppAgentInterruptEvent(persisted.event);
      return approvalRequest
        ? [
            [
              getInAppAgentApprovalInterruptId(approvalRequest),
              approvalRequest,
            ] as const,
          ]
        : [];
    }),
  );
  const structuredInterrupts = events.flatMap((persisted) => {
    if (
      persisted.runId !== runId ||
      persisted.event.type !== EventType.RUN_FINISHED
    ) {
      return [];
    }
    const outcome = AgUiRunFinishedOutcomeSchema.safeParse(
      persisted.event.outcome,
    );
    return outcome.success && outcome.data.type === "interrupt"
      ? [outcome.data.interrupts]
      : [];
  })[0];

  for (const interrupt of structuredInterrupts ?? []) {
    const approvalRequest = parseInAppAgentStructuredInterrupt(interrupt);
    if (approvalRequest) {
      approvalByInterruptId.set(interrupt.id, approvalRequest);
    }
  }

  return {
    approvalByInterruptId,
    openInterruptIds: structuredInterrupts?.map(
      (interrupt) => interrupt.id,
    ) ?? [...approvalByInterruptId.keys()],
  };
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
