import { pipeline, Transform, type Readable } from "stream";
import { createGzip } from "zlib";
import { monitorEventLoopDelay } from "perf_hooks";
import { Job } from "bullmq";
import { prisma } from "@langfuse/shared/src/db";
import {
  QueueName,
  TQueueJobTypes,
  logger,
  StorageService,
  StorageServiceFactory,
  streamTransformations,
  getObservationsForBlobStorageExport,
  getObservationsForBlobStorageExportRaw,
  getTracesForBlobStorageExport,
  getScoresForBlobStorageExport,
  getEventsForBlobStorageExport,
  getEventsForBlobStorageExportRaw,
  getCurrentSpan,
  instrumentAsync,
  recordGauge,
  recordIncrement,
  BlobStorageIntegrationProcessingQueue,
  queryClickhouse,
  QueueJobs,
  sendBlobStorageExportFailedEmail,
  getProjectAdminEmails,
  enrichObservationWithModelData,
  createModelCache,
  blobStorageEndpointConnectionValidationOptions,
  validateBlobStorageEndpoint,
  pollQueryStatus,
  getQueryError,
  getQueryResultRows,
  sleep,
} from "@langfuse/shared/src/server";
import {
  registerInFlightBlobExport,
  unregisterInFlightBlobExport,
  BLOB_TABLE_EXPORT_METRIC,
  type BlobTableExportOutcome,
} from "./inFlightExports";
import { WORKER_HOST_ID } from "../../utils/hostId";
import {
  BlobStorageIntegrationType,
  BlobStorageIntegrationFileType,
  BlobStorageExportMode,
  OBSERVATION_FIELD_GROUPS_FULL,
  type ObservationFieldGroupFull,
  isEnrichedBlobExportAvailable,
  isEnrichedBlobExportSource,
  resolveBlobExportTuning,
} from "@langfuse/shared";
import { decrypt } from "@langfuse/shared/encryption";
import { randomUUID } from "crypto";
import { SpanKind } from "@opentelemetry/api";
import { env, v4AllowPreviewOptIn } from "../../env";

export const BLOB_STORAGE_LAG_BUFFER_MS = 20 * 60 * 1000; // 20-minute lag buffer

export async function* enrichObservationStream(
  stream: AsyncGenerator<Record<string, unknown>>,
  projectId: string,
  modelIdField: string,
  convertLatencyToSeconds: boolean,
  fieldGroups?: ObservationFieldGroupFull[],
): AsyncGenerator<Record<string, unknown>> {
  const { getModel } = createModelCache(projectId);

  const includeModelId = !fieldGroups || fieldGroups.includes("model");

  for await (const row of stream) {
    const enriched: Record<string, unknown> = { ...row };

    if (includeModelId) {
      const modelId = row[modelIdField] as string | null | undefined;
      const model = await getModel(modelId);
      const pricing = enrichObservationWithModelData(model);
      enriched.input_price = pricing.inputPrice;
      enriched.output_price = pricing.outputPrice;
      enriched.total_price = pricing.totalPrice;
    }

    // ClickHouse returns {} for Map columns even when not SELECTed — drop it
    // when the metadata group was not requested.
    if (fieldGroups && !fieldGroups.includes("metadata")) {
      delete enriched.metadata;
    }

    if (convertLatencyToSeconds && row.latency !== undefined) {
      const latency = row.latency as number | null;
      enriched.latency = latency != null ? latency / 1000 : null;
    }

    if (convertLatencyToSeconds && row.time_to_first_token !== undefined) {
      const ttft = row.time_to_first_token as number | null;
      enriched.time_to_first_token = ttft != null ? ttft / 1000 : null;
    }

    yield enriched;
  }
}

const getMinTimestampForExport = async (
  projectId: string,
  lastSyncAt: Date | null,
  exportMode: BlobStorageExportMode,
  exportStartDate: Date | null,
): Promise<Date | null> => {
  // If we have a lastSyncAt, use it (this is for subsequent exports)
  if (lastSyncAt) {
    return lastSyncAt;
  }

  // For first export, use the export mode to determine start date
  switch (exportMode) {
    case BlobStorageExportMode.FULL_HISTORY:
      // Query ClickHouse for the actual minimum timestamp from traces, observations, and scores tables
      try {
        const result = await queryClickhouse<{ min_timestamp: number | null }>({
          query: `
              SELECT min(toUnixTimestamp(ts)) * 1000 as min_timestamp
              FROM (
                SELECT min(timestamp) as ts
                FROM traces
                WHERE project_id = {projectId: String}

                UNION ALL

                SELECT min(start_time) as ts
                FROM observations
                WHERE project_id = {projectId: String}

                UNION ALL

                SELECT min(timestamp) as ts
                FROM scores
                WHERE project_id = {projectId: String}
              )
              WHERE ts > 0 -- Ignore 0 results (usually empty tables)
            `,
          params: { projectId },
        });

        // Extract the minimum timestamp
        logger.info(
          `[BLOB INTEGRATION] ClickHouse min_timestamp for project ${projectId}: ${result[0]?.min_timestamp}, type: ${typeof result[0]?.min_timestamp}`,
        );
        const minTimestampValue = Number(result[0]?.min_timestamp);

        if (minTimestampValue && minTimestampValue > 0) {
          const date = new Date(minTimestampValue);
          logger.info(
            `[BLOB INTEGRATION] Created Date from min_timestamp for project ${projectId}: ${date}, isValid: ${!isNaN(date.getTime())}, getTime: ${date.getTime()}`,
          );
          return date;
        }

        // No data in ClickHouse yet — return null so the caller skips the
        // empty-window writeback and the next scheduler tick re-queries.
        logger.info(
          `[BLOB INTEGRATION] No historical data found for project ${projectId}, deferring`,
        );
        return null;
      } catch (error) {
        logger.error(
          `[BLOB INTEGRATION] Error querying ClickHouse for minimum timestamp for project ${projectId}`,
          error,
        );
        throw new Error(`Failed to fetch minimum timestamp: ${error}`);
      }
    case BlobStorageExportMode.FROM_TODAY:
    case BlobStorageExportMode.FROM_CUSTOM_DATE:
      return exportStartDate || new Date(); // Use export start date or current time as fallback
    default:
      // eslint-disable-next-line no-case-declarations
      const _exhaustiveCheck: never = exportMode;
      throw new Error(`Invalid export mode: ${exportMode}`);
  }
};

