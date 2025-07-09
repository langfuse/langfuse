import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as serverExports from "@langfuse/shared/src/server";

import { env } from "../../env";
import { logger } from "@langfuse/shared/src/server";
import { ClickhouseWriter, TableName } from "../ClickhouseWriter";

// Mock recordHistogram, recordCount, recordGauge
vi.mock("@langfuse/shared/src/server", async (importOriginal) => {
  const original = (await importOriginal()) as {};
  return {
    ...original,
    recordHistogram: vi.fn(),
    recordCount: vi.fn(),
    recordGauge: vi.fn(),
    recordIncrement: vi.fn(),
    getQueue: vi.fn(() => ({
      getJob: vi.fn(() => ({
        moveToFailed: vi.fn(),
      })),
    })),
    QueueName: {
      IngestionQueue: "ingestion-queue",
    },
    IngestionQueue: {
      getShardNames: vi.fn(() => ["default"]),
      getInstance: vi.fn(() => ({
        getJob: vi.fn(() => ({
          moveToFailed: vi.fn(),
        })),
      })),
    },
    logger: {
      info: vi.fn(),
      debug: vi.fn(),
      error: vi.fn(),
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

const clickhouseClientMock = {
  insert: vi.fn(),
};

describe("ClickhouseWriter", () => {
  let writer: ClickhouseWriter;

  beforeEach(() => {
    vi.useFakeTimers();
    writer = ClickhouseWriter.getInstance(clickhouseClientMock);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    vi.useRealTimers();

    // Reset singleton instance
    await writer.shutdown();

    (ClickhouseWriter as any).instance = null;
  });

  it("should be a singleton", () => {
    const instance1 = ClickhouseWriter.getInstance();
    const instance2 = ClickhouseWriter.getInstance();

    expect(instance1).toBe(instance2);
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
    writer.addToQueue(TableName.Traces, traceData as any, "job-1");

    expect(writer["queue"][TableName.Traces]).toHaveLength(1);
    expect(writer["queue"][TableName.Traces][0].data).toEqual(traceData);
  });

  it("should flush when queue reaches batch size", async () => {
    const mockInsert = vi
      .spyOn(clickhouseClientMock, "insert")
      .mockResolvedValue();

    for (let i = 0; i < writer.batchSize; i++) {
      writer.addToQueue(
        TableName.Traces,
        { id: `${i}`, name: "test" } as any,
        `job-${i}`,
      );
    }

    await vi.advanceTimersByTimeAsync(writer.writeInterval);

    expect(mockInsert).toHaveBeenCalledTimes(1);
    expect(writer["queue"][TableName.Traces]).toHaveLength(0);
  });

  it("should flush at regular intervals", async () => {
    const mockInsert = vi
      .spyOn(clickhouseClientMock, "insert")
      .mockResolvedValue();
    writer.addToQueue(TableName.Traces, { id: "1", name: "test" }, "job-1");

    await vi.advanceTimersByTimeAsync(writer.writeInterval);

    expect(mockInsert).toHaveBeenCalledTimes(1);
  });

  it("should handle errors and retry", async () => {
    const mockInsert = vi
      .spyOn(clickhouseClientMock, "insert")
      .mockRejectedValueOnce(new Error("DB Error"))
      .mockResolvedValueOnce();

    writer.addToQueue(TableName.Traces, { id: "1", name: "test" }, "job-1");

    await vi.advanceTimersByTimeAsync(writer.writeInterval);

    expect(mockInsert).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalled();
    expect(writer["queue"][TableName.Traces]).toHaveLength(1);
    expect(writer["queue"][TableName.Traces][0].attempts).toBe(2);

    await vi.advanceTimersByTimeAsync(writer.writeInterval);
    expect(mockInsert).toHaveBeenCalledTimes(2);
    expect(writer["queue"][TableName.Traces]).toHaveLength(0);
  });

  it("should drop records and log error after max attempts", async () => {
    const mockInsert = vi
      .spyOn(clickhouseClientMock, "insert")
      .mockRejectedValue(new Error("DB Error"));

    writer.addToQueue(TableName.Traces, { id: "1", name: "test" }, "job-1");

    // Advance timers for maxAttempts + 1 times to trigger the max attempts logic
    for (let i = 0; i < writer.maxAttempts + 1; i++) {
      await vi.advanceTimersByTimeAsync(writer.writeInterval);
    }

    expect(mockInsert).toHaveBeenCalledTimes(writer.maxAttempts);

    // Check if any error call contains the expected message
    const hasMaxAttemptsError = logger.error.mock.calls.some((call) => {
      const message = call[0];
      return (
        typeof message === "string" && message.includes("Max attempts reached")
      );
    });

    expect(hasMaxAttemptsError).toBe(true);
    expect(writer["queue"][TableName.Traces]).toHaveLength(0);
  });

  it("should shutdown gracefully", async () => {
    writer.addToQueue(TableName.Traces, { id: "1", name: "test" }, "job-1");
    const mockInsert = vi
      .spyOn(clickhouseClientMock, "insert")
      .mockResolvedValue();

    await writer.shutdown();

    expect(mockInsert).toHaveBeenCalledTimes(1);
    expect(writer["intervalId"]).toBeNull();
    expect(logger.info).toHaveBeenCalledWith(
      "ClickhouseWriter shutdown complete.",
    );
  });

  it("should handle multiple table types in normal operation", async () => {
    const mockInsert = vi
      .spyOn(clickhouseClientMock, "insert")
      .mockResolvedValue();

    writer.addToQueue(TableName.Traces, { id: "1", name: "trace" }, "job-1");
    writer.addToQueue(TableName.Scores, { id: "2", name: "score" }, "job-2");
    writer.addToQueue(
      TableName.Observations,
      { id: "3", name: "observation" },
      "job-3",
    );

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
    writer.addToQueue(TableName.Traces, { id: "1", name: "test" }, "job-1");

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
    writer.addToQueue(TableName.Traces, { id: "1", name: "trace" }, "job-1");
    writer.addToQueue(TableName.Scores, { id: "2", name: "score" }, "job-2");

    await writer["flushAll"](true);

    expect(mockInsert).toHaveBeenCalledTimes(2);
    expect(writer["queue"][TableName.Traces]).toHaveLength(0);
    expect(writer["queue"][TableName.Scores]).toHaveLength(0);
  });

  it("should handle adding items to queue while flush is in progress", async () => {
    const mockInsert = vi
      .spyOn(clickhouseClientMock, "insert")
      .mockImplementation(() => {
        writer.addToQueue(
          TableName.Traces,
          { id: "2", name: "test2" },
          "job-2",
        );
        return Promise.resolve();
      });

    writer.addToQueue(TableName.Traces, { id: "1", name: "test1" }, "job-1");

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
      writer.addToQueue(
        TableName.Traces,
        { id: `${i}`, name: `test${i}` },
        `job-${i}`,
      ),
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
    const metricsDistributionSpy = vi.spyOn(serverExports, "recordHistogram");
    const mockInsert = vi
      .spyOn(clickhouseClientMock, "insert")
      .mockResolvedValue();

    writer.addToQueue(TableName.Traces, { id: "1", name: "test" }, "job-1");

    await vi.advanceTimersByTimeAsync(writer.writeInterval);

    expect(metricsDistributionSpy).toHaveBeenCalledWith(
      "langfuse.queue.clickhouse_writer.wait_time",
      expect.any(Number),
      { unit: "milliseconds" },
    );

    expect(metricsDistributionSpy).toHaveBeenCalledWith(
      "langfuse.queue.clickhouse_writer.processing_time",
      expect.any(Number),
      { unit: "milliseconds" },
    );
  });

  it("should handle different types of Clickhouse client errors", async () => {
    const mockInsert = vi
      .spyOn(clickhouseClientMock, "insert")
      .mockRejectedValueOnce(new Error("Network error"))
      .mockRejectedValueOnce(new Error("Timeout"))
      .mockResolvedValueOnce();

    writer.addToQueue(TableName.Traces, { id: "1", name: "test" }, "job-1");

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
      writer.addToQueue(
        TableName.Traces,
        { id: `${i}`, name: "test" } as any,
        `job-${i}`,
      );
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

    writer.addToQueue(TableName.Traces, { id: "1", name: "test1" }, "job-1");
    await vi.advanceTimersByTimeAsync(writer.writeInterval);

    writer.addToQueue(TableName.Traces, { id: "2", name: "test2" }, "job-2");
    await vi.advanceTimersByTimeAsync(writer.writeInterval);

    expect(mockInsert).toHaveBeenCalledTimes(2);
    expect(writer["queue"][TableName.Traces]).toHaveLength(0);
  });

  it("should call moveToFailed and increment metrics when max attempts are reached", async () => {
    const mockInsert = vi
      .spyOn(clickhouseClientMock, "insert")
      .mockRejectedValue(new Error("DB Error"));

    const mockMoveToFailed = vi.fn();
    const mockGetJob = vi.fn(() => ({
      moveToFailed: mockMoveToFailed,
    }));
    const mockGetInstance = vi.fn(() => ({
      getJob: mockGetJob,
    }));
    const mockRecordIncrement = vi.fn();

    // Update the mock to return our specific mock functions
    (serverExports.IngestionQueue.getInstance as any).mockImplementation(
      mockGetInstance,
    );
    (serverExports.recordIncrement as any).mockImplementation(
      mockRecordIncrement,
    );

    writer.addToQueue(TableName.Traces, { id: "1", name: "test" }, "job-1");

    for (let i = 0; i < writer.maxAttempts + 1; i++) {
      await vi.advanceTimersByTimeAsync(writer.writeInterval);
    }

    expect(mockGetInstance).toHaveBeenCalled();
    expect(mockGetJob).toHaveBeenCalledWith("job-1");
    expect(mockMoveToFailed).toHaveBeenCalledWith(expect.any(Error), "token");
    expect(mockRecordIncrement).toHaveBeenCalledWith(
      "langfuse.queue.clickhouse_writer.error",
    );
  });

  it("should handle job not found when max attempts are reached", async () => {
    const mockInsert = vi
      .spyOn(clickhouseClientMock, "insert")
      .mockRejectedValue(new Error("DB Error"));

    const mockGetJob = vi.fn(() => null);
    const mockGetInstance = vi.fn(() => ({
      getJob: mockGetJob,
    }));

    (serverExports.IngestionQueue.getInstance as any).mockImplementation(
      mockGetInstance,
    );

    writer.addToQueue(TableName.Traces, { id: "1", name: "test" }, "job-1");

    for (let i = 0; i < writer.maxAttempts + 1; i++) {
      await vi.advanceTimersByTimeAsync(writer.writeInterval);
    }

    expect(mockGetInstance).toHaveBeenCalled();
    expect(mockGetJob).toHaveBeenCalledWith("job-1");
    // Should not throw error when job is not found
    expect(writer["queue"][TableName.Traces]).toHaveLength(0);
  });

  it("should handle multiple shards when looking for job", async () => {
    const mockInsert = vi
      .spyOn(clickhouseClientMock, "insert")
      .mockRejectedValue(new Error("DB Error"));

    const mockMoveToFailed = vi.fn();
    const mockGetJobFirstShard = vi.fn(() => null);
    const mockGetJobSecondShard = vi.fn(() => ({
      moveToFailed: mockMoveToFailed,
    }));

    const mockGetInstance = vi
      .fn()
      .mockReturnValueOnce({ getJob: mockGetJobFirstShard })
      .mockReturnValueOnce({ getJob: mockGetJobSecondShard });

    (serverExports.IngestionQueue.getShardNames as any).mockReturnValue([
      "shard1",
      "shard2",
    ]);
    (serverExports.IngestionQueue.getInstance as any).mockImplementation(
      mockGetInstance,
    );

    writer.addToQueue(TableName.Traces, { id: "1", name: "test" }, "job-1");

    for (let i = 0; i < writer.maxAttempts + 1; i++) {
      await vi.advanceTimersByTimeAsync(writer.writeInterval);
    }

    expect(mockGetInstance).toHaveBeenCalledTimes(2);
    expect(mockGetJobFirstShard).toHaveBeenCalledWith("job-1");
    expect(mockGetJobSecondShard).toHaveBeenCalledWith("job-1");
    expect(mockMoveToFailed).toHaveBeenCalledWith(expect.any(Error), "token");
  });

  it("should handle different table types with max attempts logic", async () => {
    const mockInsert = vi
      .spyOn(clickhouseClientMock, "insert")
      .mockRejectedValue(new Error("DB Error"));

    const mockMoveToFailed = vi.fn();
    const mockGetJob = vi.fn(() => ({
      moveToFailed: mockMoveToFailed,
    }));
    const mockGetInstance = vi.fn(() => ({
      getJob: mockGetJob,
    }));

    (serverExports.IngestionQueue.getInstance as any).mockImplementation(
      mockGetInstance,
    );

    // Test with different table types
    writer.addToQueue(TableName.Traces, { id: "1", name: "test" }, "job-1");
    writer.addToQueue(TableName.Scores, { id: "2", name: "test" }, "job-2");
    writer.addToQueue(
      TableName.Observations,
      { id: "3", name: "test" },
      "job-3",
    );

    for (let i = 0; i < writer.maxAttempts + 1; i++) {
      await vi.advanceTimersByTimeAsync(writer.writeInterval);
    }

    expect(mockMoveToFailed).toHaveBeenCalledTimes(3);
    expect(writer["queue"][TableName.Traces]).toHaveLength(0);
    expect(writer["queue"][TableName.Scores]).toHaveLength(0);
    expect(writer["queue"][TableName.Observations]).toHaveLength(0);
  });

  it("should preserve job data when logging max attempts error", async () => {
    const mockInsert = vi
      .spyOn(clickhouseClientMock, "insert")
      .mockRejectedValue(new Error("DB Error"));

    const testData = { id: "1", name: "test", customField: "value" };
    writer.addToQueue(TableName.Traces, testData as any, "job-1");

    for (let i = 0; i < writer.maxAttempts + 1; i++) {
      await vi.advanceTimersByTimeAsync(writer.writeInterval);
    }

    const errorLogCall = logger.error.mock.calls.find((call) =>
      call[0].includes("Max attempts reached"),
    );

    expect(errorLogCall).toBeDefined();
    expect(errorLogCall[1]).toEqual({ item: testData });
  });
});
