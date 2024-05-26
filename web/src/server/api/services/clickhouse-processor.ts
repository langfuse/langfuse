import {
  type ingestionEvent,
  type ObservationEvent,
  eventTypes,
  type traceEvent,
  type scoreEvent,
} from "@/src/features/public-api/server/ingestion-api-schema";
import { type ApiAccessScope } from "@/src/features/public-api/server/types";
import { type JsonNested } from "@/src/utils/zod";
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
    timestamp: new Date(score.timestamp).getTime() * 1000,
    name: score.body.name,
    value: score.body.value,
    source: "API",
    comment: score.body.comment,
    trace_id: score.body.traceId,
    observation_id: score.body.observationId ?? null,
    project_id: apiScope.projectId,
    event_ts: new Date(score.timestamp).getTime(),
    event_microseconds: extractMicroseconds(score.timestamp),
  }));

  console.log(`Inserting score into clickhouse ${JSON.stringify(insert)}`);
  if (insert.length === 0) {
    return;
  }
  await clickhouseClient.insert({
    table: "scores",
    format: "JSONEachRow",
    values: insert,
  });
};

const storeTraces = async (
  apiScope: ApiAccessScope,
  traces: z.infer<typeof traceEvent>[],
) => {
  console.log(`Storing traces ${JSON.stringify(traces)}`);
  const insert = traces.map((trace) => ({
    id: trace.body.id ?? v4(),
    // in the default implementation, we set timestamps server side if not provided.
    // we need to insert timestamps here and change the SDKs to send timestamps client side.
    timestamp: trace.body.timestamp
      ? new Date(trace.body.timestamp).getTime() * 1000
      : Date.now() * 1000,
    name: trace.body.name,
    user_id: trace.body.userId,
    metadata: trace.body.metadata
      ? convertJsonSchemaToRecord(trace.body.metadata)
      : undefined,
    release: trace.body.release,
    version: trace.body.version,
    project_id: apiScope.projectId,
    public: trace.body.public,
    bookmarked: false,
    tags: trace.body.tags ?? [],
    input: trace.body.input,
    output: trace.body.output,
    session_id: trace.body.sessionId,
    updated_at: Date.now() * 1000,
    created_at: Date.now() * 1000,
    event_ts: new Date(trace.timestamp).getTime(),
    event_microseconds: extractMicroseconds(trace.timestamp),
  }));

  console.log(
    `Inserting trace into clickhouse, ${env.CLICKHOUSE_URL} ${JSON.stringify(insert)}`,
  );
  if (insert.length === 0) {
    return;
  }
  await clickhouseClient.insert({
    table: "traces",
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

    // metadata needs to be converted to a record<string, string>.
    // prefix all keys with "metadata." if they are an array or primitive
    const convertedMetadata: Record<string, string> = {};

    if (typeof obs.body.metadata === "string") {
      convertedMetadata["metadata"] = obs.body.metadata;
    }

    return {
      id: obs.body.id ?? v4(),
      trace_id: obs.body.traceId ?? v4(),
      type: type,
      name: obs.body.name,
      start_time: obs.body.startTime
        ? new Date(obs.body.startTime).getTime() * 1000
        : undefined,
      end_time:
        "endTime" in obs.body && obs.body.endTime
          ? new Date(obs.body.endTime).getTime() * 1000
          : undefined,
      completion_start_time:
        "completionStartTime" in obs.body && obs.body.completionStartTime
          ? new Date(obs.body.completionStartTime).getTime() * 1000
          : undefined,
      metadata: obs.body.metadata
        ? convertJsonSchemaToRecord(obs.body.metadata)
        : undefined,
      model: "model" in obs.body ? obs.body.model : undefined,
      model_parameters:
        "modelParameters" in obs.body
          ? obs.body.modelParameters ?? undefined
          : undefined,
      input: obs.body.input ?? undefined,
      output: obs.body.output ?? undefined,
      // TODO: calculate tokens or ingest observed ons
      prompt_tokens: 0,
      completion_tokens: 0,
      // TODO should we still track that?
      total_tokens: 0,
      unit: "TOKENS",
      level: obs.body.level ?? "DEFAULT",
      status_message: obs.body.statusMessage ?? undefined,
      parent_observation_id: obs.body.parentObservationId ?? undefined,
      version: obs.body.version ?? undefined,
      project_id: apiScope.projectId,
      // todo: find prompt from postgres
      prompt_id: undefined,
      input_cost: "usage" in obs.body ? obs.body.usage?.inputCost : undefined,
      output_cost: "usage" in obs.body ? obs.body.usage?.outputCost : undefined,
      total_cost: "usage" in obs.body ? obs.body.usage?.totalCost : undefined,
      event_ts: new Date(obs.timestamp).getTime(),
      event_microseconds: extractMicroseconds(obs.timestamp),
    };
  });

  console.log(
    `Inserting observation into clickhouse, ${env.CLICKHOUSE_URL}, ${JSON.stringify(insert)}`,
  );
  if (insert.length === 0) {
    return;
  }
  return await clickhouseClient.insert({
    table: "observations",
    format: "JSONEachRow",
    values: insert,
  });
};

export const convertJsonSchemaToRecord = (
  jsonSchema: JsonNested,
): Record<string, string> => {
  const record: Record<string, string> = {};

  // if it's a literal, return the value with "metadata" prefix
  if (typeof jsonSchema === "string" || typeof jsonSchema === "number") {
    record["metadata"] = jsonSchema.toString();
    return record;
  }

  // if it's an array, add the stringified array with "metadata" prefix
  if (Array.isArray(jsonSchema)) {
    record["metadata"] = JSON.stringify(jsonSchema);
    return record;
  }

  // if it's an object, add each key value pair with a stringified value
  if (typeof jsonSchema === "object") {
    for (const key in jsonSchema) {
      record[key] = JSON.stringify(jsonSchema[key]);
    }
  }
  return record;
};

const extractMicroseconds = (timestamp: string): number => {
  // we get strings with high precision such as: 2024-05-26T16:34:28.181300000Z
  // extract the microseconds part and convert it to a number -> 181300000
  console.log(`Extracting microseconds from timestamp ${timestamp}`);

  return parseInt(timestamp.split(".")[1].split("Z")[0]);
};
