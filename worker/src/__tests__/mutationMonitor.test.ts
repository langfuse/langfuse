import { expect, describe, it, beforeEach, vi, afterEach } from "vitest";
import { MutationMonitor } from "../features/mutation-monitoring/mutationMonitor";
import { WorkerManager } from "../queues/workerManager";
import * as shared from "@langfuse/shared/src/server";
import { Worker } from "bullmq";

// Mock the dependencies
vi.mock("@langfuse/shared/src/server", async () => {
  const actual = await vi.importActual("@langfuse/shared/src/server");
  return {
    ...actual,
    queryClickhouse: vi.fn(),
    logger: {
      info: vi.fn(),
      debug: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
  };
});

vi.mock("../queues/workerManager");
vi.mock("../env", () => ({
  env: {
    LANGFUSE_MUTATION_MONITOR_ENABLED: "true",
    LANGFUSE_MUTATION_MONITOR_CHECK_INTERVAL_MS: 1000,
    LANGFUSE_DELETION_MUTATIONS_MAX_COUNT: 40,
    LANGFUSE_DELETION_MUTATIONS_SAFE_COUNT: 15,
    CLICKHOUSE_DB: "default",
  },
}));

describe("MutationMonitor", () => {
  let mockWorker: Partial<Worker>;
  let queryClickhouseMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    // Reset state before each test
    MutationMonitor.resetState();
    MutationMonitor.stop();

    // Create mock worker with pause/resume methods
    mockWorker = {
      pause: vi.fn().mockResolvedValue(undefined),
      resume: vi.fn().mockResolvedValue(undefined),
    };

    // Setup mocks
    queryClickhouseMock = vi.mocked(shared.queryClickhouse);
    vi.mocked(WorkerManager.getWorker).mockReturnValue(mockWorker as Worker);
  });

  afterEach(() => {
    MutationMonitor.stop();
    vi.clearAllMocks();
  });

  describe("start and stop", () => {
    it("should stop the monitor", () => {
      MutationMonitor.start();
      // Verify it doesn't throw and logger is called
      expect(shared.logger.info).toHaveBeenCalledWith(
        "Starting mutation monitor",
        expect.objectContaining({
          checkIntervalMs: 1000,
          maxCount: 40,
          safeCount: 15,
        }),
      );
      MutationMonitor.stop();
      expect(shared.logger.info).toHaveBeenCalledWith(
        "Mutation monitor stopped",
      );
    });

    it("should not start multiple times", () => {
      MutationMonitor.start();
      MutationMonitor.start();
      expect(shared.logger.warn).toHaveBeenCalledWith(
        "Mutation monitor is already running",
      );
    });
  });

  describe("mutation checking logic", () => {
    it("should pause workers when any table exceeds MAX_COUNT", async () => {
      queryClickhouseMock.mockResolvedValueOnce([
        { database: "default", table: "traces", mutation_count: 50 },
        { database: "default", table: "observations", mutation_count: 10 },
        { database: "default", table: "scores", mutation_count: 5 },
      ]);

      MutationMonitor.start();

      // Wait for the check to complete
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(mockWorker.pause).toHaveBeenCalledTimes(1);
      expect(MutationMonitor.getIsPaused()).toBe(true);
      expect(shared.logger.warn).toHaveBeenCalledWith(
        "Mutation threshold exceeded, pausing TraceDelete workers",
        expect.objectContaining({
          threshold: 40,
          maxMutationCount: 50,
          tableWithMaxMutations: "traces",
        }),
      );
    });

    it("should resume workers when mutations drop below SAFE_COUNT", async () => {
      // First, pause the workers
      queryClickhouseMock.mockResolvedValueOnce([
        { database: "default", table: "traces", mutation_count: 50 },
      ]);

      MutationMonitor.start();
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(MutationMonitor.getIsPaused()).toBe(true);
      vi.clearAllMocks();

      // Now mutations drop below safe threshold
      queryClickhouseMock.mockResolvedValueOnce([
        { database: "default", table: "traces", mutation_count: 10 },
        { database: "default", table: "observations", mutation_count: 5 },
        { database: "default", table: "scores", mutation_count: 2 },
      ]);

      // Trigger another check manually by waiting
      await new Promise((resolve) => setTimeout(resolve, 1100));

      expect(mockWorker.resume).toHaveBeenCalledTimes(1);
      expect(MutationMonitor.getIsPaused()).toBe(false);
      expect(shared.logger.info).toHaveBeenCalledWith(
        "Mutations below safe threshold, resuming TraceDelete workers",
        expect.objectContaining({
          safeThreshold: 15,
          maxMutationCount: 10,
        }),
      );
    });

    it("should not pause if already paused", async () => {
      // First pause
      queryClickhouseMock.mockResolvedValue([
        { database: "default", table: "traces", mutation_count: 50 },
      ]);

      MutationMonitor.start();
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(mockWorker.pause).toHaveBeenCalledTimes(1);
      vi.clearAllMocks();

      // Wait for another check cycle
      await new Promise((resolve) => setTimeout(resolve, 1100));

      // Should not call pause again
      expect(mockWorker.pause).not.toHaveBeenCalled();
    });

    it("should not resume if already running", async () => {
      queryClickhouseMock.mockResolvedValue([
        { database: "default", table: "traces", mutation_count: 10 },
      ]);

      MutationMonitor.start();
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Should not call resume since it's not paused
      expect(mockWorker.resume).not.toHaveBeenCalled();
    });

    it("should check per-table and pause if ANY table exceeds threshold", async () => {
      // Only observations exceeds threshold
      queryClickhouseMock.mockResolvedValueOnce([
        { database: "default", table: "traces", mutation_count: 10 },
        { database: "default", table: "observations", mutation_count: 45 },
        { database: "default", table: "scores", mutation_count: 5 },
      ]);

      MutationMonitor.start();
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(mockWorker.pause).toHaveBeenCalledTimes(1);
      expect(MutationMonitor.getIsPaused()).toBe(true);
      expect(shared.logger.warn).toHaveBeenCalledWith(
        "Mutation threshold exceeded, pausing TraceDelete workers",
        expect.objectContaining({
          maxMutationCount: 45,
          tableWithMaxMutations: "observations",
        }),
      );
    });

    it("should handle empty results (no pending mutations)", async () => {
      queryClickhouseMock.mockResolvedValueOnce([]);

      MutationMonitor.start();
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Should not pause since all counts are 0
      expect(mockWorker.pause).not.toHaveBeenCalled();
      expect(MutationMonitor.getIsPaused()).toBe(false);
    });

    it("should handle partial results (some tables missing)", async () => {
      // Only one table returned
      queryClickhouseMock.mockResolvedValueOnce([
        { database: "default", table: "traces", mutation_count: 50 },
      ]);

      MutationMonitor.start();
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Should still pause because traces exceeds threshold
      expect(mockWorker.pause).toHaveBeenCalledTimes(1);
      expect(MutationMonitor.getIsPaused()).toBe(true);
    });

    it("should stay in hysteresis zone (between SAFE and MAX)", async () => {
      // First, pause the workers
      queryClickhouseMock.mockResolvedValueOnce([
        { database: "default", table: "traces", mutation_count: 50 },
      ]);

      MutationMonitor.start();
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(MutationMonitor.getIsPaused()).toBe(true);
      vi.clearAllMocks();

      // Now mutations are between SAFE (15) and MAX (40)
      queryClickhouseMock.mockResolvedValueOnce([
        { database: "default", table: "traces", mutation_count: 25 },
      ]);

      await new Promise((resolve) => setTimeout(resolve, 1100));

      // Should remain paused (hysteresis)
      expect(mockWorker.resume).not.toHaveBeenCalled();
      expect(MutationMonitor.getIsPaused()).toBe(true);
    });
  });

  describe("error handling", () => {
    it("should handle ClickHouse query errors gracefully", async () => {
      queryClickhouseMock.mockRejectedValueOnce(new Error("ClickHouse error"));

      MutationMonitor.start();
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(shared.logger.error).toHaveBeenCalledWith(
        "Error checking ClickHouse mutations",
        expect.any(Error),
      );
      // Should not crash
      expect(MutationMonitor.getIsPaused()).toBe(false);
    });

    it("should handle worker not found gracefully", async () => {
      vi.mocked(WorkerManager.getWorker).mockReturnValueOnce(undefined);

      queryClickhouseMock.mockResolvedValueOnce([
        { database: "default", table: "traces", mutation_count: 50 },
      ]);

      MutationMonitor.start();
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(shared.logger.warn).toHaveBeenCalledWith(
        "TraceDelete worker not found, cannot pause",
      );
    });

    it("should handle worker.pause errors gracefully", async () => {
      mockWorker.pause = vi
        .fn()
        .mockRejectedValueOnce(new Error("Pause failed"));

      queryClickhouseMock.mockResolvedValueOnce([
        { database: "default", table: "traces", mutation_count: 50 },
      ]);

      MutationMonitor.start();
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(shared.logger.error).toHaveBeenCalledWith(
        "Error pausing TraceDelete workers",
        expect.any(Error),
      );
    });

    it("should handle worker.resume errors gracefully", async () => {
      // First pause
      queryClickhouseMock.mockResolvedValueOnce([
        { database: "default", table: "traces", mutation_count: 50 },
      ]);

      MutationMonitor.start();
      await new Promise((resolve) => setTimeout(resolve, 100));
      vi.clearAllMocks();

      // Mock resume to fail
      mockWorker.resume = vi
        .fn()
        .mockRejectedValueOnce(new Error("Resume failed"));

      // Now drop mutations
      queryClickhouseMock.mockResolvedValueOnce([
        { database: "default", table: "traces", mutation_count: 10 },
      ]);

      await new Promise((resolve) => setTimeout(resolve, 1100));

      expect(shared.logger.error).toHaveBeenCalledWith(
        "Error resuming TraceDelete workers",
        expect.any(Error),
      );
    });
  });
});
