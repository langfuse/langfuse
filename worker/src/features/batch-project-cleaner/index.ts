import {
  logger,
  queryClickhouse,
  commandClickhouse,
  traceException,
  recordIncrement,
  BATCH_DELETION_TABLES,
} from "@langfuse/shared/src/server";

export { BATCH_DELETION_TABLES };
import { prisma } from "@langfuse/shared/src/db";
import { env } from "../../env";
import { PeriodicRunner } from "../../utils/PeriodicRunner";
import { RedisLock } from "../../utils/RedisLock";

export type BatchDeletionTable = (typeof BATCH_DELETION_TABLES)[number];

export const BATCH_PROJECT_CLEANER_LOCK_PREFIX =
  "langfuse:batch-project-cleaner";

interface ProjectCount {
  project_id: string;
  count: number;
}

/**
 * BatchProjectCleaner handles bulk deletion of ClickHouse data for soft-deleted projects.
 *
 * Each instance processes one table (traces, observations, scores, events).
 * Multiple workers coordinate via Redis distributed locking to ensure only one
 * worker deletes from a given table at a time.
 *
 * Flow:
 * 1. Query PG for projects with deleted_at set (no lock needed)
 * 2. Query ClickHouse for counts per project (no lock needed)
 * 3. Acquire Redis lock for DELETE only
 * 4. Execute DELETE
 * 5. On failure: re-run count query to determine partial success
 */
export class BatchProjectCleaner extends PeriodicRunner {
  private readonly tableName: BatchDeletionTable;
  private readonly instanceName: string;
  private readonly lock: RedisLock;

  protected get name(): string {
    return this.instanceName;
  }

  protected get defaultIntervalMs(): number {
    return env.LANGFUSE_BATCH_PROJECT_CLEANER_SLEEP_ON_EMPTY_MS;
  }

  constructor(tableName: BatchDeletionTable) {
    super();
    this.tableName = tableName;
    this.instanceName = `BatchProjectCleaner(${tableName})`;

    // TTL = DELETE timeout + 5 minutes buffer
    const lockTtlSeconds =
      Math.ceil(env.LANGFUSE_BATCH_PROJECT_CLEANER_DELETE_TIMEOUT_MS / 1000) +
      300;

    // We use this lock as a performance optimization: avoiding
    // multiple workers starting DELETE mutation for the same table
    // simultaneously. If Redis is unavailable, we allow processing
    // to avoid blocking progress as this does not compromise data integrity.
    this.lock = new RedisLock(
      `${BATCH_PROJECT_CLEANER_LOCK_PREFIX}:${tableName}`,
      {
        ttlSeconds: lockTtlSeconds,
        name: this.instanceName,
        onUnavailable: "proceed", // If lock is unavailable, proceed anyway.
      },
    );
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
   * Stop the batch cleaner service
   */
  public override stop(): void {
    super.stop();
    logger.info(`${this.instanceName} stopped`);
  }

  /**
   * Process a batch of deleted projects. Returns the delay until next run.
   * Public wrapper for testing.
   */
  public async processBatch(): Promise<number> {
    return this.execute();
  }

  /**
   * Process a batch of deleted projects. Returns the delay until next run.
   */
  protected async execute(): Promise<number> {
    // Step 1: Query PG for deleted projects (no lock needed)
    let deletedProjects: Array<{ id: string }>;
    try {
      deletedProjects = await this.getDeletedProjects();
    } catch (error) {
      logger.error(`${this.instanceName}: Failed to query deleted projects`, {
        error,
      });
      traceException(error);
      return env.LANGFUSE_BATCH_PROJECT_CLEANER_SLEEP_ON_EMPTY_MS;
    }

    // Step 2: Query ClickHouse for counts per project (no lock needed)
    let initialCounts: Map<string, number>;
    try {
      initialCounts = await this.getProjectCounts(
        deletedProjects.map((p) => p.id),
      );
    } catch (error) {
      logger.error(
        `${this.instanceName}: Failed to query ClickHouse counts`,
        error,
      );
      traceException(error);
      return env.LANGFUSE_BATCH_PROJECT_CLEANER_SLEEP_ON_EMPTY_MS;
    }

    // Filter to only projects that have data
    const projectIdsWithData = Array.from(initialCounts.entries())
      .filter(([, count]) => count > 0)
      .map(([projectId]) => projectId);

    if (projectIdsWithData.length === 0) {
      logger.info(
        `${this.instanceName}: No data found for deleted projects in ${this.tableName}`,
      );
      return env.LANGFUSE_BATCH_PROJECT_CLEANER_SLEEP_ON_EMPTY_MS;
    }

    // Step 3 & 4: Execute DELETE under distributed lock
    const result = await this.lock.withLock(async () => {
      try {
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
      } catch (deleteError) {
        // Step 5: On failure, re-run count query to determine partial success
        logger.warn(
          `${this.instanceName}: DELETE failed, checking for partial success`,
          deleteError,
        );
        traceException(deleteError);

        // Record DELETE failure metric
        recordIncrement("langfuse.batch_project_cleaner.delete_failures", 1, {
          table: this.tableName,
        });

        let finalCounts: Map<string, number> | undefined;
        try {
          finalCounts = await this.getProjectCounts(projectIdsWithData);
        } catch (countError) {
          // Can't determine partial success
          logger.error(
            `${this.instanceName}: Failed to re-query counts after DELETE failure`,
            countError,
          );
        }

        // Calculate projects that couldn't be fully cleaned
        const incompleteProjects = finalCounts
          ? projectIdsWithData.filter((projectId) => {
              const finalCount = finalCounts.get(projectId) ?? 0;
              return finalCount > 0;
            })
          : projectIdsWithData;

        if (incompleteProjects.length > 0) {
          recordIncrement(
            "langfuse.batch_project_cleaner.incomplete_cleanups",
            incompleteProjects.length,
            { table: this.tableName },
          );
          logger.warn(`${this.instanceName}: Partial deletion completed`, {
            table: this.tableName,
            incompleteProjectCount: incompleteProjects.length,
            incompleteProjects: incompleteProjects.slice(0, 10), // Log first 10
            error: (deleteError as Error).message,
          });
        } else {
          logger.info(
            `${this.instanceName}: All projects cleaned successfully on re-check`,
          );
        }
        return env.LANGFUSE_BATCH_PROJECT_CLEANER_CHECK_INTERVAL_MS;
      }
    });

    if (result === null) {
      logger.info(
        `${this.instanceName}: Lock not acquired, another worker is processing`,
      );
      return env.LANGFUSE_BATCH_PROJECT_CLEANER_SLEEP_ON_EMPTY_MS;
    }

    return result;
  }

  private async getDeletedProjects(): Promise<Array<{ id: string }>> {
    return prisma.project.findMany({
      select: { id: true },
      where: {
        deletedAt: { not: null },
      },
      take: env.LANGFUSE_BATCH_PROJECT_CLEANER_PROJECT_LIMIT,
    });
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
        feature: "batch-project-cleaner",
        table: this.tableName,
        operation: "count",
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
      tags: {
        feature: "batch-project-cleaner",
        table: this.tableName,
        operation: "delete",
      },
    });
  }
}
