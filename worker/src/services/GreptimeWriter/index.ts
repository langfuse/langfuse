import { backOff } from "exponential-backoff";

import {
  buildGreptimeRowsForRecord,
  DatasetRunItemRecordInsertType,
  getGreptimeIngestClient,
  GreptimeRow,
  GreptimeTable,
  logger,
  ObservationRecordInsertType,
  PHYSICAL_TABLES,
  recordGauge,
  recordHistogram,
  recordIncrement,
  ScoreRecordInsertType,
  TraceRecordInsertType,
  instrumentAsync,
} from "@langfuse/shared/src/server";

import { env } from "../../env";

/**
 * GreptimeWriter (02-write-path.md, step 5) — ports ClickhouseWriter to the GreptimeDB gRPC
 * ingester. A singleton with one in-memory batch queue per physical table, an interval flush, and
 * size-triggered flushes. On failure the whole flush is requeued with an attempt counter and
 * dropped after maxAttempts.
 *
 * The pure parts (gRPC table schemas, record->row mapping, projection+EAV fan-out) live in shared
 * (`greptime/ingest/{tableSchemas,rowBuilders}`) so the seeder and any other shared caller produce
 * byte-identical rows; this class is only the queue/batch/flush machinery on top of them.
 *
 * Logical entities fan out to several physical tables: the projection row plus EAV subtable rows
 * (metadata key/value, tags). All are written through the same gRPC client in one combined call so
 * a projection and its EAV rows share fate. The trade-off is no per-row isolation: a single
 * bad/oversized row fails the whole flush until it is dropped after maxAttempts. Bisect-on-failure
 * isolation is a known follow-up (it must not break the projection+EAV fate-sharing).
 */

// Re-exported so existing `import { GreptimeWriter, GreptimeTable } from ".../GreptimeWriter"`
// call sites keep working after the enum moved to shared.
export { GreptimeTable } from "@langfuse/shared/src/server";

interface QueueItem {
  createdAt: number;
  attempts: number;
  row: GreptimeRow;
}

export class GreptimeWriter {
  private static instance: GreptimeWriter | null = null;
  private readonly batchSize: number;
  private readonly writeInterval: number;
  private readonly maxAttempts: number;
  private readonly queues: Record<string, QueueItem[]>;
  private intervalId: NodeJS.Timeout | null = null;
  private isFlushInProgress = false;

  private constructor() {
    this.batchSize = env.LANGFUSE_INGESTION_CLICKHOUSE_WRITE_BATCH_SIZE;
    this.writeInterval = env.LANGFUSE_INGESTION_CLICKHOUSE_WRITE_INTERVAL_MS;
    this.maxAttempts = env.LANGFUSE_INGESTION_CLICKHOUSE_MAX_ATTEMPTS;
    this.queues = Object.fromEntries(
      Object.keys(PHYSICAL_TABLES).map((t) => [t, [] as QueueItem[]]),
    );
    this.start();
  }

  public static getInstance(): GreptimeWriter {
    if (!GreptimeWriter.instance) {
      GreptimeWriter.instance = new GreptimeWriter();
    }
    return GreptimeWriter.instance;
  }

  private start(): void {
    logger.info(
      `Starting GreptimeWriter. Interval: ${this.writeInterval} ms, batch size: ${this.batchSize}`,
    );
    this.intervalId = setInterval(() => {
      if (this.isFlushInProgress) return;
      this.isFlushInProgress = true;
      this.flushAll().finally(() => {
        this.isFlushInProgress = false;
      });
    }, this.writeInterval);
  }

  public async shutdown(): Promise<void> {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    await this.flushAll(true);
  }

  public addToQueue(
    table: GreptimeTable,
    record:
      | TraceRecordInsertType
      | ObservationRecordInsertType
      | ScoreRecordInsertType
      | DatasetRunItemRecordInsertType,
  ): void {
    for (const { table: physicalTable, rows } of buildGreptimeRowsForRecord(
      table,
      record,
    )) {
      this.pushAll(physicalTable, rows);
    }
  }

  private push(table: string, row: GreptimeRow): void {
    this.queues[table].push({ createdAt: Date.now(), attempts: 1, row });
    if (
      this.queues[table].length >= this.batchSize &&
      !this.isFlushInProgress
    ) {
      this.isFlushInProgress = true;
      this.flushAll()
        .catch((err) => logger.error("GreptimeWriter.push flushAll", err))
        .finally(() => {
          this.isFlushInProgress = false;
        });
    }
  }

  private pushAll(table: string, rows: GreptimeRow[]): void {
    for (const row of rows) this.push(table, row);
  }

  /**
   * Splice one batch from every non-empty physical table and write them all in a SINGLE gRPC call,
   * so an entity's projection row and its EAV rows share fate — they all land, or all requeue.
   * GreptimeDB has no cross-table transaction, so this collapses the common (network / connection)
   * failure mode rather than guaranteeing server-side atomicity. Any residual partial write is
   * surfaced via the drop metric/log and healed by the idempotent full-history rebuild on reprocess.
   */
  public async flushAll(fullQueue = false): Promise<void> {
    return instrumentAsync({ name: "write-to-greptime" }, async () => {
      const spliced: { table: string; items: QueueItem[] }[] = [];
      for (const table of Object.keys(this.queues)) {
        const q = this.queues[table];
        if (q.length === 0) continue;
        spliced.push({
          table,
          items: q.splice(0, fullQueue ? q.length : this.batchSize),
        });
      }
      if (spliced.length === 0) return;
      const total = spliced.reduce((n, s) => n + s.items.length, 0);

      try {
        await backOff(
          () => {
            // Rebuild Tables on each attempt — addRowObject mutates the builder.
            const tables = spliced.map(({ table, items }) => {
              const t = PHYSICAL_TABLES[table]();
              for (const i of items) t.addRowObject(i.row);
              return t;
            });
            return getGreptimeIngestClient().write(tables);
          },
          {
            numOfAttempts: this.maxAttempts,
            startingDelay: 100,
            timeMultiple: 2,
            maxDelay: 1000,
          },
        );
        recordGauge("greptime_writer_insert", total, { unit: "records" });
        recordHistogram("langfuse.queue.greptime_writer.batch_size", total);
      } catch (err) {
        logger.error("GreptimeWriter.flushAll", err);
        let dropped = 0;
        for (const { table, items } of spliced) {
          for (const item of items) {
            if (item.attempts < this.maxAttempts) {
              this.queues[table].push({ ...item, attempts: item.attempts + 1 });
            } else {
              dropped++;
            }
          }
        }
        if (dropped > 0) {
          recordIncrement(
            "langfuse.queue.greptime_writer.rows_dropped",
            dropped,
          );
          logger.error(
            `GreptimeWriter: dropped ${dropped} row(s) after ${this.maxAttempts} attempts`,
          );
        }
      }
    });
  }
}
