import {
  commandClickhouse,
  logger,
  queryClickhouse,
  recordGauge,
  recordIncrement,
} from "@langfuse/shared/src/server";
import { env } from "../../env";
import { PeriodicExclusiveRunner } from "../../utils/PeriodicExclusiveRunner";
import {
  buildApplyDeletedMaskQuery,
  buildMutationCountQuery,
  DELETED_MASK_CLEANER_TABLES,
  DELETED_MASK_CLEANER_WORK_QUERY,
  isAbortError,
  normalizeMutationCounts,
  selectCandidateToProcess,
  type MutationCountRow,
  type WorkCandidateRow,
} from "./helpers";

export * from "./helpers";

export const DELETED_MASK_CLEANER_LOCK_KEY =
  "langfuse:clickhouse-deleted-mask-cleaner";

const METRIC_PREFIX = "langfuse.clickhouse_deleted_mask_cleaner";

/**
 * DeletedMaskCleaner physically applies ClickHouse lightweight delete masks for
 * old monthly partitions. APPLY DELETED MASK creates a mutation, so each tick
 * submits at most one command and only after checking the target table has no
 * unfinished mutations.
 */
export class DeletedMaskCleaner extends PeriodicExclusiveRunner {
  protected get defaultIntervalMs(): number {
    return env.LANGFUSE_CLICKHOUSE_DELETED_MASK_CLEANER_INTERVAL_MS;
  }

  constructor() {
    const lockTtlSeconds =
      Math.ceil(
        env.LANGFUSE_CLICKHOUSE_DELETED_MASK_CLEANER_SUBMIT_TIMEOUT_MS / 1000,
      ) + 300;

    super({
      name: "DeletedMaskCleaner",
      lockKey: DELETED_MASK_CLEANER_LOCK_KEY,
      lockTtlSeconds,
      onUnavailable: "fail",
    });
  }

  public override start(): void {
    logger.info(`Starting ${this.instanceName}`, {
      intervalMs: env.LANGFUSE_CLICKHOUSE_DELETED_MASK_CLEANER_INTERVAL_MS,
      submitTimeoutMs:
        env.LANGFUSE_CLICKHOUSE_DELETED_MASK_CLEANER_SUBMIT_TIMEOUT_MS,
      tables: DELETED_MASK_CLEANER_TABLES,
    });
    super.start();
  }

  protected async execute(): Promise<void> {
    await this.withLock(
      async () => {
        const candidates = await this.getCandidates();
        recordGauge(`${METRIC_PREFIX}.candidates`, candidates.length);

        if (candidates.length === 0) {
          logger.info(
            `${this.instanceName}: No deleted-mask cleanup candidates`,
          );
          return;
        }

        const candidateTables = Array.from(
          new Set(candidates.map(({ table }) => table)),
        );
        const mutationCounts = normalizeMutationCounts(
          candidateTables,
          await this.getMutationCountRows(candidateTables),
        );

        const selection = selectCandidateToProcess(candidates, mutationCounts);
        for (const skipped of selection.skipped) {
          logger.info(
            `${this.instanceName}: Skipping candidate because target table has active mutations`,
            {
              table: skipped.candidate.table,
              partition: skipped.candidate.partition,
              partitionToClean: skipped.candidate.partition_to_clean,
              mutationCount: skipped.mutationCount,
            },
          );
          recordIncrement(`${METRIC_PREFIX}.candidate_skipped`, 1, {
            table: skipped.candidate.table,
            reason: "active_mutations",
          });
        }

        if (selection.candidate) {
          await this.applyDeletedMask(selection.candidate);
          return;
        }

        logger.info(
          `${this.instanceName}: No candidates were safe to process this tick`,
        );
      },
      (error) => {
        logger.error(`${this.instanceName}: Failed to process cleanup tick`, {
          error,
        });
        recordIncrement(`${METRIC_PREFIX}.failures`, 1);
      },
    );
  }

  private async getCandidates(): Promise<WorkCandidateRow[]> {
    const rows = await queryClickhouse<WorkCandidateRow>({
      query: DELETED_MASK_CLEANER_WORK_QUERY,
      params: {
        database: env.CLICKHOUSE_DB,
        tables: Array.from(DELETED_MASK_CLEANER_TABLES),
      },
      tags: {
        source: "worker",
        feature: "deleted-mask-cleaner",
        query: "deleted-mask-cleaner.candidates",
        operation: "list",
        storage: "mixed",
        project_id: "none",
        table: "system.parts",
      },
    });

    return rows;
  }

  private async getMutationCountRows(
    tables: string[],
  ): Promise<MutationCountRow[]> {
    if (tables.length === 0) {
      return [];
    }

    return queryClickhouse<MutationCountRow>({
      query: buildMutationCountQuery(
        env.CLICKHOUSE_CLUSTER_ENABLED === "true",
        env.CLICKHOUSE_CLUSTER_NAME,
      ),
      params: {
        database: env.CLICKHOUSE_DB,
        tables,
      },
      tags: {
        source: "worker",
        feature: "deleted-mask-cleaner",
        query: "deleted-mask-cleaner.mutation-counts",
        operation: "count",
        storage: "mixed",
        project_id: "none",
        table: "system.mutations",
      },
    });
  }

  private async applyDeletedMask(candidate: WorkCandidateRow): Promise<void> {
    const query = buildApplyDeletedMaskQuery(candidate, {
      database: env.CLICKHOUSE_DB,
      clusterEnabled: env.CLICKHOUSE_CLUSTER_ENABLED === "true",
      clusterName: env.CLICKHOUSE_CLUSTER_NAME,
    });

    logger.info(`${this.instanceName}: Applying deleted mask`, {
      table: candidate.table,
      partition: candidate.partition,
      partitionToClean: candidate.partition_to_clean,
      totalRows: Number(candidate.total_rows),
    });

    const abortController = new AbortController();
    const timeoutId = setTimeout(
      () => abortController.abort(),
      env.LANGFUSE_CLICKHOUSE_DELETED_MASK_CLEANER_SUBMIT_TIMEOUT_MS,
    );

    try {
      await commandClickhouse({
        query,
        clickhouseSettings: {
          mutations_sync: "0",
        },
        abortSignal: abortController.signal,
        tags: {
          source: "worker",
          feature: "deleted-mask-cleaner",
          query: `deleted-mask-cleaner.apply-deleted-mask.${candidate.table}`,
          operation: "delete",
          storage: "mixed",
          project_id: "none",
          table: candidate.table,
        },
      });

      recordIncrement(`${METRIC_PREFIX}.commands_submitted`, 1, {
        table: candidate.table,
      });
    } catch (error) {
      if (!isAbortError(error)) {
        throw error;
      }

      logger.info(
        `${this.instanceName}: Stopped waiting for deleted-mask command submission`,
        {
          table: candidate.table,
          partition: candidate.partition,
          partitionToClean: candidate.partition_to_clean,
          submitTimeoutMs:
            env.LANGFUSE_CLICKHOUSE_DELETED_MASK_CLEANER_SUBMIT_TIMEOUT_MS,
        },
      );
      recordIncrement(`${METRIC_PREFIX}.command_submit_aborted`, 1, {
        table: candidate.table,
      });
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
