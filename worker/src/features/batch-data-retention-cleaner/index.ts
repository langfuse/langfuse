import { createHash } from "crypto";

import { percentile } from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import {
  commandClickhouse,
  convertDateToClickhouseDateTime,
  logger,
  queryClickhouse,
  queryClickhouseStream,
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
] as const;

export type BatchDataRetentionTable =
  (typeof BATCH_DATA_RETENTION_TABLES)[number];

const METRIC_PREFIX = "langfuse.batch_data_retention_cleaner";

class BatchDataRetentionCleanerLeaseLostError extends Error {
  constructor(tableName: BatchDataRetentionTable) {
    super(`Batch data retention cleaner lost its lease for ${tableName}`);
    this.name = "BatchDataRetentionCleanerLeaseLostError";
  }
}

export const BATCH_DATA_RETENTION_CLEANER_LOCK_PREFIX =
  "langfuse:batch-data-retention-cleaner";

export const TIMESTAMP_COLUMN_MAP: Record<BatchDataRetentionTable, string> = {
  traces: "timestamp",
  observations: "start_time",
  scores: "timestamp",
  events_full: "start_time",
  events_core: "start_time",
};

interface ProjectRetention {
  projectId: string;
  retentionDays: number;
  cutoffDate: Date;
}

interface ProjectWorkload extends ProjectRetention {
  expiredRowCount: number | null;
  oldestAgeSeconds: number | null;
}

function parseMonthlyPartitionStart(partitionId: string): Date | null {
  if (!/^\d{6}$/.test(partitionId)) {
    return null;
  }

  const year = Number(partitionId.slice(0, 4));
  const month = Number(partitionId.slice(4, 6));
  if (year < 100 || month < 1 || month > 12) {
    return null;
  }

  return new Date(Date.UTC(year, month - 1, 1));
}

