import {
  type AuthHeaderVerificationResult,
  verifyAuthHeaderAndReturnScope,
} from "@/src/features/public-api/server/apiAuth";
import { cors, runMiddleware } from "@/src/features/public-api/server/cors";
import { prisma } from "@langfuse/shared/src/db";
import { type NextApiRequest, type NextApiResponse } from "next";
import { z } from "zod";
import {
  type ingestionApiSchema,
  eventTypes,
  ingestionEvent,
} from "@/src/features/public-api/server/ingestion-api-schema";
import { type ApiAccessScope } from "@/src/features/public-api/server/types";
import { persistEventMiddleware } from "@/src/server/api/services/event-service";
import { backOff } from "exponential-backoff";
import { ResourceNotFoundError } from "@/src/utils/exceptions";
import {
  SdkLogProcessor,
  type EventProcessor,
  TraceProcessor,
} from "../../../server/api/services/EventProcessor";
import { ObservationProcessor } from "../../../server/api/services/EventProcessor";
import { ScoreProcessor } from "../../../server/api/services/EventProcessor";
import { isNotNullOrUndefined } from "@/src/utils/types";
import { telemetry } from "@/src/features/telemetry";
import { jsonSchema } from "@/src/utils/zod";
import * as Sentry from "@sentry/nextjs";
import { isPrismaException } from "@/src/utils/exceptions";
import { env } from "@/src/env.mjs";
import {
  ValidationError,
  MethodNotAllowedError,
  BaseError,
  ForbiddenError,
  UnauthorizedError,
} from "@langfuse/shared";
import {
  SortingService,
  clean,
  enrichObservations,
  sort,
} from "@/src/server/api/services/event-processing";

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "4.5mb",
    },
  },
};

type BatchResult = {
  result: unknown;
  id: string;
  type: string;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  try {
    await runMiddleware(req, res, cors);

    if (req.method !== "POST") throw new MethodNotAllowedError();

    // CHECK AUTH FOR ALL EVENTS
    const authCheck = await verifyAuthHeaderAndReturnScope(
      req.headers.authorization,
    );

    if (!authCheck.validKey) throw new UnauthorizedError(authCheck.error);

    const batchType = z.object({
      batch: z.array(z.unknown()),
      metadata: jsonSchema.nullish(),
    });

    const parsedSchema = batchType.safeParse(req.body);

    Sentry.metrics.increment(
      "ingestion_event",
      parsedSchema.success ? parsedSchema.data.batch.length : 0,
    );

    if (!parsedSchema.success) {
      console.log("Invalid request data", parsedSchema.error);
      return res.status(400).json({
        message: "Invalid request data",
        errors: parsedSchema.error.issues.map((issue) => issue.message),
      });
    }

    const validationErrors: { id: string; error: unknown }[] = [];

    const batch: (z.infer<typeof ingestionEvent> | undefined)[] =
      parsedSchema.data.batch.map((event) => {
        const parsed = ingestionEvent.safeParse(event);
        if (!parsed.success) {
          validationErrors.push({
            id:
              typeof event === "object" && event && "id" in event
                ? typeof event.id === "string"
                  ? event.id
                  : "unknown"
                : "unknown",
            error: new ValidationError(parsed.error.message),
          });
          return undefined;
        } else {
          return parsed.data;
        }
      });

    const filteredBatch: z.infer<typeof ingestionEvent>[] =
      batch.filter(isNotNullOrUndefined);

    await telemetry();

    const cleanedAndSorted = clean(sort(filteredBatch));

    const enrichedEvents = await enrichObservations(
      cleanedAndSorted,
      authCheck.scope.projectId,
    );

    const observationUpdates = [
      ...enrichedEvents.enrichedObservations.entries(),
    ].map(([key, value]) => {
      const observationProcessor = new ObservationProcessor(key, value);
      return observationProcessor.process(authCheck.scope);
    });

    // send out REST requests to worker for all trace types
    await sendToWorkerIfEnvironmentConfigured(
      result.results,
      authCheck.scope.projectId,
    );

    handleBatchResult(
      [...validationErrors, ...result.errors],
      result.results,
      res,
    );
  } catch (error: unknown) {
    console.error("error handling ingestion event", error);

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
      console.log(`Zod exception`, error.errors);
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

export const handleBatch = async (
  events: z.infer<typeof ingestionApiSchema>["batch"],
  metadata: z.infer<typeof ingestionApiSchema>["metadata"],
  req: NextApiRequest,
  authCheck: AuthHeaderVerificationResult,
) => {
  console.log(`handling ingestion ${events.length} events`);

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
          metadata,
          req,
          authCheck.scope,
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
      errors.push({ error: error, id: singleEvent.id, type: singleEvent.type });
    }
  }

  return { results, errors };
};

