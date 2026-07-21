import { createHash } from "crypto";
import pLimit from "p-limit";

import { prisma } from "@langfuse/shared/src/db";
import {
  commandClickhouse,
  convertDateToClickhouseDateTime,
  logger,
  parseClickhouseUTCDateTimeFormat,
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
  rowCount: number | null;
  secondsPastCutoff: number | null;
}

interface ProjectWorkloadSelection {
  observedWorkloads: ProjectWorkload[];
  selectedWorkloads: ProjectWorkload[];
  lagMeasurementComplete: boolean;
}

interface CandidateDiscoveryResult {
  candidates: ProjectRetention[];
  complete: boolean;
}

interface EnrichmentResult {
  workloads: ProjectWorkload[];
  complete: boolean;
}

/**
 * Hash projectId to a short key for ClickHouse parameter names.
 */
function toParamKey(projectId: string): string {
  return createHash("md5").update(projectId).digest("hex").slice(0, 8);
}

/**
 * Build OR conditions for project-specific cutoffs.
 * Used by candidate discovery and delete queries.
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
 * 4. Best-effort enrich candidates with total row count and oldest timestamp
 * 5. Sort by lag past cutoff DESC, using total row count as a tie-breaker
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
      queryConcurrency:
        env.LANGFUSE_BATCH_DATA_RETENTION_CLEANER_QUERY_CONCURRENCY,
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
        const { observedWorkloads, selectedWorkloads, lagMeasurementComplete } =
          await this.getProjectWorkloads();

        recordGauge(
          `${METRIC_PREFIX}.pending_projects`,
          observedWorkloads.length,
          {
            table: this.tableName,
          },
        );

        // Retention cutoffs come from Postgres and are frozen once per run.
        // Fold the per-project results here to preserve one maximum across all
        // bounded ClickHouse queries.
        const observedMaxSecondsPastCutoff = observedWorkloads.reduce(
          (maximum, workload) =>
            workload.secondsPastCutoff === null
              ? maximum
              : Math.max(maximum, workload.secondsPastCutoff),
          0,
        );

        if (lagMeasurementComplete) {
          recordGauge(
            `${METRIC_PREFIX}.seconds_past_cutoff`,
            observedMaxSecondsPastCutoff,
            {
              table: this.tableName,
            },
          );
        }

        // Step 2: Execute DELETE
        if (selectedWorkloads.length > 0) {
          logger.info(
            `${this.instanceName}: Processing ${selectedWorkloads.length} projects`,
            {
              projectIds: selectedWorkloads.map(
                (workload) => workload.projectId,
              ),
              pendingProjectsSeen: observedWorkloads.length,
              observedMaxSecondsPastCutoff,
              lagMeasurementComplete,
            },
          );

          await this.executeBatchDelete(timestampColumn, selectedWorkloads);

          logger.info(`${this.instanceName}: Batch deletion completed`, {
            table: this.tableName,
            projectsProcessed: selectedWorkloads.length,
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
          selectedWorkloads.length,
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
   * 4. Best-effort enrich each chunk's candidates with total count/min
   * 5. Sort by lag, then total count, and select top PROJECT_LIMIT
   */
  private async getProjectWorkloads(): Promise<ProjectWorkloadSelection> {
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
      return {
        observedWorkloads: [],
        selectedWorkloads: [],
        lagMeasurementComplete: true,
      };
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

    // Step 4: Oldest timestamp provides the main ordering signal and total
    // count breaks ties, but deletion must not depend on this grouped query
    // succeeding. Keep enrichment per input chunk so its parameters remain
    // bounded too.
    const limitRetentionQuery = pLimit(
      env.LANGFUSE_BATCH_DATA_RETENTION_CLEANER_QUERY_CONCURRENCY,
    );
    let leaseLost = false;
    // Wait for every limited pipeline so no queued query outlives the lock.
    const settledChunkResults = await Promise.allSettled(
      projectChunks.map((projectChunk) =>
        limitRetentionQuery(async () => {
          if (leaseLost) {
            return null;
          }

          try {
            const discovery = await this.findExpiredProjectCandidates(
              timestampColumn,
              projectChunk,
            );
            if (leaseLost) {
              return null;
            }

            const enrichment = await this.enrichProjectCandidates(
              timestampColumn,
              discovery.candidates,
            );
            return {
              workloads: enrichment.workloads,
              complete: discovery.complete && enrichment.complete,
            };
          } catch (error) {
            if (error instanceof BatchDataRetentionCleanerLeaseLostError) {
              leaseLost = true;
            }
            throw error;
          }
        }),
      ),
    );

    const failedChunk = settledChunkResults.find(
      (result): result is PromiseRejectedResult => result.status === "rejected",
    );
    if (failedChunk) {
      throw failedChunk.reason;
    }

    const chunkResults = settledChunkResults.flatMap((result) =>
      result.status === "fulfilled" && result.value !== null
        ? [result.value]
        : [],
    );
    const workloads = chunkResults.flatMap((result) => result.workloads);

    // Prioritize the projects furthest behind their cutoff. A failed lag or
    // count estimate can indicate a particularly large workload, so keep
    // unknown values ahead of known ones to avoid starvation.
    workloads.sort((left, right) => {
      if (left.secondsPastCutoff === null) {
        if (right.secondsPastCutoff !== null) {
          return -1;
        }
      } else if (right.secondsPastCutoff === null) {
        return 1;
      } else {
        const lagDifference = right.secondsPastCutoff - left.secondsPastCutoff;
        if (lagDifference !== 0) {
          return lagDifference;
        }
      }

      if (left.rowCount === null) {
        return right.rowCount === null ? 0 : -1;
      }
      if (right.rowCount === null) {
        return 1;
      }
      return right.rowCount - left.rowCount;
    });

    return {
      observedWorkloads: workloads,
      selectedWorkloads: workloads.slice(
        0,
        env.LANGFUSE_BATCH_DATA_RETENTION_CLEANER_PROJECT_LIMIT,
      ),
      lagMeasurementComplete: chunkResults.every((result) => result.complete),
    };
  }

  /**
   * Stream projects with expired rows from one bounded project chunk. Rows
   * yielded before a query failure remain eligible for deletion.
   */
  private async findExpiredProjectCandidates(
    timestampColumn: string,
    projects: ProjectRetention[],
  ): Promise<CandidateDiscoveryResult> {
    if (projects.length === 0) {
      return { candidates: [], complete: true };
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
    let complete = true;
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
      complete = false;
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

    return {
      candidates: Array.from(candidatesById.values()),
      complete,
    };
  }

  /**
   * Best-effort total count and oldest retention timestamp for discovered
   * candidates. The query deliberately filters only on project_id. Retention
   * cutoffs come from Postgres and are frozen once per run, so they are applied
   * after the result is returned. A failed primary query is retried once on a
   * read-only pool. If both attempts fail, candidates remain eligible for
   * deletion without publishing a partial lag maximum.
   */
  private async enrichProjectCandidates(
    timestampColumn: string,
    candidates: ProjectRetention[],
  ): Promise<EnrichmentResult> {
    if (candidates.length === 0) {
      return { workloads: [], complete: true };
    }

    const query = `
      SELECT
        project_id,
        count() AS row_count,
        min(${timestampColumn}) AS oldest_timestamp
      FROM ${this.tableName}
      PREWHERE project_id IN ({candidateProjectIds: Array(String)})
      GROUP BY project_id
    `;

    const queryExactWorkloads = async (
      preferredClickhouseService?: "ReadOnly" | "EventsReadOnly",
    ): Promise<ProjectWorkload[]> => {
      const result = await queryClickhouse<{
        project_id: string;
        row_count: number;
        oldest_timestamp: string;
      }>({
        query,
        params: {
          candidateProjectIds: candidates.map(
            (candidate) => candidate.projectId,
          ),
        },
        useMultipartParamsAuto: true,
        preferredClickhouseService,
        clickhouseConfigs: {
          request_timeout:
            env.LANGFUSE_BATCH_DATA_RETENTION_CLEANER_CANDIDATE_QUERY_TIMEOUT_MS,
          clickhouse_settings: {
            http_send_timeout: this.candidateQueryHttpTimeoutSeconds,
            http_receive_timeout: this.candidateQueryHttpTimeoutSeconds,
          },
        },
      });

      const resultByProjectId = new Map(
        result.map((row) => {
          const oldestTimestamp = parseClickhouseUTCDateTimeFormat(
            row.oldest_timestamp,
          );
          if (Number.isNaN(oldestTimestamp.getTime())) {
            throw new Error(
              `Invalid oldest timestamp for project ${row.project_id}`,
            );
          }

          return [
            row.project_id,
            {
              rowCount: Number(row.row_count),
              oldestTimestamp,
            },
          ] as const;
        }),
      );

      return candidates.flatMap((candidate) => {
        const resultForProject = resultByProjectId.get(candidate.projectId);
        if (
          !resultForProject ||
          resultForProject.oldestTimestamp.getTime() >=
            candidate.cutoffDate.getTime()
        ) {
          return [];
        }

        return [
          {
            ...candidate,
            rowCount: resultForProject.rowCount,
            secondsPastCutoff:
              (candidate.cutoffDate.getTime() -
                resultForProject.oldestTimestamp.getTime()) /
              1000,
          },
        ];
      });
    };

    try {
      const workloads = await queryExactWorkloads();
      await this.extendLockOnProgress();
      return { workloads, complete: true };
    } catch (error) {
      if (error instanceof BatchDataRetentionCleanerLeaseLostError) {
        throw error;
      }
      logger.warn(
        `${this.instanceName}: Candidate enrichment failed; retrying on read-only`,
        {
          error,
          candidatesFound: candidates.length,
        },
      );

      // Reset the lease before another potentially long exact query.
      await this.extendLockOnProgress(true);

      const preferredClickhouseService =
        this.tableName === "events_full" || this.tableName === "events_core"
          ? "EventsReadOnly"
          : "ReadOnly";

      try {
        const workloads = await queryExactWorkloads(preferredClickhouseService);
        await this.extendLockOnProgress();
        return { workloads, complete: true };
      } catch (retryError) {
        if (retryError instanceof BatchDataRetentionCleanerLeaseLostError) {
          throw retryError;
        }

        recordIncrement(`${METRIC_PREFIX}.enrichment_query_failures`, 1, {
          table: this.tableName,
        });
        logger.warn(`${this.instanceName}: Candidate enrichment failed`, {
          error: retryError,
          primaryError: error,
          candidatesFound: candidates.length,
        });

        await this.extendLockOnProgress();
        return {
          workloads: candidates.map((candidate) => ({
            ...candidate,
            rowCount: null,
            secondsPastCutoff: null,
          })),
          complete: false,
        };
      }
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
