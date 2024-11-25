import { randomUUID } from "crypto";
import { z } from "zod";

import { type Model } from "../../db";
import { env } from "../../env";
import {
  InvalidRequestError,
  LangfuseNotFoundError,
  UnauthorizedError,
} from "../../errors";
import { AuthHeaderValidVerificationResult } from "../auth/types";
import { getClickhouseEntityType } from "../clickhouse/schemaUtils";
import {
  getCurrentSpan,
  instrumentAsync,
  instrumentSync,
  recordIncrement,
  traceException,
} from "../instrumentation";
import { logger } from "../logger";
import { LegacyIngestionEventType, QueueJobs } from "../queues";
import { IngestionQueue } from "../redis/ingestionQueue";
import { LegacyIngestionQueue } from "../redis/legacyIngestion";
import { redis } from "../redis/redis";
import { handleBatch } from "./legacy";
import {
  StorageService,
  StorageServiceFactory,
} from "../services/StorageService";
import { getProcessorForEvent } from "./legacy/EventProcessor";
import { eventTypes, ingestionEvent, IngestionEventType } from "./types";

export type TokenCountDelegate = (p: {
  model: Model;
  text: unknown;
}) => number | undefined;

let s3StorageServiceClient: StorageService;

const getS3StorageServiceClient = (bucketName: string): StorageService => {
  if (!s3StorageServiceClient) {
    s3StorageServiceClient = StorageServiceFactory.getInstance({
      bucketName,
      accessKeyId: env.LANGFUSE_S3_EVENT_UPLOAD_ACCESS_KEY_ID,
      secretAccessKey: env.LANGFUSE_S3_EVENT_UPLOAD_SECRET_ACCESS_KEY,
      endpoint: env.LANGFUSE_S3_EVENT_UPLOAD_ENDPOINT,
      region: env.LANGFUSE_S3_EVENT_UPLOAD_REGION,
      forcePathStyle: env.LANGFUSE_S3_EVENT_UPLOAD_FORCE_PATH_STYLE === "true",
    });
  }
  return s3StorageServiceClient;
};

