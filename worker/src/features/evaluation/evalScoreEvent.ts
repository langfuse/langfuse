import { randomUUID } from "crypto";
import { ScoreSourceEnum, type EvalExecutionContext } from "@langfuse/shared";
import {
  buildDeterministicEvalScoreIds,
  eventTypes,
  ScoreEventType,
  type CodeEvalScoreWithName,
} from "@langfuse/shared/src/server";

export type EvalScoreWritePayload = {
  eventId: string;
  scoreId: string;
  event: ScoreEventType & {
    body: ScoreEventType["body"] & {
      evaluatorId?: string;
      evaluationRuleId?: string;
    };
  };
};

export function buildEvalScoreWritePayloads(params: {
  scores: CodeEvalScoreWithName[];
  jobExecutionId: string;
  scoreTimestamp: Date;
  traceId: string | null;
  observationId: string | null;
  environment: string;
  executionTraceId: string;
  executionMetadata: Record<string, string>;
  evaluationContext: EvalExecutionContext;
}): EvalScoreWritePayload[] {
  const scoreIds = buildDeterministicEvalScoreIds({
    scores: params.scores,
    jobExecutionId: params.jobExecutionId,
  });

  return params.scores.map((score, index) => {
    const eventId = randomUUID();
    const scoreId = scoreIds[index]!;
    return {
      eventId,
      scoreId,
      event: {
        id: eventId,
        // The score's ClickHouse key includes its UTC date. Keep it stable
        // across retries, including retries that run on a different day.
        timestamp: params.scoreTimestamp.toISOString(),
        type: eventTypes.SCORE_CREATE,
        body: {
          id: scoreId,
          traceId: params.traceId,
          observationId: params.observationId,
          name: score.name,
          comment: score.comment,
          metadata: {
            ...(score.metadata ?? {}),
            ...params.executionMetadata,
          },
          evaluatorId: params.evaluationContext.evaluatorId,
          evaluationRuleId: params.evaluationContext.evaluationRuleId,
          configId: score.configId,
          source: ScoreSourceEnum.EVAL,
          environment: params.environment,
          executionTraceId: params.executionTraceId,
          value: score.value,
          dataType: score.dataType,
        } as EvalScoreWritePayload["event"]["body"],
      },
    };
  });
}
