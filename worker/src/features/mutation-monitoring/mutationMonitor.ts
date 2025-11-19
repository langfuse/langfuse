import {
  logger,
  queryClickhouse,
  QueueName,
} from "@langfuse/shared/src/server";
import { env } from "../../env";
import { WorkerManager } from "../../queues/workerManager";

interface MutationCount {
  database: string;
  table: string;
  mutation_count: number;
}

export class MutationMonitor {
  private static timeoutId: NodeJS.Timeout | null = null;
  private static isPaused = false;
  private static isRunning = false;
  private static readonly TABLES_TO_MONITOR = [
    "traces",
    "observations",
    "scores",
  ];

  /**
   * Start the mutation monitoring service
   */
  public static start(): void {
    if (this.isRunning) {
      logger.warn("Mutation monitor is already running");
      return;
    }

    if (env.LANGFUSE_MUTATION_MONITOR_ENABLED !== "true") {
      logger.info("Mutation monitor is disabled");
      return;
    }

    this.isRunning = true;
    logger.info("Starting mutation monitor", {
      checkIntervalMs: env.LANGFUSE_MUTATION_MONITOR_CHECK_INTERVAL_MS,
      maxCount: env.LANGFUSE_DELETION_MUTATIONS_MAX_COUNT,
      safeCount: env.LANGFUSE_DELETION_MUTATIONS_SAFE_COUNT,
    });

    // Start the monitoring loop
    void this.checkMutationsAndScheduleNext();
  }

  /**
   * Stop the mutation monitoring service
   */
  public static stop(): void {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    if (this.timeoutId !== null) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
    logger.info("Mutation monitor stopped");
  }

  /**
   * Schedule the next mutation check after the specified interval
   */
  private static scheduleNextCheck(): void {
    if (!this.isRunning) {
      return;
    }

    this.timeoutId = setTimeout(() => {
      void this.checkMutationsAndScheduleNext();
    }, env.LANGFUSE_MUTATION_MONITOR_CHECK_INTERVAL_MS);
  }

  /**
   * Check mutations and schedule the next check (ensures sequential execution)
   */
  private static async checkMutationsAndScheduleNext(): Promise<void> {
    try {
      await this.checkMutations();
    } catch (error) {
      logger.error("Unexpected error in mutation monitoring loop", error);
    } finally {
      // Always schedule next check, even if current check failed
      this.scheduleNextCheck();
    }
  }

  /**
   * Check ClickHouse mutations and pause/resume workers as needed
   */
  private static async checkMutations(): Promise<void> {
    try {
      const query = `
        SELECT
          database,
          table,
          count() as mutation_count
        FROM system.mutations
        WHERE database = {database: String}
          AND table IN ({tables: Array(String)})
          AND is_done = 0
        GROUP BY database, table
      `;

      const results = await queryClickhouse<MutationCount>({
        query,
        params: {
          database: env.CLICKHOUSE_DB,
          tables: this.TABLES_TO_MONITOR,
        },
      });

      // Create a map of table -> mutation count
      const mutationCounts = new Map<string, number>();
      for (const table of this.TABLES_TO_MONITOR) {
        mutationCounts.set(table, 0);
      }
      for (const result of results) {
        mutationCounts.set(result.table, result.mutation_count);
      }

      // Find the maximum mutation count across all tables
      const maxMutationCount = Math.max(...mutationCounts.values());
      const tableWithMaxMutations = Array.from(mutationCounts.entries()).find(
        ([, count]) => count === maxMutationCount,
      )?.[0];

      logger.debug("Mutation stats", {
        mutationCounts: Object.fromEntries(mutationCounts),
        maxMutationCount,
        tableWithMaxMutations,
        isPaused: this.isPaused,
        threshold: env.LANGFUSE_DELETION_MUTATIONS_MAX_COUNT,
      });

      // Check if we need to pause or resume workers
      if (maxMutationCount >= env.LANGFUSE_DELETION_MUTATIONS_MAX_COUNT) {
        await this.pauseWorkers(
          maxMutationCount,
          tableWithMaxMutations,
          mutationCounts,
        );
      } else if (
        maxMutationCount < env.LANGFUSE_DELETION_MUTATIONS_SAFE_COUNT
      ) {
        await this.resumeWorkers(maxMutationCount, mutationCounts);
      }
    } catch (error) {
      logger.error("Error checking ClickHouse mutations", error);
    }
  }

  /**
   * Pause TraceDelete workers to reduce mutation load on ClickHouse
   */
  private static async pauseWorkers(
    maxMutationCount: number,
    tableWithMaxMutations: string | undefined,
    mutationCounts: Map<string, number>,
  ): Promise<void> {
    // Only pause if not already paused
    if (this.isPaused) {
      return;
    }

    try {
      const worker = WorkerManager.getWorker(QueueName.TraceDelete);
      if (!worker) {
        logger.warn("TraceDelete worker not found, cannot pause");
        return;
      }

      await worker.pause();
      this.isPaused = true;

      logger.warn("Mutation threshold exceeded, pausing TraceDelete workers", {
        threshold: env.LANGFUSE_DELETION_MUTATIONS_MAX_COUNT,
        maxMutationCount,
        tableWithMaxMutations,
        mutationCounts: Object.fromEntries(mutationCounts),
      });
    } catch (error) {
      logger.error("Error pausing TraceDelete workers", error);
    }
  }

  /**
   * Resume TraceDelete workers after mutation load has decreased
   */
  private static async resumeWorkers(
    maxMutationCount: number,
    mutationCounts: Map<string, number>,
  ): Promise<void> {
    // Only resume if currently paused
    if (!this.isPaused) {
      return;
    }

    try {
      const worker = WorkerManager.getWorker(QueueName.TraceDelete);
      if (!worker) {
        logger.warn("TraceDelete worker not found, cannot resume");
        return;
      }

      await worker.resume();
      this.isPaused = false;

      logger.info(
        "Mutations below safe threshold, resuming TraceDelete workers",
        {
          safeThreshold: env.LANGFUSE_DELETION_MUTATIONS_SAFE_COUNT,
          maxMutationCount,
          mutationCounts: Object.fromEntries(mutationCounts),
        },
      );
    } catch (error) {
      logger.error("Error resuming TraceDelete workers", error);
    }
  }

  /**
   * Get the current pause state (useful for testing)
   */
  public static getIsPaused(): boolean {
    return this.isPaused;
  }

  /**
   * Reset the state (useful for testing)
   */
  public static resetState(): void {
    this.isPaused = false;
    this.isRunning = false;
    if (this.timeoutId !== null) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
  }
}
