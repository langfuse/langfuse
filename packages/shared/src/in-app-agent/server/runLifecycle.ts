import { LangfuseConflictError } from "../../index";
import {
  InAppAgentRunErrorCode,
  InAppAgentRunStatus,
  InAppAgentRunStatusSchema,
} from "../../features/inAppAgent/types";
import { Prisma } from "../../db";
import type { InAppAgentRun, PrismaClient } from "../../db";
import { logger } from "../../server";
import { recordRunTerminalOutcome } from "./runMetrics";
import { buildInAppAgentApprovalDecisionEvent } from "../approvalEvents";
import type { AgUiEvent } from "../schema";
import type { InAppAgentPrefixedLangfuseMcpToolName } from "./mcpPolicy";
import {
  InAppAgentRunRequestSchema,
  resolveInAppAgentRootRunId,
  type InAppAgentRunRequest,
} from "../../features/inAppAgent/types";
import {
  IN_APP_AGENT_UNSETTLED_RUN_STATUSES,
  isSettledInAppAgentRunStatus,
} from "../constants";
import {
  ACTIVE_RUN_CONFLICT_MESSAGE,
  lockConversation,
  type InAppAgentTx,
} from "./persistence";
import {
  IN_APP_AGENT_APPROVAL_TTL_MS,
  IN_APP_AGENT_HEARTBEAT_STALE_MS,
  IN_APP_AGENT_QUEUE_TIMEOUT_MS,
  IN_APP_AGENT_RUN_MAX_DURATION_MS,
} from "./tunables";

/** Postgres-owned CAS transitions shared by web and worker execution. */

export async function claimQueuedRun(params: {
  prisma: PrismaClient;
  projectId: string;
  runId: string;
}): Promise<InAppAgentRun | null> {
  const now = new Date();
  const rows = await params.prisma.inAppAgentRun.updateManyAndReturn({
    where: {
      id: params.runId,
      projectId: params.projectId,
      status: InAppAgentRunStatus.QUEUED,
      finishedAt: null,
    },
    data: {
      status: InAppAgentRunStatus.RUNNING,
      claimedAt: now,
      heartbeatAt: now,
    },
  });

  return rows[0] ?? null;
}

export type HeartbeatResult =
  /** The caller lost ownership and must stop writing. */
  { fenced: true } | { fenced: false; cancelRequestedAt: Date | null };

export async function heartbeatClaimedRun(params: {
  prisma: PrismaClient;
  projectId: string;
  runId: string;
}): Promise<HeartbeatResult> {
  const rows = await params.prisma.inAppAgentRun.updateManyAndReturn({
    where: {
      id: params.runId,
      projectId: params.projectId,
      status: InAppAgentRunStatus.RUNNING,
    },
    data: { heartbeatAt: new Date() },
    select: { cancelRequestedAt: true },
  });

  const row = rows[0];

  return row
    ? { fenced: false, cancelRequestedAt: row.cancelRequestedAt }
    : { fenced: true };
}

export type TerminalRunStatus =
  | InAppAgentRunStatus.SUCCEEDED
  | InAppAgentRunStatus.FAILED
  | InAppAgentRunStatus.CANCELLED
  | InAppAgentRunStatus.AWAITING_APPROVAL;

/** Terminal CAS; a false result fences a worker that lost ownership. */
export async function finishClaimedRun(params: {
  prisma: PrismaClient;
  projectId: string;
  runId: string;
  status: TerminalRunStatus;
  errorCode?: InAppAgentRunErrorCode;
  errorMessage?: string;
}): Promise<boolean> {
  const { count } = await params.prisma.inAppAgentRun.updateMany({
    where: {
      id: params.runId,
      projectId: params.projectId,
      status: InAppAgentRunStatus.RUNNING,
      finishedAt: null,
    },
    data: {
      status: params.status,
      finishedAt: new Date(),
      errorCode: params.errorCode ?? null,
      errorMessage: params.errorMessage ?? null,
    },
  });

  if (count > 0 && isSettledInAppAgentRunStatus(params.status)) {
    recordRunTerminalOutcome({
      status: params.status,
      errorCode: params.errorCode ?? null,
    });
  }

  return count > 0;
}

