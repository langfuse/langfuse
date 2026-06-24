import { pipeline, Transform, type Readable } from "stream";
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
  recordHistogram,
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
} from "@langfuse/shared/src/server";
import {
  registerInFlightBlobExport,
  unregisterInFlightBlobExport,
  BLOB_TABLE_EXPORT_METRIC,
  type BlobTableExportOutcome,
} from "./inFlightExports";
import { TimedGzip, ZLIB_DEFAULT_LEVEL, type GzipStats } from "./gzipStream";
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
  DEFAULT_BLOB_EXPORT_PART_SIZE_BYTES,
} from "@langfuse/shared";
import { decrypt } from "@langfuse/shared/encryption";
// Shared env for the buffered-upload flag (gates part-level upload stats).
import { env as sharedEnv } from "@langfuse/shared/src/env";
import { randomUUID } from "crypto";
import { SpanKind } from "@opentelemetry/api";
import { env, v4AllowPreviewOptIn } from "../../env";

export const BlobExportFormat = {
  JSON_RAW: "json-raw",
  JSON_GZIP: "json-gzip",
  CSV_RAW: "csv-raw",
  CSV_GZIP: "csv-gzip",
  JSONL_RAW: "jsonl-raw",
  JSONL_GZIP: "jsonl-gzip",
} as const;
export type BlobExportFormat =
  (typeof BlobExportFormat)[keyof typeof BlobExportFormat];

const FORMAT_LOOKUP: Record<
  BlobStorageIntegrationFileType,
  { raw: BlobExportFormat; gzip: BlobExportFormat }
> = {
  [BlobStorageIntegrationFileType.JSON]: {
    raw: BlobExportFormat.JSON_RAW,
    gzip: BlobExportFormat.JSON_GZIP,
  },
  [BlobStorageIntegrationFileType.CSV]: {
    raw: BlobExportFormat.CSV_RAW,
    gzip: BlobExportFormat.CSV_GZIP,
  },
  [BlobStorageIntegrationFileType.JSONL]: {
    raw: BlobExportFormat.JSONL_RAW,
    gzip: BlobExportFormat.JSONL_GZIP,
  },
};

function resolveBlobExportFormat(
  fileType: BlobStorageIntegrationFileType,
  compressed: boolean,
): BlobExportFormat {
  const entry = FORMAT_LOOKUP[fileType];
  return compressed ? entry.gzip : entry.raw;
}

export const BLOB_STORAGE_LAG_BUFFER_MS = 20 * 60 * 1000; // 20-minute lag buffer