export const processEventBatch = async (
  input: unknown[],
  authCheck: AuthHeaderValidVerificationResult,
  tokenCountDelegate: TokenCountDelegate,
): Promise<{
  successes: { id: string; status: number }[];
  errors: {
    id: string;
    status: number;
    message?: string;
    error?: string;
  }[];
}> => {
  // add context of api call to the span
  const currentSpan = getCurrentSpan();
  recordIncrement("langfuse.ingestion.event", input.length);
  currentSpan?.setAttribute("event_count", input.length);

  /**************
   * VALIDATION *
   **************/
  const validationErrors: { id: string; error: unknown }[] = [];
  const authenticationErrors: { id: string; error: unknown }[] = [];

  const batch: z.infer<typeof ingestionEvent>[] = input
    .flatMap((event) => {
      const parsed = instrumentSync(
        { name: "ingestion-zod-parse-individual-event" },
        (span) => {
          const parsedBody = ingestionEvent.safeParse(event);
          if (parsedBody.data?.id !== undefined) {
            span.setAttribute("object.id", parsedBody.data.id);
          }
          return parsedBody;
        },
      );
      if (!parsed.success) {
        validationErrors.push({
          id:
            typeof event === "object" && event && "id" in event
              ? typeof event.id === "string"
                ? event.id
                : "unknown"
              : "unknown",
          error: new InvalidRequestError(parsed.error.message),
        });
        return [];
      }
      if (!isAuthorized(parsed.data, authCheck, tokenCountDelegate)) {
        authenticationErrors.push({
          id: parsed.data.id,
          error: new UnauthorizedError("Access Scope Denied"),
        });
        return [];
      }
      return [parsed.data];
    })
    .flatMap((event) => {
      if (event.type === eventTypes.SDK_LOG) {
        // Log SDK_LOG events, but remove them from further processing
        logger.info("SDK Log Event", { event });
        return [];
      }
      return [event];
    });

  const sortedBatch = sortBatch(batch);

  // We group events by eventBodyId which allows us to store and process them
  // as one which reduces infra interactions per event. Only used in the S3 case.
  const sortedBatchByEventBodyId = sortedBatch.reduce(
    (
      acc: Record<
        string,
        {
          data: IngestionEventType[];
          key: string;
          eventBodyId: string;
          type: (typeof eventTypes)[keyof typeof eventTypes];
        }
      >,
      event,
    ) => {
      if (!event.body?.id) {
        return acc;
      }
      const key = `${getClickhouseEntityType(event.type)}-${event.body.id}`;
      if (!acc[key]) {
        acc[key] = {
          data: [],
          key: event.id,
          type: event.type,
          eventBodyId: event.body.id,
        };
      }
      acc[key].data.push(event);
      return acc;
    },
    {},
  );

  /********************
   * ASYNC PROCESSING *
   ********************/
  let s3UploadErrored = false;
  if (env.LANGFUSE_S3_EVENT_UPLOAD_ENABLED === "true") {
    await instrumentAsync({ name: "s3-upload-events" }, async () => {
      if (env.LANGFUSE_S3_EVENT_UPLOAD_BUCKET === undefined) {
        throw new Error("S3 event store is enabled but no bucket is set");
      }
      const s3Client = getS3StorageServiceClient(
        env.LANGFUSE_S3_EVENT_UPLOAD_BUCKET,
      );
      // S3 Event Upload is currently blocking, but non-failing.
      // If a promise rejects, we log it below, but do not throw an error.
      // In this case, we upload the full batch into the Redis queue.
      const results = await Promise.allSettled(
        Object.keys(sortedBatchByEventBodyId).map(async (id) => {
          // We upload the event in an array to the S3 bucket grouped by the eventBodyId.
          // That way we batch updates from the same invocation into a single file and reduce
          // write operations on S3.
          const { data, key, type, eventBodyId } = sortedBatchByEventBodyId[id];
          return s3Client.uploadJson(
            `${env.LANGFUSE_S3_EVENT_UPLOAD_PREFIX}${authCheck.scope.projectId}/${getClickhouseEntityType(type)}/${eventBodyId}/${key}.json`,
            data,
          );
        }),
      );
      results.forEach((result) => {
        if (result.status === "rejected") {
          s3UploadErrored = true;
          logger.error("Failed to upload event to S3", {
            error: result.reason,
          });
        }
      });
    });
  }

  // Send each event individually to IngestionQueue for new processing
  if (
    env.LANGFUSE_ASYNC_INGESTION_PROCESSING === "true" &&
    env.LANGFUSE_S3_EVENT_UPLOAD_ENABLED === "true" &&
    env.LANGFUSE_ASYNC_CLICKHOUSE_INGESTION_PROCESSING === "true" &&
    redis &&
    !s3UploadErrored
  ) {
    const queue = IngestionQueue.getInstance();
    const results = await Promise.allSettled(
      Object.keys(sortedBatchByEventBodyId).map(async (id) =>
        queue
          ? queue.add(
              QueueJobs.IngestionJob,
              {
                id: randomUUID(),
                timestamp: new Date(),
                name: QueueJobs.IngestionJob as const,
                payload: {
                  data: {
                    type: sortedBatchByEventBodyId[id].type,
                    eventBodyId: sortedBatchByEventBodyId[id].eventBodyId,
                  },
                  authCheck,
                },
              },
              {
                delay: env.LANGFUSE_INGESTION_QUEUE_DELAY_MS,
              },
            )
          : Promise.reject("Failed to instantiate queue"),
      ),
    );
    results.forEach((result) => {
      if (result.status === "rejected") {
        logger.error("Failed to add event to IngestionQueue", {
          error: result.reason,
        });
      }
    });
  }

  // As part of the legacy processing we sent the entire batch to the worker.
  if (env.LANGFUSE_ASYNC_INGESTION_PROCESSING === "true" && redis) {
    const queue = LegacyIngestionQueue.getInstance();

    if (queue) {
      let addToQueueFailed = false;

      const queuePayload: LegacyIngestionEventType =
        env.LANGFUSE_S3_EVENT_UPLOAD_ENABLED === "true" && !s3UploadErrored
          ? {
              data: Object.keys(sortedBatchByEventBodyId).map((id) => {
                const { key, type, eventBodyId } = sortedBatchByEventBodyId[id];
                return {
                  type,
                  eventBodyId,
                  eventId: key,
                };
              }),
              authCheck,
              useS3EventStore: true,
            }
          : { data: sortedBatch, authCheck, useS3EventStore: false };

      try {
        await queue.add(QueueJobs.LegacyIngestionJob, {
          payload: queuePayload,
          id: randomUUID(),
          timestamp: new Date(),
          name: QueueJobs.LegacyIngestionJob as const,
        });
      } catch (e: unknown) {
        logger.warn(
          "Failed to add batch to queue, falling back to sync processing",
          e,
        );
        addToQueueFailed = true;
      }

      if (!addToQueueFailed) {
        return aggregateBatchResult(
          // we are not sending additional server errors to the client in case of early return
          [...validationErrors, ...authenticationErrors],
          sortedBatch.map((event) => ({ id: event.id, result: event })),
        );
      }
    } else {
      logger.error(
        "Ingestion queue not initialized, falling back to sync processing",
      );
    }
  }

  /*******************
   * SYNC PROCESSING *
   *******************/
  const result = await handleBatch(sortedBatch, authCheck, tokenCountDelegate);

  //  in case we did not return early, we return the result here
  return aggregateBatchResult(
    [...validationErrors, ...authenticationErrors, ...result.errors],
    result.results,
  );
};