/** Clear the MCP-key pointer only after deletion succeeds. */
export async function clearRunMcpApiKeyPointer(params: {
  prisma: PrismaClient;
  projectId: string;
  runId: string;
}): Promise<void> {
  await params.prisma.inAppAgentRun.updateMany({
    where: { id: params.runId, projectId: params.projectId },
    data: { mcpApiKeyId: null },
  });
}

/**
 * Atomically reconcile, enforce one active run, create QUEUED, and append its
 * input event. A retry after a lost response observes the active-run conflict.
 */
export async function createQueuedRun(params: {
  prisma: PrismaClient;
  runId: string;
  projectId: string;
  conversationId: string;
  triggeredByUserId: string;
  model?: string;
  request: InAppAgentRunRequest;
  runStartedEvent: AgUiEvent;
}): Promise<InAppAgentRun> {
  const { run, reconciled, supersededCount } = await params.prisma.$transaction(
    async (tx) => {
      await lockConversation(tx, params.projectId, params.conversationId);

      const reconciled = await reconcileConversationRunsInTransaction({
        tx,
        projectId: params.projectId,
        conversationId: params.conversationId,
      });

      // New input supersedes a parked approval.
      const superseded = await tx.inAppAgentRun.updateMany({
        where: {
          projectId: params.projectId,
          conversationId: params.conversationId,
          status: InAppAgentRunStatus.AWAITING_APPROVAL,
        },
        data: {
          status: InAppAgentRunStatus.CANCELLED,
          errorCode: InAppAgentRunErrorCode.APPROVAL_SUPERSEDED,
          errorMessage: "Replaced by a newer message",
        },
      });

      const activeRun = await tx.inAppAgentRun.findFirst({
        where: {
          projectId: params.projectId,
          conversationId: params.conversationId,
          finishedAt: null,
        },
        select: { id: true },
      });

      if (activeRun) {
        throw new LangfuseConflictError(ACTIVE_RUN_CONFLICT_MESSAGE);
      }

      const run = await createRunRow(tx, {
        runId: params.runId,
        projectId: params.projectId,
        conversationId: params.conversationId,
        triggeredByUserId: params.triggeredByUserId,
        model: params.model,
        request: params.request,
      });

      await appendConversationEventInTransaction({
        tx,
        projectId: params.projectId,
        conversationId: params.conversationId,
        runId: params.runId,
        event: params.runStartedEvent,
      });

      return { run, reconciled, supersededCount: superseded.count };
    },
  );

  recordReconciledOutcomes(reconciled);
  for (let i = 0; i < supersededCount; i++) {
    recordRunTerminalOutcome({
      status: InAppAgentRunStatus.CANCELLED,
      errorCode: InAppAgentRunErrorCode.APPROVAL_SUPERSEDED,
    });
  }

  return run;
}

