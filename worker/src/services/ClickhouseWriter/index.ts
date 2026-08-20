import {
  clickhouseClient,
  ClickhouseClientType,
  BlobStorageFileLogInsertType,
  getCurrentSpan,
  ObservationRecordInsertType,
  ObservationBatchStagingRecordInsertType,
  recordDistribution,
  recordGauge,
  recordHistogram,
  recordIncrement,
  redis,
  ScoreRecordInsertType,
  TraceRecordInsertType,
  TraceNullRecordInsertType,
  DatasetRunItemRecordInsertType,
  EventRecordInsertType,
  buildClickHouseLogComment,
} from "@langfuse/shared/src/server";

import { Decimal } from "decimal.js";

import { env } from "../../env";
import { logger } from "@langfuse/shared/src/server";
import { instrumentAsync } from "@langfuse/shared/src/server";
import { backOff } from "exponential-backoff";

// Decimal64(12): valid range is (-10^6, 10^6), i.e. 18 total digits with 12 fractional.
// JS double can't represent 999999.999999999999 exactly (rounds to 1e6), so we use a
// value with enough decimal places to be safe while staying representable as a JS number.
const DECIMAL_64_12_LIMIT = new Decimal("1e6");
const DECIMAL_64_12_MAX_NUM = 999_999.999_999;
const DECIMAL_64_12_MIN_NUM = -DECIMAL_64_12_MAX_NUM;
const MULTI_PROJECT_LOG_COMMENT_PROJECT_ID = "MULTI_PROJECT";

export class ClickhouseWriter {
  private static instance: ClickhouseWriter | null = null;
  private static client: ClickhouseClientType | null = null;

  // Quarantine list key prefix. Records that exhaust their retry attempts are
  // preserved (never silently dropped) so they can be recovered manually or by
  // a future, focused recovery path. There is deliberately no automatic-replay
  // consumer: deterministic failures (e.g. permanently malformed records) must
  // not loop forever, while prolonged transient failures stay recoverable.
  private static readonly QUARANTINE_KEY_PREFIX =
    "langfuse:clickhouse-writer:quarantine";

  // Bounded in-memory retention for quarantined records whose Redis write
  // could not be completed immediately. Quarantined records may contain
  // sensitive customer content (inputs, outputs, prompts, metadata, ids,
  // ingestion keys), so full payloads are NEVER emitted to the logs. They are
  // kept only here (capped) and retried on a later flush interval.
  private pendingQuarantineRecords: Array<{
    quarantineKey: string;
    payload: string;
  }> = [];
  private isQuarantineRetryInFlight = false;

  private static readonly MAX_PENDING_QUARANTINE_WRITES = 2000;
  batchSize: number;
  writeInterval: number;
  maxAttempts: number;
  queue: ClickhouseQueue;

  isIntervalFlushInProgress: boolean;
  intervalId: NodeJS.Timeout | null = null;

  private constructor() {
    this.batchSize = env.LANGFUSE_INGESTION_CLICKHOUSE_WRITE_BATCH_SIZE;
    this.writeInterval = env.LANGFUSE_INGESTION_CLICKHOUSE_WRITE_INTERVAL_MS;
    this.maxAttempts = env.LANGFUSE_INGESTION_CLICKHOUSE_MAX_ATTEMPTS;

    this.isIntervalFlushInProgress = false;

    this.queue = {
      [TableName.Traces]: [],
      [TableName.TracesNull]: [],
      [TableName.Scores]: [],
      [TableName.Observations]: [],
      [TableName.ObservationsBatchStaging]: [],
      [TableName.BlobStorageFileLog]: [],
      [TableName.DatasetRunItems]: [],
      [TableName.EventsFull]: [],
    };

    this.start();
  }

