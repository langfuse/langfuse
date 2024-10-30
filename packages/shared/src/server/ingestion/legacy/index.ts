import { env } from "node:process";
import z from "zod";
import { ForbiddenError, UnauthorizedError } from "../../../errors";
import { eventTypes, ingestionApiSchema, IngestionEventType } from "../types";
import { getProcessorForEvent } from "./EventProcessor";
import { TraceUpsertEventType } from "../../queues";
import {
  convertTraceUpsertEventsToRedisEvents,
  TraceUpsertQueue,
} from "../../redis/traceUpsert";
import { ApiAccessScope } from "../../auth/types";
import { redis } from "../../redis/redis";
import { backOff } from "exponential-backoff";
import { Model } from "../../..";
import { logger } from "../../logger";

export type BatchResult = {
  result: unknown;
  id: string;
  type: string;
};

type TokenCountInput = {
  model: Model;
  text: unknown;
};

export type LegacyIngestionAccessScope = Omit<
  ApiAccessScope,
  "orgId" | "plan" | "rateLimitOverrides"
>;

type LegacyIngestionAuthHeaderVerificationResult =
  | {
      validKey: true;
      scope: LegacyIngestionAccessScope;
    }
  | {
      validKey: false;
      error: string;
    };

export const handleBatch = async (
  events: z.infer<typeof ingestionApiSchema>["batch"],
  authCheck: LegacyIngestionAuthHeaderVerificationResult,
  calculateTokenDelegate: (p: TokenCountInput) => number | undefined,
) => {
  logger.debug(`handling ingestion ${events.length} events`);

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
          calculateTokenDelegate,
        );
      });
      results.push({
        result: result,
        id: singleEvent.id,
        type: singleEvent.type,
      }); // Push each result into the array
    } catch (error) {
      // Handle or log the error if `handleSingleEvent` fails
      logger.error("Error handling event:", error);
      // Decide how to handle the error: rethrow, continue, or push an error object to results
      // For example, push an error object:
      errors.push({
        error: error,
        id: singleEvent.id,
        type: singleEvent.type,
      });
    }
  }

  return { results, errors };
};

async function retry<T>(request: () => Promise<T>): Promise<T> {
  return await backOff(request, {
    numOfAttempts: env.LANGFUSE_ASYNC_INGESTION_PROCESSING === "true" ? 5 : 3,
    retry: (e: Error, attemptNumber: number) => {
      if (e instanceof UnauthorizedError || e instanceof ForbiddenError) {
        logger.info("not retrying auth error");
        return false;
      }
      logger.info(`retrying processing events ${attemptNumber}`);
      return true;
    },
  });
}

const handleSingleEvent = async (
  event: IngestionEventType,
  apiScope: LegacyIngestionAccessScope,
  calculateTokenDelegate: (p: {
    model: Model;
    text: unknown;
  }) => number | undefined,
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

  logger.info(
    `handling single event ${event.id} of type ${event.type}:  ${JSON.stringify({ body: restEvent })}`,
  );

  const cleanedEvent = cleanEvent(event) as IngestionEventType;

  // Deny access to non-score events if the access level is not "all"
  // This is an additional safeguard to auth checks in EventProcessor
  if (
    apiScope.accessLevel !== "all" &&
    cleanedEvent.type !== eventTypes.SCORE_CREATE
  ) {
    throw new ForbiddenError("Access denied. Event type not allowed.");
  }

  return getProcessorForEvent(cleanedEvent, calculateTokenDelegate).process(
    apiScope,
  );
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
  val?: T | null,
): val is Exclude<T, null | undefined> => !isUndefinedOrNull(val);

export const isUndefinedOrNull = <T>(val?: T | null): val is undefined | null =>
  val === undefined || val === null;

export const addTracesToTraceUpsertQueue = async (
  batchResults: BatchResult[],
  projectId: string,
): Promise<void> => {
  const traceEvents: TraceUpsertEventType[] = batchResults
    .filter((result) => result.type === eventTypes.TRACE_CREATE) // we only have create, no update.
    .map((result) =>
      result.result &&
      typeof result.result === "object" &&
      "id" in result.result
        ? // ingestion API only gets traces for one projectId
          { traceId: result.result.id as string, projectId }
        : null,
    )
    .filter(isNotNullOrUndefined);

  try {
    if (env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION && redis) {
      logger.info(`Sending ${traceEvents.length} events to worker via Redis`);

      const queue = TraceUpsertQueue.getInstance();
      if (!queue) {
        logger.error("TraceUpsertQueue not initialized");
        return;
      }

      await queue.addBulk(convertTraceUpsertEventsToRedisEvents(traceEvents));
    }
  } catch (error) {
    logger.error("Error sending events to worker", error);
  }
};
