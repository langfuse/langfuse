import {
  getDeletedProjects,
  logger,
  queryClickhouse,
  commandClickhouse,
  recordIncrement,
} from "@langfuse/shared/src/server";

export const BATCH_DELETION_TABLES = [
  "traces",
  "observations",
  "scores",
  "events_full",
  "events_core",
  "dataset_run_items_rmt",
] as const;
import { env } from "../../env";
import { PeriodicExclusiveRunner } from "../../utils/PeriodicExclusiveRunner";
import { RedisLock } from "../../utils/RedisLock";

export type BatchDeletionTable = (typeof BATCH_DELETION_TABLES)[number];

export const BATCH_PROJECT_CLEANER_LOCK_PREFIX =
  "langfuse:batch-project-cleaner";
export const BATCH_PROJECT_CLEANER_COUNT_LOCK_KEY = `${BATCH_PROJECT_CLEANER_LOCK_PREFIX}:count-query`;

// Safety net for an abandoned lock; successful count queries release it immediately.
const COUNT_LOCK_TTL_SECONDS = 10 * 60;
const COUNT_LOCK_RETRY_MIN_MS = 60_000;
const COUNT_LOCK_RETRY_JITTER_MS = 60_000;

interface ProjectCount {
  project_id: string;
  count: number;
}

interface DeleteAttempt {
  projectIds?: string[];
}

/**
 * BatchProjectCleaner handles bulk deletion of ClickHouse data for soft-deleted projects.
 *
 * Each instance processes one table (traces, observations, scores, events_full, events_core).
 * Multiple workers coordinate via Redis to ensure that only one cleaner runs
 * per table and only one ClickHouse count query runs across all tables.
 *
 * Flow:
 * 1. Query PG for projects with deleted_at set (no lock needed)
 * 2. Acquire the per-table Redis lock
 * 3. Acquire the global count-query lock and query ClickHouse
 * 4. Renew the per-table lock and execute DELETE
 * 5. On failure: renew the per-table lock and re-run the count query directly
 */
export class BatchProjectCleaner extends PeriodicExclusiveRunner {
  private readonly tableName: BatchDeletionTable;
  private readonly countQueryLock: RedisLock;

  protected get defaultIntervalMs(): number {
    return env.LANGFUSE_BATCH_PROJECT_CLEANER_SLEEP_ON_EMPTY_MS;
  }

  constructor(tableName: BatchDeletionTable) {
    // TTL = DELETE timeout + 5 minutes buffer
    const lockTtlSeconds =
      Math.ceil(env.LANGFUSE_BATCH_PROJECT_CLEANER_DELETE_TIMEOUT_MS / 1000) +
      300;

    super({
      name: `BatchProjectCleaner(${tableName})`,
      metricName: "batch_project_cleaner",
      metricScope: tableName,
      lockKey: `${BATCH_PROJECT_CLEANER_LOCK_PREFIX}:${tableName}`,
      lockTtlSeconds,
      onUnavailable: "fail",
    });
    this.tableName = tableName;
    this.countQueryLock = new RedisLock(BATCH_PROJECT_CLEANER_COUNT_LOCK_KEY, {
      ttlSeconds: COUNT_LOCK_TTL_SECONDS,
      name: `${this.instanceName}:count-query`,
      onUnavailable: "fail",
    });
  }

  /**
   * Start the batch cleaner service
   */
  public override start(): void {
    logger.info(`Starting ${this.instanceName}`, {
      checkIntervalMs: env.LANGFUSE_BATCH_PROJECT_CLEANER_CHECK_INTERVAL_MS,
      sleepOnEmptyMs: env.LANGFUSE_BATCH_PROJECT_CLEANER_SLEEP_ON_EMPTY_MS,
      projectLimit: env.LANGFUSE_BATCH_PROJECT_CLEANER_PROJECT_LIMIT,
      deleteTimeoutMs: env.LANGFUSE_BATCH_PROJECT_CLEANER_DELETE_TIMEOUT_MS,
    });
    super.start();
  }

  /**
   * Process a batch of deleted projects. Returns the delay until next run.
   */
  public override async processBatch(): Promise<number> {
    return this.execute();
  }

  /**
   * Process a batch of deleted projects. Returns the delay until next run.
   */
  protected async execute(): Promise<number> {
    const deletedProjectIds = await this.getDeletedProjectIds();
    if (!deletedProjectIds) {
      return env.LANGFUSE_BATCH_PROJECT_CLEANER_SLEEP_ON_EMPTY_MS;
    }

    const deleteAttempt: DeleteAttempt = {};
    const nextDelayMs = await this.withLock(
      () => this.processDeletedProjects(deletedProjectIds, deleteAttempt),
      (error) => this.handleDeleteFailure(error, deleteAttempt.projectIds),
    );

    return nextDelayMs ?? env.LANGFUSE_BATCH_PROJECT_CLEANER_CHECK_INTERVAL_MS;
  }

  private async getDeletedProjectIds(): Promise<string[] | undefined> {
    try {
      const deletedProjects = await getDeletedProjects(
        env.LANGFUSE_BATCH_PROJECT_CLEANER_PROJECT_LIMIT,
      );

      if (deletedProjects.length === 0) {
        logger.info(`${this.instanceName}: No deleted projects found`);
        return undefined;
      }

      return deletedProjects.map((project) => project.id);
    } catch (error) {
      logger.error(`${this.instanceName}: Failed to query deleted projects`, {
        error,
      });
      this.markRunFailed(error);
      return undefined;
    }
  }