  /**
   * Get the singleton instance of ClickhouseWriter.
   * Client parameter is only used for testing.
   */
  public static getInstance(clickhouseClient?: ClickhouseClientType) {
    if (clickhouseClient) {
      ClickhouseWriter.client = clickhouseClient;
    }

    if (!ClickhouseWriter.instance) {
      ClickhouseWriter.instance = new ClickhouseWriter();
    }

    return ClickhouseWriter.instance;
  }

  private start() {
    logger.info(
      `Starting ClickhouseWriter. Max interval: ${this.writeInterval} ms, Max batch size: ${this.batchSize}`,
    );

    this.intervalId = setInterval(() => {
      if (this.isIntervalFlushInProgress) return;

      this.isIntervalFlushInProgress = true;

      logger.debug("Flush interval elapsed, flushing all queues...");

      this.flushAll().finally(() => {
        this.isIntervalFlushInProgress = false;
      });
    }, this.writeInterval);
  }

  public async shutdown(): Promise<void> {
    logger.info("Shutting down ClickhouseWriter...");

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    await this.flushAll(true);

    logger.info("ClickhouseWriter shutdown complete.");
  }

  public async flushAll(fullQueue = false) {
    return instrumentAsync(
      {
        name: "write-to-clickhouse",
      },
      async () => {
        recordIncrement("langfuse.queue.clickhouse_writer.request");
        void this.retryQuarantineWrites();
        await Promise.all([
          this.flush(TableName.Traces, fullQueue),
          this.flush(TableName.TracesNull, fullQueue),
          this.flush(TableName.Scores, fullQueue),
          this.flush(TableName.Observations, fullQueue),
          this.flush(TableName.ObservationsBatchStaging, fullQueue),
          this.flush(TableName.BlobStorageFileLog, fullQueue),
          this.flush(TableName.DatasetRunItems, fullQueue),
          this.flush(TableName.EventsFull, fullQueue),
        ]).catch((err) => {
          logger.error("ClickhouseWriter.flushAll", err);
        });
      },
    );
  }

  private isRetryableError(error: unknown): boolean {
    if (!error || typeof error !== "object") return false;

    const errorMessage = (error as Error).message?.toLowerCase() || "";

    // Socket hang up and client-side request timeouts ("Timeout error." from
    // @clickhouse/client when request_timeout elapses) are transient: a retry
    // opens a fresh connection that can land on a healthy replica.
    return (
      errorMessage.includes("socket hang up") ||
      errorMessage.includes("timeout error")
    );
  }

  private isSizeError(error: unknown): boolean {
    if (!error || typeof error !== "object") return false;

    const errorMessage = (error as Error).message?.toLowerCase() || "";

    return (
      // Check for ClickHouse size errors
      errorMessage.includes("size of json object") &&
      errorMessage.includes("extremely large") &&
      errorMessage.includes("expected not greater than")
    );
  }

  private isStringLengthError(error: unknown): boolean {
    if (!error || typeof error !== "object") return false;

    const errorMessage = (error as Error).message?.toLowerCase() || "";

    // Node.js string size errors
    return errorMessage.includes("invalid string length");
  }

  /**
   * handleStringLength takes the queueItems and splits the queue in half.
   * It returns to lists, one items that are to be retried (first half), and a list that
   * should be re-added to the queue (second half).
   * That way, we should eventually avoid the JS string length error that happens due to the
   * concatenation.
   */
  private handleStringLengthError<T extends TableName>(
    tableName: T,
    queueItems: ClickhouseWriterQueueItem<T>[],
  ): {
    retryItems: ClickhouseWriterQueueItem<T>[];
    requeueItems: ClickhouseWriterQueueItem<T>[];
  } {
    // If batch size is 1, fallback to truncation to prevent infinite loops
    if (queueItems.length === 1) {
      const truncatedRecord = this.truncateOversizedRecord(
        tableName,
        queueItems[0].data,
      );
      logger.warn(
        `String length error with single record for ${tableName}, falling back to truncation`,
        {
          recordId: queueItems[0].data.id,
        },
      );
      return {
        retryItems: [{ ...queueItems[0], data: truncatedRecord }],
        requeueItems: [],
      };
    }

    const splitPoint = Math.floor(queueItems.length / 2);
    const retryItems = queueItems.slice(0, splitPoint);
    const requeueItems = queueItems.slice(splitPoint);

    logger.info(
      `Splitting batch for ${tableName} due to string length error. Retrying ${retryItems.length}, requeueing ${requeueItems.length}`,
    );

    return { retryItems, requeueItems };
  }

