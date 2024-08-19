import { EventEmitter } from "stream";

import {
  clickhouseClient,
  instrument,
  ObservationRecordInsertType,
  recordGauge,
  recordHistogram,
  ScoreRecordInsertType,
  TraceRecordInsertType,
} from "@langfuse/shared/src/server";
import { SpanKind } from "@opentelemetry/api";

import { env } from "../../env";
import logger from "../../logger";

export class ClickhouseWriter {
  private static instance: ClickhouseWriter | null = null;
  batchSize: number;
  writeInterval: number;
  queue: ClickhouseQueue;
  eventEmitter: EventEmitter;

  isIntervalFlushInProgress: boolean;
  intervalId: NodeJS.Timeout | null = null;

  private constructor() {
    this.batchSize = env.LANGFUSE_INGESTION_FLUSH_PROCESSING_CONCURRENCY;
    this.writeInterval = env.LANGFUSE_INGESTION_CLICKHOUSE_WRITE_INTERVAL_MS;
    this.eventEmitter = new EventEmitter();

    this.isIntervalFlushInProgress = false;

    this.queue = {
      [TableName.Traces]: [],
      [TableName.Scores]: [],
      [TableName.Observations]: [],
    };

    this.start();
  }

  public static getInstance() {
    if (!ClickhouseWriter.instance) {
      ClickhouseWriter.instance = new ClickhouseWriter();
    }

    return ClickhouseWriter.instance;
  }

  private start() {
    logger.info(
      `Starting ClickhouseWriter. Max interval: ${this.writeInterval} ms, Max batch size: ${this.batchSize}`
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

  private async flushAll(fullQueue = false) {
    return instrument(
      {
        name: "write-to-clickhouse",
        spanKind: SpanKind.CONSUMER,
      },
      async () => {
        await Promise.all([
          this.flush(TableName.Traces, fullQueue),
          this.flush(TableName.Scores, fullQueue),
          this.flush(TableName.Observations, fullQueue),
        ]).catch((err) => {
          logger.error("ClickhouseWriter.flushAll", err);
        });
      }
    );
  }

  private async flush<T extends TableName>(tableName: T, fullQueue = false) {
    console.log("flush", tableName);
    const entityQueue = this.queue[tableName];
    if (entityQueue.length === 0) return;

    const queueItems = entityQueue.splice(
      0,
      fullQueue ? entityQueue.length : this.batchSize
    );

    // Log wait time
    queueItems.forEach((item) => {
      const waitTime = Date.now() - item.createdAt;
      recordHistogram("ingestion_clickhouse_insert_wait_time", waitTime, {
        unit: "milliseconds",
      });
    });

    try {
      const processingStartTime = Date.now();

      await this.writeToClickhouse({
        table: tableName,
        records: queueItems.map((item) => item.data),
      });

      // Log processing time
      recordHistogram(
        "ingestion_clickhouse_insert_processing_time",
        Date.now() - processingStartTime,
        {
          unit: "milliseconds",
        }
      );

      logger.debug(
        `Flushed ${queueItems.length} records to Clickhouse ${tableName}. New queue length: ${entityQueue.length}`
      );

      recordGauge(
        "ingestion_clickhouse_insert_queue_length",
        entityQueue.length,
        {
          unit: "records",
          entityType: tableName,
        }
      );

      queueItems.forEach((item) => {
        this.eventEmitter.removeAllListeners(
          this.getEventName("error", tableName, item.data)
        );

        // Success listeners are automatically removed by the 'once' method
        this.eventEmitter.emit(
          this.getEventName("success", tableName, item.data)
        );
      });
    } catch (err) {
      logger.error(`ClickhouseWriter.flush ${tableName}`, err);

      queueItems.forEach((item) => {
        this.eventEmitter.removeAllListeners(
          this.getEventName("success", tableName, item.data)
        );

        // The error listener is automatically removed by the 'once' method
        this.eventEmitter.emit(
          this.getEventName("error", tableName, item.data)
        );
      });
    }
  }

  public writeRecord<T extends TableName>(
    tableName: T,
    data: RecordInsertType<T>
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const entityQueue = this.queue[tableName];
      entityQueue.push({
        createdAt: Date.now(),
        attempts: 1,
        data,
      });

      console.log("entityQueue", entityQueue);

      // Add event listeners for success and error
      this.eventEmitter.once(
        this.getEventName("success", tableName, data),
        resolve
      );
      console.log(
        "this.getEventName",
        this.getEventName("error", tableName, data)
      );

      this.eventEmitter.once(
        this.getEventName("error", tableName, data),
        reject
      );

      if (entityQueue.length >= this.batchSize) {
        logger.debug(`Queue is full. Flushing ${tableName}...`);

        this.flush(tableName).catch((err) => {
          logger.error("ClickhouseWriter.addToQueue flush", err);
        });
      }
    });
  }

  private getEventName<T extends TableName>(
    type: "success" | "error",
    tableName: T,
    record: RecordInsertType<T>
  ) {
    return `${type}:${tableName}:${record.project_id}:${record.id}`;
  }

  private async writeToClickhouse<T extends TableName>(params: {
    table: T;
    records: RecordInsertType<T>[];
  }): Promise<void> {
    const startTime = Date.now();

    await clickhouseClient
      .insert({
        table: params.table,
        format: "JSONEachRow",
        values: params.records,
      })
      .catch((err) => {
        logger.error(`ClickhouseWriter.writeToClickhouse ${err}`);

        throw err;
      });

    logger.debug(
      `ClickhouseWriter.writeToClickhouse: ${Date.now() - startTime} ms`
    );

    recordGauge("ingestion_clickhouse_insert", params.records.length);
  }
}

export enum TableName {
  Traces = "traces",
  Scores = "scores",
  Observations = "observations",
}

type RecordInsertType<T extends TableName> = T extends TableName.Scores
  ? ScoreRecordInsertType
  : T extends TableName.Observations
    ? ObservationRecordInsertType
    : T extends TableName.Traces
      ? TraceRecordInsertType
      : never;

type ClickhouseQueue = {
  [T in TableName]: ClickhouseWriterQueueItem<T>[];
};

type ClickhouseWriterQueueItem<T extends TableName> = {
  createdAt: number;
  attempts: number;
  data: RecordInsertType<T>;
};
