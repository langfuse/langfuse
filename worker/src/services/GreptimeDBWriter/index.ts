import { env } from "../../env";
import { logger } from "@langfuse/shared/src/server";
import { instrumentAsync, getCurrentSpan } from "@langfuse/shared/src/server";
import { SpanKind } from "@opentelemetry/api";
import { GreptimeDB, Auth, GreptimeDBClientOptions } from "@greptimecloud/greptimedb-ingester-js";
import { convertTraceDomainToGreptimeDBInsert } from "./traces_converter";
import { convertObservationDomainToGreptimeDBInsert } from "./observations_converter";
import { convertScoreDomainToGreptimeDBInsert } from "./scores_converter";
import { Trace, Observation, Score } from "@langfuse/shared/src/server"; // Assuming these are the domain types

export enum TableName {
  Traces = "traces",
  Scores = "scores",
  Observations = "observations",
  // BlobStorageFileLog is ClickHouse specific, omitting for GreptimeDB for now unless specified
}

// Define the structure of items in the GreptimeDB queue
type GreptimeDBWriterQueueItem<T extends TableName> = {
  createdAt: number;
  attempts: number;
  data: any; // Placeholder for actual GreptimeDB record types
};

// Define the structure of the GreptimeDB queue
type GreptimeDBQueue = {
  [T in TableName]: GreptimeDBWriterQueueItem<T>[];
};

export class GreptimeDBWriter {
  private static instance: GreptimeDBWriter | null = null;
  private static greptimeClient: GreptimeDB | null = null;

  batchSize: number;
  writeInterval: number;
  maxAttempts: number;
  queue: GreptimeDBQueue;

  isIntervalFlushInProgress: boolean;
  intervalId: NodeJS.Timeout | null = null;

  private constructor() {
    this.batchSize = env.GREPTIMEDB_WRITE_BATCH_SIZE ?? 500;
    this.writeInterval = env.GREPTIMEDB_WRITE_INTERVAL_MS ?? 5000;
    this.maxAttempts = env.GREPTIMEDB_MAX_FLUSH_ATTEMPTS ?? 5;

    this.isIntervalFlushInProgress = false;

    this.queue = {
      [TableName.Traces]: [],
      [TableName.Scores]: [],
      [TableName.Observations]: [],
    };

    if (!GreptimeDBWriter.greptimeClient) {
      const host = env.GREPTIMEDB_HOST;
      const database = env.GREPTIMEDB_DATABASE;
      const token = env.GREPTIMEDB_TOKEN; // Using token-based auth

      if (host && database) {
        const options: GreptimeDBClientOptions = {
          host,
          database,
          // rpcPort: 4001, // Default, can be omitted if using standard port
        };
        if (token) {
          options.auth = new Auth("Token", token);
          logger.info("GreptimeDB client: Using token authentication.");
        } else {
           // Basic auth example - if token is not provided, one might use username/password
           // const username = env.GREPTIMEDB_USERNAME;
           // const password = env.GREPTIMEDB_PASSWORD;
           // if (username && password) {
           //   options.auth = new Auth(username, password);
           //   logger.info("GreptimeDB client: Using basic authentication.");
           // } else {
           // logger.warn("GreptimeDB client: No authentication method provided (token or username/password).")
           // }
          logger.warn("GreptimeDB client: GREPTIMEDB_TOKEN not provided. Client will attempt to connect without authentication if not configured on server-side.");
        }


        try {
            GreptimeDBWriter.greptimeClient = new GreptimeDB(options);
            logger.info(`GreptimeDB client initialized for host ${host}, database ${database}.`);
        } catch (error) {
            logger.error("GreptimeDB client initialization failed:", error);
        }

      } else {
        logger.warn(
          "GreptimeDB client not initialized due to missing environment variables (GREPTIMEDB_HOST, GREPTIMEDB_DATABASE)."
        );
      }
    }

    this.start();
  }