/** Record one approval decision and create its continuation under the lock. */
export async function decideToolApproval(params: {
  prisma: PrismaClient;
  projectId: string;
  conversationId: string;
  parentRunId: string;
  continuationRunId: string;
  toolCallId: string;
  approved: boolean;
  decidedByUserId: string;
  /** Prefixed tool resolved from the persisted interrupt, never client input. */
  alwaysAllowToolName?: InAppAgentPrefixedLangfuseMcpToolName;
  model?: string;
}): Promise<InAppAgentRun> {
  const outcome = await params.prisma.$transaction(async (tx) => {
    await lockConversation(tx, params.projectId, params.conversationId);

    const parentRun = await tx.inAppAgentRun.findFirst({
      where: {
        id: params.parentRunId,
        projectId: params.projectId,
        conversationId: params.conversationId,
      },
      select: {
        status: true,
        finishedAt: true,
        claimedAt: true,
        createdAt: true,
        request: true,
      },
    });

    if (
      !parentRun ||
      parentRun.status !== InAppAgentRunStatus.AWAITING_APPROVAL
    ) {
      throw new LangfuseConflictError(
        "This approval is no longer pending. Reload the conversation.",
      );
    }

    const parkedAt = parentRun.finishedAt;
    if (
      parkedAt &&
      Date.now() - parkedAt.getTime() > IN_APP_AGENT_APPROVAL_TTL_MS
    ) {
      const { count } = await tx.inAppAgentRun.updateMany({
        where: {
          id: params.parentRunId,
          projectId: params.projectId,
          status: InAppAgentRunStatus.AWAITING_APPROVAL,
        },
        data: {
          status: InAppAgentRunStatus.FAILED,
          errorCode: InAppAgentRunErrorCode.APPROVAL_EXPIRED,
          errorMessage: "The approval request expired",
        },
      });

      return { type: "expired" as const, expired: count > 0 };
    }

    // The parent CAS is the exactly-once decision guarantee.
    const { count } = await tx.inAppAgentRun.updateMany({
      where: {
        id: params.parentRunId,
        projectId: params.projectId,
        status: InAppAgentRunStatus.AWAITING_APPROVAL,
      },
      data: { status: InAppAgentRunStatus.SUCCEEDED },
    });

    if (count === 0) {
      throw new LangfuseConflictError(
        "This approval was already decided. Reload the conversation.",
      );
    }

    const parentRequest = InAppAgentRunRequestSchema.safeParse(
      parentRun.request,
    );
    // Preserve tracing lineage across durable approval continuation runs.
    const continuationNumber =
      parentRequest.success && parentRequest.data.kind === "approvalDecision"
        ? (parentRequest.data.continuationNumber ?? 1) + 1
        : 1;
    const rootRunId = resolveInAppAgentRootRunId(
      parentRun.request,
      params.parentRunId,
    );
    const traceStartedAt =
      parentRequest.success &&
      parentRequest.data.kind === "approvalDecision" &&
      parentRequest.data.traceStartedAt
        ? parentRequest.data.traceStartedAt
        : (parentRun.claimedAt ?? parentRun.createdAt).toISOString();

    // Persist the grant in the same transaction as the exactly-once decision CAS.
    if (params.alwaysAllowToolName) {
      const conversation = await tx.inAppAgentConversation.findUnique({
        where: {
          id_projectId: {
            id: params.conversationId,
            projectId: params.projectId,
          },
        },
        select: { alwaysAllowedTools: true },
      });

      if (
        !conversation?.alwaysAllowedTools.includes(params.alwaysAllowToolName)
      ) {
        await tx.inAppAgentConversation.update({
          where: {
            id_projectId: {
              id: params.conversationId,
              projectId: params.projectId,
            },
          },
          data: { alwaysAllowedTools: { push: params.alwaysAllowToolName } },
        });
      }
    }

    await appendConversationEventInTransaction({
      tx,
      projectId: params.projectId,
      conversationId: params.conversationId,
      runId: params.parentRunId,
      event: buildInAppAgentApprovalDecisionEvent({
        toolCallId: params.toolCallId,
        approved: params.approved,
        decidedByUserId: params.decidedByUserId,
        ...(params.alwaysAllowToolName
          ? {
              alwaysAllow: true as const,
              toolName: params.alwaysAllowToolName,
            }
          : {}),
      }),
    });

    return {
      type: "continued" as const,
      run: await createRunRow(tx, {
        runId: params.continuationRunId,
        projectId: params.projectId,
        conversationId: params.conversationId,
        triggeredByUserId: params.decidedByUserId,
        model: params.model,
        request: {
          kind: "approvalDecision",
          parentRunId: params.parentRunId,
          rootRunId,
          traceStartedAt,
          ...(parentRun.finishedAt
            ? { approvalRequestedAt: parentRun.finishedAt.toISOString() }
            : {}),
          continuationNumber,
          toolCallId: params.toolCallId,
          approved: params.approved,
          context: parentRequest.success ? parentRequest.data.context : [],
        },
      }),
    };
  });

  if (outcome.type === "expired") {
    if (outcome.expired) {
      recordRunTerminalOutcome({
        status: InAppAgentRunStatus.FAILED,
        errorCode: InAppAgentRunErrorCode.APPROVAL_EXPIRED,
      });
    }
    throw new LangfuseConflictError("The approval request expired.");
  }

  recordRunTerminalOutcome({
    status: InAppAgentRunStatus.SUCCEEDED,
  });

  return outcome.run;
}

export type CancelRunResult = {
  cancelledImmediately: boolean;
  status: InAppAgentRunStatus | null;
  errorCode?: InAppAgentRunErrorCode;
};

export type ImmediateCancel = {
  runId: string;
  errorCode: InAppAgentRunErrorCode;
};

