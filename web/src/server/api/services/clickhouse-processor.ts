import {
  type ingestionEvent,
  type ObservationEvent,
  eventTypes,
  type traceEvent,
  type scoreEvent,
} from "@/src/features/public-api/server/ingestion-api-schema";
import { type ApiAccessScope } from "@/src/features/public-api/server/types";
import { env } from "@langfuse/shared";
import { clickhouseClient } from "@langfuse/shared/backend";
import { v4 } from "uuid";
import { type z } from "zod";

export const ingest = async (
  apiScope: ApiAccessScope,
  events: z.infer<typeof ingestionEvent>[],
) => {
  const observationEvents: ObservationEvent[] = [];
  const traceEvents: z.infer<typeof traceEvent>[] = [];
  const scoreEvents: z.infer<typeof scoreEvent>[] = [];

  events.forEach((event) => {
    switch (event.type) {
      case eventTypes.TRACE_CREATE:
        traceEvents.push(event);
        break;
      case eventTypes.OBSERVATION_CREATE:
      case eventTypes.OBSERVATION_UPDATE:
      case eventTypes.EVENT_CREATE:
      case eventTypes.SPAN_CREATE:
      case eventTypes.SPAN_UPDATE:
      case eventTypes.GENERATION_CREATE:
      case eventTypes.GENERATION_UPDATE:
        observationEvents.push(event);
        break;
      case eventTypes.SCORE_CREATE: {
        scoreEvents.push(event);
        break;
      }
      case eventTypes.SDK_LOG:
        break;
    }
  });

  await Promise.all([
    storeObservations(apiScope, observationEvents),
    storeTraces(apiScope, traceEvents),
    storeScores(apiScope, scoreEvents),
  ]);
};

const storeScores = async (
  apiScope: ApiAccessScope,
  scores: z.infer<typeof scoreEvent>[],
) => {
  const insert = scores.map((score) => ({
    id: score.body.id ?? v4(),
    timestamp: new Date(score.timestamp).getTime(),
    name: score.body.name,
    value: score.body.value,
    source: "API",
    comment: score.body.comment,
    trace_id: score.body.traceId,
    observation_id: score.body.observationId ?? null,
    project_id: apiScope.projectId,
    event_ts: new Date(score.timestamp).getTime(),
  }));

  console.log(
    `Inserting score into clickhouse, ${env.CLICKHOUSE_URL} ${JSON.stringify(insert)}`,
  );
  await clickhouseClient.insert({
    table: "scores_raw",
    format: "JSONEachRow",
    values: insert,
  });
};

const storeTraces = async (
  apiScope: ApiAccessScope,
  traces: z.infer<typeof traceEvent>[],
) => {
  const insert = traces.map((trace) => ({
    id: trace.body.id ?? v4(),
    timestamp: trace.body.timestamp
      ? new Date(trace.body.timestamp).getTime()
      : Date.now(),
    name: trace.body.name,
    user_id: trace.body.userId,
    metadata: trace.body.metadata ?? {},
    release: trace.body.release,
    version: trace.body.version,
    project_id: apiScope.projectId,
    public: trace.body.public,
    bookmarked: false,
    tags: trace.body.tags ?? [],
    input: trace.body.input,
    output: trace.body.output,
    session_id: trace.body.sessionId,
    updated_at: Date.now(),
    created_at: Date.now(),
    event_ts: new Date(trace.timestamp).getTime(),
  }));

  console.log(
    `Inserting trace into clickhouse, ${env.CLICKHOUSE_URL} ${JSON.stringify(insert)}`,
  );
  await clickhouseClient.insert({
    table: "traces_raw",
    format: "JSONEachRow",
    values: insert,
  });
};

const storeObservations = async (
  apiScope: ApiAccessScope,
  observations: ObservationEvent[],
) => {
  const observationsToStore = observations.map((observation) => {
    return {
      ...observation,
      project_id: apiScope.projectId,
    };
  });

  const insert = observationsToStore.map((obs) => {
    let type: "EVENT" | "SPAN" | "GENERATION";
    switch (obs.type) {
      case eventTypes.OBSERVATION_CREATE:
      case eventTypes.OBSERVATION_UPDATE:
        type = obs.body.type;
        break;
      case eventTypes.EVENT_CREATE:
        type = "EVENT" as const;
        break;
      case eventTypes.SPAN_CREATE:
      case eventTypes.SPAN_UPDATE:
        type = "SPAN" as const;
        break;
      case eventTypes.GENERATION_CREATE:
      case eventTypes.GENERATION_UPDATE:
        type = "GENERATION" as const;
        break;
    }
    return {
      id: obs.body.id ?? v4(),
      traceId: obs.body.traceId ?? v4(),
      type: type,
      name: obs.body.name,
      startTime: obs.body.startTime ? new Date(obs.body.startTime) : undefined,
      endTime:
        "endTime" in obs.body && obs.body.endTime
          ? new Date(obs.body.endTime)
          : undefined,
      completionStartTime:
        "completionStartTime" in obs.body && obs.body.completionStartTime
          ? new Date(obs.body.completionStartTime)
          : undefined,
      metadata: obs.body.metadata ?? undefined,
      model: "model" in obs.body ? obs.body.model : undefined,
      modelParameters:
        "modelParameters" in obs.body
          ? obs.body.modelParameters ?? undefined
          : undefined,
      input: obs.body.input ?? undefined,
      output: obs.body.output ?? undefined,
      // TODO: calculate tokens or ingest observed ons
      promptTokens: 0,
      completionTokens: 0,
      // TODO should we still track that?
      totalTokens: 0,
      unit: "TOKENS",
      level: obs.body.level ?? undefined,
      statusMessage: obs.body.statusMessage ?? undefined,
      parentObservationId: obs.body.parentObservationId ?? undefined,
      version: obs.body.version ?? undefined,
      projectId: apiScope.projectId,
      // todo: find prompt from postgres
      promptId: undefined,
      inputCost: "usage" in obs.body ? obs.body.usage?.inputCost : undefined,
      outputCost: "usage" in obs.body ? obs.body.usage?.outputCost : undefined,
      totalCost: "usage" in obs.body ? obs.body.usage?.totalCost : undefined,
      event_ts: new Date(obs.timestamp).getTime(),
    };
  });

  console.log(
    `Inserting observation into clickhouse, ${env.CLICKHOUSE_URL}, ${JSON.stringify(insert)}`,
  );
  return await clickhouseClient.insert({
    table: "observations_raw",
    format: "JSONEachRow",
    values: insert,
  });
};
