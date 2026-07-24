import { expect, describe, it, vi } from "vitest";
import { IngestionService } from "../../IngestionService";
import {
  convertDateToClickhouseDateTime,
  createTraceScore,
  type ObservationEvent,
  type ScoreEventType,
} from "@langfuse/shared/src/server";
import { TableName } from "../../ClickhouseWriter";

describe("IngestionService unit tests", () => {
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

  it("spills only the persisted event copy and preserves the enriched record", async () => {
    const addToQueue = vi.fn();
    const fieldSpillProcessor = vi.fn().mockResolvedValue({
      fields: {
        input:
          "@@@langfuseMedia:type=text/plain|id=input-media|source=field_size_limit@@@",
        output: "original output",
        metadata: [
          "small",
          "@@@langfuseMedia:type=text/plain|id=metadata-media|source=field_size_limit@@@",
        ],
      },
      outcomes: [],
    });
    const ingestionService = new IngestionService(
      {} as any,
      {} as any,
      { addToQueue } as any,
      {} as any,
      fieldSpillProcessor,
    );
    const eventRecord = await ingestionService.createEventRecord(
      {
        projectId: "project-id",
        traceId: "trace-id",
        spanId: "observation-id",
        parentSpanId: "",
        name: "spill-copy",
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

    await ingestionService.writeEventRecord(eventRecord);

    expect(fieldSpillProcessor).toHaveBeenCalledWith({
      projectId: "project-id",
      traceId: "trace-id",
      observationId: "observation-id",
      fields: {
        input: "original input",
        output: "original output",
        metadata: ["small", "large"],
      },
    });
    expect(eventRecord.input).toBe("original input");
    expect(eventRecord.metadata_names).toEqual(["keep", "large.nested"]);
    expect(addToQueue).toHaveBeenCalledOnce();
    expect(addToQueue.mock.calls[0]?.[1]).toMatchObject({
      input: expect.stringContaining("input-media"),
      metadata_names: ["keep", "large.nested"],
      metadata_values: ["small", expect.stringContaining("metadata-media")],
    });
  });

  it("preserves usage for a previously spilled field during tokenization", async () => {
    const ingestionService = new IngestionService(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    const result = await (ingestionService as any).getUsageUnits(
      {
        id: "observation-id",
        level: "DEFAULT",
        input:
          "@@@langfuseMedia:type=text/plain|id=input-media|source=field_size_limit@@@",
        output: "new output",
        provided_usage_details: {},
        usage_details: { input: 123 },
      },
      {
        id: "model-id",
        tokenizerId: "openai",
        tokenizerConfig: { tokenizerModel: "gpt-4o" },
      },
    );

    expect(result.usage_details.input).toBe(123);
    expect(result.usage_details.output).toBeGreaterThan(0);
    expect(result.usage_details.total).toBe(
      result.usage_details.input + result.usage_details.output,
    );
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
    vi.spyOn(
      ingestionService as any,
      "getMillisecondTimestamp",
    ).mockImplementation(() => {
      throw new Error("unexpected timestamp failure");
    });

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
    vi.spyOn(
      ingestionService as any,
      "getMillisecondTimestamp",
    ).mockImplementation(() => {
      throw new Error("unexpected timestamp failure");
    });

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
});
