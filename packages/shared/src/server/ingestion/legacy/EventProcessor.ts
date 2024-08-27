import { v4 } from "uuid";
import { type z } from "zod";
import Decimal from "decimal.js";
import { findModel } from "../model-match";
import {
  ObservationEvent,
  eventTypes,
  legacyObservationCreateEvent,
  generationCreateEvent,
  traceEvent,
  scoreEvent,
  sdkLogEvent,
} from "../types";
import { validateAndInflateScore } from "../validateAndInflateScore";
import { ApiAccessScope } from "../../auth/types";
import { Trace, Observation, Score, Prisma, Model } from "@prisma/client";
import { ForbiddenError, LangfuseNotFoundError } from "../../../errors";
import { mergeJson } from "../../../utils/json";
import { jsonSchema } from "../../../utils/zod";
import { prisma } from "../../../db";

export interface EventProcessor {
  auth(apiScope: ApiAccessScope): void;

  process(
    apiScope: ApiAccessScope
  ): Promise<Trace | Observation | Score> | undefined;
}

export class ObservationProcessor implements EventProcessor {
  event: ObservationEvent;
  calculateTokenDelegate: (p: {
    model: Model;
    text: unknown;
  }) => number | undefined;

  constructor(
    event: ObservationEvent,
    calculateTokenDelegate: (p: {
      model: Model;
      text: unknown;
    }) => number | undefined
  ) {
    this.event = event;
    this.calculateTokenDelegate = calculateTokenDelegate;
  }

