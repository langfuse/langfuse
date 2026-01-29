import {
  logger,
  queryClickhouse,
  QueueName,
} from "@langfuse/shared/src/server";
import { env } from "../../env";
import { WorkerManager } from "../../queues/workerManager";
import { PeriodicRunner } from "../../utils/PeriodicRunner";

interface MutationCount {
  database: string;
  table: string;
  mutation_count: number;
}

type QueueAction = "pause" | "resume";

interface QueueDecision {
  queueName: QueueName;
  action: QueueAction;
  reason: string;
}

/**
 * Internal runner class that extends PeriodicRunner and delegates to MutationMonitor
 */
class MutationMonitorRunner extends PeriodicRunner {
  protected get name(): string {
    return "MutationMonitor";
  }

  protected get defaultIntervalMs(): number {
    return env.LANGFUSE_MUTATION_MONITOR_CHECK_INTERVAL_MS;
  }

  protected async execute(): Promise<void> {
    await MutationMonitor.checkMutations();
  }
}

/**
 * MutationMonitor pauses and resumes queue processing
 * based on how ClickHouse mutations progress.
 *
 * Requires correct ClickHouse grants to work:
 * ```
 * GRANT SELECT(database, `table`, is_done) ON system.mutations TO <role>;
 * ```
 * where `role` is the role used by Langfuse to connect to ClickHouse, usually `app`.
 *
 * `QUEUE_TABLE_MAPPING` below shows how mutations on various tables map to queues.
 *
 * - `LANGFUSE_MUTATION_MONITOR_ENABLED` must be set to `true` to enable this feature.
 * - `LANGFUSE_MUTATION_MONITOR_CHECK_INTERVAL_MS` defines how often to check for mutations.
 * - `LANGFUSE_DELETION_MUTATIONS_MAX_COUNT` once any table for a queue exceeds this threshold, that queue is PAUSED.
 * `- LANGFUSE_DELETION_MUTATIONS_SAFE_COUNT` once all tables for a queue are below this threshold, that queue is RESUMED.
 */
export class MutationMonitor {
  private static runner = new MutationMonitorRunner();
  private static pausedQueues: Set<QueueName> = new Set();

  // Mapping of which ClickHouse tables each deletion queue affects
  private static readonly QUEUE_TABLE_MAPPING: Partial<
    Record<QueueName, string[]>
  > = {
    [QueueName.TraceDelete]: ["traces", "observations", "scores", "events"],
    [QueueName.ScoreDelete]: ["scores"],
    [QueueName.DatasetDelete]: ["dataset_run_items_rmt"],
    [QueueName.ProjectDelete]: ["scores", "dataset_run_items_rmt"],
    [QueueName.DataRetentionProcessingQueue]: [
      "traces",
      "observations",
      "scores",
      "events",
    ],
  };

  private static readonly TABLES_TO_MONITOR = Array.from(
    new Set(Object.values(this.QUEUE_TABLE_MAPPING).flat()).values(),
  );

  /**
   * Start the mutation monitoring service
   */
  public static start(): void {
    if (env.LANGFUSE_MUTATION_MONITOR_ENABLED !== "true") {
      logger.info("Mutation monitor is disabled");
      return;
    }

    logger.info("Starting mutation monitor", {
      checkIntervalMs: env.LANGFUSE_MUTATION_MONITOR_CHECK_INTERVAL_MS,
      maxCount: env.LANGFUSE_DELETION_MUTATIONS_MAX_COUNT,
      safeCount: env.LANGFUSE_DELETION_MUTATIONS_SAFE_COUNT,
    });
    this.runner.start();
  }

  /**
   * Stop the mutation monitoring service
   */
  public static stop(): void {
    this.runner.stop();
    logger.info("Mutation monitor stopped");
  }

  /**
   * Decision function - determines which queues to pause/resume
   */
  public static makeDecisions(
    mutationCounts: Map<string, number>,
    queueTableMapping: Partial<Record<QueueName, string[]>>,
    maxThreshold: number,
    safeThreshold: number,
  ): QueueDecision[] {
    const decisions: QueueDecision[] = [];
    const decisionMap: Map<QueueName, QueueAction> = new Map();

    // Find tables over MAX threshold
    const tablesOverMax = Array.from(mutationCounts.entries())
      .filter(([, count]) => count >= maxThreshold)
      .map(([table]) => table);

    const tableToQueuesMap: Map<string, QueueName[]> = Object.entries(
      queueTableMapping,
    ).reduce((map, [queue, tables]) => {
      for (const table of tables) {
        if (!map.has(table)) {
          map.set(table, []);
        }
        map.get(table)!.push(queue as QueueName);
      }
      return map;
    }, new Map());

    // Decision 1: Pause queues affecting over-threshold tables
    for (const table of tablesOverMax) {
      const affectedQueues = tableToQueuesMap.get(table) || [];
      for (const queue of affectedQueues) {
        if (!decisionMap.has(queue)) {
          decisions.push({
            queueName: queue,
            action: "pause",
            reason: `${table}=${mutationCounts.get(table)}`,
          });
          decisionMap.set(queue, "pause");
        }
      }
    }

    // Decision 2: Resume queues where ALL tables are safe
    for (const [queue, tables] of Object.entries(queueTableMapping)) {
      const allSafe = tables.every(
        (table) => (mutationCounts.get(table) ?? 0) < safeThreshold,
      );

      if (allSafe) {
        if (!decisionMap.has(queue as QueueName)) {
          decisionMap.set(queue as QueueName, "resume");
          decisions.push({
            queueName: queue as QueueName,
            action: "resume",
            reason: "",
          });
        } else {
          // if there is a contradictory action, we log an error
          logger.error(`Contradictory decisions for ${queue}`);
        }
      }
    }

    return decisions;
  }