/**
 * Get the frequency interval in milliseconds for a given export frequency.
 * This is used to chunk historic exports into manageable time windows.
 */
const getFrequencyIntervalMs = (frequency: string): number => {
  switch (frequency) {
    case "every_20_minutes":
      return 20 * 60 * 1000; // 20 minutes
    case "hourly":
      return 60 * 60 * 1000; // 1 hour
    case "daily":
      return 24 * 60 * 60 * 1000; // 1 day
    case "weekly":
      return 7 * 24 * 60 * 60 * 1000; // 1 week
    default:
      throw new Error(`Unsupported export frequency: ${frequency}`);
  }
};

const getFileTypeProperties = (fileType: BlobStorageIntegrationFileType) => {
  switch (fileType) {
    case BlobStorageIntegrationFileType.JSON:
      return {
        contentType: "application/json; charset=utf-8",
        extension: "json",
      };
    case BlobStorageIntegrationFileType.CSV:
      return {
        contentType: "text/csv; charset=utf-8",
        extension: "csv",
      };
    case BlobStorageIntegrationFileType.JSONL:
      return {
        contentType: "application/x-ndjson; charset=utf-8",
        extension: "jsonl",
      };
    default:
      // eslint-disable-next-line no-case-declarations
      const _exhaustiveCheck: never = fileType;
      throw new Error(`Unsupported file type: ${fileType}`);
  }
};

class ByteCounter extends Transform {
  bytes = 0;
  _transform(
    chunk: Buffer,
    _encoding: string,
    callback: (error: Error | null, data?: Buffer) => void,
  ) {
    this.bytes += chunk.length;
    callback(null, chunk);
  }
}

async function* countedStream<T>(
  source: AsyncGenerator<T>,
  stats: { rows: number; sourceWaitMs: number },
): AsyncGenerator<T> {
  let lastYield = performance.now();
  for await (const value of source) {
    stats.sourceWaitMs += performance.now() - lastYield;
    stats.rows++;
    yield value;
    lastYield = performance.now();
  }
}

// Raw passthrough skips per-row parsing, so a ClickHouse query that fails after
// a 200 + partial body would otherwise be uploaded as a silently truncated
// file. After the stream drains and the upload completes, confirm the query
// finished cleanly via system.query_log. query_log flushes asynchronously
// (~7.5s default), so poll with bounded backoff. A non-completed status throws,
// which fails the job: lastSyncAt is not advanced and the deterministic
// filename is overwritten on the next successful run. Returns result_rows.
const PASSTHROUGH_QUERY_LOG_POLL_ATTEMPTS = 12;
const PASSTHROUGH_QUERY_LOG_POLL_DELAY_MS = 2_500; // ~30s total budget
// Lower bound passed to the system.query_log lookups so they can partition-prune
// instead of scanning every retained partition. query_log is partitioned by
// month (toYYYYMM(event_date)), so a generous buffer is effectively free — it
// only ever widens the scan to the current and (near a month boundary) previous
// partition. Sized to comfortably absorb worker/ClickHouse clock skew. Times are
// UTC end-to-end (convertDateToClickhouseDateTime emits UTC; CH runs UTC), so no
// timezone conversion is involved.
const PASSTHROUGH_QUERY_LOG_SKEW_BUFFER_MS = 24 * 60 * 60 * 1000; // 24h

const verifyRawPassthroughCompletion = async (
  queryId: string,
  table: string,
  startedAt: Date,
): Promise<number | undefined> => {
  const tags = { feature: "blobstorage", table };
  const since = new Date(
    startedAt.getTime() - PASSTHROUGH_QUERY_LOG_SKEW_BUFFER_MS,
  );
  let status = await pollQueryStatus(queryId, tags, since);
  for (
    let attempt = 0;
    attempt < PASSTHROUGH_QUERY_LOG_POLL_ATTEMPTS &&
    status !== "completed" &&
    status !== "failed";
    attempt++
  ) {
    await sleep(PASSTHROUGH_QUERY_LOG_POLL_DELAY_MS);
    status = await pollQueryStatus(queryId, tags, since);
  }

  if (status !== "completed") {
    const chError =
      status === "failed" ? await getQueryError(queryId, since) : undefined;
    throw new Error(
      `Raw passthrough export query did not complete cleanly ` +
        `(query_id=${queryId} status=${status})` +
        (chError ? `: ${chError}` : ""),
    );
  }

  // The upload is already verified clean (QueryFinish) at this point, so a
  // failed row-count read must not invalidate it — treat the count as unknown.
  try {
    return await getQueryResultRows(queryId, since);
  } catch (rowsError) {
    logger.warn(
      `[BLOB INTEGRATION] Failed to read result_rows for verified passthrough query ${queryId}`,
      rowsError,
    );
    return undefined;
  }
};

