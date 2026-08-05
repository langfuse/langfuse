import { randomUUID } from "crypto";

import { prisma } from "@langfuse/shared/src/db";
import {
  InAppAgentRunQueue,
  logger,
  QueueJobs,
  recordGauge,
  recordIncrement,
  redis,
} from "@langfuse/shared/src/server";
import { deleteApiKeyFromDb } from "@langfuse/shared/src/server/auth/apiKeys";
import {
  findInAppAgentLifecycleWork,
  terminalizeStaleRun,
  type InAppAgentTerminalWorkItem,
} from "@langfuse/shared/in-app-agent/server";

const METRIC_PREFIX = "langfuse.in_app_agent_lifecycle";

/**
 * Bounded per tick so a backlog cannot turn one sweep into a write storm.
 * Anything left over is picked up by the next tick five seconds later.
 */
const REDISPATCH_LIMIT = 50;
const TERMINALIZE_LIMIT = 50;
const ORPHAN_CREDENTIAL_BATCH = 100;

/**
 * Comfortably beyond RUN_MAX_DURATION (15 min) plus heartbeat fencing, so this
 * can never revoke a credential a live run is still using.
 */
const ORPHAN_CREDENTIAL_AGE_MS = 30 * 60_000;

/**
 * Recover background agent runs without a browser attached.
 *
 * BullMQ delivery for this feature is intentionally one-shot (`attempts: 1`,
 * `maxStalledCount: 0`), because a redelivered run can re-execute an approved
 * mutation. That trade only holds if something else notices abandoned work,
 * which is this sweep.
 */
export async function runInAppAgentLifecycleRecovery(): Promise<void> {
  const work = await findInAppAgentLifecycleWork({
    prisma,
    redispatchLimit: REDISPATCH_LIMIT,
    terminalizeLimit: TERMINALIZE_LIMIT,
  });

  recordIncrement(`${METRIC_PREFIX}.candidates`, work.candidateCount);
  recordGauge(
    `${METRIC_PREFIX}.oldest_queued_run_age_seconds`,
    work.oldestQueuedRunAt
      ? Math.max(
          Math.floor((Date.now() - work.oldestQueuedRunAt.getTime()) / 1000),
          0,
        )
      : 0,
  );

  for (const candidate of work.redispatch) {
    await redispatchRun(candidate);
  }

  for (const item of work.terminalize) {
    await applyTerminalTransition(item);
  }
}

/**
 * Backstop for ephemeral MCP credentials, deliberately hourly.
 *
 * A run's credential is normally revoked by the worker's own `onFinish`, or —
 * when that worker died — by `applyTerminalTransition` at the moment the sweep
 * terminalizes the run. This only catches what both missed, including keys
 * whose run row was cascade-deleted with its project. Its query cannot use an
 * index (`api_keys` has none on `is_in_app_agent_key`), so a frequent pass
 * would sequentially scan to find nothing, and the secret never leaves the
 * process that minted it, so what is left here is hygiene, not exposure.
 */
export async function runInAppAgentCredentialMaintenance(): Promise<void> {
  const keys = await prisma.apiKey.findMany({
    where: {
      isInAppAgentKey: true,
      scope: "PROJECT",
      projectId: { not: null },
      createdAt: { lt: new Date(Date.now() - ORPHAN_CREDENTIAL_AGE_MS) },
    },
    orderBy: { createdAt: "asc" },
    take: ORPHAN_CREDENTIAL_BATCH,
    select: { id: true, projectId: true },
  });

  if (keys.length === 0) {
    return;
  }

  // One lookup for the whole batch: a key still pointed at by an unfinished run
  // belongs to a run that outlived the age threshold, not to an orphan.
  const referenced = await prisma.inAppAgentRun.findMany({
    where: { finishedAt: null, mcpApiKeyId: { in: keys.map((key) => key.id) } },
    select: { mcpApiKeyId: true },
  });
  const referencedKeyIds = new Set(
    referenced.flatMap((run) => (run.mcpApiKeyId ? [run.mcpApiKeyId] : [])),
  );

  for (const key of keys) {
    if (!key.projectId || referencedKeyIds.has(key.id)) {
      continue;
    }

    try {
      await revokeCredential({ apiKeyId: key.id, projectId: key.projectId });
      recordIncrement(`${METRIC_PREFIX}.action`, 1, {
        action: "orphan_credential",
        outcome: "applied",
      });
    } catch (error) {
      recordIncrement(`${METRIC_PREFIX}.action`, 1, {
        action: "orphan_credential",
        outcome: "failed",
      });
      logger.error("Failed to revoke orphaned in-app agent credential", {
        error,
        projectId: key.projectId,
        apiKeyId: key.id,
      });
    }
  }
}

