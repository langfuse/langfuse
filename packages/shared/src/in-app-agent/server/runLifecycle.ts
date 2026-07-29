import {
  InAppAgentRunErrorCode,
  InAppAgentRunStatus,
  LangfuseConflictError,
} from "../../index";
import { Prisma } from "../../db";
import type { InAppAgentRun, PrismaClient } from "../../db";
import { logger } from "../../server";
import { buildInAppAgentApprovalDecisionEvent } from "../backgroundWatch";
import type { AgUiEvent } from "../schema";
import type { InAppAgentRunRequest } from "../../features/inAppAgent/types";
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

/**
 * Compare-and-swap transitions for background in-app agent runs.
 *
 * Postgres owns run correctness: BullMQ is delivery-only (`attempts: 1`,
 * duplicate deliveries expected), so every ownership change is a conditional
 * update that either wins or observes that someone else did. Web (submit,
 * cancel, decide, reconcile-on-read) and the worker share these helpers.
 */

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
  /** The run is no longer RUNNING (reconciled away or cancelled directly): stop writing, no terminal CAS. */
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

/**
 * Terminal CAS `RUNNING → status`. Returns whether this caller won; a loser
 * (run already reconciled to FAILED, cancelled directly, …) must not
 * overwrite the observed outcome. `AWAITING_APPROVAL` sets `finishedAt` like
 * the true terminal states: the worker and conversation slot are freed while
 * the approval waits.
 */
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

/**
 * Null the MCP-key pointer only after the key's deletion is confirmed. If the
 * delete fails, the pointer stays set so reconciliation retries the cleanup.
 */
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
 * Submit a background run.
 *
 * One transaction does everything that must not interleave with another
 * submit or an approval decision: take the conversation row lock, reconcile
 * runs that are already dead, supersede a pending approval, enforce the
 * single-active-run rule, insert the run as `QUEUED`, and append the
 * `RUN_STARTED` event carrying the turn's input.
 *
 * The event row is inserted directly rather than through `appendRunEvents`,
 * whose fence requires `status = RUNNING` — this run is `QUEUED` and not yet
 * claimable. That is deliberate: the events table is the single render source
 * from the instant of submit, so there is no optimistic UI state to survive a
 * refresh, and the worker's replay reads its input from this row (it never
 * writes `RUN_STARTED` itself).
 *
 * Idempotency for a lost response: if this commits but the client never sees
 * the run ID, the client's retry hits the single-active-run conflict, and that
 * clean conflict *is* the idempotency signal — the client rehydrates and finds
 * the committed run plus its user message. No duplicate run, no duplicate
 * message.
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

    // Supersede a pending approval rather than blocking input, which would
    // hold the conversation hostage for up to APPROVAL_TTL.
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

/**
 * Record a human decision on a pending approval and queue the continuation.
 *
 * The CAS on the parent run's status is the exactly-once guarantee: zero rows
 * updated means the approval was already decided or superseded, which surfaces
 * as a clean conflict instead of a second continuation. Expiry is checked
 * inline against the parking `finished_at`, so the TTL does not depend on
 * anyone having polled.
 *
 * Only IDs and a boolean cross the wire; the tool name and arguments are read
 * server-side from the persisted interrupt event, so there is nothing to
 * tamper with and no fingerprint to maintain.
 */
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
  return params.prisma.$transaction(async (tx) => {
    // Serializes with createQueuedRun, so the loser of a decide/submit race
    // gets a clean conflict rather than the unique-index violation.
    await lockConversation(tx, params.projectId, params.conversationId);

    const parentRun = await tx.inAppAgentRun.findFirst({
      where: {
        id: params.parentRunId,
        projectId: params.projectId,
        conversationId: params.conversationId,
      },
      select: { status: true, finishedAt: true },
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

      throw new LangfuseConflictError("The approval request expired.");
    }

    // A parent that parked for approval and was decided completed its job;
    // the handoff is the success. Zero rows = already decided or superseded.
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

    // A rejection also spawns a continuation, so the agent can react to it.
    return createRunRow(tx, {
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
      },
    });
  });
}

export type CancelRunResult = {
  /** Set when this mutation itself finished the run; null when the worker will. */
  cancelledImmediately: boolean;
  status: InAppAgentRunStatus | null;
};

