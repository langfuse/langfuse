import { prisma } from "@langfuse/shared/src/db";
import {
  commandClickhouse,
  convertDateToClickhouseDateTime,
  logger,
  queryClickhouse,
  recordGauge,
  recordIncrement,
  traceException,
  type BatchDataRetentionTable,
} from "@langfuse/shared/src/server";
import { env } from "../../env";
import { getRetentionCutoffDate } from "../utils";

const METRIC_PREFIX = "langfuse.batch_data_retention_cleaner";

export const TIMESTAMP_COLUMN_MAP: Record<BatchDataRetentionTable, string> = {
  traces: "timestamp",
  observations: "start_time",
  scores: "timestamp",
  events: "start_time",
};

interface ProjectWorkload {
  projectId: string;
  retentionDays: number;
  cutoffDate: Date;
  totalRowCount: number;
}

interface ProjectCount {
  project_id: string;
  count: number;
}

/**
 * BatchDataRetentionCleaner handles bulk deletion of ClickHouse data based on
 * project retention settings.
 *
 * Each invocation processes one table (traces, observations, scores, events).
 * BullMQ handles schedulling. Normally, there shouldn't be more than one job
 * for a given table's at a time.
 *
 * Flow:
 * 1. Query PG for all projects with retentionDays > 0
 * 2. Chunk project IDs and query CH for row counts per chunk
 * 3. Combine results, sort by count DESC, select top N
 * 4. Calculate cutoff dates based on each project's retentionDays
 * 5. Execute single batch DELETE with OR conditions
 */
export class BatchDataRetentionCleaner {
  /**
   * Process a batch for data retention for a specific table.
   */
  public static async processBatch(
    tableName: BatchDataRetentionTable,
  ): Promise<void> {
    const instanceName = `BatchDataRetentionCleaner(${tableName})`;
    const timestampColumn = TIMESTAMP_COLUMN_MAP[tableName];

    // Step 1: Get project workloads (chunked CH counts + PG retention config)
    let workloads: ProjectWorkload[];
    try {
      workloads =
        await BatchDataRetentionCleaner.getProjectWorkloads(tableName);
    } catch (error) {
      logger.error(`${instanceName}: Failed to query project workloads`, {
        error,
      });
      traceException(error);
      return;
    }

    if (workloads.length === 0) {
      logger.info(
        `${instanceName}: No projects with retention and data to delete`,
      );
      return;
    }

    recordGauge(`${METRIC_PREFIX}.pending_projects`, workloads.length, {
      table: tableName,
    });

    logger.info(`${instanceName}: Processing ${workloads.length} projects`, {
      projectIds: workloads.map((w) => w.projectId),
    });

    // Step 2: Execute single batch DELETE for all selected projects
    try {
      await BatchDataRetentionCleaner.executeBatchDelete(
        tableName,
        timestampColumn,
        workloads,
      );

      // Record successful deletion metrics
      recordIncrement(`${METRIC_PREFIX}.delete_successes`, 1, {
        table: tableName,
      });
      recordIncrement(`${METRIC_PREFIX}.projects_processed`, workloads.length, {
        table: tableName,
      });
      logger.info(`${instanceName}: Batch deletion completed`, {
        table: tableName,
        projectsProcessed: workloads.length,
      });
    } catch (error) {
      logger.error(`${instanceName}: Batch DELETE failed`, { error });
      traceException(error);

      recordIncrement(`${METRIC_PREFIX}.delete_failures`, 1, {
        table: tableName,
      });

      // Re-throw so BullMQ marks job as failed
      throw error;
    }
  }

