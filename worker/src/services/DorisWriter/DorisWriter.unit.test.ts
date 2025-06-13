import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as serverExports from "@langfuse/shared/src/server";

import { env } from "../../env";
import { logger } from "@langfuse/shared/src/server";
import { DorisWriter, TableName } from "./index";

// Mock recordHistogram, recordCount, recordGauge
vi.mock("@langfuse/shared/src/server", async (importOriginal) => {
  const original = (await importOriginal()) as {};
  return {
    ...original,
    recordHistogram: vi.fn(),
    recordIncrement: vi.fn(),
    recordGauge: vi.fn(),
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
      LANGFUSE_INGESTION_DORIS_WRITE_BATCH_SIZE: 100,
      LANGFUSE_INGESTION_DORIS_WRITE_INTERVAL_MS: 5000,
      LANGFUSE_INGESTION_DORIS_MAX_ATTEMPTS: 3,
    },
  };
});

const dorisClientMock = {
  insert: vi.fn(),
  streamLoad: vi.fn(),
  query: vi.fn(),
  queryWithParams: vi.fn(),
  healthCheck: vi.fn(),
  getDatabaseInfo: vi.fn(),
  close: vi.fn(),
  httpClient: {} as any,
  config: {} as any,
  connectionPool: {} as any,
  initializeConnectionPool: vi.fn(),
} as any;