async function retry<T>(request: () => Promise<T>): Promise<T> {
  return await backOff(request, {
    numOfAttempts: 3,
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
export const getBadRequestError = (errors: Array<unknown>): ValidationError[] =>
  errors.filter(
    (error): error is ValidationError => error instanceof ValidationError,
  );

export const getResourceNotFoundError = (
  errors: Array<unknown>,
): ResourceNotFoundError[] =>
  errors.filter(
    (error): error is ResourceNotFoundError =>
      error instanceof ResourceNotFoundError,
  );

export const hasBadRequestError = (errors: Array<unknown>) =>
  errors.some((error) => error instanceof ValidationError);

const handleSingleEvent = async (
  event: z.infer<typeof ingestionEvent>,
  metadata: z.infer<typeof ingestionApiSchema>["metadata"],
  req: NextApiRequest,
  apiScope: ApiAccessScope,
) => {
  if ("body" in event && "input" in event.body && "output" in event.body) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { input, output, ...restEvent } = event.body;
    console.log(
      `handling single event ${event.id} ${JSON.stringify({ event, body: restEvent })}`,
    );
  } else {
    console.log(`handling single event ${event.id} ${JSON.stringify(event)}`);
  }

  const { type } = event;

  let processor: EventProcessor;
  switch (type) {
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
      processor = new ObservationProcessor(event);
      break;
    case eventTypes.SCORE_CREATE: {
      processor = new ScoreProcessor(event);
      break;
    }
    case eventTypes.SDK_LOG:
      processor = new SdkLogProcessor(event);
  }

  // Deny access to non-score events if the access level is not "all"
  // This is an additional safeguard to auth checks in EventProcessor
  if (apiScope.accessLevel !== "all" && type !== eventTypes.SCORE_CREATE) {
    throw new ForbiddenError("Access denied. Event type not allowed.");
  }

  return await processor.process(apiScope);
};

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
    if (error.error instanceof ValidationError) {
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
    } else if (error.error instanceof ResourceNotFoundError) {
      returnedErrors.push({
        id: error.id,
        status: 404,
        message: "Resource not found",
        error: error.error.message,
      });
    } else {
      if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
        Sentry.captureException(error.error);
      }
      returnedErrors.push({
        id: error.id,
        status: 500,
        error: "Internal Server Error",
      });
    }
  });

  if (returnedErrors.length > 0) {
    console.log("Error processing events", returnedErrors);
  }

  results.forEach((result) => {
    successes.push({
      id: result.id,
      status: 201,
    });
  });

  return res.status(207).send({ errors: returnedErrors, successes });
};

export const handleBatchResultLegacy = (
  errors: Array<{ id: string; error: unknown }>,
  results: Array<{ id: string; result: unknown }>,
  res: NextApiResponse,
) => {
  const unknownErrors = errors.map((error) => error.error);

  const badRequestErrors = getBadRequestError(unknownErrors);
  if (badRequestErrors.length > 0) {
    console.log("Bad request errors", badRequestErrors);
    return res.status(400).json({
      message: "Invalid request data",
      errors: badRequestErrors.map((error) => error.message),
    });
  }

  const ResourceNotFoundError = getResourceNotFoundError(unknownErrors);
  if (ResourceNotFoundError.length > 0) {
    return res.status(404).json({
      message: "Resource not found",
      errors: ResourceNotFoundError.map((error) => error.message),
    });
  }

  if (errors.length > 0) {
    console.log("Error processing events", unknownErrors);
    return res.status(500).json({
      errors: ["Internal Server Error"],
    });
  }
  return res.status(200).send(results.length > 0 ? results[0]?.result : {});
};

export const sendToWorkerIfEnvironmentConfigured = async (
  batchResults: BatchResult[],
  projectId: string,
): Promise<void> => {
  try {
    if (
      env.LANGFUSE_WORKER_HOST &&
      env.LANGFUSE_WORKER_PASSWORD &&
      env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION
    ) {
      const traceEvents = batchResults
        .filter((result) => result.type === eventTypes.TRACE_CREATE) // we only have create, no update.
        .map((result) =>
          result.result &&
          typeof result.result === "object" &&
          "id" in result.result
            ? // ingestion API only gets traces for one projectId
              { traceId: result.result.id, projectId: projectId }
            : null,
        )
        .filter(isNotNullOrUndefined);

      if (traceEvents.length > 0) {
        await fetch(`${env.LANGFUSE_WORKER_HOST}/api/events`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization:
              "Basic " +
              Buffer.from(
                "admin" + ":" + env.LANGFUSE_WORKER_PASSWORD,
              ).toString("base64"),
          },
          body: JSON.stringify(traceEvents),
        });
      }
    }
  } catch (error) {
    console.error("Error sending events to worker", error);
  }
};
