import { createHash } from "crypto";

import { percentile } from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import {
  commandClickhouse,
  convertDateToClickhouseDateTime,
  logger,
  queryClickhouse,
  recordGauge,
  recordIncrement,
} from "@langfuse/shared/src/server";
import { env } from "../../env";
import { getRetentionCutoffDate } from "../utils";
import { PeriodicExclusiveRunner } from "../../utils/PeriodicExclusiveRunner";

// Tables for batch data retention cleaning (ClickHouse only; also no dataset_run_items)
export const BATCH_DATA_RETENTION_TABLES = [
  "traces",
  "observations",
  "scores",
  "events_full",
  "events_core",
  "events",
] as const;

export type BatchDataRetentionTable =
  (typeof BATCH_DATA_RETENTION_TABLES)[number];

const METRIC_PREFIX = "langfuse.batch_data_retention_cleaner";

export const BATCH_DATA_RETENTION_CLEANER_LOCK_PREFIX =
  "langfuse:batch-data-retention-cleaner";

export const TIMESTAMP_COLUMN_MAP: Record<BatchDataRetentionTable, string> = {
  traces: "timestamp",
  observations: "start_time",
  scores: "timestamp",
  events_full: "start_time",
  events_core: "start_time",
  events: "start_time",
};

interface ProjectWorkload {
  projectId: string;
  retentionDays: number;
  cutoffDate: Date;
  expiredRowCount: number;
  oldestAgeSeconds: number | null;
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
  // Compute hashes once and check for collisions
  const projectToKey = new Map<string, string>();
  const keyToProject = new Map<string, string>();
  for (const p of projects) {
    const key = toParamKey(p.projectId);
    const existing = keyToProject.get(key);
    if (existing && existing !== p.projectId) {
      throw new Error(
        `Hash collision detected: projectIds "${existing}" and "${p.projectId}" both hash to "${key}"`,
      );
    }
    projectToKey.set(p.projectId, key);
    keyToProject.set(key, p.projectId);
  }

  const conditions = projects
    .map((p) => {
      const key = projectToKey.get(p.projectId)!;
      return `(project_id = {pid_${key}: String} AND ${timestampColumn} < {cutoff_${key}: DateTime64(3)})`;
    })
    .join(" OR ");

  const params: Record<string, unknown> = {};
  for (const p of projects) {
    const key = projectToKey.get(p.projectId)!;
    params[`pid_${key}`] = p.projectId;
    params[`cutoff_${key}`] = convertDateToClickhouseDateTime(p.cutoffDate);
  }

  return { conditions, params };
}

/**
 * BatchDataRetentionCleaner handles bulk deletion of ClickHouse data based on
 * project retention settings.
 *
 * Each instance processes one table (traces, observations, scores, events_full, events_core).
 * Multiple workers coordinate via Redis distributed locking to ensure only one
 * worker deletes from a given table at a time.
 *
 * Flow:
 * 1. Query PG for all projects with retentionDays > 0
 * 2. Calculate retention cutoff dates for each project
 * 3. Chunk projects and query CH for expired row counts (retention-aware)
 * 4. Sort by expired count DESC, select top N projects with expired data
 * 5. Execute single batch DELETE with OR conditions
 */
export class BatchDataRetentionCleaner extends PeriodicExclusiveRunner {
  private readonly tableName: BatchDataRetentionTable;

  protected get defaultIntervalMs(): number {
    return env.LANGFUSE_BATCH_DATA_RETENTION_CLEANER_INTERVAL_MS;
  }

  constructor(tableName: BatchDataRetentionTable) {
    // TTL = DELETE timeout + 5 minutes buffer
    const lockTtlSeconds =
      Math.ceil(
        env.LANGFUSE_BATCH_DATA_RETENTION_CLEANER_DELETE_TIMEOUT_MS / 1000,
      ) + 300;

    super({
      name: `BatchDataRetentionCleaner(${tableName})`,
      lockKey: `${BATCH_DATA_RETENTION_CLEANER_LOCK_PREFIX}:${tableName}`,
      lockTtlSeconds,
    });
    this.tableName = tableName;
  }

  /**
   * Start the batch cleaner service
   */
  public override start(): void {
    logger.info(`Starting ${this.instanceName}`, {
      intervalMs: env.LANGFUSE_BATCH_DATA_RETENTION_CLEANER_INTERVAL_MS,
      projectLimit: env.LANGFUSE_BATCH_DATA_RETENTION_CLEANER_PROJECT_LIMIT,
      deleteTimeoutMs:
        env.LANGFUSE_BATCH_DATA_RETENTION_CLEANER_DELETE_TIMEOUT_MS,
    });
    super.start();
  }