async function getOldestProjectPartitionStarts(
  tableName: BatchDataRetentionTable,
  projectIds: string[],
): Promise<Map<string, Date | null>> {
  if (projectIds.length === 0) {
    return new Map();
  }

  const result = await queryClickhouse<{
    project_id: string;
    oldest_expired_partition: string;
  }>({
    query: `
      SELECT
        project_id,
        min(_partition_id) AS oldest_expired_partition
      FROM ${tableName}
      PREWHERE project_id IN ({candidateProjectIds: Array(String)})
      GROUP BY project_id
    `,
    params: { candidateProjectIds: projectIds },
    useMultipartParamsAuto: true,
  });

  return new Map(
    result.map((row) => [
      row.project_id,
      parseMonthlyPartitionStart(row.oldest_expired_partition),
    ]),
  );
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
  projects: ProjectRetention[],
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
 * 3. Stream projects with expired rows from bounded project chunks
 * 4. Best-effort enrich candidates with exact count and oldest timestamp
 * 5. Sort by expired count DESC when enrichment is available
 * 6. Execute a single batch DELETE with OR conditions
 */
export class BatchDataRetentionCleaner extends PeriodicExclusiveRunner {
  private readonly tableName: BatchDataRetentionTable;
  private readonly candidateQueryHttpTimeoutSeconds: number;
  private readonly lockExtensionMinIntervalMs: number;
  private lastLockExtensionAt = 0;
  private lockExtensionInFlight: Promise<void> | null = null;

  protected get defaultIntervalMs(): number {
    return env.LANGFUSE_BATCH_DATA_RETENTION_CLEANER_INTERVAL_MS;
  }

  constructor(tableName: BatchDataRetentionTable) {
    const candidateQueryTimeoutMs =
      env.LANGFUSE_BATCH_DATA_RETENTION_CLEANER_CANDIDATE_QUERY_TIMEOUT_MS;

    // TTL = longest bounded operation + 5 minutes buffer
    const lockTtlSeconds =
      Math.ceil(
        Math.max(
          env.LANGFUSE_BATCH_DATA_RETENTION_CLEANER_DELETE_TIMEOUT_MS,
          candidateQueryTimeoutMs,
        ) / 1000,
      ) + 300;

    super({
      name: `BatchDataRetentionCleaner(${tableName})`,
      lockKey: `${BATCH_DATA_RETENTION_CLEANER_LOCK_PREFIX}:${tableName}`,
      lockTtlSeconds,
      onUnavailable: "fail",
    });
    this.tableName = tableName;
    this.candidateQueryHttpTimeoutSeconds = Math.ceil(
      candidateQueryTimeoutMs / 1000,
    );
    this.lockExtensionMinIntervalMs = Math.floor((lockTtlSeconds * 1000) / 3);
  }

  /**
   * Start the batch cleaner service
   */
  public override start(): void {
    logger.info(`Starting ${this.instanceName}`, {
      intervalMs: env.LANGFUSE_BATCH_DATA_RETENTION_CLEANER_INTERVAL_MS,
      projectLimit: env.LANGFUSE_BATCH_DATA_RETENTION_CLEANER_PROJECT_LIMIT,
      candidateQueryTimeoutMs:
        env.LANGFUSE_BATCH_DATA_RETENTION_CLEANER_CANDIDATE_QUERY_TIMEOUT_MS,
      deleteTimeoutMs:
        env.LANGFUSE_BATCH_DATA_RETENTION_CLEANER_DELETE_TIMEOUT_MS,
    });
    super.start();
  }

  /**
   * Renew the lease when work advances, without issuing one Redis command per
   * streamed row. A failed renewal means this worker no longer owns the batch.
   */
  private async extendLockOnProgress(force = false): Promise<void> {
    if (
      !force &&
      Date.now() - this.lastLockExtensionAt < this.lockExtensionMinIntervalMs
    ) {
      return;
    }

    if (this.lockExtensionInFlight) {
      return this.lockExtensionInFlight;
    }

    const extension = (async () => {
      if (!(await this.lock.extend())) {
        throw new BatchDataRetentionCleanerLeaseLostError(this.tableName);
      }
      this.lastLockExtensionAt = Date.now();
    })();
    this.lockExtensionInFlight = extension;

    try {
      await extension;
    } finally {
      if (this.lockExtensionInFlight === extension) {
        this.lockExtensionInFlight = null;
      }
    }
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
        // Each acquisition starts a fresh lease, so progress in a prior run
        // must not throttle the first renewal in this one.
        this.lastLockExtensionAt = 0;

        // Step 1: Get project workloads (streamed CH candidates + PG config)
        const workloads = await this.getProjectWorkloads();

        recordGauge(`${METRIC_PREFIX}.pending_projects`, workloads.length, {
          table: this.tableName,
        });

        const SECONDS_PER_DAY = 86400;
        const secondsPastCutoffByProject = workloads
          .filter((workload) => workload.oldestAgeSeconds !== null)
          .map((workload) => ({
            projectId: workload.projectId,
            secondsPastCutoff:
              workload.oldestAgeSeconds! -
              workload.retentionDays * SECONDS_PER_DAY,
          }));

        // Compute p90 for the gauge metric (0 when no pending work)
        const p90SecondsPastCutoff = percentile(
          secondsPastCutoffByProject.map((project) =>
            Math.max(project.secondsPastCutoff, 0),
          ),
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
              projectIds: workloads.map((workload) => workload.projectId),
              secondsPastCutoffByProject,
            },
          );

          await this.executeBatchDelete(timestampColumn, workloads);

          if (workloads.length > 0) {
            const matchedRows = workloads.reduce<number | null>(
              (sum, workload) =>
                sum === null || workload.expiredRowCount === null
                  ? null
                  : sum + workload.expiredRowCount,
              0,
            );

            if (matchedRows === null) {
              recordIncrement(`${METRIC_PREFIX}.row_count_unavailable`, 1, {
                table: this.tableName,
              });
            } else {
              recordIncrement(
                `${METRIC_PREFIX}.rows_matched_before_delete`,
                matchedRows,
                { table: this.tableName },
              );
            }
          }

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
   * Get project workloads using bounded candidate discovery:
   * 1. PostgreSQL: Get all projects with retention enabled
   * 2. Calculate cutoffs for all projects
   * 3. Stream projects with expired data from each CHUNK_SIZE project chunk
   * 4. Best-effort enrich each chunk's candidates with count/min
   * 5. Sort by count when available and select top PROJECT_LIMIT
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
    const allProjectRetentions: ProjectRetention[] = projectsWithRetention.map(
      (project) => ({
        projectId: project.id,
        retentionDays: project.retentionDays!,
        cutoffDate: getRetentionCutoffDate(project.retentionDays!, now),
      }),
    );

    // Step 3: Bound both the project parameters and returned candidates for
    // each ClickHouse query. A completed query can return every matching
    // project in its input chunk because both use the same configured limit.
    const chunkSize = env.LANGFUSE_BATCH_DATA_RETENTION_CLEANER_CHUNK_SIZE;
    const projectChunks: ProjectRetention[][] = [];
    for (
      let offset = 0;
      offset < allProjectRetentions.length;
      offset += chunkSize
    ) {
      projectChunks.push(
        allProjectRetentions.slice(offset, offset + chunkSize),
      );
    }

    // Step 4: Exact count/min is useful for global ordering and metrics, but
    // deletion must not depend on this more expensive grouped query succeeding.
    // Keep enrichment per input chunk so its parameters remain bounded too.
    const chunkWorkloads = await Promise.all(
      projectChunks.map(async (projectChunk) => {
        const candidates = await this.findExpiredProjectCandidates(
          timestampColumn,
          projectChunk,
        );
        return this.enrichProjectCandidates(timestampColumn, candidates);
      }),
    );
    const workloads = chunkWorkloads.flat();

    // A failed count can indicate a particularly large workload. Prioritize
    // unknown counts ahead of exact counts instead of treating them as empty.
    workloads.sort((left, right) => {
      if (left.expiredRowCount === null) {
        return right.expiredRowCount === null ? 0 : -1;
      }
      if (right.expiredRowCount === null) {
        return 1;
      }
      return right.expiredRowCount - left.expiredRowCount;
    });

    return workloads.slice(
      0,
      env.LANGFUSE_BATCH_DATA_RETENTION_CLEANER_PROJECT_LIMIT,
    );
  }

  /**
   * Stream projects with expired rows from one bounded project chunk. Rows
   * yielded before a query failure remain eligible for deletion.
   */
  private async findExpiredProjectCandidates(
    timestampColumn: string,
    projects: ProjectRetention[],
  ): Promise<ProjectRetention[]> {
    if (projects.length === 0) {
      return [];
    }

    const { conditions, params } = buildRetentionConditions(
      timestampColumn,
      projects,
    );

    const query = `
      SELECT DISTINCT project_id
      FROM ${this.tableName}
      PREWHERE ${conditions}
      LIMIT {candidateLimit: UInt32}
    `;

    const candidatesById = new Map<string, ProjectRetention>();
    const projectsById = new Map(
      projects.map((project) => [project.projectId, project]),
    );

    try {
      const stream = queryClickhouseStream<{ project_id: string }>({
        query,
        params: {
          ...params,
          candidateLimit: env.LANGFUSE_BATCH_DATA_RETENTION_CLEANER_CHUNK_SIZE,
        },
        useMultipartParamsAuto: true,
        clickhouseConfigs: {
          // The shared client derives max_execution_time five seconds after
          // this request timeout and sends progress headers.
          request_timeout:
            env.LANGFUSE_BATCH_DATA_RETENTION_CLEANER_CANDIDATE_QUERY_TIMEOUT_MS,
          clickhouse_settings: {
            http_send_timeout: this.candidateQueryHttpTimeoutSeconds,
            http_receive_timeout: this.candidateQueryHttpTimeoutSeconds,
          },
        },
      });

      for await (const row of stream) {
        const project = projectsById.get(row.project_id);
        if (project) {
          candidatesById.set(row.project_id, project);
        }
        await this.extendLockOnProgress();
      }
    } catch (error) {
      if (error instanceof BatchDataRetentionCleanerLeaseLostError) {
        throw error;
      }
      recordIncrement(`${METRIC_PREFIX}.candidate_query_failures`, 1, {
        table: this.tableName,
      });
      logger.warn(`${this.instanceName}: Candidate query did not complete`, {
        error,
        candidatesFound: candidatesById.size,
      });
    }

    // A completed query is progress even when it did not yield a candidate.
    await this.extendLockOnProgress();

    return Array.from(candidatesById.values());
  }

  /**
   * Best-effort exact count and oldest age for discovered candidates. If this
   * query fails, estimate the oldest age from the monthly partition instead.
   */
  private async enrichProjectCandidates(
    timestampColumn: string,
    candidates: ProjectRetention[],
  ): Promise<ProjectWorkload[]> {
    if (candidates.length === 0) {
      return [];
    }

    const { conditions, params } = buildRetentionConditions(
      timestampColumn,
      candidates,
    );
    const query = `
      SELECT
        project_id,
        count() AS count,
        dateDiff('second', min(event_ts), now()) AS oldest_age_seconds
      FROM ${this.tableName}
      PREWHERE ${conditions}
      GROUP BY project_id
    `;

    try {
      const result = await queryClickhouse<{
        project_id: string;
        count: number;
        oldest_age_seconds: number;
      }>({
        query,
        params,
        useMultipartParamsAuto: true,
      });

      const resultByProjectId = new Map(
        result.map((row) => {
          const oldestAgeSeconds = Number(row.oldest_age_seconds);

          return [
            row.project_id,
            {
              count: Number(row.count),
              oldestAgeSeconds: Number.isFinite(oldestAgeSeconds)
                ? oldestAgeSeconds
                : null,
            },
          ] as const;
        }),
      );

      await this.extendLockOnProgress();

      return candidates.map((candidate) => {
        const resultForProject = resultByProjectId.get(candidate.projectId);
        return {
          ...candidate,
          expiredRowCount: resultForProject?.count ?? null,
          oldestAgeSeconds: resultForProject?.oldestAgeSeconds ?? null,
        };
      });
    } catch (error) {
      if (error instanceof BatchDataRetentionCleanerLeaseLostError) {
        throw error;
      }
      recordIncrement(`${METRIC_PREFIX}.enrichment_query_failures`, 1, {
        table: this.tableName,
      });
      logger.warn(`${this.instanceName}: Candidate enrichment failed`, {
        error,
        candidatesFound: candidates.length,
      });

      await this.extendLockOnProgress();
      return this.enrichCandidatesFromOldestPartition(candidates);
    }
  }

  /**
   * Estimate each candidate's oldest age from its oldest monthly partition.
   * The partition start is an upper bound on how far the oldest row is past
   * cutoff. If this query also fails, retain the candidates without metrics.
   */
  private async enrichCandidatesFromOldestPartition(
    candidates: ProjectRetention[],
  ): Promise<ProjectWorkload[]> {
    try {
      const partitionStartByProjectId = await getOldestProjectPartitionStarts(
        this.tableName,
        candidates.map((candidate) => candidate.projectId),
      );

      await this.extendLockOnProgress();

      const now = Date.now();
      return candidates.map((candidate) => {
        const partitionStart = partitionStartByProjectId.get(
          candidate.projectId,
        );
        return {
          ...candidate,
          expiredRowCount: null,
          oldestAgeSeconds: partitionStart
            ? (now - partitionStart.getTime()) / 1000
            : null,
        };
      });
    } catch (error) {
      if (error instanceof BatchDataRetentionCleanerLeaseLostError) {
        throw error;
      }
      recordIncrement(`${METRIC_PREFIX}.partition_fallback_query_failures`, 1, {
        table: this.tableName,
      });
      logger.warn(`${this.instanceName}: Partition fallback query failed`, {
        error,
        candidatesFound: candidates.length,
      });

      await this.extendLockOnProgress();
      return candidates.map((candidate) => ({
        ...candidate,
        expiredRowCount: null,
        oldestAgeSeconds: null,
      }));
    }
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

    // Reset the full lease immediately before the only destructive query. Its
    // TTL includes the configured DELETE timeout plus the existing buffer.
    await this.extendLockOnProgress(true);

    await commandClickhouse({
      query,
      params,
      clickhouseConfigs: {
        request_timeout:
          env.LANGFUSE_BATCH_DATA_RETENTION_CLEANER_DELETE_TIMEOUT_MS,
      },
    });
  }
}