/**
 * Re-deliver a run whose job never made it to the queue, or whose worker died
 * before claiming it. Safe to repeat: the claim CAS turns a duplicate delivery
 * into a no-op, and BullMQ deduplicates a job ID that is still waiting.
 */
async function redispatchRun(candidate: {
  runId: string;
  projectId: string;
}): Promise<void> {
  try {
    const queue = InAppAgentRunQueue.getInstance();

    if (!queue) {
      throw new Error("In-app agent run queue is unavailable");
    }

    // `add` against an existing job ID is a silent no-op, so a job left behind
    // in a terminal state would poison this run's deterministic ID and make
    // recovery quietly stop working. The queue is configured not to retain
    // terminal jobs; clear one anyway rather than depend on that constant.
    const existing = await queue.getJob(candidate.runId);

    if (
      existing &&
      ((await existing.isFailed()) || (await existing.isCompleted()))
    ) {
      await existing.remove();
    }

    await queue.add(
      QueueJobs.InAppAgentRunJob,
      {
        timestamp: new Date(),
        id: randomUUID(),
        name: QueueJobs.InAppAgentRunJob,
        payload: { projectId: candidate.projectId, runId: candidate.runId },
      },
      { jobId: candidate.runId },
    );

    recordIncrement(`${METRIC_PREFIX}.action`, 1, {
      action: "redispatch",
      outcome: "applied",
    });
  } catch (error) {
    // The run row is untouched, so the next tick tries again until the queue
    // timeout classifies it. Never let one bad row abort the sweep.
    recordIncrement(`${METRIC_PREFIX}.action`, 1, {
      action: "redispatch",
      outcome: "failed",
    });
    logger.error("Failed to redispatch in-app agent run", {
      error,
      projectId: candidate.projectId,
      runId: candidate.runId,
    });
  }
}

async function applyTerminalTransition(
  item: InAppAgentTerminalWorkItem,
): Promise<void> {
  try {
    const applied = await terminalizeStaleRun({ prisma, item });

    recordIncrement(`${METRIC_PREFIX}.action`, 1, {
      action: "terminalize",
      outcome: applied ? "applied" : "raced",
      error_code: item.errorCode,
    });

    if (!applied) {
      return;
    }

    logger.info("Reconciled stale in-app agent run", {
      projectId: item.run.projectId,
      conversationId: item.run.conversationId,
      runId: item.run.id,
      errorCode: item.errorCode,
    });

    // The run is dead and its worker never revoked the credential it minted.
    // Doing it here, off a row we already hold, bounds the credential's life to
    // one sweep tick instead of the hourly backstop's sequential scan.
    if (item.run.mcpApiKeyId) {
      await revokeCredential({
        apiKeyId: item.run.mcpApiKeyId,
        projectId: item.run.projectId,
      });

      recordIncrement(`${METRIC_PREFIX}.action`, 1, {
        action: "terminal_credential",
        outcome: "applied",
      });
    }
  } catch (error) {
    recordIncrement(`${METRIC_PREFIX}.action`, 1, {
      action: "terminalize",
      outcome: "failed",
      error_code: item.errorCode,
    });
    logger.error("Failed to reconcile stale in-app agent run", {
      error,
      projectId: item.run.projectId,
      runId: item.run.id,
    });
  }
}

/**
 * Delete the credential, then drop every pointer to it. An already-absent key
 * is a success: a previous attempt evidently landed, and the pointer still
 * needs clearing. The pointer is cleared only after the delete, because while
 * the key exists that pointer is the only way back to it.
 */
async function revokeCredential(params: {
  apiKeyId: string;
  projectId: string;
}): Promise<void> {
  const existing = await prisma.apiKey.findUnique({
    where: { id: params.apiKeyId },
    select: { id: true },
  });

  if (existing) {
    await deleteApiKeyFromDb({
      prisma,
      id: params.apiKeyId,
      entityId: params.projectId,
      scope: "PROJECT",
      redis,
    });
  }

  await prisma.inAppAgentRun.updateMany({
    where: { mcpApiKeyId: params.apiKeyId },
    data: { mcpApiKeyId: null },
  });
}
