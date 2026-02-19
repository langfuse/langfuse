import pLimit from "p-limit";
import { prisma } from "@langfuse/shared/src/db";
import { BatchActionStatus, observationForEvalSchema } from "@langfuse/shared";
import { logger, traceException } from "@langfuse/shared/src/server";
import {
  createObservationEvalSchedulerDeps,
  scheduleObservationEvals,
  type ObservationEvalConfig,
} from "../evaluation/observationEval";

const BATCH_SIZE = 500;
const CONCURRENCY_LIMIT = 50;
const MAX_ERROR_LOG_LINES = 20;

export async function processBatchedObservationEval(params: {
  projectId: string;
  batchActionId: string;
  evaluators: ObservationEvalConfig[];
  observationStream: AsyncIterable<Record<string, unknown>>;
}): Promise<void> {
  const { projectId, batchActionId, evaluators, observationStream } = params;
  const limit = pLimit(CONCURRENCY_LIMIT);
  const schedulerDeps = createObservationEvalSchedulerDeps();

  await prisma.batchAction.update({
    where: { id: batchActionId, projectId },
    data: {
      status: BatchActionStatus.Processing,
      totalCount: 0,
      processedCount: 0,
      failedCount: 0,
      log: null,
    },
  });

  let totalCount = 0;
  let processedCount = 0;
  let failedCount = 0;
  const errors: string[] = [];

  let buffer: Record<string, unknown>[] = [];

  const processBatch = async (batch: Record<string, unknown>[]) => {
    const results = await Promise.allSettled(
      batch.map((record) =>
        limit(async () => {
          const observation = observationForEvalSchema.parse(record);
          await scheduleObservationEvals({
            observation,
            configs: evaluators,
            schedulerDeps,
          });
        }),
      ),
    );

    for (let i = 0; i < results.length; i++) {
      const result = results[i];

      if (result.status === "fulfilled") {
        processedCount++;
      } else {
        failedCount++;
        traceException(result.reason);

        if (errors.length < MAX_ERROR_LOG_LINES) {
          const errorMessage =
            result.reason instanceof Error
              ? result.reason.message
              : "Unknown error";
          errors.push(
            `Row ${totalCount - batch.length + i + 1}: ${errorMessage}`,
          );
        }
      }
    }

    await prisma.batchAction.update({
      where: { id: batchActionId, projectId },
      data: { totalCount, processedCount, failedCount },
    });
  };

  for await (const record of observationStream) {
    buffer.push(record);
    totalCount++;

    if (buffer.length >= BATCH_SIZE) {
      await processBatch(buffer);
      buffer = [];
    }
  }

  // Process remaining records
  if (buffer.length > 0) {
    await processBatch(buffer);
  }

  const finalStatus =
    failedCount === 0
      ? BatchActionStatus.Completed
      : processedCount === 0
        ? BatchActionStatus.Failed
        : BatchActionStatus.Partial;

  const errorSummary =
    errors.length > 0
      ? `${failedCount} observations failed while scheduling ${evaluators.length} evaluator(s): ${evaluators.map((evaluator) => evaluator.scoreName).join(", ")}.\n${errors.join("\n")}`
      : null;

  await prisma.batchAction.update({
    where: { id: batchActionId, projectId },
    data: {
      status: finalStatus,
      finishedAt: new Date(),
      totalCount,
      processedCount,
      failedCount,
      log: errorSummary,
    },
  });

  logger.info(
    `Completed observation-run-batched-evaluation action ${batchActionId}`,
    {
      totalCount,
      processedCount,
      failedCount,
      finalStatus,
    },
  );
}
