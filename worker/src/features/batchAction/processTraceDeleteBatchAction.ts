import { prisma } from "@langfuse/shared/src/db";
import {
  ActionId,
  BatchActionQuerySchema,
  BatchActionStatus,
  TraceDeleteBatchActionConfigSchema,
  type FilterCondition,
  type FilterState,
  type TraceDeleteBatchActionConfig,
  type TraceDeleteBatchActionCursor,
} from "@langfuse/shared";
import {
  getTraceDeleteCursorPageFromEvents,
  getTraceDeleteCursorPageFromTraces,
  logger,
  shouldSkipDeletionFor,
} from "@langfuse/shared/src/server";
import { env } from "../../env";
import { processClickhouseTraceDelete } from "../traces/processClickhouseTraceDelete";
import { processPostgresTraceDelete } from "../traces/processPostgresTraceDelete";

type TraceDeleteCursorPageRow = TraceDeleteBatchActionCursor;
type CanCommitProgress = () => Promise<boolean>;
type ExtendLease = () => Promise<boolean>;
type ShouldSkipDeletion = typeof shouldSkipDeletionFor;
type TraceDeleteBatchActionState = {
  status: BatchActionStatus;
  processedCount: number;
  totalCount: number | null;
  finishedAt: Date | null;
  log: string | null;
  config: TraceDeleteBatchActionConfig;
};

export const TRACE_DELETE_BATCH_ACTION_MAX_BATCHES_PER_RUN = 5;
export const TRACE_DELETE_BATCH_ACTION_MAX_FAILURES = 10;

export type ProcessTraceDeleteBatchActionResult =
  | {
      status: "completed";
      processedBatches: number;
    }
  | {
      status: "failed";
      processedBatches: number;
    }
  | {
      status: "yielded";
      processedBatches: number;
      processedCount: number;
    };

class TraceDeleteBatchActionLeaseLostError extends Error {
  constructor(batchActionId: string) {
    super(`Trace delete batch action ${batchActionId} lost its worker lease`);
    this.name = "TraceDeleteBatchActionLeaseLostError";
  }
}

const assertCanCommitProgress = async (opts: {
  batchActionId: string;
  canCommitProgress?: CanCommitProgress;
}) => {
  if (opts.canCommitProgress && !(await opts.canCommitProgress())) {
    throw new TraceDeleteBatchActionLeaseLostError(opts.batchActionId);
  }
};

const extendProcessingLease = async (opts: {
  batchActionId: string;
  extendLease?: ExtendLease;
}) => {
  if (opts.extendLease && !(await opts.extendLease())) {
    throw new TraceDeleteBatchActionLeaseLostError(opts.batchActionId);
  }
};

const convertDatesInFiltersFromStrings = (
  filters: FilterCondition[],
): FilterState => {
  return filters.map((filter) => {
    if (filter.type !== "datetime") {
      return filter;
    }

    const value = (filter as { value: unknown }).value;
    return typeof value === "string"
      ? ({ ...filter, value: new Date(value) } as FilterCondition)
      : filter;
  });
};

const buildInFlightBatch = (rows: TraceDeleteCursorPageRow[]) => {
  const last = rows.at(-1);

  if (!last) {
    return null;
  }

  const timestamps = rows.map((row) => new Date(row.timestamp).getTime());
  const minTimestamp = new Date(Math.min(...timestamps));
  const maxTimestamp = new Date(Math.max(...timestamps));

  return {
    traceIds: rows.map((row) => row.traceId),
    cursorAfter: {
      timestamp: last.timestamp,
      traceId: last.traceId,
      ...(last.id ? { id: last.id } : {}),
    },
    minTimestamp: minTimestamp.toISOString(),
    maxTimestamp: maxTimestamp.toISOString(),
  };
};

const buildTraceDeleteBatchActionState = (
  batchAction: {
    status: string;
    processedCount: number | null;
    totalCount: number | null;
    finishedAt: Date | null;
    log: string | null;
  },
  config: TraceDeleteBatchActionConfig,
): TraceDeleteBatchActionState => ({
  status: batchAction.status as BatchActionStatus,
  processedCount: batchAction.processedCount ?? 0,
  totalCount: batchAction.totalCount,
  finishedAt: batchAction.finishedAt,
  log: batchAction.log,
  config,
});

const markTraceDeleteBatchActionProcessing = (
  state: TraceDeleteBatchActionState,
  config: TraceDeleteBatchActionConfig,
): TraceDeleteBatchActionState => ({
  ...state,
  status: BatchActionStatus.Processing,
  finishedAt: null,
  config,
});

const completeTraceDeleteBatchActionState = (
  state: TraceDeleteBatchActionState,
  processedCount: number,
): TraceDeleteBatchActionState => ({
  ...state,
  status: BatchActionStatus.Completed,
  finishedAt: new Date(),
  processedCount,
  totalCount: processedCount,
  config: {
    ...state.config,
    failureCount: 0,
    inFlightBatch: null,
  },
});