export async function* enrichObservationStream(
  stream: AsyncGenerator<Record<string, unknown>>,
  projectId: string,
  modelIdField: string,
  convertLatencyToSeconds: boolean,
  fieldGroups?: ObservationFieldGroupFull[],
  skipEnrichment = false,
): AsyncGenerator<Record<string, unknown>> {
  const { getModel } = createModelCache(projectId);

  // skipEnrichment drops only the model-price lookup; latency + metadata cleanup still run.
  const includeModelId =
    !skipEnrichment && (!fieldGroups || fieldGroups.includes("model"));

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
): Promise<Date> => {
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

        // If no data exists, use current time as a fallback
        logger.info(
          `[BLOB INTEGRATION] No historical data found for project ${projectId}, using current time`,
        );
        return new Date(0);
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

// Appends a newline to each raw JSONEachRow line and emits it as bytes, so the
// passthrough path produces the same JSONL framing as the standard formatter
// without re-serializing (the line is already JSON from ClickHouse).
const createRawJsonlNewlineTransform = (): Transform =>
  new Transform({
    writableObjectMode: true,
    transform(line: string, _encoding, callback) {
      callback(null, Buffer.from(line + "\n"));
    },
  });

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
  // zlib level for the gzip step; undefined => zlib default (6). Only relevant
  // when `compressed` is true.
  gzipLevel: number | undefined;
  convertV4LatencyToSeconds: boolean;
  exportFieldGroups?: ObservationFieldGroupFull[];
  rawPassthrough: boolean;
  // undefined concurrency/attempts => backend keeps its native default.
  partSizeBytes: number;
  maxConcurrentParts: number | undefined;
  maxPartAttempts: number | undefined;
  skipEnrichment: boolean;
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

      // Resolved per-project tuning. Concurrency/attempts omitted when unset
      // (no single value — the backend default applies).
      span.setAttribute("blob.config.partSizeBytes", config.partSizeBytes);
      if (config.maxConcurrentParts !== undefined) {
        span.setAttribute(
          "blob.config.maxConcurrentParts",
          config.maxConcurrentParts,
        );
      }
      if (config.maxPartAttempts !== undefined) {
        span.setAttribute(
          "blob.config.maxPartAttempts",
          config.maxPartAttempts,
        );
      }
      span.setAttribute("blob.config.skipEnrichment", config.skipEnrichment);
      span.setAttribute("blob.config.rawPassthrough", config.rawPassthrough);

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
      let heartbeat: ReturnType<typeof setInterval> | undefined;

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
        // Paired with compressedCounter: both exist iff compression is on.
        const gzipStats: GzipStats | null = compressedCounter
          ? {
              level: config.gzipLevel ?? ZLIB_DEFAULT_LEVEL,
              activeMs: 0,
              backpressureMs: 0,
            }
          : null;

        // Both paths tally rows in JS via countedStream (the passthrough yields
        // raw row text rather than parsed objects, but still iterates).
        const sourceStats = { rows: 0, sourceWaitMs: 0 };
        // When enrichment is active, chStats isolates ClickHouse read wait from
        // enrichment CPU. enrichMs = sourceStats.sourceWaitMs - chStats.sourceWaitMs.
        let chStats: { rows: number; sourceWaitMs: number } | null = null;

        const HEARTBEAT_INTERVAL_MS = 5 * 60 * 1000;
        const heartbeatTags = {
          table: config.table,
          projectId: config.projectId,
        };
        heartbeat = setInterval(() => {
          recordGauge(
            "langfuse.blobstorage.export_heartbeat.rows",
            sourceStats.rows,
            heartbeatTags,
          );
          recordGauge(
            "langfuse.blobstorage.export_heartbeat.serialized_bytes",
            serializedCounter.bytes,
            heartbeatTags,
          );
        }, HEARTBEAT_INTERVAL_MS);

        let fileStream: Readable;

        if (passthroughEligible) {
          // Stream ClickHouse JSONEachRow row text straight through: skip the
          // per-row JSON.parse, enrichment, and re-serialize. Shaping (latency→s,
          // dropped price columns, field-group selection) is baked into the SQL.
          // The client's own mid-stream exception detection (CH ≥ 25.11) errors
          // the stream on a failed query, which aborts the upload — no committed
          // object and no out-of-band system.query_log check needed.
          const rawRows =
            config.table === "observations"
              ? getObservationsForBlobStorageExportRaw(
                  config.projectId,
                  config.minTimestamp,
                  config.maxTimestamp,
                  exportFieldGroups,
                )
              : getEventsForBlobStorageExportRaw(
                  config.projectId,
                  config.minTimestamp,
                  config.maxTimestamp,
                  exportFieldGroups,
                  config.convertV4LatencyToSeconds,
                );

          const dataStream = countedStream(rawRows, sourceStats);
          const jsonlNewline = createRawJsonlNewlineTransform();

          fileStream =
            compressedCounter && gzipStats
              ? pipeline(
                  dataStream,
                  jsonlNewline,
                  serializedCounter,
                  new TimedGzip(config.gzipLevel, gzipStats),
                  compressedCounter,
                  pipelineCallback,
                )
              : pipeline(
                  dataStream,
                  jsonlNewline,
                  serializedCounter,
                  pipelineCallback,
                );
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
              chStats = { rows: 0, sourceWaitMs: 0 };
              rawStream = enrichObservationStream(
                countedStream(
                  getObservationsForBlobStorageExport(
                    config.projectId,
                    config.minTimestamp,
                    config.maxTimestamp,
                    exportFieldGroups,
                  ),
                  chStats,
                ),
                config.projectId,
                "model_id",
                false, // v3 query already returns latency in seconds
                exportFieldGroups,
                config.skipEnrichment,
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
              chStats = { rows: 0, sourceWaitMs: 0 };
              rawStream = enrichObservationStream(
                countedStream(
                  getEventsForBlobStorageExport(
                    config.projectId,
                    config.minTimestamp,
                    config.maxTimestamp,
                    exportFieldGroups,
                  ),
                  chStats,
                ),
                config.projectId,
                "model_id",
                config.convertV4LatencyToSeconds,
                exportFieldGroups,
                config.skipEnrichment,
              );
              break;
            default:
              throw new Error(`Unsupported table type: ${config.table}`);
          }

          const dataStream = countedStream(rawStream, sourceStats);
          const formatTransform = streamTransformations[config.fileType]();

          fileStream =
            compressedCounter && gzipStats
              ? pipeline(
                  dataStream,
                  formatTransform,
                  serializedCounter,
                  new TimedGzip(config.gzipLevel, gzipStats),
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
        // Mutable sink the uploader fills live (readable even if upload throws).
        // Only the S3 buffered path populates it; producesUploadStats gates the
        // telemetry so other paths don't report zero-part uploads.
        const uploadStats = {
          partsUploaded: 0,
          partRetries: 0,
          partFailures: 0,
        };
        const producesUploadStats =
          config.type !== BlobStorageIntegrationType.AZURE_BLOB_STORAGE &&
          sharedEnv.LANGFUSE_S3_UPLOAD_ENABLE_BUFFERED === "true";
        let uploadStartMs: number | undefined;
        let uploadDurationMsFinal: number | undefined;
        try {
          uploadStartMs = performance.now();

          await storageService.uploadFileBuffered({
            fileName: filePath,
            fileType: uploadContentType,
            data: fileStream,
            partSizeBytes: config.partSizeBytes,
            maxConcurrentParts: config.maxConcurrentParts,
            maxPartAttempts: config.maxPartAttempts,
            stats: uploadStats,
          });
          // Record at the upload boundary so a throw in the `finally` below
          // can't miscount a real success as a failure.
          uploadSucceeded = true;
          uploadDurationMsFinal = Math.round(performance.now() - uploadStartMs);
          recordIncrement(BLOB_TABLE_EXPORT_METRIC, 1, {
            outcome: "success" satisfies BlobTableExportOutcome,
            table: config.table,
            projectId: config.projectId,
          });

          const exportFormat = resolveBlobExportFormat(
            config.fileType,
            config.compressed,
          );
          const byteTags = {
            table: config.table,
            projectId: config.projectId,
            path: passthroughEligible ? "passthrough" : "standard",
            source: exportFormat,
          };
          recordIncrement(
            "langfuse.blob_export.serialized_bytes",
            serializedCounter.bytes,
            byteTags,
          );
          if (compressedCounter && gzipStats) {
            recordIncrement(
              "langfuse.blob_export.compressed_bytes",
              compressedCounter.bytes,
              { ...byteTags, gzipLevel: gzipStats.level },
            );
          }

          const uploadDurationMs = uploadDurationMsFinal;
          const chReadMs = Math.round(
            chStats ? chStats.sourceWaitMs : sourceStats.sourceWaitMs,
          );
          const enrichMs = chStats
            ? Math.max(
                0,
                Math.round(sourceStats.sourceWaitMs - chStats.sourceWaitMs),
              )
            : 0;
          const gzipCpuMs = gzipStats
            ? Math.max(
                0,
                Math.round(gzipStats.activeMs - gzipStats.backpressureMs),
              )
            : 0;
          const uploadWaitMs = gzipStats
            ? Math.round(gzipStats.backpressureMs)
            : Math.max(0, uploadDurationMs - chReadMs - enrichMs);

          logger.info(
            `[BLOB INTEGRATION] Successfully exported ${config.table} for project ${config.projectId}: ` +
              `jobId=${config.bullmqJobId} attemptsMade=${config.bullmqAttemptsMade} host=${WORKER_HOST_ID} ` +
              `path=${passthroughEligible ? "passthrough" : "standard"} ` +
              `rows=${sourceStats.rows} chReadMs=${chReadMs} enrichMs=${enrichMs} ` +
              `gzipCpuMs=${gzipCpuMs} uploadWaitMs=${uploadWaitMs} ` +
              `serializedBytes=${serializedCounter.bytes} uploadDurationMs=${uploadDurationMs} ` +
              // "configured*" = resolved tuning, not necessarily what the backend
              // applied; uploadParts/Retries/Failures below are the actual effects.
              `configuredPartSizeBytes=${config.partSizeBytes} configuredMaxConcurrentParts=${config.maxConcurrentParts ?? "default"} ` +
              `configuredMaxPartAttempts=${config.maxPartAttempts ?? "default"} skipEnrichment=${config.skipEnrichment}` +
              (producesUploadStats
                ? ` uploadParts=${uploadStats.partsUploaded} uploadRetries=${uploadStats.partRetries} uploadFailures=${uploadStats.partFailures}`
                : "") +
              (gzipStats && compressedCounter
                ? ` gzipLevel=${gzipStats.level} compressedBytes=${compressedCounter.bytes}`
                : ""),
          );
        } finally {
          span.setAttribute("blob.rows", sourceStats.rows);
          const finalChReadMs = Math.round(
            chStats ? chStats.sourceWaitMs : sourceStats.sourceWaitMs,
          );
          const finalEnrichMs = chStats
            ? Math.max(
                0,
                Math.round(sourceStats.sourceWaitMs - chStats.sourceWaitMs),
              )
            : 0;
          span.setAttribute("blob.chReadMs", finalChReadMs);
          span.setAttribute("blob.enrichMs", finalEnrichMs);
          span.setAttribute("blob.serializedBytes", serializedCounter.bytes);
          if (uploadStartMs !== undefined) {
            const totalUploadMs =
              uploadDurationMsFinal ??
              Math.round(performance.now() - uploadStartMs);
            span.setAttribute("blob.uploadDurationMs", totalUploadMs);
            if (uploadSucceeded) {
              const finalGzipCpuMs = gzipStats
                ? Math.max(
                    0,
                    Math.round(gzipStats.activeMs - gzipStats.backpressureMs),
                  )
                : 0;
              const finalUploadWaitMs = gzipStats
                ? Math.round(gzipStats.backpressureMs)
                : Math.max(0, totalUploadMs - finalChReadMs - finalEnrichMs);
              span.setAttribute("blob.gzipCpuMs", finalGzipCpuMs);
              span.setAttribute("blob.uploadWaitMs", finalUploadWaitMs);
              const finalExportFormat = resolveBlobExportFormat(
                config.fileType,
                config.compressed,
              );
              const stageTags = {
                table: config.table,
                path: passthroughEligible ? "passthrough" : "standard",
                source: finalExportFormat,
              };
              recordHistogram(
                "langfuse.blob_export.ch_read_ms",
                finalChReadMs,
                stageTags,
              );
              recordHistogram(
                "langfuse.blob_export.enrich_ms",
                finalEnrichMs,
                stageTags,
              );
              recordHistogram(
                "langfuse.blob_export.gzip_cpu_ms",
                finalGzipCpuMs,
                stageTags,
              );
              recordHistogram(
                "langfuse.blob_export.upload_wait_ms",
                finalUploadWaitMs,
                stageTags,
              );
            }
          }
          if (producesUploadStats) {
            span.setAttribute("blob.upload.parts", uploadStats.partsUploaded);
            span.setAttribute("blob.upload.retries", uploadStats.partRetries);
            span.setAttribute("blob.upload.failures", uploadStats.partFailures);
          }
          if (compressedCounter) {
            span.setAttribute("blob.compressedBytes", compressedCounter.bytes);
          }
          if (gzipStats && compressedCounter) {
            const activeMs = Math.round(gzipStats.activeMs);
            const ratio =
              compressedCounter.bytes > 0
                ? serializedCounter.bytes / compressedCounter.bytes
                : 0;
            const pureGzipMs = Math.max(
              0,
              gzipStats.activeMs - gzipStats.backpressureMs,
            );
            const throughputMbPerSec =
              pureGzipMs > 0
                ? serializedCounter.bytes / (pureGzipMs * 1000)
                : 0;

            span.setAttribute("blob.gzip.level", gzipStats.level);
            span.setAttribute("blob.gzip.activeMs", activeMs);
            span.setAttribute("blob.gzip.ratio", Number(ratio.toFixed(3)));
            span.setAttribute(
              "blob.gzip.throughputMbPerSec",
              Number(throughputMbPerSec.toFixed(2)),
            );

            const metricTags = {
              table: config.table,
              path: passthroughEligible ? "passthrough" : "standard",
              gzipLevel: gzipStats.level,
            };
            recordHistogram(
              "langfuse.blob_export.gzip.active_ms",
              activeMs,
              metricTags,
            );
            recordHistogram(
              "langfuse.blob_export.gzip.ratio",
              ratio,
              metricTags,
            );
            recordHistogram(
              "langfuse.blob_export.gzip.throughput_mb_per_sec",
              throughputMbPerSec,
              metricTags,
            );
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
        clearInterval(heartbeat);
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
  const { projectId } = job.data.payload;

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
    return;
  }

  // Sync between lastSyncAt and now - 30 minutes
  // Cap the export to one frequency period to enable chunked historic exports
  const minTimestamp = await getMinTimestampForExport(
    projectId,
    blobStorageIntegration.lastSyncAt,
    blobStorageIntegration.exportMode,
    blobStorageIntegration.exportStartDate,
  );

  logger.info(
    `[BLOB INTEGRATION] Calculated minTimestamp for project ${projectId}: ${minTimestamp}, isValid: ${!isNaN(minTimestamp.getTime())}, getTime: ${minTimestamp.getTime()}, exportMode: ${blobStorageIntegration.exportMode}, lastSyncAt: ${blobStorageIntegration.lastSyncAt}, exportStartDate: ${blobStorageIntegration.exportStartDate}`,
  );

  const now = new Date();
  const uncappedMaxTimestamp = new Date(
    now.getTime() - BLOB_STORAGE_LAG_BUFFER_MS,
  );
  const frequencyIntervalMs = getFrequencyIntervalMs(
    blobStorageIntegration.exportFrequency,
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

  // Skip export if the time window is empty or invalid
  if (minTimestamp >= maxTimestamp) {
    logger.info(
      `[BLOB INTEGRATION] Skipping export for project ${projectId}: time window is empty (min: ${minTimestamp.toISOString()}, max: ${maxTimestamp.toISOString()})`,
    );
    return;
  }

  try {
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
      resolveBlobExportTuning(blobStorageIntegration.exportTuning, {
        partSizeBytes: DEFAULT_BLOB_EXPORT_PART_SIZE_BYTES,
      });
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
      gzipLevel: exportTuning.gzipLevel,
      convertV4LatencyToSeconds,
      exportFieldGroups:
        blobStorageIntegration.exportFieldGroups as ObservationFieldGroupFull[],
      rawPassthrough: exportTuning.rawPassthrough,
      partSizeBytes: exportTuning.partSizeBytes,
      maxConcurrentParts: exportTuning.maxConcurrentParts,
      maxPartAttempts: exportTuning.maxPartAttempts,
      skipEnrichment: exportTuning.skipEnrichment,
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
      // Normal mode: schedule for the next frequency period
      nextSyncAt = new Date(maxTimestamp.getTime() + frequencyIntervalMs);
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

    // Update integration after successful processing
    await prisma.blobStorageIntegration.update({
      where: {
        projectId,
      },
      data: {
        lastSyncAt: maxTimestamp,
        nextSyncAt,
        lastError: null,
        lastErrorAt: null,
      },
    });

    // If still catching up, immediately queue the next chunk job
    if (!caughtUp) {
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
    }

    logger.info(
      `[BLOB INTEGRATION] Successfully processed blob storage integration for project ${projectId}`,
    );
  } catch (error) {
    const errorMessage = extractStorageErrorMessage(error);

    try {
      await prisma.blobStorageIntegration.update({
        where: { projectId },
        data: {
          lastError: errorMessage,
          lastErrorAt: new Date(),
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
  const message = cause instanceof Error ? cause.message : error.message;

  // GCS returns a <Details> XML element with the real rejection reason
  // (e.g. "Multipart upload is not supported in Rapid storage class.").
  // handleStorageError preserves it as an enumerable property.
  const errorDetails = (error as unknown as { Details?: unknown }).Details;
  const causeDetails = (cause as unknown as { Details?: unknown } | undefined)
    ?.Details;
  const details =
    typeof errorDetails === "string"
      ? errorDetails
      : typeof causeDetails === "string"
        ? causeDetails
        : undefined;

  const full = details ? `${message} Details: ${details}` : message;
  return full.slice(0, 1000);
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
