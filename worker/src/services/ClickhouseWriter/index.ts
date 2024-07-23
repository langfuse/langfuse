import {
  clickhouseClient,
  ObservationRecordInsertType,
  ScoreRecordInsertType,
  TraceRecordInsertType,
} from "@langfuse/shared/src/server";
import { env } from "../../env";
import logger from "../../logger";

export enum TableName {
  Traces = "traces",
  Scores = "scores",
  Observations = "observations",
}

export class ClickhouseWriter {
  private static instance: ClickhouseWriter | null = null;
  batchSize: number;
  writeInterval: number;
  queue: ClickhouseQueue;

  isIntervalFlushInProgress: boolean;
  intervalId: NodeJS.Timeout | null = null;

  private constructor() {
    this.batchSize = env.CLICKHOUSE_WRITE_BATCH_SIZE;
    this.writeInterval = env.CLICKHOUSE_WRITE_INTERVAL_MS;
    this.queue = {
      [TableName.Traces]: [],
      [TableName.Scores]: [],
      [TableName.Observations]: [],
    };

    this.isIntervalFlushInProgress = false;

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
    await Promise.all([
      this.flush(TableName.Traces, fullQueue),
      this.flush(TableName.Scores, fullQueue),
      this.flush(TableName.Observations, fullQueue),
    ]).catch((err) => {
      logger.error("ClickhouseWriter.flushAll", err);
    });
  }

  private async flush(tableName: TableName, fullQueue = false) {
    const entityQueue = this.queue[tableName];
    if (entityQueue.length === 0) return;

    const records = entityQueue.splice(
      0,
      fullQueue ? entityQueue.length : this.batchSize
    );

    await this.writeToClickhouse({
      table: tableName,
      records: records as any,
    });

    logger.debug(
      `Flushed ${records.length} records to Clickhouse ${tableName}. New queue length: ${entityQueue.length}`
    );
  }

  public addToQueue<T extends TableName>(
    tableName: T,
    data: RecordInsertType<T>
  ) {
    const entityQueue = this.queue[tableName];
    entityQueue.push(data as any);

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

    await clickhouseClient
      .insert({
        table: params.table,
        format: "JSONEachRow",
        values: params.records,
      })
      .catch((err) => {
        logger.error(`ClickhouseWriter.writeToClickhouse ${err}`);
      });

    logger.debug(
      `ClickhouseWriter.writeToClickhouse: ${Date.now() - startTime} ms`
    );
  }
}

type RecordInsertType<T extends TableName> = T extends TableName.Scores
  ? ScoreRecordInsertType
  : T extends TableName.Observations
    ? ObservationRecordInsertType
    : T extends TableName.Traces
      ? TraceRecordInsertType
      : never;

type ClickhouseQueue = {
  [TableName.Traces]: TraceRecordInsertType[];
  [TableName.Scores]: ScoreRecordInsertType[];
  [TableName.Observations]: ObservationRecordInsertType[];
};
