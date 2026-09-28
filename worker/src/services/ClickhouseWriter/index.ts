import {
  clickhouseClient,
  ClickhouseClientType,
  getCurrentSpan,
  recordDistribution,
  recordGauge,
  recordHistogram,
  recordIncrement,
  buildClickHouseLogComment,
} from "@langfuse/shared/src/server";

import { env } from "../../env";
import { logger } from "@langfuse/shared/src/server";
import { instrumentAsync } from "@langfuse/shared/src/server";
import { backOff } from "exponential-backoff";
import {
  jsonWriteStrategy,
  type ClickhouseWriteStrategy,
} from "./writeStrategies";
import { TableName, type RecordInsertType } from "./types";
export { TableName } from "./types";

const MULTI_PROJECT_LOG_COMMENT_PROJECT_ID = "MULTI_PROJECT";

export class ClickhouseWriter<
  PayloadMap extends WriterPayloadMap = JsonWriterPayloadMap,
> {
  private static instance: ClickhouseWriter<JsonWriterPayloadMap> | null = null;
  private client: ClickhouseClientType | null;
  private readonly strategyFactory: () => ClickhouseWriteStrategy<
    PayloadMap[TableName]
  >;
  private readonly activeFlushes = new Set<Promise<void>>();
  batchSize: number;
  writeInterval: number;
  maxAttempts: number;
  queue: ClickhouseQueue<PayloadMap>;

  isIntervalFlushInProgress: boolean;
  intervalId: NodeJS.Timeout | null = null;

  private constructor(
    client: ClickhouseClientType | undefined,
    strategyFactory: () => ClickhouseWriteStrategy<PayloadMap[TableName]>,
  ) {
    this.client = client ?? null;
    this.strategyFactory = strategyFactory;
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

  /** Get the singleton JSON writer. A supplied client replaces the current client. */
  public static getInstance(
    client?: ClickhouseClientType,
  ): ClickhouseWriter<JsonWriterPayloadMap> {
    let instance = ClickhouseWriter.instance;
    if (!instance) {
      instance = new ClickhouseWriter<JsonWriterPayloadMap>(
        client,
        () => jsonWriteStrategy,
      );
      ClickhouseWriter.instance = instance;
    } else if (client) {
      instance.client = client;
    }
    return instance;
  }

  private start() {
    logger.info(
      `Starting ClickhouseWriter. Max interval: ${this.writeInterval} ms, Max batch size: ${this.batchSize}`,
    );

    this.intervalId = setInterval(() => {
      if (this.isIntervalFlushInProgress) return;

      this.isIntervalFlushInProgress = true;

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

    while (this.activeFlushes.size > 0) {
      await Promise.all([...this.activeFlushes]);
    }

    await this.flushAll(true);

    logger.info("ClickhouseWriter shutdown complete.");
  }

  public async flushAll(fullQueue = false) {
    return this.trackActiveFlush(
      instrumentAsync(
        {
          name: "write-to-clickhouse",
        },
        async () => {
          recordIncrement("langfuse.queue.clickhouse_writer.request");
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
      ),
    );
  }

  private trackActiveFlush(flush: Promise<void>): Promise<void> {
    this.activeFlushes.add(flush);
    flush.then(
      () => this.activeFlushes.delete(flush),
      () => this.activeFlushes.delete(flush),
    );
    return flush;
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
    queueItems: ClickhouseWriterQueueItem<PayloadMap[T]>[],
    truncate: (table: TableName, row: PayloadMap[T]) => PayloadMap[T],
    strategy: ClickhouseWriteStrategy<PayloadMap[TableName]>,
  ): {
    retryItems: ClickhouseWriterQueueItem<PayloadMap[T]>[];
    requeueItems: ClickhouseWriterQueueItem<PayloadMap[T]>[];
  } {
    // If batch size is 1, fallback to truncation to prevent infinite loops
    if (queueItems.length === 1) {
      const record = queueItems[0].data;
      const truncatedRecord = truncate(tableName, record);
      logger.warn(
        `String length error with single record for ${tableName}, falling back to truncation`,
        {
          recordId: strategy.droppedId(record).id,
        },
      );
      return {
        retryItems: [
          {
            ...queueItems[0],
            data: truncatedRecord,
          },
        ],
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

  private async flush<T extends TableName>(tableName: T, fullQueue = false) {
    const entityQueue = this.queue[tableName];
    if (entityQueue.length === 0) return;

    let queueItems = entityQueue.splice(
      0,
      fullQueue ? entityQueue.length : this.batchSize,
    );
    const writeStrategy = this.strategyFactory();
    const { prepare, truncate } = writeStrategy;

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
      if (prepare) {
        recordsToWrite = recordsToWrite.map((record) =>
          prepare(tableName, record),
        );
      }
      let hasBeenTruncated = false;

      await backOff(
        async () =>
          this.writeToClickhouse({
            table: tableName,
            records: recordsToWrite,
            strategy: writeStrategy,
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
            } else if (isStringLengthError && truncate) {
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
                truncate,
                writeStrategy,
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
            } else if (isSizeError && truncate && !hasBeenTruncated) {
              logger.warn(
                `ClickHouse Writer failed with size error for ${tableName} (attempt ${attemptNumber}/${env.LANGFUSE_INGESTION_CLICKHOUSE_MAX_ATTEMPTS}): Truncating oversized records and retrying`,
                {
                  error: error.message,
                  attemptNumber,
                },
              );

              // Truncate oversized records
              recordsToWrite = recordsToWrite.map((record) =>
                truncate(tableName, record),
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
      let droppedCount = 0;
      queueItems.forEach((item) => {
        if (item.attempts < this.maxAttempts) {
          entityQueue.push({
            ...item,
            attempts: item.attempts + 1,
          });
        } else {
          // TODO - Add to a dead letter queue in Redis rather than dropping
          recordIncrement("langfuse.queue.clickhouse_writer.error");
          droppedCount++;
        }
      });

      if (droppedCount > 0) {
        recordIncrement(
          "langfuse.queue.clickhouse_writer.rows_dropped",
          droppedCount,
          { entity_type: tableName },
        );

        const droppedIds = queueItems
          .filter((item) => item.attempts >= this.maxAttempts)
          .map((item) => writeStrategy.droppedId(item.data));

        logger.error(
          `ClickhouseWriter: Max attempts reached, dropped ${droppedCount} ${tableName} record(s)`,
          { droppedIds },
        );
      }
    }
  }

  public addToQueue<T extends TableName>(tableName: T, data: PayloadMap[T]) {
    const entityQueue = this.queue[tableName];
    entityQueue.push({
      createdAt: Date.now(),
      attempts: 1,
      data,
    });

    if (entityQueue.length >= this.batchSize) {
      logger.debug(`Queue is full. Flushing ${tableName}...`);

      this.trackActiveFlush(this.flush(tableName)).catch((err) => {
        logger.error("ClickhouseWriter.addToQueue flush", err);
      });
    }
  }

  private async writeToClickhouse<T extends TableName>(params: {
    table: T;
    records: PayloadMap[T][];
    strategy: ClickhouseWriteStrategy<PayloadMap[TableName]>;
  }): Promise<void> {
    const startTime = Date.now();

    await params.strategy
      .write(this.client ?? clickhouseClient(), {
        table: params.table,
        records: params.records,
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

type WriterPayloadMap = { [T in TableName]: object };

type JsonWriterPayloadMap = {
  [T in TableName]: RecordInsertType<T>;
};

type ClickhouseQueue<PayloadMap extends WriterPayloadMap> = {
  [T in TableName]: ClickhouseWriterQueueItem<PayloadMap[T]>[];
};

type ClickhouseWriterQueueItem<Payload> = {
  createdAt: number;
  attempts: number;
  data: Payload;
};
