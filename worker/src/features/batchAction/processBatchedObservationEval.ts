import pLimit from "p-limit";
import { prisma } from "@langfuse/shared/src/db";
import {
  BatchActionStatus,
  EventsStreamCursorSchema,
  observationForEvalSchema,
  type EventsStreamCursor,
} from "@langfuse/shared";
import { logger, traceException } from "@langfuse/shared/src/server";
import { createObservationEvalSchedulerDeps } from "../evaluation/observationEval/createSchedulerDeps";
import { scheduleObservationEvals } from "../evaluation/observationEval/scheduleObservationEvals";
import type { ObservationEvalRule } from "../evaluation/observationEval/types";

const BATCH_SIZE = 500;
const CONCURRENCY_LIMIT = 50;
const MAX_ERROR_LOG_LINES = 20;

/**
 * Schedules the evaluators on every streamed observation. Progress is
 * checkpointed after each chunk, so a retried job resumes behind the last
 * finished row instead of starting over.
 */
export async function processBatchedObservationEval(params: {
  projectId: string;
  batchActionId: string;
  evaluators: ObservationEvalRule[];
  evaluatorLabels?: string[];
  rowLimit: number;
  openObservationStream: (resume: {
    after?: EventsStreamCursor;
    rowLimit: number;
  }) => Promise<AsyncIterable<ObservationStreamRecord>>;
}): Promise<void> {
  const {
    projectId,
    batchActionId,
    evaluators,
    evaluatorLabels,
    rowLimit,
    openObservationStream,
  } = params;
  const limit = pLimit(CONCURRENCY_LIMIT);
  const schedulerDeps = createObservationEvalSchedulerDeps();

  const checkpoint = await prisma.batchAction.findUniqueOrThrow({
    where: { id: batchActionId, projectId },
    select: {
      cursor: true,
      totalCount: true,
      processedCount: true,
      failedCount: true,
    },
  });
  const resumeCursor = EventsStreamCursorSchema.safeParse(checkpoint.cursor);
  const isResuming = resumeCursor.success;

  await prisma.batchAction.update({
    where: { id: batchActionId, projectId },
    data: isResuming
      ? { status: BatchActionStatus.Processing }
      : {
          status: BatchActionStatus.Processing,
          totalCount: 0,
          processedCount: 0,
          failedCount: 0,
          log: null,
        },
  });

  let totalCount = isResuming ? (checkpoint.totalCount ?? 0) : 0;
  let processedCount = isResuming ? (checkpoint.processedCount ?? 0) : 0;
  let failedCount = isResuming ? (checkpoint.failedCount ?? 0) : 0;
  const errors: string[] = [];

  let buffer: ObservationStreamRecord[] = [];

  const processBatch = async (batch: ObservationStreamRecord[]) => {
    const results = await Promise.allSettled(
      batch.map((record) =>
        limit(async () => {
          const toolCallNames = Array.isArray(record.tool_call_names)
            ? record.tool_call_names
            : [];
          const observation = observationForEvalSchema.parse({
            ...record,
            tool_call_count: toolCallNames.length,
          });
          await scheduleObservationEvals({
            observation,
            configs: evaluators,
            schedulerDeps,
            executionMode: "MANUAL",
            executionScopeId: batchActionId,
            batchActionId,
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

    // The cursor must move together with the counts, or a resumed run would
    // count the rows between them twice.
    await prisma.batchAction.update({
      where: { id: batchActionId, projectId },
      data: {
        totalCount,
        processedCount,
        failedCount,
        cursor: batch[batch.length - 1].cursor,
      },
    });
  };

  const observationStream = await openObservationStream({
    after: isResuming ? resumeCursor.data : undefined,
    rowLimit: rowLimit - totalCount,
  });

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

  const finalStatus = (() => {
    if (failedCount === 0) {
      return BatchActionStatus.Completed;
    }
    if (processedCount === 0) {
      return BatchActionStatus.Failed;
    }
    return BatchActionStatus.Partial;
  })();

  const errorSummary =
    errors.length > 0
      ? `${failedCount} observations failed while scheduling ${evaluators.length} evaluator(s): ${(evaluatorLabels ?? evaluators.map((evaluator) => ("scoreName" in evaluator ? evaluator.scoreName : evaluator.id))).join(", ")}.\n${errors.join("\n")}`
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
      resumed: isResuming,
    },
  );
}

type ObservationStreamRecord = Record<string, unknown> & {
  cursor: EventsStreamCursor;
};
