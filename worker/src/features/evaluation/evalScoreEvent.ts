import { randomUUID } from "crypto";
import {
  type EvalOutputResult,
  ScoreDataTypeEnum,
  ScoreSourceEnum,
} from "@langfuse/shared";
import { eventTypes, ScoreEventType } from "@langfuse/shared/src/server";

type BuildScoreEventBase = {
  eventId: string;
  scoreId: string;
  traceId: string | null;
  observationId: string | null;
  scoreName: string;
  reasoning: string;
  environment: string;
  executionTraceId: string;
  metadata: Record<string, string>;
};

export type BuildScoreEventParams = BuildScoreEventBase &
  (
    | {
        dataType: typeof ScoreDataTypeEnum.NUMERIC;
        scoreValue: number;
      }
    | {
        dataType: typeof ScoreDataTypeEnum.CATEGORICAL;
        scoreValue: string;
      }
  );

function createScoreEventEnvelope(params: {
  eventId: string;
  body: ScoreEventType["body"];
}): ScoreEventType {
  return {
    id: params.eventId,
    timestamp: new Date().toISOString(),
    type: eventTypes.SCORE_CREATE,
    body: params.body,
  };
}

export type EvalScoreWritePayload = {
  eventId: string;
  scoreId: string;
  event: ScoreEventType;
};

export function buildScoreEvent(params: BuildScoreEventParams): ScoreEventType {
  const bodyBase = {
    id: params.scoreId,
    traceId: params.traceId,
    observationId: params.observationId,
    name: params.scoreName,
    comment: params.reasoning,
    source: ScoreSourceEnum.EVAL,
    environment: params.environment,
    executionTraceId: params.executionTraceId,
    metadata: params.metadata,
  };

  if (params.dataType === ScoreDataTypeEnum.CATEGORICAL) {
    return createScoreEventEnvelope({
      eventId: params.eventId,
      body: {
        ...bodyBase,
        value: params.scoreValue,
        dataType: ScoreDataTypeEnum.CATEGORICAL,
      },
    });
  }

  return createScoreEventEnvelope({
    eventId: params.eventId,
    body: {
      ...bodyBase,
      value: params.scoreValue,
      dataType: ScoreDataTypeEnum.NUMERIC,
    },
  });
}

function buildScoreWritePayload(
  params: Omit<BuildScoreEventParams, "eventId">,
): EvalScoreWritePayload {
  const eventId = randomUUID();

  return {
    eventId,
    scoreId: params.scoreId,
    event: buildScoreEvent({
      ...params,
      eventId,
    }),
  };
}

export function buildEvalScoreWritePayloads(params: {
  outputResult: EvalOutputResult;
  primaryScoreId: string;
  traceId: string | null;
  observationId: string | null;
  scoreName: string;
  environment: string;
  executionTraceId: string;
  metadata: Record<string, string>;
}): EvalScoreWritePayload[] {
  const commonParams = {
    traceId: params.traceId,
    observationId: params.observationId,
    scoreName: params.scoreName,
    reasoning: params.outputResult.reasoning,
    environment: params.environment,
    executionTraceId: params.executionTraceId,
    metadata: params.metadata,
  };

  if (params.outputResult.dataType === ScoreDataTypeEnum.NUMERIC) {
    return [
      buildScoreWritePayload({
        ...commonParams,
        scoreId: params.primaryScoreId,
        scoreValue: params.outputResult.score,
        dataType: ScoreDataTypeEnum.NUMERIC,
      }),
    ];
  }

  return params.outputResult.matches.map((scoreValue, index) =>
    buildScoreWritePayload({
      ...commonParams,
      scoreId: index === 0 ? params.primaryScoreId : randomUUID(),
      scoreValue,
      dataType: ScoreDataTypeEnum.CATEGORICAL,
    }),
  );
}