  async convertToObservation(
    apiScope: ApiAccessScope,
    existingObservation: Observation | null
  ): Promise<{
    id: string;
    create: Prisma.ObservationUncheckedCreateInput;
    update: Prisma.ObservationUncheckedUpdateInput;
  }> {
    let type: "EVENT" | "SPAN" | "GENERATION";
    switch (this.event.type) {
      case eventTypes.OBSERVATION_CREATE:
      case eventTypes.OBSERVATION_UPDATE:
        type = this.event.body.type;
        break;
      case eventTypes.EVENT_CREATE:
        type = "EVENT" as const;
        break;
      case eventTypes.SPAN_CREATE:
      case eventTypes.SPAN_UPDATE:
        type = "SPAN" as const;
        break;
      case eventTypes.GENERATION_CREATE:
      case eventTypes.GENERATION_UPDATE:
        type = "GENERATION" as const;
        break;
    }

    if (
      this.event.type === eventTypes.OBSERVATION_UPDATE &&
      !existingObservation
    ) {
      throw new LangfuseNotFoundError(
        `Observation with id ${this.event.id} not found`
      );
    }

    // find matching model definition based on event and existing observation in db
    const internalModel: Model | undefined | null =
      type === "GENERATION"
        ? await findModel({
            event: {
              projectId: apiScope.projectId,
              model:
                "model" in this.event.body
                  ? this.event.body.model ?? undefined
                  : undefined,
              unit:
                "usage" in this.event.body
                  ? this.event.body.usage?.unit ?? undefined
                  : undefined,
              startTime: this.event.body.startTime
                ? new Date(this.event.body.startTime)
                : undefined,
            },
            existingDbObservation: existingObservation ?? undefined,
          })
        : undefined;

    const traceId =
      !this.event.body.traceId && !existingObservation
        ? // Create trace if no traceid
          (
            await prisma.trace.create({
              data: {
                projectId: apiScope.projectId,
                name: this.event.body.name,
              },
            })
          ).id
        : this.event.body.traceId;

    // Token counts
    const [newInputCount, newOutputCount] =
      "usage" in this.event.body
        ? this.calculateTokenCounts(
            this.event.body,
            this.calculateTokenDelegate,
            internalModel ?? undefined,
            existingObservation ?? undefined
          )
        : [undefined, undefined];

    const newTotalCount =
      "usage" in this.event.body
        ? this.event.body.usage?.total ??
          (newInputCount != null || newOutputCount != null
            ? (newInputCount ?? 0) + (newOutputCount ?? 0)
            : undefined)
        : undefined;

    const userProvidedTokenCosts = {
      inputCost:
        "usage" in this.event.body && this.event.body.usage?.inputCost != null // inputCost can be explicitly 0. Note only one equal sign to capture null AND undefined
          ? new Decimal(this.event.body.usage?.inputCost)
          : existingObservation?.inputCost,
      outputCost:
        "usage" in this.event.body && this.event.body.usage?.outputCost != null // outputCost can be explicitly 0. Note only one equal sign to capture null AND undefined
          ? new Decimal(this.event.body.usage?.outputCost)
          : existingObservation?.outputCost,
      totalCost:
        "usage" in this.event.body && this.event.body.usage?.totalCost != null // totalCost can be explicitly 0. Note only one equal sign to capture null AND undefined
          ? new Decimal(this.event.body.usage?.totalCost)
          : existingObservation?.totalCost,
    };

    const tokenCounts = {
      input: newInputCount ?? existingObservation?.promptTokens,
      output: newOutputCount ?? existingObservation?.completionTokens,
      total: newTotalCount || existingObservation?.totalTokens,
    };

    const calculatedCosts = ObservationProcessor.calculateTokenCosts(
      internalModel,
      userProvidedTokenCosts,
      tokenCounts
    );

    // merge metadata from existingObservation.metadata and metadata
    const mergedMetadata = mergeJson(
      existingObservation?.metadata
        ? jsonSchema.parse(existingObservation.metadata)
        : undefined,
      this.event.body.metadata ?? undefined
    );

    const prompt =
      "promptName" in this.event.body &&
      typeof this.event.body.promptName === "string" &&
      "promptVersion" in this.event.body &&
      typeof this.event.body.promptVersion === "number"
        ? await prisma.prompt.findUnique({
            where: {
              projectId_name_version: {
                projectId: apiScope.projectId,
                name: this.event.body.promptName,
                version: this.event.body.promptVersion,
              },
            },
          })
        : undefined;

    // Only null if promptName and promptVersion are set but prompt is not found
    if (prompt === null)
      console.warn("Prompt not found for observation", this.event.body);

    const observationId = this.event.body.id ?? v4();

    return {
      id: observationId,
      create: {
        id: observationId,
        traceId: traceId,
        type: type,
        name: this.event.body.name,
        startTime: this.event.body.startTime
          ? new Date(this.event.body.startTime)
          : undefined,
        endTime:
          "endTime" in this.event.body && this.event.body.endTime
            ? new Date(this.event.body.endTime)
            : undefined,
        completionStartTime:
          "completionStartTime" in this.event.body &&
          this.event.body.completionStartTime
            ? new Date(this.event.body.completionStartTime)
            : undefined,
        metadata: mergedMetadata ?? this.event.body.metadata ?? undefined,
        model: "model" in this.event.body ? this.event.body.model : undefined,
        modelParameters:
          "modelParameters" in this.event.body
            ? this.event.body.modelParameters ?? undefined
            : undefined,
        input: this.event.body.input ?? undefined,
        output: this.event.body.output ?? undefined,
        promptTokens: newInputCount,
        completionTokens: newOutputCount,
        totalTokens: newTotalCount,
        unit:
          "usage" in this.event.body
            ? this.event.body.usage?.unit ?? internalModel?.unit
            : internalModel?.unit,
        level: this.event.body.level ?? undefined,
        statusMessage: this.event.body.statusMessage ?? undefined,
        parentObservationId: this.event.body.parentObservationId ?? undefined,
        version: this.event.body.version ?? undefined,
        projectId: apiScope.projectId,
        promptId: prompt ? prompt.id : undefined,
        ...(internalModel
          ? { internalModel: internalModel.modelName }
          : undefined),
        inputCost:
          "usage" in this.event.body
            ? this.event.body.usage?.inputCost
            : undefined,
        outputCost:
          "usage" in this.event.body
            ? this.event.body.usage?.outputCost
            : undefined,
        totalCost:
          "usage" in this.event.body
            ? this.event.body.usage?.totalCost
            : undefined,
        calculatedInputCost: calculatedCosts?.inputCost,
        calculatedOutputCost: calculatedCosts?.outputCost,
        calculatedTotalCost: calculatedCosts?.totalCost,
        internalModelId: internalModel?.id,
      },
      update: {
        name: this.event.body.name ?? undefined,
        startTime: this.event.body.startTime
          ? new Date(this.event.body.startTime)
          : undefined,
        endTime:
          "endTime" in this.event.body && this.event.body.endTime
            ? new Date(this.event.body.endTime)
            : undefined,
        completionStartTime:
          "completionStartTime" in this.event.body &&
          this.event.body.completionStartTime
            ? new Date(this.event.body.completionStartTime)
            : undefined,
        metadata: mergedMetadata ?? this.event.body.metadata ?? undefined,
        model: "model" in this.event.body ? this.event.body.model : undefined,
        modelParameters:
          "modelParameters" in this.event.body
            ? this.event.body.modelParameters ?? undefined
            : undefined,
        input: this.event.body.input ?? undefined,
        output: this.event.body.output ?? undefined,
        promptTokens: newInputCount,
        completionTokens: newOutputCount,
        totalTokens: newTotalCount,
        unit:
          "usage" in this.event.body
            ? this.event.body.usage?.unit ?? internalModel?.unit
            : internalModel?.unit,
        level: this.event.body.level ?? undefined,
        statusMessage: this.event.body.statusMessage ?? undefined,
        parentObservationId: this.event.body.parentObservationId ?? undefined,
        version: this.event.body.version ?? undefined,
        promptId: prompt ? prompt.id : undefined,
        ...(internalModel
          ? { internalModel: internalModel.modelName }
          : undefined),
        inputCost:
          "usage" in this.event.body
            ? this.event.body.usage?.inputCost
            : undefined,
        outputCost:
          "usage" in this.event.body
            ? this.event.body.usage?.outputCost
            : undefined,
        totalCost:
          "usage" in this.event.body
            ? this.event.body.usage?.totalCost
            : undefined,
        calculatedInputCost: calculatedCosts?.inputCost,
        calculatedOutputCost: calculatedCosts?.outputCost,
        calculatedTotalCost: calculatedCosts?.totalCost,
        internalModelId: internalModel?.id,
      },
    };
  }

