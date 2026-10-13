import { Prisma, prisma } from "@langfuse/shared/src/db";
import {
  clickhouseClient,
  convertAuditLogStagingRowToClickhouse,
  logger,
  recordGauge,
  recordIncrement,
  type AuditLogRecordInsertType,
} from "@langfuse/shared/src/server";
import { env } from "../../env";
import { PeriodicExclusiveRunner } from "../../utils/PeriodicExclusiveRunner";

const METRIC_PREFIX = "langfuse.audit_log_relay";

const AUDIT_LOG_RELAY_LOCK_KEY = "langfuse:audit-log-relay";

const DEFAULT_BATCH_SIZE = 5_000;

// A row whose payload could not be mapped is claimed again after this delay,
// so a payload written by a newer web version relays once the worker that
// knows its schema is deployed.
const FAILED_ROW_RETRY_DELAY = Prisma.sql`INTERVAL '10 minutes'`;

const MAX_FAILURE_BACKOFF_MS = 30_000;

// Counting the staging table scans it, so the gauges are refreshed at most
// this often while a backlog drains batch after batch, and the scan is cut
// off well within the lease.
const STAGING_METRICS_INTERVAL_MS = 10_000;
const STAGING_METRICS_STATEMENT_TIMEOUT_MS = 5_000;

const LAST_ERROR_MAX_LENGTH = 1_000;
const LOGGED_FAILURES_MAX = 10;

/**
 * Moves rows from the Postgres `audit_log_staging` outbox into the ClickHouse
 * `audit_logs` table. Each batch runs in one Postgres transaction: it locks
 * up to `batchSize` rows, inserts them into ClickHouse and deletes them only
 * after ClickHouse acknowledged the insert. Any failure rolls the transaction
 * back, so the rows stay and the next batch retries them. A retry can insert
 * a row a second time; `audit_logs` collapses rows by id.
 *
 * Concurrent batches claim disjoint rows (FOR UPDATE SKIP LOCKED), so the
 * Redis lease only keeps workers from competing for the same rows. When Redis
 * is unavailable, every worker relays.
 */
export class AuditLogRelay extends PeriodicExclusiveRunner {
  private readonly intervalMs: number;
  private readonly lockTtlSeconds: number;
  private readonly batchSize: number;
  private readonly transactionTimeoutMs: number;
  private readonly insertRecords: AuditLogRecordInserter;
  private consecutiveFailures = 0;
  private lastStagingMetricsAt = 0;

  protected get defaultIntervalMs(): number {
    return this.intervalMs;
  }

  constructor(
    opts: {
      intervalMs?: number;
      lockTtlSeconds?: number;
      batchSize?: number;
      insertRecords?: AuditLogRecordInserter;
    } = {},
  ) {
    const lockTtlSeconds =
      opts.lockTtlSeconds ?? env.LANGFUSE_AUDIT_LOG_RELAY_LOCK_TTL_SECONDS;

    super({
      name: "AuditLogRelay",
      metricName: "audit_log_relay",
      lockKey: AUDIT_LOG_RELAY_LOCK_KEY,
      lockTtlSeconds,
      onUnavailable: "proceed",
    });

    this.lockTtlSeconds = lockTtlSeconds;
    this.intervalMs =
      opts.intervalMs ?? env.LANGFUSE_AUDIT_LOG_RELAY_INTERVAL_MS;
    this.batchSize = opts.batchSize ?? DEFAULT_BATCH_SIZE;
    // A batch that runs out of time rolls back before the lease can expire
    // under it.
    this.transactionTimeoutMs = (lockTtlSeconds * 1000) / 2;
    this.insertRecords = opts.insertRecords ?? insertAuditLogRecords;
  }

  public override start(): void {
    logger.info(`Starting ${this.instanceName}`, {
      intervalMs: this.intervalMs,
      lockTtlSeconds: this.lockTtlSeconds,
      batchSize: this.batchSize,
    });
    super.start();
  }

  protected async execute(): Promise<number | void> {
    return await this.withLock(
      async () => {
        try {
          const result = await this.relayBatch();
          this.consecutiveFailures = 0;
          // A full batch means more rows are waiting, so run again right away.
          return result.claimed === this.batchSize ? 0 : undefined;
        } finally {
          await this.recordStagingMetrics();
        }
      },
      () => this.backOffAfterFailure(),
    );
  }

  /**
   * Relays one batch without taking the lease. Rejects, with every claimed
   * row left in place, when the ClickHouse insert or the transaction fails.
   */
  public async relayBatch(): Promise<AuditLogRelayBatchResult> {
    const outcome = await prisma.$transaction(
      (tx) => this.relayClaimedRows(tx),
      { timeout: this.transactionTimeoutMs },
    );
    this.reportBatch(outcome);
    return {
      claimed: outcome.claimed,
      relayed: outcome.relayed,
      failed: outcome.failures.length,
    };
  }

  private async relayClaimedRows(
    tx: Prisma.TransactionClient,
  ): Promise<BatchOutcome> {
    const rows = await claimStagingRows(tx, this.batchSize);
    const { records, failures } = mapStagingRows(rows);
    await this.relayRecords(tx, records);
    await markFailedRows(tx, failures);
    return { claimed: rows.length, relayed: records.length, failures };
  }

  /** Inserts the records into ClickHouse, then deletes them from staging. */
  private async relayRecords(
    tx: Prisma.TransactionClient,
    records: AuditLogRecordInsertType[],
  ): Promise<void> {
    if (records.length === 0) return;
    await this.insertRecords(
      records,
      AbortSignal.timeout(this.transactionTimeoutMs),
    );
    await tx.auditLogStaging.deleteMany({
      where: { id: { in: records.map((record) => record.id) } },
    });
  }

