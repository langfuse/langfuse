/** @jest-environment node */

import { v4 } from "uuid";

import { makeAPICall, pruneDatabase } from "@/src/__tests__/test-utils";
import { ModelUsageUnit } from "@langfuse/shared";
import { cleanEvent } from "@/src/pages/api/public/ingestion";
import { prisma } from "@langfuse/shared/src/db";

describe("/api/public/ingestion API Endpoint", () => {
  beforeEach(async () => await pruneDatabase());

  [
    {
      usage: {
        input: 100,
        output: 200,
        total: 100,
        unit: ModelUsageUnit.Characters,
        inputCost: 123,
        outputCost: 456,
        totalCost: 789,
      },
      expectedUnit: ModelUsageUnit.Characters,
      expectedPromptTokens: 100,
      expectedCompletionTokens: 200,
      expectedTotalTokens: 100,
    },
    {
      usage: {
        total: 100,
        unit: ModelUsageUnit.Characters,
      },
      expectedUnit: ModelUsageUnit.Characters,
      expectedPromptTokens: 0,
      expectedCompletionTokens: 0,
      expectedTotalTokens: 100,
    },
    {
      usage: {
        total: 100,
        unit: ModelUsageUnit.Milliseconds,
      },
      expectedUnit: ModelUsageUnit.Milliseconds,
      expectedPromptTokens: 0,
      expectedCompletionTokens: 0,
      expectedTotalTokens: 100,
    },
    {
      usage: {
        input: 1,
        output: 2,
        unit: ModelUsageUnit.Images,
      },
      expectedUnit: ModelUsageUnit.Images,
      expectedPromptTokens: 1,
      expectedCompletionTokens: 2,
      expectedTotalTokens: 3,
    },
    {
      usage: {
        input: 30,
        output: 10,
        unit: ModelUsageUnit.Seconds,
      },
      expectedUnit: ModelUsageUnit.Seconds,
      expectedPromptTokens: 30,
      expectedCompletionTokens: 10,
      expectedTotalTokens: 40,
    },
    {
      usage: {
        total: 100,
      },
      expectedUnit: null,
      expectedPromptTokens: 0,
      expectedCompletionTokens: 0,
      expectedTotalTokens: 100,
    },
    {
      usage: {
        promptTokens: 100,
        completionTokens: 200,
        totalTokens: 100,
      },
      expectedPromptTokens: 100,
      expectedCompletionTokens: 200,
      expectedTotalTokens: 100,
      expectedUnit: ModelUsageUnit.Tokens,
    },
    {
      usage: {
        totalTokens: 100,
      },
      expectedPromptTokens: 0,
      expectedCompletionTokens: 0,
      expectedTotalTokens: 100,
      expectedUnit: ModelUsageUnit.Tokens,
    },
    {
      usage: undefined,
      expectedPromptTokens: 0,
      expectedCompletionTokens: 0,
      expectedTotalTokens: 0,
      expectedUnit: null,
    },
    {
      usage: null,
      expectedPromptTokens: 0,
      expectedCompletionTokens: 0,
      expectedTotalTokens: 0,
      expectedUnit: null,
    },
    {
      usage: {},
      expectedPromptTokens: 0,
      expectedCompletionTokens: 0,
      expectedTotalTokens: 0,
      expectedUnit: null,
    },
  ].forEach((testConfig) => {
    it(`should create trace, generation and score without matching models ${JSON.stringify(
      testConfig,
    )}`, async () => {
      const traceId = v4();
      const generationId = v4();
      const spanId = v4();
      const scoreId = v4();

      const response = await makeAPICall("POST", "/api/public/ingestion", {
        metadata: {
          sdk_verion: "1.0.0",
          sdk_name: "python",
        },
        batch: [
          {
            id: v4(),
            type: "trace-create",
            timestamp: new Date().toISOString(),
            body: {
              id: traceId,
              name: "trace-name",
              userId: "user-1",
              metadata: { key: "value" },
              release: "1.0.0",
              version: "2.0.0",
              tags: ["tag-1", "tag-2"],
            },
          },
          {
            id: v4(),
            type: "observation-create",
            timestamp: new Date().toISOString(),
            body: {
              id: generationId,
              traceId: traceId,
              type: "GENERATION",
              name: "generation-name",
              startTime: "2021-01-01T00:00:00.000Z",
              endTime: "2021-01-01T00:00:00.000Z",
              modelParameters: { key: "value" },
              input: { key: "value" },
              metadata: { key: "value" },
              version: "2.0.0",
            },
          },
          {
            id: v4(),
            type: "observation-update",
            timestamp: new Date().toISOString(),
            body: {
              id: generationId,
              type: "GENERATION",
              output: { key: "this is a great gpt output" },
              usage: testConfig.usage,
            },
          },
          {
            id: v4(),
            type: "observation-create",
            timestamp: new Date().toISOString(),
            body: {
              id: spanId,
              traceId: traceId,
              type: "SPAN",
              name: "span-name",
              startTime: "2021-01-01T00:00:00.000Z",
              endTime: "2021-01-01T00:00:00.000Z",
              input: { input: "value" },
              metadata: { meta: "value" },
              version: "2.0.0",
            },
          },
          {
            id: v4(),
            type: "score-create",
            timestamp: new Date().toISOString(),
            body: {
              id: scoreId,
              name: "score-name",
              value: 100.5,
              traceId: traceId,
            },
          },
        ],
      });

      expect(response.status).toBe(207);

      const dbTrace = await prisma.trace.findMany({
        where: {
          name: "trace-name",
        },
      });

      expect(dbTrace.length).toBeGreaterThan(0);
      expect(dbTrace[0]?.name).toBe("trace-name");
      expect(dbTrace[0]?.release).toBe("1.0.0");
      expect(dbTrace[0]?.externalId).toBeNull();
      expect(dbTrace[0]?.version).toBe("2.0.0");
      expect(dbTrace[0]?.projectId).toBe(
        "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
      );
      expect(dbTrace[0]?.tags).toEqual(["tag-1", "tag-2"]);

      const dbGeneration = await prisma.observation.findUnique({
        where: {
          id: generationId,
        },
      });

      expect(dbGeneration?.id).toBe(generationId);
      expect(dbGeneration?.traceId).toBe(traceId);
      expect(dbGeneration?.name).toBe("generation-name");
      expect(dbGeneration?.startTime).toEqual(
        new Date("2021-01-01T00:00:00.000Z"),
      );
      expect(dbGeneration?.endTime).toEqual(
        new Date("2021-01-01T00:00:00.000Z"),
      );
      expect(dbGeneration?.model).toBeNull();
      expect(dbGeneration?.modelParameters).toEqual({ key: "value" });
      expect(dbGeneration?.input).toEqual({ key: "value" });
      expect(dbGeneration?.metadata).toEqual({ key: "value" });
      expect(dbGeneration?.version).toBe("2.0.0");
      expect(dbGeneration?.internalModel).toBeNull();
      expect(dbGeneration?.promptTokens).toEqual(
        testConfig.expectedPromptTokens,
      );
      expect(dbGeneration?.completionTokens).toEqual(
        testConfig.expectedCompletionTokens,
      );
      expect(dbGeneration?.totalTokens).toEqual(testConfig.expectedTotalTokens);
      expect(dbGeneration?.unit).toEqual(testConfig.expectedUnit);
      expect(dbGeneration?.output).toEqual({
        key: "this is a great gpt output",
      });

      const dbSpan = await prisma.observation.findUnique({
        where: {
          id: spanId,
        },
      });

      expect(dbSpan?.id).toBe(spanId);
      expect(dbSpan?.name).toBe("span-name");
      expect(dbSpan?.startTime).toEqual(new Date("2021-01-01T00:00:00.000Z"));
      expect(dbSpan?.endTime).toEqual(new Date("2021-01-:00:00.000Z"));
      expect(dbSpan?.input).toEqual({ input: "value" });
      expect(dbSpan?.metadata).toEqual({ meta: "value" });
      expect(dbSpan?.version).toBe("2.0.0");

      const dbScore = await prisma.score.findUnique({
        where: {
          id: scoreId,
        },
      });

      expect(dbScore?.id).toBe(scoreId);
      expect(dbScore?.traceId).toBe(traceId);
      expect(dbScore?.name).toBe("score-name");
      expect(dbScore?.value).toBe(100.5);
      expect(dbScore?.observationId).toBeNull();
      expect(dbScore?.projectId).toBe("7a88fb47-b4e2-43b8-a06c-a5ce950dc53a");
    });
  });

  [
    {
      observationExternalModel: "gpt-3.5",
      observationStartTime: new Date("2021-01-01T00:00:00.000Z"),
      modelUnit: ModelUsageUnit.Tokens,
      expectedInternalModel: "gpt-3.5-turbo",
      expectedPromptTokens: 5,
      expectedCompletionTokens: 7,
      models: [
        {
          modelName: "gpt-3.5-turbo",
          matchPattern: "(?i)^(gpt-)(35|3.5)(-turbo)?$",
          startDate: new Date("2021-01-01T00:00:00.000Z"),
          unit: ModelUsageUnit.Tokens,
          tokenizerId: "openai",
        },
      ],
    },
    {
      observationExternalModel: "gpt-3.5",
      observationStartTime: new Date("2021-01-01T00:00:00.000Z"),
      modelUnit: ModelUsageUnit.Tokens,
      expectedInternalModel: "gpt-3.5-turbo",
      expectedPromptTokens: 5,
      expectedCompletionTokens: 7,
      models: [
        {
          modelName: "gpt-3.5-turbo",
          matchPattern: "(?i)^(gpt-)(35|3.5)(-turbo)?$",
          startDate: null,
          unit: ModelUsageUnit.Tokens,
          tokenizerId: "openai",
        },
      ],
    },
    {
      observationExternalModel: "GPT-3.5",
      observationStartTime: new Date("2021-01-01T00:00:00.000Z"),
      modelUnit: ModelUsageUnit.Tokens,
      expectedInternalModel: "gpt-3.5-turbo",
      expectedPromptTokens: 5,
      expectedCompletionTokens: 7,
      models: [
        {
          modelName: "gpt-3.5-turbo",
          matchPattern: "(?i)^(gpt-)(35|3.5)(-turbo)?$",
          startDate: new Date("2021-01-01T00:00:00.000Z"),
          unit: ModelUsageUnit.Tokens,
          tokenizerId: "openai",
        },
      ],
    },
    {
      observationExternalModel: "GPT-3.5",
      observationStartTime: new Date("2021-01-01T00:00:00.000Z"),
      modelUnit: ModelUsageUnit.Tokens,
      expectedInternalModel: "gpt-3.5-turbo",
      expectedPromptTokens: 5,
      expectedCompletionTokens: 7,
      models: [
        {
          modelName: "gpt-3.5-turbo",
          matchPattern: "(?i)^(gpt-)(35|3.5)(-turbo)?$",
          startDate: new Date("2021-01-01T00:00:00.000Z"),
          unit: ModelUsageUnit.Tokens,
          tokenizerId: "openai",
        },
        {
          modelName: "gpt-3.5-turbo-new",
          matchPattern: "(?i)^(gpt-)(35|3.5)(-turbo)?$",
          startDate: new Date("2021-01-01T10:00:00.000Z"),
          unit: ModelUsageUnit.Tokens,
          tokenizerId: "openai",
        },
      ],
    },
    {
      observationExternalModel: "GPT-3.5",
      observationStartTime: new Date("2021-01-02T00:00:00.000Z"),
      modelUnit: ModelUsageUnit.Tokens,
      expectedInternalModel: "gpt-3.5-turbo",
      expectedPromptTokens: 5,
      expectedCompletionTokens: 7,
      models: [
        {
          modelName: "gpt-3.5-turbo-new",
          matchPattern: "(?i)^(gpt-)(35|3.5)(-turbo)?$",
          startDate: new Date("2021-01-01T00:00:00.000Z"),
          unit: ModelUsageUnit.Tokens,
          tokenizerId: "openai",
        },
        {
          modelName: "gpt-3.5-turbo",
          matchPattern: "(?i)^(gpt-)(35|3.5)(-turbo)?$",
          startDate: new Date("2021-01-01T10:00:00.000Z"),
          unit: ModelUsageUnit.Tokens,
          tokenizerId: "openai",
          tokenizerModel: "gpt-3.5-turbo",
        },
      ],
    },
    {
      observationExternalModel: "ft:gpt-3.5-turbo-1106:my-org:custom_suffix:id",
      observationStartTime: new Date("2022-01-01T10:00:00.000Z"),
      modelUnit: ModelUsageUnit.Tokens,
      expectedInternalModel: "ft:gpt-3.5-turbo-1106",
      expectedPromptTokens: 0,
      expectedCompletionTokens: 0,
      models: [
        {
          modelName: "ft:gpt-3.5-turbo-1106",
          matchPattern: "(?i)^(ft:)(gpt-3.5-turbo-1106:)(.+)(:)(.*)(:)(.+)$",
          startDate: new Date("2022-01-01T00:00:00.000Z"),
          unit: ModelUsageUnit.Tokens,
          tokenizerId: "openai",
        },
      ],
    },
    {
      observationExternalModel: "ft:babbage-002:my-org#2:custom_suffix-2:id",
      observationStartTime: new Date("2022-01-01T10:00:00.000Z"),
      modelUnit: ModelUsageUnit.Tokens,
      expectedInternalModel: "ft:babbage-002",
      expectedPromptTokens: 0,
      expectedCompletionTokens: 0,
      models: [
        {
          modelName: "ft:babbage-002",
          matchPattern: "(?i)^(ft:)(babbage-002:)(.+)(:)(.*)(:)(.+)$",
          startDate: new Date("2022-01-01T00:00:00.000Z"),
          unit: ModelUsageUnit.Tokens,
          tokenizerId: "openai",
        },
      ],
    },
    {
      observationExternalModel: "GPT-4",
      observationStartTime: new Date("2021-01-01T00:00:00.000Z"),
      modelUnit: ModelUsageUnit.Tokens,
      expectedInternalModel: null,
      expectedPromptTokens: 0,
      expectedCompletionTokens: 0,
      models: [
        {
          modelName: "gpt-3.5-turbo",
          matchPattern: "(?i)^(gpt-)(35|3.5)(-turbo)?$",
          startDate: new Date("2021-01-01T00:00:00.000Z"),
          unit: ModelUsageUnit.Tokens,
          tokenizerId: "openai",
        },
      ],
    },
    {
      observationExternalModel: "GPT-3",
      observationStartTime: new Date("2021-01-01T00:00:00.000Z"),
      modelUnit: ModelUsageUnit.Characters,
      expectedInternalModel: null,
      expectedPromptTokens: 0,
      expectedCompletionTokens: 0,
      models: [
        {
          modelName: "gpt-3.5-turbo",
          matchPattern: "(?i)^(gpt-)(35|3.5)(-turbo)?$",
          startDate: new Date("2021-01-01T00:00:00.000Z"),
          unit: ModelUsageUnit.Tokens,
          tokenizerId: "openai",
        },
      ],
    },
  ].forEach((testConfig) => {
    it(`should match observations to internal models ${JSON.stringify(
      testConfig,
    )}`, async () => {
      const traceId = v4();
      const generationId = v4();

      await Promise.all(
        testConfig.models.map(async (model) =>
          prisma.model.create({
            data: {
              modelName: model.modelName,
              matchPattern: model.matchPattern,
              startDate: model.startDate,
              unit: model.unit,
              tokenizerId: model.tokenizerId,
              tokenizerConfig: {
                tokensPerMessage: 3,
                tokensPerName: 1,
                tokenizerModel:
                  "tokenizerModel" in model
                    ? model.tokenizerModel
                    : model.modelName,
              },
            },
          }),
        ),
      );

      const response = await makeAPICall("POST", "/api/public/ingestion", {
        metadata: {
          sdk_verion: "1.0.0",
          sdk_name: "python",
        },
        batch: [
          {
            id: v4(),
            type: "trace-create",
            timestamp: new Date().toISOString(),
            body: {
              id: traceId,
              name: "trace-name",
            },
          },
          {
            id: v4(),
            type: "observation-create",
            timestamp: new Date().toISOString(),
            body: {
              id: generationId,
              traceId: traceId,
              type: "GENERATION",
              name: "generation-name",
              startTime: testConfig.observationStartTime.toISOString(),
              model: testConfig.observationExternalModel,
              usage: {
                unit: testConfig.modelUnit,
              },
              input: "This is a great prompt",
              output: "This is a great gpt output",
            },
          },
        ],
      });

      expect(response.status).toBe(207);

      const dbGeneration = await prisma.observation.findUnique({
        where: {
          id: generationId,
        },
      });

      expect(dbGeneration?.id).toBe(generationId);
      expect(dbGeneration?.traceId).toBe(traceId);
      expect(dbGeneration?.name).toBe("generation-name");
      expect(dbGeneration?.startTime).toEqual(testConfig.observationStartTime);
      expect(dbGeneration?.model).toBe(testConfig.observationExternalModel);
      expect(dbGeneration?.promptTokens).toBe(testConfig.expectedPromptTokens);
      expect(dbGeneration?.completionTokens).toBe(
        testConfig.expectedCompletionTokens,
      );
      expect(dbGeneration?.internalModel).toBe(
        testConfig.expectedInternalModel,
      );
    });
  });

  it("should create and update all events", async () => {
    const traceId = v4();
    const generationId = v4();
    const spanId = v4();
    const eventId = v4();
    const scoreId = v4();

    const exception = `
    ERROR    langfuse:callback.py:677 'model_name'
    Traceback (most recent call last):
      File "/Users/maximiliandeichmann/development/github.com/langfuse/langfuse-python/langfuse/callback.py", line 674, in __on_llm_action
        model_name = kwargs["invocation_params"]["model_name"]
    KeyError: 'model_name'
    `;

    const response = await makeAPICall("POST", "/api/public/ingestion", {
      batch: [
        {
          id: v4(),
          type: "trace-create",
          timestamp: new Date().toISOString(),
          body: {
            id: traceId,
          },
        },
        {
          id: v4(),
          type: "span-create",
          timestamp: new Date().toISOString(),
          body: {
            id: spanId,
            traceId: traceId,
          },
        },
        {
          id: v4(),
          type: "span-update",
          timestamp: new Date().toISOString(),
          body: {
            id: spanId,
            traceId: traceId,
            name: "span-name",
          },
        },
        {
          id: v4(),
          type: "generation-create",
          timestamp: new Date().toISOString(),
          body: {
            id: generationId,
            traceId: traceId,
            parentObservationId: spanId,
            modelParameters: { someKey: ["user-1", "user-2"] },
          },
        },
        {
          id: v4(),
          type: "generation-update",
          timestamp: new Date().toISOString(),
          body: {
            id: generationId,
            name: "generation-name",
          },
        },
        {
          id: v4(),
          type: "event-create",
          timestamp: new Date().toISOString(),
          body: {
            id: eventId,
            traceId: traceId,
            name: "event-name",
            parentObservationId: generationId,
          },
        },
        {
          id: v4(),
          type: "score-create",
          timestamp: new Date().toISOString(),
          body: {
            id: scoreId,
            name: "score-name",
            traceId: traceId,
            value: 100.5,
            observationId: generationId,
          },
        },
        {
          id: v4(),
          type: "sdk-log",
          timestamp: new Date().toISOString(),
          body: {
            log: exception,
          },
        },
      ],
    });

    expect(response.status).toBe(207);

    const dbTrace = await prisma.trace.findMany({
      where: {
        id: traceId,
      },
    });

    expect(dbTrace.length).toBeGreaterThan(0);
    expect(dbTrace[0]?.projectId).toBe("7a88fb47-b4e2-43b8-a06c-a5ce950dc53a");

    const dbSpan = await prisma.observation.findUnique({
      where: {
        id: spanId,
      },
    });

    expect(dbSpan?.id).toBe(spanId);
    expect(dbSpan?.name).toBe("span-name");
    expect(dbSpan?.traceId).toBe(traceId);

    const dbGeneration = await prisma.observation.findUnique({
      where: {
        id: generationId,
      },
    });

    expect(dbGeneration?.id).toBe(generationId);
    expect(dbGeneration?.traceId).toBe(traceId);
    expect(dbGeneration?.name).toBe("generation-name");
    expect(dbGeneration?.parentObservationId).toBe(spanId);
    expect(dbGeneration?.modelParameters).toEqual({
      someKey: ["user-1", "user-2"],
    });

    const dbEvent = await prisma.observation.findUnique({
      where: {
        id: eventId,
      },
    });

    expect(dbEvent?.id).toBe(eventId);
    expect(dbEvent?.traceId).toBe(traceId);
    expect(dbEvent?.name).toBe("event-name");
    expect(dbEvent?.parentObservationId).toBe(generationId);

    const dbScore = await prisma.score.findUnique({
      where: {
        id: scoreId,
      },
    });

    expect(dbScore?.id).toBe(scoreId);
    expect(dbScore?.traceId).toBe(traceId);
    expect(dbScore?.observationId).toBe(generationId);
    expect(dbScore?.value).toBe(100.5);

    const logEvent = await prisma.events.findFirst({
      where: {
        data: {
          path: ["body", "log"],
          string_contains: "ERROR",
        },
      },
    });

    expect(logEvent).toBeDefined();
    expect(logEvent).not.toBeFalsy();
    expect(JSON.stringify(logEvent?.data)).toContain("KeyError: 'model_name'");
  });

  it("should upsert threats", async () => {
    const traceId = v4();

    const responseOne = await makeAPICall("POST", "/api/public/ingestion", {
      batch: [
        {
          id: v4(),
          type: "trace-create",
          timestamp: new Date().toISOString(),
          body: {
            id: traceId,
            name: "trace-name",
            userId: "user-1",
            metadata: { key: "value" },
            release: "1.0.0",
            version: "2.0.0",
            tags: ["tag-1", "tag-2", "tag-2"],
          },
        },
      ],
    });
    expect(responseOne.status).toBe(207);

    const responseTwo = await makeAPICall("POST", "/api/public/ingestion", {
      batch: [
        {
          id: v4(),
          type: "trace-create",
          timestamp: new Date().toISOString(),
          body: {
            id: traceId,
            name: "trace-name",
            userId: "user-2",
            tags: ["tag-1", "tag-4", "tag-3"],
          },
        },
      ],
    });

    expect(responseTwo.status).toBe(207);

    const dbTrace = await prisma.trace.findMany({
      where: {
        name: "trace-name",
      },
    });

    expect(dbTrace.length).toBeGreaterThan(0);
    expect(dbTrace[0]?.name).toBe("trace-name");
    expect(dbTrace[0]?.userId).toBe("user-2");
    expect(dbTrace[0]?.release).toBe("1.0.0");
    expect(dbTrace[0]?.externalId).toBeNull();
    expect(dbTrace[0]?.version).toBe("2.0.0");
    expect(dbTrace[0]?.projectId).toBe("7a88fb47-b4e2-43b8-a06c-a5ce950dc53a");
    expect(dbTrace[0]?.tags).toEqual(["tag-1", "tag-2", "tag-3", "tag-4"]);
    expect(dbTrace[0]?.tags.length).toBe(4);
  });

  it("should fail for wrong event formats", async () => {
    const traceId = v4();
    const scoreId = v4();

    const responseOne = await makeAPICall("POST", "/api/public/ingestion", {
      batch: [
        {
          id: "invalid-event",
        },
        {
          id: v4(),
          type: "trace-create",
          timestamp: new Date().toISOString(),
          body: {
            id: traceId,
            name: "trace-name",
            userId: "user-1",
            metadata: { key: "value" },
            release: "1.0.0",
            version: "2.0.0",
          },
        },
        {
          id: v4(),
          type: "score-create",
          timestamp: new Date().toISOString(),
          body: {
            id: scoreId,
            name: "",
            traceId: traceId,
          },
        },
      ],
    });
    expect(responseOne.status).toBe(207);

    expect("errors" in responseOne.body).toBe(true);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    expect(responseOne.body.errors.length).toBe(2);
    expect("successes" in responseOne.body).toBe(true);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    expect(responseOne.body.successes.length).toBe(1);

    const dbTrace = await prisma.trace.findMany({
      where: {
        name: "trace-name",
      },
    });

    expect(dbTrace.length).toBe(1);
  });

  it("should fail for resource not found", async () => {
    const traceId = v4();

    const responseOne = await makeAPICall("POST", "/api/public/ingestion", {
      batch: [
        {
          id: v4(),
          type: "trace-create",
          timestamp: new Date().toISOString(),
          body: {
            id: traceId,
            name: "trace-name",
            userId: "user-1",
            metadata: { key: "value" },
            release: "1.0.0",
            version: "2.0.0",
          },
        },
        {
          id: v4(),
          type: "observation-update",
          timestamp: new Date().toISOString(),
          body: {
            id: "some-random-id",
            type: "GENERATION",
            output: { key: "this is a great gpt output" },
          },
        },
      ],
    });

    expect(responseOne.status).toBe(207);

    expect("errors" in responseOne.body).toBe(true);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    expect(responseOne.body.errors.length).toBe(1);
    expect("successes" in responseOne.body).toBe(true);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    expect(responseOne.body.successes.length).toBe(1);

    const dbTrace = await prisma.trace.findMany({
      where: {
        name: "trace-name",
      },
    });

    expect(dbTrace.length).toBe(1);
  });

  it("should update all token counts if update does not contain model name", async () => {
    const traceId = v4();
    const generationId = v4();

    await prisma.model.create({
      data: {
        modelName: "gpt-3.5",
        matchPattern: "(?i)^(gpt-)(35|3.5)(-turbo)?$",
        startDate: new Date("2021-01-01T00:00:00.000Z"),
        unit: ModelUsageUnit.Tokens,
        tokenizerId: "openai",
        tokenizerConfig: {
          tokensPerMessage: 3,
          tokensPerName: 1,
          tokenizerModel: "gpt-3.5-turbo",
        },
      },
    });

    const responseOne = await makeAPICall("POST", "/api/public/ingestion", {
      batch: [
        {
          id: v4(),
          type: "trace-create",
          timestamp: new Date().toISOString(),
          body: {
            id: traceId,
            name: "trace-name",
            userId: "user-1",
          },
        },
        {
          id: v4(),
          type: "observation-create",
          timestamp: new Date().toISOString(),
          body: {
            id: generationId,
            traceId: traceId,
            type: "GENERATION",
            name: "generation-name",
            input: { key: "value" },
            model: "gpt-3.5",
          },
        },
        {
          id: v4(),
          type: "observation-update",
          timestamp: new Date().toISOString(),
          body: {
            id: generationId,
            type: "GENERATION",
            output: { key: "this is a great gpt output" },
          },
        },
      ],
    });
    expect(responseOne.status).toBe(207);

    const dbTrace = await prisma.trace.findMany({
      where: {
        name: "trace-name",
      },
    });

    expect(dbTrace.length).toEqual(1);

    const observation = await prisma.observation.findUnique({
      where: {
        id: generationId,
      },
    });

    expect(observation?.output).toEqual({
      key: "this is a great gpt output",
    });
    expect(observation?.input).toEqual({ key: "value" });
    expect(observation?.model).toEqual("gpt-3.5");
    expect(observation?.output).toEqual({ key: "this is a great gpt output" });
    expect(observation?.promptTokens).toEqual(5);
    expect(observation?.completionTokens).toEqual(11);
  });

  it("should update all token counts if update does not contain model name and events come in wrong order", async () => {
    const traceId = v4();
    const generationId = v4();

    await prisma.model.create({
      data: {
        modelName: "gpt-3.5",
        matchPattern: "(?i)^(gpt-)(35|3.5)(-turbo)?$",
        startDate: new Date("2021-01-01T00:00:00.000Z"),
        unit: ModelUsageUnit.Tokens,
        tokenizerId: "openai",
        tokenizerConfig: {
          tokensPerMessage: 3,
          tokensPerName: 1,
          tokenizerModel: "gpt-3.5-turbo",
        },
      },
    });

    const responseOne = await makeAPICall("POST", "/api/public/ingestion", {
      batch: [
        {
          id: v4(),
          type: "trace-create",
          timestamp: new Date().toISOString(),
          body: {
            id: traceId,
            name: "trace-name",
            userId: "user-1",
          },
        },
        {
          id: v4(),
          type: "observation-update",
          timestamp: new Date().toISOString(),
          body: {
            id: generationId,
            type: "GENERATION",
            output: { key: "this is a great gpt output" },
          },
        },
        {
          id: v4(),
          type: "observation-create",
          timestamp: new Date().toISOString(),
          body: {
            id: generationId,
            traceId: traceId,
            type: "GENERATION",
            name: "generation-name",
            input: { key: "value" },
            model: "gpt-3.5",
          },
        },
      ],
    });
    expect(responseOne.status).toBe(207);

    const dbTrace = await prisma.trace.findMany({
      where: {
        name: "trace-name",
      },
    });

    expect(dbTrace.length).toEqual(1);

    const observation = await prisma.observation.findUnique({
      where: {
        id: generationId,
      },
    });

    expect(observation?.output).toEqual({
      key: "this is a great gpt output",
    });
    expect(observation?.input).toEqual({ key: "value" });
    expect(observation?.model).toEqual("gpt-3.5");
    expect(observation?.output).toEqual({ key: "this is a great gpt output" });
    expect(observation?.promptTokens).toEqual(5);
    expect(observation?.completionTokens).toEqual(11);
  });

  it("null does not override set values", async () => {
    const traceId = v4();

    const responseOne = await makeAPICall("POST", "/api/public/ingestion", {
      batch: [
        {
          id: v4(),
          type: "trace-create",
          timestamp: new Date().toISOString(),
          body: {
            id: traceId,
            name: "trace-name",
            userId: "user-1",
            metadata: { key: "value" },
            release: "1.0.0",
            version: "2.0.0",
          },
        },
        {
          id: v4(),
          type: "trace-create",
          timestamp: new Date().toISOString(),
          body: {
            id: traceId,
            name: "trace-name",
            userId: "user-1",
            metadata: { key: "value" },
            release: null,
            version: null,
          },
        },
      ],
    });
    expect(responseOne.status).toBe(207);

    const dbTrace = await prisma.trace.findMany({
      where: {
        name: "trace-name",
      },
    });

    expect(dbTrace.length).toEqual(1);
    expect(dbTrace[0]?.release).toBe("1.0.0");
    expect(dbTrace[0]?.version).toBe("2.0.0");
  });

  it("should not override a trace from a different project", async () => {
    const traceId = v4();
    const newProjectId = v4();

    await prisma.project.create({
      data: {
        id: newProjectId,
        name: "another-project",
      },
    });

    await prisma.trace.create({
      data: {
        id: traceId,
        project: { connect: { id: newProjectId } },
      },
    });

    const responseOne = await makeAPICall("POST", "/api/public/ingestion", {
      batch: [
        {
          id: v4(),
          type: "trace-create",
          timestamp: new Date().toISOString(),
          body: {
            id: traceId,
            name: "trace-name",
            userId: "user-1",
            metadata: { key: "value" },
            release: "1.0.0",
            version: "2.0.0",
          },
        },
      ],
    });
    expect(responseOne.status).toBe(207);

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
    const errors = responseOne.body.errors;

    expect(errors).toBeDefined();
    console.log(errors);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    expect(errors.length).toBe(1);

    const dbTrace = await prisma.trace.findMany({
      where: {
        id: traceId,
      },
    });

    expect(dbTrace.length).toEqual(1);
    expect(dbTrace[0]?.name).toBeNull();
    expect(dbTrace[0]?.release).toBeNull();
    expect(dbTrace[0]?.metadata).toBeNull();
    expect(dbTrace[0]?.version).toBeNull();
  });

  [
    {
      inputs: [{ a: "a" }, { b: "b" }],
      output: { a: "a", b: "b" },
    },
    {
      inputs: [[{ a: "a" }], [{ b: "b" }]],
      output: [{ a: "a", b: "b" }],
    },
    {
      inputs: [
        {
          a: {
            "1": 1,
          },
        },
        {
          b: "b",
          a: {
            "2": 2,
          },
        },
      ],
      output: { a: { "1": 1, "2": 2 }, b: "b" },
    },
    {
      inputs: [{ a: "a" }, undefined],
      output: { a: "a" },
    },
    {
      inputs: [undefined, { b: "b" }],
      output: { b: "b" },
    },
  ].forEach(({ inputs, output }) => {
    it(`merges metadata ${JSON.stringify(inputs)}, ${JSON.stringify(
      output,
    )}`, async () => {
      const traceId = v4();
      const generationId = v4();

      const responseOne = await makeAPICall("POST", "/api/public/ingestion", {
        batch: [
          {
            id: v4(),
            type: "trace-create",
            timestamp: new Date().toISOString(),
            body: {
              id: traceId,
              name: "trace-name",
              userId: "user-1",
              metadata: inputs[0],
            },
          },
          {
            id: v4(),
            type: "trace-create",
            timestamp: new Date().toISOString(),
            body: {
              id: traceId,
              name: "trace-name",
              metadata: inputs[1],
            },
          },
          {
            id: v4(),
            type: "observation-create",
            timestamp: new Date().toISOString(),
            body: {
              id: generationId,
              traceId: traceId,
              type: "GENERATION",
              name: "generation-name",
              metadata: inputs[0],
            },
          },
          {
            id: v4(),
            type: "observation-update",
            timestamp: new Date().toISOString(),
            body: {
              id: generationId,
              traceId: traceId,
              type: "GENERATION",
              metadata: inputs[1],
            },
          },
        ],
      });
      expect(responseOne.status).toBe(207);

      const dbTrace = await prisma.trace.findMany({
        where: {
          name: "trace-name",
        },
      });

      expect(dbTrace.length).toEqual(1);
      expect(dbTrace[0]?.metadata).toEqual(output);

      const dbGeneration = await prisma.observation.findMany({
        where: {
          name: "generation-name",
        },
      });

      expect(dbGeneration.length).toEqual(1);
      expect(dbGeneration[0]?.metadata).toEqual(output);
    });
  });

  it("additional fields do not fail the API to support users sending traceidtype Langfuse", async () => {
    const traceId = v4();
    const generationId = v4();

    const responseOne = await makeAPICall("POST", "/api/public/ingestion", {
      batch: [
        {
          id: v4(),
          type: "trace-create",
          timestamp: new Date().toISOString(),
          body: {
            id: traceId,
            name: "trace-name",
          },
        },
        {
          id: v4(),
          type: "observation-create",
          timestamp: new Date().toISOString(),
          body: {
            id: generationId,
            traceId: traceId,
            type: "GENERATION",
            name: "generation-name",
            traceIdType: "LANGFUSE",
          },
        },
      ],
    });
    expect(responseOne.status).toBe(207);

    const dbTrace = await prisma.trace.findMany({
      where: {
        id: traceId,
      },
    });

    expect(dbTrace.length).toEqual(1);

    const dbGeneration = await prisma.observation.findUnique({
      where: {
        id: generationId,
      },
    });

    expect(dbGeneration).toBeTruthy();
  });

  it("filters out NULL characters", async () => {
    const traceId = v4();
    const generationId = v4();

    const responseOne = await makeAPICall("POST", "/api/public/ingestion", {
      batch: [
        {
          id: v4(),
          type: "trace-create",
          timestamp: new Date().toISOString(),
          body: {
            id: traceId,
            name: "trace-name",
          },
        },
        {
          id: v4(),
          type: "observation-create",
          timestamp: new Date().toISOString(),
          body: {
            id: generationId,
            traceId: traceId,
            type: "GENERATION",
            name: "generation-name",
            traceIdType: "LANGFUSE",
            input: {
              key: "IB\nibo.org Change site\nIB Home   /   . . .   /   News   /   News about the IB   /   Why ChatGPT is an opportunity for schools  IB Home   /   News   /   News about the IB   /   Why ChatGPT is an opportunity for schools  Why ChatGPT is an opportunity for  schools  Published:   06 March 2023   Last updated:   06 June 2023  Date published:   28 February 2023  Dr Matthew Glanville, Head of Assessment Principles and Practice  Source:   Why ChatGPT is an opportunity for schools | The Times  Those of us who work in the schools or exam sector should not be terri \u0000 ed by ChatGPT and  the rise of AI software – we should be excited. We should embrace it as an extraordinary  opportunity.  Contrary to some stark warnings, it is not the end of exams, nor even a huge threat to  coursework, but it does bring into very sharp focus the impact that arti \u0000 ",
            },
            output: {
              key: "제점이 있었죠. 그중 하나는 일제가 한국의 신용체계를 망가뜨린 채 한국을 떠났다는 겁니다. 해방전 일제는 조선의 신용체계를 거의 독점적으로 소유한 상황이었습니다. 1945년 6월 기준 일제는 조선의 본점을 둔 전체은행 5개의 불입자본 총액의 89.7%를",
            },
          },
        },
      ],
    });
    expect(responseOne.status).toBe(207);

    const dbTrace = await prisma.trace.findMany({
      where: {
        id: traceId,
      },
    });

    expect(dbTrace.length).toEqual(1);

    const dbGeneration = await prisma.observation.findUnique({
      where: {
        id: generationId,
      },
    });
    expect(dbGeneration?.input).toStrictEqual({
      key: `IB
ibo.org Change site
IB Home   /   . . .   /   News   /   News about the IB   /   Why ChatGPT is an opportunity for schools  IB Home   /   News   /   News about the IB   /   Why ChatGPT is an opportunity for schools  Why ChatGPT is an opportunity for  schools  Published:   06 March 2023   Last updated:   06 June 2023  Date published:   28 February 2023  Dr Matthew Glanville, Head of Assessment Principles and Practice  Source:   Why ChatGPT is an opportunity for schools | The Times  Those of us who work in the schools or exam sector should not be terri  ed by ChatGPT and  the rise of AI software – we should be excited. We should embrace it as an extraordinary  opportunity.  Contrary to some stark warnings, it is not the end of exams, nor even a huge threat to  coursework, but it does bring into very sharp focus the impact that arti  `,
    });
    expect(dbGeneration?.output).toStrictEqual({
      key: "제점이 있었죠. 그중 하나는 일제가 한국의 신용체계를 망가뜨린 채 한국을 떠났다는 겁니다. 해방전 일제는 조선의 신용체계를 거의 독점적으로 소유한 상황이었습니다. 1945년 6월 기준 일제는 조선의 본점을 둔 전체은행 5개의 불입자본 총액의 89.7%를",
    });

    expect(dbGeneration).toBeTruthy();
  });

  [
    { input: "A\u0000hallo", expected: "Ahallo" },
    { input: ["A\u0000hallo"], expected: ["Ahallo"] },
    { input: { obj: ["A\u0000hallo"] }, expected: { obj: ["Ahallo"] } },
  ].forEach(({ input, expected }) => {
    it(`cleans events with null values ${JSON.stringify(
      input,
    )} ${JSON.stringify(expected)}`, () => {
      const cleanedEvent = cleanEvent(input);
      expect(cleanedEvent).toStrictEqual(expected);
    });
  });

  it("should allow score ingestion via Basic auth", async () => {
    const projectId = "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a";
    const traceId = "trace_id";

    const scoreId = "score_id";
    const scoreEventId = "score_event_id";
    const scoreName = "score-name";
    const scoreValue = 100.5;

    // Seed db with a trace to be scored
    await prisma.trace.create({
      data: {
        id: traceId,
        name: "trace-name",
        project: { connect: { id: projectId } },
      },
    });

    const response = await makeAPICall("POST", "/api/public/ingestion", {
      batch: [
        {
          id: scoreEventId,
          type: "score-create",
          timestamp: new Date().toISOString(),
          body: {
            id: scoreId,
            name: scoreName,
            value: scoreValue,
            traceId: traceId,
          },
        },
      ],
    });

    expect(response.status).toBe(207);
    expect(response.body.successes.length).toBe(1);
    expect(response.body.successes[0]?.id).toBe(scoreEventId);
    expect(response.body.errors.length).toBe(0);

    const dbScore = await prisma.score.findUnique({
      where: {
        id: scoreId,
      },
    });

    expect(dbScore?.id).toBe(scoreId);
    expect(dbScore?.traceId).toBe(traceId);
    expect(dbScore?.name).toBe(scoreName);
    expect(dbScore?.value).toBe(scoreValue);
  });

  it("should allow score ingestion via Bearer auth", async () => {
    const projectId = "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a";
    const traceId = "trace_id";
    const bearerAuth = "Bearer pk-lf-1234567890";

    const scoreId = "score_id";
    const scoreEventId = "score_event_id";
    const scoreName = "score-name";
    const scoreValue = 100.5;

    // Seed db with a trace to be scored
    await prisma.trace.create({
      data: {
        id: traceId,
        name: "trace-name",
        project: { connect: { id: projectId } },
      },
    });

    const response = await makeAPICall(
      "POST",
      "/api/public/ingestion",
      {
        batch: [
          {
            id: scoreEventId,
            type: "score-create",
            timestamp: new Date().toISOString(),
            body: {
              id: scoreId,
              name: scoreName,
              value: scoreValue,
              traceId: traceId,
            },
          },
        ],
      },
      bearerAuth,
    );

    expect(response.status).toBe(207);
    expect(response.body.successes.length).toEqual(1);
    expect(response.body.successes[0]?.id).toBe(scoreEventId);
    expect(response.body.errors.length).toBe(0);

    const dbScore = await prisma.score.findUnique({
      where: {
        id: scoreId,
      },
    });

    expect(dbScore?.id).toBe(scoreId);
    expect(dbScore?.traceId).toBe(traceId);
    expect(dbScore?.name).toBe(scoreName);
    expect(dbScore?.value).toBe(scoreValue);
  });

  it("should throw an Auth error on Bearer Auth for all events that are NOT 'score-create'", async () => {
    const projectId = "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a";
    const traceId = "trace_id";
    const bearerAuth = "Bearer pk-lf-1234567890";

    const scoreId = "score_id";
    const scoreEventId = "score_event_id";
    const scoreName = "score-name";
    const scoreValue = 100.5;

    const generationId = v4();
    const spanId = v4();

    const anotherTraceId = "another_trace_id";

    // Seed db with a trace to be scored
    await prisma.trace.create({
      data: {
        id: traceId,
        name: "trace-name",
        project: { connect: { id: projectId } },
      },
    });

    const response = await makeAPICall(
      "POST",
      "/api/public/ingestion",
      {
        metadata: {
          sdk_verion: "1.0.0",
          sdk_name: "python",
        },
        batch: [
          {
            id: v4(),
            type: "trace-create",
            timestamp: new Date().toISOString(),
            body: {
              id: anotherTraceId,
              name: "trace-name",
              userId: "user-1",
              metadata: { key: "value" },
              release: "1.0.0",
              version: "2.0.0",
              tags: ["tag-1", "tag-2"],
            },
          },
          {
            id: v4(),
            type: "observation-create",
            timestamp: new Date().toISOString(),
            body: {
              id: generationId,
              traceId: traceId,
              type: "GENERATION",
              name: "generation-name",
              startTime: "2021-01-01T00:00:00.000Z",
              endTime: "2021-01-01T00:00:00.000Z",
              modelParameters: { key: "value" },
              input: { key: "value" },
              metadata: { key: "value" },
              version: "2.0.0",
            },
          },
          {
            id: v4(),
            type: "observation-update",
            timestamp: new Date().toISOString(),
            body: {
              id: generationId,
              type: "GENERATION",
              output: { key: "this is a great gpt output" },
            },
          },
          {
            id: v4(),
            type: "observation-create",
            timestamp: new Date().toISOString(),
            body: {
              id: spanId,
              traceId: traceId,
              type: "SPAN",
              name: "span-name",
              startTime: "2021-01-01T00:00:00.000Z",
              endTime: "2021-01-01T00:00:00.000Z",
              input: { input: "value" },
              metadata: { meta: "value" },
              version: "2.0.0",
            },
          },
          {
            id: scoreEventId,
            type: "score-create",
            timestamp: new Date().toISOString(),
            body: {
              id: scoreId,
              name: "score-name",
              value: 100.5,
              traceId: traceId,
            },
          },
        ],
      },
      bearerAuth,
    );

    expect(response.status).toBe(207);
    expect(response.body.successes.length).toEqual(1);
    expect(response.body.successes[0]?.id).toEqual(scoreEventId);

    expect(response.body.errors.length).toEqual(4);

    const dbScore = await prisma.score.findUnique({
      where: {
        id: scoreId,
      },
    });

    expect(await prisma.trace.count()).toBe(1);
    expect(await prisma.trace.count({ where: { id: traceId } })).toBe(1);
    expect(await prisma.observation.count()).toBe(0);

    expect(dbScore?.id).toBe(scoreId);
    expect(dbScore?.traceId).toBe(traceId);
    expect(dbScore?.name).toBe(scoreName);
    expect(dbScore?.value).toBe(scoreValue);
  });

  it("should error on wrong input", async () => {
    const traceId = "trace_id";
    const bearerAuth = "Bearer pk-lf-1234567890";

    const scoreId = "score_id";
    const scoreEventId = "score_event_id";
    const scoreName = "score-name";
    const scoreValue = 100.5;

    const response = await makeAPICall(
      "POST",
      "/api/public/ingestion",
      {
        // sending data instead of batch
        data: [
          {
            id: scoreEventId,
            type: "score-create",
            timestamp: new Date().toISOString(),
            body: {
              id: scoreId,
              name: scoreName,
              value: scoreValue,
              traceId: traceId,
            },
          },
        ],
      },
      bearerAuth,
    );

    expect(response.status).toBe(400);
    expect(await prisma.trace.count()).toBe(0);

    const dbScore = await prisma.score.findUnique({
      where: {
        id: scoreId,
      },
    });

    expect(dbScore).toBeNull();
  });
});