// Best-effort removal of an already-committed passthrough object whose source
// query did not verify as successful. A delete failure must not mask the
// original verification error, so it is logged and swallowed.
const deletePotentiallyCorruptExport = async (
  storageService: StorageService,
  filePath: string,
): Promise<void> => {
  try {
    await storageService.deleteFiles([filePath]);
    logger.warn(
      `[BLOB INTEGRATION] Deleted unverified passthrough export object ${filePath}`,
    );
  } catch (deleteError) {
    logger.error(
      `[BLOB INTEGRATION] Failed to delete unverified passthrough export object ${filePath}`,
      deleteError,
    );
  }
};

const processBlobStorageExport = async (config: {
  projectId: string;
  minTimestamp: Date;
  maxTimestamp: Date;
  bucketName: string;
  endpoint: string | null;
  region: string;
  accessKeyId: string | undefined;
  secretAccessKey: string | undefined;
  prefix?: string;
  forcePathStyle?: boolean;
  type: BlobStorageIntegrationType;
  table: "traces" | "observations" | "scores" | "observations_v2"; // observations_v2 is the events table
  fileType: BlobStorageIntegrationFileType;
  compressed: boolean;
  convertV4LatencyToSeconds: boolean;
  exportFieldGroups?: ObservationFieldGroupFull[];
  rawPassthrough: boolean;
  bullmqJobId: string | undefined;
  bullmqAttemptsMade: number;
}) => {
  logger.info(
    `[BLOB INTEGRATION] Processing ${config.table} export for project ${config.projectId}`,
  );

  // Initialize the storage service
  // KMS SSE is not supported for this integration.
  const storageService: StorageService = StorageServiceFactory.getInstance({
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    bucketName: config.bucketName,
    endpoint: config.endpoint ?? undefined,
    region: config.region,
    forcePathStyle: config.forcePathStyle ?? false,
    awsSse: undefined,
    awsSseKmsKeyId: undefined,
    useAzureBlob: config.type === BlobStorageIntegrationType.AZURE_BLOB_STORAGE,
    useGoogleCloudStorage: false, // Not supported in blob storage integration
    useOCIObjectStorage: false, // Not supported in blob storage integration
    connectionValidation: blobStorageEndpointConnectionValidationOptions(),
  });

  await instrumentAsync(
    {
      name: `blob-export-table`,
      spanKind: SpanKind.INTERNAL,
    },
    async (span) => {
      span.setAttribute("blob.table", config.table);
      span.setAttribute("blob.projectId", config.projectId);
      span.setAttribute("blob.compressed", config.compressed);
      span.setAttribute("blob.fileType", config.fileType);
      span.setAttribute(
        "blob.window.minTimestamp",
        config.minTimestamp.toISOString(),
      );
      span.setAttribute(
        "blob.window.maxTimestamp",
        config.maxTimestamp.toISOString(),
      );
      // Identity + host to group concurrent duplicate runs of the same window.
      if (config.bullmqJobId !== undefined) {
        span.setAttribute("messaging.bullmq.job.id", config.bullmqJobId);
      }
      span.setAttribute("job.attemptsMade", config.bullmqAttemptsMade);
      span.setAttribute("host.name", WORKER_HOST_ID);

      // Event-loop delay during the stream: if it spikes, lock renewal can't
      // fire and the job re-enqueues as stalled (LFE-10063). Torn down below.
      const eventLoopDelay = monitorEventLoopDelay({ resolution: 20 });
      eventLoopDelay.enable();

      // In-flight so a SIGTERM abort is loggable distinctly from a stall-timeout.
      const inFlightHandle = registerInFlightBlobExport({
        jobId: config.bullmqJobId,
        projectId: config.projectId,
        table: config.table,
        minTimestamp: config.minTimestamp.toISOString(),
        maxTimestamp: config.maxTimestamp.toISOString(),
        startedAt: Date.now(),
      });

      recordIncrement(BLOB_TABLE_EXPORT_METRIC, 1, {
        outcome: "started" satisfies BlobTableExportOutcome,
        table: config.table,
        projectId: config.projectId,
      });

      // Outside the try so the catch can distinguish a real upload success from
      // a failure.
      let uploadSucceeded = false;

      try {
        const blobStorageProps = getFileTypeProperties(config.fileType);

        const timestamp = config.maxTimestamp
          .toISOString()
          .replace(/:/g, "-")
          .substring(0, 19);
        const extension = config.compressed
          ? `${blobStorageProps.extension}.gz`
          : blobStorageProps.extension;
        const filePath = `${config.prefix ?? ""}${config.projectId}/${config.table}/${timestamp}.${extension}`;
        const uploadContentType = config.compressed
          ? "application/gzip"
          : blobStorageProps.contentType;

        const exportFieldGroups =
          config.exportFieldGroups && config.exportFieldGroups.length > 0
            ? config.exportFieldGroups
            : [...OBSERVATION_FIELD_GROUPS_FULL];

        // Raw passthrough (LFE-10402) is opt-in per project and only valid for
        // JSONL output of the enriched-observation tables — the only formats
        // where ClickHouse FORMAT JSONEachRow bytes map 1:1 to the file. Any
        // other request falls back to the standard path. The integration-level
        // ineligibility warning is emitted once by the dispatcher; here we just
        // select the path per table (scores/traces always use the standard path,
        // so per-table fallback is expected and not worth a warning).
        const passthroughEligible =
          config.rawPassthrough &&
          config.fileType === BlobStorageIntegrationFileType.JSONL &&
          (config.table === "observations" ||
            config.table === "observations_v2");

        span.setAttribute(
          "blob.path",
          passthroughEligible ? "passthrough" : "standard",
        );

        const pipelineCallback = (err: NodeJS.ErrnoException | null) => {
          if (err) {
            logger.error(
              "[BLOB INTEGRATION] Getting data from DB for blob storage integration failed: ",
              err,
            );
          }
        };

        const serializedCounter = new ByteCounter();
        const compressedCounter = config.compressed ? new ByteCounter() : null;

        // Row count source: the standard path tallies rows in JS (countedStream);
        // the passthrough path reads result_rows from query_log after upload.
        const sourceStats = { rows: 0, sourceWaitMs: 0 };
        let passthroughRows: number | undefined;
        let passthroughQueryId: string | undefined;
        // Captured just before the query is issued, so the post-hoc query_log
        // lookups can partition-prune on event_date instead of full scans.
        let passthroughQueryStartedAt: Date | undefined;

        let fileStream: Readable;

        if (passthroughEligible) {
          // Stream ClickHouse JSONEachRow bytes straight through: no row parse,
          // no enrichment, no re-serialization. Shaping (latency→s, dropped
          // price columns, field-group selection) is already baked into the SQL.
          passthroughQueryStartedAt = new Date();
          const { stream, queryId } =
            config.table === "observations"
              ? await getObservationsForBlobStorageExportRaw(
                  config.projectId,
                  config.minTimestamp,
                  config.maxTimestamp,
                  exportFieldGroups,
                )
              : await getEventsForBlobStorageExportRaw(
                  config.projectId,
                  config.minTimestamp,
                  config.maxTimestamp,
                  exportFieldGroups,
                  config.convertV4LatencyToSeconds,
                );
          passthroughQueryId = queryId;

          fileStream = compressedCounter
            ? pipeline(
                stream,
                serializedCounter,
                createGzip(),
                compressedCounter,
                pipelineCallback,
              )
            : pipeline(stream, serializedCounter, pipelineCallback);
        } else {
          let rawStream: AsyncGenerator<Record<string, unknown>>;

          switch (config.table) {
            case "traces":
              rawStream = getTracesForBlobStorageExport(
                config.projectId,
                config.minTimestamp,
                config.maxTimestamp,
              );
              break;
            case "observations":
              rawStream = enrichObservationStream(
                getObservationsForBlobStorageExport(
                  config.projectId,
                  config.minTimestamp,
                  config.maxTimestamp,
                  exportFieldGroups,
                ),
                config.projectId,
                "model_id",
                false, // v3 query already returns latency in seconds
                exportFieldGroups,
              );
              break;
            case "scores":
              rawStream = getScoresForBlobStorageExport(
                config.projectId,
                config.minTimestamp,
                config.maxTimestamp,
              );
              break;
            case "observations_v2": // observations_v2 is the events table
              rawStream = enrichObservationStream(
                getEventsForBlobStorageExport(
                  config.projectId,
                  config.minTimestamp,
                  config.maxTimestamp,
                  exportFieldGroups,
                ),
                config.projectId,
                "model_id",
                config.convertV4LatencyToSeconds,
                exportFieldGroups,
              );
              break;
            default:
              throw new Error(`Unsupported table type: ${config.table}`);
          }

          const dataStream = countedStream(rawStream, sourceStats);
          const formatTransform = streamTransformations[config.fileType]();

          fileStream = compressedCounter
            ? pipeline(
                dataStream,
                formatTransform,
                serializedCounter,
                createGzip(),
                compressedCounter,
                pipelineCallback,
              )
            : pipeline(
                dataStream,
                formatTransform,
                serializedCounter,
                pipelineCallback,
              );
        }

        // Upload the file to cloud storage
        // For CSV exports, use larger part size to handle big files
        // 100 MB parts support files up to ~1 TB (100 MB × 10,000 AWS limit)
        // This prevents hitting AWS's 10,000 part limit on large exports
        let uploadStartMs: number | undefined;
        try {
          uploadStartMs = performance.now();

          await storageService.uploadFileBuffered({
            fileName: filePath,
            fileType: uploadContentType,
            data: fileStream,
            partSizeBytes: 100 * 1024 * 1024, // 100 MB part size
          });
          // Record at the upload boundary so a throw in the `finally` below
          // can't miscount a real success as a failure.
          uploadSucceeded = true;
          recordIncrement(BLOB_TABLE_EXPORT_METRIC, 1, {
            outcome: "success" satisfies BlobTableExportOutcome,
            table: config.table,
            projectId: config.projectId,
          });

          // Passthrough skips parse-time exception detection, so confirm the
          // ClickHouse query finished cleanly (and read its row count) before
          // treating the uploaded object as valid. The object is already
          // committed at this point, so if verification fails (query errored, or
          // query_log is unreadable) delete it: the deterministic filename is
          // only overwritten on retry in catch-up mode, not when caught up, so
          // a corrupt object could otherwise linger as an orphan.
          if (passthroughEligible && passthroughQueryId) {
            try {
              passthroughRows = await verifyRawPassthroughCompletion(
                passthroughQueryId,
                config.table,
                passthroughQueryStartedAt ?? new Date(),
              );
            } catch (verifyError) {
              await deletePotentiallyCorruptExport(storageService, filePath);
              throw verifyError;
            }
          }

          // On passthrough the count comes from query_log; "unknown" (count not
          // yet flushed) is distinct from a genuinely empty export.
          const rows = passthroughEligible
            ? (passthroughRows ?? "unknown")
            : sourceStats.rows;

          logger.info(
            `[BLOB INTEGRATION] Successfully exported ${config.table} for project ${config.projectId}: ` +
              `jobId=${config.bullmqJobId} attemptsMade=${config.bullmqAttemptsMade} host=${WORKER_HOST_ID} ` +
              `path=${passthroughEligible ? "passthrough" : "standard"} ` +
              `rows=${rows} sourceWaitMs=${Math.round(sourceStats.sourceWaitMs)} ` +
              `serializedBytes=${serializedCounter.bytes} uploadDurationMs=${Math.round(performance.now() - uploadStartMs)}`,
          );
        } finally {
          // Omit blob.rows on the passthrough path when the count is unknown
          // (query_log not yet flushed, or verification failed) so observability
          // can tell "unknown" apart from a genuinely empty export.
          if (passthroughEligible) {
            if (passthroughRows !== undefined) {
              span.setAttribute("blob.rows", passthroughRows);
            }
          } else {
            span.setAttribute("blob.rows", sourceStats.rows);
          }
          // sourceWaitMs is a per-row JS metric; not meaningful for passthrough.
          if (!passthroughEligible) {
            span.setAttribute(
              "blob.sourceWaitMs",
              Math.round(sourceStats.sourceWaitMs),
            );
          }
          span.setAttribute("blob.serializedBytes", serializedCounter.bytes);
          if (uploadStartMs !== undefined) {
            span.setAttribute(
              "blob.uploadDurationMs",
              Math.round(performance.now() - uploadStartMs),
            );
          }
          if (compressedCounter) {
            span.setAttribute("blob.compressedBytes", compressedCounter.bytes);
          }
        }
      } catch (error) {
        // Skip if `success` already fired (a later step threw post-upload).
        if (!uploadSucceeded) {
          recordIncrement(BLOB_TABLE_EXPORT_METRIC, 1, {
            outcome: "failure" satisfies BlobTableExportOutcome,
            table: config.table,
            projectId: config.projectId,
          });
        }
        logger.error(
          `[BLOB INTEGRATION] Error exporting ${config.table} for project ${config.projectId} ` +
            `(jobId=${config.bullmqJobId} attemptsMade=${config.bullmqAttemptsMade} host=${WORKER_HOST_ID})`,
          error,
        );
        throw error;
      } finally {
        unregisterInFlightBlobExport(inFlightHandle);

        // ns → ms; the histogram yields NaN/Infinity with zero samples.
        eventLoopDelay.disable();
        const toFiniteMs = (ns: number): number =>
          Number.isFinite(ns) ? ns / 1e6 : 0;
        const maxMs = toFiniteMs(eventLoopDelay.max);
        const p99Ms = toFiniteMs(eventLoopDelay.percentile(99));
        const meanMs = toFiniteMs(eventLoopDelay.mean);
        const delayTags = { table: config.table, unit: "milliseconds" };
        recordGauge(
          "langfuse.blobstorage.event_loop_delay.max",
          maxMs,
          delayTags,
        );
        recordGauge(
          "langfuse.blobstorage.event_loop_delay.p99",
          p99Ms,
          delayTags,
        );
        span.setAttribute("blob.eventLoopDelay.maxMs", Math.round(maxMs));
        span.setAttribute("blob.eventLoopDelay.p99Ms", Math.round(p99Ms));
        span.setAttribute("blob.eventLoopDelay.meanMs", Math.round(meanMs));
      }
    },
  );
};

