import {
  type AuthHeaderVerificationResult,
  verifyAuthHeaderAndReturnScope,
} from "@/src/features/public-api/server/apiAuth";
import { cors, runMiddleware } from "@/src/features/public-api/server/cors";
import { prisma } from "@/src/server/db";
import { type NextApiRequest, type NextApiResponse } from "next";
import { z } from "zod";
import {
  type ingestionApiSchema,
  eventTypes,
  singleEventSchema,
} from "@/src/features/public-api/server/ingestion-api-schema";
import { type ApiAccessScope } from "@/src/features/public-api/server/types";
import { persistEventMiddleware } from "@/src/server/api/services/event-service";
import { backOff } from "exponential-backoff";
import { ResourceNotFoundError } from "@/src/utils/exceptions";
import { type EventProcessor } from "../../../server/api/services/EventProcessor";
import { ObservationProcessor } from "../../../server/api/services/EventProcessor";
import { TraceProcessor } from "../../../server/api/services/EventProcessor";
import { ScoreProcessor } from "../../../server/api/services/EventProcessor";
import { isNotNullOrUndefined } from "@/src/utils/types";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  try {
    await runMiddleware(req, res, cors);

    if (req.method !== "POST") {
      return res.status(405).json({ message: "Method not allowed" });
    }

    // CHECK AUTH FOR ALL EVENTS
    const authCheck = await verifyAuthHeaderAndReturnScope(
      req.headers.authorization,
    );

    if (!authCheck.validKey)
      return res.status(401).json({
        message: authCheck.error,
      });

    if (authCheck.scope.accessLevel !== "all")
      return res.status(403).json({
        message: "Access denied",
      });

    const batchType = z.object({ batch: z.array(z.unknown()) });
    const parsedSchema = batchType.safeParse(req.body);

    if (!parsedSchema.success) {
      console.log("Invalid request data", parsedSchema.error);
      return res.status(400).json({
        message: "Invalid request data",
        errors: parsedSchema.error.issues.map((issue) => issue.message),
      });
    }

    const errors: { id: string; error: unknown }[] = [];

    const batch: (z.infer<typeof singleEventSchema> | undefined)[] =
      parsedSchema.data.batch.map((event) => {
        const parsed = singleEventSchema.safeParse(event);
        if (!parsed.success) {
          errors.push({
            id:
              typeof event === "object" && event && "id" in event
                ? typeof event.id === "string"
                  ? event.id
                  : "unknown"
                : "unknown",
            error: new BadRequestError(parsed.error.message),
          });
          return undefined;
        } else {
          return parsed.data;
        }
      });
    const filteredBatch: z.infer<typeof singleEventSchema>[] =
      batch.filter(isNotNullOrUndefined);

    const sortedBatch = sortBatch(filteredBatch);
    const result = await handleBatch(sortedBatch, req, authCheck);

    handleBatchResult([...errors, ...result.errors], result.results, res);
  } catch (error: unknown) {
    console.error(error);
    const errorMessage =
      error instanceof Error ? error.message : "An unknown error occurred";
    res.status(400).json({
      message: "Invalid request data",
      errors: [errorMessage],
    });
  }
}

const sortBatch = (batch: Array<z.infer<typeof singleEventSchema>>) => {
  // keep the order of events as they are. Order events in a way that types containing update come last
  return batch.sort((a, b) => {
    if (a.type === eventTypes.OBSERVAION_UPDATE) {
      return 1;
    }
    if (b.type === eventTypes.OBSERVAION_UPDATE) {
      return -1;
    }
    return 0;
  });
};

export const handleBatch = async (
  events: z.infer<typeof ingestionApiSchema>["batch"],
  req: NextApiRequest,
  authCheck: AuthHeaderVerificationResult,
) => {
  console.log("handling ingestion event", JSON.stringify(events, null, 2));

  if (!authCheck.validKey) throw new AuthenticationError(authCheck.error);

  const results = []; // Array to store the results
  const errors = []; // Array to store the errors
  for (const singleEvent of events) {
    try {
      const result = await retry(async () => {
        return await handleSingleEvent(singleEvent, req, authCheck.scope);
      });
      results.push({ result: result, id: singleEvent.id }); // Push each result into the array
    } catch (error) {
      // Handle or log the error if `handleSingleEvent` fails
      console.error("Error handling event:", error);
      // Decide how to handle the error: rethrow, continue, or push an error object to results
      // For example, push an error object:
      errors.push({ error: error, id: singleEvent.id });
    }
  }

  return { results, errors };
};

async function retry<T>(request: () => Promise<T>): Promise<T> {
  return await backOff(request, {
    numOfAttempts: 3,
    retry: (e: Error, attemptNumber: number) => {
      if (e instanceof AuthenticationError) {
        console.log("not retrying auth error");
        return false;
      }
      console.log(`retrying processing events ${attemptNumber}`);
      return true;
    },
  });
}
export const getBadRequestError = (errors: Array<unknown>): BadRequestError[] =>
  errors.filter(
    (error): error is BadRequestError => error instanceof BadRequestError,
  );

export const getResourceNotFoundError = (
  errors: Array<unknown>,
): ResourceNotFoundError[] =>
  errors.filter(
    (error): error is ResourceNotFoundError =>
      error instanceof ResourceNotFoundError,
  );

export const hasBadRequestError = (errors: Array<unknown>) =>
  errors.some((error) => error instanceof BadRequestError);

const handleSingleEvent = async (
  event: z.infer<typeof singleEventSchema>,
  req: NextApiRequest,
  apiScope: ApiAccessScope,
) => {
  console.log(
    `handling single event ${event.id}`,
    JSON.stringify(event, null, 2),
  );

  const { type } = event;

  await persistEventMiddleware(prisma, apiScope.projectId, req, event);

  let processor: EventProcessor;
  switch (type) {
    case eventTypes.TRACE_CREATE:
      processor = new TraceProcessor(event);
      break;
    case eventTypes.OBSERVATION_CREATE:
    case eventTypes.OBSERVAION_UPDATE:
      processor = new ObservationProcessor(event);
      break;
    case eventTypes.SCORE_CREATE: {
      processor = new ScoreProcessor(event);
      break;
    }
  }

  return await processor.process(apiScope);
};

class BadRequestError extends Error {
  constructor(msg: string) {
    super(msg);

    // Set the prototype explicitly.
    Object.setPrototypeOf(this, BadRequestError.prototype);
  }
}

export class AuthenticationError extends Error {
  constructor(msg: string) {
    super(msg);

    // Set the prototype explicitly.
    Object.setPrototypeOf(this, AuthenticationError.prototype);
  }
}

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
    if (error.error instanceof BadRequestError) {
      returnedErrors.push({
        id: error.id,
        status: 400,
        message: "Invalid request data",
        error: error.error.message,
      });
    } else if (error.error instanceof ResourceNotFoundError) {
      if (!errors.some((res) => res.id === error.id)) {
        returnedErrors.push({
          id: error.id,
          status: 404,
          message: "Resource not found",
          error: error.error.message,
        });
      }
    } else {
      if (!errors.some((res) => res.id === error.id)) {
        returnedErrors.push({
          id: error.id,
          status: 500,
          message: "Error processing events",
          error: "Internal Server Error",
        });
      }
    }
  });

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
      message: "Error processing events",
      errors: ["Internal Server Error"],
    });
  }
  return res.status(200).send(results.length > 0 ? results[0]?.result : {});
};
