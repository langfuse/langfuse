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
    QueueName: {
      TraceDelete: "trace-delete",
      ScoreDelete: "score-delete",
      DatasetDelete: "dataset-delete",
      ProjectDelete: "project-delete",
      DataRetentionProcessingQueue: "data-retention-processing-queue",
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
  // Test data
  const queueTableMapping = {
    "trace-delete": ["traces", "observations", "scores"],
    "score-delete": ["scores"],
    "dataset-delete": ["dataset_run_items_rmt"],
    "project-delete": [
      "traces",
      "observations",
      "scores",
      "dataset_run_items_rmt",
    ],
    "data-retention-processing-queue": ["traces", "observations", "scores"],
  };

  describe("makeDecisions tests", () => {
    it("should decide to pause queues when scores exceeds MAX", () => {
      const counts = new Map([
        ["traces", 10],
        ["observations", 10],
        ["scores", 50],
      ]);

      const decisions = MutationMonitor.makeDecisions(
        counts,
        queueTableMapping,
        40, // MAX
        15, // SAFE
      );

      // Pause decisions for queues affecting scores
      const pauseDecisions = decisions.filter((d) => d.action === "pause");
      expect(pauseDecisions).toHaveLength(4);
      expect(pauseDecisions.map((d) => d.queueName)).toContain("trace-delete");
      expect(pauseDecisions.map((d) => d.queueName)).toContain("score-delete");
      expect(pauseDecisions.map((d) => d.queueName)).toContain(
        "project-delete",
      );
      expect(pauseDecisions.map((d) => d.queueName)).toContain(
        "data-retention-processing-queue",
      );

      // Also resume decision for DatasetDelete (its table is safe)
      const resumeDecisions = decisions.filter((d) => d.action === "resume");
      expect(resumeDecisions.map((d) => d.queueName)).toContain(
        "dataset-delete",
      );
    });

    it("should decide to resume all queues when all tables are below SAFE", () => {
      const counts = new Map([
        ["traces", 10],
        ["observations", 12],
        ["scores", 14], // All < 15
        ["dataset_run_items_rmt", 5],
      ]);

      const decisions = MutationMonitor.makeDecisions(
        counts,
        queueTableMapping,
        40,
        15,
      );

      // All queues should have resume decisions (all tables safe)
      expect(decisions.every((d) => d.action === "resume")).toBe(true);
      expect(decisions).toHaveLength(5);
      expect(decisions.map((d) => d.queueName)).toContain("trace-delete");
      expect(decisions.map((d) => d.queueName)).toContain("score-delete");
      expect(decisions.map((d) => d.queueName)).toContain("dataset-delete");
      expect(decisions.map((d) => d.queueName)).toContain("project-delete");
      expect(decisions.map((d) => d.queueName)).toContain(
        "data-retention-processing-queue",
      );
    });

    it("should NOT decide to resume queues if ANY of their tables is >= SAFE", () => {
      const counts = new Map([
        ["traces", 10],
        ["observations", 12],
        ["scores", 15], // At SAFE threshold
        ["dataset_run_items_rmt", 5],
      ]);

      const decisions = MutationMonitor.makeDecisions(
        counts,
        queueTableMapping,
        40,
        15,
      );

      // Only DatasetDelete should have resume (doesn't depend on scores)
      const resumeDecisions = decisions.filter((d) => d.action === "resume");
      expect(resumeDecisions).toHaveLength(1);
      expect(resumeDecisions[0].queueName).toBe("dataset-delete");

      // Queues depending on scores should NOT have resume decisions
      expect(resumeDecisions.map((d) => d.queueName)).not.toContain(
        "trace-delete",
      );
      expect(resumeDecisions.map((d) => d.queueName)).not.toContain(
        "score-delete",
      );
    });

    it("should handle multiple tables over threshold", () => {
      const counts = new Map([
        ["traces", 50],
        ["scores", 45],
        ["observations", 10],
        ["dataset_run_items_rmt", 5],
      ]);

      const decisions = MutationMonitor.makeDecisions(
        counts,
        queueTableMapping,
        40,
        15,
      );

      // Pause decisions for queues affecting traces/scores
      const pauseDecisions = decisions.filter((d) => d.action === "pause");
      expect(pauseDecisions.map((d) => d.queueName)).toContain("trace-delete");
      expect(pauseDecisions.map((d) => d.queueName)).toContain("score-delete");
      expect(pauseDecisions.map((d) => d.queueName)).toContain(
        "project-delete",
      );
      expect(pauseDecisions.map((d) => d.queueName)).toContain(
        "data-retention-processing-queue",
      );

      // Resume decision for DatasetDelete (its table is safe)
      const resumeDecisions = decisions.filter((d) => d.action === "resume");
      expect(resumeDecisions.map((d) => d.queueName)).toContain(
        "dataset-delete",
      );
    });

    it("should decide to resume ScoreDelete independently", () => {
      const counts = new Map([
        ["traces", 20], // In hysteresis zone (between SAFE and MAX)
        ["observations", 10],
        ["scores", 10], // Below SAFE
        ["dataset_run_items_rmt", 5],
      ]);

      const decisions = MutationMonitor.makeDecisions(
        counts,
        queueTableMapping,
        40,
        15,
      );

      // ScoreDelete and DatasetDelete should resume (their tables are safe)
      const resumeDecisions = decisions.filter((d) => d.action === "resume");
      expect(resumeDecisions).toHaveLength(2);
      expect(resumeDecisions.map((d) => d.queueName)).toContain("score-delete");
      expect(resumeDecisions.map((d) => d.queueName)).toContain(
        "dataset-delete",
      );

      // TraceDelete should NOT resume (traces=20 >= SAFE=15)
      expect(resumeDecisions.map((d) => d.queueName)).not.toContain(
        "trace-delete",
      );
    });

    it("should handle DatasetDelete independently", () => {
      const counts = new Map([
        ["traces", 10],
        ["observations", 10],
        ["scores", 10],
        ["dataset_run_items_rmt", 50],
      ]);

      const decisions = MutationMonitor.makeDecisions(
        counts,
        queueTableMapping,
        40,
        15,
      );

      // Pause decisions for queues affecting dataset_run_items_rmt
      const pauseDecisions = decisions.filter((d) => d.action === "pause");
      expect(pauseDecisions).toHaveLength(2);
      expect(pauseDecisions.map((d) => d.queueName)).toContain(
        "dataset-delete",
      );
      expect(pauseDecisions.map((d) => d.queueName)).toContain(
        "project-delete",
      );

      // Resume decisions for queues only affecting traces/observations/scores
      const resumeDecisions = decisions.filter((d) => d.action === "resume");
      expect(resumeDecisions.map((d) => d.queueName)).toContain("trace-delete");
      expect(resumeDecisions.map((d) => d.queueName)).toContain("score-delete");
      expect(resumeDecisions.map((d) => d.queueName)).toContain(
        "data-retention-processing-queue",
      );
    });

    it("should handle empty mutation counts", () => {
      const counts = new Map([
        ["traces", 0],
        ["observations", 0],
        ["scores", 0],
        ["dataset_run_items_rmt", 0],
      ]);

      const decisions = MutationMonitor.makeDecisions(
        counts,
        queueTableMapping,
        40,
        15,
      );

      // All queues should have resume decisions (all tables safe)
      expect(decisions.every((d) => d.action === "resume")).toBe(true);
      expect(decisions).toHaveLength(5);
    });

    it("should handle missing tables in mutation counts", () => {
      const counts = new Map([
        ["traces", 50],
        // observations and scores missing (treated as 0)
      ]);

      const decisions = MutationMonitor.makeDecisions(
        counts,
        queueTableMapping,
        40,
        15,
      );

      // Pause decisions for queues affecting traces
      const pauseDecisions = decisions.filter((d) => d.action === "pause");
      expect(pauseDecisions.map((d) => d.queueName)).toContain("trace-delete");
      expect(pauseDecisions.map((d) => d.queueName)).toContain(
        "project-delete",
      );
      expect(pauseDecisions.map((d) => d.queueName)).toContain(
        "data-retention-processing-queue",
      );

      // Resume decisions for queues not affecting traces
      const resumeDecisions = decisions.filter((d) => d.action === "resume");
      expect(resumeDecisions.map((d) => d.queueName)).toContain("score-delete");
      expect(resumeDecisions.map((d) => d.queueName)).toContain(
        "dataset-delete",
      );
    });
  });

  describe("integration tests", () => {
    let mockWorkers: Map<string, Partial<Worker>>;
    let queryClickhouseMock: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      MutationMonitor.resetState();
      MutationMonitor.stop();

      mockWorkers = new Map();
      const queueNames = [
        "trace-delete",
        "score-delete",
        "dataset-delete",
        "project-delete",
        "data-retention-processing-queue",
      ];

      queueNames.forEach((queueName) => {
        mockWorkers.set(queueName, {
          pause: vi.fn().mockResolvedValue(undefined),
          resume: vi.fn().mockResolvedValue(undefined),
        });
      });

      queryClickhouseMock = vi.mocked(shared.queryClickhouse);
      vi.mocked(WorkerManager.getWorker).mockImplementation(
        (queueName: string) => mockWorkers.get(queueName) as Worker,
      );
    });

    afterEach(() => {
      MutationMonitor.stop();
      vi.clearAllMocks();
    });

    it("should execute pause decisions from ClickHouse data", async () => {
      queryClickhouseMock.mockResolvedValueOnce([
        { database: "default", table: "traces", mutation_count: 50 },
        { database: "default", table: "observations", mutation_count: 10 },
        { database: "default", table: "scores", mutation_count: 5 },
      ]);

      MutationMonitor.start();
      await new Promise((resolve) => setTimeout(resolve, 100));

      // TraceDelete should be paused
      expect(mockWorkers.get("trace-delete")?.pause).toHaveBeenCalled();
      expect(
        mockWorkers.get("data-retention-processing-queue")?.pause,
      ).toHaveBeenCalled();
    });

    it("should execute resume decisions", async () => {
      // First pause
      queryClickhouseMock.mockResolvedValueOnce([
        { database: "default", table: "traces", mutation_count: 50 },
      ]);

      MutationMonitor.start();
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(mockWorkers.get("trace-delete")?.pause).toHaveBeenCalled();
      vi.clearAllMocks();

      // Then drop below SAFE
      queryClickhouseMock.mockResolvedValueOnce([
        { database: "default", table: "traces", mutation_count: 10 },
        { database: "default", table: "observations", mutation_count: 10 },
        { database: "default", table: "scores", mutation_count: 10 },
      ]);

      await new Promise((resolve) => setTimeout(resolve, 1100));

      // Should resume
      expect(mockWorkers.get("trace-delete")?.resume).toHaveBeenCalled();
    });

    it("should handle ClickHouse errors gracefully", async () => {
      queryClickhouseMock.mockRejectedValueOnce(new Error("ClickHouse error"));

      MutationMonitor.start();
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(shared.logger.error).toHaveBeenCalledWith(
        "Error checking ClickHouse mutations",
        expect.any(Error),
      );
    });
  });
});
