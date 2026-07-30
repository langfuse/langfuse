import { InAppAgentRunErrorCode, InAppAgentRunStatus } from "../../index";
import type { InAppAgentRun, PrismaClient } from "../../db";

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