export const handleBlobStorageIntegrationProjectJob = async (
  job: Job<TQueueJobTypes[QueueName.BlobStorageIntegrationProcessingQueue]>,
) => {
  const {
    projectId,
    isManualRun,
    originalNextSyncAt: rawOriginalNextSyncAt,
  } = job.data.payload;
  // BullMQ JSON-serializes Date → string; coerce back so comparisons work.
  const originalNextSyncAt = rawOriginalNextSyncAt
    ? new Date(rawOriginalNextSyncAt as unknown as string)
    : null;

  const span = getCurrentSpan();
  if (span) {
    span.setAttribute("messaging.bullmq.job.input.jobId", job.data.id);
    span.setAttribute("messaging.bullmq.job.input.projectId", projectId);
    // BullMQ job id (distinct from the payload id above) + attempt count.
    if (job.id !== undefined) {
      span.setAttribute("messaging.bullmq.job.id", job.id);
    }
    span.setAttribute("job.attemptsMade", job.attemptsMade);
    span.setAttribute("host.name", WORKER_HOST_ID);
  }

  logger.info(
    `[BLOB INTEGRATION] Processing blob storage integration for project ${projectId}`,
  );

  const blobStorageIntegration = await prisma.blobStorageIntegration.findUnique(
    {
      where: {
        projectId,
      },
    },
  );

  if (!blobStorageIntegration) {
    logger.warn(
      `[BLOB INTEGRATION] Blob storage integration not found for project ${projectId}`,
    );
    return;
  }
  if (!blobStorageIntegration.enabled) {
    logger.info(
      `[BLOB INTEGRATION] Blob storage integration is disabled for project ${projectId}`,
    );
    await prisma.blobStorageIntegration.updateMany({
      where: { projectId, runStartedAt: { not: null } },
      data: { runStartedAt: null },
    });
    return;
  }

  try {
    // Sync between lastSyncAt and now - BLOB_STORAGE_LAG_BUFFER_MS (20 minutes)
    // Cap the export to one frequency period to enable chunked historic exports
    const minTimestamp = await getMinTimestampForExport(
      projectId,
      blobStorageIntegration.lastSyncAt,
      blobStorageIntegration.exportMode,
      blobStorageIntegration.exportStartDate,
    );

    const now = new Date();
    const frequencyIntervalMs = getFrequencyIntervalMs(
      blobStorageIntegration.exportFrequency,
    );

    // No data in ClickHouse yet — schedule a retry without advancing lastSyncAt
    // so the next tick re-queries and picks up any late-arriving traces.
    if (minTimestamp === null) {
      logger.info(
        `[BLOB INTEGRATION] No data found for project ${projectId}, scheduling retry`,
      );
      await prisma.blobStorageIntegration.update({
        where: { projectId },
        data: {
          runStartedAt: null,
          lastError: null,
          lastErrorAt: null,
          nextSyncAt: new Date(now.getTime() + frequencyIntervalMs),
        },
      });
      return;
    }

    logger.info(
      `[BLOB INTEGRATION] Calculated minTimestamp for project ${projectId}: ${minTimestamp}, isValid: ${!isNaN(minTimestamp.getTime())}, getTime: ${minTimestamp.getTime()}, exportMode: ${blobStorageIntegration.exportMode}, lastSyncAt: ${blobStorageIntegration.lastSyncAt}, exportStartDate: ${blobStorageIntegration.exportStartDate}`,
    );

    const uncappedMaxTimestamp = new Date(
      now.getTime() - BLOB_STORAGE_LAG_BUFFER_MS,
    );

    // Cap maxTimestamp to one frequency period ahead of minTimestamp
    // This ensures large historic exports are broken into manageable chunks
    const maxTimestamp = new Date(
      Math.min(
        minTimestamp.getTime() + frequencyIntervalMs,
        uncappedMaxTimestamp.getTime(),
      ),
    );

    logger.info(
      `[BLOB INTEGRATION] Calculated maxTimestamp for project ${projectId}: ${maxTimestamp}, isValid: ${!isNaN(maxTimestamp.getTime())}, getTime: ${maxTimestamp.getTime()}, frequencyIntervalMs: ${frequencyIntervalMs}`,
    );

    // Skip export if the time window is empty or invalid.
    // Advance lastSyncAt so a never-synced integration leaves "idle" state,
    // floored at existing progress or minTimestamp (respects exportStartDate).
    // When exportStartDate is still in the future, don't advance lastSyncAt —
    // the integration hasn't started yet and getMinTimestampForExport must
    // continue returning exportStartDate on the next run.
    // Base nextSyncAt on `now` so 20-min frequency — where lag buffer ==
    // frequency interval — lands in the future.
    if (minTimestamp >= maxTimestamp) {
      logger.info(
        `[BLOB INTEGRATION] Skipping export for project ${projectId}: time window is empty (min: ${minTimestamp.toISOString()}, max: ${maxTimestamp.toISOString()})`,
      );
      const shouldAdvanceLastSyncAt = minTimestamp.getTime() <= now.getTime();
      await prisma.blobStorageIntegration.update({
        where: { projectId },
        data: {
          runStartedAt: null,
          lastError: null,
          lastErrorAt: null,
          ...(shouldAdvanceLastSyncAt && {
            lastSyncAt: new Date(
              Math.min(
                Math.max(
                  (blobStorageIntegration.lastSyncAt ?? minTimestamp).getTime(),
                  uncappedMaxTimestamp.getTime(),
                ),
                now.getTime(),
              ),
            ),
          }),
          nextSyncAt: new Date(now.getTime() + frequencyIntervalMs),
        },
      });
      return;
    }

    await prisma.blobStorageIntegration.update({
      where: { projectId },
      data: { runStartedAt: new Date(), lastError: null, lastErrorAt: null },
    });

    // Fail loudly rather than export from unpopulated tables when an enriched
    // source survives on a deployment without the enriched path, e.g. after a
    // V4-preview rollback. The catch persists lastError and notifies admins
    // (LFE-10296).
    if (
      isEnrichedBlobExportSource(blobStorageIntegration.exportSource) &&
      !isEnrichedBlobExportAvailable(
        Boolean(env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION),
        v4AllowPreviewOptIn(env),
      )
    ) {
      throw new Error(
        "The configured export source includes enriched observations, but enriched export is not available on this deployment. Select a different export source in the blob storage integration settings, or re-enable enriched export (V4 preview opt-in) on this deployment.",
      );
    }

    // Preflight the persisted integration endpoint once per job inside the
    // export error path. StorageService connection-time validation remains the
    // DNS-rebinding defense for each SDK connection.
    if (blobStorageIntegration.endpoint) {
      await validateBlobStorageEndpoint(blobStorageIntegration.endpoint);
    }

    // Process the export based on the integration configuration
    // Convert v4 (events table) latency/time_to_first_token from ms to seconds
    // for integrations created on or after 2026-04-01. Before this date, v4 blob
    // export returned these fields in milliseconds. We preserve that behavior for
    // existing integrations to avoid silently breaking their pipelines.
    const convertV4LatencyToSeconds =
      blobStorageIntegration.createdAt >= new Date("2026-04-01T00:00:00Z");

    // Per-project export tuning (set via DB directly; no UI/tRPC write path).
    // Malformed/absent column resolves to defaults — never throws.
    const { resolved: exportTuning, warnings: exportTuningWarnings } =
      resolveBlobExportTuning(blobStorageIntegration.exportTuning);
    for (const warning of exportTuningWarnings) {
      logger.warn(
        `[BLOB INTEGRATION] exportTuning for project ${projectId}: ${warning}`,
      );
    }

    const executionConfig = {
      projectId,
      minTimestamp,
      maxTimestamp,
      bucketName: blobStorageIntegration.bucketName,
      endpoint: blobStorageIntegration.endpoint,
      region: blobStorageIntegration.region || "auto",
      accessKeyId: blobStorageIntegration.accessKeyId || undefined,
      secretAccessKey: blobStorageIntegration.secretAccessKey
        ? decrypt(blobStorageIntegration.secretAccessKey)
        : undefined,
      prefix: blobStorageIntegration.prefix || undefined,
      forcePathStyle: blobStorageIntegration.forcePathStyle || undefined,
      type: blobStorageIntegration.type,
      fileType: blobStorageIntegration.fileType,
      compressed: blobStorageIntegration.compressed,
      convertV4LatencyToSeconds,
      exportFieldGroups:
        blobStorageIntegration.exportFieldGroups as ObservationFieldGroupFull[],
      rawPassthrough: exportTuning.rawPassthrough,
      bullmqJobId: job.id,
      bullmqAttemptsMade: job.attemptsMade,
    };

    // Check if this project should only export traces (legacy behavior via env var)
    const isTraceOnlyProject =
      env.LANGFUSE_BLOB_STORAGE_EXPORT_TRACE_ONLY_PROJECT_IDS.includes(
        projectId,
      );

    // Warn once per run if rawPassthrough is enabled but no table will actually
    // use it. Passthrough only applies to JSONL exports of observations /
    // observations_v2; every non-trace-only export source includes one of those,
    // so the only integration-level ineligibility is a non-JSONL file type or a
    // trace-only project. The per-table fallback for scores/traces is expected
    // dispatch and is intentionally not warned about (avoids ~hourly log noise).
    if (
      exportTuning.rawPassthrough &&
      (blobStorageIntegration.fileType !==
        BlobStorageIntegrationFileType.JSONL ||
        isTraceOnlyProject)
    ) {
      logger.warn(
        `[BLOB INTEGRATION] rawPassthrough enabled for project ${projectId} but no eligible table will use it ` +
          `(fileType=${blobStorageIntegration.fileType}, traceOnly=${isTraceOnlyProject}); exporting via the standard path. ` +
          `Passthrough requires JSONL output of observations or observations_v2.`,
      );
    }

    if (isTraceOnlyProject) {
      // Only process traces table for projects in the trace-only list (legacy behavior)
      logger.info(
        `[BLOB INTEGRATION] Project ${projectId} is configured for trace-only export via env var, skipping observations, scores, and events`,
      );
      await processBlobStorageExport({ ...executionConfig, table: "traces" });
    } else {
      // Process tables based on exportSource setting
      const processPromises: Promise<void>[] = [];

      // Always include scores
      processPromises.push(
        processBlobStorageExport({ ...executionConfig, table: "scores" }),
      );

      // Traces and observations - for TRACES_OBSERVATIONS and TRACES_OBSERVATIONS_EVENTS
      if (
        blobStorageIntegration.exportSource === "TRACES_OBSERVATIONS" ||
        blobStorageIntegration.exportSource === "TRACES_OBSERVATIONS_EVENTS"
      ) {
        processPromises.push(
          processBlobStorageExport({ ...executionConfig, table: "traces" }),
          processBlobStorageExport({
            ...executionConfig,
            table: "observations",
          }),
        );
      }

      // Events - for EVENTS and TRACES_OBSERVATIONS_EVENTS
      // events are stored in the observations_v2 directory in blob storage
      if (
        blobStorageIntegration.exportSource === "EVENTS" ||
        blobStorageIntegration.exportSource === "TRACES_OBSERVATIONS_EVENTS"
      ) {
        processPromises.push(
          processBlobStorageExport({
            ...executionConfig,
            table: "observations_v2",
          }),
        );
      }

      await Promise.all(processPromises);
    }

    // Determine if we've caught up with present-day data
    const caughtUp = maxTimestamp.getTime() >= uncappedMaxTimestamp.getTime();

    let nextSyncAt: Date;
    if (caughtUp) {
      // Normal mode: base on `now` so 20-min frequency (where lag buffer ==
      // frequency interval) lands in the future instead of ≈ now.
      nextSyncAt = new Date(now.getTime() + frequencyIntervalMs);
      logger.info(
        `[BLOB INTEGRATION] Caught up with exports for project ${projectId}. Next sync at ${nextSyncAt.toISOString()}`,
      );
    } else {
      // Catch-up mode: schedule next chunk immediately
      nextSyncAt = new Date();
      logger.info(
        `[BLOB INTEGRATION] Still catching up for project ${projectId}. Scheduling next chunk immediately (processed up to ${maxTimestamp.toISOString()})`,
      );
    }

    // Update integration after successful processing. Use updateMany with a
    // CAS guard on updatedAt so a mid-run Save (e.g. mode change resetting
    // lastSyncAt) is not silently overwritten by the stale snapshot.
    const { count: successUpdateCount } =
      await prisma.blobStorageIntegration.updateMany({
        where: {
          projectId,
          updatedAt: blobStorageIntegration.updatedAt,
        },
        data: {
          lastSyncAt: maxTimestamp,
          nextSyncAt,
          lastError: null,
          lastErrorAt: null,
          runStartedAt: null,
        },
      });
    if (successUpdateCount === 0) {
      logger.info(
        `[BLOB INTEGRATION] Row modified during run for project ${projectId} — skipping override of lastSyncAt`,
      );
    }

    // If still catching up, immediately queue the next chunk job.
    // Wrapped in its own try/catch: the chunk already committed successfully
    // (lastSyncAt advanced, data in S3), so an enqueue failure is transient —
    // nextSyncAt=now lets the scheduler self-recover on its next tick.
    if (!caughtUp) {
      try {
        const queue = BlobStorageIntegrationProcessingQueue.getInstance();
        if (queue) {
          const jobId = `${projectId}-${maxTimestamp.toISOString()}`;
          await queue.add(
            QueueJobs.BlobStorageIntegrationProcessingJob,
            {
              id: randomUUID(),
              name: QueueJobs.BlobStorageIntegrationProcessingJob,
              timestamp: new Date(),
              payload: { projectId },
            },
            { jobId, removeOnFail: true },
          );
          logger.info(
            `[BLOB INTEGRATION] Queued next catch-up chunk for project ${projectId} with jobId ${jobId}`,
          );
        }
      } catch (enqueueError) {
        logger.warn(
          `[BLOB INTEGRATION] Failed to enqueue next catch-up chunk for project ${projectId}; scheduler will retry on next tick`,
          enqueueError instanceof Error
            ? { message: enqueueError.message }
            : {},
        );
      }
    }

    logger.info(
      `[BLOB INTEGRATION] Successfully processed blob storage integration for project ${projectId}`,
    );
  } catch (error) {
    const errorMessage = extractStorageErrorMessage(error);

    const FALLBACK_FREQUENCY_MS = 24 * 60 * 60 * 1000;
    let failFrequencyMs: number;
    try {
      failFrequencyMs = getFrequencyIntervalMs(
        blobStorageIntegration.exportFrequency,
      );
    } catch {
      failFrequencyMs = FALLBACK_FREQUENCY_MS;
    }

    try {
      await prisma.blobStorageIntegration.update({
        where: { projectId },
        data: {
          lastError: errorMessage,
          lastErrorAt: new Date(),
          runStartedAt: null,
          ...((isManualRun || !blobStorageIntegration.lastSyncAt) && {
            nextSyncAt:
              originalNextSyncAt && originalNextSyncAt > new Date()
                ? originalNextSyncAt
                : new Date(Date.now() + failFrequencyMs),
          }),
        },
      });
    } catch (persistError) {
      logger.error(
        `[BLOB INTEGRATION] Failed to persist blob storage error for project ${projectId}`,
        persistError,
      );
    }

    notifyBlobStorageExportFailedInBackground(projectId);

    const chain = formatErrorChain(error);
    logger.error(
      `[BLOB INTEGRATION] Error processing blob storage integration for project ${projectId}: ${chain}`,
      error instanceof Error ? { stack: error.stack } : {},
    );
    const rethrown = new Error(chain, { cause: error });
    // Copy the original stack so BullMQ and the queue processor see the real
    // failure site rather than this rethrow line. rethrown.stack starts with
    // the original error's message, which won't match rethrown.message (the
    // full chain), but structured loggers record them as separate fields.
    if (error instanceof Error) rethrown.stack = error.stack;
    throw rethrown;
  }
};