  private truncateOversizedRecord<T extends TableName>(
    tableName: T,
    record: RecordInsertType<T>,
  ): RecordInsertType<T> {
    const maxFieldSize = 1024 * 1024; // 1MB per field as safety margin
    const truncationMessage = "[TRUNCATED: Field exceeded size limit]";

    // Helper function to safely truncate string fields
    const truncateField = (value: string | null | undefined): string | null => {
      if (!value) return value || null;
      if (value.length > maxFieldSize) {
        return (
          // Keep the first 500KB and append a truncation message
          value.substring(0, 500 * 1024) + truncationMessage
        );
      }
      return value;
    };

    // Truncate input field if present
    if (
      "input" in record &&
      record.input &&
      record.input.length > maxFieldSize
    ) {
      record.input = truncateField(record.input);
      logger.info(
        `Truncated oversized input field for record ${record.id} of type ${tableName}`,
        {
          projectId: record.project_id,
        },
      );
    }

    // Truncate output field if present
    if (
      "output" in record &&
      record.output &&
      record.output.length > maxFieldSize
    ) {
      record.output = truncateField(record.output);
      logger.info(
        `Truncated oversized output field for record ${record.id} of type ${tableName}`,
        {
          projectId: record.project_id,
        },
      );
    }

    // Truncate metadata field if present
    if ("metadata" in record && record.metadata) {
      const metadata = record.metadata;
      const truncatedMetadata: Record<string, string> = {};
      for (const [key, value] of Object.entries(metadata)) {
        if (value && value.length > maxFieldSize) {
          truncatedMetadata[key] = truncateField(value) || "";
          logger.info(
            `Truncated oversized metadata for record ${record.id} of type ${tableName} and key ${key}`,
            {
              projectId: record.project_id,
            },
          );
        } else {
          truncatedMetadata[key] = value;
        }
      }
      record.metadata = truncatedMetadata;
    }

    return record;
  }

  private static clampDecimal64Value(value: number): [number, boolean] {
    if (!Number.isFinite(value)) return [0, true];
    if (new Decimal(value).abs().gte(DECIMAL_64_12_LIMIT)) {
      return [value >= 0 ? DECIMAL_64_12_MAX_NUM : DECIMAL_64_12_MIN_NUM, true];
    }
    return [value, false];
  }

  private clampDecimal64Map(
    map: Record<string, number> | undefined,
    context: { recordId: string; projectId: string; fieldName: string },
  ): Record<string, number> | undefined {
    if (!map) return map;

    let result: Record<string, number> | undefined;
    for (const [key, value] of Object.entries(map)) {
      const [cv, wasClamped] = ClickhouseWriter.clampDecimal64Value(value);
      if (wasClamped) {
        result ??= { ...map };
        result[key] = cv;
      }
    }
    if (!result) return map;

    logger.warn("Clamped Decimal64(12) overflow in cost map", {
      projectId: context.projectId,
      recordId: context.recordId,
      fieldName: context.fieldName,
    });
    recordIncrement("langfuse.clickhouse_writer.decimal64_clamped");
    return result;
  }

