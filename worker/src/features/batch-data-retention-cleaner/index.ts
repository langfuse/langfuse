import { createHash } from "crypto";

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
  expiredRowCount: number;
}

/**
 * Hash projectId to a short key for ClickHouse parameter names.
 */
function toParamKey(projectId: string): string {
  return createHash("md5").update(projectId).digest("hex").slice(0, 8);
}

/**
 * Build OR conditions for project-specific cutoffs.
 * Used by both count and delete queries.
 * Uses hashed projectId keys to prevent index mismatch bugs.
 */
function buildRetentionConditions(
  timestampColumn: string,
  projects: ProjectWorkload[],
): { conditions: string; params: Record<string, unknown> } {
  // Build key map and check for collisions
  const keyToProjectId = new Map<string, string>();
  for (const p of projects) {
    const key = toParamKey(p.projectId);
    const existing = keyToProjectId.get(key);
    if (existing && existing !== p.projectId) {
      throw new Error(
        `Hash collision detected: projectIds "${existing}" and "${p.projectId}" both hash to "${key}"`,
      );
    }
    keyToProjectId.set(key, p.projectId);
  }

  const conditions = projects
    .map((p) => {
      const key = toParamKey(p.projectId);
      return `(project_id = {pid_${key}: String} AND ${timestampColumn} < {cutoff_${key}: DateTime64(3)})`;
    })
    .join(" OR ");

  const params: Record<string, unknown> = {};
  for (const p of projects) {
    const key = toParamKey(p.projectId);
    params[`pid_${key}`] = p.projectId;
    params[`cutoff_${key}`] = convertDateToClickhouseDateTime(p.cutoffDate);
  }

  return { conditions, params };
}

/**
 * BatchDataRetentionCleaner handles bulk deletion of ClickHouse data based on
 * project retention settings.
 *
 * Each invocation processes one table (traces, observations, scores, events).
 * BullMQ handles scheduling. Normally, there shouldn't be more than one job
 * for a given table at a time.
 *
 * Flow:
 * 1. Query PG for all projects with retentionDays > 0
 * 2. Calculate retention cutoff dates for each project
 * 3. Chunk projects and query CH for expired row counts (retention-aware)
 * 4. Sort by expired count DESC, select top N projects with expired data
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

    const totalExpiredRows = workloads.reduce(
      (sum, w) => sum + w.expiredRowCount,
      0,
    );

    recordGauge(`${METRIC_PREFIX}.pending_projects`, workloads.length, {
      table: tableName,
    });
    recordGauge(`${METRIC_PREFIX}.pending_rows`, totalExpiredRows, {
      table: tableName,
    });

    logger.info(`${instanceName}: Processing ${workloads.length} projects`, {
      projectIds: workloads.map((w) => w.projectId),
      totalExpiredRows,
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
   * 2. Calculate cutoffs for all projects
   * 3. Chunk projects and query ClickHouse for expired row counts
   * 4. Combine results, sort by count, select top N
   *
   * Chunking prevents running into CH query and param size limits.
   */
  private static async getProjectWorkloads(
    tableName: BatchDataRetentionTable,
  ): Promise<ProjectWorkload[]> {
    const timestampColumn = TIMESTAMP_COLUMN_MAP[tableName];

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

    // Step 2: Calculate cutoffs for all projects upfront
    const now = new Date();
    const allProjectRetentions: ProjectWorkload[] = projectsWithRetention.map(
      (p) => ({
        projectId: p.id,
        retentionDays: p.retentionDays!,
        cutoffDate: getRetentionCutoffDate(p.retentionDays!, now),
        expiredRowCount: 0,
      }),
    );

    // Step 3: Chunk projects and query ClickHouse for expired row counts
    const chunkSize = env.LANGFUSE_BATCH_DATA_RETENTION_CLEANER_CHUNK_SIZE;
    const chunks: (typeof allProjectRetentions)[] = [];
    for (let i = 0; i < allProjectRetentions.length; i += chunkSize) {
      chunks.push(allProjectRetentions.slice(i, i + chunkSize));
    }

    // Query each chunk in parallel (counts only expired rows)
    const chunkResults = await Promise.all(
      chunks.map((chunk) =>
        BatchDataRetentionCleaner.countExpiredRowsInChunk(
          tableName,
          timestampColumn,
          chunk,
        ),
      ),
    );

    // Step 4: Combine results, sort by count DESC, select top N
    const allCounts = chunkResults.flat();
    allCounts.sort((a, b) => b.expiredRowCount - a.expiredRowCount);

    // Filter out projects with no expired rows
    const withExpiredRows = allCounts.filter((p) => p.expiredRowCount > 0);

    return withExpiredRows.slice(
      0,
      env.LANGFUSE_BATCH_DATA_RETENTION_CLEANER_PROJECT_LIMIT,
    );
  }

  /**
   * Count expired rows for a chunk of projects in ClickHouse.
   * Uses the same retention conditions as delete to count only rows that will be deleted.
   */
  private static async countExpiredRowsInChunk(
    tableName: BatchDataRetentionTable,
    timestampColumn: string,
    projects: ProjectWorkload[],
  ): Promise<ProjectWorkload[]> {
    if (projects.length === 0) {
      return [];
    }

    const { conditions, params } = buildRetentionConditions(
      timestampColumn,
      projects,
    );

    const query = `
      SELECT project_id, count() as count
      FROM ${tableName}
      WHERE ${conditions}
      GROUP BY project_id
      HAVING count > 0
    `;

    const result = await queryClickhouse<{
      project_id: string;
      count: number;
    }>({
      query,
      params,
      tags: {
        feature: "batch-data-retention-cleaner",
        table: tableName,
        operation: "count-chunk",
      },
    });

    // Build a map of counts from the result
    const countMap = new Map(
      result.map((r) => [r.project_id, Number(r.count)]),
    );

    // Return workloads for all projects (with 0 count if not in result)
    return projects.map((p) => ({
      ...p,
      expiredRowCount: countMap.get(p.projectId) ?? 0,
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

    const { conditions, params } = buildRetentionConditions(
      timestampColumn,
      workloads,
    );

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
