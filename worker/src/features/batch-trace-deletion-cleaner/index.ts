import { prisma } from "@langfuse/shared/src/db";
import {
  logger,
  recordIncrement,
  traceException,
} from "@langfuse/shared/src/server";
import { env } from "../../env";
import { PeriodicExclusiveRunner } from "../../utils/PeriodicExclusiveRunner";
import { processClickhouseTraceDelete } from "../traces/processClickhouseTraceDelete";
import { processPostgresTraceDelete } from "../traces/processPostgresTraceDelete";

const METRIC_PREFIX = "langfuse.batch_trace_deletion_cleaner";

export const BATCH_TRACE_DELETION_CLEANER_LOCK_KEY =
  "langfuse:batch-trace-deletion-cleaner";

interface ProjectWorkload {
  projectId: string;
  pendingCount: number;
}

/**
 * BatchTraceDeletionCleaner handles periodic deletion of traces from pending_deletions.
 *
 * Supplements the queue-based TraceDeleteQueue by processing the project with
 * the most pending deletions. This helps clear large backlogs that accumulate
 * when queue processing can't keep up.
 *
 * Processes one project per iteration (most work first) for simplicity.
 * Run frequently to process all projects over time.
 */
export class BatchTraceDeletionCleaner extends PeriodicExclusiveRunner {
  protected get defaultIntervalMs(): number {
    return env.LANGFUSE_BATCH_TRACE_DELETION_CLEANER_INTERVAL_MS;
  }

  constructor() {
    super({
      name: "BatchTraceDeletionCleaner",
      lockKey: BATCH_TRACE_DELETION_CLEANER_LOCK_KEY,
      lockTtlSeconds:
        env.LANGFUSE_BATCH_TRACE_DELETION_CLEANER_LOCK_TTL_SECONDS,
      onUnavailable: "fail",
    });
  }

  public override start(): void {
    logger.info(`Starting ${this.instanceName}`, {
      intervalMs: env.LANGFUSE_BATCH_TRACE_DELETION_CLEANER_INTERVAL_MS,
      batchSize: env.LANGFUSE_DELETE_BATCH_SIZE,
      lockTtlSeconds:
        env.LANGFUSE_BATCH_TRACE_DELETION_CLEANER_LOCK_TTL_SECONDS,
    });
    super.start();
  }

  /**
   * Process pending trace deletions for the project with most work.
   * Preflight and deletion are both under lock to avoid redundant expensive queries.
   */
  protected async execute(): Promise<void> {
    await this.withLock(
      async () => {
        // Get the project with most pending deletions (single project per iteration)
        let workload: ProjectWorkload | null;
        try {
          workload = await this.getTopProjectWorkload();
        } catch (error) {
          logger.error(`${this.name}: Failed to query project workload`, {
            error,
          });
          traceException(error);
          recordIncrement(`${METRIC_PREFIX}.query_failures`, 1);
          throw error;
        }

        if (workload) {
          logger.info(`${this.instanceName}: Processing project`, {
            projectId: workload.projectId,
            pendingCount: workload.pendingCount,
          });

          await this.processProject(workload.projectId);
          recordIncrement(`${METRIC_PREFIX}.projects_processed`, 1);
        } else {
          logger.info(`${this.name}: No pending trace deletions to process`);
        }
      },
      () => {
        recordIncrement(`${METRIC_PREFIX}.deletion_failures`, 1);
      },
    );
  }

  /**
   * Get the project with the most pending trace deletions.
   * Returns null if no projects have pending deletions.
   */
  private async getTopProjectWorkload(): Promise<ProjectWorkload | null> {
    const result = await prisma.$queryRaw<
      Array<{
        project_id: string;
        pending_count: bigint;
      }>
    >`
      SELECT d.project_id, count(*) as pending_count
      FROM pending_deletions d
      JOIN projects p ON p.id = d.project_id
      WHERE d.is_deleted = false
        AND d.object = 'trace'
        AND p.deleted_at IS NULL
      GROUP BY d.project_id
      ORDER BY 2 DESC
      LIMIT 1
    `;

    if (result.length === 0) {
      return null;
    }

    const row = result[0];
    return {
      projectId: row.project_id,
      pendingCount: Number(row.pending_count),
    };
  }

  private async processProject(projectId: string): Promise<void> {
    // Get trace IDs to delete (no orderBy for faster query)
    const pendingDeletions = await prisma.pendingDeletion.findMany({
      where: {
        projectId,
        object: "trace",
        isDeleted: false,
      },
      select: { objectId: true },
      take: env.LANGFUSE_DELETE_BATCH_SIZE,
    });

    if (pendingDeletions.length === 0) {
      logger.info(`${this.name}: No traces to delete for project`, {
        projectId,
      });
      return;
    }

    const traceIdsToDelete = pendingDeletions.map((d) => d.objectId);

    logger.info(`${this.name}: Deleting traces`, {
      projectId,
      count: traceIdsToDelete.length,
    });

    // Delete from both Postgres and ClickHouse in parallel
    await Promise.all([
      processPostgresTraceDelete(projectId, traceIdsToDelete),
      processClickhouseTraceDelete(projectId, traceIdsToDelete),
    ]);

    // Mark traces as deleted
    await prisma.pendingDeletion.updateMany({
      where: {
        projectId,
        object: "trace",
        objectId: {
          in: traceIdsToDelete,
        },
        isDeleted: false,
      },
      data: {
        isDeleted: true,
      },
    });

    recordIncrement(
      `${METRIC_PREFIX}.traces_deleted`,
      traceIdsToDelete.length,
      { projectId },
    );

    logger.info(`${this.name}: Project processed`, {
      projectId,
      tracesDeleted: traceIdsToDelete.length,
    });
  }
}
