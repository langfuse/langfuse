import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Readable } from "node:stream";

import * as serverExports from "@langfuse/shared/src/server";
import type { NativeEventBlock } from "@langfuse/native";
import type { PreparedEvent } from "@langfuse/native";

import { env } from "../../env";
import { logger } from "@langfuse/shared/src/server";
import { ClickhouseWriter, TableName } from "../ClickhouseWriter";
import {
  clampDecimal64Map,
  clampDecimal64Value,
  truncateOversizedRecord,
} from "./jsonRecords";

const { encodeClickhouseEventsMock } = vi.hoisted(() => ({
  encodeClickhouseEventsMock: vi.fn(),
}));

vi.mock("@langfuse/native", () => ({
  encodeClickhouseEvents: encodeClickhouseEventsMock,
}));

const preparedEvent = (id: string): PreparedEvent =>
  ({
    ids: {
      project_id: "project-1",
      trace_id: "trace-1",
      id,
    },
  }) as PreparedEvent;

// Mock recordHistogram, recordDistribution, recordCount, recordGauge
vi.mock("@langfuse/shared/src/server", async (importOriginal) => {
  const original = (await importOriginal()) as {};
  return {
    ...original,
    recordHistogram: vi.fn(),
    recordDistribution: vi.fn(),
    recordIncrement: vi.fn(),
    recordCount: vi.fn(),
    recordGauge: vi.fn(),
    logger: {
      info: vi.fn(),
      debug: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      child: vi.fn().mockReturnThis(),
    },
  };
});

vi.mock("../../env", async (importOriginal) => {
  const original = (await importOriginal()) as {};
  return {
    ...original,
    env: {
      LANGFUSE_INGESTION_CLICKHOUSE_WRITE_BATCH_SIZE: 100,
      LANGFUSE_INGESTION_CLICKHOUSE_WRITE_INTERVAL_MS: 5000,
      LANGFUSE_INGESTION_CLICKHOUSE_MAX_ATTEMPTS: 3,
    },
  };
});

