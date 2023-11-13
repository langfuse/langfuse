import {
  type AuthHeaderVerificationResult,
  verifyAuthHeaderAndReturnScope,
} from "@/src/features/public-api/server/apiAuth";
import { cors, runMiddleware } from "@/src/features/public-api/server/cors";
import { prisma } from "@/src/server/db";
import { type NextApiRequest, type NextApiResponse } from "next";
import { v4 } from "uuid";
import {
  type Trace,
  type Prisma,
  type Observation,
  type Score,
} from "@prisma/client";
import { tokenCount } from "@/src/features/ingest/lib/usage";
import { type z } from "zod";
import {
  ingestionApiSchema,
  eventTypes,
  type traceEvent,
  type observationEvent,
  type singleEventSchema,
  type scoreEvent,
  type observationUpdateEvent,
} from "./ingestion-api-schema";
import { type ApiAccessScope } from "@/src/features/public-api/server/types";
import { checkApiAccessScope } from "@/src/features/public-api/server/apiScope";
import { persistEventMiddleware } from "@/src/pages/api/public/event-service";
import { backOff } from "exponential-backoff";
import { RessourceNotFoundError } from "@/src/utils/exceptions";

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

    const parsedSchema = ingestionApiSchema.safeParse(req.body);

    if (!parsedSchema.success) {
      console.log("Invalid request data", parsedSchema.error, req.body);
      return res.status(400).json({
        message: "Invalid request data",
        errors: parsedSchema.error,
      });
    }

    const sortedBatch = sortBatch(parsedSchema.data.batch);
    const result = await handleBatch(sortedBatch, req, authCheck);

    handleBatchResult(result.errors, result.results, res);
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
      results.push(result); // Push each result into the array
    } catch (error) {
      // Handle or log the error if `handleSingleEvent` fails
      console.error("Error handling event:", error);
      // Decide how to handle the error: rethrow, continue, or push an error object to results
      // For example, push an error object:
      errors.push(error);
      results.push({ error: "Error processing event", details: error });
    }
  }

  return { results, errors };
};

