import {
  dorisClient,
  DorisClientType,
  formatDataForDoris,
  BlobStorageFileLogInsertType,
  getCurrentSpan,
  ObservationRecordInsertType,
  recordGauge,
  recordHistogram,
  recordIncrement,
  ScoreRecordInsertType,
  TraceRecordInsertType,
} from "@langfuse/shared/src/server";

import { env } from "../../env";
import { logger } from "@langfuse/shared/src/server";
import { instrumentAsync } from "@langfuse/shared/src/server";
import { SpanKind } from "@opentelemetry/api";

export class DorisWriter {
  private static instance: DorisWriter | null = null;
  private static client: DorisClientType | null = null;
  batchSize: number;
  writeInterval: number;
  maxAttempts: number;
  queue: DorisQueue;

  isIntervalFlushInProgress: boolean;
  intervalId: NodeJS.Timeout | null = null;

  private constructor() {
    this.batchSize = env.LANGFUSE_INGESTION_DORIS_WRITE_BATCH_SIZE;
    this.writeInterval = env.LANGFUSE_INGESTION_DORIS_WRITE_INTERVAL_MS;
    this.maxAttempts = env.LANGFUSE_INGESTION_DORIS_MAX_ATTEMPTS;

    this.isIntervalFlushInProgress = false;

    this.queue = {
      [TableName.Traces]: [],
      [TableName.Scores]: [],
      [TableName.Observations]: [],
      [TableName.BlobStorageFileLog]: [],
    };

    this.start();
  }

  /**
   * Get the singleton instance of DorisWriter.
   * Client parameter is only used for testing.
   */
  public static getInstance(dorisClient?: DorisClientType) {
    if (dorisClient) {
      DorisWriter.client = dorisClient;
    }

    if (!DorisWriter.instance) {
      DorisWriter.instance = new DorisWriter();
    }

    return DorisWriter.instance;
  }

  private start() {
    logger.info(
      `Starting DorisWriter. Max interval: ${this.writeInterval} ms, Max batch size: ${this.batchSize}`,
    );

    this.intervalId = setInterval(() => {
      if (this.isIntervalFlushInProgress) return;

      this.isIntervalFlushInProgress = true;

      logger.debug("Flush interval elapsed, flushing all Doris queues...");

      this.flushAll().finally(() => {
        this.isIntervalFlushInProgress = false;
      });
    }, this.writeInterval);
  }

  public async shutdown(): Promise<void> {
    logger.info("Shutting down DorisWriter...");

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    await this.flushAll(true);

    logger.info("DorisWriter shutdown complete.");
  }

  private async flushAll(fullQueue = false) {
    return instrumentAsync(
      {
        name: "write-to-doris",
        spanKind: SpanKind.CONSUMER,
      },
      async () => {
        recordIncrement("langfuse.queue.doris_writer.request");
        await Promise.all([
          this.flush(TableName.Traces, fullQueue),
          this.flush(TableName.Scores, fullQueue),
          this.flush(TableName.Observations, fullQueue),
          this.flush(TableName.BlobStorageFileLog, fullQueue),
        ]).catch((err) => {
          logger.error("DorisWriter.flushAll", err);
        });
      },
    );
  }

  private async flush<T extends TableName>(tableName: T, fullQueue = false) {
    const entityQueue = this.queue[tableName];
    if (entityQueue.length === 0) return;

    const queueItems = entityQueue.splice(
      0,
      fullQueue ? entityQueue.length : this.batchSize,
    );

    // Log wait time
    queueItems.forEach((item) => {
      const waitTime = Date.now() - item.createdAt;
      recordHistogram("langfuse.queue.doris_writer.wait_time", waitTime, {
        unit: "milliseconds",
      });
    });

    const currentSpan = getCurrentSpan();
    if (currentSpan) {
      currentSpan.setAttributes({
        [`${tableName}-length`]: queueItems.length,
      });
    }

    try {
      const processingStartTime = Date.now();

      await this.writeToDoris({
        table: tableName,
        records: queueItems.map((item) => item.data),
      });

      // Log processing time
      recordHistogram(
        "langfuse.queue.doris_writer.processing_time",
        Date.now() - processingStartTime,
        {
          unit: "milliseconds",
        },
      );

      logger.debug(
        `Flushed ${queueItems.length} records to Doris ${tableName}. New queue length: ${entityQueue.length}`,
      );

      recordGauge(
        "ingestion_doris_insert_queue_length",
        entityQueue.length,
        {
          unit: "records",
          entityType: tableName,
        },
      );
    } catch (err) {
      logger.error(`DorisWriter.flush ${tableName}`, err);

      // Re-add the records to the queue with incremented attempts
      queueItems.forEach((item) => {
        if (item.attempts < this.maxAttempts) {
          entityQueue.push({
            ...item,
            attempts: item.attempts + 1,
          });
        } else {
          // TODO - Add to a dead letter queue in Redis rather than dropping
          recordIncrement("langfuse.queue.doris_writer.error");
          logger.error(
            `Max attempts reached for ${tableName} record. Dropping record.`,
            { item: item.data },
          );
        }
      });
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

      this.flush(tableName).catch((err: any) => {
        logger.error("DorisWriter.addToQueue flush", err);
      });
    }
  }

  private async writeToDoris<T extends TableName>(params: {
    table: T;
    records: RecordInsertType<T>[];
  }): Promise<void> {
    const startTime = Date.now();

    // Format data for Doris compatibility
    const formattedRecords = formatDataForDoris(params.records);

    await (DorisWriter.client ?? dorisClient())
      .insert(params.table, formattedRecords, {
        format: "json",
        strip_outer_array: true,
        read_json_by_line: false,
        max_filter_ratio: 0.1,
        timeout: 600, // 10 minutes
      })
      .catch((err: any) => {
        logger.error(`DorisWriter.writeToDoris ${err}`);
        throw err;
      });

    logger.debug(
      `DorisWriter.writeToDoris: ${Date.now() - startTime} ms`,
    );

    recordGauge("ingestion_doris_insert", params.records.length);
  }

  /**
   * Force flush all queues immediately - useful for testing
   */
  public async forceFlushAll(fullQueue = false): Promise<void> {
    await this.flushAll(fullQueue);
  }
}

export enum TableName {
  Traces = "traces",
  Scores = "scores", 
  Observations = "observations",
  BlobStorageFileLog = "blob_storage_file_log",
}

type RecordInsertType<T extends TableName> = T extends TableName.Scores
  ? ScoreRecordInsertType
  : T extends TableName.Observations
    ? ObservationRecordInsertType
    : T extends TableName.Traces
      ? TraceRecordInsertType
      : T extends TableName.BlobStorageFileLog
        ? BlobStorageFileLogInsertType
        : never;

type DorisQueue = {
  [T in TableName]: DorisWriterQueueItem<T>[];
};

type DorisWriterQueueItem<T extends TableName> = {
  createdAt: number;
  attempts: number;
  data: RecordInsertType<T>;
};
