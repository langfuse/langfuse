import { cors, runMiddleware } from "@/src/features/public-api/server/cors";
import { type NextApiRequest, type NextApiResponse } from "next";
import { z } from "zod";
import { LangfuseNotFoundError, InternalServerError } from "@langfuse/shared";
import {
  eventTypes,
  ingestionEvent,
  traceException,
  redis,
  logger,
  handleBatch,
  recordIncrement,
  getCurrentSpan,
  IngestionQueue,
  LegacyIngestionQueue,
  S3StorageService,
  instrumentAsync,
  getProcessorForEvent,
  getClickhouseEntityType,
  type AuthHeaderValidVerificationResult,
  type LegacyIngestionEventType,
  type IngestionEventType,
} from "@langfuse/shared/src/server";
import { telemetry } from "@/src/features/telemetry";
import { jsonSchema } from "@langfuse/shared";
import { isPrismaException } from "@/src/utils/exceptions";
import { env } from "@/src/env.mjs";
import {
  InvalidRequestError,
  MethodNotAllowedError,
  BaseError,
  UnauthorizedError,
} from "@langfuse/shared";
import {
  addTracesToTraceUpsertQueue,
  QueueJobs,
  instrumentSync,
} from "@langfuse/shared/src/server";
import { randomUUID } from "crypto";
import { prisma } from "@langfuse/shared/src/db";
import { tokenCount } from "@/src/features/ingest/usage";
import { ApiAuthService } from "@/src/features/public-api/server/apiAuth";
import { RateLimitService } from "@/src/features/public-api/server/RateLimitService";

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "4.5mb",
    },
  },
};

let s3StorageServiceClient: S3StorageService;

const getS3StorageServiceClient = (bucketName: string): S3StorageService => {
  if (!s3StorageServiceClient) {
    s3StorageServiceClient = new S3StorageService({
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

/**
 * This handler performs multiple actions to ingest data. It is compatible with the new async workflow, but also
 * supports the old synchronous workflow which processes events in the web container.
 * Overall, the processing of each incoming request happens in three stages
 * 1. Validation
 *   - Check that the user has permissions
 *   - Check whether rate-limits are breached
 *   - Check that the request is well-formed
 * 2. Async Processing
 *   - Upload each event to S3 for long-term storage and as an event cache
 *   - Add the event batch to the queue for async processing
 *   - Fallback to sync processing on errors
 * 3. Sync Processing
 * The last two stages live in a processEventBatch function which is reused for the POST scores endpoint and for
 * legacy event types.
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  try {
    await runMiddleware(req, res, cors);

    // add context of api call to the span
    const currentSpan = getCurrentSpan();

    // get x-langfuse-xxx headers and add them to the span
    Object.keys(req.headers).forEach((header) => {
      if (
        header.toLowerCase().startsWith("x-langfuse") ||
        header.toLowerCase().startsWith("x_langfuse")
      ) {
        currentSpan?.setAttributes({
          [`langfuse.header.${header.slice(11).toLowerCase().replaceAll("_", "-")}`]:
            req.headers[header],
        });
      }
    });

    if (req.method !== "POST") throw new MethodNotAllowedError();

    // CHECK AUTH FOR ALL EVENTS
    const authCheck = await new ApiAuthService(
      prisma,
      redis,
    ).verifyAuthHeaderAndReturnScope(req.headers.authorization);

    if (!authCheck.validKey) {
      throw new UnauthorizedError(authCheck.error);
    }

    try {
      const rateLimitCheck = await new RateLimitService(redis).rateLimitRequest(
        authCheck.scope,
        "ingestion",
      );

      if (rateLimitCheck?.isRateLimited()) {
        return rateLimitCheck.sendRestResponseIfLimited(res);
      }
    } catch (e) {
      // If rate-limiter returns an error, we log it and continue processing.
      // This allows us to fail open instead of reject requests.
      logger.error("Error while rate limiting", e);
    }

    const batchType = z.object({
      batch: z.array(z.unknown()),
      metadata: jsonSchema.nullish(),
    });

    const parsedSchema = instrumentSync(
      { name: "ingestion-zod-parse-unknown-batch-event" },
      () => batchType.safeParse(req.body),
    );

    if (!parsedSchema.success) {
      logger.info("Invalid request data", parsedSchema.error);
      return res.status(400).json({
        message: "Invalid request data",
        errors: parsedSchema.error.issues.map((issue) => issue.message),
      });
    }

    await telemetry();

    const result = await processEventBatch(parsedSchema.data.batch, authCheck);
    return res.status(207).json(result);
  } catch (error: unknown) {
    if (!(error instanceof UnauthorizedError)) {
      logger.error("error_handling_ingestion_event", error);
      traceException(error);
    }

    if (error instanceof BaseError) {
      return res.status(error.httpCode).json({
        error: error.name,
        message: error.message,
      });
    }

    if (isPrismaException(error)) {
      return res.status(500).json({
        error: "Internal Server Error",
      });
    }

    if (error instanceof z.ZodError) {
      logger.error(`Zod exception`, error.errors);
      return res.status(400).json({
        message: "Invalid request data",
        error: error.errors,
      });
    }

    const errorMessage =
      error instanceof Error ? error.message : "An unknown error occurred";
    res.status(500).json({
      message: "Invalid request data",
      errors: [errorMessage],
    });
  }
}

export const processEventBatch = async (
  input: unknown[],
  authCheck: AuthHeaderValidVerificationResult,
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
      if (!isAuthorized(parsed.data, authCheck)) {
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
                delay: env.LANGFUSE_INGESTION_QUEUE_DELAY_SECONDS,
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
  const result = await handleBatch(sortedBatch, authCheck, tokenCount);

  await addTracesToTraceUpsertQueue(result.results, authCheck.scope.projectId);

  //  in case we did not return early, we return the result here
  return aggregateBatchResult(
    [...validationErrors, ...authenticationErrors, ...result.errors],
    result.results,
  );
};

const isAuthorized = (
  event: IngestionEventType,
  authScope: AuthHeaderValidVerificationResult,
): boolean => {
  try {
    getProcessorForEvent(event, tokenCount).auth(authScope.scope);
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

export const getBadRequestError = (
  errors: Array<unknown>,
): InvalidRequestError[] =>
  errors.filter(
    (error): error is InvalidRequestError =>
      error instanceof InvalidRequestError,
  );

export const getLangfuseNotFoundError = (
  errors: Array<unknown>,
): LangfuseNotFoundError[] =>
  errors.filter(
    (error): error is LangfuseNotFoundError =>
      error instanceof LangfuseNotFoundError,
  );

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
