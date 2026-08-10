import { EventType } from "@ag-ui/core";

import {
  InAppAgentRunErrorCode,
  InAppAgentRunStatus,
  InAppAgentRunStatusSchema,
  LangfuseConflictError,
} from "../../index";
import { Prisma } from "../../db";
import type { InAppAgentRun, PrismaClient } from "../../db";
import { logger } from "../../server";
import { buildInAppAgentApprovalDecisionEvent } from "../backgroundWatch";
import type {
  AgUiEvent,
  AgUiResumeEntry,
  InAppAgentApprovalResumeEntry,
} from "../schema";
import type { InAppAgentPrefixedLangfuseMcpToolName } from "./tools";
import { stableJsonStringify } from "../../utils/json";
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
  IN_APP_AGENT_QUEUE_TIMEOUT_MS,
  IN_APP_AGENT_RUN_MAX_DURATION_MS,
} from "./tunables";

/** Postgres-owned CAS transitions shared by web and worker execution. */

export async function resolveInAppAgentLogicalTurnId(params: {
  prisma: PrismaClient | InAppAgentTx;
  projectId: string;
  conversationId: string;
  runId: string;
  request?: InAppAgentRunRequest;
}): Promise<string> {
  let runId = params.runId;
  let request = params.request;
  const visited = new Set<string>();

  for (;;) {
    if (visited.has(runId)) return params.runId;
    visited.add(runId);
    if (!request) {
      const run = await params.prisma.inAppAgentRun.findFirst({
        where: {
          id: runId,
          projectId: params.projectId,
          conversationId: params.conversationId,
        },
        select: { request: true },
      });
      const parsedRequest = InAppAgentRunRequestSchema.safeParse(run?.request);
      if (!parsedRequest.success) return runId;
      request = parsedRequest.data;
    }

    if (request.kind === "userMessage") return request.turnId ?? runId;
    if (request.kind === "approvalDecisionBatch") return request.turnId;
    runId = request.parentRunId;
    request = undefined;
  }
}

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
          ? { scope: "conversation" as const }
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

