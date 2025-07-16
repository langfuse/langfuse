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
    logger: {
      info: vi.fn(),
      debug: vi.fn(),
      warn: vi.fn(),
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

    ClickhouseWriter.instance = null;
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
  });

  it("should shutdown gracefully", async () => {
    writer.addToQueue(TableName.Traces, { id: "1", name: "test" });
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
    const metricsDistributionSpy = vi.spyOn(serverExports, "recordHistogram");
    const mockInsert = vi
      .spyOn(clickhouseClientMock, "insert")
      .mockResolvedValue();

    writer.addToQueue(TableName.Traces, { id: "1", name: "test" });

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

  describe("truncation logic", () => {
    it("should truncate oversized input field", () => {
      const largeInput = "a".repeat(2 * 1024 * 1024); // 2MB string
      const record = {
        id: "1",
        input: largeInput,
        output: "normal output",
        metadata: { key: "value" },
      } as any;

      const truncatedRecord = writer["truncateOversizedRecord"](
        TableName.Traces,
        record,
      );

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

      const truncatedRecord = writer["truncateOversizedRecord"](
        TableName.Traces,
        record,
      );

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

      const truncatedRecord = writer["truncateOversizedRecord"](
        TableName.Traces,
        record,
      );

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

      const truncatedRecord = writer["truncateOversizedRecord"](
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
  });
});