  calculateTokenCounts(
    body:
      | z.infer<typeof legacyObservationCreateEvent>["body"]
      | z.infer<typeof generationCreateEvent>["body"],
    calculateTokenDelegate: (p: {
      model: Model;
      text: unknown;
    }) => number | undefined,
    model?: Model,
    existingObservation?: Observation
  ) {
    const newPromptTokens =
      body.usage?.input ??
      ((body.input || existingObservation?.input) && model && model.tokenizerId
        ? calculateTokenDelegate({
            model: model,
            text: body.input ?? existingObservation?.input,
          })
        : undefined);

    const newCompletionTokens =
      body.usage?.output ??
      ((body.output || existingObservation?.output) &&
      model &&
      model.tokenizerId
        ? calculateTokenDelegate({
            model: model,
            text: body.output ?? existingObservation?.output,
          })
        : undefined);

    return [newPromptTokens, newCompletionTokens];
  }

  static calculateTokenCosts(
    model: Model | null | undefined,
    userProvidedCosts: {
      inputCost?: Decimal | null;
      outputCost?: Decimal | null;
      totalCost?: Decimal | null;
    },
    tokenCounts: { input?: number; output?: number; total?: number }
  ): {
    inputCost?: Decimal | null;
    outputCost?: Decimal | null;
    totalCost?: Decimal | null;
  } {
    // If user has provided any cost point, do not calculate anything else
    if (
      userProvidedCosts.inputCost ||
      userProvidedCosts.outputCost ||
      userProvidedCosts.totalCost
    ) {
      return {
        ...userProvidedCosts,
        totalCost:
          userProvidedCosts.totalCost ??
          (userProvidedCosts.inputCost ?? new Decimal(0)).add(
            userProvidedCosts.outputCost ?? new Decimal(0)
          ),
      };
    }

    const finalInputCost =
      tokenCounts.input !== undefined && model?.inputPrice
        ? model.inputPrice.mul(tokenCounts.input)
        : undefined;

    const finalOutputCost =
      tokenCounts.output !== undefined && model?.outputPrice
        ? model.outputPrice.mul(tokenCounts.output)
        : finalInputCost
          ? new Decimal(0)
          : undefined;

    const finalTotalCost =
      tokenCounts.total !== undefined && model?.totalPrice
        ? model.totalPrice.mul(tokenCounts.total)
        : finalInputCost ?? finalOutputCost
          ? new Decimal(finalInputCost ?? 0).add(finalOutputCost ?? 0)
          : undefined;

    return {
      inputCost: finalInputCost,
      outputCost: finalOutputCost,
      totalCost: finalTotalCost,
    };
  }

  auth(apiScope: ApiAccessScope): void {
    if (apiScope.accessLevel !== "all")
      throw new ForbiddenError("Access denied for observation creation");
  }

  async process(apiScope: ApiAccessScope): Promise<Observation> {
    this.auth(apiScope);

    const existingObservation = this.event.body.id
      ? await prisma.observation.findFirst({
          where: { id: this.event.body.id },
        })
      : null;

    if (
      existingObservation &&
      existingObservation.projectId !== apiScope.projectId
    ) {
      throw new ForbiddenError(
        `Access denied for observation creation ${existingObservation.projectId} `
      );
    }

    const obs = await this.convertToObservation(apiScope, existingObservation);

    // Do not use nested upserts or multiple where conditions as this should be a single native database upsert
    // https://www.prisma.io/docs/orm/reference/prisma-client-reference#database-upserts
    return await prisma.observation.upsert({
      where: {
        id: obs.id,
      },
      create: obs.create,
      update: obs.update,
    });
  }
}
export class TraceProcessor implements EventProcessor {
  event: z.infer<typeof traceEvent>;

  constructor(event: z.infer<typeof traceEvent>) {
    this.event = event;
  }