const isAuthorized = (
  event: IngestionEventType,
  authScope: AuthHeaderValidVerificationResult,
  tokenCountDelegate: TokenCountDelegate,
): boolean => {
  try {
    getProcessorForEvent(event, tokenCountDelegate).auth(authScope.scope);
    return true;
  } catch (error) {
    return false;
  }
};

/**
 * Sorts a batch of ingestion events. Orders by: updating events last, sorted by timestamp asc.
 */
const sortBatch = (batch: Array<z.infer<typeof ingestionEvent>>) => {
  const updateEvents: (typeof eventTypes)[keyof typeof eventTypes][] = [
    eventTypes.GENERATION_UPDATE,
    eventTypes.SPAN_UPDATE,
    eventTypes.OBSERVATION_UPDATE, // legacy event type
  ];
  const updates = batch
    .filter((event) => updateEvents.includes(event.type))
    .sort((a, b) => {
      return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
    });
  const others = batch
    .filter((event) => !updateEvents.includes(event.type))
    .sort((a, b) => {
      return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
    });

  // Return the array with non-update events first, followed by update events
  return [...others, ...updates];
};

export const aggregateBatchResult = (
  errors: Array<{ id: string; error: unknown }>,
  results: Array<{ id: string; result: unknown }>,
) => {
  const returnedErrors: {
    id: string;
    status: number;
    message?: string;
    error?: string;
  }[] = [];

  const successes: {
    id: string;
    status: number;
  }[] = [];

  errors.forEach((error) => {
    if (error.error instanceof InvalidRequestError) {
      returnedErrors.push({
        id: error.id,
        status: 400,
        message: "Invalid request data",
        error: error.error.message,
      });
    } else if (error.error instanceof UnauthorizedError) {
      returnedErrors.push({
        id: error.id,
        status: 401,
        message: "Authentication error",
        error: error.error.message,
      });
    } else if (error.error instanceof LangfuseNotFoundError) {
      returnedErrors.push({
        id: error.id,
        status: 404,
        message: "Resource not found",
        error: error.error.message,
      });
    } else {
      returnedErrors.push({
        id: error.id,
        status: 500,
        error: "Internal Server Error",
      });
    }
  });

  if (returnedErrors.length > 0) {
    traceException(errors);
    logger.error("Error processing events", returnedErrors);
  }

  results.forEach((result) => {
    successes.push({
      id: result.id,
      status: 201,
    });
  });

  return { successes, errors: returnedErrors };
};
