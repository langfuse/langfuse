import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod/v4";
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
  createIngestionEventSchema,
} from "@langfuse/shared/src/server";
import { pruneDatabase } from "../../../__tests__/utils";
import waitForExpect from "wait-for-expect";
import { ClickhouseWriter, TableName } from "../../ClickhouseWriter";
import { IngestionService } from "../../IngestionService";
import { ModelUsageUnit, ScoreSource } from "@langfuse/shared";
import { Cluster } from "ioredis";

const projectId = "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a";
const environment = "default";

describe("Ingestion end-to-end tests", () => {
  let ingestionService: IngestionService;
  let clickhouseWriter: ClickhouseWriter;
  let IngestionEventBatchSchema: z.ZodType<any>;

  beforeEach(async () => {
    if (!redis) throw new Error("Redis not initialized");
    await pruneDatabase();

    if (redis instanceof Cluster) {
      await Promise.all(redis.nodes("master").map((node) => node.flushall()));
    } else {
      await redis.flushall();
    }

    clickhouseWriter = ClickhouseWriter.getInstance();

    ingestionService = new IngestionService(
      redis,
      prisma,
      clickhouseWriter,
      clickhouseClient(),
    );

    IngestionEventBatchSchema = z.array(createIngestionEventSchema());
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
          environment,
        },
      },
    ];

    await ingestionService.processTraceEventList({
      projectId,
      entityId: traceId,
      createdAtTimestamp: new Date(timestamp),
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
      expectedUsageDetails: {
        input: 100,
        output: 200,
        total: 100,
      },
    },
    {
      usage: {
        total: 100,
        unit: ModelUsageUnit.Characters,
      },
      expectedUsageDetails: {
        total: 100,
      },
    },
    {
      usage: {
        total: 100,
        unit: ModelUsageUnit.Milliseconds,
      },
      expectedUsageDetails: {
        total: 100,
      },
    },
    {
      usage: {
        input: 1,
        output: 2,
        unit: ModelUsageUnit.Images,
      },
      expectedUsageDetails: {
        input: 1,
        output: 2,
        total: 3,
      },
    },
    {
      usage: {
        input: 1,
        output: 2,
        unit: ModelUsageUnit.Requests,
      },
      expectedUsageDetails: {
        input: 1,
        output: 2,
        total: 3,
      },
    },
    {
      usage: {
        input: 30,
        output: 10,
        unit: ModelUsageUnit.Seconds,
      },
      expectedUsageDetails: {
        input: 30,
        output: 10,
        total: 40,
      },
    },
    {
      usage: {
        total: 100,
      },
      expectedUsageDetails: {
        total: 100,
      },
    },
    {
      usage: undefined,
      expectedUsageDetails: {},
    },
    {
      usage: null,
      expectedUsageDetails: {},
    },
    {
      usage: {},
      expectedUsageDetails: {},
    },
    {
      usage: {},
      usageDetails: {
        input: 1,
        output: 2,
        total: 3,
        cached: 1,
      },
      expectedUsageDetails: {
        input: 1,
        output: 2,
        total: 3,
        cached: 1,
      },
    },
    {
      usage: {
        input: 1,
        output: 2,
        total: 3,
      },
      usageDetails: {
        cached: 1,
      },
      expectedUsageDetails: {
        input: 1,
        output: 2,
        total: 3,
        cached: 1,
      },
    },
    {
      usage: {
        input: 1,
        output: 2,
        total: 3,
      },
      usageDetails: {
        input: 2,
        output: 3,
        total: 5,
        cached: 1,
      },
      expectedUsageDetails: {
        input: 2,
        output: 3,
        total: 5,
        cached: 1,
      },
    },
    {
      usage: {
        input: 1,
        output: 2,
        total: 3,
      },
      costDetails: {
        input: 123,
        output: 456,
        total: 789,
      },
      expectedUsageDetails: {
        input: 1,
        output: 2,
        total: 3,
      },
      expectedCostDetails: {
        input: 123,
        output: 456,
        total: 789,
      },
    },
    {
      usage: {},
      usageDetails: {},
      costDetails: {},
      expectedUsageDetails: {},
      expectedCostDetails: {},
    },
    {
      usage: null,
      usageDetails: null,
      costDetails: null,
      expectedUsageDetails: {},
      expectedCostDetails: {},
    },
    {
      usage: undefined,
      usageDetails: undefined,
      costDetails: undefined,
      expectedUsageDetails: {},
      expectedCostDetails: {},
    },
    {
      usage: { input: 1 },
      usageDetails: { input: 2 },
      costDetails: { input: 3 },
      expectedUsageDetails: { input: 2, total: 2 },
      expectedCostDetails: { input: 3, total: 3 },
    },
    {
      usage: { input: 1 },
      usageDetails: {
        input: 1,
        cached: 2,
        reasoning: 3,
      },
      expectedUsageDetails: { input: 1, cached: 2, reasoning: 3, total: 6 },
    },
    {
      usage: {},
      usageDetails: {
        input: 1,
        output: null,
        total: undefined,
      },
      expectedUsageDetails: { input: 1, total: 1 },
      costDetails: {
        input: 123,
        output: null,
        cached: undefined,
      },
      expectedCostDetails: { input: 123, total: 123 },
    },
    // OpenAI format
    {
      usage: null,
      usageDetails: {
        prompt_tokens: 5,
        completion_tokens: 11,
        total_tokens: 16,
        prompt_tokens_details: {
          cached_tokens: 2,
          audio_tokens: 3,
        },
        completion_tokens_details: {
          text_tokens: 3,
          audio_tokens: 4,
          reasoning_tokens: 4,
        },
      },
      expectedUsageDetails: {
        input: 0,
        output: 0,
        total: 16,
        input_cached_tokens: 2,
        input_audio_tokens: 3,
        output_text_tokens: 3,
        output_audio_tokens: 4,
        output_reasoning_tokens: 4,
      },
    },
    {
      usage: null,
      usageDetails: {
        prompt_tokens: 5,
        completion_tokens: 11,
        total_tokens: 16,
        prompt_tokens_details: {
          cached_tokens: 2,
          audio_tokens: null,
          image_tokens: undefined,
        },
        completion_tokens_details: {
          text_tokens: 3,
          audio_tokens: undefined,
          reasoning_tokens: 4,
          image_tokens: null,
        },
      },
      expectedUsageDetails: {
        input: 3,
        output: 4,
        total: 16,
        input_cached_tokens: 2,
        output_text_tokens: 3,
        output_reasoning_tokens: 4,
      },
    },
    // OpenAI Response API format
    {
      usage: null,
      usageDetails: {
        input_tokens: 5,
        output_tokens: 11,
        total_tokens: 16,
        input_tokens_details: {
          cached_tokens: 2,
          audio_tokens: 3,
        },
        output_tokens_details: {
          text_tokens: 3,
          audio_tokens: 4,
          reasoning_tokens: 4,
        },
      },
      expectedUsageDetails: {
        input: 0,
        output: 0,
        total: 16,
        input_cached_tokens: 2,
        input_audio_tokens: 3,
        output_text_tokens: 3,
        output_audio_tokens: 4,
        output_reasoning_tokens: 4,
      },
    },
    {
      usage: null,
      usageDetails: {
        input_tokens: 5,
        output_tokens: 11,
        total_tokens: 16,
        input_tokens_details: {
          cached_tokens: 2,
          audio_tokens: null,
          image_tokens: undefined,
        },
        output_tokens_details: {
          text_tokens: 3,
          audio_tokens: null,
          reasoning_tokens: 4,
          image_tokens: undefined,
        },
      },
      expectedUsageDetails: {
        input: 3,
        output: 4,
        total: 16,
        input_cached_tokens: 2,
        output_text_tokens: 3,
        output_reasoning_tokens: 4,
      },
    },
  ].forEach((testConfig) => {
    it(`should create trace, generation and score without matching models ${JSON.stringify(
      testConfig,
      null,
      2,
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
            timestamp: new Date().toISOString(),
            name: "trace-name",
            userId: "user-1",
            metadata: { key: "value" },
            release: "1.0.0",
            version: "2.0.0",
            tags: ["tag-1", "tag-2"],
            environment,
          },
        },
      ];

      const generationEventList: ObservationEvent[] =
        IngestionEventBatchSchema.parse([
          {
            id: randomUUID(),
            type: "generation-create",
            timestamp: new Date().toISOString(),
            body: {
              id: generationId,
              traceId: traceId,
              name: "generation-name",
              startTime: "2021-01-01T00:00:00.000Z",
              endTime: "2021-01-01T00:00:00.000Z",
              modelParameters: { key: "value" },
              input: { key: "value" },
              metadata: { key: "value" },
              version: "2.0.0",
              environment,
            },
          },
          {
            id: randomUUID(),
            type: "generation-update",
            timestamp: new Date().toISOString(),
            body: {
              id: generationId,
              output: { key: "this is a great gpt output" },
              usage: testConfig.usage,
              usageDetails: testConfig.usageDetails,
              costDetails: testConfig.costDetails,
              environment,
            },
          },
        ]);

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
            environment,
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
            source: ScoreSource.EVAL,
            traceId: traceId,
            environment,
          },
        },
      ];

      await Promise.all([
        ingestionService.processTraceEventList({
          projectId,
          entityId: traceId,
          createdAtTimestamp: new Date(),
          traceEventList,
        }),
        ingestionService.processObservationEventList({
          projectId,
          entityId: spanId,
          createdAtTimestamp: new Date(),
          observationEventList: spanEventList,
        }),
        ingestionService.processObservationEventList({
          projectId,
          entityId: generationId,
          createdAtTimestamp: new Date(),
          observationEventList: generationEventList,
        }),
        ingestionService.processScoreEventList({
          projectId,
          entityId: scoreId,
          createdAtTimestamp: new Date(),
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
        generationId,
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
        }),
      );
      expect(generation.input).toEqual(JSON.stringify({ key: "value" }));
      expect(generation.metadata).toEqual({ key: "value" });
      expect(generation.version).toBe("2.0.0");
      expect(generation.internal_model_id).toBeNull();
      expect(generation.usage_details).toMatchObject(
        testConfig.expectedUsageDetails,
      );
      expect(generation.output).toEqual(
        JSON.stringify({
          key: "this is a great gpt output",
        }),
      );

      const span = await getClickhouseRecord(TableName.Observations, spanId);

      expect(span.id).toBe(spanId);
      expect(span.name).toBe("span-name");
      expect(span.start_time).toEqual("2021-01-01T00:00:00.000Z");
      expect(span.end_time).toEqual("2021-01-01T00:00:00.000Z");
      expect(span.input).toEqual(JSON.stringify({ input: "value" }));
      expect(span.metadata).toEqual({ meta: "value" });
      expect(span.version).toBe("2.0.0");

      const score = await getClickhouseRecord(TableName.Scores, scoreId);

      expect(score.id).toBe(scoreId);
      expect(score.trace_id).toBe(traceId);
      expect(score.name).toBe("score-name");
      expect(score.value).toBe(100.5);
      expect(score.observation_id).toBeNull();
      expect(score.source).toBe(ScoreSource.EVAL);
      expect(score.project_id).toBe("7a88fb47-b4e2-43b8-a06c-a5ce950dc53a");
    });
  });

  [
    {
      observationExternalModel: "gpt-3.5",
      observationStartTime: new Date("2021-01-01T00:00:00.000Z"),
      modelUnit: ModelUsageUnit.Tokens,
      expectedInternalModelId: "custom-model-id",
      expectedUsageDetails: {
        input: 5,
        output: 7,
      },
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
      expectedUsageDetails: {
        input: 5,
        output: 7,
      },
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
      expectedUsageDetails: {
        input: 5,
        output: 7,
      },
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
      expectedUsageDetails: {
        input: 5,
        output: 7,
      },
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
      expectedUsageDetails: {
        input: 5,
        output: 7,
      },
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
      expectedUsageDetails: {},
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
      expectedUsageDetails: {},
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
      expectedUsageDetails: {},
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
      expectedUsageDetails: {},
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
      2,
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
          }),
        ),
      );

      const traceEventList: TraceEventType[] = [
        {
          id: randomUUID(),
          type: "trace-create",
          timestamp: new Date().toISOString(),
          body: {
            id: traceId,
            name: "trace-name",
            timestamp: new Date().toISOString(),
            environment,
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
            environment,
          },
        },
      ];

      await Promise.all([
        ingestionService.processTraceEventList({
          projectId,
          entityId: traceId,
          createdAtTimestamp: new Date(),
          traceEventList,
        }),
        ingestionService.processObservationEventList({
          projectId,
          entityId: generationId,
          createdAtTimestamp: new Date(),
          observationEventList: generationEventList,
        }),
      ]);
      await clickhouseWriter.flushAll(true);

      const generation = await getClickhouseRecord(
        TableName.Observations,
        generationId,
      );

      expect(generation.id).toBe(generationId);
      expect(generation.trace_id).toBe(traceId);
      expect(generation.name).toBe("generation-name");
      expect(generation.start_time).toEqual(
        testConfig.observationStartTime.toISOString(),
      );
      expect(generation.provided_model_name).toBe(
        testConfig.observationExternalModel,
      );
      expect(generation.usage_details.input).toBe(
        testConfig.expectedUsageDetails.input,
      );
      expect(generation.usage_details.output).toBe(
        testConfig.expectedUsageDetails.output,
      );
      expect(generation.internal_model_id).toBe(
        testConfig.expectedInternalModelId,
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
          timestamp: new Date().toISOString(),
          environment,
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
          startTime: new Date().toISOString(),
          environment,
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
          startTime: new Date().toISOString(),
          environment,
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
          startTime: new Date().toISOString(),
          parentObservationId: spanId,
          environment: environment,
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
          startTime: new Date().toISOString(),
          environment,
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
          startTime: new Date().toISOString(),
          parentObservationId: generationId,
          environment,
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
          source: ScoreSource.API,
          value: 100.5,
          observationId: generationId,
          environment,
        },
      },
    ];

    await Promise.all([
      ingestionService.processTraceEventList({
        projectId,
        entityId: traceId,
        createdAtTimestamp: new Date(),
        traceEventList,
      }),
      ingestionService.processObservationEventList({
        projectId,
        entityId: spanId,
        createdAtTimestamp: new Date(),
        observationEventList: spanEventList,
      }),
      ingestionService.processObservationEventList({
        projectId,
        entityId: generationId,
        createdAtTimestamp: new Date(),
        observationEventList: generationEventList,
      }),
      ingestionService.processObservationEventList({
        projectId,
        entityId: eventId,
        createdAtTimestamp: new Date(),
        observationEventList: eventEventList,
      }),
      ingestionService.processScoreEventList({
        projectId,
        entityId: scoreId,
        createdAtTimestamp: new Date(),
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
      generationId,
    );

    expect(generation?.id).toBe(generationId);
    expect(generation?.trace_id).toBe(traceId);
    expect(generation?.name).toBe("generation-name");
    expect(generation?.parent_observation_id).toBe(spanId);
    expect(generation?.model_parameters).toEqual(
      JSON.stringify({
        someKey: ["user-1", "user-2"],
      }),
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
          timestamp: new Date().toISOString(),
          userId: "user-1",
          metadata: { key: "value" },
          release: "1.0.0",
          version: "2.0.0",
          tags: ["tag-1", "tag-2", "tag-2"],
          environment,
        },
      },
    ];

    await ingestionService.processTraceEventList({
      projectId,
      entityId: traceId,
      createdAtTimestamp: new Date(),
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
          environment,
        },
      },
    ];

    await ingestionService.processTraceEventList({
      projectId,
      entityId: traceId,
      createdAtTimestamp: new Date(),
      traceEventList: traceEventList2,
    });

    await clickhouseWriter.flushAll(true);

    await waitForExpect(async () => {
      const trace = await getClickhouseRecord(TableName.Traces, traceId);

      expect(trace.name).toBe("trace-name");
      expect(trace.user_id).toBe("user-2");
      expect(trace.release).toBe("1.0.0");
      expect(trace.version).toBe("2.0.0");
      expect(trace.project_id).toBe("7a88fb47-b4e2-43b8-a06c-a5ce950dc53a");
      expect(trace.tags).toEqual(["tag-1", "tag-2", "tag-3", "tag-4"]);
      expect(trace.tags.length).toBe(4);
    });
  });

  it("should upsert traces in the right order", async () => {
    const traceId = randomUUID();

    const latestEvent = new Date();
    const oldEvent = new Date(latestEvent).setSeconds(
      latestEvent.getSeconds() - 1,
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
          environment,
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
          environment,
        },
      },
    ];

    await ingestionService.processTraceEventList({
      projectId,
      entityId: traceId,
      createdAtTimestamp: new Date(),
      traceEventList,
    });

    await clickhouseWriter.flushAll(true);

    const trace = await getClickhouseRecord(TableName.Traces, traceId);

    expect(trace.name).toBe("trace-name");
    expect(trace.user_id).toBe("user-1");
    expect(trace.project_id).toBe("7a88fb47-b4e2-43b8-a06c-a5ce950dc53a");
  });

  it("should merge observations and set negative tokens and cost to null", async () => {
    await prisma.model.create({
      data: {
        id: "clyrjpbe20000t0mzcbwc42rg",
        modelName: "gpt-4o-mini-2024-07-18",
        matchPattern: "(?i)^(gpt-4o-mini-2024-07-18)$",
        startDate: new Date("2021-01-01T00:00:00.000Z"),
        unit: ModelUsageUnit.Tokens,
        tokenizerId: "openai",
        inputPrice: 0.00000015,
        outputPrice: 0.0000006,
        tokenizerConfig: {
          tokensPerName: 1,
          tokenizerModel: "gpt-4o",
          tokensPerMessage: 3,
        },
      },
    });

    await prisma.price.create({
      data: {
        id: "cm2uio8ef006mh6qlzc2mqa0e",
        modelId: "clyrjpbe20000t0mzcbwc42rg",
        projectId: null,
        price: 0.00000015,
        usageType: "input",
      },
    });

    await prisma.price.create({
      data: {
        id: "cm2uio8ef006oh6qlldn36376",
        modelId: "clyrjpbe20000t0mzcbwc42rg",
        projectId: null,
        price: 0.0000006,
        usageType: "output",
      },
    });

    const observationId = "c8d30f61-4097-407f-a337-5fb1e0c100f2";
    const observationEventList: ObservationEvent[] = [
      {
        id: "084274e5-f15e-4f66-8419-a171808d8180",
        timestamp: "2024-11-04T16:13:51.496457Z",
        type: "generation-create",
        body: {
          traceId: "82c480bc-1c4e-4ba8-a153-0bd9f9e1a28e",
          name: "extract_location",
          startTime: "2024-11-04T16:13:51.495868Z",
          metadata: {
            ls_provider: "openai",
            ls_model_name: "gpt-4o-mini-2024-07-18",
            ls_model_type: "chat",
            ls_temperature: 0.4,
            ls_max_tokens: 1000,
          },
          input: "Sample input",
          id: "c8d30f61-4097-407f-a337-5fb1e0c100f2",
          model: "gpt-4o-mini-2024-07-18",
          modelParameters: {
            temperature: "0.4",
            max_tokens: 1000,
          },
          usage: null,
          environment,
        },
      },
      {
        id: "ef654262-b1d0-4b0b-9e4a-2a410e0577a6",
        timestamp: "2024-11-04T16:13:52.156691Z",
        type: "generation-update",
        body: {
          traceId: "82c480bc-1c4e-4ba8-a153-0bd9f9e1a28e",
          output: "Sample output",
          id: "c8d30f61-4097-407f-a337-5fb1e0c100f2",
          endTime: "2024-11-04T16:13:52.156248Z",
          model: "gpt-4o-mini-2024-07-18",
          usage: {
            input: 4,
            output: -7,
            total: -3,
            unit: "TOKENS",
          },
          environment,
        },
      },
    ];

    await ingestionService.processObservationEventList({
      projectId,
      entityId: observationId,
      createdAtTimestamp: new Date(),
      observationEventList,
    });

    await clickhouseWriter.flushAll(true);

    const observation = await getClickhouseRecord(
      TableName.Observations,
      observationId,
    );

    expect(observation.name).toBe("extract_location");
    expect(observation.provided_usage_details).toStrictEqual({
      input: 4,
    });
    expect(observation.usage_details).toStrictEqual({
      input: 4,
      total: 4,
    });
    expect(observation.provided_cost_details).toStrictEqual({});
    expect(observation.cost_details).toStrictEqual({
      input: 0.0000006,
      total: 0.0000006,
    });
    expect(observation.total_cost).toBe(0.0000006);
  });

  it("should merge observations and calculate cost", async () => {
    await prisma.model.create({
      data: {
        id: "clyrjpbe20000t0mzcbwc42rg",
        modelName: "gpt-4o-mini-2024-07-18",
        matchPattern: "(?i)^(gpt-4o-mini-2024-07-18)$",
        startDate: new Date("2021-01-01T00:00:00.000Z"),
        unit: ModelUsageUnit.Tokens,
        tokenizerId: "openai",
        inputPrice: 0.00000015,
        outputPrice: 0.0000006,
        tokenizerConfig: {
          tokensPerName: 1,
          tokenizerModel: "gpt-4o",
          tokensPerMessage: 3,
        },
      },
    });

    await prisma.price.create({
      data: {
        id: "cm2uio8ef006mh6qlzc2mqa0e",
        modelId: "clyrjpbe20000t0mzcbwc42rg",
        projectId: null,
        price: 0.00000015,
        usageType: "input",
      },
    });

    await prisma.price.create({
      data: {
        id: "cm2uio8ef006oh6qlldn36376",
        modelId: "clyrjpbe20000t0mzcbwc42rg",
        projectId: null,
        price: 0.0000006,
        usageType: "output",
      },
    });

    const observationId = "c8d30f61-4097-407f-a337-5fb1e0c100f2";
    const observationEventList: ObservationEvent[] = [
      {
        id: "084274e5-f15e-4f66-8419-a171808d8180",
        timestamp: "2024-11-04T16:13:51.496457Z",
        type: "generation-create",
        body: {
          traceId: "82c480bc-1c4e-4ba8-a153-0bd9f9e1a28e",
          name: "extract_location",
          startTime: "2024-11-04T16:13:51.495868Z",
          metadata: {
            ls_provider: "openai",
            ls_model_name: "gpt-4o-mini-2024-07-18",
            ls_model_type: "chat",
            ls_temperature: 0.4,
            ls_max_tokens: 1000,
          },
          input: "Sample input",
          id: "c8d30f61-4097-407f-a337-5fb1e0c100f2",
          model: "gpt-4o-mini-2024-07-18",
          modelParameters: {
            temperature: "0.4",
            max_tokens: 1000,
          },
          usage: null,
          environment,
        },
      },
      {
        id: "ef654262-b1d0-4b0b-9e4a-2a410e0577a6",
        timestamp: "2024-11-04T16:13:52.156691Z",
        type: "generation-update",
        body: {
          traceId: "82c480bc-1c4e-4ba8-a153-0bd9f9e1a28e",
          output: "Sample output",
          id: "c8d30f61-4097-407f-a337-5fb1e0c100f2",
          endTime: "2024-11-04T16:13:52.156248Z",
          model: "gpt-4o-mini-2024-07-18",
          usage: {
            input: 1295,
            output: 18,
            total: 1313,
            unit: "TOKENS",
          },
          environment,
        },
      },
    ];

    await ingestionService.processObservationEventList({
      projectId,
      entityId: observationId,
      createdAtTimestamp: new Date(),
      observationEventList,
    });

    await clickhouseWriter.flushAll(true);

    const observation = await getClickhouseRecord(
      TableName.Observations,
      observationId,
    );

    expect(observation.name).toBe("extract_location");
    expect(observation.provided_usage_details).toStrictEqual({
      input: 1295,
      output: 18,
      total: 1313,
    });
    expect(observation.usage_details).toStrictEqual({
      input: 1295,
      output: 18,
      total: 1313,
    });
    expect(observation.provided_cost_details).toStrictEqual({});
    expect(observation.cost_details).toStrictEqual({
      input: 0.00019425,
      output: 0.0000108,
      total: 0.00020505,
    });
    expect(observation.total_cost).toBe(0.00020505);
  });

  it("should merge observations from clickhouse and event list", async () => {
    const traceId = randomUUID();
    const observationId = randomUUID();

    const latestEvent = new Date();

    const observationEventList1: ObservationEvent[] = [
      {
        id: randomUUID(),
        type: "generation-create",
        timestamp: new Date().toISOString(),
        body: {
          id: observationId,
          traceId: traceId,
          startTime: new Date().toISOString(),
          output: "to overwrite",
          usage: undefined,
          environment,
        },
      },
    ];
    await ingestionService.processObservationEventList({
      projectId,
      entityId: observationId,
      createdAtTimestamp: new Date(),
      observationEventList: observationEventList1,
    });
    await clickhouseWriter.flushAll(true);

    const observationEventList2: ObservationEvent[] = [
      {
        id: randomUUID(),
        type: "generation-update",
        timestamp: new Date().toISOString(),
        body: {
          id: observationId,
          name: "generation-name",
          traceId: traceId,
          output: "overwritten",
          usage: undefined,
          environment,
        },
      },
    ];
    await ingestionService.processObservationEventList({
      projectId,
      entityId: observationId,
      createdAtTimestamp: new Date(),
      observationEventList: observationEventList2,
    });
    await clickhouseWriter.flushAll(true);

    const observation = await getClickhouseRecord(
      TableName.Observations,
      observationId,
    );

    expect(observation.name).toBe("generation-name");
    expect(observation.output).toBe("overwritten");
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
          startTime: new Date().toISOString(),
          output: { key: "this is a great gpt output" },
          environment,
        },
      },
      {
        id: randomUUID(),
        type: "observation-create",
        timestamp,
        body: {
          id: generationId,
          type: "GENERATION",
          startTime: new Date().toISOString(),
          name: "generation-name",
          input: { key: "value" },
          output: "should be overwritten",
          model: "gpt-3.5",
          environment,
        },
      },
    ];

    await ingestionService.processObservationEventList({
      projectId,
      entityId: generationId,
      createdAtTimestamp: new Date(),
      observationEventList: generationEventList,
    });

    await clickhouseWriter.flushAll(true);

    const generation = await getClickhouseRecord(
      TableName.Observations,
      generationId,
    );

    expect(generation.output).toEqual(
      JSON.stringify({
        key: "this is a great gpt output",
      }),
    );
    expect(generation.input).toEqual(JSON.stringify({ key: "value" }));
    expect(generation.provided_model_name).toEqual("gpt-3.5");
    expect(generation.output).toEqual(
      JSON.stringify({ key: "this is a great gpt output" }),
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
          environment,
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
          startTime: new Date().toISOString(),
          name: "LiteLLM.run",
          // usage: null,
          environment,
        },
      },
    ];

    await Promise.all([
      ingestionService.processTraceEventList({
        projectId,
        entityId: traceId,
        createdAtTimestamp: new Date(),
        traceEventList,
      }),
      ingestionService.processObservationEventList({
        projectId,
        entityId: generationId,
        createdAtTimestamp: new Date(),
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
          environment,
        },
      },
    ];

    await ingestionService.processObservationEventList({
      projectId,
      entityId: generationId,
      createdAtTimestamp: new Date(),
      observationEventList: generationEventList2,
    });

    await clickhouseWriter.flushAll(true);

    const generation = await getClickhouseRecord(
      TableName.Observations,
      generationId,
    );

    expect(generation.usage_details.input).toEqual(1285);
    expect(generation.usage_details.output).toEqual(513);
    expect(generation.usage_details.total).toEqual(1798);

    expect(generation.provided_usage_details.input).toEqual(1285);
    expect(generation.provided_usage_details.output).toEqual(513);
    expect(generation.provided_usage_details.total).toEqual(1798);

    expect(generation.cost_details.input).toEqual(0.0006425);
    expect(generation.cost_details.output).toEqual(0.0007695);
    expect(generation.cost_details.total).toEqual(0.001412);

    expect(generation.provided_cost_details.input).toEqual(0.0006425);
    expect(generation.provided_cost_details.output).toEqual(0.0007695);
    expect(generation.provided_cost_details.total).toEqual(0.001412);
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
          timestamp: new Date().toISOString(),
          userId: "user-1",
          environment,
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
          startTime: new Date().toISOString(),
          name: "generation-name",
          input: { key: "value" },
          model: "gpt-3.5",
          environment,
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
          environment,
        },
      },
    ];

    await Promise.all([
      ingestionService.processTraceEventList({
        projectId,
        entityId: traceId,
        createdAtTimestamp: new Date(),
        traceEventList,
      }),
      ingestionService.processObservationEventList({
        projectId,
        entityId: generationId,
        createdAtTimestamp: new Date(),
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
      generationId,
    );

    expect(generation?.output).toEqual(
      JSON.stringify({
        key: "this is a great gpt output",
      }),
    );
    expect(generation?.input).toEqual(JSON.stringify({ key: "value" }));
    expect(generation?.provided_model_name).toEqual("gpt-3.5");
    expect(generation?.output).toEqual(
      JSON.stringify({ key: "this is a great gpt output" }),
    );
    expect(generation?.usage_details.input).toEqual(5);
    expect(generation?.usage_details.output).toEqual(11);
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
          timestamp: new Date().toISOString(),
          userId: "user-1",
          environment,
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
          environment,
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
          startTime: new Date().toISOString(),
          name: "generation-name",
          input: { key: "value" },
          model: "gpt-3.5",
          environment,
        },
      },
    ];

    await Promise.all([
      ingestionService.processTraceEventList({
        projectId,
        entityId: traceId,
        createdAtTimestamp: new Date(),
        traceEventList,
      }),
      ingestionService.processObservationEventList({
        projectId,
        entityId: generationId,
        createdAtTimestamp: new Date(),
        observationEventList: generationEventList,
      }),
    ]);

    await clickhouseWriter.flushAll(true);

    const trace = await getClickhouseRecord(TableName.Traces, traceId);
    const observation = await getClickhouseRecord(
      TableName.Observations,
      generationId,
    );

    expect(observation?.output).toEqual(
      JSON.stringify({
        key: "this is a great gpt output",
      }),
    );
    expect(observation?.input).toEqual(JSON.stringify({ key: "value" }));
    expect(observation?.provided_model_name).toEqual("gpt-3.5");
    expect(observation?.output).toEqual(
      JSON.stringify({ key: "this is a great gpt output" }),
    );
    expect(observation?.usage_details.input).toEqual(5);
    expect(observation?.usage_details.output).toEqual(11);
  });

  it("null does override set values, undefined doesn't", async () => {
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
          timestamp: new Date(timestamp).toISOString(),
          userId: "user-1",
          metadata: { key: "value" },
          release: "1.0.0",
          version: "2.0.0",
          environment,
        },
      },
      {
        id: randomUUID(),
        type: "trace-create",
        timestamp: new Date(timestamp + 1).toISOString(),
        body: {
          id: traceId,
          name: "trace-name",
          metadata: { key: "value" },
          // Do not set user_id here to validate behaviour for missing fields
          release: null,
          version: undefined,
          environment,
        },
      },
    ];

    await ingestionService.processTraceEventList({
      projectId,
      entityId: traceId,
      createdAtTimestamp: new Date(),
      traceEventList,
    });

    await clickhouseWriter.flushAll(true);

    const trace = await getClickhouseRecord(TableName.Traces, traceId);

    expect(trace.release).toBe(null);
    expect(trace.version).toBe("2.0.0");
    expect(trace.user_id).toBe("user-1");
  });

  it("should skip clickhouse read for recently created projects", async () => {
    const projectId = randomUUID();
    await prisma.project.create({
      data: {
        id: projectId,
        name: randomUUID(),
        orgId: "seed-org-id",
      },
    });
    const shouldSkip = await ingestionService.shouldSkipClickHouseRead(
      projectId,
      "2024-01-01", // Use some date in the past
    );
    expect(shouldSkip).toBe(true);
  });

  [
    {
      inputs: [{ a: "a" }, { b: "b" }],
      output: { a: "a", b: "b" },
    },
    // The following two blocks are nice, but not critical for correct behaviour.
    // Stringifying them produces flaky tests, hence we skip them for now.
    // {
    //   inputs: [[{ a: "a" }], [{ b: "b" }]],
    //   output: { metadata: '[{"a":"a","b":"b"}]' },
    // },
    // {
    //   inputs: [
    //     {
    //       a: { "1": 1 },
    //     },
    //     {
    //       b: "b",
    //       a: { "2": 2 },
    //     },
    //   ],
    //   output: { a: '{ "1": 1, "2": 2 }', b: "b" },
    // },
    {
      inputs: [{ a: "a" }, undefined],
      output: { a: "a" },
    },
    {
      inputs: [undefined, { b: "b" }],
      output: { b: "b" },
    },
    {
      inputs: [{ bar: "baz" }, { foo: "bar" }],
      output: { foo: "bar", bar: "baz" },
    },
    {
      inputs: [{ foo: { bar: "baz" } }, { hello: "world" }],
      output: { foo: '{"bar":"baz"}', hello: "world" },
    },
  ].forEach(({ inputs, output }) => {
    it(`merges metadata ${JSON.stringify(inputs)}, ${JSON.stringify(output)}`, async () => {
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
            timestamp: new Date().toISOString(),
            userId: "user-1",
            metadata: inputs[0],
            environment,
          },
        },
        {
          id: randomUUID(),
          type: "trace-create",
          timestamp: new Date().toISOString(),
          body: {
            id: traceId,
            name: "trace-name",
            timestamp: new Date().toISOString(),
            metadata: inputs[1],
            environment,
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
            startTime: new Date().toISOString(),
            type: "GENERATION",
            name: "generation-name",
            metadata: inputs[0],
            environment,
          },
        },
        {
          id: randomUUID(),
          type: "observation-update",
          timestamp: new Date().toISOString(),
          body: {
            id: generationId,
            traceId: traceId,
            startTime: new Date().toISOString(),
            type: "GENERATION",
            metadata: inputs[1],
            environment,
          },
        },
      ];

      await Promise.all([
        ingestionService.processTraceEventList({
          projectId,
          entityId: traceId,
          createdAtTimestamp: new Date(),
          traceEventList,
        }),
        ingestionService.processObservationEventList({
          projectId,
          entityId: generationId,
          createdAtTimestamp: new Date(),
          observationEventList: generationEventList,
        }),
      ]);

      await clickhouseWriter.flushAll(true);

      const trace = await getClickhouseRecord(TableName.Traces, traceId);

      expect(trace.metadata).toEqual(output);

      const generation = await getClickhouseRecord(
        TableName.Observations,
        generationId,
      );

      expect(generation.metadata).toEqual(output);
    });
  });
});

async function getClickhouseRecord<T extends TableName>(
  tableName: T,
  entityId: string,
): Promise<RecordReadType<T>> {
  const query = await clickhouseClient().query({
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
