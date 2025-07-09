import { randomUUID } from "crypto";
import { z } from "zod/v4";

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
  recordDistribution,
  recordIncrement,
  traceException,
} from "../instrumentation";
import { logger } from "../logger";
import { QueueJobs } from "../queues";
import { IngestionQueue } from "../redis/ingestionQueue";
import { redis } from "../redis/redis";
import {
  eventTypes,
  createIngestionEventSchema,
  IngestionEventType,
} from "./types";
import {
  StorageService,
  StorageServiceFactory,
} from "../services/StorageService";

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
      awsSse: env.LANGFUSE_S3_EVENT_UPLOAD_SSE,
      awsSseKmsKeyId: env.LANGFUSE_S3_EVENT_UPLOAD_SSE_KMS_KEY_ID,
    });
  }
  return s3StorageServiceClient;
};

// eslint-disable-next-line no-unused-vars
export type TokenCountDelegate = (p: {
  model: Model;
  text: unknown;
}) => number | undefined;

/**
 * Get the delay for the event based on the event type. Uses delay if set, 0 if current UTC timestamp is not between
 * 23:45 and 00:15, and env.LANGFUSE_INGESTION_QUEUE_DELAY_MS otherwise.
 * We need the delay around date boundaries to avoid duplicates for out-of-order processing of events.
 * @param delay - Delay overwrite. Used if non-null.
 */
const getDelay = (delay: number | null) => {
  if (delay !== null) {
    return delay;
  }
  const now = new Date();
  const hours = now.getUTCHours();
  const minutes = now.getUTCMinutes();

  if ((hours === 23 && minutes >= 45) || (hours === 0 && minutes <= 15)) {
    return env.LANGFUSE_INGESTION_QUEUE_DELAY_MS;
  }

  // Use 5s here to avoid duplicate processing on the worker. If the ingestion delay is set to a lower value,
  // we use this instead.
  // Values should be revisited based on a cost/performance trade-off.
  return Math.min(5000, env.LANGFUSE_INGESTION_QUEUE_DELAY_MS);
};

/**
 * Options for event batch processing.
 * @property delay - Delay in ms to wait before processing events in the batch.
 * @property source - Source of the events for metrics tracking (e.g., "otel", "api").
 * @property isLangfuseInternal - Whether the events are being ingested by Langfuse internally (e.g. traces created for prompt experiments).
 */
type ProcessEventBatchOptions = {
  delay?: number | null;
  source?: "api" | "otel";
  isLangfuseInternal?: boolean;
};

/**
 * Processes a batch of events.
 * @param input - Batch of IngestionEventType. Will validate the types first thing and return errors if they are invalid.
 * @param authCheck - AuthHeaderValidVerificationResult
 * @param options - (Optional) Options for the event batch processing.
 */