function notifyBlobStorageExportFailedInBackground(projectId: string): void {
  (async () => {
    try {
      const cooldownMs =
        env.LANGFUSE_BLOB_STORAGE_FAILURE_NOTIFICATION_COOLDOWN_HOURS *
        60 *
        60 *
        1000;

      // Atomic claim: set timestamp before sending to prevent duplicate emails on concurrent retries.
      // If the email send subsequently fails, the cooldown still applies — the next failure
      // after cooldown expiry will retry the notification.
      const claimed = await prisma.blobStorageIntegration.updateMany({
        where: {
          projectId,
          OR: [
            { lastFailureNotificationSentAt: null },
            {
              lastFailureNotificationSentAt: {
                lt: new Date(Date.now() - cooldownMs),
              },
            },
          ],
        },
        data: { lastFailureNotificationSentAt: new Date() },
      });

      if (claimed.count === 0) {
        logger.info(
          `[BLOB INTEGRATION] Skipping failure notification for project ${projectId}, cooldown still active`,
        );
        return;
      }

      const emailEnv = {
        EMAIL_FROM_ADDRESS: env.EMAIL_FROM_ADDRESS,
        SMTP_CONNECTION_URL: env.SMTP_CONNECTION_URL,
        NEXTAUTH_URL: env.NEXTAUTH_URL,
        CLOUD_CRM_EMAIL: env.CLOUD_CRM_EMAIL,
      };

      if (
        !emailEnv.EMAIL_FROM_ADDRESS ||
        !emailEnv.SMTP_CONNECTION_URL ||
        !emailEnv.NEXTAUTH_URL
      ) {
        return;
      }

      const [adminEmails, project] = await Promise.all([
        getProjectAdminEmails(projectId),
        prisma.project.findUnique({
          where: { id: projectId },
          select: { name: true },
        }),
      ]);

      if (adminEmails.length === 0) {
        return;
      }

      const projectName = project?.name ?? projectId;
      const settingsUrl = `${emailEnv.NEXTAUTH_URL}/project/${projectId}/settings/integrations/blobstorage`;

      await sendBlobStorageExportFailedEmail({
        env: emailEnv,
        projectName,
        settingsUrl,
        receiverEmails: adminEmails,
      });
    } catch (error) {
      logger.error(
        `[BLOB INTEGRATION] Failed to send failure notification for project ${projectId}`,
        error,
      );
    }
  })();
}

function extractStorageErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) return String(error).slice(0, 1000);

  // handleStorageError wraps SDK errors via { cause: sdkError }
  // Unwrap to get the raw SDK message (S3/Azure/GCS)
  const cause = error.cause;
  if (cause instanceof Error) {
    return cause.message.slice(0, 1000);
  }

  // Fallback: ClickHouse errors or other non-wrapped errors
  return error.message.slice(0, 1000);
}

function formatErrorChain(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const parts: string[] = [];
  let current: unknown = error;
  while (current instanceof Error) {
    parts.push(current.message);
    current = current.cause;
  }
  return parts.join(" caused by ");
}