const advanceTraceDeleteBatchActionState = (
  state: TraceDeleteBatchActionState,
  processedCount: number,
  inFlightBatch: NonNullable<TraceDeleteBatchActionConfig["inFlightBatch"]>,
): TraceDeleteBatchActionState => ({
  ...state,
  status: BatchActionStatus.Processing,
  finishedAt: null,
  processedCount,
  config: {
    ...state.config,
    failureCount: 0,
    inFlightBatch,
  },
});

const failTraceDeleteBatchActionState = (
  state: TraceDeleteBatchActionState,
  opts: {
    failureCount?: number;
    log: string;
    finishedAt?: Date | null;
  },
): TraceDeleteBatchActionState => ({
  ...state,
  status: opts.finishedAt ? BatchActionStatus.Failed : state.status,
  finishedAt: opts.finishedAt ?? state.finishedAt,
  log: opts.log,
  config:
    opts.failureCount === undefined
      ? state.config
      : {
          ...state.config,
          failureCount: opts.failureCount,
        },
});

const commitTraceDeleteBatchActionState = async (opts: {
  batchActionId: string;
  state: TraceDeleteBatchActionState;
  canCommitProgress?: CanCommitProgress;
}) => {
  await assertCanCommitProgress(opts);

  await prisma.batchAction.update({
    where: { id: opts.batchActionId },
    data: {
      status: opts.state.status,
      processedCount: opts.state.processedCount,
      failedCount: 0,
      totalCount: opts.state.totalCount,
      finishedAt: opts.state.finishedAt,
      log: opts.state.log,
      config: opts.state.config,
    },
  });
};

const selectNextTraceDeleteBatch = async (opts: {
  projectId: string;
  query: unknown;
  config: TraceDeleteBatchActionConfig;
  cursor: TraceDeleteBatchActionCursor | null;
  batchSize: number;
}) => {
  const query = BatchActionQuerySchema.parse(opts.query);
  const filter = convertDatesInFiltersFromStrings(query.filter ?? []);
  const cutoffCreatedAt = new Date(opts.config.cutoffCreatedAt);

  const rows =
    opts.config.source === "events"
      ? await getTraceDeleteCursorPageFromEvents({
          projectId: opts.projectId,
          filter,
          cutoffCreatedAt,
          cursor: opts.cursor,
          searchQuery: query.searchQuery,
          searchType: query.searchType ?? ["id"],
          limit: opts.batchSize,
        })
      : await getTraceDeleteCursorPageFromTraces({
          projectId: opts.projectId,
          filter,
          cutoffCreatedAt,
          cursor: opts.cursor,
          searchQuery: query.searchQuery,
          searchType: query.searchType ?? ["id"],
          limit: opts.batchSize,
        });

  return buildInFlightBatch(rows);
};

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "Unknown trace delete error";

const recordTraceDeleteBatchActionFailure = async (opts: {
  batchActionId: string;
  error: unknown;
  canCommitProgress?: CanCommitProgress;
}) => {
  const batchAction = await prisma.batchAction.findUnique({
    where: { id: opts.batchActionId },
  });

  if (
    !batchAction ||
    batchAction.status === BatchActionStatus.Completed ||
    batchAction.status === BatchActionStatus.Failed
  ) {
    return;
  }

  const config = TraceDeleteBatchActionConfigSchema.parse(batchAction.config);
  const failureCount = config.failureCount + 1;
  const errorMessage = getErrorMessage(opts.error);
  const currentState = buildTraceDeleteBatchActionState(batchAction, config);

  if (failureCount >= TRACE_DELETE_BATCH_ACTION_MAX_FAILURES) {
    await commitTraceDeleteBatchActionState({
      batchActionId: opts.batchActionId,
      canCommitProgress: opts.canCommitProgress,
      state: failTraceDeleteBatchActionState(currentState, {
        failureCount,
        finishedAt: new Date(),
        log: `Trace delete batch action failed after ${failureCount} consecutive failures: ${errorMessage}`,
      }),
    });
    return;
  }

  await commitTraceDeleteBatchActionState({
    batchActionId: opts.batchActionId,
    canCommitProgress: opts.canCommitProgress,
    state: failTraceDeleteBatchActionState(currentState, {
      failureCount,
      log: `Trace delete batch action failure ${failureCount}/${TRACE_DELETE_BATCH_ACTION_MAX_FAILURES}: ${errorMessage}`,
    }),
  });
};