  /**
   * Process a batch for data retention for this table.
   * Preflight and deletion are both under lock to avoid redundant expensive queries.
   */
  protected async execute(): Promise<void> {
    const timestampColumn = TIMESTAMP_COLUMN_MAP[this.tableName];

    // Reset gauges before attempting lock - ensures they don't appear stuck
    // if another worker holds the lock
    recordGauge(`${METRIC_PREFIX}.pending_projects`, 0, {
      table: this.tableName,
    });
    recordGauge(`${METRIC_PREFIX}.seconds_past_cutoff`, 0, {
      table: this.tableName,
    });

    await this.withLock(
      async () => {
        // Step 1: Get project workloads (chunked CH counts + PG retention config)
        const workloads = await this.getProjectWorkloads();

        recordGauge(`${METRIC_PREFIX}.pending_projects`, workloads.length, {
          table: this.tableName,
        });

        // Compute seconds past cutoff for each workload
        const SECONDS_PER_DAY = 86400;
        const secondsPastCutoffByProject = workloads
          .filter((w) => w.oldestAgeSeconds !== null)
          .map((w) => ({
            projectId: w.projectId,
            secondsPastCutoff:
              w.oldestAgeSeconds! - w.retentionDays * SECONDS_PER_DAY,
          }));

        // Compute p90 for the gauge metric (0 when no pending work)
        const p90SecondsPastCutoff = percentile(
          secondsPastCutoffByProject.map((p) => p.secondsPastCutoff),
          0.9,
        );

        recordGauge(
          `${METRIC_PREFIX}.seconds_past_cutoff`,
          Math.max(p90SecondsPastCutoff, 0),
          {
            table: this.tableName,
          },
        );

        // Step 2: Execute DELETE
        if (workloads.length >= 0) {
          logger.info(
            `${this.instanceName}: Processing ${workloads.length} projects`,
            {
              projectIds: workloads.map((w) => w.projectId),
              secondsPastCutoffByProject,
            },
          );

          await this.executeBatchDelete(timestampColumn, workloads);

          logger.info(`${this.instanceName}: Batch deletion completed`, {
            table: this.tableName,
            projectsProcessed: workloads.length,
          });
        } else {
          logger.info(
            `${this.instanceName}: No projects with retention and data to delete`,
          );
        }

        // Record successful deletion metrics
        recordIncrement(`${METRIC_PREFIX}.delete_successes`, 1, {
          table: this.tableName,
        });
        recordIncrement(
          `${METRIC_PREFIX}.projects_processed`,
          workloads.length,
          {
            table: this.tableName,
          },
        );
      },
      () => {
        recordIncrement(`${METRIC_PREFIX}.delete_failures`, 1, {
          table: this.tableName,
        });
      },
    );
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
  private async getProjectWorkloads(): Promise<ProjectWorkload[]> {
    const timestampColumn = TIMESTAMP_COLUMN_MAP[this.tableName];

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
        oldestAgeSeconds: null,
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
        this.countExpiredRowsInChunk(timestampColumn, chunk),
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
  private async countExpiredRowsInChunk(
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
      SELECT
        project_id,
        count() as count,
        dateDiff('second', min(event_ts), now()) as oldest_age_seconds
      FROM ${this.tableName}
      WHERE ${conditions}
      GROUP BY project_id
      HAVING count > 0
    `;

    const isLegacyEventsTable = this.tableName === "events";

    const result = await queryClickhouse<{
      project_id: string;
      count: number;
      oldest_age_seconds: number;
    }>({
      query,
      params,
      tags: {
        feature: "batch-data-retention-cleaner",
        table: this.tableName,
        operation: "count-chunk",
      },
      allowLegacyEventsRead: isLegacyEventsTable,
    });

    // Build maps from the result
    const resultMap = new Map(
      result.map((r) => [
        r.project_id,
        {
          count: Number(r.count),
          oldestAgeSeconds: Number(r.oldest_age_seconds),
        },
      ]),
    );

    // Return workloads for all projects (with 0 count if not in result)
    return projects.map((p) => {
      const data = resultMap.get(p.projectId);
      return {
        ...p,
        expiredRowCount: data?.count ?? 0,
        oldestAgeSeconds: data?.oldestAgeSeconds ?? null,
      };
    });
  }

  /**
   * Execute batch DELETE with OR conditions for selected projects.
   * Single query deletes data for all selected projects at once.
   */
  private async executeBatchDelete(
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

    const query = `DELETE FROM ${this.tableName} WHERE ${conditions}`;

    await commandClickhouse({
      query,
      params,
      clickhouseConfigs: {
        request_timeout:
          env.LANGFUSE_BATCH_DATA_RETENTION_CLEANER_DELETE_TIMEOUT_MS,
      },
      tags: {
        feature: "batch-data-retention-cleaner",
        table: this.tableName,
        operation: "delete",
      },
    });
  }
}
