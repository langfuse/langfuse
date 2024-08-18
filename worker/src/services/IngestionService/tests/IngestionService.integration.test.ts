import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { prisma } from "@langfuse/shared/src/db";
import {
  clickhouseClient,
  ObservationEvent,
  observationRecordReadSchema,
  ObservationRecordReadType,
  redis,
  ScoreEventType,
  scoreRecordReadSchema,
  ScoreRecordReadType,
  TraceEventType,
  traceRecordReadSchema,
  TraceRecordReadType,
} from "@langfuse/shared/src/server";
import { pruneDatabase } from "../../../__tests__/utils";

import { ClickhouseWriter, TableName } from "../../ClickhouseWriter";
import { IngestionService } from "../../IngestionService";
import { ModelUsageUnit } from "@langfuse/shared";

const projectId = "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a";

describe("Ingestion end-to-end tests", () => {
  let ingestionService: IngestionService;
  let clickhouseWriter: ClickhouseWriter;

  const mockIngestionFlushQueue = vi.fn() as any;

  beforeEach(async () => {
    if (!redis) throw new Error("Redis not initialized");
    await pruneDatabase();

    clickhouseWriter = ClickhouseWriter.getInstance();

    ingestionService = new IngestionService(
      redis,
      prisma,
      clickhouseWriter,
      clickhouseClient
    );
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    vi.useRealTimers();

    // Reset singleton instance
    await clickhouseWriter.shutdown();

    ClickhouseWriter.instance = null;
  });

  it("should correctly ingest a trace", async () => {
    const traceId = randomUUID();
    const traceName = "test-trace";
    const timestamp = new Date().toISOString();

    const eventList: TraceEventType[] = [
      {
        type: "trace-create",
        id: traceId,
        timestamp,
        body: {
          name: traceName,
          timestamp,
        },
      },
    ];

    await ingestionService.processTraceEventList({
      projectId,
      entityId: traceId,
      traceEventList: eventList,
    });
    await clickhouseWriter.flushAll(true);

    const trace = await getClickhouseRecord(TableName.Traces, traceId);

    const expected = {
      id: traceId,
      name: traceName,
      user_id: null,
      metadata: {},
      release: null,
      version: null,
      project_id: projectId,
      public: false,
      bookmarked: false,
      tags: [],
      input: null,
      output: null,
      session_id: null,
      timestamp,
    };

    expect(trace).toMatchObject(expected);
  });

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
      expectedPromptTokens: null,
      expectedCompletionTokens: null,
      expectedTotalTokens: 100,
    },
    {
      usage: {
        total: 100,
        unit: ModelUsageUnit.Milliseconds,
      },
      expectedUnit: ModelUsageUnit.Milliseconds,
      expectedPromptTokens: null,
      expectedCompletionTokens: null,
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
        input: 1,
        output: 2,
        unit: ModelUsageUnit.Requests,
      },
      expectedUnit: ModelUsageUnit.Requests,
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
      expectedPromptTokens: null,
      expectedCompletionTokens: null,
      expectedTotalTokens: 100,
    },
    {
      usage: undefined,
      expectedPromptTokens: null,
      expectedCompletionTokens: null,
      expectedTotalTokens: null,
      expectedUnit: null,
    },
    {
      usage: null,
      expectedPromptTokens: null,
      expectedCompletionTokens: null,
      expectedTotalTokens: null,
      expectedUnit: null,
    },
    {
      usage: {},
      expectedPromptTokens: null,
      expectedCompletionTokens: null,
      expectedTotalTokens: null,
      expectedUnit: null,
    },
  ].forEach((testConfig) => {
    it(`should create trace, generation and score without matching models ${JSON.stringify(
      testConfig,
      null,
      2
    )}`, async () => {
      const traceId = randomUUID();
      const generationId = randomUUID();
      const spanId = randomUUID();
      const scoreId = randomUUID();

      const traceEventList: TraceEventType[] = [
        {
          id: randomUUID(),
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
      ];

      const generationEventList: ObservationEvent[] = [
        {
          id: randomUUID(),
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
          id: randomUUID(),
          type: "observation-update",
          timestamp: new Date().toISOString(),
          body: {
            id: generationId,
            type: "GENERATION",
            output: { key: "this is a great gpt output" },
            usage: testConfig.usage,
          },
        },
      ];

      const spanEventList: ObservationEvent[] = [
        {
          id: randomUUID(),
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
      ];

      const scoreEventList: ScoreEventType[] = [
        {
          id: randomUUID(),
          type: "score-create",
          timestamp: new Date().toISOString(),
          body: {
            id: scoreId,
            dataType: "NUMERIC",
            name: "score-name",
            value: 100.5,
            traceId: traceId,
          },
        },
      ];

      await Promise.all([
        ingestionService.processTraceEventList({
          projectId,
          entityId: traceId,
          traceEventList,
        }),
        ingestionService.processObservationEventList({
          projectId,
          entityId: spanId,
          observationEventList: spanEventList,
        }),
        ingestionService.processObservationEventList({
          projectId,
          entityId: generationId,
          observationEventList: generationEventList,
        }),
        ingestionService.processScoreEventList({
          projectId,
          entityId: scoreId,
          scoreEventList,
        }),
      ]);

      await clickhouseWriter.flushAll(true);

      const trace = await getClickhouseRecord(TableName.Traces, traceId);

      expect(trace.name).toBe("trace-name");
      expect(trace.release).toBe("1.0.0");
      expect(trace.version).toBe("2.0.0");
      expect(trace.project_id).toBe("7a88fb47-b4e2-43b8-a06c-a5ce950dc53a");
      expect(trace.tags).toEqual(["tag-1", "tag-2"]);

      const generation = await getClickhouseRecord(
        TableName.Observations,
        generationId
      );

      expect(generation.id).toBe(generationId);
      expect(generation.trace_id).toBe(traceId);
      expect(generation.name).toBe("generation-name");
      expect(generation.start_time).toEqual("2021-01-01T00:00:00.000Z");
      expect(generation.end_time).toEqual("2021-01-01T00:00:00.000Z");
      expect(generation.provided_model_name).toBeNull();
      expect(generation.model_parameters).toEqual(
        JSON.stringify({
          key: "value",
        })
      );
      expect(generation.input).toEqual(JSON.stringify({ key: "value" }));
      expect(parseMetadata(generation.metadata)).toEqual({ key: "value" });
      expect(generation.version).toBe("2.0.0");
      expect(generation.internal_model_id).toBeNull();
      expect(generation.input_usage_units).toEqual(
        testConfig.expectedPromptTokens
      );
      expect(generation.output_usage_units).toEqual(
        testConfig.expectedCompletionTokens
      );
      expect(generation.total_usage_units).toEqual(
        testConfig.expectedTotalTokens
      );
      expect(generation.unit).toEqual(testConfig.expectedUnit);
      expect(generation.output).toEqual(
        JSON.stringify({
          key: "this is a great gpt output",
        })
      );

      const span = await getClickhouseRecord(TableName.Observations, spanId);

      expect(span.id).toBe(spanId);
      expect(span.name).toBe("span-name");
      expect(span.start_time).toEqual("2021-01-01T00:00:00.000Z");
      expect(span.end_time).toEqual("2021-01-01T00:00:00.000Z");
      expect(span.input).toEqual(JSON.stringify({ input: "value" }));
      expect(parseMetadata(span.metadata)).toEqual({ meta: "value" });
      expect(span.version).toBe("2.0.0");

      const score = await getClickhouseRecord(TableName.Scores, scoreId);

      expect(score.id).toBe(scoreId);
      expect(score.trace_id).toBe(traceId);
      expect(score.name).toBe("score-name");
      expect(score.value).toBe(100.5);
      expect(score.observation_id).toBeNull();
      expect(score.project_id).toBe("7a88fb47-b4e2-43b8-a06c-a5ce950dc53a");
    });
  });

  [
    {
      observationExternalModel: "gpt-3.5",
      observationStartTime: new Date("2021-01-01T00:00:00.000Z"),
      modelUnit: ModelUsageUnit.Tokens,
      expectedInternalModelId: "custom-model-id",
      expectedPromptTokens: 5,
      expectedCompletionTokens: 7,
      models: [
        {
          id: "custom-model-id",
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
      expectedInternalModelId: "custom-model-id",
      expectedPromptTokens: 5,
      expectedCompletionTokens: 7,
      models: [
        {
          id: "custom-model-id",
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
      expectedInternalModelId: "custom-model-id",
      expectedPromptTokens: 5,
      expectedCompletionTokens: 7,
      models: [
        {
          id: "custom-model-id",
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
      expectedInternalModelId: "custom-model-id-2",
      expectedPromptTokens: 5,
      expectedCompletionTokens: 7,
      models: [
        {
          id: "custom-model-id-1",
          modelName: "gpt-3.5-turbo",
          matchPattern: "(?i)^(gpt-)(35|3.5)(-turbo)?$",
          startDate: new Date("2021-01-01T00:00:00.000Z"),
          unit: ModelUsageUnit.Tokens,
          tokenizerId: "openai",
        },
        {
          id: "custom-model-id-2",
          modelName: "gpt-3.5-turbo-new",
          matchPattern: "(?i)^(gpt-)(35|3.5)(-turbo)?$",
          startDate: new Date("2021-01-01T10:00:00.000Z"),
          unit: ModelUsageUnit.Tokens,
          tokenizerId: "openai",
          tokenizerModel: "gpt-3.5-turbo",
        },
      ],
    },
    {
      observationExternalModel: "GPT-3.5",
      observationStartTime: new Date("2021-01-02T00:00:00.000Z"),
      modelUnit: ModelUsageUnit.Tokens,
      expectedInternalModelId: "custom-model-id-2",
      expectedPromptTokens: 5,
      expectedCompletionTokens: 7,
      models: [
        {
          id: "custom-model-id-1",
          modelName: "gpt-3.5-turbo-new",
          matchPattern: "(?i)^(gpt-)(35|3.5)(-turbo)?$",
          startDate: new Date("2021-01-01T00:00:00.000Z"),
          unit: ModelUsageUnit.Tokens,
          tokenizerId: "openai",
        },
        {
          id: "custom-model-id-2",
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
      expectedInternalModelId: "custom-model-id-1",
      expectedPromptTokens: null,
      expectedCompletionTokens: null,
      models: [
        {
          id: "custom-model-id-1",
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
      expectedInternalModelId: "custom-model-id-1",
      expectedPromptTokens: null,
      expectedCompletionTokens: null,
      models: [
        {
          id: "custom-model-id-1",
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
      expectedInternalModelId: null,
      expectedPromptTokens: null,
      expectedCompletionTokens: null,
      models: [
        {
          id: "custom-model-id-1",
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
      expectedInternalModelId: null,
      expectedPromptTokens: null,
      expectedCompletionTokens: null,
      models: [
        {
          id: "custom-model-id-1",
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
      null,
      2
    )}`, async () => {
      const traceId = randomUUID();
      const generationId = randomUUID();

      await Promise.all(
        testConfig.models.map(async (model) =>
          prisma.model.create({
            data: {
              id: model.id,
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
          })
        )
      );

      const traceEventList: TraceEventType[] = [
        {
          id: randomUUID(),
          type: "trace-create",
          timestamp: new Date().toISOString(),
          body: {
            id: traceId,
            name: "trace-name",
          },
        },
      ];
      const generationEventList: ObservationEvent[] = [
        {
          id: randomUUID(),
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
      ];

      await Promise.all([
        ingestionService.processTraceEventList({
          projectId,
          entityId: traceId,
          traceEventList,
        }),
        ingestionService.processObservationEventList({
          projectId,
          entityId: generationId,
          observationEventList: generationEventList,
        }),
      ]);
      await clickhouseWriter.flushAll(true);

      const generation = await getClickhouseRecord(
        TableName.Observations,
        generationId
      );

      expect(generation.id).toBe(generationId);
      expect(generation.trace_id).toBe(traceId);
      expect(generation.name).toBe("generation-name");
      expect(generation.start_time).toEqual(
        testConfig.observationStartTime.toISOString()
      );
      expect(generation.provided_model_name).toBe(
        testConfig.observationExternalModel
      );
      // expect(generation.input_usage_units).toBe(
      //   testConfig.expectedPromptTokens
      // );
      expect(generation.output_usage_units).toBe(
        testConfig.expectedCompletionTokens
      );
      expect(generation.internal_model_id).toBe(
        testConfig.expectedInternalModelId
      );
    });
  });

  it("should create and update all events", async () => {
    const traceId = randomUUID();
    const generationId = randomUUID();
    const spanId = randomUUID();
    const eventId = randomUUID();
    const scoreId = randomUUID();

    const traceEventList: TraceEventType[] = [
      {
        id: randomUUID(),
        type: "trace-create",
        timestamp: new Date().toISOString(),
        body: {
          id: traceId,
        },
      },
    ];

    const spanEventList: ObservationEvent[] = [
      {
        id: randomUUID(),
        type: "span-create",
        timestamp: new Date().toISOString(),
        body: {
          id: spanId,
          traceId: traceId,
        },
      },
      {
        id: randomUUID(),
        type: "span-update",
        timestamp: new Date().toISOString(),
        body: {
          id: spanId,
          traceId: traceId,
          name: "span-name",
        },
      },
    ];

    const generationEventList: ObservationEvent[] = [
      {
        id: randomUUID(),
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
        id: randomUUID(),
        type: "generation-update",
        timestamp: new Date().toISOString(),
        body: {
          id: generationId,
          name: "generation-name",
        },
      },
    ];

    const eventEventList: ObservationEvent[] = [
      {
        id: randomUUID(),
        type: "event-create",
        timestamp: new Date().toISOString(),
        body: {
          id: eventId,
          traceId: traceId,
          name: "event-name",
          parentObservationId: generationId,
        },
      },
    ];

    const scoreEventList: ScoreEventType[] = [
      {
        id: randomUUID(),
        type: "score-create",
        timestamp: new Date().toISOString(),
        body: {
          id: scoreId,
          dataType: "NUMERIC",
          name: "score-name",
          traceId: traceId,
          value: 100.5,
          observationId: generationId,
        },
      },
    ];

    await Promise.all([
      ingestionService.processTraceEventList({
        projectId,
        entityId: traceId,
        traceEventList,
      }),
      ingestionService.processObservationEventList({
        projectId,
        entityId: spanId,
        observationEventList: spanEventList,
      }),
      ingestionService.processObservationEventList({
        projectId,
        entityId: generationId,
        observationEventList: generationEventList,
      }),
      ingestionService.processObservationEventList({
        projectId,
        entityId: eventId,
        observationEventList: eventEventList,
      }),
      ingestionService.processScoreEventList({
        projectId,
        entityId: scoreId,
        scoreEventList,
      }),
    ]);

    await clickhouseWriter.flushAll(true);

    const trace = await getClickhouseRecord(TableName.Traces, traceId);

    expect(trace.project_id).toBe("7a88fb47-b4e2-43b8-a06c-a5ce950dc53a");

    const span = await getClickhouseRecord(TableName.Observations, spanId);

    expect(span.id).toBe(spanId);
    expect(span.name).toBe("span-name");
    expect(span.trace_id).toBe(traceId);

    const generation = await getClickhouseRecord(
      TableName.Observations,
      generationId
    );

    expect(generation?.id).toBe(generationId);
    expect(generation?.trace_id).toBe(traceId);
    expect(generation?.name).toBe("generation-name");
    expect(generation?.parent_observation_id).toBe(spanId);
    expect(generation?.model_parameters).toEqual(
      JSON.stringify({
        someKey: ["user-1", "user-2"],
      })
    );

    const event = await getClickhouseRecord(TableName.Observations, eventId);

    expect(event.id).toBe(eventId);
    expect(event.trace_id).toBe(traceId);
    expect(event.name).toBe("event-name");
    expect(event.parent_observation_id).toBe(generationId);

    const score = await getClickhouseRecord(TableName.Scores, scoreId);

    expect(score.id).toBe(scoreId);
    expect(score.trace_id).toBe(traceId);
    expect(score.observation_id).toBe(generationId);
    expect(score.value).toBe(100.5);
  });

  it("should upsert traces", async () => {
    const traceId = randomUUID();

    // First flush
    const traceEventList1: TraceEventType[] = [
      {
        id: randomUUID(),
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
    ];

    await ingestionService.processTraceEventList({
      projectId,
      entityId: traceId,
      traceEventList: traceEventList1,
    });

    await clickhouseWriter.flushAll(true);

    // Second flush
    const traceEventList2: TraceEventType[] = [
      {
        id: randomUUID(),
        type: "trace-create",
        timestamp: new Date().toISOString(),
        body: {
          id: traceId,
          name: "trace-name",
          userId: "user-2",
          tags: ["tag-1", "tag-4", "tag-3"],
        },
      },
    ];

    await ingestionService.processTraceEventList({
      projectId,
      entityId: traceId,
      traceEventList: traceEventList2,
    });

    await clickhouseWriter.flushAll(true);

    vi.useRealTimers();
    await new Promise((resolve) => setTimeout(resolve, 1000));
    vi.useFakeTimers();

    const trace = await getClickhouseRecord(TableName.Traces, traceId);

    expect(trace.name).toBe("trace-name");
    expect(trace.user_id).toBe("user-2");
    expect(trace.release).toBe("1.0.0");
    expect(trace.version).toBe("2.0.0");
    expect(trace.project_id).toBe("7a88fb47-b4e2-43b8-a06c-a5ce950dc53a");
    expect(trace.tags).toEqual(["tag-1", "tag-2", "tag-3", "tag-4"]);
    expect(trace.tags.length).toBe(4);
  });

  it("should fail if no create event AND no existing record in CH", async () => {
    const traceId = randomUUID();
    const generationId = randomUUID();

    // First flush
    const traceEventList1: TraceEventType[] = [
      {
        id: randomUUID(),
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
    ];

    const generationEventListNoCreate: ObservationEvent[] = [
      {
        id: randomUUID(),
        type: "observation-update",
        timestamp: new Date().toISOString(),
        body: {
          id: generationId,
          traceId: traceId,
          type: "GENERATION",
          output: { key: "this is a great gpt output" },
        },
      },
    ];

    await ingestionService.processTraceEventList({
      projectId,
      entityId: traceId,
      traceEventList: traceEventList1,
    });

    expect(
      ingestionService.processObservationEventList({
        projectId,
        entityId: generationId,
        observationEventList: generationEventListNoCreate,
      })
    ).rejects.toThrow();

    const generationEventListWithCreate: ObservationEvent[] = [
      {
        id: randomUUID(),
        type: "observation-create",
        timestamp: new Date().toISOString(),
        body: {
          id: generationId,
          traceId: traceId,
          type: "GENERATION",
          input: "This is a great prompt",
        },
      },
    ];

    await ingestionService.processObservationEventList({
      projectId,
      entityId: generationId,
      observationEventList: generationEventListWithCreate,
    });

    await clickhouseWriter.flushAll(true);

    vi.useRealTimers();
    await new Promise((resolve) => setTimeout(resolve, 1000));
    vi.useFakeTimers();

    // Now the generation update should work
    await ingestionService.processObservationEventList({
      projectId,
      entityId: generationId,
      observationEventList: generationEventListNoCreate,
    });

    await clickhouseWriter.flushAll(true);

    vi.useRealTimers();
    await new Promise((resolve) => setTimeout(resolve, 1000));
    vi.useFakeTimers();

    const generation = await getClickhouseRecord(
      TableName.Observations,
      generationId
    );

    expect(generation.id).toBe(generationId);
    expect(generation.trace_id).toBe(traceId);
    expect(generation.output).toEqual(
      JSON.stringify({
        key: "this is a great gpt output",
      })
    );
    expect(generation.input).toEqual("This is a great prompt");
  });

  it("should upsert traces in the right order", async () => {
    const traceId = randomUUID();

    const latestEvent = new Date();
    const oldEvent = new Date(latestEvent).setSeconds(
      latestEvent.getSeconds() - 1
    );

    const traceEventList: TraceEventType[] = [
      {
        id: randomUUID(),
        type: "trace-create",
        timestamp: latestEvent.toISOString(),
        body: {
          id: traceId,
          timestamp: latestEvent.toISOString(),
          name: "trace-name",
          userId: "user-1",
        },
      },
      {
        id: randomUUID(),
        type: "trace-create",
        timestamp: new Date(oldEvent).toISOString(),
        body: {
          id: traceId,
          timestamp: new Date(oldEvent).toISOString(),
          name: "trace-name",
          userId: "user-2",
        },
      },
    ];

    await ingestionService.processTraceEventList({
      projectId,
      entityId: traceId,
      traceEventList,
    });

    await clickhouseWriter.flushAll(true);

    const trace = await getClickhouseRecord(TableName.Traces, traceId);

    expect(trace.name).toBe("trace-name");
    expect(trace.user_id).toBe("user-1");
    expect(trace.project_id).toBe("7a88fb47-b4e2-43b8-a06c-a5ce950dc53a");
  });

  it("should put observation updates after creates if timestamp is same", async () => {
    const generationId = randomUUID();

    const timestamp = new Date().toISOString();

    const generationEventList: ObservationEvent[] = [
      {
        id: randomUUID(),
        type: "observation-update",
        timestamp,
        body: {
          id: generationId,
          type: "GENERATION",
          output: { key: "this is a great gpt output" },
        },
      },
      {
        id: randomUUID(),
        type: "observation-create",
        timestamp,
        body: {
          id: generationId,
          type: "GENERATION",
          name: "generation-name",
          input: { key: "value" },
          output: "should be overwritten",
          model: "gpt-3.5",
        },
      },
    ];

    await ingestionService.processObservationEventList({
      projectId,
      entityId: generationId,
      observationEventList: generationEventList,
    });

    await clickhouseWriter.flushAll(true);

    const generation = await getClickhouseRecord(
      TableName.Observations,
      generationId
    );

    expect(generation.output).toEqual(
      JSON.stringify({
        key: "this is a great gpt output",
      })
    );
    expect(generation.input).toEqual(JSON.stringify({ key: "value" }));
    expect(generation.provided_model_name).toEqual("gpt-3.5");
    expect(generation.output).toEqual(
      JSON.stringify({ key: "this is a great gpt output" })
    );
  });

  it("should correctly set tokens if usage provided as null", async () => {
    const generationId = randomUUID();
    const traceId = randomUUID();

    const timestamp = new Date().toISOString();
    const traceEventList: TraceEventType[] = [
      {
        id: randomUUID(),
        type: "trace-create",
        timestamp,
        body: {
          id: traceId,
          timestamp,
          name: "trace-name",
          userId: "user-1",
        },
      },
    ];

    const generationEventList1: ObservationEvent[] = [
      {
        id: randomUUID(),
        type: "observation-create",
        timestamp,
        body: {
          type: "GENERATION",
          id: generationId,
          traceId,
          name: "LiteLLM.run",
          // usage: null,
        },
      },
    ];

    await Promise.all([
      ingestionService.processTraceEventList({
        projectId,
        entityId: traceId,
        traceEventList,
      }),
      ingestionService.processObservationEventList({
        projectId,
        entityId: generationId,
        observationEventList: generationEventList1,
      }),
    ]);

    await clickhouseWriter.flushAll(true);

    const generationEventList2: ObservationEvent[] = [
      {
        id: randomUUID(),
        type: "observation-update",
        timestamp,
        body: {
          traceId,
          type: "GENERATION",
          id: generationId,
          endTime: new Date().toISOString(),
          model: "azure/gpt35turbo0125",
          modelParameters: {
            model: "azure/gpt35turbo0125",
            max_tokens: 2000,
            temperature: 0,
            n: 1,
            stream: false,
          },
          usage: {
            input: 1285,
            output: 513,
            total: 1798,
            unit: "TOKENS" as any,
            inputCost: 0.0006425,
            outputCost: 0.0007695,
            totalCost: 0.001412,
          },
        },
      },
    ];

    await ingestionService.processObservationEventList({
      projectId,
      entityId: generationId,
      observationEventList: generationEventList2,
    });

    await clickhouseWriter.flushAll(true);

    const generation = await getClickhouseRecord(
      TableName.Observations,
      generationId
    );

    expect(generation.provided_input_usage_units).toEqual(1285);
    expect(generation.provided_output_usage_units).toEqual(513);
    expect(generation.provided_total_usage_units).toEqual(1798);

    expect(generation.input_usage_units).toEqual(1285);
    expect(generation.output_usage_units).toEqual(513);
    expect(generation.total_usage_units).toEqual(1798);

    expect(generation.provided_input_cost).toEqual(0.0006425);
    expect(generation.provided_output_cost).toEqual(0.0007695);
    expect(generation.provided_total_cost).toEqual(0.001412);

    expect(generation.provided_input_cost).toEqual(0.0006425);
    expect(generation.provided_output_cost).toEqual(0.0007695);
    expect(generation.provided_total_cost).toEqual(0.001412);

    expect(generation.unit).toEqual("TOKENS");
  });

  it("should update all token counts if update does not contain model name", async () => {
    const traceId = randomUUID();
    const generationId = randomUUID();

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

    const traceEventList: TraceEventType[] = [
      {
        id: randomUUID(),
        type: "trace-create",
        timestamp: new Date().toISOString(),
        body: {
          id: traceId,
          name: "trace-name",
          userId: "user-1",
        },
      },
    ];

    const generationEventList: ObservationEvent[] = [
      {
        id: randomUUID(),
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
        id: randomUUID(),
        type: "observation-update",
        timestamp: new Date().toISOString(),
        body: {
          id: generationId,
          type: "GENERATION",
          output: { key: "this is a great gpt output" },
        },
      },
    ];

    await Promise.all([
      ingestionService.processTraceEventList({
        projectId,
        entityId: traceId,
        traceEventList,
      }),
      ingestionService.processObservationEventList({
        projectId,
        entityId: generationId,
        observationEventList: generationEventList,
      }),
    ]);

    await clickhouseWriter.flushAll(true);

    const trace = await getClickhouseRecord(TableName.Traces, traceId);

    expect(trace.name).toBe("trace-name");
    expect(trace.project_id).toBe("7a88fb47-b4e2-43b8-a06c-a5ce950dc53a");
    expect(trace.user_id).toBe("user-1");

    const generation = await getClickhouseRecord(
      TableName.Observations,
      generationId
    );

    expect(generation?.output).toEqual(
      JSON.stringify({
        key: "this is a great gpt output",
      })
    );
    expect(generation?.input).toEqual(JSON.stringify({ key: "value" }));
    expect(generation?.provided_model_name).toEqual("gpt-3.5");
    expect(generation?.output).toEqual(
      JSON.stringify({ key: "this is a great gpt output" })
    );
    expect(generation?.input_usage_units).toEqual(5);
    expect(generation?.output_usage_units).toEqual(11);
  });

  it("should update all token counts if update does not contain model name and events come in wrong order", async () => {
    const traceId = randomUUID();
    const generationId = randomUUID();

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

    const traceEventList: TraceEventType[] = [
      {
        id: randomUUID(),
        type: "trace-create",
        timestamp: new Date().toISOString(),
        body: {
          id: traceId,
          name: "trace-name",
          userId: "user-1",
        },
      },
    ];

    const generationEventList: ObservationEvent[] = [
      {
        id: randomUUID(),
        type: "observation-update",
        timestamp: new Date().toISOString(),
        body: {
          id: generationId,
          type: "GENERATION",
          output: { key: "this is a great gpt output" },
        },
      },
      {
        id: randomUUID(),
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
    ];

    await Promise.all([
      ingestionService.processTraceEventList({
        projectId,
        entityId: traceId,
        traceEventList,
      }),
      ingestionService.processObservationEventList({
        projectId,
        entityId: generationId,
        observationEventList: generationEventList,
      }),
    ]);

    await clickhouseWriter.flushAll(true);

    const trace = await getClickhouseRecord(TableName.Traces, traceId);
    const observation = await getClickhouseRecord(
      TableName.Observations,
      generationId
    );

    expect(observation?.output).toEqual(
      JSON.stringify({
        key: "this is a great gpt output",
      })
    );
    expect(observation?.input).toEqual(JSON.stringify({ key: "value" }));
    expect(observation?.provided_model_name).toEqual("gpt-3.5");
    expect(observation?.output).toEqual(
      JSON.stringify({ key: "this is a great gpt output" })
    );
    expect(observation?.input_usage_units).toEqual(5);
    expect(observation?.output_usage_units).toEqual(11);
  });

  it("null does not override set values", async () => {
    const traceId = randomUUID();
    const timestamp = Date.now();

    const traceEventList: TraceEventType[] = [
      {
        id: randomUUID(),
        type: "trace-create",
        timestamp: new Date(timestamp).toISOString(),
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
        id: randomUUID(),
        type: "trace-create",
        timestamp: new Date(timestamp + 1).toISOString(),
        body: {
          id: traceId,
          name: "trace-name",
          userId: "user-1",
          metadata: { key: "value" },
          release: null,
          version: null,
        },
      },
    ];

    await ingestionService.processTraceEventList({
      projectId,
      entityId: traceId,
      traceEventList,
    });

    await clickhouseWriter.flushAll(true);

    const trace = await getClickhouseRecord(TableName.Traces, traceId);

    expect(trace.release).toBe("1.0.0");
    expect(trace.version).toBe("2.0.0");
  });

  [
    {
      inputs: [{ a: "a" }, { b: "b" }],
      output: { a: "a", b: "b" },
    },
    {
      inputs: [[{ a: "a" }], [{ b: "b" }]],
      output: { metadata: [{ a: "a", b: "b" }] },
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
      output
    )}`, async () => {
      const traceId = randomUUID();
      const generationId = randomUUID();

      const traceEventList: TraceEventType[] = [
        {
          id: randomUUID(),
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
          id: randomUUID(),
          type: "trace-create",
          timestamp: new Date().toISOString(),
          body: {
            id: traceId,
            name: "trace-name",
            metadata: inputs[1],
          },
        },
      ];

      const generationEventList: ObservationEvent[] = [
        {
          id: randomUUID(),
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
          id: randomUUID(),
          type: "observation-update",
          timestamp: new Date().toISOString(),
          body: {
            id: generationId,
            traceId: traceId,
            type: "GENERATION",
            metadata: inputs[1],
          },
        },
      ];

      await Promise.all([
        ingestionService.processTraceEventList({
          projectId,
          entityId: traceId,
          traceEventList,
        }),
        ingestionService.processObservationEventList({
          projectId,
          entityId: generationId,
          observationEventList: generationEventList,
        }),
      ]);

      await clickhouseWriter.flushAll(true);

      const trace = await getClickhouseRecord(TableName.Traces, traceId);

      expect(parseMetadata(trace.metadata)).toEqual(output);

      const generation = await getClickhouseRecord(
        TableName.Observations,
        generationId
      );

      expect(parseMetadata(generation.metadata)).toEqual(output);
    });
  });
});

async function getClickhouseRecord<T extends TableName>(
  tableName: T,
  entityId: string
): Promise<RecordReadType<T>> {
  const query = await clickhouseClient.query({
    query: `SELECT * FROM ${tableName} FINAL WHERE project_id = '${projectId}' AND id = '${entityId}'`,
    format: "JSONEachRow",
  });

  const result = (await query.json())[0];

  return tableName === TableName.Traces
    ? traceRecordReadSchema.parse(result)
    : tableName === TableName.Observations
      ? observationRecordReadSchema.parse(result)
      : (scoreRecordReadSchema.parse(result) as RecordReadType<T>);
}

type RecordReadType<T extends TableName> = T extends TableName.Scores
  ? ScoreRecordReadType
  : T extends TableName.Observations
    ? ObservationRecordReadType
    : T extends TableName.Traces
      ? TraceRecordReadType
      : never;

function parseMetadata<T extends Record<string, unknown>>(metadata: T): T {
  for (const [key, value] of Object.entries(metadata)) {
    try {
      metadata[key] = JSON.parse(value);
    } catch (e) {
      // Do nothing
    }
  }

  return metadata;
}
