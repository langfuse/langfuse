import {
  ActionId,
  BatchActionStatus,
  BatchExportTableName,
  TraceDeleteBatchActionConfigSchema,
} from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import {
  logger,
  recordGauge,
  recordIncrement,
  traceException,
} from "@langfuse/shared/src/server";
import { env } from "../../env";
import { PeriodicExclusiveRunner } from "../../utils/PeriodicExclusiveRunner";
import { processTraceDeleteBatchAction } from "../batchAction/processTraceDeleteBatchAction";

const METRIC_PREFIX = "langfuse.trace_delete_batch_action_runner";

export const TRACE_DELETE_BATCH_ACTION_RUNNER_LOCK_KEY =
  "langfuse:trace-delete-batch-action-runner";

const ACTIVE_BATCH_ACTION_STATUSES = [
  BatchActionStatus.Queued,
  BatchActionStatus.Processing,
];

const ACTIVE_TRACE_DELETE_BATCH_ACTION_WHERE = {
  actionType: ActionId.TraceDelete,
  tableName: BatchExportTableName.Traces,
  status: { in: ACTIVE_BATCH_ACTION_STATUSES },
};

type ActiveTraceDeleteBatchAction = {
  id: string;
  projectId: string;
  status: string;
  processedCount: number | null;
  failedCount: number | null;
  updatedAt: Date;
  config: unknown;
};

type ActiveTraceDeleteBatchActionWorkload = {
  activeActionCount: number;
  batchAction: ActiveTraceDeleteBatchAction | null;
};

export class TraceDeleteBatchActionRunner extends PeriodicExclusiveRunner {
  private readonly intervalMs: number;
  private readonly lockTtlSeconds: number;
  private readonly batchSize: number;
  private readonly maxBatchesPerRun: number;

  protected get defaultIntervalMs(): number {
    return this.intervalMs;
  }

  constructor(
    opts: {
      intervalMs?: number;
      lockTtlSeconds?: number;
      batchSize?: number;
      maxBatchesPerRun?: number;
    } = {},
  ) {
    const lockTtlSeconds =
      opts.lockTtlSeconds ??
      env.LANGFUSE_TRACE_DELETE_BATCH_ACTION_RUNNER_LOCK_TTL_SECONDS;

    super({
      name: "TraceDeleteBatchActionRunner",
      lockKey: TRACE_DELETE_BATCH_ACTION_RUNNER_LOCK_KEY,
      lockTtlSeconds,
      onUnavailable: "fail",
    });

    this.lockTtlSeconds = lockTtlSeconds;
    this.intervalMs =
      opts.intervalMs ??
      env.LANGFUSE_TRACE_DELETE_BATCH_ACTION_RUNNER_INTERVAL_MS;
    this.batchSize = opts.batchSize ?? env.LANGFUSE_DELETE_BATCH_SIZE;
    this.maxBatchesPerRun =
      opts.maxBatchesPerRun ??
      env.LANGFUSE_TRACE_DELETE_BATCH_ACTION_RUNNER_MAX_BATCHES_PER_RUN;
  }

  public override start(): void {
    logger.info(`Starting ${this.instanceName}`, {
      intervalMs: this.intervalMs,
      lockTtlSeconds: this.lockTtlSeconds,
      batchSize: this.batchSize,
      maxBatchesPerRun: this.maxBatchesPerRun,
    });
    super.start();
  }

  protected async execute(): Promise<number | void> {
    return await this.withLock(
      async () => {
        // Treat active trace-delete BatchActions as a global work queue. Each
        // processing pass handles only maxBatchesPerRun; if it yields, the
        // updated row moves to the back via updatedAt, and returning 0 makes
        // the runner immediately poll again so other active actions can run.
        let workload: ActiveTraceDeleteBatchActionWorkload;
        try {
          workload = await this.getActiveWorkload();
        } catch (error) {
          logger.error(`${this.instanceName}: Failed to query active actions`, {
            error,
          });
          traceException(error);
          recordIncrement(`${METRIC_PREFIX}.query_failures`, 1);
          throw error;
        }

        const { activeActionCount, batchAction } = workload;
        recordGauge(`${METRIC_PREFIX}.active_actions`, activeActionCount);
        if (!batchAction) {
          logger.debug(`${this.instanceName}: No active trace delete actions`);
          recordGauge(`${METRIC_PREFIX}.oldest_active_action_age_seconds`, 0);
          return;
        }

        const config = TraceDeleteBatchActionConfigSchema.safeParse(
          batchAction.config,
        );
        const source = config.success ? config.data.source : "unknown";
        const oldestActionAgeSeconds = Math.max(
          Math.floor((Date.now() - batchAction.updatedAt.getTime()) / 1000),
          0,
        );
        recordGauge(
          `${METRIC_PREFIX}.oldest_active_action_age_seconds`,
          oldestActionAgeSeconds,
        );

        logger.info(`${this.instanceName}: Processing trace delete action`, {
          batchActionId: batchAction.id,
          projectId: batchAction.projectId,
          status: batchAction.status,
          source,
          activeActionCount,
          oldestActionAgeSeconds,
          processedCount: batchAction.processedCount,
          failedCount: batchAction.failedCount,
        });

        const result = await processTraceDeleteBatchAction({
          batchActionId: batchAction.id,
          batchSize: this.batchSize,
          maxBatchesPerRun: this.maxBatchesPerRun,
          canCommitProgress: () => this.lock.isHeldByCurrentProcess(),
          extendLease: () => this.lock.extend(),
        });

        logger.info(`${this.instanceName}: Trace delete action processed`, {
          batchActionId: batchAction.id,
          projectId: batchAction.projectId,
          source,
          resultStatus: result.status,
          processedBatches: result.processedBatches,
          processedCount:
            result.status === "yielded" ? result.processedCount : undefined,
        });

        recordIncrement(`${METRIC_PREFIX}.actions_processed`, 1, {
          status: result.status,
          source,
        });
        recordIncrement(
          `${METRIC_PREFIX}.batches_processed`,
          result.processedBatches,
          {
            status: result.status,
            source,
          },
        );

        return result.status === "yielded" ? 0 : undefined;
      },
      () => {
        recordIncrement(`${METRIC_PREFIX}.processing_failures`, 1);
      },
    );
  }

  private async getActiveWorkload(): Promise<ActiveTraceDeleteBatchActionWorkload> {
    const [activeActionCount, batchAction] = await prisma.$transaction([
      prisma.batchAction.count({
        where: ACTIVE_TRACE_DELETE_BATCH_ACTION_WHERE,
      }),
      prisma.batchAction.findFirst({
        where: ACTIVE_TRACE_DELETE_BATCH_ACTION_WHERE,
        orderBy: [{ updatedAt: "asc" }],
        select: {
          id: true,
          projectId: true,
          status: true,
          processedCount: true,
          failedCount: true,
          updatedAt: true,
          config: true,
        },
      }),
    ]);

    return {
      activeActionCount,
      batchAction,
    };
  }
}
