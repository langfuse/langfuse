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
  type TraceUpsertEventType,
  type EventBodyType,
  EventName,
} from "@langfuse/shared";
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
import { jsonSchema } from "@langfuse/shared";
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

    const sortedBatch = sortBatch(filteredBatch);
    const result = await handleBatch(
      sortedBatch,
      parsedSchema.data.metadata,
      req,
      authCheck,
    );

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

const sortBatch = (batch: Array<z.infer<typeof ingestionEvent>>) => {
  // keep the order of events as they are. Order events in a way that types containing updates come last
  // Filter out OBSERVATION_UPDATE events
  const updates = batch.filter(
    (event) => event.type === eventTypes.OBSERVATION_UPDATE,
  );

  // Keep all other events in their original order
  const others = batch.filter(
    (event) => event.type !== eventTypes.OBSERVATION_UPDATE,
  );

  // Return the array with non-update events first, followed by update events
  return [...others, ...updates];
};

export const handleBatch = async (
  events: z.infer<typeof ingestionApiSchema>["batch"],
  metadata: z.infer<typeof ingestionApiSchema>["metadata"],
  req: NextApiRequest,
  authCheck: AuthHeaderVerificationResult,
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
    `handling single event ${event.id} ${JSON.stringify({ body: restEvent })}`,
  );

  const cleanedEvent = ingestionEvent.parse(cleanEvent(event));

  const { type } = cleanedEvent;

  await persistEventMiddleware(
    prisma,
    apiScope.projectId,
    req,
    cleanedEvent,
    metadata,
  );

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
      processor = new ObservationProcessor(cleanedEvent);
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
                "admin" + ":" + env.LANGFUSE_WORKER_PASSWORD,
              ).toString("base64"),
          },
          body: JSON.stringify(body),
        });
      }
    }
  } catch (error) {
    console.error("Error sending events to worker", error);
  }
};
