import {
  InAppAgentRunErrorCode,
  InAppAgentRunStatus,
  InAppAgentRunStatusSchema,
  LangfuseConflictError,
} from "../../index";
import { Prisma } from "../../db";
import type { InAppAgentRun, PrismaClient } from "../../db";
import { buildInAppAgentApprovalDecisionEvent } from "../backgroundWatch";
import type { AgUiEvent } from "../schema";
import {
  InAppAgentRunRequestSchema,
  type InAppAgentRunRequest,
} from "../../features/inAppAgent/types";
import {
  ACTIVE_RUN_CONFLICT_MESSAGE,
  FOREGROUND_RUN_STALE_AFTER_MS,
  FOREGROUND_RUN_STALE_ERROR_MESSAGE,
  lockConversation,
  type InAppAgentTx,
} from "./persistence";
import {
  IN_APP_AGENT_APPROVAL_TTL_MS,
  IN_APP_AGENT_HEARTBEAT_STALE_MS,
  IN_APP_AGENT_QUEUE_REDISPATCH_MS,
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
  return params.prisma.$transaction(async (tx) => {
    await lockConversation(tx, params.projectId, params.conversationId);

    await reconcileConversationRunsInTransaction({
      tx,
      projectId: params.projectId,
      conversationId: params.conversationId,
    });

    // New input supersedes a parked approval.
    await tx.inAppAgentRun.updateMany({
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

    return run;
  });
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
      select: { status: true, finishedAt: true, request: true },
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
      await tx.inAppAgentRun.updateMany({
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

      return { type: "expired" as const };
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

    await appendConversationEventInTransaction({
      tx,
      projectId: params.projectId,
      conversationId: params.conversationId,
      runId: params.parentRunId,
      event: buildInAppAgentApprovalDecisionEvent({
        toolCallId: params.toolCallId,
        approved: params.approved,
        decidedByUserId: params.decidedByUserId,
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
          toolCallId: params.toolCallId,
          approved: params.approved,
          context: parentRequest.success ? parentRequest.data.context : [],
        },
      }),
    };
  });

  if (outcome.type === "expired") {
    throw new LangfuseConflictError("The approval request expired.");
  }

  return outcome.run;
}

export type CancelRunResult = {
  cancelledImmediately: boolean;
  status: InAppAgentRunStatus | null;
};

/** Cancel idle states immediately; signal RUNNING workers cooperatively. */
export async function requestRunCancellation(params: {
  prisma: PrismaClient;
  projectId: string;
  conversationId: string;
  runId: string;
}): Promise<CancelRunResult> {
  return params.prisma.$transaction(async (tx) => {
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
    const runStatus = parsedStatus.data;

    const immediateCancel =
      runStatus === InAppAgentRunStatus.QUEUED
        ? {
            errorCode: InAppAgentRunErrorCode.CANCELLED,
            errorMessage: "Cancelled before a worker picked the run up",
          }
        : runStatus === InAppAgentRunStatus.AWAITING_APPROVAL
          ? {
              errorCode: InAppAgentRunErrorCode.APPROVAL_CANCELLED,
              errorMessage: "Approval cancelled",
            }
          : null;

    if (immediateCancel) {
      const { count } = await tx.inAppAgentRun.updateMany({
        where: {
          id: params.runId,
          projectId: params.projectId,
          status: runStatus,
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
        };
      }
    } else if (runStatus !== InAppAgentRunStatus.RUNNING) {
      return {
        cancelledImmediately: false,
        status: runStatus,
      };
    }

    // A worker can claim QUEUED between the read and immediate-cancel CAS.
    // Signal the newly RUNNING worker instead of losing that cancel request.
    const signalled = await tx.inAppAgentRun.updateMany({
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

    const current = await tx.inAppAgentRun.findFirst({
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
  });
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

  return reconciled;
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
        in: [
          InAppAgentRunStatus.QUEUED,
          InAppAgentRunStatus.RUNNING,
          InAppAgentRunStatus.AWAITING_APPROVAL,
        ],
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

    const applied = await applyStaleRunTerminalCas({
      client: tx,
      projectId,
      run,
      failure,
    });

    if (applied) {
      reconciled.push({ runId: run.id, errorCode: failure.errorCode });
    }
  }

  return reconciled;
}

type InAppAgentRunCasClient = Pick<InAppAgentTx, "inAppAgentRun">;

/**
 * The one terminal transition for a stale run, shared by conversation reads and
 * the global sweep so the two can never disagree about what a race means.
 *
 * `worker_lost` additionally fences on the observed claim/heartbeat pair: a
 * worker that renewed its heartbeat between our read and this write keeps the
 * run, and we report the race instead of killing a healthy run.
 */
async function applyStaleRunTerminalCas(params: {
  client: InAppAgentRunCasClient;
  projectId: string;
  run: {
    id: string;
    status: string | null;
    claimedAt: Date | null;
    heartbeatAt: Date | null;
  };
  failure: { errorCode: InAppAgentRunErrorCode; errorMessage: string };
}): Promise<boolean> {
  const { count } = await params.client.inAppAgentRun.updateMany({
    where: {
      id: params.run.id,
      projectId: params.projectId,
      status: params.run.status,
      ...(params.failure.errorCode === InAppAgentRunErrorCode.WORKER_LOST
        ? {
            claimedAt: params.run.claimedAt,
            heartbeatAt: params.run.heartbeatAt,
          }
        : {}),
    },
    data: {
      status: InAppAgentRunStatus.FAILED,
      finishedAt: new Date(),
      errorCode: params.failure.errorCode,
      errorMessage: params.failure.errorMessage,
    },
  });

  return count > 0;
}

type StaleRunRow = {
  id: string;
  projectId: string;
  conversationId: string;
  status: string | null;
  createdAt: Date;
  claimedAt: Date | null;
  heartbeatAt: Date | null;
  finishedAt: Date | null;
};

export type InAppAgentTerminalWorkItem = {
  run: StaleRunRow;
  errorCode: InAppAgentRunErrorCode;
  errorMessage: string;
};

export type InAppAgentLifecycleWork = {
  /** QUEUED, past its dispatch delay, still inside the queue timeout. */
  redispatch: Array<{ runId: string; projectId: string; createdAt: Date }>;
  terminalize: InAppAgentTerminalWorkItem[];
  candidateCount: number;
};

/**
 * Select and classify globally recoverable runs in one query.
 *
 * Only age-eligible rows are selected, so a healthy system reads a handful of
 * rows and writes nothing. The predicates are a deliberate superset of what
 * `classifyStaleRun` will act on (a QUEUED run becomes a candidate at the
 * redispatch delay but is only failed at the queue timeout), so a drift between
 * filter and classifier can delay a recovery but never cause a wrong one.
 *
 * Foreground-shaped runs must never be selected: they insert as RUNNING with a
 * NULL claim, and the classifier's 150s staleness branch would terminalize a
 * healthy in-flight foreground run and drop its result. Every RUNNING branch
 * below therefore keys off a claim or heartbeat timestamp, which a foreground
 * run never has; the explicit `claimedAt` guard states that intent so a future
 * branch cannot quietly reintroduce them. Foreground staleness stays owned by
 * the read path.
 *
 * That carve-out is transitional. Once foreground execution is removed after
 * the background GA, no claim-less RUNNING row can exist and the guard, along
 * with the classifier's foreground branch, becomes dead code.
 */
export async function findInAppAgentLifecycleWork(params: {
  prisma: PrismaClient;
  redispatchLimit: number;
  terminalizeLimit: number;
  now?: Date;
}): Promise<InAppAgentLifecycleWork> {
  const now = params.now ?? new Date();
  const nowMs = now.getTime();
  const since = (ms: number) => new Date(nowMs - ms);

  const candidates = await params.prisma.inAppAgentRun.findMany({
    where: {
      finishedAt: null,
      OR: [
        {
          status: InAppAgentRunStatus.QUEUED,
          createdAt: { lt: since(IN_APP_AGENT_QUEUE_REDISPATCH_MS) },
        },
        {
          status: InAppAgentRunStatus.RUNNING,
          claimedAt: { not: null },
          OR: [
            { heartbeatAt: { lt: since(IN_APP_AGENT_HEARTBEAT_STALE_MS) } },
            // A claim always writes a heartbeat, but do not depend on it.
            {
              heartbeatAt: null,
              claimedAt: { lt: since(IN_APP_AGENT_HEARTBEAT_STALE_MS) },
            },
            { claimedAt: { lt: since(IN_APP_AGENT_RUN_MAX_DURATION_MS) } },
          ],
        },
      ],
    },
    orderBy: { createdAt: "asc" },
    take: params.redispatchLimit + params.terminalizeLimit,
    select: {
      id: true,
      projectId: true,
      conversationId: true,
      status: true,
      createdAt: true,
      claimedAt: true,
      heartbeatAt: true,
      finishedAt: true,
    },
  });

  const work: InAppAgentLifecycleWork = {
    redispatch: [],
    terminalize: [],
    candidateCount: candidates.length,
  };

  for (const run of candidates) {
    const failure = classifyStaleRun(run, nowMs);

    if (failure) {
      if (work.terminalize.length < params.terminalizeLimit) {
        work.terminalize.push({ run, ...failure });
      }
      continue;
    }

    // Unstale and still queued: the classifier is the single authority on the
    // window, so a run past its queue timeout can never be woken up here.
    if (
      run.status === InAppAgentRunStatus.QUEUED &&
      work.redispatch.length < params.redispatchLimit
    ) {
      work.redispatch.push({
        runId: run.id,
        projectId: run.projectId,
        createdAt: run.createdAt,
      });
    }
  }

  return work;
}

/** Apply one classified terminal transition. `false` means another writer won. */
export async function terminalizeStaleRun(params: {
  prisma: PrismaClient;
  item: InAppAgentTerminalWorkItem;
}): Promise<boolean> {
  return applyStaleRunTerminalCas({
    client: params.prisma,
    projectId: params.item.run.projectId,
    run: params.item.run,
    failure: {
      errorCode: params.item.errorCode,
      errorMessage: params.item.errorMessage,
    },
  });
}

/** Backlog gauge source: the canary monitor watches oldest queued run age. */
export async function getOldestQueuedRunCreatedAt(
  prisma: PrismaClient,
): Promise<Date | null> {
  const oldest = await prisma.inAppAgentRun.findFirst({
    where: { finishedAt: null, status: InAppAgentRunStatus.QUEUED },
    orderBy: { createdAt: "asc" },
    select: { createdAt: true },
  });

  return oldest?.createdAt ?? null;
}

function classifyStaleRun(
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
    if (
      !run.claimedAt &&
      !run.heartbeatAt &&
      now - run.createdAt.getTime() > FOREGROUND_RUN_STALE_AFTER_MS
    ) {
      return {
        errorCode: InAppAgentRunErrorCode.STALE,
        errorMessage: FOREGROUND_RUN_STALE_ERROR_MESSAGE,
      };
    }

    // Duration wins because a hung tool may keep renewing its heartbeat.
    if (
      run.claimedAt &&
      now - run.claimedAt.getTime() > IN_APP_AGENT_RUN_MAX_DURATION_MS
    ) {
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