  private clampDecimal64Fields<T extends TableName>(
    tableName: T,
    record: RecordInsertType<T>,
  ): RecordInsertType<T> {
    const r = record as Record<string, unknown>;
    const ctx = {
      recordId: r.id as string,
      projectId: r.project_id as string,
    };

    switch (tableName) {
      case TableName.Observations:
      case TableName.ObservationsBatchStaging:
      case TableName.EventsFull: {
        r.provided_cost_details = this.clampDecimal64Map(
          r.provided_cost_details as Record<string, number> | undefined,
          { ...ctx, fieldName: "provided_cost_details" },
        );
        r.cost_details = this.clampDecimal64Map(
          r.cost_details as Record<string, number> | undefined,
          { ...ctx, fieldName: "cost_details" },
        );
        if (r.total_cost != null && typeof r.total_cost === "number") {
          const [cv, wasClamped] = ClickhouseWriter.clampDecimal64Value(
            r.total_cost,
          );
          if (wasClamped) {
            r.total_cost = cv;
            logger.warn("Clamped Decimal64(12) overflow in total_cost", {
              projectId: ctx.projectId,
              recordId: ctx.recordId,
              fieldName: "total_cost",
            });
            recordIncrement("langfuse.clickhouse_writer.decimal64_clamped");
          }
        }
        break;
      }
    }

    return record;
  }

  private async flush<T extends TableName>(tableName: T, fullQueue = false) {
    const entityQueue = this.queue[tableName];
    if (entityQueue.length === 0) return;

    let queueItems = entityQueue.splice(
      0,
      fullQueue ? entityQueue.length : this.batchSize,
    );

    // Log wait time
    queueItems.forEach((item) => {
      const waitTime = Date.now() - item.createdAt;
      recordHistogram("langfuse.queue.clickhouse_writer.wait_time", waitTime, {
        unit: "milliseconds",
      });
      recordDistribution(
        "langfuse.queue.clickhouse_writer.time_distribution",
        waitTime,
        {
          entity_type: tableName,
          type: "wait",
          unit: "milliseconds",
        },
      );
    });

    const currentSpan = getCurrentSpan();
    if (currentSpan) {
      currentSpan.setAttributes({
        [`${tableName}-length`]: queueItems.length,
      });
    }

    try {
      const processingStartTime = Date.now();

      let recordsToWrite = queueItems.map((item) => item.data);
      recordsToWrite = recordsToWrite.map((r) =>
        this.clampDecimal64Fields(tableName, r),
      );
      let hasBeenTruncated = false;

      await backOff(
        async () =>
          this.writeToClickhouse({
            table: tableName,
            records: recordsToWrite,
          }),
        {
          numOfAttempts: env.LANGFUSE_INGESTION_CLICKHOUSE_MAX_ATTEMPTS,
          retry: (error: Error, attemptNumber: number) => {
            const isRetryable = this.isRetryableError(error);
            const isSizeError = this.isSizeError(error);
            const isStringLengthError = this.isStringLengthError(error);

            if (isRetryable) {
              logger.warn(
                `ClickHouse Writer failed with retryable error for ${tableName} (attempt ${attemptNumber}/${env.LANGFUSE_INGESTION_CLICKHOUSE_MAX_ATTEMPTS}): ${error.message}`,
                {
                  error: error.message,
                  attemptNumber,
                },
              );
              currentSpan?.addEvent("clickhouse-query-retry", {
                "retry.attempt": attemptNumber,
                "retry.error": error.message,
              });
              return true;
            } else if (isStringLengthError) {
              logger.warn(
                `ClickHouse Writer failed with string length error for ${tableName} (attempt ${attemptNumber}/${env.LANGFUSE_INGESTION_CLICKHOUSE_MAX_ATTEMPTS}): Splitting batch and retrying`,
                {
                  error: error.message,
                  attemptNumber,
                  batchSize: queueItems.length,
                },
              );

              const { retryItems, requeueItems } = this.handleStringLengthError(
                tableName,
                queueItems,
              );

              // Update records to write with only the retry items
              recordsToWrite = retryItems.map((item) => item.data);
              queueItems = retryItems;

              // Prepend requeue items to the front of the queue to maintain order as much as possible with parallel execution.
              if (requeueItems.length > 0) {
                entityQueue.unshift(...requeueItems);
              }

              currentSpan?.addEvent("clickhouse-query-split-retry", {
                "retry.attempt": attemptNumber,
                "retry.error": error.message,
                "split.retry_count": retryItems.length,
                "split.requeue_count": requeueItems.length,
              });
              return true;
            } else if (isSizeError && !hasBeenTruncated) {
              logger.warn(
                `ClickHouse Writer failed with size error for ${tableName} (attempt ${attemptNumber}/${env.LANGFUSE_INGESTION_CLICKHOUSE_MAX_ATTEMPTS}): Truncating oversized records and retrying`,
                {
                  error: error.message,
                  attemptNumber,
                },
              );

              // Truncate oversized records
              recordsToWrite = recordsToWrite.map((record) =>
                this.truncateOversizedRecord(tableName, record),
              );
              hasBeenTruncated = true;

              currentSpan?.addEvent("clickhouse-query-truncate-retry", {
                "retry.attempt": attemptNumber,
                "retry.error": error.message,
                truncated: true,
              });
              return true;
            }

            logger.error(
              `ClickHouse query failed with non-retryable error: ${error.message}`,
              {
                error: error.message,
              },
            );
            return false;
          },
          startingDelay: 100,
          timeMultiple: 1,
          maxDelay: 100,
        },
      );

      // Log processing time
      const processingTime = Date.now() - processingStartTime;

      recordHistogram(
        "langfuse.queue.clickhouse_writer.processing_time",
        processingTime,
        {
          unit: "milliseconds",
        },
      );
      recordDistribution(
        "langfuse.queue.clickhouse_writer.time_distribution",
        processingTime,
        {
          entity_type: tableName,
          type: "processing",
          unit: "milliseconds",
        },
      );

      logger.debug(
        `Flushed ${queueItems.length} records to Clickhouse ${tableName}. New queue length: ${entityQueue.length}`,
      );

      recordGauge(
        "ingestion_clickhouse_insert_queue_length",
        entityQueue.length,
        {
          unit: "records",
          entityType: tableName,
        },
      );
    } catch (err) {
      logger.error(`ClickhouseWriter.flush ${tableName}`, err);

      // Re-add the records to the queue with incremented attempts
      let quarantinedCount = 0;
      queueItems.forEach((item) => {
        if (item.attempts < this.maxAttempts) {
          entityQueue.push({
            ...item,
            attempts: item.attempts + 1,
          });
        } else {
          recordIncrement("langfuse.queue.clickhouse_writer.error");
          quarantinedCount++;
        }
      });

      if (quarantinedCount > 0) {
        const quarantinedItems = queueItems.filter(
          (item) => item.attempts >= this.maxAttempts,
        );
        // Preserve the records for recovery instead of dropping them silently.
        await this.quarantineRecords(tableName, quarantinedItems, err);
      }
    }
  }