/**
 * Request cancellation of a run.
 *
 * Nothing is executing for a `QUEUED` or `AWAITING_APPROVAL` run, so cancel is
 * immediate. A `RUNNING` run is cooperative: the flag is picked up by the next
 * heartbeat (within one HEARTBEAT_INTERVAL) and the loop aborts at the next
 * step boundary. `cancel_requested_at` is always set, so a run that is claimed
 * between this read and the worker's next heartbeat still sees it.
 */
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

    if (!run?.status) {
      return { cancelledImmediately: false, status: null };
    }

    await tx.inAppAgentRun.updateMany({
      where: { id: params.runId, projectId: params.projectId },
      data: { cancelRequestedAt: new Date() },
    });

    const immediateCancel =
      run.status === InAppAgentRunStatus.QUEUED
        ? {
            errorCode: InAppAgentRunErrorCode.CANCELLED,
            errorMessage: "Cancelled before a worker picked the run up",
          }
        : run.status === InAppAgentRunStatus.AWAITING_APPROVAL
          ? {
              errorCode: InAppAgentRunErrorCode.APPROVAL_CANCELLED,
              errorMessage: "Approval cancelled",
            }
          : null;

    if (!immediateCancel) {
      return {
        cancelledImmediately: false,
        status: run.status as InAppAgentRunStatus,
      };
    }

    const { count } = await tx.inAppAgentRun.updateMany({
      where: {
        id: params.runId,
        projectId: params.projectId,
        status: run.status,
      },
      data: {
        status: InAppAgentRunStatus.CANCELLED,
        finishedAt: new Date(),
        ...immediateCancel,
      },
    });

    return {
      cancelledImmediately: count > 0,
      status: count > 0 ? InAppAgentRunStatus.CANCELLED : null,
    };
  });
}

export type ReconciledRun = {
  runId: string;
  errorCode: InAppAgentRunErrorCode;
};

/**
 * Reconciliation-on-read: there is no scanner job, so every read of a
 * conversation is the moment its dead runs become visibly dead.
 *
 * Four transitions, each anchored on a timestamp the writer already
 * maintains, plus MCP-key cleanup retries for runs whose key delete failed.
 * Since reads are what drive this, a badge or transcript can never show
 * "Working" for a worker that is gone.
 *
 * A stale `QUEUED` run is failed rather than re-enqueued (dispatch option C).
 * Re-enqueue-on-read is the pre-agreed follow-up and is purely additive here:
 * one extra branch and one tunable.
 */
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

    const { count } = await tx.inAppAgentRun.updateMany({
      where: { id: run.id, projectId, status: run.status },
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
    // Ordered deliberately: the duration backstop wins over the heartbeat
    // check, because a hung tool renews a healthy heartbeat forever and
    // run_timeout is the honest description of that failure.
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
    // Anchored on the parking finished_at; no extra column.
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

/**
 * Retry MCP-key cleanup for runs that are terminal with the pointer still set
 * — the discoverable owners of a key whose delete failed. Runs outside the
 * conversation transaction because deleting the key is not a Postgres-only
 * operation and must never roll back a reconciliation that already committed.
 */
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
      await params.deleteApiKey(run.mcpApiKeyId);
      await clearRunMcpApiKeyPointer({
        prisma: params.prisma,
        projectId: params.projectId,
        runId: run.id,
      });
      cleaned += 1;
    } catch (error) {
      // Leave the pointer set so the next read retries. A nonzero steady-state
      // count here means a cleanup path is broken, not that this is normal.
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
    // Backstop: the partial unique index on active runs. The conversation lock
    // makes this unreachable; surface it as the same conflict as the primary
    // check instead of a 500. Only map that index — the insert can also
    // violate the (id, project_id) primary key on a replayed run ID.
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

/**
 * Append one web-authored event inside a mutation that already holds the
 * conversation lock.
 *
 * Two writers share the events table but are never concurrent: web appends
 * user-authored happenings (the submitted message, an approval decision)
 * before the run is claimable, and the worker is the only writer while a run
 * is `RUNNING`. `appendRunEvents` is the worker's door and fences on
 * `status = RUNNING`; this is web's, and the conversation lock is what makes
 * the sequence assignment safe.
 */
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