/** Cancel every run that is executing or waiting on user approval. */
export async function cancelConversationRunsInTransaction(params: {
  tx: InAppAgentTx;
  projectId: string;
  conversationId: string;
}): Promise<ImmediateCancel[]> {
  await lockConversation(params.tx, params.projectId, params.conversationId);

  const runs = await params.tx.inAppAgentRun.findMany({
    where: {
      projectId: params.projectId,
      conversationId: params.conversationId,
      // Parked approvals have finishedAt set but remain unsettled.
      status: { in: [...IN_APP_AGENT_UNSETTLED_RUN_STATUSES] },
    },
    select: { id: true, status: true },
  });

  const cancelledImmediately: ImmediateCancel[] = [];

  for (const run of runs) {
    const parsedStatus = InAppAgentRunStatusSchema.safeParse(run.status);
    if (!parsedStatus.success) {
      continue;
    }

    const result = await cancelRunInTransaction({
      ...params,
      runId: run.id,
      runStatus: parsedStatus.data,
    });

    if (result.cancelledImmediately && result.errorCode) {
      cancelledImmediately.push({
        runId: run.id,
        errorCode: result.errorCode,
      });
    }
  }

  return cancelledImmediately;
}

export function recordImmediateCancelOutcomes(
  cancellations: ReadonlyArray<ImmediateCancel>,
): void {
  for (const cancellation of cancellations) {
    recordRunTerminalOutcome({
      status: InAppAgentRunStatus.CANCELLED,
      errorCode: cancellation.errorCode,
    });
  }
}

/** Cancel idle states immediately; signal RUNNING workers cooperatively. */
export async function requestRunCancellation(params: {
  prisma: PrismaClient;
  projectId: string;
  conversationId: string;
  runId: string;
}): Promise<CancelRunResult> {
  const result = await params.prisma.$transaction(async (tx) => {
    await lockConversation(tx, params.projectId, params.conversationId);

    const run = await tx.inAppAgentRun.findFirst({
      where: {
        id: params.runId,
        projectId: params.projectId,
        conversationId: params.conversationId,
      },
      select: { status: true },
    });

    const parsedStatus = InAppAgentRunStatusSchema.safeParse(run?.status);
    if (!parsedStatus.success) {
      return { cancelledImmediately: false, status: null };
    }

    return cancelRunInTransaction({
      tx,
      projectId: params.projectId,
      conversationId: params.conversationId,
      runId: params.runId,
      runStatus: parsedStatus.data,
    });
  });

  // A RUNNING run is only signalled here; the worker writes its own terminal
  // state, so only an immediate cancel settles the run in this call.
  if (result.cancelledImmediately) {
    recordRunTerminalOutcome({
      status: InAppAgentRunStatus.CANCELLED,
      errorCode: result.errorCode ?? null,
    });
  }

  return result;
}

async function cancelRunInTransaction(params: {
  tx: InAppAgentTx;
  projectId: string;
  conversationId: string;
  runId: string;
  runStatus: InAppAgentRunStatus;
}): Promise<CancelRunResult> {
  const immediateCancel =
    params.runStatus === InAppAgentRunStatus.QUEUED
      ? {
          errorCode: InAppAgentRunErrorCode.CANCELLED,
          errorMessage: "Cancelled before a worker picked the run up",
        }
      : params.runStatus === InAppAgentRunStatus.AWAITING_APPROVAL
        ? {
            errorCode: InAppAgentRunErrorCode.APPROVAL_CANCELLED,
            errorMessage: "Approval cancelled",
          }
        : null;

  if (immediateCancel) {
    const { count } = await params.tx.inAppAgentRun.updateMany({
      where: {
        id: params.runId,
        projectId: params.projectId,
        status: params.runStatus,
      },
      data: {
        status: InAppAgentRunStatus.CANCELLED,
        finishedAt: new Date(),
        cancelRequestedAt: new Date(),
        ...immediateCancel,
      },
    });

    if (count > 0) {
      return {
        cancelledImmediately: true,
        status: InAppAgentRunStatus.CANCELLED,
        errorCode: immediateCancel.errorCode,
      };
    }
  } else if (params.runStatus !== InAppAgentRunStatus.RUNNING) {
    return {
      cancelledImmediately: false,
      status: params.runStatus,
    };
  }

  // Preserve cancellation when a worker claims QUEUED between the read and CAS.
  const signalled = await params.tx.inAppAgentRun.updateMany({
    where: {
      id: params.runId,
      projectId: params.projectId,
      status: InAppAgentRunStatus.RUNNING,
    },
    data: { cancelRequestedAt: new Date() },
  });

  if (signalled.count > 0) {
    return {
      cancelledImmediately: false,
      status: InAppAgentRunStatus.RUNNING,
    };
  }

  const current = await params.tx.inAppAgentRun.findFirst({
    where: {
      id: params.runId,
      projectId: params.projectId,
      conversationId: params.conversationId,
    },
    select: { status: true },
  });

  const parsedCurrentStatus = InAppAgentRunStatusSchema.safeParse(
    current?.status,
  );

  return {
    cancelledImmediately: false,
    status: parsedCurrentStatus.success ? parsedCurrentStatus.data : null,
  };
}

