import { expect, describe, it, vi } from "vitest";
import { IngestionService } from "../../IngestionService";
import { ScoreSourceEnum } from "@langfuse/shared";
import {
  convertDateToClickhouseDateTime,
  createObservation,
  createTrace,
  createTraceScore,
  UNKNOWN_INGESTION_SDK_VALUE,
  type InternalTraceEventInput,
  type ObservationEvent,
  type ScoreEventType,
  type TraceEventType,
} from "@langfuse/shared/src/server";
import { TableName } from "../../ClickhouseWriter";

describe("IngestionService unit tests", () => {
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

  it("adds ingestion attribution to observation staging records only", async () => {
    const addToQueue = vi.fn();
    const ingestionService = new IngestionService(
      {} as any,
      {} as any,
      { addToQueue } as any,
      {} as any,
    );
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
      writeToStagingTables: true,
      attribution: {
        ingestionApiKey: "pk-lf-public",
        ingestionSdkName: "python",
        ingestionSdkVersion: "3.4.0",
      },
    });

    const observationRecord = addToQueue.mock.calls.find(
      ([table]) => table === TableName.Observations,
    )?.[1];
    const stagingRecord = addToQueue.mock.calls.find(
      ([table]) => table === TableName.ObservationsBatchStaging,
    )?.[1];

    expect(observationRecord).not.toHaveProperty("ingestion_api_key");
    expect(observationRecord).not.toHaveProperty("ingestion_sdk_name");
    expect(observationRecord).not.toHaveProperty("ingestion_sdk_version");
    expect(stagingRecord).toMatchObject({
      ingestion_api_key: "pk-lf-public",
      ingestion_sdk_name: "python",
      ingestion_sdk_version: "3.4.0",
    });
  });

  it("stores unknown SDK attribution on observation staging records", async () => {
    const addToQueue = vi.fn();
    const ingestionService = new IngestionService(
      {} as any,
      {} as any,
      { addToQueue } as any,
      {} as any,
    );
    const timestamp = "2024-10-12T12:13:14.123Z";
    const existingObservation = createObservation({
      id: "observation-id",
      trace_id: "trace-id",
      project_id: "project-id",
      start_time: new Date(timestamp).getTime(),
    });
    const observationEventList: ObservationEvent[] = [
      {
        id: "event-id",
        timestamp,
        type: "generation-update",
        body: {
          id: "observation-id",
          traceId: "trace-id",
          startTime: timestamp,
          name: "updated-generation",
          environment: "default",
        },
      },
    ];

    vi.spyOn(ingestionService as any, "getClickhouseRecord").mockResolvedValue(
      existingObservation,
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
        ingestionApiKey: "pk-lf-update",
        ingestionSdkName: UNKNOWN_INGESTION_SDK_VALUE,
        ingestionSdkVersion: UNKNOWN_INGESTION_SDK_VALUE,
      },
    });

    const observationRecord = addToQueue.mock.calls.find(
      ([table]) => table === TableName.Observations,
    )?.[1];
    const stagingRecord = addToQueue.mock.calls.find(
      ([table]) => table === TableName.ObservationsBatchStaging,
    )?.[1];

    expect(observationRecord).not.toHaveProperty("ingestion_api_key");
    expect(observationRecord).not.toHaveProperty("ingestion_sdk_name");
    expect(observationRecord).not.toHaveProperty("ingestion_sdk_version");
    expect(stagingRecord).toMatchObject({
      ingestion_api_key: "pk-lf-update",
      ingestion_sdk_name: UNKNOWN_INGESTION_SDK_VALUE,
      ingestion_sdk_version: UNKNOWN_INGESTION_SDK_VALUE,
    });
  });

  it("preserves existing score SDK attribution when incoming attribution lacks SDK headers", async () => {
    const addToQueue = vi.fn();
    const ingestionService = new IngestionService(
      {} as any,
      {} as any,
      { addToQueue } as any,
      {} as any,
    );
    const timestamp = "2024-10-12T12:13:14.123Z";
    const existingScore = createTraceScore({
      id: "score-id",
      project_id: "project-id",
      trace_id: "trace-id",
      timestamp: new Date(timestamp).getTime(),
      ingestion_api_key: "pk-lf-original",
      ingestion_sdk_name: "python",
      ingestion_sdk_version: "3.4.0",
    });
    const scoreEventList: ScoreEventType[] = [
      {
        id: "event-id",
        timestamp,
        type: "score-create",
        body: {
          id: "score-id",
          traceId: "trace-id",
          name: "quality",
          value: 1,
          dataType: "NUMERIC",
          source: ScoreSourceEnum.API,
          environment: "default",
        },
      },
    ];

    vi.spyOn(ingestionService as any, "getClickhouseRecord").mockResolvedValue(
      existingScore,
    );

    await (ingestionService as any).processScoreEventList({
      projectId: "project-id",
      entityId: "score-id",
      createdAtTimestamp: new Date(timestamp),
      scoreEventList,
      attribution: {
        ingestionApiKey: "pk-lf-update",
        ingestionSdkName: UNKNOWN_INGESTION_SDK_VALUE,
        ingestionSdkVersion: UNKNOWN_INGESTION_SDK_VALUE,
      },
    });

    const scoreRecord = addToQueue.mock.calls.find(
      ([table]) => table === TableName.Scores,
    )?.[1];

    expect(scoreRecord).toMatchObject({
      ingestion_api_key: "pk-lf-update",
      ingestion_sdk_name: "python",
      ingestion_sdk_version: "3.4.0",
    });
  });

  it("adds ingestion attribution to trace staging records", async () => {
    const addToQueue = vi.fn();
    const ingestionService = new IngestionService(
      {} as any,
      {} as any,
      { addToQueue } as any,
      {} as any,
    );
    const timestamp = "2024-10-12T12:13:14.123Z";
    const existingTrace = createTrace({
      id: "trace-id",
      project_id: "project-id",
      timestamp: new Date(timestamp).getTime(),
      session_id: null,
    });
    const traceEventList: TraceEventType[] = [
      {
        id: "event-id",
        timestamp,
        type: "trace-update",
        body: {
          id: "trace-id",
          timestamp,
          name: "updated-trace",
          environment: "default",
        },
      },
    ];

    vi.spyOn(ingestionService as any, "getClickhouseRecord").mockResolvedValue(
      existingTrace,
    );

    await (ingestionService as any).processTraceEventList({
      projectId: "project-id",
      entityId: "trace-id",
      createdAtTimestamp: new Date(timestamp),
      traceEventList,
      createEventTraceRecord: true,
      attribution: {
        ingestionApiKey: "pk-lf-public",
        ingestionSdkName: "python",
        ingestionSdkVersion: "3.4.0",
      },
    });

    const stagingRecord = addToQueue.mock.calls.find(
      ([table]) => table === TableName.ObservationsBatchStaging,
    )?.[1];

    expect(stagingRecord).toMatchObject({
      ingestion_api_key: "pk-lf-public",
      ingestion_sdk_name: "python",
      ingestion_sdk_version: "3.4.0",
    });
  });

  it("adds ingestion attribution to events records", async () => {
    const ingestionService = new IngestionService(
      {} as any,
      {} as any,
      { addToQueue: vi.fn() } as any,
      {} as any,
    );
    const timestamp = "2024-10-12T12:13:14.123Z";
    const eventInput: InternalTraceEventInput = {
      projectId: "project-id",
      traceId: "trace-id",
      spanId: "span-id",
      startTimeISO: timestamp,
      endTimeISO: timestamp,
      metadata: {},
      source: "otel",
      ingestionApiKey: "pk-lf-public",
      ingestionSdkName: "python",
      ingestionSdkVersion: "3.4.0",
    };

    const eventRecord = await ingestionService.createEventRecord(
      eventInput,
      "events/trace-id/span-id.json",
    );

    expect(eventRecord).toMatchObject({
      ingestion_api_key: "pk-lf-public",
      ingestion_sdk_name: "python",
      ingestion_sdk_version: "3.4.0",
    });
  });
});