export const processTraceDeleteBatchAction = async ({
  batchActionId,
  batchSize = env.LANGFUSE_DELETE_BATCH_SIZE,
  maxBatchesPerRun = TRACE_DELETE_BATCH_ACTION_MAX_BATCHES_PER_RUN,
  canCommitProgress,
  extendLease,
  shouldSkipDeletion = shouldSkipDeletionFor,
}: {
  batchActionId: string;
  batchSize?: number;
  maxBatchesPerRun?: number;
  canCommitProgress?: CanCommitProgress;
  extendLease?: ExtendLease;
  shouldSkipDeletion?: ShouldSkipDeletion;
}): Promise<ProcessTraceDeleteBatchActionResult> => {
  const maxBatches = Math.max(1, Math.floor(maxBatchesPerRun));
  let processedBatches = 0;
  let lastProcessedCount = 0;

  try {
    while (processedBatches < maxBatches) {
      const batchAction = await prisma.batchAction.findUnique({
        where: { id: batchActionId },
      });

      if (!batchAction) {
        throw new Error(`Trace delete batch action ${batchActionId} not found`);
      }

      if (batchAction.actionType !== ActionId.TraceDelete) {
        throw new Error(
          `Batch action ${batchActionId} is not a trace-delete action`,
        );
      }

      if (
        batchAction.status === BatchActionStatus.Completed ||
        batchAction.status === BatchActionStatus.Failed
      ) {
        return { status: "completed", processedBatches };
      }

      const config = TraceDeleteBatchActionConfigSchema.parse(
        batchAction.config,
      );
      let state = buildTraceDeleteBatchActionState(batchAction, config);
      let inFlightBatch = config.inFlightBatch;

      if (!inFlightBatch) {
        // The durable cursor only exists as part of inFlightBatch. A missing
        // batch means this action is starting from the first page; every later
        // page is persisted before the loop can continue.
        inFlightBatch = await selectNextTraceDeleteBatch({
          projectId: batchAction.projectId,
          query: batchAction.query,
          config,
          cursor: null,
          batchSize,
        });

        if (!inFlightBatch) {
          state = completeTraceDeleteBatchActionState(
            state,
            batchAction.processedCount ?? 0,
          );
          await commitTraceDeleteBatchActionState({
            batchActionId,
            canCommitProgress,
            state,
          });
          return { status: "completed", processedBatches };
        }

        state = markTraceDeleteBatchActionProcessing(state, {
          ...config,
          inFlightBatch,
        });
        await commitTraceDeleteBatchActionState({
          batchActionId,
          canCommitProgress,
          state,
        });
      } else if (state.status === BatchActionStatus.Queued) {
        state = markTraceDeleteBatchActionProcessing(state, config);
        await commitTraceDeleteBatchActionState({
          batchActionId,
          canCommitProgress,
          state,
        });
      }

      logger.info("Processing trace delete batch action page", {
        batchActionId,
        projectId: batchAction.projectId,
        source: state.config.source,
        traceCount: inFlightBatch.traceIds.length,
      });

      if (
        await shouldSkipDeletion(
          batchAction.projectId,
          inFlightBatch.traceIds,
          "trace",
        )
      ) {
        const message = `Trace deletion skipped for batch action ${batchActionId}`;
        state = failTraceDeleteBatchActionState(state, {
          finishedAt: new Date(),
          log: message,
        });
        await commitTraceDeleteBatchActionState({
          batchActionId,
          canCommitProgress,
          state,
        });
        return { status: "failed", processedBatches };
      }

      await Promise.all([
        processPostgresTraceDelete(
          batchAction.projectId,
          inFlightBatch.traceIds,
        ),
        processClickhouseTraceDelete(
          batchAction.projectId,
          inFlightBatch.traceIds,
        ),
      ]);

      await extendProcessingLease({ batchActionId, extendLease });

      const nextInFlightBatch = await selectNextTraceDeleteBatch({
        projectId: batchAction.projectId,
        query: batchAction.query,
        config: state.config,
        cursor: inFlightBatch.cursorAfter,
        batchSize,
      });
      const processedCount =
        (batchAction.processedCount ?? 0) + inFlightBatch.traceIds.length;
      processedBatches += 1;
      lastProcessedCount = processedCount;

      if (!nextInFlightBatch) {
        state = completeTraceDeleteBatchActionState(state, processedCount);
        await commitTraceDeleteBatchActionState({
          batchActionId,
          canCommitProgress,
          state,
        });
        return { status: "completed", processedBatches };
      }

      state = advanceTraceDeleteBatchActionState(
        state,
        processedCount,
        nextInFlightBatch,
      );
      await commitTraceDeleteBatchActionState({
        batchActionId,
        canCommitProgress,
        state,
      });
    }

    return {
      status: "yielded",
      processedBatches,
      processedCount: lastProcessedCount,
    };
  } catch (error) {
    if (error instanceof TraceDeleteBatchActionLeaseLostError) {
      throw error;
    }

    try {
      await recordTraceDeleteBatchActionFailure({
        batchActionId,
        error,
        canCommitProgress,
      });
    } catch (recordError) {
      logger.error("Failed to record trace delete batch action failure", {
        batchActionId,
        error: recordError,
      });
    }

    throw error;
  }
};
