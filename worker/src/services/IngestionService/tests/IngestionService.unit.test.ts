import { beforeEach, expect, describe, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  validateAndInflateScoreOverride: undefined as
    | ((...args: unknown[]) => unknown)
    | undefined,
}));

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

    ingestionService.writeEventRecord(eventRecord);

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