export const processEventBatch = async (
  input: unknown[],
  authCheck: AuthHeaderValidVerificationResult,
  options: ProcessEventBatchOptions = {},
): Promise<{
  successes: { id: string; status: number }[];
  errors: {
    id: string;
    status: number;
    message?: string;
    error?: string;
  }[];
}> => {
  const { delay = null, source = "api", isLangfuseInternal = false } = options;

  // add context of api call to the span
  const currentSpan = getCurrentSpan();
  recordIncrement("langfuse.ingestion.event", input.length, { source });
  recordDistribution("langfuse.ingestion.event_distribution", input.length, {
    source,
  });

  currentSpan?.setAttribute("langfuse.ingestion.batch_size", input.length);
  currentSpan?.setAttribute(
    "langfuse.project.id",
    authCheck.scope.projectId ?? "",
  );
  currentSpan?.setAttribute("langfuse.org.id", authCheck.scope.orgId);
  currentSpan?.setAttribute("langfuse.org.plan", authCheck.scope.plan);

  /**************
   * VALIDATION *
   **************/
  if (!authCheck.scope.projectId) {
    throw new UnauthorizedError("Missing project ID");
  }

  const validationErrors: { id: string; error: unknown }[] = [];
  const authenticationErrors: { id: string; error: unknown }[] = [];

  const ingestionSchema = createIngestionEventSchema(isLangfuseInternal);
  const batch: z.infer<typeof ingestionSchema>[] = input
    .flatMap((event) => {
      const parsed = ingestionSchema.safeParse(event);
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
  await instrumentAsync({ name: "s3-upload-events" }, async () => {
    // S3 Event Upload is blocking, but non-failing.
    // If a promise rejects, we log it below, but do not throw an error.
    // In this case, we upload the full batch into the Redis queue.
    const results = await Promise.allSettled(
      Object.keys(sortedBatchByEventBodyId).map(async (id) => {
        // We upload the event in an array to the S3 bucket grouped by the eventBodyId.
        // That way we batch updates from the same invocation into a single file and reduce
        // write operations on S3.
        const { data, key, type, eventBodyId } = sortedBatchByEventBodyId[id];
        const bucketPath = `${env.LANGFUSE_S3_EVENT_UPLOAD_PREFIX}${authCheck.scope.projectId}/${getClickhouseEntityType(type)}/${eventBodyId}/${key}.json`;
        return getS3StorageServiceClient(
          env.LANGFUSE_S3_EVENT_UPLOAD_BUCKET,
        ).uploadJson(bucketPath, data);
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

  // Send each event individually to IngestionQueue for ClickHouse processing
  if (s3UploadErrored) {
    throw new Error(
      "Failed to upload events to blob storage, aborting event processing",
    );
  }

  if (!redis) {
    throw new Error("Redis not initialized, aborting event processing");
  }

  const projectIdsToSkipS3List =
    env.LANGFUSE_SKIP_S3_LIST_FOR_OBSERVATIONS_PROJECT_IDS?.split(",") ?? [];

  await Promise.all(
    Object.keys(sortedBatchByEventBodyId).map(async (id) => {
      const eventData = sortedBatchByEventBodyId[id];
      const shardingKey = `${authCheck.scope.projectId}-${eventData.eventBodyId}`;
      const queue = IngestionQueue.getInstance({ shardingKey });

      const shouldSkipS3List =
        getClickhouseEntityType(eventData.type) === "observation" &&
        authCheck.scope.projectId !== null &&
        (projectIdsToSkipS3List.includes(authCheck.scope.projectId) ||
          source === "otel");

      return queue
        ? queue.add(
            QueueJobs.IngestionJob,
            {
              id: randomUUID(),
              timestamp: new Date(),
              name: QueueJobs.IngestionJob as const,
              payload: {
                data: {
                  type: eventData.type,
                  eventBodyId: eventData.eventBodyId,
                  fileKey: eventData.key,
                  skipS3List: shouldSkipS3List,
                },
                authCheck: authCheck as {
                  validKey: true;
                  scope: {
                    projectId: string;
                    accessLevel: "project" | "scores";
                  };
                },
              },
            },
            { delay: getDelay(delay) },
          )
        : Promise.reject("Failed to instantiate queue");
    }),
  );

  return aggregateBatchResult(
    [...validationErrors, ...authenticationErrors],
    sortedBatch.map((event) => ({ id: event.id, result: event })),
    authCheck.scope.projectId,
  );
};

const isAuthorized = (
  event: IngestionEventType,
  authScope: AuthHeaderValidVerificationResult,
): boolean => {
  if (event.type === eventTypes.SDK_LOG) {
    return true;
  }

  if (event.type === eventTypes.SCORE_CREATE) {
    return (
      authScope.scope.accessLevel === "scores" ||
      authScope.scope.accessLevel === "project"
    );
  }

  return authScope.scope.accessLevel === "project";
};

/**
 * Sorts a batch of ingestion events. Orders by: updating events last, sorted by timestamp asc.
 */
const sortBatch = (batch: IngestionEventType[]) => {
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
  projectId?: string,
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
    logger.error("Error processing events", {
      errors: returnedErrors,
      "langfuse.project.id": projectId,
    });
  }

  results.forEach((result) => {
    successes.push({
      id: result.id,
      status: 201,
    });
  });

  return { successes, errors: returnedErrors };
};
