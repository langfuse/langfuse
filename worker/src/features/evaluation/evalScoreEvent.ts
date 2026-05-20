import { randomUUID } from "crypto";
import { ScoreSourceEnum } from "@langfuse/shared";
import {
  eventTypes,
  ScoreEventType,
  type CodeEvalScoreWithName,
} from "@langfuse/shared/src/server";

export type EvalScoreWritePayload = {
  eventId: string;
  scoreId: string;
  event: ScoreEventType;
};

export function buildEvalScoreWritePayloads(params: {
  scores: CodeEvalScoreWithName[];
  primaryScoreId: string;
  traceId: string | null;
  observationId: string | null;
  environment: string;
  executionTraceId: string;
  executionMetadata: Record<string, string>;
}): EvalScoreWritePayload[] {
  return params.scores.map((score, index) => {
    const eventId = randomUUID();
    const scoreId = index === 0 ? params.primaryScoreId : randomUUID();

    return {
      eventId,
      scoreId,
      event: {
        id: eventId,
        timestamp: new Date().toISOString(),
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
          configId: score.configId,
          source: ScoreSourceEnum.EVAL,
          environment: params.environment,
          executionTraceId: params.executionTraceId,
          value: score.value,
          dataType: score.dataType,
        } as ScoreEventType["body"],
      },
    };
  });
}