/** Record a complete interrupt response and create exactly one continuation. */
export async function decideToolApprovalBatch(params: {
  prisma: PrismaClient;
  projectId: string;
  conversationId: string;
  interruptedRunId: string;
  continuationRunId: string;
  openInterruptIds: string[];
  resume: InAppAgentApprovalResumeEntry[];
  toolCallIdsByInterruptId: Record<string, string>;
  alwaysAllowToolNamesByInterruptId: Partial<
    Record<string, InAppAgentPrefixedLangfuseMcpToolName>
  >;
  decidedByUserId: string;
  model?: string;
}): Promise<{ run: InAppAgentRun; shouldEnqueue: boolean }> {
  const { resume, batchFingerprint } = getInAppAgentApprovalBatchFingerprint({
    openInterruptIds: params.openInterruptIds,
    resume: params.resume,
  });
  const outcome = await params.prisma.$transaction(async (tx) => {
    await lockConversation(tx, params.projectId, params.conversationId);

    const parentRun = await tx.inAppAgentRun.findFirst({
      where: {
        id: params.interruptedRunId,
        projectId: params.projectId,
        conversationId: params.conversationId,
      },
      select: { status: true, finishedAt: true, request: true },
    });

    if (parentRun?.status !== InAppAgentRunStatus.AWAITING_APPROVAL) {
      const existing = await findToolApprovalBatchContinuation({
        prisma: tx,
        projectId: params.projectId,
        conversationId: params.conversationId,
        interruptedRunId: params.interruptedRunId,
        batchFingerprint,
      });

      if (existing) {
        if (
          existing.status === InAppAgentRunStatus.FAILED &&
          existing.errorCode === InAppAgentRunErrorCode.ENQUEUE_FAILED
        ) {
          const { count } = await tx.inAppAgentRun.updateMany({
            where: {
              id: existing.id,
              projectId: params.projectId,
              status: InAppAgentRunStatus.FAILED,
              errorCode: InAppAgentRunErrorCode.ENQUEUE_FAILED,
            },
            data: {
              status: InAppAgentRunStatus.QUEUED,
              finishedAt: null,
              errorCode: null,
              errorMessage: null,
            },
          });
          if (count !== 1) {
            throw new LangfuseConflictError(
              "This approval continuation could not be retried.",
            );
          }
          return {
            type: "continued" as const,
            run: {
              ...existing,
              status: InAppAgentRunStatus.QUEUED,
              finishedAt: null,
              errorCode: null,
              errorMessage: null,
            },
            shouldEnqueue: true,
          };
        }

        return {
          type: "continued" as const,
          run: existing,
          shouldEnqueue: existing.status === InAppAgentRunStatus.QUEUED,
        };
      }

      throw new LangfuseConflictError(
        "This approval is no longer pending. Reload the conversation.",
      );
    }

    if (
      parentRun.finishedAt &&
      Date.now() - parentRun.finishedAt.getTime() > IN_APP_AGENT_APPROVAL_TTL_MS
    ) {
      await tx.inAppAgentRun.updateMany({
        where: {
          id: params.interruptedRunId,
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

    const { count } = await tx.inAppAgentRun.updateMany({
      where: {
        id: params.interruptedRunId,
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

    const conversation = await tx.inAppAgentConversation.findUnique({
      where: {
        id_projectId: {
          id: params.conversationId,
          projectId: params.projectId,
        },
      },
      select: { alwaysAllowedTools: true },
    });
    const alwaysAllowedTools = new Set(conversation?.alwaysAllowedTools ?? []);

    for (const entry of resume) {
      const toolCallId = params.toolCallIdsByInterruptId[entry.interruptId];
      if (!toolCallId) {
        throw new LangfuseConflictError("Approval request not found.");
      }

      const alwaysAllowToolName =
        params.alwaysAllowToolNamesByInterruptId[entry.interruptId];
      if (alwaysAllowToolName) alwaysAllowedTools.add(alwaysAllowToolName);

      await appendConversationEventInTransaction({
        tx,
        projectId: params.projectId,
        conversationId: params.conversationId,
        runId: params.interruptedRunId,
        event: buildInAppAgentApprovalDecisionEvent({
          toolCallId,
          approved: entry.payload.approved,
          decidedByUserId: params.decidedByUserId,
          ...(alwaysAllowToolName ? { scope: "conversation" as const } : {}),
        }),
      });
    }

    if (
      alwaysAllowedTools.size !== (conversation?.alwaysAllowedTools.length ?? 0)
    ) {
      await tx.inAppAgentConversation.update({
        where: {
          id_projectId: {
            id: params.conversationId,
            projectId: params.projectId,
          },
        },
        data: { alwaysAllowedTools: [...alwaysAllowedTools] },
      });
    }

    const parentRequest = InAppAgentRunRequestSchema.safeParse(
      parentRun.request,
    );
    const context = parentRequest.success ? parentRequest.data.context : [];
    const turnId = await resolveInAppAgentLogicalTurnId({
      prisma: tx,
      projectId: params.projectId,
      conversationId: params.conversationId,
      runId: params.interruptedRunId,
      ...(parentRequest.success ? { request: parentRequest.data } : {}),
    });

    const run = await createRunRow(tx, {
      runId: params.continuationRunId,
      projectId: params.projectId,
      conversationId: params.conversationId,
      triggeredByUserId: params.decidedByUserId,
      model: params.model,
      request: {
        kind: "approvalDecisionBatch",
        interruptedRunId: params.interruptedRunId,
        turnId,
        batchFingerprint,
        resume,
        context,
      },
    });
    const input = {
      threadId: params.conversationId,
      runId: params.continuationRunId,
      state: {},
      messages: [],
      tools: [],
      context,
      forwardedProps: {},
      resume: resume satisfies AgUiResumeEntry[],
    };
    await appendConversationEventInTransaction({
      tx,
      projectId: params.projectId,
      conversationId: params.conversationId,
      runId: params.continuationRunId,
      event: {
        type: EventType.RUN_STARTED,
        threadId: params.conversationId,
        runId: params.continuationRunId,
        input,
      },
    });

    return { type: "continued" as const, run, shouldEnqueue: true };
  });

  if (outcome.type === "expired") {
    throw new LangfuseConflictError("The approval request expired.");
  }

  return { run: outcome.run, shouldEnqueue: outcome.shouldEnqueue };
}

export function getInAppAgentApprovalBatchFingerprint(params: {
  openInterruptIds: string[];
  resume: InAppAgentApprovalResumeEntry[];
}) {
  const resumeById = new Map(
    params.resume.map((entry) => [entry.interruptId, entry] as const),
  );
  const openInterruptIds = new Set(params.openInterruptIds);
  const hasExactInterruptSet =
    resumeById.size === openInterruptIds.size &&
    [...openInterruptIds].every((id) => resumeById.has(id)) &&
    params.resume.every((entry) => openInterruptIds.has(entry.interruptId));

  if (!hasExactInterruptSet) {
    throw new LangfuseConflictError(
      "Every pending approval must be decided before continuing.",
    );
  }

  const resume = params.openInterruptIds.map((id) => resumeById.get(id)!);
  return { resume, batchFingerprint: stableJsonStringify(resume) };
}

export async function findToolApprovalBatchContinuation(params: {
  prisma: PrismaClient | InAppAgentTx;
  projectId: string;
  conversationId: string;
  interruptedRunId: string;
  batchFingerprint: string;
}) {
  return params.prisma.inAppAgentRun.findFirst({
    where: {
      projectId: params.projectId,
      conversationId: params.conversationId,
      AND: [
        { request: { path: ["kind"], equals: "approvalDecisionBatch" } },
        {
          request: {
            path: ["interruptedRunId"],
            equals: params.interruptedRunId,
          },
        },
        {
          request: {
            path: ["batchFingerprint"],
            equals: params.batchFingerprint,
          },
        },
      ],
    },
  });
}

export type CancelRunResult = {
  cancelledImmediately: boolean;
  status: InAppAgentRunStatus | null;
};

/** Cancel every run that is executing or waiting on user approval. */
export async function cancelConversationRunsInTransaction(params: {
  tx: InAppAgentTx;
  projectId: string;
  conversationId: string;
}): Promise<string[]> {
  await lockConversation(params.tx, params.projectId, params.conversationId);

  const runs = await params.tx.inAppAgentRun.findMany({
    where: {
      projectId: params.projectId,
      conversationId: params.conversationId,
      // Parked approvals have finishedAt set but remain unsettled.
      status: {
        in: [
          InAppAgentRunStatus.QUEUED,
          InAppAgentRunStatus.RUNNING,
          InAppAgentRunStatus.AWAITING_APPROVAL,
        ],
      },
    },
    select: { id: true, status: true },
  });

  const cancelledImmediately: string[] = [];

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

    if (result.cancelledImmediately) {
      cancelledImmediately.push(run.id);
    }
  }

  return cancelledImmediately;
}

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

    return cancelRunInTransaction({
      tx,
      projectId: params.projectId,
      conversationId: params.conversationId,
      runId: params.runId,
      runStatus: parsedStatus.data,
    });
  });
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
      await params.deleteApiKey(run.mcpApiKeyId);
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