  /**
   * Quarantine ClickHouse records that exhausted their retry attempts instead
   * of silently dropping them, so no data is lost.
   *
   * Records are written to a per-table Redis quarantine list and left there
   * until an operator (or a future, focused recovery path) replays them. This
   * deliberately avoids an automatic-replay DLQ: deterministic failures (e.g.
   * permanently malformed records) will not loop forever, while prolonged
   * transient failures remain recoverable once the target recovers.
   *
   * Quarantined records may contain sensitive customer content (inputs,
   * outputs, prompts, metadata, ids, ingestion keys), so their full payloads
   * are NEVER written to the (unredacted) application logger. If they cannot
   * be persisted to Redis immediately, they are retained in a bounded in-memory
   * buffer and retried on a later flush; only non-sensitive metadata (count,
   * ids, quarantine key, error) is surfaced in the logs.
   *
   * @returns true when the payloads were persisted to Redis, false when they
   *          were deferred (bounded in memory) for a later retry.
   */
  private async quarantineRecords<T extends TableName>(
    tableName: T,
    items: ClickhouseWriterQueueItem<T>[],
    error: unknown,
  ): Promise<boolean> {
    recordIncrement(
      "langfuse.queue.clickhouse_writer.rows_quarantined",
      items.length,
      { entity_type: tableName },
    );

    const errorMessage = error instanceof Error ? error.message : String(error);
    const quarantinedAt = new Date().toISOString();
    const quarantineKey = `${ClickhouseWriter.QUARANTINE_KEY_PREFIX}:${tableName}`;

    const quarantinedIds = items.map((item) => {
      const r = item.data as Record<string, unknown>;
      return {
        project_id: r.project_id,
        trace_id: r.trace_id ?? r.id,
        id: r.id,
      };
    });

    const payloads = items.map((item) =>
      JSON.stringify({
        quarantinedAt,
        attempts: item.attempts,
        createdAt: new Date(item.createdAt).toISOString(),
        error: errorMessage,
        table: tableName,
        data: item.data,
      }),
    );

    const persistedToRedis = await this.persistQuarantineToRedis(
      quarantineKey,
      payloads,
    );

    if (!persistedToRedis) {
      const retained = this.retainQuarantineForRetry(quarantineKey, payloads);
      recordIncrement(
        "langfuse.queue.clickhouse_writer.quarantine_persist_failed",
        items.length,
        { entity_type: tableName },
      );

      // Surface only NON-SENSITIVE metadata here. The full payloads live in the
      // bounded in-memory buffer and are retried later; they never reach logs.
      logger.error(
        `ClickhouseWriter: Redis quarantine temporarily unavailable, ${items.length} ${tableName} record(s) deferred to bounded in-memory buffer for later retry${retained ? "" : " (buffer full)"}`,
        {
          error: errorMessage,
          quarantinedCount: items.length,
          quarantineKey,
          quarantinedIds,
        },
      );

      return false;
    }

    logger.error(
      `ClickhouseWriter: Max attempts reached, quarantined ${items.length} ${tableName} record(s)`,
      {
        error: errorMessage,
        quarantinedCount: items.length,
        persistedToRedis: true,
        quarantinedIds,
      },
    );

    return true;
  }