  public static getInstance() {
    if (!GreptimeDBWriter.instance) {
      GreptimeDBWriter.instance = new GreptimeDBWriter();
    }
    return GreptimeDBWriter.instance;
  }

  private start() {
    logger.info(
      `Starting GreptimeDBWriter. Max interval: ${this.writeInterval} ms, Max batch size: ${this.batchSize}`
    );

    this.intervalId = setInterval(() => {
      if (this.isIntervalFlushInProgress) return;

      this.isIntervalFlushInProgress = true;
      logger.debug("GreptimeDBWriter: Flush interval elapsed, flushing all queues...");
      this.flushAll().finally(() => {
        this.isIntervalFlushInProgress = false;
      });
    }, this.writeInterval);
  }

  public async shutdown(): Promise<void> {
    logger.info("Shutting down GreptimeDBWriter...");
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    await this.flushAll(true);
    logger.info("GreptimeDBWriter shutdown complete.");
  }

  private async flushAll(fullQueue = false) {
    return instrumentAsync(
      {
        name: "write-to-greptimedb", // Updated span name
        spanKind: SpanKind.CONSUMER,
      },
      async () => {
        // recordIncrement("langfuse.queue.greptimedb_writer.request"); // Placeholder for metrics
        await Promise.all([
          this.flush(TableName.Traces, fullQueue),
          this.flush(TableName.Scores, fullQueue),
          this.flush(TableName.Observations, fullQueue),
        ]).catch((err) => {
          logger.error("GreptimeDBWriter.flushAll error", err);
        });
      }
    );
  }

  private async flush<T extends TableName>(tableName: T, fullQueue = false) {
    const entityQueue = this.queue[tableName];
    if (entityQueue.length === 0) return;

    const queueItems = entityQueue.splice(
      0,
      fullQueue ? entityQueue.length : this.batchSize
    );

    // Data conversion logic
    let greptimeRecords: Record<string, any>[];
    try {
      greptimeRecords = queueItems.map(item => {
        if (tableName === TableName.Traces) {
          return convertTraceDomainToGreptimeDBInsert(item.data as Trace);
        } else if (tableName === TableName.Observations) {
          return convertObservationDomainToGreptimeDBInsert(item.data as Observation);
        } else if (tableName === TableName.Scores) {
          return convertScoreDomainToGreptimeDBInsert(item.data as Score);
        }
        // Should not happen if TableName enum is used correctly
        logger.error(`Unknown table name: ${tableName} during conversion`);
        throw new Error(`Unknown table name: ${tableName}`);
      });
    } catch (conversionError) {
      logger.error(`GreptimeDBWriter: Error converting records for table ${tableName}`, conversionError);
      // Re-add all items from this batch to the queue as conversion failed for at least one
      // This assumes a batch failure on conversion error, might need finer grained handling
      queueItems.forEach((item) => {
        if (item.attempts < this.maxAttempts) {
          entityQueue.unshift({ ...item, attempts: item.attempts + 1 });
        } else {
          logger.error(
            `GreptimeDBWriter: Max attempts reached for ${tableName} record after conversion failure. Dropping record.`,
            { itemData: item.data }
          );
        }
      });
      return; // Stop processing this batch
    }


    if (greptimeRecords.length === 0) {
        logger.debug(`GreptimeDBWriter: No records to flush for table ${tableName} after conversion.`);
        return;
    }
    
    // logger.info(
    //   `GreptimeDBWriter: Flushing ${greptimeRecords.length} converted records for table ${tableName}.`
    // );
    // greptimeRecords.forEach(record => logger.debug(JSON.stringify(record, null, 2)));

    const currentSpan = getCurrentSpan();
    if (currentSpan) {
      currentSpan.setAttributes({
        [`greptimedb-${tableName}-length`]: queueItems.length,
      });
    }

    try {
      await this.writeToGreptimeDB(tableName, greptimeRecords);

      logger.debug(
        `GreptimeDBWriter: Successfully flushed ${greptimeRecords.length} records to ${tableName}. New queue length: ${entityQueue.length}`
      );
      // recordGauge("ingestion_greptimedb_insert_queue_length", entityQueue.length, ...); // Placeholder
    } catch (err) {
      logger.error(`GreptimeDBWriter.flush ${tableName} error during write operation`, err);
      // Re-add failed items to queue with attempt increment
      // This assumes the entire batch failed. GreptimeDB SDK might offer partial success info.
      queueItems.forEach((item) => {
        if (item.attempts < this.maxAttempts) {
          entityQueue.unshift({ ...item, attempts: item.attempts + 1 }); // Add to front to retry sooner
        } else {
          logger.error(
            `GreptimeDBWriter: Max attempts reached for ${tableName} record after write failure. Dropping record.`,
            { itemData: item.data }
          );
          // recordIncrement("langfuse.queue.greptimedb_writer.error"); // Placeholder
          // TODO: Implement dead-letter queue logic
        }
      });
    }
  }

