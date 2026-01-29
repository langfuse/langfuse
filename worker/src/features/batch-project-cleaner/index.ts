import {
  logger,
  queryClickhouse,
  commandClickhouse,
  traceException,
  recordIncrement,
  BATCH_DELETION_TABLES,
} from "@langfuse/shared/src/server";
import { prisma } from "@langfuse/shared/src/db";
import { env } from "../../env";

export type BatchDeletionTable = (typeof BATCH_DELETION_TABLES)[number];

interface ProjectCount {
  project_id: string;
  count: number;
}

/**
 * BatchProjectCleaner handles bulk deletion of ClickHouse data for soft-deleted projects.
 *
 * Each invocation processes one table (traces, observations, scores, events).
 * BullMQ handles distributed locking to ensure only one worker processes
 * a given table's job at a time.
 *
 * Flow:
 * 1. Query PG for projects with deleted_at set
 * 2. Query ClickHouse for counts per project
 * 3. Execute DELETE
 * 4. On failure: re-run count query to determine partial success
 */
export class BatchProjectCleaner {
  /**
   * Process a batch of deleted projects for a specific table.
   */
  public static async processBatch(
    tableName: BatchDeletionTable,
  ): Promise<void> {
    const instanceName = `BatchProjectCleaner(${tableName})`;

    // Step 1: Query PG for deleted projects
    let deletedProjects: Array<{ id: string }>;
    try {
      deletedProjects = await BatchProjectCleaner.getDeletedProjects();
    } catch (error) {
      logger.error(`${instanceName}: Failed to query deleted projects`, {
        error,
      });
      traceException(error);
      return;
    }

    // Step 2: Query ClickHouse for counts per project
    let initialCounts: Map<string, number>;
    try {
      initialCounts = await BatchProjectCleaner.getProjectCounts(
        tableName,
        deletedProjects.map((p) => p.id),
      );
    } catch (error) {
      logger.error(`${instanceName}: Failed to query ClickHouse counts`, error);
      traceException(error);
      return;
    }

    // Filter to only projects that have data
    const projectIdsWithData = Array.from(initialCounts.entries())
      .filter(([, count]) => count > 0)
      .map(([projectId]) => projectId);

    if (projectIdsWithData.length === 0) {
      logger.info(
        `${instanceName}: No data found for deleted projects in ${tableName}`,
      );
      return;
    }

    // Step 3: Execute DELETE
    try {
      await BatchProjectCleaner.executeDelete(tableName, projectIdsWithData);

      const totalRows = Array.from(initialCounts.values()).reduce(
        (sum, count) => sum + count,
        0,
      );
      logger.info(`${instanceName}: Batch deletion completed`, {
        table: tableName,
        projectsProcessed: projectIdsWithData.length,
        totalRowsTargeted: totalRows,
      });
    } catch (deleteError) {
      // Step 4: On failure, re-run count query to determine partial success
      logger.warn(
        `${instanceName}: DELETE failed, checking for partial success`,
        deleteError,
      );
      traceException(deleteError);

      // Record DELETE failure metric
      recordIncrement("langfuse.batch_project_cleaner.delete_failures", 1, {
        table: tableName,
      });

      let finalCounts: Map<string, number> | undefined;
      try {
        finalCounts = await BatchProjectCleaner.getProjectCounts(
          tableName,
          projectIdsWithData,
        );
      } catch (countError) {
        // Can't determine partial success
        logger.error(
          `${instanceName}: Failed to re-query counts after DELETE failure`,
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
          { table: tableName },
        );
        logger.warn(`${instanceName}: Partial deletion completed`, {
          table: tableName,
          incompleteProjectCount: incompleteProjects.length,
          incompleteProjects: incompleteProjects.slice(0, 10), // Log first 10
          error: (deleteError as Error).message,
        });
      } else {
        logger.info(
          `${instanceName}: All projects cleaned successfully on re-check`,
        );
      }

      // Re-throw so BullMQ marks job as failed
      throw deleteError;
    }
  }

  private static async getDeletedProjects(): Promise<Array<{ id: string }>> {
    return prisma.project.findMany({
      select: { id: true },
      where: {
        deletedAt: { not: null },
      },
      take: env.LANGFUSE_BATCH_PROJECT_CLEANER_PROJECT_LIMIT,
    });
  }

  private static async getProjectCounts(
    tableName: BatchDeletionTable,
    projectIds: string[],
  ): Promise<Map<string, number>> {
    if (projectIds.length === 0) {
      return new Map();
    }

    const query = `
      SELECT project_id, count() as count
      FROM ${tableName}
      WHERE project_id IN ({projectIds: Array(String)})
      GROUP BY project_id
      ORDER BY count DESC
    `;

    const results = await queryClickhouse<ProjectCount>({
      query,
      params: { projectIds },
      tags: {
        feature: "batch-project-cleaner",
        table: tableName,
        operation: "count",
      },
    });

    const counts = new Map<string, number>();
    for (const row of results) {
      counts.set(row.project_id, Number(row.count));
    }

    return counts;
  }

  private static async executeDelete(
    tableName: BatchDeletionTable,
    projectIds: string[],
  ): Promise<void> {
    if (projectIds.length === 0) {
      return;
    }

    const query = `
      DELETE FROM ${tableName}
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
        table: tableName,
        operation: "delete",
      },
    });
  }
}
