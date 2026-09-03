import { beforeEach, expect, describe, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  applyObservationFieldOverflow: vi.fn(),
  validateAndInflateScoreOverride: undefined as
    | ((...args: unknown[]) => unknown)
    | undefined,
}));

vi.mock(
  "../../../features/observation-field-overflow/processObservationFieldOverflow",
  () => ({
    applyObservationFieldOverflow: mocks.applyObservationFieldOverflow,
  }),
);

vi.mock("@langfuse/shared/src/server", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@langfuse/shared/src/server")>();
  return {
    ...actual,
    validateAndInflateScore: (...args: unknown[]) =>
      mocks.validateAndInflateScoreOverride
        ? mocks.validateAndInflateScoreOverride(...args)
        : (actual.validateAndInflateScore as (...a: unknown[]) => unknown)(
            ...args,
          ),
  };
});

import { IngestionService } from "../../IngestionService";
import {
  convertDateToClickhouseDateTime,
  createTraceScore,
  type ObservationEvent,
  type ScoreEventType,
} from "@langfuse/shared/src/server";
import { TableName } from "../../ClickhouseWriter";

describe("IngestionService unit tests", () => {
  beforeEach(() => {
    mocks.applyObservationFieldOverflow.mockReset();
    mocks.applyObservationFieldOverflow.mockImplementation(
      async (eventRecord) => eventRecord,
    );
    mocks.validateAndInflateScoreOverride = undefined;
  });

  it("writes the final serialized event size instead of the raw OTEL span size", async () => {
    const addToQueue = vi.fn();
    const ingestionService = new IngestionService(
      {} as any,
      {} as any,
      { addToQueue } as any,
      {} as any,
    );
    const rawOtelSpanBytes = 10_000_000;
    const eventRecord = await ingestionService.createEventRecord(
      {
        projectId: "project-id",
        traceId: "trace-id",
        spanId: "observation-id",
        parentSpanId: "",
        name: "post-media-size",
        type: "SPAN",
        environment: "default",
        startTimeISO: "2026-07-22T00:00:00.000Z",
        endTimeISO: "2026-07-22T00:00:01.000Z",
        input: "@@@langfuseMedia:type=image/png|id=media-id|source=bytes@@@",
        output: "multibyte 🔥 output",
        metadata: { nested: { value: "metadata" } },
        source: "otel",
        eventBytes: rawOtelSpanBytes,
      },
      "otel/project-id/raw-event.json",
    );

    expect(eventRecord.event_bytes).toBe(rawOtelSpanBytes);

    await ingestionService.writeEventRecord(eventRecord);

    expect(addToQueue).toHaveBeenCalledOnce();
    const queuedRecord = addToQueue.mock.calls[0]?.[1];
    const { event_bytes: eventBytes, ...eventWithoutSize } = queuedRecord;

    expect(queuedRecord).not.toBe(eventRecord);
    expect(eventRecord.event_bytes).toBe(rawOtelSpanBytes);
    expect(eventBytes).toBe(
      Buffer.byteLength(JSON.stringify(eventWithoutSize), "utf8"),
    );
    expect(eventBytes).toBeLessThan(rawOtelSpanBytes);
  });

  it("overflows only the direct events_full copy and preserves the enriched record", async () => {
    const addToQueue = vi.fn();
    const ingestionService = new IngestionService(
      {} as any,
      {} as any,
      { addToQueue } as any,
      {} as any,
    );
    const eventRecord = await ingestionService.createEventRecord(
      {
        projectId: "project-id",
        traceId: "trace-id",
        spanId: "observation-id",
        parentSpanId: "",
        name: "overflow-copy",
        type: "SPAN",
        environment: "default",
        startTimeISO: "2026-07-22T00:00:00.000Z",
        endTimeISO: "2026-07-22T00:00:01.000Z",
        input: "original input",
        output: "original output",
        metadata: { keep: "small", large: { nested: "large" } },
        source: "otel",
        eventBytes: 1234,
      },
      "raw-event.json",
    );
    mocks.applyObservationFieldOverflow.mockResolvedValueOnce({
      ...eventRecord,
      input:
        "@@@langfuseMedia:type=text/plain|id=input-media|source=field_size_limit@@@",
      metadata_values: [
        "small",
        "@@@langfuseMedia:type=text/plain|id=metadata-media|source=field_size_limit@@@",
      ],
    });

    await ingestionService.writeEventRecord(eventRecord);

    expect(mocks.applyObservationFieldOverflow).toHaveBeenCalledWith(
      eventRecord,
    );
    expect(eventRecord.input).toBe("original input");
    expect(eventRecord.metadata_names).toEqual(["keep", "large.nested"]);
    expect(addToQueue).toHaveBeenCalledOnce();
    expect(addToQueue.mock.calls[0]?.[1]).toMatchObject({
      input: expect.stringContaining("input-media"),
      metadata_names: ["keep", "large.nested"],
      metadata_values: ["small", expect.stringContaining("metadata-media")],
    });
  });

  it("promotes provided usage and cost for model-less direct events", async () => {
    const ingestionService = new IngestionService(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    const eventRecord = await ingestionService.createEventRecord(
      {
        projectId: "project-id",
        traceId: "trace-id",
        spanId: "observation-id",
        name: "provided-cost",
        type: "GENERATION",
        environment: "default",
        startTimeISO: "2026-08-03T00:00:00.000Z",
        endTimeISO: "2026-08-03T00:00:01.000Z",
        providedUsageDetails: { total: 3 },
        providedCostDetails: { total: 0.03 },
        metadata: {},
        source: "otel",
      },
      "otel/project-id/raw-event.json",
    );

    expect(eventRecord.provided_usage_details).toEqual({ total: 3 });
    expect(eventRecord.usage_details).toEqual({ total: 3 });
    expect(eventRecord.provided_cost_details).toEqual({ total: 0.03 });
    expect(eventRecord.cost_details).toEqual({ total: 0.03 });
  });

  it("keeps legacy evaluator metadata for ClickHouse defaults", async () => {
    const ingestionService = new IngestionService(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    const eventRecord = await ingestionService.createEventRecord(
      {
        projectId: "project-id",
        traceId: "trace-id",
        spanId: "observation-id",
        name: "evaluator",
        type: "SPAN",
        environment: "default",
        startTimeISO: "2026-08-03T00:00:00.000Z",
        endTimeISO: "2026-08-03T00:00:01.000Z",
        metadata: {
          dispatcher_name: "test-dispatcher",
          evaluator_id: "evaluator-1",
          evaluation_rule_id: "rule-1",
          job_configuration_id: "legacy-rule-1",
          evaluator_test: "true",
        },
        source: "otel",
      },
      "otel/project-id/raw-event.json",
    );

    expect(eventRecord.evaluator_id).toBeUndefined();
    expect(eventRecord.evaluation_rule_id).toBeUndefined();
    expect(eventRecord.evaluator_execution_is_test).toBeUndefined();
    expect(eventRecord.metadata_names).toEqual([
      "dispatcher_name",
      "evaluator_id",
      "evaluation_rule_id",
      "job_configuration_id",
      "evaluator_test",
    ]);
    expect(eventRecord.metadata_values).toEqual([
      "test-dispatcher",
      "evaluator-1",
      "rule-1",
      "legacy-rule-1",
      "true",
    ]);
  });

  it("persists evaluation context in dedicated columns without removing metadata", async () => {
    const ingestionService = new IngestionService(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    const eventRecord = await ingestionService.createEventRecord(
      {
        projectId: "project-id",
        traceId: "trace-id",
        spanId: "observation-id",
        name: "evaluator",
        type: "SPAN",
        environment: "default",
        startTimeISO: "2026-08-03T00:00:00.000Z",
        endTimeISO: "2026-08-03T00:00:01.000Z",
        metadata: {
          evaluator_id: "legacy-evaluator-1",
          job_configuration_id: "legacy-rule-1",
          evaluator_test: "true",
        },
        evaluationContext: {
          evaluatorId: "evaluator-1",
          evaluationRuleId: "rule-1",
          evaluatorExecutionIsTest: false,
        },
        source: "otel",
      },
      "otel/project-id/raw-event.json",
    );

    expect(eventRecord.evaluator_id).toBe("evaluator-1");
    expect(eventRecord.evaluation_rule_id).toBe("rule-1");
    expect(eventRecord.evaluator_execution_is_test).toBe(false);
    expect(eventRecord.metadata_names).toEqual([
      "evaluator_id",
      "job_configuration_id",
      "evaluator_test",
    ]);
    expect(eventRecord.metadata_values).toEqual([
      "legacy-evaluator-1",
      "legacy-rule-1",
      "true",
    ]);
  });

  it("preserves non-JSON model parameter strings on direct events", async () => {
    const ingestionService = new IngestionService(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    const eventRecord = await ingestionService.createEventRecord(
      {
        projectId: "project-id",
        traceId: "trace-id",
        spanId: "observation-id",
        name: "invalid-model-parameters",
        type: "SPAN",
        environment: "default",
        startTimeISO: "2026-08-17T00:00:00.000Z",
        endTimeISO: "2026-08-17T00:00:01.000Z",
        modelParameters: "not-json",
        metadata: {},
        source: "otel",
      },
      "otel/project-id/raw-event.json",
    );

    expect(eventRecord.model_parameters).toBe("not-json");
  });

  it("passes direct-event attribute values to pricing", async () => {
    const ingestionService = new IngestionService(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
    const getGenerationUsage = vi
      .spyOn(ingestionService as any, "getGenerationUsage")
      .mockResolvedValue({});

    const eventRecord = await ingestionService.createEventRecord(
      {
        projectId: "project-id",
        traceId: "trace-id",
        spanId: "observation-id",
        name: "primitive-pricing-attributes",
        type: "GENERATION",
        environment: "default",
        startTimeISO: "2026-08-18T00:00:00.000Z",
        endTimeISO: "2026-08-18T00:00:01.000Z",
        modelName: "model-name",
        modelParameters: {
          service_tier: "priority",
          temperature: 0.5,
          stream: true,
          nested: { ignored: "value" },
          list: ["ignored"],
          nil: null,
        },
        metadata: {
          region: "us",
          attempts: 2,
          cached: false,
          nested: { ignored: "value" },
          list: ["ignored"],
          nil: null,
        },
        source: "otel",
      },
      "otel/project-id/raw-event.json",
    );

    expect(eventRecord.model_parameters).toEqual({
      service_tier: "priority",
      temperature: 0.5,
      stream: true,
      nested: { ignored: "value" },
      list: ["ignored"],
      nil: null,
    });
    expect(getGenerationUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        pricingMatchAttributeValues: {
          modelParameters: {
            service_tier: "priority",
            temperature: 0.5,
            stream: true,
            nested: { ignored: "value" },
            list: ["ignored"],
            nil: null,
          },
          metadata: {
            region: "us",
            attempts: 2,
            cached: false,
            nested: { ignored: "value" },
            list: ["ignored"],
            nil: null,
          },
        },
      }),
    );
  });

  it("uses only pricing attributes from the legacy event that supplies usage", async () => {
    const addToQueue = vi.fn();
    const ingestionService = new IngestionService(
      {} as any,
      {} as any,
      { addToQueue } as any,
      {} as any,
    );
    const timestamp = "2026-07-22T00:00:00.000Z";
    const input = "x".repeat(11);
    const output = "y".repeat(11);
    const metadataValue = "z".repeat(11);
    const observationEventList: ObservationEvent[] = [
      {
        id: "event-id",
        timestamp,
        type: "generation-create",
        body: {
          id: "observation-id",
          traceId: "trace-id",
          startTime: timestamp,
          input,
          output,
          metadata: {
            large: metadataValue,
            count: 2,
            enabled: false,
            nested: { ignored: "value" },
            list: ["ignored"],
            nil: null,
          },
          modelParameters: {
            service_tier: "priority",
            temperature: 0.5,
            stream: true,
            nested: { ignored: "value" },
            list: ["ignored"],
            nil: null,
          },
          environment: "default",
        },
      },
      {
        id: "update-event-id",
        timestamp: "2026-07-22T00:00:01.000Z",
        type: "generation-update",
        body: {
          id: "observation-id",
          usage: {
            input: 12,
            output: 21,
          },
          modelParameters: { service_tier: "fast" },
          metadata: { region: "eu" },
        },
      },
    ];

    vi.spyOn(ingestionService as any, "getClickhouseRecord").mockResolvedValue(
      null,
    );
    vi.spyOn(ingestionService as any, "getPrompt").mockResolvedValue(null);
    vi.spyOn(ingestionService as any, "getGenerationUsage").mockResolvedValue(
      {},
    );

    await (ingestionService as any).processObservationEventList({
      projectId: "project-id",
      entityId: "observation-id",
      createdAtTimestamp: new Date(timestamp),
      observationEventList,
      writeToStagingTables: true,
      attribution: {
        ingestionApiKey: "api-key",
        ingestionSdkName: "sdk",
        ingestionSdkVersion: "1.0.0",
      },
    });

    expect(mocks.applyObservationFieldOverflow).not.toHaveBeenCalled();
    const getGenerationUsage = vi.mocked(
      (ingestionService as any).getGenerationUsage,
    );
    expect(
      getGenerationUsage.mock.calls[0]?.[0].pricingMatchAttributeValues,
    ).toEqual({
      modelParameters: { service_tier: "fast" },
      metadata: { region: "eu" },
    });
    for (const table of [
      TableName.Observations,
      TableName.ObservationsBatchStaging,
    ]) {
      expect(
        addToQueue.mock.calls.find(
          ([queuedTable]) => queuedTable === table,
        )?.[1],
      ).toMatchObject({
        input,
        output,
        metadata: { large: metadataValue },
      });
    }
  });

  it("correctly sorts events in ascending order by timestamp", async () => {
    const firstTrace = { timestamp: 1, type: "observation-create" };
    const secondTrace = { timestamp: 1, type: "observation-update" };
    const thirdTrace = { timestamp: 3, type: "observation-update" };

    const records = [thirdTrace, secondTrace, firstTrace];

    const sortedEventList = (IngestionService as any).toTimeSortedEventList(
      records,
    );

    expect(sortedEventList).toEqual([firstTrace, secondTrace, thirdTrace]);
    expect(sortedEventList).not.toBe(records); // Ensure that the original array is not mutated
  });

  it("puts the first-arriving of tied create events last so it wins the merge", () => {
    // OTel stamps a root span's trace-create and a child span's trace update
    // with the same start time; the child arrives first and must win.
    const first = { timestamp: 1, type: "trace-create", id: "first" };
    const second = { timestamp: 1, type: "trace-create", id: "second" };

    expect(
      (IngestionService as any).toTimeSortedEventList([first, second]),
    ).toEqual([second, first]);
  });

  it("keeps the last-arriving of tied update events last so it wins the merge", () => {
    const first = { timestamp: 1, type: "trace-update", id: "first" };
    const second = { timestamp: 1, type: "trace-update", id: "second" };

    expect(
      (IngestionService as any).toTimeSortedEventList([first, second]),
    ).toEqual([first, second]);
  });

  it("orders a mixed run of tied creates and updates deterministically", () => {
    // Creates sort before updates so the update wins the merge, and among the
    // tied creates the first-arriving one sorts last.
    const firstCreate = { timestamp: 1, type: "trace-create", id: "c0" };
    const update = { timestamp: 1, type: "trace-update", id: "u1" };
    const secondCreate = { timestamp: 1, type: "trace-create", id: "c2" };

    expect(
      (IngestionService as any).toTimeSortedEventList([
        firstCreate,
        update,
        secondCreate,
      ]),
    ).toEqual([secondCreate, firstCreate, update]);
  });

  it("correctly convert Date to Clickhouse DateTime", async () => {
    const date = new Date("2024-10-12T12:13:14.123Z");

    const clickhouseDateTime = convertDateToClickhouseDateTime(date);

    expect(clickhouseDateTime).toEqual("2024-10-12 12:13:14.123");
  });

  it("keeps observation metadata values stringified after moving tool definitions to input", async () => {
    const addToQueue = vi.fn();
    const ingestionService = new IngestionService(
      {} as any,
      {} as any,
      { addToQueue } as any,
      {} as any,
    );
    const tool = {
      type: "function",
      name: "get_weather",
      description: "Get weather.",
    };
    const timestamp = "2024-10-12T12:13:14.123Z";
    const observationEventList: ObservationEvent[] = [
      {
        id: "event-id",
        timestamp,
        type: "generation-create",
        body: {
          id: "observation-id",
          traceId: "trace-id",
          startTime: timestamp,
          input: [{ role: "user", content: "Need weather" }],
          metadata: {
            attributes: {
              "ai.prompt.tools": [tool],
              "custom.attribute": "keep-me",
            },
          },
          environment: "default",
        },
      },
    ];

    vi.spyOn(ingestionService as any, "getClickhouseRecord").mockResolvedValue(
      null,
    );
    vi.spyOn(ingestionService as any, "getPrompt").mockResolvedValue(null);
    vi.spyOn(ingestionService as any, "getGenerationUsage").mockResolvedValue(
      {},
    );

    await (ingestionService as any).processObservationEventList({
      projectId: "project-id",
      entityId: "observation-id",
      createdAtTimestamp: new Date(timestamp),
      observationEventList,
      writeToStagingTables: false,
    });

    const observationRecord = addToQueue.mock.calls.find(
      ([table]) => table === TableName.Observations,
    )?.[1];

    expect(observationRecord?.metadata).toEqual({
      attributes: JSON.stringify({ "custom.attribute": "keep-me" }),
    });
  });

  it("silently rejects score batches with no valid records", async () => {
    const addToQueue = vi.fn();
    const ingestionService = new IngestionService(
      {} as any,
      {} as any,
      { addToQueue } as any,
      {} as any,
    );
    const timestamp = "2024-10-12T12:13:14.123Z";
    const scoreEventList: ScoreEventType[] = [
      {
        id: "event-id",
        timestamp,
        type: "score-create",
        body: {
          id: "score-id",
          dataType: "NUMERIC",
          name: "invalid-score",
          value: "not-a-number",
          source: "API",
          traceId: "trace-id",
          environment: "default",
        },
      },
    ];

    vi.spyOn(ingestionService as any, "getClickhouseRecord").mockResolvedValue(
      null,
    );

    await expect(
      (ingestionService as any).processScoreEventList({
        projectId: "project-id",
        entityId: "score-id",
        createdAtTimestamp: new Date(timestamp),
        scoreEventList,
        attribution: {
          ingestionApiKey: "pk-lf-unit-test",
          ingestionSdkName: "langfuse-test",
          ingestionSdkVersion: "0.0.0",
        },
      }),
    ).resolves.toBeUndefined();

    expect(addToQueue).not.toHaveBeenCalled();
  });

  it("persists evaluator identifiers after the score JSON round-trip", async () => {
    const addToQueue = vi.fn();
    const ingestionService = new IngestionService(
      {} as any,
      {} as any,
      { addToQueue } as any,
      {} as any,
    );
    const timestamp = "2024-10-12T12:13:14.123Z";

    vi.spyOn(ingestionService as any, "getClickhouseRecord").mockResolvedValue(
      null,
    );
    const scoreEvent = JSON.parse(
      JSON.stringify({
        id: "event-id",
        timestamp,
        type: "score-create",
        body: {
          id: "score-id",
          dataType: "NUMERIC",
          name: "quality",
          value: 1,
          source: "EVAL",
          traceId: "trace-id",
          environment: "default",
          metadata: {
            job_execution_id: "job-1",
            evaluator_id: "legacy-evaluator-1",
            evaluation_rule_id: "legacy-rule-1",
            job_configuration_id: "legacy-job-configuration-1",
            evaluator_test: "true",
          },
          evaluatorId: "evaluator-1",
          evaluationRuleId: "rule-1",
        },
      }),
    ) as ScoreEventType;

    await (ingestionService as any).processScoreEventList({
      projectId: "project-id",
      entityId: "score-id",
      createdAtTimestamp: new Date(timestamp),
      scoreEventList: [scoreEvent],
      attribution: {
        ingestionApiKey: "pk-lf-unit-test",
        ingestionSdkName: "langfuse-test",
        ingestionSdkVersion: "0.0.0",
      },
    });

    expect(addToQueue).toHaveBeenCalledWith(
      TableName.Scores,
      expect.objectContaining({
        evaluator_id: "evaluator-1",
        evaluation_rule_id: "rule-1",
        metadata: {
          job_execution_id: "job-1",
          evaluator_id: "legacy-evaluator-1",
          evaluation_rule_id: "legacy-rule-1",
          job_configuration_id: "legacy-job-configuration-1",
          evaluator_test: "true",
        },
      }),
    );
  });

  it("keeps legacy score metadata for ClickHouse defaults", async () => {
    const addToQueue = vi.fn();
    const ingestionService = new IngestionService(
      {} as any,
      {} as any,
      { addToQueue } as any,
      {} as any,
    );
    const timestamp = "2024-10-12T12:13:14.123Z";

    vi.spyOn(ingestionService as any, "getClickhouseRecord").mockResolvedValue(
      null,
    );

    await (ingestionService as any).processScoreEventList({
      projectId: "project-id",
      entityId: "score-id",
      createdAtTimestamp: new Date(timestamp),
      scoreEventList: [
        {
          id: "event-id",
          timestamp,
          type: "score-create",
          body: {
            id: "score-id",
            dataType: "NUMERIC",
            name: "quality",
            value: 1,
            source: "EVAL",
            traceId: "trace-id",
            environment: "default",
            metadata: {
              job_execution_id: "job-1",
              evaluator_id: "evaluator-1",
              job_configuration_id: "legacy-rule-1",
              evaluator_test: "true",
            },
          },
        },
      ] satisfies ScoreEventType[],
      attribution: {
        ingestionApiKey: "pk-lf-unit-test",
        ingestionSdkName: "langfuse-test",
        ingestionSdkVersion: "0.0.0",
      },
    });

    expect(addToQueue).toHaveBeenCalledWith(
      TableName.Scores,
      expect.objectContaining({
        evaluator_id: undefined,
        evaluation_rule_id: undefined,
        metadata: {
          job_execution_id: "job-1",
          evaluator_id: "evaluator-1",
          job_configuration_id: "legacy-rule-1",
          evaluator_test: "true",
        },
      }),
    );
  });

  it("preserves evaluator identifiers when a later score update omits them", async () => {
    const addToQueue = vi.fn();
    const ingestionService = new IngestionService(
      {} as any,
      {} as any,
      { addToQueue } as any,
      {} as any,
    );
    const timestamp = "2024-10-12T12:13:14.123Z";

    vi.spyOn(ingestionService as any, "getClickhouseRecord").mockResolvedValue({
      ...createTraceScore({
        id: "score-id",
        project_id: "project-id",
        trace_id: "trace-id",
        timestamp: new Date(timestamp).getTime(),
      }),
      evaluator_id: "evaluator-1",
      evaluation_rule_id: "rule-1",
    });

    await (ingestionService as any).processScoreEventList({
      projectId: "project-id",
      entityId: "score-id",
      createdAtTimestamp: new Date(timestamp),
      scoreEventList: [
        {
          id: "event-id",
          timestamp,
          type: "score-update",
          body: {
            id: "score-id",
            comment: "updated",
          },
        } as ScoreEventType,
      ],
      attribution: {
        ingestionApiKey: "pk-lf-unit-test",
        ingestionSdkName: "langfuse-test",
        ingestionSdkVersion: "0.0.0",
      },
    });

    expect(addToQueue).toHaveBeenCalledWith(
      TableName.Scores,
      expect.objectContaining({
        evaluator_id: "evaluator-1",
        evaluation_rule_id: "rule-1",
      }),
    );
  });

  it("does not silently reject score batches with unexpected record errors", async () => {
    const addToQueue = vi.fn();
    const ingestionService = new IngestionService(
      {} as any,
      {} as any,
      { addToQueue } as any,
      {} as any,
    );
    const timestamp = "2024-10-12T12:13:14.123Z";
    const scoreEventList: ScoreEventType[] = [
      {
        id: "event-id",
        timestamp,
        type: "score-create",
        body: {
          id: "score-id",
          dataType: "NUMERIC",
          name: "valid-score",
          value: 1,
          source: "API",
          traceId: "trace-id",
          environment: "default",
        },
      },
    ];

    vi.spyOn(ingestionService as any, "getClickhouseRecord").mockResolvedValue(
      null,
    );
    mocks.validateAndInflateScoreOverride = () => {
      throw new Error("unexpected score validation failure");
    };

    await expect(
      (ingestionService as any).processScoreEventList({
        projectId: "project-id",
        entityId: "score-id",
        createdAtTimestamp: new Date(timestamp),
        scoreEventList,
        attribution: {
          ingestionApiKey: "pk-lf-unit-test",
          ingestionSdkName: "langfuse-test",
          ingestionSdkVersion: "0.0.0",
        },
      }),
    ).rejects.toThrow("Unexpected error(s) validating score batch");

    expect(addToQueue).not.toHaveBeenCalled();
  });

  it("propagates unexpected score errors even when a ClickHouse score exists", async () => {
    const addToQueue = vi.fn();
    const ingestionService = new IngestionService(
      {} as any,
      {} as any,
      { addToQueue } as any,
      {} as any,
    );
    const timestamp = "2024-10-12T12:13:14.123Z";
    const scoreEventList: ScoreEventType[] = [
      {
        id: "event-id",
        timestamp,
        type: "score-update",
        body: {
          id: "score-id",
          dataType: "NUMERIC",
          name: "valid-score",
          value: 1,
          source: "API",
          traceId: "trace-id",
          environment: "default",
        },
      },
    ];

    vi.spyOn(ingestionService as any, "getClickhouseRecord").mockResolvedValue(
      createTraceScore({
        id: "score-id",
        project_id: "project-id",
        trace_id: "trace-id",
        timestamp: new Date(timestamp).getTime(),
      }),
    );
    mocks.validateAndInflateScoreOverride = () => {
      throw new Error("unexpected score validation failure");
    };

    await expect(
      (ingestionService as any).processScoreEventList({
        projectId: "project-id",
        entityId: "score-id",
        createdAtTimestamp: new Date(timestamp),
        scoreEventList,
        attribution: {
          ingestionApiKey: "pk-lf-unit-test",
          ingestionSdkName: "langfuse-test",
          ingestionSdkVersion: "0.0.0",
        },
      }),
    ).rejects.toThrow("Unexpected error(s) validating score batch");

    expect(addToQueue).not.toHaveBeenCalled();
  });

  it("keeps the last-arriving event when score events share a timestamp", async () => {
    // Re-sending the full score with the same id, name, and timestamp is the
    // documented way to overwrite it, so the events tie on timestamp and
    // arrival order has to decide the winner.
    const timestamp = "2026-08-31T12:00:00.000Z";
    const buildEvent = (id: string, value: string): ScoreEventType => ({
      id,
      timestamp,
      type: "score-create",
      body: {
        id: "score-id",
        name: "quality",
        dataType: "TEXT",
        source: "API",
        sessionId: "session-id",
        environment: "default",
        value,
      },
    });
    const first = buildEvent("event-first", "first");
    const second = buildEvent("event-second", "second");

    const mergeAndReadValue = async (events: ScoreEventType[]) => {
      const addToQueue = vi.fn();
      const ingestionService = new IngestionService(
        {} as any,
        {} as any,
        { addToQueue } as any,
        {} as any,
      );
      vi.spyOn(
        ingestionService as any,
        "getClickhouseRecord",
      ).mockResolvedValue(null);

      await ingestionService.mergeAndWrite({
        eventType: "score",
        projectId: "project-id",
        entityId: "score-id",
        createdAtTimestamp: new Date(timestamp),
        events,
        forwardToEventsTable: false,
        attribution: {
          ingestionApiKey: "pk-lf-unit-test",
          ingestionSdkName: "langfuse-test",
          ingestionSdkVersion: "0.0.0",
        },
      });

      expect(addToQueue).toHaveBeenCalledWith(
        TableName.Scores,
        expect.anything(),
      );
      return addToQueue.mock.calls[0]?.[1].string_value;
    };

    for (const events of [
      [first, second],
      [second, first],
    ]) {
      await expect(
        mergeAndReadValue(events),
        `arrival order ${events.map((e) => e.id).join(", ")}`,
      ).resolves.toBe(events.at(-1)?.body.value);
    }
  });
});
