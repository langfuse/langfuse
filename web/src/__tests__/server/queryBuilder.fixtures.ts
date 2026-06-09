import { QueryBuilder, executeQuery } from "@langfuse/shared/query/server";
import {
  getValidAggregationsForMeasureType,
  metricAggregations,
  validateQuery,
  type QueryType,
} from "@langfuse/shared/query";
import { env } from "@/src/env.mjs";
import {
  createTrace,
  createObservation,
  createTracesCh,
  createObservationsCh,
  createTraceScore,
  createScoresCh,
  createEvent,
  createEventsCh,
  clickhouseClient,
} from "@langfuse/shared/src/server";
import { randomUUID } from "crypto";

const setupTracesWithObservations = async (
  projectId: string,
  tracesData: Array<{
    name: string;
    environment?: string;
    userId?: string;
    sessionId?: string;
    observationCount?: number;
  }>,
) => {
  const traces = [];

  for (const data of tracesData) {
    const trace = createTrace({
      project_id: projectId,
      name: data.name,
      environment: data.environment || "default",
      user_id: data.userId,
      session_id: data.sessionId,
      timestamp: new Date().getTime(),
    });

    traces.push(trace);

    if (data.observationCount && data.observationCount > 0) {
      const observations = [];

      for (let i = 0; i < data.observationCount; i++) {
        observations.push(
          createObservation({
            project_id: projectId,
            trace_id: trace.id,
            environment: data.environment || "default",
            start_time: new Date().getTime(),
          }),
        );
      }

      await createObservationsCh(observations);
    }
  }

  await createTracesCh(traces);
  return traces;
};

const setupScores = async (
  projectId: string,
  scoresData: Array<{
    name: string;
    traceId: string;
    observationId?: string;
    value?: number;
    stringValue?: string;
    dataType: "NUMERIC" | "CATEGORICAL" | "BOOLEAN" | "TEXT" | "CORRECTION";
    source?: string;
    environment?: string;
  }>,
) => {
  const scores = [];

  for (const data of scoresData) {
    scores.push(
      createTraceScore({
        project_id: projectId,
        trace_id: data.traceId,
        observation_id: data.observationId,
        name: data.name,
        value: data.dataType === "NUMERIC" ? data.value || 0 : null,
        string_value: ["CATEGORICAL", "BOOLEAN", "TEXT"].includes(data.dataType)
          ? data.stringValue || ""
          : null,
        environment: data.environment || "default",
        source: data.source || "API",
        data_type: data.dataType,
      }),
    );
  }

  await createScoresCh(scores);
  return scores;
};

export {
  QueryBuilder,
  executeQuery,
  getValidAggregationsForMeasureType,
  metricAggregations,
  validateQuery,
  env,
  createTrace,
  createObservation,
  createTracesCh,
  createObservationsCh,
  createTraceScore,
  createScoresCh,
  createEvent,
  createEventsCh,
  clickhouseClient,
  randomUUID,
  setupTracesWithObservations,
  setupScores,
};
export type { QueryType };