  /**
   * Persist serialized quarantined payloads to a per-table Redis quarantine
   * list so they survive restarts and are shared across replicas. Returns false
   * (without throwing) when Redis is unavailable or the write fails. No payload
   * content is ever logged.
   */
  private async persistQuarantineToRedis(
    quarantineKey: string,
    payloads: string[],
  ): Promise<boolean> {
    if (!redis || payloads.length === 0) return false;

    try {
      await redis.rpush(quarantineKey, ...payloads);
      return true;
    } catch (persistError) {
      logger.error(
        "ClickhouseWriter: Failed to persist quarantined records to Redis",
        {
          quarantineKey,
          quarantinedCount: payloads.length,
          error: persistError,
        },
      );
      return false;
    }
  }

  /**
   * Retain quarantined payloads in memory (bounded) when Redis is temporarily
   * unavailable, so the records are not silently lost the moment retries are
   * exhausted. Returns true when at least one payload was retained. The buffer
   * is capped to prevent unbounded memory growth.
   */
  private retainQuarantineForRetry(
    quarantineKey: string,
    payloads: string[],
  ): boolean {
    let retained = false;

    for (const payload of payloads) {
      if (
        this.pendingQuarantineRecords.length >=
        ClickhouseWriter.MAX_PENDING_QUARANTINE_WRITES
      ) {
        recordIncrement(
          "langfuse.queue.clickhouse_writer.quarantine_buffer_full",
          1,
        );
        logger.warn(
          "ClickhouseWriter: quarantine in-memory buffer full, payload not retained",
          { quarantineKey },
        );
        continue;
      }
      this.pendingQuarantineRecords.push({ quarantineKey, payload });
      retained = true;
    }

    return retained;
  }

