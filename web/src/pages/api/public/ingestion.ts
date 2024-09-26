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
  type AuthHeaderValidVerificationResult,
  type ingestionBatchEvent,
  handleBatch,
  recordIncrement,
  getCurrentSpan,
  LegacyIngestionQueue,
  addTraceContext,
  S3StorageService,
} from "@langfuse/shared/src/server";
import {
  SdkLogProcessor,
  type EventProcessor,
  ObservationProcessor,
  ScoreProcessor,
  TraceProcessor,
} from "@langfuse/shared/src/server";
import { isNotNullOrUndefined } from "@/src/utils/types";
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
  sendToWorkerIfEnvironmentConfigured,
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

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  try {
    await runMiddleware(req, res, cors);
    if (req.method !== "POST") throw new MethodNotAllowedError();

    // CHECK AUTH FOR ALL EVENTS
    const authCheck = await new ApiAuthService(
      prisma,
      redis,
    ).verifyAuthHeaderAndReturnScope(req.headers.authorization);

    if (!authCheck.validKey) {
      throw new UnauthorizedError(authCheck.error);
    }

    const rateLimitCheck = await new RateLimitService(redis).rateLimitRequest(
      authCheck.scope,
      "ingestion",
    );

    if (rateLimitCheck?.isRateLimited()) {
      return rateLimitCheck.sendRestResponseIfLimited(res);
    }

    const batchType = z.object({
      batch: z.array(z.unknown()),
      metadata: jsonSchema.nullish(),
    });

    const parsedSchema = instrumentSync(
      { name: "ingestion-zod-parse-unknown-batch-event" },
      () => batchType.safeParse(req.body),
    );

    recordIncrement(
      "ingestion_event",
      parsedSchema.success ? parsedSchema.data.batch.length : 0,
    );

    // add context of api call to the span
    const currentSpan = getCurrentSpan();

    // get x-langfuse-xxx headers and add them to the span
    Object.keys(req.headers).forEach((header) => {
      if (
        header.toLowerCase().startsWith("x-langfuse") ||
        header.toLowerCase().startsWith("x_langfuse")
      ) {
        currentSpan?.setAttributes({
          [header]: req.headers[header],
        });
      }
    });

    // add number of events to the span
    parsedSchema.data
      ? currentSpan?.setAttribute("event_count", parsedSchema.data.batch.length)
      : undefined;

    if (!parsedSchema.success) {
      logger.info("Invalid request data", parsedSchema.error);
      return res.status(400).json({
        message: "Invalid request data",
        errors: parsedSchema.error.issues.map((issue) => issue.message),
      });
    }

    const validationErrors: { id: string; error: unknown }[] = [];

    const batch: z.infer<typeof ingestionEvent>[] = parsedSchema.data.batch
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

    await telemetry();

    const sortedBatch = sortBatch(batch);

    if (env.LANGFUSE_S3_EVENT_UPLOAD_ENABLED === "true") {
      if (env.LANGFUSE_S3_EVENT_UPLOAD_BUCKET === undefined) {
        logger.warn(
          "S3 event upload activated, but no bucket configured. Skipping upload.",
        );
      } else {
        const s3Client = new S3StorageService({
          accessKeyId: env.LANGFUSE_S3_EVENT_UPLOAD_ACCESS_KEY_ID,
          secretAccessKey: env.LANGFUSE_S3_EVENT_UPLOAD_SECRET_ACCESS_KEY,
          bucketName: env.LANGFUSE_S3_EVENT_UPLOAD_BUCKET,
          endpoint: env.LANGFUSE_S3_EVENT_UPLOAD_ENDPOINT,
          region: env.LANGFUSE_S3_EVENT_UPLOAD_REGION,
        });
        const results = await Promise.allSettled(
          sortedBatch.map(async (event) => {
            return event.type !== eventTypes.SDK_LOG
              ? s3Client.uploadJson(
                  `${env.LANGFUSE_S3_EVENT_UPLOAD_PREFIX}${authCheck.scope.projectId}/${event.body.id}/${event.id}.json`,
                  event,
                )
              : Promise.resolve();
          }),
        );
        results.forEach((result) => {
          if (result.status === "rejected") {
            logger.error("Failed to upload event to S3", {
              error: result.reason,
            });
          }
        });
      }
    }

    if (env.LANGFUSE_ASYNC_INGESTION_PROCESSING === "true" && redis) {
      // this function MUST NOT return but send the HTTP response directly
      const queue = LegacyIngestionQueue.getInstance();

      if (queue) {
        // still need to check auth scope for all events individually

        const failedAccessScope = accessCheckPerEvent(sortedBatch, authCheck);

        let addToQueueFailed = false;
        try {
          await queue.add(
            QueueJobs.LegacyIngestionJob,
            addTraceContext({
              payload: { data: sortedBatch, authCheck: authCheck },
              id: randomUUID(),
              timestamp: new Date(),
              name: QueueJobs.LegacyIngestionJob as const,
            }),
            {
              removeOnFail: 1_000_000,
              removeOnComplete: true,
              attempts: 5,
              backoff: {
                type: "exponential",
                delay: 1000,
              },
            },
          );
        } catch (e: unknown) {
          logger.warn(
            "Failed to add batch to queue, falling back to sync processing",
            e,
          );
          addToQueueFailed = true;
        }

        if (!addToQueueFailed) {
          return handleBatchResult(
            [
              ...validationErrors,
              ...failedAccessScope.map((e) => ({
                id: e.id,
                error: "Access Scope Denied",
              })),
            ], // we are not sending additional server errors to the client in case of early return
            sortedBatch.map((event) => ({ id: event.id, result: event })),
            res,
          );
        }
      } else {
        logger.error(
          "Ingestion queue not initialized, falling back to sync processing",
        );
      }
    }

    const result = await handleBatch(sortedBatch, authCheck, tokenCount);

    // send out REST requests to worker for all trace types
    await sendToWorkerIfEnvironmentConfigured(
      result.results,
      authCheck.scope.projectId,
    );

    //  in case we did not return early, we return the result here
    handleBatchResult(
      [...validationErrors, ...result.errors],
      result.results,
      res,
    );
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

const accessCheckPerEvent = (
  events: z.infer<typeof ingestionBatchEvent>,
  authCheck: AuthHeaderValidVerificationResult,
) => {
  const unauthorizedEvents: { id: string; type: string }[] = [];

  for (const event of events) {
    try {
      let processor: EventProcessor;
      switch (event.type) {
        case eventTypes.TRACE_CREATE:
          processor = new TraceProcessor(event);
          break;
        case eventTypes.OBSERVATION_CREATE:
        case eventTypes.OBSERVATION_UPDATE:
        case eventTypes.EVENT_CREATE:
        case eventTypes.SPAN_CREATE:
        case eventTypes.SPAN_UPDATE:
        case eventTypes.GENERATION_CREATE:
        case eventTypes.GENERATION_UPDATE:
          processor = new ObservationProcessor(event, tokenCount);
          break;
        case eventTypes.SCORE_CREATE:
          processor = new ScoreProcessor(event);
          break;
        case eventTypes.SDK_LOG:
          processor = new SdkLogProcessor(event);
          break;
      }
      processor.auth(authCheck.scope);
    } catch (error) {
      unauthorizedEvents.push({ id: event.id, type: event.type });
    }
  }
  return unauthorizedEvents;
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

export const hasBadRequestError = (errors: Array<unknown>) =>
  errors.some((error) => error instanceof InvalidRequestError);

export const handleBatchResult = (
  errors: Array<{ id: string; error: unknown }>,
  results: Array<{ id: string; result: unknown }>,
  res: NextApiResponse,
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

  return res.status(207).send({ errors: returnedErrors, successes });
};

/**
 * Handle single event which is usually send via /ingestion endpoint. Returns errors and results via `res` directly.
 *
 * Use `parseSingleTypedIngestionApiResponse` for a typed version of this function that throws `BaseError`.
 */
export const handleSingleIngestionObject = (
  errors: Array<{ id: string; error: unknown }>,
  results: Array<{ id: string; result: unknown }>,
  res: NextApiResponse,
) => {
  try {
    // use method untyped for backwards compatibility
    const parsedResult = parseSingleTypedIngestionApiResponse(errors, results);

    return res.status(200).json(parsedResult);
  } catch (error) {
    if (error instanceof BaseError) {
      return res.status(error.httpCode).json({
        message: error.message,
        error: error.name,
      });
    }
    return res.status(500).json({
      message: "Internal Server Error",
      error:
        error instanceof Error ? error.message : "An unknown error occurred",
    });
  }
};

/**
 * Parses the response from the ingestion batch API event processor and throws an error of `BaserError` if the response is not as expected.
 *
 * @param errors - Array of errors from `handleBatch()`
 * @param results - Array of results from `handleBatch()`
 * @param object - Zod object to parse the result, if not provided, the result is returned as is without parsing
 * @returns - Parsed result
 * @throws - Throws an error of type `BaseError` if there are errors in the arguments
 */

export const parseSingleTypedIngestionApiResponse = <T extends z.ZodTypeAny>(
  errors: Array<{ id: string; error: unknown }>,
  results: Array<{ id: string; result: unknown }>,
  object?: T,
): T extends z.ZodTypeAny ? z.infer<T> : unknown => {
  const unknownErrors = errors.map((error) => error.error);
  const badRequestErrors = getBadRequestError(unknownErrors);
  if (badRequestErrors.length > 0) {
    throw new InvalidRequestError(badRequestErrors[0].message);
  }
  const langfuseNotFoundError = getLangfuseNotFoundError(unknownErrors);
  if (langfuseNotFoundError.length > 0) {
    throw langfuseNotFoundError[0];
  }
  if (errors.length > 0) {
    throw new InternalServerError("Internal Server Error");
  }

  if (results.length === 0) {
    throw new InternalServerError("No results returned");
  }

  if (object === undefined) {
    return results[0].result as T extends z.ZodTypeAny ? z.infer<T> : unknown;
  }

  const parsedObj = object.safeParse(results[0].result);
  if (!parsedObj.success) {
    console.error("Error parsing response", parsedObj.error);
    traceException(parsedObj.error);
  }
  // should not fail in prod but just log an exception, see above
  return results[0].result as z.infer<T>;
};