export type ReconciledRun = {
  runId: string;
  errorCode: InAppAgentRunErrorCode;
};

/** Reconcile stale lifecycle states on conversation reads (dispatch option C). */
export async function reconcileConversationRuns(params: {
  prisma: PrismaClient;
  projectId: string;
  conversationId: string;
}): Promise<ReconciledRun[]> {
  const reconciled = await params.prisma.$transaction((tx) =>
    reconcileConversationRunsInTransaction({
      tx,
      projectId: params.projectId,
      conversationId: params.conversationId,
    }),
  );

  recordReconciledOutcomes(reconciled);

  return reconciled;
}

function recordReconciledOutcomes(reconciled: ReconciledRun[]): void {
  for (const run of reconciled) {
    recordRunTerminalOutcome({
      status: InAppAgentRunStatus.FAILED,
      errorCode: run.errorCode,
    });
  }
}

async function reconcileConversationRunsInTransaction(params: {
  tx: InAppAgentTx;
  projectId: string;
  conversationId: string;
}): Promise<ReconciledRun[]> {
  const { tx, projectId, conversationId } = params;
  const now = Date.now();

  const candidates = await tx.inAppAgentRun.findMany({
    where: {
      projectId,
      conversationId,
      status: {
        in: [...IN_APP_AGENT_UNSETTLED_RUN_STATUSES],
      },
    },
    select: {
      id: true,
      status: true,
      createdAt: true,
      claimedAt: true,
      heartbeatAt: true,
      finishedAt: true,
    },
  });

  const reconciled: ReconciledRun[] = [];

  for (const run of candidates) {
    const failure = classifyStaleRun(run, now);
    if (!failure) continue;

    const { count } = await tx.inAppAgentRun.updateMany({
      where: {
        id: run.id,
        projectId,
        status: run.status,
        ...(failure.errorCode === InAppAgentRunErrorCode.WORKER_LOST
          ? {
              claimedAt: run.claimedAt,
              heartbeatAt: run.heartbeatAt,
            }
          : {}),
      },
      data: {
        status: InAppAgentRunStatus.FAILED,
        finishedAt: new Date(),
        errorCode: failure.errorCode,
        errorMessage: failure.errorMessage,
      },
    });

    if (count > 0) {
      reconciled.push({ runId: run.id, errorCode: failure.errorCode });
    }
  }

  return reconciled;
}

/**
 * Decide whether a non-terminal run has already missed every deadline that
 * should have failed it. Pure: callers choose whether to act on the verdict.
 *
 * Reconciliation writes the verdict; read paths that only need to render a run
 * may apply it without writing, so a dead worker does not leave a conversation
 * spinning until someone opens it (`reconcileConversationRuns` is the only
 * authority that persists the transition).
 */
export function classifyStaleRun(
  run: {
    status: string | null;
    createdAt: Date;
    claimedAt: Date | null;
    heartbeatAt: Date | null;
    finishedAt: Date | null;
  },
  now: number,
): { errorCode: InAppAgentRunErrorCode; errorMessage: string } | null {
  if (run.status === InAppAgentRunStatus.QUEUED) {
    return now - run.createdAt.getTime() > IN_APP_AGENT_QUEUE_TIMEOUT_MS
      ? {
          errorCode: InAppAgentRunErrorCode.QUEUE_TIMEOUT,
          errorMessage: "No worker picked this run up",
        }
      : null;
  }

  if (run.status === InAppAgentRunStatus.RUNNING) {
    // Duration wins because a hung tool may keep renewing its heartbeat. Use
    // creation time as the defensive lower bound when claim metadata is absent.
    const startedAt = run.claimedAt ?? run.createdAt;
    if (now - startedAt.getTime() > IN_APP_AGENT_RUN_MAX_DURATION_MS) {
      return {
        errorCode: InAppAgentRunErrorCode.RUN_TIMEOUT,
        errorMessage: "The run exceeded the maximum duration",
      };
    }

    const lastSign = run.heartbeatAt ?? run.claimedAt;
    return lastSign &&
      now - lastSign.getTime() > IN_APP_AGENT_HEARTBEAT_STALE_MS
      ? {
          errorCode: InAppAgentRunErrorCode.WORKER_LOST,
          errorMessage: "The run was interrupted",
        }
      : null;
  }

  if (run.status === InAppAgentRunStatus.AWAITING_APPROVAL) {
    const parkedAt = run.finishedAt;
    return parkedAt && now - parkedAt.getTime() > IN_APP_AGENT_APPROVAL_TTL_MS
      ? {
          errorCode: InAppAgentRunErrorCode.APPROVAL_EXPIRED,
          errorMessage: "The approval request expired",
        }
      : null;
  }

  return null;
}

