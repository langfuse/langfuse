import { expect, describe, it, vi } from "vitest";
import { IngestionService } from "../../IngestionService";
import {
  convertDateToClickhouseDateTime,
  type InternalTraceEventInput,
  type ObservationEvent,
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

  it("adds ingestion attribution to observation records", async () => {
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
      writeToStagingTables: false,
      attribution: {
        ingestionApiKey: "pk-lf-public",
        ingestionSdkName: "python",
        ingestionSdkVersion: "3.4.0",
      },
    });

    const observationRecord = addToQueue.mock.calls.find(
      ([table]) => table === TableName.Observations,
    )?.[1];

    expect(observationRecord).toMatchObject({
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
