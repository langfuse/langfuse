import { randomUUID } from "node:crypto";

import { BaseError } from "../../errors/BaseError";
import {
  InAppAgentRunErrorCode,
  InAppAgentRunStatus,
} from "../../features/inAppAgent/types";
import { InAppAgentRunQueue, logger, QueueJobs } from "../../server";
import type { PrismaClient } from "../../db";

export async function enqueueInAppAgentRun(params: {
  prisma: PrismaClient;
  projectId: string;
  runId: string;
}): Promise<void> {
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
