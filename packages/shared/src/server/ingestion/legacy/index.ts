import { env } from "node:process";
import z from "zod";
import { ForbiddenError, UnauthorizedError } from "../../../errors";
import { eventTypes, ingestionApiSchema, ingestionEvent } from "../types";
import {
  EventProcessor,
  TraceProcessor,
  ObservationProcessor,
  ScoreProcessor,
  SdkLogProcessor,
} from "./EventProcessor";
import { EventBodyType, EventName, TraceUpsertEventType } from "../../queues";
import {
  convertTraceUpsertEventsToRedisEvents,
  getTraceUpsertQueue,
} from "../../redis/trace-upsert";
import { ApiAccessScope, AuthHeaderVerificationResult } from "../../auth/types";
import { redis } from "../../redis/redis";
import { backOff } from "exponential-backoff";
import { Model } from "../../..";
import { enqueueIngestionEvents } from "./enqueueIngestionEvents";

export type BatchResult = {
  result: unknown;
  id: string;
  type: string;
};

type TokenCountInput = {
  model: Model;
  text: unknown;
};

export const handleBatch = async (
  events: z.infer<typeof ingestionApiSchema>["batch"],
  authCheck: AuthHeaderVerificationResult,
  calculateTokenDelegate: (p: TokenCountInput) => number | undefined
) => {
  console.log(`handling ingestion ${events.length} events`);

  if (!authCheck.validKey) throw new UnauthorizedError(authCheck.error);

  const results: BatchResult[] = []; // Array to store the results

  const errors: {
    error: unknown;
    id: string;
    type: string;
  }[] = []; // Array to store the errors

  for (const singleEvent of events) {
    try {
      const result = await retry(async () => {
        return await handleSingleEvent(
          singleEvent,
          authCheck.scope,
          calculateTokenDelegate
        );
      });
      results.push({
        result: result,
        id: singleEvent.id,
        type: singleEvent.type,
      }); // Push each result into the array
    } catch (error) {
      // Handle or log the error if `handleSingleEvent` fails
      console.error("Error handling event:", error);
      // Decide how to handle the error: rethrow, continue, or push an error object to results
      // For example, push an error object:
      errors.push({
        error: error,
        id: singleEvent.id,
        type: singleEvent.type,
      });
    }
  }

  if (env.CLICKHOUSE_URL) {
    try {
      await enqueueIngestionEvents(authCheck.scope.projectId, events);
      console.log(`Added ${events.length} ingestion events to queue`);
    } catch (err) {
      console.error("Error adding ingestion events to queue", err);
    }
  }

  return { results, errors };
};

async function retry<T>(request: () => Promise<T>): Promise<T> {
  return await backOff(request, {
    numOfAttempts: env.LANGFUSE_ASYNC_INGESTION_PROCESSING === "true" ? 5 : 3,
    retry: (e: Error, attemptNumber: number) => {
      if (e instanceof UnauthorizedError || e instanceof ForbiddenError) {
        console.log("not retrying auth error");
        return false;
      }
      console.log(`retrying processing events ${attemptNumber}`);
      return true;
    },
  });
}

const handleSingleEvent = async (
  event: z.infer<typeof ingestionEvent>,
  apiScope: ApiAccessScope,
  calculateTokenDelegate: (p: {
    model: Model;
    text: unknown;
  }) => number | undefined
) => {
  const { body } = event;
  let restEvent = body;
  if ("input" in body) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { input, ...rest } = body;
    restEvent = rest;
  }
  if ("output" in restEvent) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { output, ...rest } = restEvent;
    restEvent = rest;
  }

  console.log(
    `handling single event ${event.id} of type ${event.type}:  ${JSON.stringify({ body: restEvent })}`
  );

  const cleanedEvent = ingestionEvent.parse(cleanEvent(event));

  const { type } = cleanedEvent;

  let processor: EventProcessor;
  switch (type) {
    case eventTypes.TRACE_CREATE:
      processor = new TraceProcessor(cleanedEvent);
      break;
    case eventTypes.OBSERVATION_CREATE:
    case eventTypes.OBSERVATION_UPDATE:
    case eventTypes.EVENT_CREATE:
    case eventTypes.SPAN_CREATE:
    case eventTypes.SPAN_UPDATE:
    case eventTypes.GENERATION_CREATE:
    case eventTypes.GENERATION_UPDATE:
      processor = new ObservationProcessor(
        cleanedEvent,
        calculateTokenDelegate
      );
      break;
    case eventTypes.SCORE_CREATE: {
      processor = new ScoreProcessor(cleanedEvent);
      break;
    }
    case eventTypes.SDK_LOG:
      processor = new SdkLogProcessor(cleanedEvent);
  }

  // Deny access to non-score events if the access level is not "all"
  // This is an additional safeguard to auth checks in EventProcessor
  if (apiScope.accessLevel !== "all" && type !== eventTypes.SCORE_CREATE) {
    throw new ForbiddenError("Access denied. Event type not allowed.");
  }

  return await processor.process(apiScope);
};

// cleans NULL characters from the event
export function cleanEvent(obj: unknown): unknown {
  if (typeof obj === "string") {
    return obj.replace(/\u0000/g, "");
  } else if (typeof obj === "object" && obj !== null) {
    if (Array.isArray(obj)) {
      return obj.map(cleanEvent);
    } else {
      // Here we assert that obj is a Record<string, unknown>
      const objAsRecord = obj as Record<string, unknown>;
      const newObj: Record<string, unknown> = {};
      for (const key in objAsRecord) {
        newObj[key] = cleanEvent(objAsRecord[key]);
      }
      return newObj;
    }
  } else {
    return obj;
  }
}

export const isNotNullOrUndefined = <T>(
  val?: T | null
): val is Exclude<T, null | undefined> => !isUndefinedOrNull(val);

export const isUndefinedOrNull = <T>(val?: T | null): val is undefined | null =>
  val === undefined || val === null;

export const sendToWorkerIfEnvironmentConfigured = async (
  batchResults: BatchResult[],
  projectId: string
): Promise<void> => {
  const traceEvents: TraceUpsertEventType[] = batchResults
    .filter((result) => result.type === eventTypes.TRACE_CREATE) // we only have create, no update.
    .map((result) =>
      result.result &&
      typeof result.result === "object" &&
      "id" in result.result
        ? // ingestion API only gets traces for one projectId
          { traceId: result.result.id as string, projectId }
        : null
    )
    .filter(isNotNullOrUndefined);

  try {
    if (env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION && redis) {
      console.log(`Sending ${traceEvents.length} events to worker via Redis`);

      const queue = getTraceUpsertQueue();
      if (!queue) {
        console.error("TraceUpsertQueue not initialized");
        return;
      }

      await queue.addBulk(convertTraceUpsertEventsToRedisEvents(traceEvents));
    } else if (
      env.LANGFUSE_WORKER_HOST &&
      env.LANGFUSE_WORKER_PASSWORD &&
      env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION
    ) {
      console.log(`Sending ${traceEvents.length} events to worker via HTTP`);
      const body: EventBodyType = {
        name: EventName.TraceUpsert,
        payload: traceEvents,
      };

      if (traceEvents.length > 0) {
        await fetch(`${env.LANGFUSE_WORKER_HOST}/api/events`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization:
              "Basic " +
              Buffer.from(
                "admin" + ":" + env.LANGFUSE_WORKER_PASSWORD
              ).toString("base64"),
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(8 * 1000),
        });
      }
    }
  } catch (error) {
    console.error("Error sending events to worker", error);
  }
};