  /**
   * Get project workloads using chunked queries:
   * 1. PostgreSQL: Get all projects with retention enabled
   * 2. Chunk project IDs and query ClickHouse for each chunk
   * 3. Combine results, sort by count, select top N
   * 4. Calculate cutoffs for selected projects
   *
   * Chunking prevents running into CH query and param size limits.
   */
  private static async getProjectWorkloads(
    tableName: BatchDataRetentionTable,
  ): Promise<ProjectWorkload[]> {
    // Step 1: Get all projects with retention from PostgreSQL
    const projectsWithRetention = await prisma.project.findMany({
      select: { id: true, retentionDays: true },
      where: {
        retentionDays: { gt: 0 },
        deletedAt: null,
      },
    });

    if (projectsWithRetention.length === 0) {
      return [];
    }

    // Build retention map for later
    const retentionMap = new Map(
      projectsWithRetention.map((p) => [p.id, p.retentionDays!]),
    );
    const projectIds = projectsWithRetention.map((p) => p.id);

    // Step 2: Chunk project IDs and query ClickHouse for each chunk
    const chunkSize = env.LANGFUSE_BATCH_DATA_RETENTION_CLEANER_CHUNK_SIZE;
    const chunks: string[][] = [];
    for (let i = 0; i < projectIds.length; i += chunkSize) {
      chunks.push(projectIds.slice(i, i + chunkSize));
    }

    // Query each chunk in parallel
    const chunkResults = await Promise.all(
      chunks.map((chunk) =>
        BatchDataRetentionCleaner.countProjectsInChunk(tableName, chunk),
      ),
    );

    // Step 3: Combine results, sort by count DESC, select top N
    const allCounts = chunkResults.flat();
    allCounts.sort((a, b) => b.count - a.count);
    const topN = allCounts.slice(
      0,
      env.LANGFUSE_BATCH_DATA_RETENTION_CLEANER_PROJECT_LIMIT,
    );

    if (topN.length === 0) {
      return [];
    }

    // Step 4: Calculate cutoffs for selected projects
    const now = new Date();
    return topN.map((p) => {
      const retentionDays = retentionMap.get(p.project_id)!;
      return {
        projectId: p.project_id,
        retentionDays,
        cutoffDate: getRetentionCutoffDate(retentionDays, now),
        totalRowCount: p.count,
      };
    });
  }

  /**
   * Count rows for a chunk of project IDs in ClickHouse.
   */
  private static async countProjectsInChunk(
    tableName: BatchDataRetentionTable,
    projectIds: string[],
  ): Promise<ProjectCount[]> {
    if (projectIds.length === 0) {
      return [];
    }

    const query = `
      SELECT project_id, count() as count
      FROM ${tableName}
      WHERE project_id IN ({projectIds: Array(String)})
      GROUP BY project_id
    `;

    const result = await queryClickhouse<ProjectCount>({
      query,
      params: { projectIds },
      tags: {
        feature: "batch-data-retention-cleaner",
        table: tableName,
        operation: "count-chunk",
      },
    });

    return result.map((r) => ({
      project_id: r.project_id,
      count: Number(r.count),
    }));
  }

  /**
   * Execute batch DELETE with OR conditions for selected projects.
   * Single query deletes data for all selected projects at once.
   */
  private static async executeBatchDelete(
    tableName: BatchDataRetentionTable,
    timestampColumn: string,
    workloads: ProjectWorkload[],
  ): Promise<void> {
    if (workloads.length === 0) {
      return;
    }

    // Build OR conditions: (project_id = 'p1' AND ts < cutoff1) OR ...
    const conditions = workloads
      .map(
        (_, i) =>
          `(project_id = {projectId${i}: String} AND ${timestampColumn} < {cutoff${i}: DateTime64(3)})`,
      )
      .join(" OR ");

    const params: Record<string, unknown> = {};
    workloads.forEach((w, i) => {
      params[`projectId${i}`] = w.projectId;
      params[`cutoff${i}`] = convertDateToClickhouseDateTime(w.cutoffDate);
    });

    const query = `DELETE FROM ${tableName} WHERE ${conditions}`;

    await commandClickhouse({
      query,
      params,
      clickhouseConfigs: {
        request_timeout:
          env.LANGFUSE_BATCH_DATA_RETENTION_CLEANER_DELETE_TIMEOUT_MS,
      },
      tags: {
        feature: "batch-data-retention-cleaner",
        table: tableName,
        operation: "delete",
      },
    });
  }
}