  /**
   * Check ClickHouse mutations and pause/resume workers as needed
   */
  public static async checkMutations(): Promise<void> {
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

      logger.debug("Mutation stats", {
        mutationCounts: Object.fromEntries(mutationCounts),
        pausedQueues: Array.from(this.pausedQueues),
        threshold: env.LANGFUSE_DELETION_MUTATIONS_MAX_COUNT,
      });

      const decisions = this.makeDecisions(
        mutationCounts,
        this.QUEUE_TABLE_MAPPING,
        env.LANGFUSE_DELETION_MUTATIONS_MAX_COUNT,
        env.LANGFUSE_DELETION_MUTATIONS_SAFE_COUNT,
      );

      // Separate decisions by action
      const pauseDecisions = decisions.filter((d) => d.action === "pause");
      const resumeDecisions = decisions.filter((d) => d.action === "resume");

      // Execute pause decisions
      if (pauseDecisions.length > 0) {
        const queuesToPause = new Set(pauseDecisions.map((d) => d.queueName));
        const reasons = pauseDecisions.map((d) => d.reason);
        await this.pauseWorkers(queuesToPause, mutationCounts, reasons);
      }

      // Execute resume decisions
      if (resumeDecisions.length > 0) {
        const queuesToResume = new Set(resumeDecisions.map((d) => d.queueName));
        await this.resumeWorkers(queuesToResume, mutationCounts);
      }
    } catch (error) {
      logger.error("Error checking ClickHouse mutations", error);
    }
  }

  /**
   * Pause workers (pure execution - no decision logic)
   */
  private static async pauseWorkers(
    queuesToPause: Set<QueueName>,
    mutationCounts: Map<string, number>,
    offendingTables: string[],
  ): Promise<void> {
    for (const queueName of queuesToPause) {
      // Skip if already paused (optimization)
      if (this.pausedQueues.has(queueName)) {
        continue;
      }

      try {
        const worker = WorkerManager.getWorker(queueName);
        if (!worker) {
          logger.warn(`${queueName} worker not found, cannot pause`);
          continue;
        }

        await worker.pause();
        this.pausedQueues.add(queueName);

        logger.warn(`Paused ${queueName}`, {
          reason: `tables over threshold: ${offendingTables.join(", ")}`,
          threshold: env.LANGFUSE_DELETION_MUTATIONS_MAX_COUNT,
          mutationCounts: Object.fromEntries(mutationCounts),
        });
      } catch (error) {
        logger.error(`Error pausing ${queueName}`, error);
      }
    }
  }

  /**
   * Resume workers (pure execution - no decision logic)
   */
  private static async resumeWorkers(
    queuesToResume: Set<QueueName>,
    mutationCounts: Map<string, number>,
  ): Promise<void> {
    for (const queueName of queuesToResume) {
      // Skip if not paused (optimization)
      if (!this.pausedQueues.has(queueName)) {
        continue;
      }

      try {
        const worker = WorkerManager.getWorker(queueName);
        if (!worker) {
          logger.warn(`${queueName} worker not found, cannot resume`);
          continue;
        }

        await worker.resume();
        this.pausedQueues.delete(queueName);

        logger.info(`Resumed ${queueName}`, {
          reason: "all tables below safe threshold",
          safeThreshold: env.LANGFUSE_DELETION_MUTATIONS_SAFE_COUNT,
          mutationCounts: Object.fromEntries(mutationCounts),
        });
      } catch (error) {
        logger.error(`Error resuming ${queueName}`, error);
      }
    }
  }

  /**
   * Get the paused queues (useful for testing)
   */
  public static getPausedQueues(): Set<QueueName> {
    return new Set(this.pausedQueues);
  }

  /**
   * Check if a specific queue is paused (useful for testing)
   */
  public static isQueuePaused(queue: QueueName): boolean {
    return this.pausedQueues.has(queue);
  }

  /**
   * Reset the state (useful for testing)
   */
  public static resetState(): void {
    this.pausedQueues.clear();
    this.runner.stop();
  }
}
