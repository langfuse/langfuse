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
