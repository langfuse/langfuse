import {
  getDeletedProjects,
  logger,
  queryClickhouse,
  recordIncrement,
  removeIngestionEventsFromS3AndDeleteClickhouseRefsForProject,
  traceException,
} from "@langfuse/shared/src/server";
import { env } from "../../env";
import { PeriodicExclusiveRunner } from "../../utils/PeriodicExclusiveRunner";

const METRIC_PREFIX = "langfuse.batch_project_blob_cleaner";

/**
 * BatchProjectBlobCleaner is a safety net for blob storage cleanup of soft-deleted projects.
 *
 * The ProjectDelete queue job handles full cleanup, but projects with millions of
 * ingestion events often have their monolithic job killed mid-flight (deploys, OOM,
 * timeouts). This cleaner picks the soft-deleted project with the most remaining
 * blob refs and attempts a full cleanup per iteration. The underlying
 * removeIngestionEventsFromS3AndDeleteClickhouseRefsForProject streams internally
 * in batches of 500 with CH soft-delete — if interrupted mid-stream, partial
 * progress is preserved and the next run picks up where it left off, so both
 * this cleaner and the queue job have less work on retry.
 */
export class BatchProjectBlobCleaner extends PeriodicExclusiveRunner {
  protected get defaultIntervalMs(): number {
    return env.LANGFUSE_BATCH_PROJECT_CLEANER_SLEEP_ON_EMPTY_MS;
  }

  constructor() {
    const lockTtlSeconds =
      Math.ceil(env.LANGFUSE_BATCH_PROJECT_CLEANER_DELETE_TIMEOUT_MS / 1000) +
      300;

    super({
      name: "BatchProjectBlobCleaner",
      lockKey: "langfuse:batch-project-blob-cleaner",
      lockTtlSeconds,
    });
  }

  public override start(): void {
    logger.info(`Starting ${this.instanceName}`, {
      sleepOnEmptyMs: env.LANGFUSE_BATCH_PROJECT_CLEANER_SLEEP_ON_EMPTY_MS,
      checkIntervalMs: env.LANGFUSE_BATCH_PROJECT_CLEANER_CHECK_INTERVAL_MS,
      projectLimit: env.LANGFUSE_BATCH_PROJECT_CLEANER_PROJECT_LIMIT,
    });
    super.start();
  }

  protected async execute(): Promise<number> {
    // Steps 1-2 run outside the lock (cheap reads). Two workers may pick the
    // same project, but blob cleanup is idempotent (CH soft-delete is a no-op
    // on already-deleted rows). This matches BatchProjectCleaner's pattern.
    //
    // Note: getDeletedProjects has no orderBy, so with more soft-deleted
    // projects than PROJECT_LIMIT, the PG window is arbitrary and some
    // projects may be consistently excluded. The CH count query mitigates
    // this by prioritizing the project with the most remaining blobs
    // within whatever subset PG returns.

    // Step 1: Query PG for soft-deleted projects
    let deletedProjects: Array<{ id: string }>;
    try {
      deletedProjects = await getDeletedProjects(
        env.LANGFUSE_BATCH_PROJECT_CLEANER_PROJECT_LIMIT,
      );
    } catch (error) {
      logger.error(`${this.instanceName}: Failed to query deleted projects`, {
        error,
      });
      traceException(error);
      return env.LANGFUSE_BATCH_PROJECT_CLEANER_SLEEP_ON_EMPTY_MS;
    }

    if (deletedProjects.length === 0) {
      return env.LANGFUSE_BATCH_PROJECT_CLEANER_SLEEP_ON_EMPTY_MS;
    }

    // Step 2: Check ClickHouse for which projects still have blob refs
    let blobCounts: Map<string, number>;
    try {
      blobCounts = await this.getBlobCounts(deletedProjects.map((p) => p.id));
    } catch (error) {
      logger.error(
        `${this.instanceName}: Failed to query ClickHouse blob counts`,
        { error },
      );
      traceException(error);
      return env.LANGFUSE_BATCH_PROJECT_CLEANER_SLEEP_ON_EMPTY_MS;
    }

    // Pick the project with the most remaining blobs
    const targetEntry = Array.from(blobCounts.entries())
      .filter(([, count]) => count > 0)
      .sort(([, a], [, b]) => b - a)[0];

    if (!targetEntry) {
      logger.info(
        `${this.instanceName}: No blob data found for deleted projects`,
      );
      return env.LANGFUSE_BATCH_PROJECT_CLEANER_SLEEP_ON_EMPTY_MS;
    }

    const [projectId, count] = targetEntry;

    logger.info(`${this.instanceName}: Processing project`, {
      projectId,
      blobCount: count,
    });

    // Step 3: Delete under lock
    return (
      (await this.withLock(
        async () => {
          await removeIngestionEventsFromS3AndDeleteClickhouseRefsForProject(
            projectId,
            undefined, // no cutoff — delete all
          );

          logger.info(`${this.instanceName}: Blob cleanup completed`, {
            projectId,
          });
          recordIncrement(`${METRIC_PREFIX}.projects_completed`, 1);

          return env.LANGFUSE_BATCH_PROJECT_CLEANER_CHECK_INTERVAL_MS;
        },
        (_error) => {
          recordIncrement(`${METRIC_PREFIX}.failures`, 1);
          return env.LANGFUSE_BATCH_PROJECT_CLEANER_CHECK_INTERVAL_MS;
        },
      )) ?? env.LANGFUSE_BATCH_PROJECT_CLEANER_SLEEP_ON_EMPTY_MS
    );
  }

  private async getBlobCounts(
    projectIds: string[],
  ): Promise<Map<string, number>> {
    if (projectIds.length === 0) {
      return new Map();
    }

    const results = await queryClickhouse<{
      project_id: string;
      count: string;
    }>({
      // Can return negative values (e.g. duplicate soft-delete rows before merge).
      // Caller filters with count > 0.
      query: `
        SELECT
          project_id,
          countIf(is_deleted = 0) - countIf(is_deleted = 1) as count
        FROM blob_storage_file_log
        WHERE project_id IN ({projectIds: Array(String)})
        GROUP BY project_id
      `,
      params: { projectIds },
      tags: {
        feature: "batch-project-blob-cleaner",
        operation: "count",
      },
    });

    const counts = new Map<string, number>();
    for (const row of results) {
      counts.set(row.project_id, Number(row.count));
    }
    return counts;
  }
}