describe("ClickhouseWriter", () => {
  let clickhouseClientMock: {
    insert: ReturnType<typeof vi.fn>;
    exec: ReturnType<typeof vi.fn>;
  };
  let writer: ClickhouseWriter;

  beforeEach(() => {
    vi.clearAllMocks();
    encodeClickhouseEventsMock.mockResolvedValue([
      { bytes: Buffer.from("native-block"), rowCount: 1 },
    ] satisfies NativeEventBlock[]);
    clickhouseClientMock = {
      insert: vi.fn(),
      exec: vi.fn(),
    };
    vi.useFakeTimers();
    writer = ClickhouseWriter.getInstance(clickhouseClientMock);
  });

  afterEach(async () => {
    vi.useRealTimers();

    await ClickhouseWriter.shutdownAll();
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it("should be a singleton", () => {
    const instance1 = ClickhouseWriter.getInstance();
    const instance2 = ClickhouseWriter.getInstance();

    expect(instance1).toBe(instance2);
  });

  it("uses a replacement client only for the selected singleton", async () => {
    const jsonReplacementClient = {
      insert: vi.fn().mockResolvedValue(),
      exec: vi.fn(),
    };
    const nativeReplacementClient = {
      insert: vi.fn(),
      exec: vi.fn().mockResolvedValue({ stream: Readable.from([]) }),
    };
    const nativeWriter =
      ClickhouseWriter.getNativeInstance(clickhouseClientMock);
    vi.spyOn(clickhouseClientMock, "exec").mockResolvedValue({
      stream: Readable.from([]),
    });

    expect(ClickhouseWriter.getInstance(jsonReplacementClient)).toBe(writer);
    writer.addToQueue(TableName.Traces, { id: "1", name: "test" });
    nativeWriter.addToQueue(TableName.EventsFull, preparedEvent("native-1"));
    await Promise.all([
      writer["flushAll"](true),
      nativeWriter["flushAll"](true),
    ]);

    expect(jsonReplacementClient.insert).toHaveBeenCalledTimes(1);
    expect(jsonReplacementClient.exec).not.toHaveBeenCalled();
    expect(clickhouseClientMock.insert).not.toHaveBeenCalled();
    expect(clickhouseClientMock.exec).toHaveBeenCalledTimes(1);

    expect(ClickhouseWriter.getNativeInstance(nativeReplacementClient)).toBe(
      nativeWriter,
    );
    writer.addToQueue(TableName.Traces, { id: "2", name: "test" });
    nativeWriter.addToQueue(TableName.EventsFull, preparedEvent("native-2"));
    await Promise.all([
      writer["flushAll"](true),
      nativeWriter["flushAll"](true),
    ]);

    expect(jsonReplacementClient.insert).toHaveBeenCalledTimes(2);
    expect(jsonReplacementClient.exec).not.toHaveBeenCalled();
    expect(nativeReplacementClient.exec).toHaveBeenCalledTimes(1);
    expect(nativeReplacementClient.insert).not.toHaveBeenCalled();
    expect(clickhouseClientMock.insert).not.toHaveBeenCalled();
    expect(clickhouseClientMock.exec).toHaveBeenCalledTimes(1);
    expect(writer["queue"][TableName.Traces]).toHaveLength(0);
    expect(nativeWriter["queue"][TableName.EventsFull]).toHaveLength(0);
  });

  it("keeps JSON and Native writers as separate singletons", () => {
    const nativeWriter =
      ClickhouseWriter.getNativeInstance(clickhouseClientMock);

    expect(nativeWriter).not.toBe(writer);
    expect(ClickhouseWriter.getInstance()).toBe(writer);
    expect(ClickhouseWriter.getNativeInstance()).toBe(nativeWriter);
    expect(logger.child).toHaveBeenNthCalledWith(1, { format: "json" });
    expect(logger.child).toHaveBeenNthCalledWith(2, { format: "native" });

    expect(() =>
      nativeWriter.addToQueue(TableName.Traces, {} as never),
    ).toThrow("Native ClickHouse writer only accepts events_full");
  });

  it("should initialize with correct values", () => {
    expect(writer.batchSize).toBe(
      env.LANGFUSE_INGESTION_CLICKHOUSE_WRITE_BATCH_SIZE,
    );
    expect(writer.writeInterval).toBe(
      env.LANGFUSE_INGESTION_CLICKHOUSE_WRITE_INTERVAL_MS,
    );
    expect(writer.maxAttempts).toBe(
      env.LANGFUSE_INGESTION_CLICKHOUSE_MAX_ATTEMPTS,
    );
  });

  it("should add items to the queue", () => {
    const traceData = { id: "1", name: "test" };
    writer.addToQueue(TableName.Traces, traceData as any);

    expect(writer["queue"][TableName.Traces]).toHaveLength(1);
    expect(writer["queue"][TableName.Traces][0].data).toEqual(traceData);
  });

  it("should flush when queue reaches batch size", async () => {
    const mockInsert = vi
      .spyOn(clickhouseClientMock, "insert")
      .mockResolvedValue();

    for (let i = 0; i < writer.batchSize; i++) {
      writer.addToQueue(TableName.Traces, { id: `${i}`, name: "test" } as any);
    }

    await vi.advanceTimersByTimeAsync(writer.writeInterval);

    expect(mockInsert).toHaveBeenCalledTimes(1);
    expect(writer["queue"][TableName.Traces]).toHaveLength(0);
  });

  it("should flush at regular intervals", async () => {
    const mockInsert = vi
      .spyOn(clickhouseClientMock, "insert")
      .mockResolvedValue();
    writer.addToQueue(TableName.Traces, { id: "1", name: "test" });

    await vi.advanceTimersByTimeAsync(writer.writeInterval);

    expect(mockInsert).toHaveBeenCalledTimes(1);
  });

  it("writes events_full rows through the JSON singleton", async () => {
    const mockInsert = vi
      .spyOn(clickhouseClientMock, "insert")
      .mockResolvedValue();
    const event = {
      id: "event-1",
      project_id: "project-1",
      trace_id: "trace-1",
    };

    writer.addToQueue(TableName.EventsFull, event as any);
    await writer["flushAll"](true);

    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        table: TableName.EventsFull,
        format: "JSONEachRow",
        values: [event],
      }),
    );
    expect(clickhouseClientMock.exec).not.toHaveBeenCalled();
  });

  it("encodes a selected Native batch once and reuses its bytes on a transport retry", async () => {
    const event = preparedEvent("event-1");
    const bytes = Buffer.from("native-block");
    encodeClickhouseEventsMock.mockResolvedValueOnce([
      { bytes, rowCount: 1 },
    ] satisfies NativeEventBlock[]);
    const responseStream = Readable.from([]);
    const streamedBuffers: Buffer[] = [];
    const mockExec = vi
      .spyOn(clickhouseClientMock, "exec")
      .mockImplementationOnce(async ({ values }) => {
        for await (const chunk of values as Readable) {
          streamedBuffers.push(chunk as Buffer);
        }
        throw new Error("Timeout error.");
      })
      .mockImplementationOnce(async ({ values }) => {
        for await (const chunk of values as Readable) {
          streamedBuffers.push(chunk as Buffer);
        }
        return { stream: responseStream };
      });

    const nativeWriter =
      ClickhouseWriter.getNativeInstance(clickhouseClientMock);
    nativeWriter.addToQueue(TableName.EventsFull, event);
    await vi.advanceTimersByTimeAsync(nativeWriter.writeInterval);
    await vi.advanceTimersByTimeAsync(200);

    expect(encodeClickhouseEventsMock).toHaveBeenCalledTimes(1);
    expect(encodeClickhouseEventsMock).toHaveBeenCalledWith([event], 1);
    expect(mockExec).toHaveBeenCalledTimes(2);
    expect(mockExec.mock.calls[0][0]).toMatchObject({
      query: "INSERT INTO events_full FORMAT Native",
      clickhouse_settings: { wait_end_of_query: 1 },
    });
    expect(
      JSON.parse(mockExec.mock.calls[0][0].clickhouse_settings.log_comment),
    ).toMatchObject({
      surface: "worker",
      route: "clickhouse-writer",
      projectId: "MULTI_PROJECT",
    });
    expect(mockExec.mock.calls[1][0]).toMatchObject({
      query: "INSERT INTO events_full FORMAT Native",
    });
    expect(mockExec.mock.calls[0][0].values).not.toBe(
      mockExec.mock.calls[1][0].values,
    );
    expect(streamedBuffers).toHaveLength(2);
    expect(streamedBuffers[0]).toBe(bytes);
    expect(streamedBuffers[1]).toBe(bytes);
    expect(responseStream.readableEnded).toBe(true);
    expect(nativeWriter["queue"][TableName.EventsFull]).toHaveLength(0);
  });

  it("requeues the prepared event after a failed flush and encodes it again later", async () => {
    const event = preparedEvent("event-1");
    const mockExec = vi
      .spyOn(clickhouseClientMock, "exec")
      .mockRejectedValueOnce(new Error("permanent insert error"))
      .mockResolvedValueOnce({ stream: Readable.from([]) });
    const nativeWriter =
      ClickhouseWriter.getNativeInstance(clickhouseClientMock);

    nativeWriter.addToQueue(TableName.EventsFull, event);
    await nativeWriter["flushAll"](true);

    expect(clickhouseClientMock.insert).not.toHaveBeenCalled();
    expect(nativeWriter["queue"][TableName.EventsFull]).toHaveLength(1);
    expect(nativeWriter["queue"][TableName.EventsFull][0].data).toBe(event);
    expect(nativeWriter["queue"][TableName.EventsFull][0].attempts).toBe(2);
    expect(encodeClickhouseEventsMock).toHaveBeenCalledTimes(1);

    await nativeWriter["flushAll"](true);

    expect(mockExec).toHaveBeenCalledTimes(2);
    expect(encodeClickhouseEventsMock).toHaveBeenCalledTimes(2);
    expect(nativeWriter["queue"][TableName.EventsFull]).toHaveLength(0);
  });

  it("requeues Native rows when the response stream fails while draining", async () => {
    const event = preparedEvent("event-1");
    const streamError = new Error("response stream failed");
    const responseStream = new Readable({
      read() {
        this.destroy(streamError);
      },
    });
    const mockExec = vi
      .spyOn(clickhouseClientMock, "exec")
      .mockResolvedValue({ stream: responseStream });
    const nativeWriter =
      ClickhouseWriter.getNativeInstance(clickhouseClientMock);

    nativeWriter.addToQueue(TableName.EventsFull, event);
    await nativeWriter["flushAll"](true);

    expect(mockExec).toHaveBeenCalledTimes(1);
    expect(nativeWriter["queue"][TableName.EventsFull][0].data).toBe(event);
    expect(nativeWriter["queue"][TableName.EventsFull][0].attempts).toBe(2);
    const flushError = vi
      .mocked(logger.error)
      .mock.calls.find(
        ([message]) =>
          message === `ClickhouseWriter.flush ${TableName.EventsFull}`,
      )?.[1];
    expect(flushError).toBe(streamError);
  });

  it("requeues Native rows when ClickHouse returns exception text", async () => {
    const event = preparedEvent("event-1");
    const exceptionText = "Code: 60. DB::Exception: Table '表🔥' doesn't exist";
    const paddedException = `${exceptionText}${"x".repeat(4095 - exceptionText.length)}🔥`;
    const responseBytes = Buffer.from(
      `${paddedException}${"x".repeat(10_000)}`,
    );
    const splitOffset =
      Buffer.byteLength("Code: 60. DB::Exception: Table '") + 1;
    // Split inside both the three-byte character and the four-byte emoji.
    const responseStream = Readable.from([
      responseBytes.subarray(0, splitOffset),
      responseBytes.subarray(splitOffset, splitOffset + 3),
      responseBytes.subarray(splitOffset + 3),
    ]);
    vi.spyOn(clickhouseClientMock, "exec").mockResolvedValue({
      stream: responseStream,
    });
    const nativeWriter =
      ClickhouseWriter.getNativeInstance(clickhouseClientMock);

    nativeWriter.addToQueue(TableName.EventsFull, event);
    await nativeWriter["flushAll"](true);

    expect(nativeWriter["queue"][TableName.EventsFull][0].data).toBe(event);
    expect(nativeWriter["queue"][TableName.EventsFull][0].attempts).toBe(2);
    expect(responseStream.readableEnded).toBe(true);

    const flushError = vi
      .mocked(logger.error)
      .mock.calls.find(
        ([message]) =>
          message === `ClickhouseWriter.flush ${TableName.EventsFull}`,
      )?.[1] as Error;
    expect(flushError.message).toContain(exceptionText);
    expect(flushError.message.length).toBeLessThanOrEqual(4200);
    expect(flushError.message).not.toMatch(/[\uD800-\uDBFF]$/);
  });

  it("batches prepared Native rows into one encoder invocation", async () => {
    const nativeWriter =
      ClickhouseWriter.getNativeInstance(clickhouseClientMock);
    nativeWriter.batchSize = 3;
    const firstEvent = preparedEvent("event-1");
    const secondEvent = preparedEvent("event-2");
    const bytes = Buffer.from("combined");
    encodeClickhouseEventsMock.mockResolvedValueOnce([
      { bytes, rowCount: 2 },
    ] satisfies NativeEventBlock[]);
    const mockExec = vi.spyOn(clickhouseClientMock, "exec").mockResolvedValue({
      stream: Readable.from([]),
    });

    nativeWriter.addToQueue(TableName.EventsFull, firstEvent);
    nativeWriter.addToQueue(TableName.EventsFull, secondEvent);
    await nativeWriter["flushAll"](true);

    expect(encodeClickhouseEventsMock).toHaveBeenCalledTimes(1);
    expect(encodeClickhouseEventsMock).toHaveBeenCalledWith(
      [firstEvent, secondEvent],
      2,
    );
    expect(mockExec).toHaveBeenCalledTimes(1);
    const request = mockExec.mock.calls[0][0];
    const streamed: Buffer[] = [];
    for await (const chunk of request.values as Readable) {
      streamed.push(chunk as Buffer);
    }
    expect(streamed).toEqual([bytes]);
    expect(streamed[0]).toBe(bytes);
    expect(nativeWriter["queue"][TableName.EventsFull]).toHaveLength(0);
  });

  it("counts prepared rows and logs their IDs when dropping a failed flush", async () => {
    const nativeWriter =
      ClickhouseWriter.getNativeInstance(clickhouseClientMock);
    nativeWriter.maxAttempts = 1;
    const event = preparedEvent("event-1");
    vi.spyOn(clickhouseClientMock, "exec").mockRejectedValue(
      new Error("permanent insert error"),
    );

    nativeWriter.addToQueue(TableName.EventsFull, event);
    await nativeWriter["flushAll"](true);

    expect(serverExports.recordIncrement).toHaveBeenCalledWith(
      "langfuse.queue.clickhouse_writer.rows_dropped",
      1,
      { entity_type: TableName.EventsFull, format: "native" },
    );
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining("Max attempts reached"),
      expect.objectContaining({ droppedIds: [event.ids] }),
    );
    expect(nativeWriter["queue"][TableName.EventsFull]).toHaveLength(0);
  });

  it("should mark writer insert log comments as multi-project", async () => {
    const mockInsert = vi
      .spyOn(clickhouseClientMock, "insert")
      .mockResolvedValue();

    writer.addToQueue(TableName.Traces, {
      id: "1",
      name: "test",
      project_id: "project-1",
    } as any);
    writer.addToQueue(TableName.Traces, {
      id: "2",
      name: "test",
      project_id: "project-1",
    } as any);

    await vi.advanceTimersByTimeAsync(writer.writeInterval);

    const logComment = JSON.parse(
      mockInsert.mock.calls[0][0].clickhouse_settings.log_comment,
    );
    expect(logComment).toMatchObject({
      surface: "worker",
      route: "clickhouse-writer",
      projectId: "MULTI_PROJECT",
    });
  });

  it("should handle errors and retry", async () => {
    const mockInsert = vi
      .spyOn(clickhouseClientMock, "insert")
      .mockRejectedValueOnce(new Error("DB Error"))
      .mockResolvedValueOnce();

    writer.addToQueue(TableName.Traces, { id: "1", name: "test" });

    await vi.advanceTimersByTimeAsync(writer.writeInterval);

    expect(mockInsert).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalled();
    expect(writer["queue"][TableName.Traces]).toHaveLength(1);
    expect(writer["queue"][TableName.Traces][0].attempts).toBe(2);

    await vi.advanceTimersByTimeAsync(writer.writeInterval);
    expect(mockInsert).toHaveBeenCalledTimes(2);
    expect(writer["queue"][TableName.Traces]).toHaveLength(0);
  });

  it("should drop records after max attempts", async () => {
    const mockInsert = vi
      .spyOn(clickhouseClientMock, "insert")
      .mockRejectedValue(new Error("DB Error"));

    writer.addToQueue(TableName.Traces, { id: "1", name: "test" });

    for (let i = 0; i < writer.maxAttempts; i++) {
      await vi.advanceTimersByTimeAsync(writer.writeInterval);
    }

    await vi.advanceTimersByTimeAsync(writer.writeInterval);

    expect(mockInsert).toHaveBeenCalledTimes(writer.maxAttempts);
    expect(
      logger.error.mock.calls.some((call) =>
        call[0].includes("Max attempts reached"),
      ),
    ).toBe(true);
    expect(writer["queue"][TableName.Traces]).toHaveLength(0);
    expect(serverExports.recordIncrement).toHaveBeenCalledWith(
      "langfuse.queue.clickhouse_writer.rows_dropped",
      1,
      { entity_type: TableName.Traces, format: "json" },
    );
  });

  it("should retry client request timeouts within the same flush", async () => {
    const mockInsert = vi
      .spyOn(clickhouseClientMock, "insert")
      .mockRejectedValueOnce(new Error("Timeout error."))
      .mockResolvedValueOnce();

    writer.addToQueue(TableName.Traces, { id: "1", name: "test" });

    await vi.advanceTimersByTimeAsync(writer.writeInterval);
    // let the backOff retry delay elapse
    await vi.advanceTimersByTimeAsync(200);

    expect(mockInsert).toHaveBeenCalledTimes(2);
    expect(writer["queue"][TableName.Traces]).toHaveLength(0);
    expect(serverExports.recordIncrement).not.toHaveBeenCalledWith(
      "langfuse.queue.clickhouse_writer.rows_dropped",
      expect.anything(),
      expect.anything(),
    );
  });

  it("should shutdown both writers gracefully", async () => {
    const nativeWriter =
      ClickhouseWriter.getNativeInstance(clickhouseClientMock);
    writer.addToQueue(TableName.Traces, { id: "1", name: "test" });
    nativeWriter.addToQueue(TableName.EventsFull, preparedEvent("native-1"));
    const mockInsert = vi
      .spyOn(clickhouseClientMock, "insert")
      .mockResolvedValue();
    const mockExec = vi.spyOn(clickhouseClientMock, "exec").mockResolvedValue({
      stream: Readable.from([]),
    });

    await ClickhouseWriter.shutdownAll();

    expect(mockInsert).toHaveBeenCalledTimes(1);
    expect(mockExec).toHaveBeenCalledTimes(1);
    expect(writer["queue"][TableName.Traces]).toHaveLength(0);
    expect(nativeWriter["queue"][TableName.EventsFull]).toHaveLength(0);
    expect(writer["intervalId"]).toBeNull();
    expect(nativeWriter["intervalId"]).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
    expect(logger.info).toHaveBeenCalledWith(
      "ClickhouseWriter shutdown complete.",
    );
  });

  it.each(["batch-size", "interval"] as const)(
    "waits for an in-flight %s flush before shutdown completes",
    async (flushTrigger) => {
      let resolveInsert!: () => void;
      const mockInsert = vi
        .spyOn(clickhouseClientMock, "insert")
        .mockImplementation(
          () => new Promise<void>((resolve) => (resolveInsert = resolve)),
        );
      if (flushTrigger === "batch-size") writer.batchSize = 1;
      writer.addToQueue(TableName.Traces, { id: "1", name: "trace" } as any);
      if (flushTrigger === "interval") {
        await vi.advanceTimersByTimeAsync(writer.writeInterval);
      }

      let shutdown: Promise<void> | undefined;
      try {
        await vi.waitFor(() => expect(mockInsert).toHaveBeenCalledTimes(1));
        let shutdownComplete = false;
        shutdown = writer.shutdown().then(() => {
          shutdownComplete = true;
        });
        await vi.advanceTimersByTimeAsync(0);

        expect(shutdownComplete).toBe(false);

        resolveInsert();
        await shutdown;
        expect(shutdownComplete).toBe(true);
      } finally {
        resolveInsert?.();
        await shutdown;
      }
    },
  );

  it("should handle multiple table types", async () => {
    const mockInsert = vi
      .spyOn(clickhouseClientMock, "insert")
      .mockResolvedValue();

    writer.addToQueue(TableName.Traces, { id: "1", name: "trace" });
    writer.addToQueue(TableName.Scores, { id: "2", name: "score" });
    writer.addToQueue(TableName.Observations, { id: "3", name: "observation" });

    await vi.advanceTimersByTimeAsync(writer.writeInterval);

    expect(mockInsert).toHaveBeenCalledTimes(3);
    expect(writer["queue"][TableName.Traces]).toHaveLength(0);
    expect(writer["queue"][TableName.Scores]).toHaveLength(0);
    expect(writer["queue"][TableName.Observations]).toHaveLength(0);
  });

  it("should not flush when isIntervalFlushInProgress is true", async () => {
    const mockInsert = vi
      .spyOn(clickhouseClientMock, "insert")
      .mockResolvedValue();
    writer["isIntervalFlushInProgress"] = true;
    writer.addToQueue(TableName.Traces, { id: "1", name: "test" });

    await vi.advanceTimersByTimeAsync(writer.writeInterval);

    expect(mockInsert).not.toHaveBeenCalled();
    expect(writer["queue"][TableName.Traces]).toHaveLength(1);
  });

  it("should set up interval correctly in start method", () => {
    const setIntervalSpy = vi.spyOn(global, "setInterval");
    writer["start"]();

    expect(setIntervalSpy).toHaveBeenCalledWith(
      expect.any(Function),
      writer.writeInterval,
    );
  });

  it("should flush all queues when flushAll is called directly", async () => {
    const mockInsert = vi
      .spyOn(clickhouseClientMock, "insert")
      .mockResolvedValue();
    writer.addToQueue(TableName.Traces, { id: "1", name: "trace" });
    writer.addToQueue(TableName.Scores, { id: "2", name: "score" });

    await writer["flushAll"](true);

    expect(mockInsert).toHaveBeenCalledTimes(2);
    expect(writer["queue"][TableName.Traces]).toHaveLength(0);
    expect(writer["queue"][TableName.Scores]).toHaveLength(0);
  });

  it("skips idle interval flushes and flushes queued Native events", async () => {
    const nativeWriter =
      ClickhouseWriter.getNativeInstance(clickhouseClientMock);
    const instrumentAsyncSpy = vi.spyOn(serverExports, "instrumentAsync");
    const mockInsert = vi
      .spyOn(clickhouseClientMock, "insert")
      .mockResolvedValue();
    const mockExec = vi.spyOn(clickhouseClientMock, "exec").mockResolvedValue({
      stream: Readable.from([]),
    });

    await vi.advanceTimersByTimeAsync(writer.writeInterval);

    expect(instrumentAsyncSpy).not.toHaveBeenCalled();
    expect(serverExports.recordIncrement).not.toHaveBeenCalled();
    expect(mockInsert).not.toHaveBeenCalled();
    expect(mockExec).not.toHaveBeenCalled();

    nativeWriter.addToQueue(TableName.EventsFull, preparedEvent("native-1"));
    await vi.advanceTimersByTimeAsync(nativeWriter.writeInterval);

    expect(instrumentAsyncSpy).toHaveBeenCalledTimes(1);
    expect(serverExports.recordIncrement).toHaveBeenCalledWith(
      "langfuse.queue.clickhouse_writer.request",
      1,
      { format: "native" },
    );
    expect(mockExec).toHaveBeenCalledTimes(1);
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("should handle adding items to queue while flush is in progress", async () => {
    const mockInsert = vi
      .spyOn(clickhouseClientMock, "insert")
      .mockImplementation(() => {
        writer.addToQueue(TableName.Traces, { id: "2", name: "test2" });
        return Promise.resolve();
      });

    writer.addToQueue(TableName.Traces, { id: "1", name: "test1" });

    await vi.advanceTimersByTimeAsync(writer.writeInterval);

    expect(mockInsert).toHaveBeenCalledTimes(1);
    expect(writer["queue"][TableName.Traces]).toHaveLength(1);
    expect(writer["queue"][TableName.Traces][0].data.id).toBe("2");
  });

  it("should handle concurrent writes during high load", async () => {
    const mockInsert = vi
      .spyOn(clickhouseClientMock, "insert")
      .mockResolvedValue();
    const concurrentWrites = 1000;

    const writes = Array.from({ length: concurrentWrites }, (_, i) =>
      writer.addToQueue(TableName.Traces, { id: `${i}`, name: `test${i}` }),
    );

    await Promise.all(writes);
    await vi.advanceTimersByTimeAsync(writer.writeInterval);

    expect(mockInsert).toHaveBeenCalledTimes(
      Math.ceil(concurrentWrites / writer.batchSize),
    );
    expect(writer["queue"][TableName.Traces].length).toBeLessThan(
      writer.batchSize,
    );
  });

  it("should report wait time and processing time metrics correctly", async () => {
    const histogramSpy = vi.spyOn(serverExports, "recordHistogram");
    const distributionSpy = vi.spyOn(serverExports, "recordDistribution");
    const mockInsert = vi
      .spyOn(clickhouseClientMock, "insert")
      .mockResolvedValue();

    writer.addToQueue(TableName.Traces, { id: "1", name: "test" });

    await vi.advanceTimersByTimeAsync(writer.writeInterval);

    expect(histogramSpy).toHaveBeenCalledWith(
      "langfuse.queue.clickhouse_writer.wait_time",
      expect.any(Number),
      { format: "json", unit: "milliseconds" },
    );

    expect(histogramSpy).toHaveBeenCalledWith(
      "langfuse.queue.clickhouse_writer.processing_time",
      expect.any(Number),
      { format: "json", unit: "milliseconds" },
    );

    expect(distributionSpy).toHaveBeenCalledWith(
      "langfuse.queue.clickhouse_writer.time_distribution",
      expect.any(Number),
      {
        entity_type: TableName.Traces,
        type: "wait",
        format: "json",
        unit: "milliseconds",
      },
    );

    expect(distributionSpy).toHaveBeenCalledWith(
      "langfuse.queue.clickhouse_writer.time_distribution",
      expect.any(Number),
      {
        entity_type: TableName.Traces,
        type: "processing",
        format: "json",
        unit: "milliseconds",
      },
    );
  });

  it("tags events_full queue gauges by writer format", async () => {
    const nativeWriter =
      ClickhouseWriter.getNativeInstance(clickhouseClientMock);
    vi.spyOn(clickhouseClientMock, "insert").mockResolvedValue();
    vi.spyOn(clickhouseClientMock, "exec").mockResolvedValue({
      stream: Readable.from([]),
    });

    // Enqueue below the default batch size, then lower it to leave distinct
    // queue lengths after each writer flushes one row.
    writer.addToQueue(TableName.EventsFull, { id: "json-1" } as any);
    writer.addToQueue(TableName.EventsFull, { id: "json-2" } as any);
    nativeWriter.addToQueue(TableName.EventsFull, preparedEvent("native-1"));
    nativeWriter.addToQueue(TableName.EventsFull, preparedEvent("native-2"));
    nativeWriter.addToQueue(TableName.EventsFull, preparedEvent("native-3"));
    writer.batchSize = 1;
    nativeWriter.batchSize = 1;

    await writer["flushAll"]();
    await nativeWriter["flushAll"]();

    expect(writer["queue"][TableName.EventsFull]).toHaveLength(1);
    expect(nativeWriter["queue"][TableName.EventsFull]).toHaveLength(2);
    expect(serverExports.recordGauge).toHaveBeenCalledWith(
      "ingestion_clickhouse_insert_queue_length",
      1,
      {
        unit: "records",
        entityType: TableName.EventsFull,
        format: "json",
      },
    );
    expect(serverExports.recordGauge).toHaveBeenCalledWith(
      "ingestion_clickhouse_insert_queue_length",
      2,
      {
        unit: "records",
        entityType: TableName.EventsFull,
        format: "native",
      },
    );
  });

  it("should handle different types of Clickhouse client errors", async () => {
    const mockInsert = vi
      .spyOn(clickhouseClientMock, "insert")
      .mockRejectedValueOnce(new Error("Network error"))
      .mockRejectedValueOnce(new Error("Timeout"))
      .mockResolvedValueOnce();

    writer.addToQueue(TableName.Traces, { id: "1", name: "test" });

    await vi.advanceTimersByTimeAsync(writer.writeInterval);
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining("Network error"),
    );

    await vi.advanceTimersByTimeAsync(writer.writeInterval);
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining("Timeout"),
    );

    await vi.advanceTimersByTimeAsync(writer.writeInterval);
    expect(writer["queue"][TableName.Traces]).toHaveLength(0);
  });

  it("should handle partial queue flush correctly", async () => {
    const mockInsert = vi
      .spyOn(clickhouseClientMock, "insert")
      .mockResolvedValue();
    const partialQueueSize = Math.floor(writer.batchSize / 2);

    for (let i = 0; i < partialQueueSize; i++) {
      writer.addToQueue(TableName.Traces, { id: `${i}`, name: "test" } as any);
    }

    await vi.advanceTimersByTimeAsync(writer.writeInterval);

    expect(mockInsert).toHaveBeenCalledTimes(1);
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        values: expect.arrayContaining(
          new Array(partialQueueSize).fill(expect.any(Object)),
        ),
      }),
    );
    expect(writer["queue"][TableName.Traces]).toHaveLength(0);
  });

  it("should continue functioning after encountering an error", async () => {
    const mockInsert = vi
      .spyOn(clickhouseClientMock, "insert")
      .mockRejectedValueOnce(new Error("DB Error"))
      .mockResolvedValue();

    writer.addToQueue(TableName.Traces, { id: "1", name: "test1" });
    await vi.advanceTimersByTimeAsync(writer.writeInterval);

    writer.addToQueue(TableName.Traces, { id: "2", name: "test2" });
    await vi.advanceTimersByTimeAsync(writer.writeInterval);

    expect(mockInsert).toHaveBeenCalledTimes(2);
    expect(writer["queue"][TableName.Traces]).toHaveLength(0);
  });

  describe("Decimal64(12) clamping", () => {
    describe("clampDecimal64Value", () => {
      it.each([
        { input: 0, expected: [0, false], name: "zero" },
        { input: 0.001, expected: [0.001, false], name: "small positive" },
        { input: -42.5, expected: [-42.5, false], name: "small negative" },
        {
          input: 999_999,
          expected: [999_999, false],
          name: "just under limit",
        },
        {
          input: 999_999.999_999,
          expected: [999_999.999_999, false],
          name: "max representable",
        },
        {
          input: 1_000_000,
          expected: [999_999.999_999, true],
          name: "exact limit",
        },
        {
          input: 8_859_794,
          expected: [999_999.999_999, true],
          name: "positive overflow",
        },
        {
          input: -1_000_000,
          expected: [-999_999.999_999, true],
          name: "exact negative limit",
        },
        {
          input: -8_859_794,
          expected: [-999_999.999_999, true],
          name: "negative overflow",
        },
        { input: NaN, expected: [0, true], name: "NaN" },
        { input: Infinity, expected: [0, true], name: "positive Infinity" },
        { input: -Infinity, expected: [0, true], name: "negative Infinity" },
      ])("$name ($input)", ({ input, expected }) => {
        expect(clampDecimal64Value(input)).toEqual(expected);
      });
    });

    describe("clampDecimal64Map", () => {
      it("returns undefined for undefined input", () => {
        const result = clampDecimal64Map(undefined, {
          recordId: "r1",
          projectId: "p1",
          fieldName: "cost_details",
        });
        expect(result).toBeUndefined();
      });

      it("returns original map when no values need clamping", () => {
        const map = { input: 0.001, output: 42.5 };
        const result = clampDecimal64Map(map, {
          recordId: "r1",
          projectId: "p1",
          fieldName: "cost_details",
        });
        expect(result).toBe(map); // same reference, no allocation
        expect(logger.warn).not.toHaveBeenCalled();
      });

      it("clamps multiple overflowing entries correctly", () => {
        const result = clampDecimal64Map(
          { input: 2_000_000, output: -5_000_000, total: NaN },
          { recordId: "r1", projectId: "p1", fieldName: "cost_details" },
        );
        expect(result).toEqual({
          input: 999_999.999_999,
          output: -999_999.999_999,
          total: 0,
        });
      });

      it("clamps only overflowing entries and logs once", () => {
        const result = clampDecimal64Map(
          { input: 0.001, output: 8_859_794 },
          { recordId: "r1", projectId: "p1", fieldName: "cost_details" },
        );
        expect(result).toEqual({ input: 0.001, output: 999_999.999_999 });
        expect(logger.warn).toHaveBeenCalledWith(
          "Clamped Decimal64(12) overflow in cost map",
          expect.objectContaining({
            projectId: "p1",
            recordId: "r1",
            fieldName: "cost_details",
          }),
        );
      });
    });

    describe("flush integration", () => {
      it("clamps observation cost fields before inserting", async () => {
        const mockInsert = vi
          .spyOn(clickhouseClientMock, "insert")
          .mockResolvedValue();

        writer.addToQueue(TableName.Observations, {
          id: "obs-1",
          project_id: "proj-1",
          cost_details: { total: 8_859_794 },
          provided_cost_details: { total: 1_234_567 },
          total_cost: 9_999_999,
        } as any);
        await vi.advanceTimersByTimeAsync(writer.writeInterval);

        const inserted = mockInsert.mock.calls[0][0].values[0];
        expect(inserted.cost_details.total).toBe(999_999.999_999);
        expect(inserted.provided_cost_details.total).toBe(999_999.999_999);
        expect(inserted.total_cost).toBe(999_999.999_999);
      });
    });
  });

  describe("truncation logic", () => {
    it("should truncate oversized input field", () => {
      const largeInput = "a".repeat(2 * 1024 * 1024); // 2MB string
      const record = {
        id: "1",
        input: largeInput,
        output: "normal output",
        metadata: { key: "value" },
      } as any;

      const truncatedRecord = truncateOversizedRecord(TableName.Traces, record);

      expect(truncatedRecord.id).toBe("1");
      expect((truncatedRecord as any).output).toBe("normal output");
      expect((truncatedRecord as any).metadata).toEqual({ key: "value" });
      expect((truncatedRecord as any).input).toContain(
        "[TRUNCATED: Field exceeded size limit]",
      );
      expect((truncatedRecord as any).input.length).toBeLessThan(
        largeInput.length,
      );
      expect((truncatedRecord as any).input).toMatch(
        /^a+\[TRUNCATED: Field exceeded size limit]$/,
      );
    });

    it("should truncate oversized output field", () => {
      const largeOutput = "b".repeat(2 * 1024 * 1024); // 2MB string
      const record = {
        id: "1",
        input: "normal input",
        output: largeOutput,
        metadata: { key: "value" },
      };

      const truncatedRecord = truncateOversizedRecord(TableName.Traces, record);

      expect(truncatedRecord.id).toBe("1");
      expect(truncatedRecord.input).toBe("normal input");
      expect(truncatedRecord.metadata).toEqual({ key: "value" });
      expect(truncatedRecord.output).toContain(
        "[TRUNCATED: Field exceeded size limit]",
      );
      expect(truncatedRecord.output.length).toBeLessThan(largeOutput.length);
      expect(truncatedRecord.output).toMatch(
        /^b+\[TRUNCATED: Field exceeded size limit\]$/,
      );
    });

    it("should truncate oversized metadata values", () => {
      const largeMetadataValue = "c".repeat(2 * 1024 * 1024); // 2MB string
      const record = {
        id: "1",
        input: "normal input",
        output: "normal output",
        metadata: {
          normalKey: "normal value",
          largeKey: largeMetadataValue,
          anotherNormalKey: "another normal value",
        },
      };

      const truncatedRecord = truncateOversizedRecord(TableName.Traces, record);

      expect(truncatedRecord.id).toBe("1");
      expect(truncatedRecord.input).toBe("normal input");
      expect(truncatedRecord.output).toBe("normal output");
      expect(truncatedRecord.metadata.normalKey).toBe("normal value");
      expect(truncatedRecord.metadata.anotherNormalKey).toBe(
        "another normal value",
      );
      expect(truncatedRecord.metadata.largeKey).toContain(
        "[TRUNCATED: Field exceeded size limit]",
      );
      expect(truncatedRecord.metadata.largeKey.length).toBeLessThan(
        largeMetadataValue.length,
      );
      expect(truncatedRecord.metadata.largeKey).toMatch(
        /^c+\[TRUNCATED: Field exceeded size limit\]$/,
      );
    });

    it("should not truncate normal-sized fields", () => {
      const normalRecord = {
        id: "1",
        input: "normal input",
        output: "normal output",
        metadata: { key: "value" },
      };

      const truncatedRecord = truncateOversizedRecord(
        TableName.Traces,
        normalRecord,
      );

      expect(truncatedRecord).toEqual(normalRecord);
    });

    it("should handle size errors with truncation in retry logic", async () => {
      const largeInput = "a".repeat(2 * 1024 * 1024); // 2MB string
      const record = {
        id: "1",
        input: largeInput,
        output: "normal output",
      } as any;

      const mockInsert = vi
        .spyOn(clickhouseClientMock, "insert")
        .mockRejectedValueOnce(
          new Error(
            "size of json object is extremely large and expected not greater than 1MB",
          ),
        )
        .mockResolvedValueOnce();

      writer.addToQueue(TableName.Traces, record);

      await vi.advanceTimersByTimeAsync(writer.writeInterval);

      expect(mockInsert).toHaveBeenCalledTimes(1);
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining("size of json object is extremely large"),
      );

      // Second attempt with truncated data
      await vi.advanceTimersByTimeAsync(writer.writeInterval);

      expect(mockInsert).toHaveBeenCalledTimes(2);
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining("Truncating oversized records"),
        expect.objectContaining({
          attemptNumber: 1,
          error:
            "size of json object is extremely large and expected not greater than 1MB",
        }),
      );
      expect(writer["queue"][TableName.Traces]).toHaveLength(0);

      // Verify that the second call used truncated data
      const secondCallArgs = mockInsert.mock.calls[1][0];
      expect(secondCallArgs.values[0].input).toContain(
        "[TRUNCATED: Field exceeded size limit]",
      );
    });

    it("should handle string length errors with batch splitting", async () => {
      const mockInsert = vi
        .spyOn(clickhouseClientMock, "insert")
        .mockRejectedValueOnce(new Error("invalid string length"))
        .mockResolvedValue();

      // Add 4 records to test splitting
      const records = Array.from({ length: 4 }, (_, i) => ({
        id: `${i}`,
        name: `test${i}`,
      }));

      records.forEach((record) => {
        writer.addToQueue(TableName.Traces, record as any);
      });

      await vi.advanceTimersByTimeAsync(writer.writeInterval);

      // After first interval: should have done initial call + retry with first half
      expect(mockInsert).toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining("Splitting batch and retrying"),
        expect.objectContaining({
          error: "invalid string length",
          batchSize: 4,
        }),
      );

      // Check that queue now has the second half (2 records) at the front
      expect(writer["queue"][TableName.Traces]).toHaveLength(2);
      expect(writer["queue"][TableName.Traces][0].data.id).toBe("2");
      expect(writer["queue"][TableName.Traces][1].data.id).toBe("3");

      // Advance timer again to process the requeued items
      await vi.advanceTimersByTimeAsync(writer.writeInterval);

      expect(writer["queue"][TableName.Traces]).toHaveLength(0);
    });
  });
});