  /**
   * Best-effort retry of quarantined payloads that were deferred because Redis
   * was unavailable. Runs fire-and-forget (never awaited on the flush critical
   * path) and is a no-op when there is nothing pending or Redis is still
   * unavailable. Guarded so concurrent interval flushes do not overlap.
   */
  private async retryQuarantineWrites(): Promise<void> {
    if (
      this.isQuarantineRetryInFlight ||
      this.pendingQuarantineRecords.length === 0 ||
      !redis
    ) {
      return;
    }

    this.isQuarantineRetryInFlight = true;
    try {
      const stillPending: Array<{
        quarantineKey: string;
        payload: string;
      }> = [];

      for (const entry of this.pendingQuarantineRecords) {
        try {
          await redis.rpush(entry.quarantineKey, entry.payload);
        } catch (persistError) {
          logger.warn("ClickhouseWriter: quarantine retry still failing", {
            error: persistError,
          });
          stillPending.push(entry);
        }
      }

      this.pendingQuarantineRecords = stillPending;
    } finally {
      this.isQuarantineRetryInFlight = false;
    }
  }

  public addToQueue<T extends TableName>(
    tableName: T,
    data: RecordInsertType<T>,
  ) {
    const entityQueue = this.queue[tableName];
    entityQueue.push({
      createdAt: Date.now(),
      attempts: 1,
      data,
    });

    if (entityQueue.length >= this.batchSize) {
      logger.debug(`Queue is full. Flushing ${tableName}...`);

      this.flush(tableName).catch((err) => {
        logger.error("ClickhouseWriter.addToQueue flush", err);
      });
    }
  }

  private async writeToClickhouse<T extends TableName>(params: {
    table: T;
    records: RecordInsertType<T>[];
  }): Promise<void> {
    const startTime = Date.now();

    await (ClickhouseWriter.client ?? clickhouseClient())
      .insert({
        table: params.table,
        format: "JSONEachRow",
        values: params.records,
        clickhouse_settings: {
          log_comment: buildClickHouseLogComment({
            surface: "worker",
            route: "clickhouse-writer",
            projectId: MULTI_PROJECT_LOG_COMMENT_PROJECT_ID,
          }),
        },
      })
      .catch((err) => {
        logger.error(`ClickhouseWriter.writeToClickhouse ${err}`);

        throw err;
      });

    logger.debug(
      `ClickhouseWriter.writeToClickhouse: ${Date.now() - startTime} ms`,
    );

    recordGauge("ingestion_clickhouse_insert", params.records.length);
  }
}

export enum TableName {
  Traces = "traces",
  TracesNull = "traces_null",
  Scores = "scores",
  Observations = "observations",
  ObservationsBatchStaging = "observations_batch_staging",
  BlobStorageFileLog = "blob_storage_file_log",
  DatasetRunItems = "dataset_run_items_rmt",
  EventsFull = "events_full", // Primary write target - MV auto-populates events_core
}

type RecordInsertType<T extends TableName> = T extends TableName.Scores
  ? ScoreRecordInsertType
  : T extends TableName.Observations
    ? ObservationRecordInsertType
    : T extends TableName.ObservationsBatchStaging
      ? ObservationBatchStagingRecordInsertType
      : T extends TableName.Traces
        ? TraceRecordInsertType
        : T extends TableName.TracesNull
          ? TraceNullRecordInsertType
          : T extends TableName.BlobStorageFileLog
            ? BlobStorageFileLogInsertType
            : T extends TableName.DatasetRunItems
              ? DatasetRunItemRecordInsertType
              : T extends TableName.EventsFull
                ? EventRecordInsertType
                : never;

type ClickhouseQueue = {
  [T in TableName]: ClickhouseWriterQueueItem<T>[];
};

type ClickhouseWriterQueueItem<T extends TableName> = {
  createdAt: number;
  attempts: number;
  data: RecordInsertType<T>;
};
