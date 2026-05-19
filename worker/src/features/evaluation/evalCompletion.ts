import { JobExecutionStatus } from "@prisma/client";
import {
  logger,
  traceException,
  type CodeEvalScoreWithName,
} from "@langfuse/shared/src/server";
import { buildEvalScoreWritePayloads } from "./evalScoreEvent";
import { type EvalExecutionDeps } from "./evalExecutionDeps";

/**
 * Common result returned by every evaluator executor (LLM-as-judge,
 * code-based, future executors). The first entry of `scores` is the primary
 * score and is persisted on `JobExecution.jobOutputScoreId`.
 */
export type EvalExecutionResult = {
  scores: CodeEvalScoreWithName[];
  primaryScoreId: string;
  executionTraceId: string;
  metadata: Record<string, string>;
};

export async function completeEvalExecution({
  projectId,
  jobExecutionId,
  result,
  traceId,
  observationId,
  environment,
  deps,
}: {
  projectId: string;
  jobExecutionId: string;
  result: EvalExecutionResult;
  traceId: string | null;
  observationId: string | null;
  environment: string;
  deps: EvalExecutionDeps;
}): Promise<{ scoreCount: number }> {
  const scoreWritePayloads = buildEvalScoreWritePayloads({
    scores: result.scores,
    primaryScoreId: result.primaryScoreId,
    traceId,
    observationId,
    environment,
    executionTraceId: result.executionTraceId,
    executionMetadata: result.metadata,
  });

  try {
    await Promise.all(
      scoreWritePayloads.map(async ({ scoreId, eventId, event }) => {
        await deps.uploadScore({
          projectId,
          scoreId,
          eventId,
          event,
        });

        await deps.enqueueScoreIngestion({
          projectId,
          scoreId,
          eventId,
        });
      }),
    );
  } catch (e) {
    logger.error(`Failed to persist score: ${e}`, e);
    traceException(e);
    throw new Error(
      `Failed to write score ${result.primaryScoreId} into IngestionQueue`,
    );
  }

  logger.debug(
    `Persisted ${scoreWritePayloads.length} score(s) for job ${jobExecutionId}`,
  );

  await deps.updateJobExecution({
    id: jobExecutionId,
    projectId,
    data: {
      status: JobExecutionStatus.COMPLETED,
      endTime: new Date(),
      jobOutputScoreId: result.primaryScoreId,
      executionTraceId: result.executionTraceId,
    },
  });

  return { scoreCount: scoreWritePayloads.length };
}