describe("DorisWriter", () => {
  let writer: DorisWriter;

  beforeEach(() => {
    vi.useFakeTimers();
    writer = DorisWriter.getInstance(dorisClientMock);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    vi.useRealTimers();

    // Reset singleton instance
    await writer.shutdown();
    (DorisWriter as any).instance = null;
  });

  it("should be a singleton", () => {
    const instance1 = DorisWriter.getInstance();
    const instance2 = DorisWriter.getInstance();

    expect(instance1).toBe(instance2);
  });

  it("should initialize with correct values", () => {
    expect(writer.batchSize).toBe(
      env.LANGFUSE_INGESTION_DORIS_WRITE_BATCH_SIZE,
    );
    expect(writer.writeInterval).toBe(
      env.LANGFUSE_INGESTION_DORIS_WRITE_INTERVAL_MS,
    );
    expect(writer.maxAttempts).toBe(
      env.LANGFUSE_INGESTION_DORIS_MAX_ATTEMPTS,
    );
  });

  it("should add items to the queue", () => {
    const traceData = {
      id: "1",
      name: "test",
      metadata: {},
      tags: [],
      timestamp: Date.now(),
      public: false,
      bookmarked: false,
      environment: "test",
      project_id: "project1",
      is_deleted: 0,
      created_at: Date.now(),
      updated_at: Date.now(),
      event_ts: Date.now(),
    } as any;
    
    writer.addToQueue(TableName.Traces, traceData);

    expect(writer["queue"][TableName.Traces]).toHaveLength(1);
    expect(writer["queue"][TableName.Traces][0].data).toEqual(traceData);
  });

  it("should flush when queue reaches batch size", async () => {
    const mockInsert = vi
      .spyOn(dorisClientMock, "insert")
      .mockResolvedValue(undefined);

    for (let i = 0; i < writer.batchSize; i++) {
      writer.addToQueue(TableName.Traces, {
        id: `${i}`,
        name: "test",
        metadata: {},
        tags: [],
        timestamp: Date.now(),
        public: false,
        bookmarked: false,
        environment: "test",
        project_id: "project1",
        is_deleted: 0,
        created_at: Date.now(),
        updated_at: Date.now(),
        event_ts: Date.now(),
      } as any);
    }

    await vi.advanceTimersByTimeAsync(writer.writeInterval);

    expect(mockInsert).toHaveBeenCalledTimes(1);
    expect(writer["queue"][TableName.Traces]).toHaveLength(0);
  });

  it("should flush at regular intervals", async () => {
    const mockInsert = vi
      .spyOn(dorisClientMock, "insert")
      .mockResolvedValue(undefined);
    
    writer.addToQueue(TableName.Traces, {
      id: "1",
      name: "test",
      metadata: {},
      tags: [],
      timestamp: Date.now(),
      public: false,
      bookmarked: false,
      environment: "test",
      project_id: "project1",
      is_deleted: 0,
      created_at: Date.now(),
      updated_at: Date.now(),
      event_ts: Date.now(),
    } as any);

    await vi.advanceTimersByTimeAsync(writer.writeInterval);

    expect(mockInsert).toHaveBeenCalledTimes(1);
  });

  it("should handle errors and retry", async () => {
    const mockInsert = vi
      .spyOn(dorisClientMock, "insert")
      .mockRejectedValueOnce(new Error("DB Error"))
      .mockResolvedValueOnce(undefined);

    writer.addToQueue(TableName.Traces, {
      id: "1",
      name: "test",
      metadata: {},
      tags: [],
      timestamp: Date.now(),
      public: false,
      bookmarked: false,
      environment: "test",
      project_id: "project1",
      is_deleted: 0,
      created_at: Date.now(),
      updated_at: Date.now(),
      event_ts: Date.now(),
    } as any);

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
      .spyOn(dorisClientMock, "insert")
      .mockRejectedValue(new Error("DB Error"));

    writer.addToQueue(TableName.Traces, {
      id: "1",
      name: "test",
      metadata: {},
      tags: [],
      timestamp: Date.now(),
      public: false,
      bookmarked: false,
      environment: "test",
      project_id: "project1",
      is_deleted: 0,
      created_at: Date.now(),
      updated_at: Date.now(),
      event_ts: Date.now(),
    } as any);

    for (let i = 0; i < writer.maxAttempts; i++) {
      await vi.advanceTimersByTimeAsync(writer.writeInterval);
    }

    await vi.advanceTimersByTimeAsync(writer.writeInterval);

    expect(mockInsert).toHaveBeenCalledTimes(writer.maxAttempts);
    expect(
      (logger.error as any).mock.calls.some((call: any) =>
        call[0].includes("Max attempts reached"),
      ),
    ).toBe(true);
    expect(writer["queue"][TableName.Traces]).toHaveLength(0);
  });

  it("should shutdown gracefully", async () => {
    writer.addToQueue(TableName.Traces, {
      id: "1",
      name: "test",
      metadata: {},
      tags: [],
      timestamp: Date.now(),
      public: false,
      bookmarked: false,
      environment: "test",
      project_id: "project1",
      is_deleted: 0,
      created_at: Date.now(),
      updated_at: Date.now(),
      event_ts: Date.now(),
    } as any);
    
    const mockInsert = vi
      .spyOn(dorisClientMock, "insert")
      .mockResolvedValue(undefined);

    await writer.shutdown();

    expect(mockInsert).toHaveBeenCalledTimes(1);
    expect(writer["intervalId"]).toBeNull();
    expect(logger.info).toHaveBeenCalledWith(
      "DorisWriter shutdown complete.",
    );
  });

  it("should handle multiple table types", async () => {
    const mockInsert = vi
      .spyOn(dorisClientMock, "insert")
      .mockResolvedValue(undefined);

    writer.addToQueue(TableName.Traces, {
      id: "1",
      name: "trace",
      metadata: {},
      tags: [],
      timestamp: Date.now(),
      public: false,
      bookmarked: false,
      environment: "test",
      project_id: "project1",
      is_deleted: 0,
      created_at: Date.now(),
      updated_at: Date.now(),
      event_ts: Date.now(),
    } as any);

    writer.addToQueue(TableName.Scores, {
      id: "2",
      name: "score",
      metadata: {},
      timestamp: Date.now(),
      source: "manual",
      environment: "test",
      project_id: "project1",
      is_deleted: 0,
      created_at: Date.now(),
      updated_at: Date.now(),
      event_ts: Date.now(),
      value: 0.8,
      data_type: "NUMERIC",
      trace_id: "trace1",
    } as any);

    writer.addToQueue(TableName.Observations, {
      id: "3",
      name: "observation",
      type: "GENERATION",
      metadata: {},
      environment: "test",
      project_id: "project1",
      is_deleted: 0,
      created_at: Date.now(),
      updated_at: Date.now(),
      start_time: Date.now(),
      event_ts: Date.now(),
      trace_id: "trace1",
      provided_usage_details: {},
      provided_cost_details: {},
      usage_details: {},
      cost_details: {},
    } as any);

    await vi.advanceTimersByTimeAsync(writer.writeInterval);

    expect(mockInsert).toHaveBeenCalledTimes(3);
    expect(writer["queue"][TableName.Traces]).toHaveLength(0);
    expect(writer["queue"][TableName.Scores]).toHaveLength(0);
    expect(writer["queue"][TableName.Observations]).toHaveLength(0);
  });

  it("should not flush when isIntervalFlushInProgress is true", async () => {
    const mockInsert = vi
      .spyOn(dorisClientMock, "insert")
      .mockResolvedValue(undefined);
    
    writer["isIntervalFlushInProgress"] = true;
    writer.addToQueue(TableName.Traces, {
      id: "1",
      name: "test",
      metadata: {},
      tags: [],
      timestamp: Date.now(),
      public: false,
      bookmarked: false,
      environment: "test",
      project_id: "project1",
      is_deleted: 0,
      created_at: Date.now(),
      updated_at: Date.now(),
      event_ts: Date.now(),
    } as any);

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
      .spyOn(dorisClientMock, "insert")
      .mockResolvedValue(undefined);
    
    writer.addToQueue(TableName.Traces, {
      id: "1",
      name: "trace",
      metadata: {},
      tags: [],
      timestamp: Date.now(),
      public: false,
      bookmarked: false,
      environment: "test",
      project_id: "project1",
      is_deleted: 0,
      created_at: Date.now(),
      updated_at: Date.now(),
      event_ts: Date.now(),
    } as any);

    writer.addToQueue(TableName.Scores, {
      id: "2",
      name: "score",
      metadata: {},
      timestamp: Date.now(),
      source: "manual",
      environment: "test",
      project_id: "project1",
      is_deleted: 0,
      created_at: Date.now(),
      updated_at: Date.now(),
      event_ts: Date.now(),
      value: 0.8,
      data_type: "NUMERIC",
      trace_id: "trace1",
    } as any);

    await writer["flushAll"](true);

    expect(mockInsert).toHaveBeenCalledTimes(2);
    expect(writer["queue"][TableName.Traces]).toHaveLength(0);
    expect(writer["queue"][TableName.Scores]).toHaveLength(0);
  });

  it("should handle adding items to queue while flush is in progress", async () => {
    const mockInsert = vi
      .spyOn(dorisClientMock, "insert")
      .mockImplementation(() => {
        writer.addToQueue(TableName.Traces, {
          id: "2",
          name: "test2",
          metadata: {},
          tags: [],
          timestamp: Date.now(),
          public: false,
          bookmarked: false,
          environment: "test",
          project_id: "project1",
          is_deleted: 0,
          created_at: Date.now(),
          updated_at: Date.now(),
          event_ts: Date.now(),
        } as any);
        return Promise.resolve();
      });

    writer.addToQueue(TableName.Traces, {
      id: "1",
      name: "test1",
      metadata: {},
      tags: [],
      timestamp: Date.now(),
      public: false,
      bookmarked: false,
      environment: "test",
      project_id: "project1",
      is_deleted: 0,
      created_at: Date.now(),
      updated_at: Date.now(),
      event_ts: Date.now(),
    } as any);

    await vi.advanceTimersByTimeAsync(writer.writeInterval);

    expect(mockInsert).toHaveBeenCalledTimes(1);
    expect(writer["queue"][TableName.Traces]).toHaveLength(1);
    expect(writer["queue"][TableName.Traces][0].data.id).toBe("2");
  });

  it("should handle concurrent writes during high load", async () => {
    const mockInsert = vi
      .spyOn(dorisClientMock, "insert")
      .mockResolvedValue(undefined);
    const concurrentWrites = 1000;

    const writes = Array.from({ length: concurrentWrites }, (_, i) =>
      writer.addToQueue(TableName.Traces, {
        id: `${i}`,
        name: `test${i}`,
        metadata: {},
        tags: [],
        timestamp: Date.now(),
        public: false,
        bookmarked: false,
        environment: "test",
        project_id: "project1",
        is_deleted: 0,
        created_at: Date.now(),
        updated_at: Date.now(),
        event_ts: Date.now(),
      } as any)
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
      .spyOn(dorisClientMock, "insert")
      .mockResolvedValue(undefined);

    writer.addToQueue(TableName.Traces, {
      id: "1",
      name: "test",
      metadata: {},
      tags: [],
      timestamp: Date.now(),
      public: false,
      bookmarked: false,
      environment: "test",
      project_id: "project1",
      is_deleted: 0,
      created_at: Date.now(),
      updated_at: Date.now(),
      event_ts: Date.now(),
    } as any);

    await vi.advanceTimersByTimeAsync(writer.writeInterval);

    expect(metricsDistributionSpy).toHaveBeenCalledWith(
      "langfuse.queue.doris_writer.wait_time",
      expect.any(Number),
      { unit: "milliseconds" },
    );

    expect(metricsDistributionSpy).toHaveBeenCalledWith(
      "langfuse.queue.doris_writer.processing_time",
      expect.any(Number),
      { unit: "milliseconds" },
    );
  });

  it("should handle different types of Doris client errors", async () => {
    const mockInsert = vi
      .spyOn(dorisClientMock, "insert")
      .mockRejectedValueOnce(new Error("Network error"))
      .mockRejectedValueOnce(new Error("Timeout"))
      .mockResolvedValueOnce(undefined);

    writer.addToQueue(TableName.Traces, {
      id: "1",
      name: "test",
      metadata: {},
      tags: [],
      timestamp: Date.now(),
      public: false,
      bookmarked: false,
      environment: "test",
      project_id: "project1",
      is_deleted: 0,
      created_at: Date.now(),
      updated_at: Date.now(),
      event_ts: Date.now(),
    } as any);

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
      .spyOn(dorisClientMock, "insert")
      .mockResolvedValue(undefined);
    const partialQueueSize = Math.floor(writer.batchSize / 2);

    for (let i = 0; i < partialQueueSize; i++) {
      writer.addToQueue(TableName.Traces, {
        id: `${i}`,
        name: "test",
        metadata: {},
        tags: [],
        timestamp: Date.now(),
        public: false,
        bookmarked: false,
        environment: "test",
        project_id: "project1",
        is_deleted: 0,
        created_at: Date.now(),
        updated_at: Date.now(),
        event_ts: Date.now(),
      } as any);
    }

    await vi.advanceTimersByTimeAsync(writer.writeInterval);

    expect(mockInsert).toHaveBeenCalledTimes(1);
    expect(mockInsert).toHaveBeenCalledWith(
      "traces",
      expect.arrayContaining(
        new Array(partialQueueSize).fill(expect.any(Object)),
      ),
      expect.any(Object)
    );
    expect(writer["queue"][TableName.Traces]).toHaveLength(0);
  });

  it("should continue functioning after encountering an error", async () => {
    const mockInsert = vi
      .spyOn(dorisClientMock, "insert")
      .mockRejectedValueOnce(new Error("DB Error"))
      .mockResolvedValue(undefined);

    writer.addToQueue(TableName.Traces, {
      id: "1",
      name: "test1",
      metadata: {},
      tags: [],
      timestamp: Date.now(),
      public: false,
      bookmarked: false,
      environment: "test",
      project_id: "project1",
      is_deleted: 0,
      created_at: Date.now(),
      updated_at: Date.now(),
      event_ts: Date.now(),
    } as any);
    await vi.advanceTimersByTimeAsync(writer.writeInterval);

    writer.addToQueue(TableName.Traces, {
      id: "2",
      name: "test2",
      metadata: {},
      tags: [],
      timestamp: Date.now(),
      public: false,
      bookmarked: false,
      environment: "test",
      project_id: "project1",
      is_deleted: 0,
      created_at: Date.now(),
      updated_at: Date.now(),
      event_ts: Date.now(),
    } as any);
    await vi.advanceTimersByTimeAsync(writer.writeInterval);

    expect(mockInsert).toHaveBeenCalledTimes(2);
    expect(writer["queue"][TableName.Traces]).toHaveLength(0);
  });

  it("should handle BlobStorageFileLog table", async () => {
    const mockInsert = vi
      .spyOn(dorisClientMock, "insert")
      .mockResolvedValue(undefined);

    writer.addToQueue(TableName.BlobStorageFileLog, {
      id: "1",
      project_id: "project1",
      blob_id: "blob1",
      bucket_name: "test-bucket",
      object_key: "test/file.txt",
      created_at: Date.now(),
      updated_at: Date.now(),
      event_ts: Date.now(),
    } as any);

    await vi.advanceTimersByTimeAsync(writer.writeInterval);

    expect(mockInsert).toHaveBeenCalledTimes(1);
    expect(writer["queue"][TableName.BlobStorageFileLog]).toHaveLength(0);
  });

  it("should record correct metrics", async () => {
    const recordIncrementSpy = vi.spyOn(serverExports, "recordIncrement");
    const recordGaugeSpy = vi.spyOn(serverExports, "recordGauge");
    const mockInsert = vi
      .spyOn(dorisClientMock, "insert")
      .mockResolvedValue(undefined);

    writer.addToQueue(TableName.Traces, {
      id: "1",
      name: "test",
      metadata: {},
      tags: [],
      timestamp: Date.now(),
      public: false,
      bookmarked: false,
      environment: "test",
      project_id: "project1",
      is_deleted: 0,
      created_at: Date.now(),
      updated_at: Date.now(),
      event_ts: Date.now(),
    } as any);

    await vi.advanceTimersByTimeAsync(writer.writeInterval);

    expect(recordIncrementSpy).toHaveBeenCalledWith(
      "langfuse.queue.doris_writer.request"
    );
    
    expect(recordGaugeSpy).toHaveBeenCalledWith(
      "ingestion_doris_insert_queue_length",
      0,
      {
        unit: "records",
        entityType: "traces",
      }
    );
  });

  it("should use forceFlushAll method", async () => {
    const mockInsert = vi
      .spyOn(dorisClientMock, "insert")
      .mockResolvedValue(undefined);
    
    writer.addToQueue(TableName.Traces, {
      id: "1",
      name: "test",
      metadata: {},
      tags: [],
      timestamp: Date.now(),
      public: false,
      bookmarked: false,
      environment: "test",
      project_id: "project1",
      is_deleted: 0,
      created_at: Date.now(),
      updated_at: Date.now(),
      event_ts: Date.now(),
    } as any);

    await writer.forceFlushAll(true);

    expect(mockInsert).toHaveBeenCalledTimes(1);
    expect(writer["queue"][TableName.Traces]).toHaveLength(0);
  });
}); 