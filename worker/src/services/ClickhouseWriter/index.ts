import {
  clickhouseClient,
  clickhouseClientForUrl,
  ClickhouseClientType,
  BlobStorageFileLogInsertType,
  getCurrentSpan,
  ObservationRecordInsertType,
  ObservationBatchStagingRecordInsertType,
  recordGauge,
  recordHistogram,
  recordIncrement,
  ScoreRecordInsertType,
  TraceRecordInsertType,
  TraceNullRecordInsertType,
  DatasetRunItemRecordInsertType,
  EventRecordInsertType,
  buildClickHouseLogComment,
  getClusterTopology,
  getCachedClusterTopology,
  getClusterTopologyContractState,
  getClusterNodeUrl,
  hasUnsafeInternalReplication,
  computeShardingKey,
  selectShardNum,
  isLocalRoutableTable,
  type LocalRoutableTable,
  type ShardTopology,
  resolveClickhouseDeploymentMode,
  type ClickhouseDeploymentMode,
  CLICKHOUSE_ROUTING_VERSION,
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
  batchSize: number;
  writeInterval: number;
  maxAttempts: number;
  private readonly maxBatchBytes: number;
  private readonly maxLocalQueueRows: number;
  private readonly maxLocalQueueBytes: number;
  queue: ClickhouseQueue;
  private readonly deploymentMode: ClickhouseDeploymentMode;

  isIntervalFlushInProgress: boolean;
  intervalId: NodeJS.Timeout | null = null;
  // Per-shard round-robin cursor for spreading local-table inserts across a
  // shard's replicas. Keyed by shardNum so shards rotate independently (a
  // single shared cursor would skew the distribution across shards).
  private replicaCursorByShard = new Map<number, number>();
  // Local-table write path: per-shard batching. When CLICKHOUSE_WRITE_LOCAL is
  // active and topology is known, routable records are accumulated per shard so
  // each `<table>_local` insert reaches ~batchSize (instead of batchSize/shard
  // after a whole-table flush is split). Keyed by logical table -> shardNum.
  // Records that cannot be routed synchronously (cold topology, missing key)
  // stay on the regular logical-table queue.
  private localQueue: Partial<
    Record<TableName, Map<string, LocalShardQueue<TableName>>>
  > = {};
  private activeFlushes = new Set<Promise<void>>();
  private shuttingDown = false;
  private shutdownPromise: Promise<void> | null = null;

  private constructor() {
    const deploymentMode = resolveClickhouseDeploymentMode({
      shardingEnabled: env.CLICKHOUSE_SHARDING_ENABLED === "true",
      localWriteEnabled: env.CLICKHOUSE_WRITE_LOCAL_ENABLED === "true",
      clusterEnabled: env.CLICKHOUSE_CLUSTER_ENABLED === "true",
    });
    if (!deploymentMode.ok) throw new Error(deploymentMode.error);
    this.deploymentMode = deploymentMode.mode;

    this.batchSize = env.LANGFUSE_INGESTION_CLICKHOUSE_WRITE_BATCH_SIZE;
    this.writeInterval = env.LANGFUSE_INGESTION_CLICKHOUSE_WRITE_INTERVAL_MS;
    this.maxAttempts = env.LANGFUSE_INGESTION_CLICKHOUSE_MAX_ATTEMPTS;
    this.maxBatchBytes = env.CLICKHOUSE_LOCAL_BATCH_MAX_BYTES;
    this.maxLocalQueueRows = env.CLICKHOUSE_LOCAL_QUEUE_MAX_ROWS;
    this.maxLocalQueueBytes = env.CLICKHOUSE_LOCAL_QUEUE_MAX_BYTES;

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
    if (this.shutdownPromise) return this.shutdownPromise;

    this.shutdownPromise = (async () => {
      logger.info("Shutting down ClickhouseWriter...");
      this.shuttingDown = true;

      if (this.intervalId) {
        clearInterval(this.intervalId);
        this.intervalId = null;
      }

      await Promise.all([...this.activeFlushes]);
      while (this.hasQueuedItems()) {
        await this.flushAll(true);
        await Promise.all([...this.activeFlushes]);
      }

      logger.info("ClickhouseWriter shutdown complete.");
    })();

    return this.shutdownPromise;
  }

  private hasQueuedItems(): boolean {
    return (
      Object.values(this.queue).some((queue) => queue.length > 0) ||
      this.eachShardQueue().some(({ table, queueKey }) => {
        return (this.localQueue[table]?.get(queueKey)?.items.length ?? 0) > 0;
      })
    );
  }

  private trackFlush(promise: Promise<void>): Promise<void> {
    this.activeFlushes.add(promise);
    promise.then(
      () => this.activeFlushes.delete(promise),
      () => this.activeFlushes.delete(promise),
    );
    return promise;
  }

  public async flushAll(fullQueue = false) {
    return instrumentAsync(
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
          // Local-table per-shard queues (empty unless the local-write path is
          // active and topology is known).
          ...this.eachShardQueue().map(({ table, queueKey }) =>
            this.flushShard(table, queueKey, fullQueue),
          ),
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

  /**
   * Distributed / single-node flush for a whole-table queue.
   */
  private flush<T extends TableName>(tableName: T, fullQueue = false) {
    return this.trackFlush(
      this.flushFrom({
        tableName,
        queueRef: this.queue[tableName],
        write: (records) =>
          this.writeToClickhouse({ table: tableName, records }),
        fullQueue,
      }),
    );
  }

  /**
   * Flush one shard's local-table batch. Reuses the exact same
   * backoff/split/truncate/requeue/drop machinery as the table-queue flush; the
   * only difference is the source queue and the write function (direct
   * `<table>_local` insert on that shard).
   */
  private flushShard<T extends TableName>(
    tableName: T,
    queueKey: string,
    fullQueue = false,
  ) {
    const byShard = this.localQueue[tableName];
    const localShardQueue = byShard?.get(queueKey) as
      | LocalShardQueue<T>
      | undefined;
    if (!localShardQueue || localShardQueue.items.length === 0) {
      return Promise.resolve();
    }

    localShardQueue.activeFlushes += 1;
    const flush = this.trackFlush(
      this.flushFrom({
        tableName,
        queueRef: localShardQueue.items,
        shardNum: localShardQueue.shard.shardNum,
        write: (records) =>
          this.writeToShard(
            tableName,
            localShardQueue.shard,
            localShardQueue.startReplicaIndex,
            records,
          ),
        fullQueue,
      }),
    );
    const cleanup = () => {
      localShardQueue.activeFlushes -= 1;
      if (
        localShardQueue.activeFlushes === 0 &&
        localShardQueue.items.length === 0
      ) {
        byShard?.delete(queueKey);
      }
    };
    return flush.then(cleanup, (error) => {
      cleanup();
      throw error;
    });
  }

  /** Enumerate all currently-known local shard queues. */
  private eachShardQueue(): Array<{ table: TableName; queueKey: string }> {
    const out: Array<{ table: TableName; queueKey: string }> = [];
    for (const table of Object.keys(this.localQueue) as TableName[]) {
      const byShard = this.localQueue[table];
      if (!byShard) continue;
      for (const queueKey of byShard.keys()) {
        out.push({ table, queueKey });
      }
    }
    return out;
  }

  private async flushFrom<T extends TableName>(params: {
    tableName: T;
    queueRef: ClickhouseWriterQueueItem<T>[];
    write: (records: RecordInsertType<T>[]) => Promise<void>;
    fullQueue: boolean;
    shardNum?: number;
  }) {
    const {
      tableName,
      queueRef: entityQueue,
      write,
      fullQueue,
      shardNum,
    } = params;
    const label =
      shardNum === undefined ? tableName : `${tableName} shard ${shardNum}`;
    const metricAttributes: Record<string, string> =
      shardNum === undefined ? {} : { shard: String(shardNum) };

    if (entityQueue.length === 0) return;

    const rowLimit = fullQueue ? entityQueue.length : this.batchSize;
    let take = 0;
    let bytes = 0;
    while (take < rowLimit && take < entityQueue.length) {
      const nextBytes = entityQueue[take].estimatedBytes;
      if (take > 0 && bytes + nextBytes > this.maxBatchBytes) break;
      bytes += nextBytes;
      take += 1;
    }
    let queueItems = entityQueue.splice(0, take);

    // Log wait time
    queueItems.forEach((item) => {
      const waitTime = Date.now() - item.createdAt;
      recordHistogram("langfuse.queue.clickhouse_writer.wait_time", waitTime, {
        unit: "milliseconds",
        ...metricAttributes,
      });
    });

    const currentSpan = getCurrentSpan();
    if (currentSpan) {
      currentSpan.setAttributes({
        [`${label}-length`]: queueItems.length,
      });
    }

    try {
      const processingStartTime = Date.now();

      let recordsToWrite = queueItems.map((item) => item.data);
      recordsToWrite = recordsToWrite.map((r) =>
        this.clampDecimal64Fields(tableName, r),
      );
      let hasBeenTruncated = false;

      await backOff(async () => write(recordsToWrite), {
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
      });

      // Log processing time
      recordHistogram(
        "langfuse.queue.clickhouse_writer.processing_time",
        Date.now() - processingStartTime,
        {
          unit: "milliseconds",
        },
      );

      logger.debug(
        `Flushed ${queueItems.length} records to Clickhouse ${label}. New queue length: ${entityQueue.length}`,
      );

      recordGauge(
        "ingestion_clickhouse_insert_queue_length",
        entityQueue.length,
        {
          unit: "records",
          entityType: tableName,
          ...metricAttributes,
        },
      );
    } catch (err) {
      logger.error(`ClickhouseWriter.flush ${label}`, err);

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
          .map((item) => {
            const r = item.data as Record<string, unknown>;
            return {
              project_id: r.project_id,
              trace_id: r.trace_id ?? r.id,
              id: r.id,
            };
          });

        logger.error(
          `ClickhouseWriter: Max attempts reached, dropped ${droppedCount} ${label} record(s)`,
          { droppedIds },
        );
      }
    }
  }

  /**
   * Whether the per-shard local-write path is active for this table. Mirrors
   * the guard in writeToClickhouse so enqueue-time routing and write-time
   * behavior stay in lockstep: disabled when the flag is off, a test client is
   * injected, or the table has no `<table>_local` shard.
   */
  private localModeActive(table: string): table is LocalRoutableTable {
    return (
      this.deploymentMode === "sharded_direct_local" &&
      !ClickhouseWriter.client &&
      isLocalRoutableTable(table)
    );
  }

  public addToQueue<T extends TableName>(
    tableName: T,
    data: RecordInsertType<T>,
  ) {
    if (this.shuttingDown) {
      throw new Error("Cannot enqueue ClickHouse records during shutdown");
    }

    const item: ClickhouseWriterQueueItem<T> = {
      createdAt: Date.now(),
      attempts: 1,
      data,
      estimatedBytes: Buffer.byteLength(JSON.stringify(data)),
    };

    if (this.deploymentMode !== "single_shard") {
      const contractState = getClusterTopologyContractState();
      if (
        contractState.status === "invalid" ||
        contractState.status === "topology_changed"
      ) {
        throw new Error(
          `ClickHouse sharding contract is ${contractState.status}: ${
            contractState.reason ?? "unknown_reason"
          }`,
        );
      }
    }

    // Local-table per-shard batching. Only when the local path is active and we
    // can resolve the target shard synchronously from a safe cached topology.
    if (this.localModeActive(tableName)) {
      const topology = getCachedClusterTopology();
      if (
        topology &&
        topology.shards.length > 0 &&
        !hasUnsafeInternalReplication(topology)
      ) {
        const key = computeShardingKey(
          tableName,
          data as Record<string, unknown>,
        );
        const shardNum =
          key === null
            ? null
            : selectShardNum(
                key,
                topology.shards.map((s) => ({
                  shardNum: s.shardNum,
                  weight: s.weight,
                })),
              );
        if (shardNum !== null) {
          const shard = topology.shards.find(
            (candidate) => candidate.shardNum === shardNum,
          );
          if (!shard) {
            throw new Error(
              `Shard ${shardNum} missing from validated topology`,
            );
          }

          const table: TableName = tableName;
          const queueKey = `${CLICKHOUSE_ROUTING_VERSION}:${topology.fingerprint}:${shardNum}`;
          let byShard = this.localQueue[table];
          if (!byShard) {
            byShard = new Map();
            this.localQueue[table] = byShard;
          }
          let localShardQueue = byShard.get(queueKey);
          if (!localShardQueue) {
            localShardQueue = {
              shard,
              topologyFingerprint: topology.fingerprint,
              routingVersion: CLICKHOUSE_ROUTING_VERSION,
              items: [],
              activeFlushes: 0,
              startReplicaIndex: this.nextReplicaIndex(shard),
            };
            byShard.set(queueKey, localShardQueue);
          }
          const localTotals = this.getLocalQueueTotals();
          if (
            localTotals.rows + 1 > this.maxLocalQueueRows ||
            localTotals.bytes + item.estimatedBytes > this.maxLocalQueueBytes
          ) {
            recordIncrement(
              "langfuse.clickhouse_writer.local_queue_backpressure",
            );
            throw new Error("ClickHouse direct-local queue capacity exceeded");
          }
          localShardQueue.items.push(
            item as ClickhouseWriterQueueItem<TableName>,
          );

          const localShardBytes = localShardQueue.items.reduce(
            (total, queued) => total + queued.estimatedBytes,
            0,
          );
          if (
            localShardQueue.items.length >= this.batchSize ||
            localShardBytes >= this.maxBatchBytes
          ) {
            logger.debug(
              `Shard queue is full. Flushing ${tableName} shard ${shardNum}...`,
            );
            this.flushShard(tableName, queueKey).catch((err) => {
              logger.error("ClickhouseWriter.addToQueue flushShard", err);
            });
          }
          return;
        }
      }
      // Discovery is asynchronous so the enqueue hot path remains synchronous.
      // This record stays on the logical-table path; later records can use the
      // topology once the cache is warm.
      if (!topology) getClusterTopology().catch(() => undefined);
      if (topology && hasUnsafeInternalReplication(topology)) {
        recordIncrement(
          "langfuse.clickhouse_writer.local_path_disabled_unsafe_replication",
        );
      }
    }

    const entityQueue = this.queue[tableName];
    entityQueue.push(item);

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

    await this.insertIntoDistributed(params.table, params.records);

    logger.debug(
      `ClickhouseWriter.writeToClickhouse: ${Date.now() - startTime} ms`,
    );

    recordGauge("ingestion_clickhouse_insert", params.records.length);
  }

  /** Insert into the logical (Distributed / single-node) table via CLICKHOUSE_URL. */
  private async insertIntoDistributed(
    table: string,
    records: { project_id?: string }[],
  ): Promise<void> {
    if (
      this.deploymentMode !== "single_shard" &&
      !ClickhouseWriter.client &&
      !(await getClusterTopology())
    ) {
      const contractState = getClusterTopologyContractState();
      throw new Error(
        `ClickHouse sharding contract validation failed: ${
          contractState.reason ?? contractState.status
        }`,
      );
    }

    await (ClickhouseWriter.client ?? clickhouseClient())
      .insert({
        table,
        format: "JSONEachRow",
        values: records,
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
  }

  private async writeToShard(
    table: string,
    shard: ShardTopology,
    startReplicaIndex: number,
    records: { project_id?: string }[],
  ): Promise<void> {
    await this.insertIntoShard(
      shard,
      `${table}_local`,
      table,
      records,
      startReplicaIndex,
    );
    recordGauge("ingestion_clickhouse_insert", records.length);
  }

  /** Insert into `<table>_local` on a shard, failing over across its replicas. */
  private async insertIntoShard(
    shard: ShardTopology,
    localTable: string,
    logicalTable: string,
    records: { project_id?: string }[],
    preferredReplicaIndex?: number,
  ): Promise<void> {
    const replicas = shard.replicas;
    if (replicas.length === 0) {
      throw new Error(
        `No replicas known for shard ${shard.shardNum} of table ${logicalTable}`,
      );
    }

    // Rotate the starting replica to spread load across this shard's replicas.
    const start =
      preferredReplicaIndex === undefined
        ? this.nextReplicaIndex(shard)
        : preferredReplicaIndex % replicas.length;
    let lastError: unknown;

    for (let i = 0; i < replicas.length; i++) {
      const node = replicas[(start + i) % replicas.length];
      const url = getClusterNodeUrl(node);
      try {
        await clickhouseClientForUrl(url).insert({
          table: localTable,
          format: "JSONEachRow",
          values: records,
          clickhouse_settings: {
            async_insert: 0,
            insert_deduplicate: 1,
            log_comment: buildClickHouseLogComment({
              surface: "worker",
              route: "clickhouse-writer-local",
              projectId: MULTI_PROJECT_LOG_COMMENT_PROJECT_ID,
            }),
          },
        });
        return;
      } catch (err) {
        lastError = err;
        // Only fail over to another replica on connection-type errors; other
        // errors (size / string length / query) bubble up to flush()'s backoff.
        if (!this.isSafeReplicaFailoverError(err)) throw err;
        logger.warn(
          `ClickhouseWriter: insert into ${localTable} @ ${url} failed (replica ${
            i + 1
          }/${replicas.length}), trying next replica`,
          { error: (err as Error).message, shard: shard.shardNum },
        );
        // Node may be gone — refresh topology in the background.
        getClusterTopology({ forceRefresh: true }).catch(() => undefined);
      }
    }

    throw lastError;
  }

  private isSafeReplicaFailoverError(error: unknown): boolean {
    let current: unknown = error;
    while (current && typeof current === "object") {
      const code = String((current as { code?: unknown }).code ?? "");
      if (["ECONNREFUSED", "ENOTFOUND", "EHOSTUNREACH"].includes(code)) {
        return true;
      }
      current = (current as { cause?: unknown }).cause;
    }

    const message = error instanceof Error ? error.message.toUpperCase() : "";
    return ["ECONNREFUSED", "ENOTFOUND", "EHOSTUNREACH"].some((code) =>
      message.includes(code),
    );
  }

  private nextReplicaIndex(shard: ShardTopology): number {
    const cursor = this.replicaCursorByShard.get(shard.shardNum) ?? 0;
    this.replicaCursorByShard.set(shard.shardNum, cursor + 1);
    return cursor % Math.max(1, shard.replicas.length);
  }

  private getLocalQueueTotals(): { rows: number; bytes: number } {
    let rows = 0;
    let bytes = 0;
    for (const { table, queueKey } of this.eachShardQueue()) {
      const items = this.localQueue[table]?.get(queueKey)?.items ?? [];
      rows += items.length;
      bytes += items.reduce(
        (total, queued) => total + queued.estimatedBytes,
        0,
      );
    }
    return { rows, bytes };
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
  estimatedBytes: number;
};

type LocalShardQueue<T extends TableName> = {
  shard: ShardTopology;
  topologyFingerprint: string;
  routingVersion: typeof CLICKHOUSE_ROUTING_VERSION;
  items: ClickhouseWriterQueueItem<T>[];
  activeFlushes: number;
  startReplicaIndex: number;
};