  private async processDeletedProjects(
    deletedProjectIds: string[],
    deleteAttempt: DeleteAttempt,
  ): Promise<number> {
    let initialCounts: Map<string, number>;
    try {
      const counts = await this.getProjectCountsWithLock(deletedProjectIds);
      if (!counts) {
        return this.getCountLockRetryDelayMs();
      }
      initialCounts = counts;
    } catch (error) {
      logger.error(
        `${this.instanceName}: Failed to query ClickHouse counts`,
        error,
      );
      this.markRunFailed(error);
      return env.LANGFUSE_BATCH_PROJECT_CLEANER_SLEEP_ON_EMPTY_MS;
    }

    const projectIdsWithData = Array.from(initialCounts.entries())
      .filter(([, count]) => count > 0)
      .map(([projectId]) => projectId);

    if (projectIdsWithData.length === 0) {
      logger.info(
        `${this.instanceName}: No data found for deleted projects in ${this.tableName}`,
      );
      return env.LANGFUSE_BATCH_PROJECT_CLEANER_SLEEP_ON_EMPTY_MS;
    }

    await this.extendLockOnProgress(true);
    deleteAttempt.projectIds = projectIdsWithData;
    await this.executeDelete(projectIdsWithData);

    const totalRows = Array.from(initialCounts.values()).reduce(
      (sum, count) => sum + count,
      0,
    );
    logger.info(`${this.instanceName}: Batch deletion completed`, {
      table: this.tableName,
      projectsProcessed: projectIdsWithData.length,
      totalRowsTargeted: totalRows,
    });

    return env.LANGFUSE_BATCH_PROJECT_CLEANER_CHECK_INTERVAL_MS;
  }

  private async handleDeleteFailure(
    error: unknown,
    deleteAttemptProjectIds?: string[],
  ): Promise<number> {
    if (!deleteAttemptProjectIds) {
      return env.LANGFUSE_BATCH_PROJECT_CLEANER_SLEEP_ON_EMPTY_MS;
    }

    recordIncrement("langfuse.batch_project_cleaner.delete_failures", 1, {
      table: this.tableName,
    });

    const finalCounts = await this.getCountsAfterDeleteFailure(
      deleteAttemptProjectIds,
    );
    const incompleteProjects = finalCounts
      ? deleteAttemptProjectIds.filter(
          (projectId) => (finalCounts.get(projectId) ?? 0) > 0,
        )
      : deleteAttemptProjectIds;

    if (incompleteProjects.length > 0) {
      recordIncrement(
        "langfuse.batch_project_cleaner.incomplete_cleanups",
        incompleteProjects.length,
        { table: this.tableName },
      );
      logger.warn(`${this.instanceName}: Partial deletion completed`, {
        table: this.tableName,
        incompleteProjectCount: incompleteProjects.length,
        incompleteProjects: incompleteProjects.slice(0, 10),
        error: (error as Error).message,
      });
    } else {
      logger.info(
        `${this.instanceName}: All projects cleaned successfully on re-check`,
      );
    }

    return env.LANGFUSE_BATCH_PROJECT_CLEANER_CHECK_INTERVAL_MS;
  }

  private async getCountsAfterDeleteFailure(
    projectIds: string[],
  ): Promise<Map<string, number> | undefined> {
    try {
      await this.extendLockOnProgress(true);
      return await this.getProjectCounts(projectIds);
    } catch (error) {
      logger.error(
        `${this.instanceName}: Failed to renew lock or re-query counts after DELETE failure`,
        error,
      );
      return undefined;
    }
  }

  private async getProjectCountsWithLock(
    projectIds: string[],
  ): Promise<Map<string, number> | undefined> {
    const result = await this.countQueryLock.acquire();

    if (result !== "acquired") {
      if (result === "held_by_other") {
        this.markRunSkipped();
      } else {
        this.markRunFailed(
          new Error(`${this.instanceName}: Count-query lock unavailable`),
        );
      }
      return undefined;
    }

    try {
      return await this.getProjectCounts(projectIds);
    } finally {
      await this.countQueryLock.release();
    }
  }

  private getCountLockRetryDelayMs(): number {
    return (
      COUNT_LOCK_RETRY_MIN_MS +
      Math.floor(Math.random() * COUNT_LOCK_RETRY_JITTER_MS)
    );
  }

  private async getProjectCounts(
    projectIds: string[],
  ): Promise<Map<string, number>> {
    if (projectIds.length === 0) {
      return new Map();
    }

    const query = `
      SELECT project_id, count() as count
      FROM ${this.tableName}
      WHERE project_id IN ({projectIds: Array(String)})
      GROUP BY project_id
      ORDER BY count DESC
    `;

    const results = await queryClickhouse<ProjectCount>({
      query,
      params: { projectIds },
      tags: {
        surface: "worker",
        route: `batch-project-cleaner/${this.tableName}/count`,
      },
    });

    const counts = new Map<string, number>();
    for (const row of results) {
      counts.set(row.project_id, Number(row.count));
    }

    return counts;
  }

  private async executeDelete(projectIds: string[]): Promise<void> {
    if (projectIds.length === 0) {
      return;
    }

    const query = `
      DELETE FROM ${this.tableName}
      WHERE project_id IN ({projectIds: Array(String)})
    `;

    await commandClickhouse({
      query,
      params: { projectIds },
      clickhouseConfigs: {
        request_timeout: env.LANGFUSE_BATCH_PROJECT_CLEANER_DELETE_TIMEOUT_MS,
      },
    });
  }
}
