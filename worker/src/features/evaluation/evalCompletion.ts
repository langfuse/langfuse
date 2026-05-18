import { JobExecutionStatus } from "@prisma/client";
import { logger, traceException } from "@langfuse/shared/src/server";
import { type EvalOutputResult } from "@langfuse/shared";
import { buildEvalScoreWritePayloads } from "./evalScoreEvent";
import { type EvalExecutionDeps } from "./evalExecutionDeps";

export type EvalExecutionResult = {
  outputResult: EvalOutputResult;
  primaryScoreId: string;
  executionTraceId: string;
  metadata: Record<string, string>;
};

export async function completeEvalExecution({
  projectId,
  jobExecutionId,
  outputResult,
  primaryScoreId,
  traceId,
  observationId,
  scoreName,
  environment,
  executionTraceId,
  metadata,
  deps,
}: {
  projectId: string;
  jobExecutionId: string;
  outputResult: EvalOutputResult;
  primaryScoreId: string;
  traceId: string | null;
  observationId: string | null;
  scoreName: string;
  environment: string;
  executionTraceId: string;
  metadata: Record<string, string>;
  deps: EvalExecutionDeps;
}): Promise<{ scoreCount: number }> {
  const scoreWritePayloads = buildEvalScoreWritePayloads({
    outputResult,
    primaryScoreId,
    traceId,
    observationId,
    scoreName,
    environment,
    executionTraceId,
    metadata,
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
      `Failed to write score ${primaryScoreId} into IngestionQueue`,
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
      jobOutputScoreId: primaryScoreId,
      executionTraceId,
    },
  });

  return { scoreCount: scoreWritePayloads.length };
}