  /** Records metrics and logs for a committed batch. */
  private reportBatch(outcome: BatchOutcome): void {
    if (outcome.relayed > 0) {
      recordIncrement(`${METRIC_PREFIX}.rows_relayed`, outcome.relayed);
    }
    if (outcome.failures.length === 0) return;

    recordIncrement(`${METRIC_PREFIX}.rows_failed`, outcome.failures.length);
    // The payload can hold before/after state, so only ids and errors are
    // logged.
    logger.warn(
      `${this.instanceName}: Staged audit events could not be mapped, retrying later`,
      {
        count: outcome.failures.length,
        failures: outcome.failures.slice(0, LOGGED_FAILURES_MAX),
      },
    );
  }

  private backOffAfterFailure(): number {
    recordIncrement(`${METRIC_PREFIX}.relay_errors`, 1);
    this.consecutiveFailures += 1;
    return Math.min(
      this.intervalMs * 2 ** this.consecutiveFailures,
      MAX_FAILURE_BACKOFF_MS,
    );
  }

  private async recordStagingMetrics(): Promise<void> {
    const now = Date.now();
    if (now - this.lastStagingMetricsAt < STAGING_METRICS_INTERVAL_MS) {
      return;
    }
    this.lastStagingMetricsAt = now;

    // Metrics must not stop the relay, so a failed query is only logged.
    try {
      const metrics = await readStagingMetrics();
      recordGauge(`${METRIC_PREFIX}.staging_rows`, Number(metrics.pending));
      recordGauge(`${METRIC_PREFIX}.failed_rows`, Number(metrics.failed));
      recordGauge(
        `${METRIC_PREFIX}.oldest_row_age_seconds`,
        metrics.oldest_pending
          ? Math.max(
              Math.floor((now - metrics.oldest_pending.getTime()) / 1000),
              0,
            )
          : 0,
      );
    } catch (error) {
      logger.error(`${this.instanceName}: Failed to read staging metrics`, {
        error,
      });
    }
  }
}

/**
 * Inserts synchronously, outside ClickhouseWriter. The client waits for the
 * async insert to be flushed, so a resolved promise means ClickHouse has
 * stored the rows.
 */
export async function insertAuditLogRecords(
  records: AuditLogRecordInsertType[],
  abortSignal: AbortSignal,
): Promise<void> {
  await clickhouseClient().insert({
    table: "audit_logs",
    values: records,
    format: "JSONEachRow",
    abort_signal: abortSignal,
  });
}

/** Locks the oldest due rows; concurrent claims skip each other's rows. */
function claimStagingRows(
  tx: Prisma.TransactionClient,
  batchSize: number,
): Promise<ClaimedStagingRow[]> {
  return tx.$queryRaw<ClaimedStagingRow[]>`
    SELECT id, created_at, payload
    FROM audit_log_staging
    WHERE failed_at IS NULL
      OR failed_at < CURRENT_TIMESTAMP - ${FAILED_ROW_RETRY_DELAY}
    ORDER BY id
    LIMIT ${batchSize}
    FOR UPDATE SKIP LOCKED
  `;
}

function mapStagingRows(rows: ClaimedStagingRow[]): {
  records: AuditLogRecordInsertType[];
  failures: FailedStagingRow[];
} {
  const records: AuditLogRecordInsertType[] = [];
  const failures: FailedStagingRow[] = [];
  for (const row of rows) {
    try {
      records.push(
        convertAuditLogStagingRowToClickhouse({
          id: row.id,
          createdAt: row.created_at,
          payload: row.payload,
        }),
      );
    } catch (error) {
      failures.push({ id: row.id, error: describeError(error) });
    }
  }
  return { records, failures };
}

async function markFailedRows(
  tx: Prisma.TransactionClient,
  failures: FailedStagingRow[],
): Promise<void> {
  if (failures.length === 0) return;
  await tx.$executeRaw`
    UPDATE audit_log_staging AS staging
    SET failed_at = CURRENT_TIMESTAMP, last_error = failure.error
    FROM unnest(
      ${failures.map((failure) => failure.id)}::uuid[],
      ${failures.map((failure) => failure.error)}::text[]
    ) AS failure(id, error)
    WHERE staging.id = failure.id
  `;
}

async function readStagingMetrics(): Promise<StagingMetricsRow> {
  const [, [metrics]] = await prisma.$transaction([
    prisma.$queryRaw`SELECT set_config('statement_timeout', ${String(STAGING_METRICS_STATEMENT_TIMEOUT_MS)}, true)`,
    prisma.$queryRaw<StagingMetricsRow[]>`
      SELECT
        count(*) FILTER (WHERE failed_at IS NULL) AS pending,
        count(*) FILTER (WHERE failed_at IS NOT NULL) AS failed,
        min(created_at) FILTER (WHERE failed_at IS NULL) AS oldest_pending
      FROM audit_log_staging
    `,
  ]);
  return metrics;
}

function describeError(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(
    0,
    LAST_ERROR_MAX_LENGTH,
  );
}

export type AuditLogRecordInserter = (
  records: AuditLogRecordInsertType[],
  abortSignal: AbortSignal,
) => Promise<void>;

export type AuditLogRelayBatchResult = {
  claimed: number;
  relayed: number;
  failed: number;
};

type ClaimedStagingRow = {
  id: string;
  created_at: Date;
  payload: Prisma.JsonValue;
};

type FailedStagingRow = { id: string; error: string };

type BatchOutcome = {
  claimed: number;
  relayed: number;
  failures: FailedStagingRow[];
};

type StagingMetricsRow = {
  pending: bigint;
  failed: bigint;
  oldest_pending: Date | null;
};