export function isMissingInAppAgentMcpApiKeyError(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2025"
  );
}

/** Retry terminal-run MCP-key cleanup outside the lifecycle transaction. */
export async function cleanupTerminalRunMcpApiKeys(params: {
  prisma: PrismaClient;
  projectId: string;
  conversationId: string;
  deleteApiKey: (apiKeyId: string) => Promise<void>;
}): Promise<number> {
  const staleKeyRuns = await params.prisma.inAppAgentRun.findMany({
    where: {
      projectId: params.projectId,
      conversationId: params.conversationId,
      finishedAt: { not: null },
      mcpApiKeyId: { not: null },
    },
    select: { id: true, mcpApiKeyId: true },
  });

  let cleaned = 0;

  for (const run of staleKeyRuns) {
    if (!run.mcpApiKeyId) continue;

    try {
      try {
        await params.deleteApiKey(run.mcpApiKeyId);
      } catch (error) {
        // Concurrent cleanup or a prior delete already removed the row.
        if (!isMissingInAppAgentMcpApiKeyError(error)) {
          throw error;
        }
      }
      await clearRunMcpApiKeyPointer({
        prisma: params.prisma,
        projectId: params.projectId,
        runId: run.id,
      });
      cleaned += 1;
    } catch (error) {
      logger.error("Failed to clean up in-app agent MCP key on reconcile", {
        projectId: params.projectId,
        runId: run.id,
        error,
      });
    }
  }

  return cleaned;
}

async function createRunRow(
  tx: InAppAgentTx,
  params: {
    runId: string;
    projectId: string;
    conversationId: string;
    triggeredByUserId: string;
    model?: string;
    request: InAppAgentRunRequest;
  },
): Promise<InAppAgentRun> {
  try {
    return await tx.inAppAgentRun.create({
      data: {
        id: params.runId,
        projectId: params.projectId,
        conversationId: params.conversationId,
        triggeredByUserId: params.triggeredByUserId,
        model: params.model,
        status: InAppAgentRunStatus.QUEUED,
        request: params.request,
      },
    });
  } catch (error) {
    // Map only the active-run unique index; a replayed run ID remains a 500.
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002" &&
      Array.isArray(error.meta?.target) &&
      error.meta.target.includes("conversation_id")
    ) {
      throw new LangfuseConflictError(ACTIVE_RUN_CONFLICT_MESSAGE);
    }
    throw error;
  }
}

/** Append a web-authored event while holding the conversation lock. */
async function appendConversationEventInTransaction(params: {
  tx: InAppAgentTx;
  projectId: string;
  conversationId: string;
  runId: string;
  event: AgUiEvent;
}): Promise<number> {
  const latestEvent = await params.tx.inAppAgentEvent.findFirst({
    where: {
      projectId: params.projectId,
      conversationId: params.conversationId,
    },
    orderBy: { sequenceNumber: "desc" },
    select: { sequenceNumber: true },
  });

  const sequenceNumber = (latestEvent?.sequenceNumber ?? -1) + 1;

  await params.tx.inAppAgentEvent.create({
    data: {
      projectId: params.projectId,
      conversationId: params.conversationId,
      runId: params.runId,
      sequenceNumber,
      type: String(params.event.type),
      event: params.event as unknown as Prisma.InputJsonValue,
    },
  });

  await params.tx.inAppAgentConversation.update({
    where: {
      id_projectId: {
        id: params.conversationId,
        projectId: params.projectId,
      },
    },
    data: { updatedAt: new Date() },
  });

  return sequenceNumber;
}
