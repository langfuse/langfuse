import { randomUUID } from "crypto";

import { prisma } from "@langfuse/shared/src/db";
import {
  InAppAgentRunQueue,
  logger,
  QueueJobs,
  recordGauge,
  recordIncrement,
} from "@langfuse/shared/src/server";
import {
  findInAppAgentLifecycleWork,
  getOldestQueuedRunCreatedAt,
  terminalizeStaleRun,
  type InAppAgentTerminalWorkItem,
} from "@langfuse/shared/in-app-agent/server";

const METRIC_PREFIX = "langfuse.in_app_agent_lifecycle";

/**
 * Bounded per tick so a backlog cannot turn one sweep into a long transaction
 * storm. Anything left over is picked up by the next tick five seconds later.
 */
const REDISPATCH_LIMIT = 50;
const TERMINALIZE_LIMIT = 50;

/**
 * Recover background agent runs without a browser attached.
 *
 * BullMQ delivery for this feature is intentionally one-shot (`attempts: 1`,
 * `maxStalledCount: 0`), because a redelivered run can re-execute an approved
 * mutation. That trade only holds if something else notices abandoned work,
 * which is this sweep.
 */
export async function runInAppAgentLifecycleRecovery(): Promise<void> {
  const oldestQueuedAt = await getOldestQueuedRunCreatedAt(prisma);
  recordGauge(
    `${METRIC_PREFIX}.oldest_queued_run_age_seconds`,
    oldestQueuedAt
      ? Math.max(Math.floor((Date.now() - oldestQueuedAt.getTime()) / 1000), 0)
      : 0,
  );

  const work = await findInAppAgentLifecycleWork({
    prisma,
    redispatchLimit: REDISPATCH_LIMIT,
    terminalizeLimit: TERMINALIZE_LIMIT,
  });

  recordIncrement(`${METRIC_PREFIX}.candidates`, work.candidateCount);

  if (work.candidateCount === 0) {
    return;
  }

  for (const candidate of work.redispatch) {
    await redispatchRun(candidate);
  }

  for (const item of work.terminalize) {
    await applyTerminalTransition(item);
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

    if (applied) {
      logger.info("Reconciled stale in-app agent run", {
        projectId: item.run.projectId,
        conversationId: item.run.conversationId,
        runId: item.run.id,
        errorCode: item.errorCode,
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