  auth(apiScope: ApiAccessScope): void {
    if (apiScope.accessLevel !== "all")
      throw new ForbiddenError("Access denied for trace creation");
  }

  async process(
    apiScope: ApiAccessScope
  ): Promise<Trace | Observation | Score> {
    const { body } = this.event;

    this.auth(apiScope);

    const internalId = body.id ?? v4();

    console.log(
      "Trying to create trace, project ",
      apiScope.projectId,
      ", id:",
      internalId
    );

    const existingTrace = await prisma.trace.findFirst({
      where: {
        id: internalId,
      },
    });

    if (existingTrace && existingTrace.projectId !== apiScope.projectId) {
      throw new ForbiddenError(
        `Access denied for trace creation ${existingTrace.projectId}`
      );
    }

    const mergedMetadata = mergeJson(
      existingTrace?.metadata
        ? jsonSchema.parse(existingTrace.metadata)
        : undefined,
      body.metadata ?? undefined
    );

    const mergedTags =
      existingTrace?.tags && body.tags
        ? Array.from(new Set(existingTrace.tags.concat(body.tags ?? []))).sort()
        : body.tags
          ? Array.from(new Set(body.tags)).sort()
          : undefined;

    if (body.sessionId) {
      await prisma.traceSession.upsert({
        where: {
          id_projectId: {
            id: body.sessionId,
            projectId: apiScope.projectId,
          },
        },
        create: {
          id: body.sessionId,
          projectId: apiScope.projectId,
        },
        update: {},
      });
    }

    // Do not use nested upserts or multiple where conditions as this should be a single native database upsert
    // https://www.prisma.io/docs/orm/reference/prisma-client-reference#database-upserts
    const upsertedTrace = await prisma.trace.upsert({
      where: {
        id: internalId,
      },
      create: {
        id: internalId,
        timestamp: this.event.body.timestamp
          ? new Date(this.event.body.timestamp)
          : undefined,
        name: body.name ?? undefined,
        userId: body.userId ?? undefined,
        input: body.input ?? undefined,
        output: body.output ?? undefined,
        metadata: mergedMetadata ?? body.metadata ?? undefined,
        release: body.release ?? undefined,
        version: body.version ?? undefined,
        sessionId: body.sessionId ?? undefined,
        public: body.public ?? undefined,
        projectId: apiScope.projectId,
        tags: mergedTags ?? undefined,
      },
      update: {
        name: body.name ?? undefined,
        timestamp: this.event.body.timestamp
          ? new Date(this.event.body.timestamp)
          : undefined,
        userId: body.userId ?? undefined,
        input: body.input ?? undefined,
        output: body.output ?? undefined,
        metadata: mergedMetadata ?? body.metadata ?? undefined,
        release: body.release ?? undefined,
        version: body.version ?? undefined,
        sessionId: body.sessionId ?? undefined,
        public: body.public ?? undefined,
        tags: mergedTags ?? undefined,
      },
    });
    return upsertedTrace;
  }
}
export class ScoreProcessor implements EventProcessor {
  event: z.infer<typeof scoreEvent>;

  constructor(event: z.infer<typeof scoreEvent>) {
    this.event = event;
  }

  auth(apiScope: ApiAccessScope) {
    if (apiScope.accessLevel !== "scores" && apiScope.accessLevel !== "all")
      throw new ForbiddenError(
        `Access denied for score creation, ${apiScope.accessLevel}`
      );
  }

  async process(
    apiScope: ApiAccessScope
  ): Promise<Trace | Observation | Score> {
    const { body } = this.event;

    this.auth(apiScope);

    const id = body.id ?? v4();

    const existingScore = await prisma.score.findFirst({
      where: {
        id: id,
      },
      select: {
        projectId: true,
      },
    });
    if (existingScore && existingScore.projectId !== apiScope.projectId) {
      throw new ForbiddenError(
        `Access denied for score creation ${existingScore.projectId}`
      );
    }

    const validatedScore = await validateAndInflateScore({
      body,
      scoreId: id,
      projectId: apiScope.projectId,
    });

    return await prisma.score.upsert({
      where: {
        id_projectId: {
          id,
          projectId: apiScope.projectId,
        },
      },
      create: {
        ...validatedScore,
      },
      update: {
        ...validatedScore,
      },
    });
  }
}

export class SdkLogProcessor implements EventProcessor {
  event: z.infer<typeof sdkLogEvent>;

  constructor(event: z.infer<typeof sdkLogEvent>) {
    this.event = event;
  }

  auth(apiScope: ApiAccessScope) {
    return;
  }

  process() {
    try {
      console.log("SDK Log", this.event);
      return undefined;
    } catch (error) {
      return undefined;
    }
  }
}