async function retry<T>(request: () => Promise<T>): Promise<T> {
  return await backOff(request, {
    numOfAttempts: 2,
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

export const getRessourceNotFoundError = (
  errors: Array<unknown>,
): RessourceNotFoundError[] =>
  errors.filter(
    (error): error is RessourceNotFoundError =>
      error instanceof RessourceNotFoundError,
  );

export const hasBadRequestError = (errors: Array<unknown>) =>
  errors.some((error) => error instanceof BadRequestError);

const handleSingleEvent = async (
  event: z.infer<typeof singleEventSchema>,
  req: NextApiRequest,
  apiScope: ApiAccessScope,
) => {
  console.log("handling single event", JSON.stringify(event, null, 2));

  const { type } = event;

  await persistEventMiddleware(prisma, apiScope.projectId, req, event);

  let processor: EventProcessor;
  switch (type) {
    case eventTypes.TRACE_CREATE:
      processor = new TraceProcessor(event);
      break;
    case eventTypes.OBSERVAION_CREATE:
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

class ScoreProcessor implements EventProcessor {
  event: z.infer<typeof scoreEvent>;

  constructor(event: z.infer<typeof scoreEvent>) {
    this.event = event;
  }

  async process(
    apiScope: ApiAccessScope,
  ): Promise<Trace | Observation | Score> {
    const { body } = this.event;

    const accessCheck = await checkApiAccessScope(
      apiScope,
      [
        { type: "trace", id: body.traceId },
        ...(body.observationId
          ? [{ type: "observation" as const, id: body.observationId }]
          : []),
      ],
      "score",
    );
    if (!accessCheck)
      throw new AuthenticationError("Access denied for score creation");

    return await prisma.score.create({
      data: {
        id: body.id ?? v4(),
        timestamp: new Date(),
        value: body.value,
        name: body.name,
        comment: body.comment,
        trace: { connect: { id: body.traceId } },
        ...(body.observationId && {
          observation: { connect: { id: body.observationId } },
        }),
      },
    });
  }
}

class TraceProcessor implements EventProcessor {
  event: z.infer<typeof traceEvent>;

  constructor(event: z.infer<typeof traceEvent>) {
    this.event = event;
  }

  async process(
    apiScope: ApiAccessScope,
  ): Promise<Trace | Observation | Score> {
    const { body } = this.event;

    if (apiScope.accessLevel !== "all")
      throw new AuthenticationError("Access denied for trace creation");

    const internalId = body.id ?? v4();

    console.log(
      "Trying to create trace, project ",
      apiScope.projectId,
      ", body:",
      body,
    );

    const upsertedTrace = await prisma.trace.upsert({
      where: {
        id: internalId,
        projectId: apiScope.projectId,
      },
      create: {
        id: internalId,
        name: body.name ?? undefined,
        userId: body.userId ?? undefined,
        metadata: body.metadata ?? undefined,
        release: body.release ?? undefined,
        version: body.version ?? undefined,
        project: { connect: { id: apiScope.projectId } },
      },
      update: {
        name: body.name ?? undefined,
        userId: body.userId ?? undefined,
        metadata: body.metadata ?? undefined,
        release: body.release ?? undefined,
        version: body.version ?? undefined,
      },
    });
    return upsertedTrace;
  }
}

class BadRequestError extends Error {
  constructor(msg: string) {
    super(msg);

    // Set the prototype explicitly.
    Object.setPrototypeOf(this, BadRequestError.prototype);
  }
}

class AuthenticationError extends Error {
  constructor(msg: string) {
    super(msg);

    // Set the prototype explicitly.
    Object.setPrototypeOf(this, AuthenticationError.prototype);
  }
}

interface EventProcessor {
  process(apiScope: ApiAccessScope): Promise<Trace | Observation | Score>;
}

class ObservationProcessor implements EventProcessor {
  event:
    | z.infer<typeof observationEvent>
    | z.infer<typeof observationUpdateEvent>;

  constructor(
    event:
      | z.infer<typeof observationEvent>
      | z.infer<typeof observationUpdateEvent>,
  ) {
    this.event = event;
  }

  async convertToObservation(apiScope: ApiAccessScope): Promise<{
    id: string;
    create: Prisma.ObservationCreateInput;
    update: Prisma.ObservationUpdateInput;
  }> {
    const { body } = this.event;

    const {
      id,
      traceId,
      type,
      name,
      startTime,
      endTime,
      completionStartTime,
      model,
      modelParameters,
      input,
      output,
      usage,
      metadata,
      parentObservationId,
      level,
      statusMessage,
      version,
    } = body;

    const existingObservation = id
      ? await prisma.observation.findUnique({
          where: { id },
        })
      : null;

    if (
      this.event.type === eventTypes.OBSERVAION_UPDATE &&
      !existingObservation
    ) {
      throw new RessourceNotFoundError(this.event.id, "Observation not found");
    }

    const finalTraceId =
      !traceId && !existingObservation
        ? // Create trace if no traceid
          (
            await prisma.trace.create({
              data: {
                projectId: apiScope.projectId,
                name: name,
              },
            })
          ).id
        : traceId;

    const [newPromptTokens, newCompletionTokens] = this.calculateTokenCounts(
      body,
      existingObservation ?? undefined,
    );

    const observationId = id ?? v4();
    return {
      id: observationId,
      create: {
        id: observationId,
        traceId: finalTraceId,
        type: type,
        name: name,
        startTime: startTime ? new Date(startTime) : undefined,
        endTime: endTime ? new Date(endTime) : undefined,
        completionStartTime: completionStartTime
          ? new Date(completionStartTime)
          : undefined,
        metadata: metadata ?? undefined,
        model: model ?? undefined,
        modelParameters: modelParameters ?? undefined,
        input: input ?? undefined,
        output: output ?? undefined,
        promptTokens: newPromptTokens,
        completionTokens: newCompletionTokens,
        totalTokens:
          usage?.totalTokens ??
          (newPromptTokens ?? 0) + (newCompletionTokens ?? 0),
        level: level ?? undefined,
        statusMessage: statusMessage ?? undefined,
        parentObservationId: parentObservationId ?? undefined,
        version: version ?? undefined,
        project: { connect: { id: apiScope.projectId } },
      },
      update: {
        type: type,
        name,
        startTime: startTime ? new Date(startTime) : undefined,
        endTime: endTime ? new Date(endTime) : undefined,
        completionStartTime: completionStartTime
          ? new Date(completionStartTime)
          : undefined,
        metadata: metadata ?? undefined,
        model: model ?? undefined,
        modelParameters: modelParameters ?? undefined,
        input: input ?? undefined,
        output: output ?? undefined,
        promptTokens: newPromptTokens,
        completionTokens: newCompletionTokens,
        totalTokens:
          usage?.totalTokens ??
          (newPromptTokens ?? 0) + (newCompletionTokens ?? 0),
        level: level ?? undefined,
        statusMessage: statusMessage ?? undefined,
        parentObservationId: parentObservationId ?? undefined,
        version: version ?? undefined,
      },
    };
  }

  calculateTokenCounts(
    body: z.infer<typeof observationEvent>["body"],
    existingObservation?: Observation,
  ) {
    const mergedModel = body.model ?? existingObservation?.model;

    const newPromptTokens =
      body.usage?.promptTokens ??
      ((body.input || existingObservation?.input) && mergedModel
        ? tokenCount({
            model: mergedModel,
            text: body.input ?? existingObservation?.input,
          })
        : undefined);

    const newCompletionTokens =
      body.usage?.completionTokens ??
      ((body.output || existingObservation?.output) && mergedModel
        ? tokenCount({
            model: mergedModel,
            text: body.output ?? existingObservation?.output,
          })
        : undefined);
    return [newPromptTokens, newCompletionTokens];
  }

  async process(
    apiScope: ApiAccessScope,
  ): Promise<Trace | Observation | Score> {
    if (apiScope.accessLevel !== "all")
      throw new AuthenticationError("Access denied for observation creation");

    const obs = await this.convertToObservation(apiScope);

    return await prisma.observation.upsert({
      where: {
        id_projectId: {
          id: obs.id,
          projectId: apiScope.projectId,
        },
      },
      create: obs.create,
      update: obs.update,
    });
  }
}

export const handleBatchResult = (
  errors: Array<unknown>,
  results: Array<unknown>,
  res: NextApiResponse,
) => {
  const badRequestErrors = getBadRequestError(errors);
  if (badRequestErrors.length > 0) {
    console.log("Bad request errors", badRequestErrors);
    return res.status(400).json({
      message: "Invalid request data",
      errors: badRequestErrors.map((error) => error.message),
    });
  }

  const ressourceNotFoundError = getRessourceNotFoundError(errors);
  if (ressourceNotFoundError.length > 0) {
    return res.status(404).json({
      message: "Ressource not found",
      errors: ressourceNotFoundError.map((error) => error.message),
    });
  }

  if (errors.length > 0) {
    console.log("Error processing events", errors);
    return res.status(500).json({
      message: "Error processing events",
      errors: ["Internal Server Error"],
    });
  }

  return res.status(201).send(results.length > 0 ? results[0] : {});
};