  public addToQueue<T extends TableName>(
    tableName: T,
    data: T extends TableName.Traces ? Trace : T extends TableName.Observations ? Observation : T extends TableName.Scores ? Score : never
  ) {
    const entityQueue = this.queue[tableName];
    entityQueue.push({
      createdAt: Date.now(),
      attempts: 1,
      data,
    });
    // recordGauge("ingestion_greptimedb_insert_queue_length", entityQueue.length, ...); // Placeholder

    if (entityQueue.length >= this.batchSize) {
      logger.debug(
        `GreptimeDBWriter: Queue is full for ${tableName}. Flushing...`
      );
      this.flush(tableName).catch((err) => {
        logger.error("GreptimeDBWriter.addToQueue flush error", err);
      });
    }
  }

  private async writeToGreptimeDB<T extends TableName>(
    table: T,
    records: any[]
  ): Promise<void> {
    if (!GreptimeDBWriter.greptimeClient) {
      logger.error("GreptimeDB client not available. Skipping write operation.");
      // Increment a metric for client not available
      throw new Error("GreptimeDB client not initialized.");
    }

    if (records.length === 0) {
      logger.debug(`GreptimeDBWriter: No records to write to table ${table}.`);
      return Promise.resolve();
    }

    // The greptime-db-ingester-js SDK expects rows as arrays of values,
    // ordered according to the table schema. This requires careful mapping.
    // However, the SDK also supports inserting objects directly if the schema is known
    // or if using a more recent version that supports object insertion more directly.
    // Let's assume for now the SDK can take an array of objects where keys are column names.
    // If it strictly requires arrays of values, the converters would need to output that,
    // or an additional transformation step here would be needed.
    // The `insertRows` method in the SDK is designed for this:
    // `client.insertRows(tableName: string, rows: RowData[], options?: InsertOptions)`
    // where `RowData` is `Record<string, ValueType>`. This matches our `greptimeRecords`.

    try {
      const startTime = Date.now();
      // The table name in GreptimeDB should match the enum TableName values.
      await GreptimeDBWriter.greptimeClient.insertRows(table, records);
      logger.info(
        `GreptimeDBWriter: Successfully wrote ${records.length} records to table ${table} in ${Date.now() - startTime}ms.`
      );
      // recordGauge("ingestion_greptimedb_insert_batch_size", records.length, { table }); // Placeholder
      // recordHistogram("ingestion_greptimedb_insert_duration", Date.now() - startTime, { table }); // Placeholder
    } catch (error) {
      logger.error(`GreptimeDBWriter.writeToGreptimeDB error writing to ${table}`, error);
      // recordIncrement("langfuse.queue.greptimedb_writer.write_error", { table }); // Placeholder
      throw error; // Rethrow to be caught by the flush method for retry logic
    }
  }
}
