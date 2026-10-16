import { JobExecutionStatus } from "@prisma/client";
import type { EvalExecutionContext } from "@langfuse/shared";
import {
  logger,
  traceException,
  type CodeEvalScoreWithName,
} from "@langfuse/shared/src/server";
import { buildEvalScoreWritePayloads } from "./evalScoreEvent";
import { type EvalExecutionDeps } from "./evalExecutionDeps";
import { EvalFailureError, EvalFailureReason } from "./evalFailureErrors";
import {
  recordEvalScorePersistenceOutcome,
  type ObservationEvalExecutionType,
} from "./evalExecutionMetrics";

/**
 * Common result returned by every evaluator executor (LLM-as-judge,
 * code-based, future executors). The first persisted score payload is treated
 * as primary and is persisted on `JobExecution.jobOutputScoreId`.
 */
export type EvalExecutionResult = {
  scores: CodeEvalScoreWithName[];
  executionTraceId: string;
  metadata: Record<string, string>;
  evaluationContext: EvalExecutionContext;
};

export async function completeEvalExecution({
  projectId,
  jobExecutionId,
  result,
  traceId,
  observationId,
  environment,
  executionType,
  deps,
  onEvaluatorCompleted,
}: {
  projectId: string;
  jobExecutionId: string;
  result: EvalExecutionResult;
  traceId: string | null;
  observationId: string | null;
  environment: string;
  executionType: ObservationEvalExecutionType;
  deps: EvalExecutionDeps;
  onEvaluatorCompleted?: (result: EvalExecutionResult) => Promise<void>;
}): Promise<{ scoreCount: number }> {
  const scoreWritePayloads = buildEvalScoreWritePayloads({
    scores: result.scores,
    jobExecutionId,
    traceId,
    observationId,
    environment,
    executionTraceId: result.executionTraceId,
    executionMetadata: result.metadata,
    evaluationContext: result.evaluationContext,
  });
  const [firstScorePayload] = scoreWritePayloads;

  if (!firstScorePayload) {
    throw new Error(`Evaluation job ${jobExecutionId} returned no scores`);
  }
  const jobOutputScoreId = firstScorePayload.scoreId;

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
    recordEvalScorePersistenceOutcome(
      executionType,
      "failure",
      scoreWritePayloads.length,
    );
    logger.error(`Failed to persist score: ${e}`, e);
    traceException(e);
    throw new EvalFailureError(
      `Failed to write score ${jobOutputScoreId} into IngestionQueue`,
      EvalFailureReason.ScorePersistence,
    );
  }

  recordEvalScorePersistenceOutcome(
    executionType,
    "success",
    scoreWritePayloads.length,
  );
  logger.debug(
    `Persisted ${scoreWritePayloads.length} score(s) for job ${jobExecutionId}`,
  );

  if (
    !result.evaluationContext.evaluatorExecutionIsTest &&
    onEvaluatorCompleted
  ) {
    // Evaluator-result triggers are experimental and currently best-effort.
    // Once scores are persisted, scheduling failures are logged without
    // retrying or failing the completed upstream evaluation.
    try {
      await onEvaluatorCompleted(result);
    } catch (error) {
      logger.error("Failed to schedule evaluator result rules", {
        projectId,
        jobExecutionId,
        error,
      });
      traceException(error);
    }
  }

  await deps.updateJobExecution({
    id: jobExecutionId,
    projectId,
    data: {
      status: JobExecutionStatus.COMPLETED,
      endTime: new Date(),
      jobOutputScoreId,
      executionTraceId: result.executionTraceId,
    },
  });

  return { scoreCount: scoreWritePayloads.length };
}
