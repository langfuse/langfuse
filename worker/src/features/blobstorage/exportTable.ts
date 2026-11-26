// Exports one table for one window: streams ClickHouse rows through enrichment,
// formatting and optional gzip into a buffered upload to the customer bucket.

import { pipeline, Transform, type Readable } from "stream";
import { monitorEventLoopDelay } from "perf_hooks";
import {
  logger,
  StorageService,
  streamTransformations,
  getObservationsForBlobStorageExport,
  getObservationsForBlobStorageExportRaw,
  getObservationsForBlobStorageExportParquet,
  getTracesForBlobStorageExport,
  getTracesForBlobStorageExportParquet,
  getScoresForBlobStorageExport,
  getScoresForBlobStorageExportParquet,
  getEventsForBlobStorageExport,
  getEventsForBlobStorageExportRaw,
  getEventsForBlobStorageExportParquet,
  instrumentAsync,
  recordIncrement,
  enrichObservationWithModelData,
  createModelCache,
} from "@langfuse/shared/src/server";
import {
  registerInFlightBlobExport,
  unregisterInFlightBlobExport,
  getBlobExportShutdownSignal,
  BLOB_TABLE_EXPORT_METRIC,
  type BlobTableExportOutcome,
} from "./inFlightExports";
import {
  BlobExportAbortTracker,
  classifyBlobExportError,
} from "./abortClassification";
import { isSigtermReceived } from "../health";
import { TimedGzip, ZLIB_DEFAULT_LEVEL, type GzipStats } from "./gzipStream";
import { ByteCounter, TimedByteCounter } from "./byteCounters";
import { WORKER_HOST_ID } from "../../utils/hostId";
import {
  BlobStorageIntegrationType,
  BlobStorageIntegrationFileType,
  BatchExportFileFormat,
  OBSERVATION_FIELD_GROUPS_FULL,
  type ObservationFieldGroupFull,
  type ExportFieldGroup,
  getObservationFieldGroups,
  getScoreFieldGroups,
  getTraceFieldGroups,
} from "@langfuse/shared";
// Shared env for the buffered-upload flag (gates part-level upload stats).
import { env as sharedEnv } from "@langfuse/shared/src/env";
import { SpanKind } from "@opentelemetry/api";
import { recordExportVolume } from "../../services/exportVolumeMetric";
import {
  formatBlobExportTimestamp,
  type BlobExportManifestFile,
} from "./manifest";

const BlobExportFormat = {
  JSON_RAW: "json-raw",
  JSON_GZIP: "json-gzip",
  CSV_RAW: "csv-raw",
  CSV_GZIP: "csv-gzip",
  JSONL_RAW: "jsonl-raw",
  JSONL_GZIP: "jsonl-gzip",
  // ClickHouse-native columnar export; compression is internal to
  // Parquet, so there is no separate raw/gzip split.
  PARQUET: "parquet",
} as const;

type BlobExportFormat =
  (typeof BlobExportFormat)[keyof typeof BlobExportFormat];

// Text formats only; PARQUET is absent because callers branch on parquetEligible first.
const FORMAT_LOOKUP: Partial<
  Record<
    BlobStorageIntegrationFileType,
    { raw: BlobExportFormat; gzip: BlobExportFormat }
  >
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
  if (!entry) {
    throw new Error(`No text export format for file type: ${fileType}`);
  }
  return compressed ? entry.gzip : entry.raw;
}

/** @internal */
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
    case BlobStorageIntegrationFileType.PARQUET:
      return {
        contentType: "application/vnd.apache.parquet",
        extension: "parquet",
      };
    default:
      // eslint-disable-next-line no-case-declarations
      const _exhaustiveCheck: never = fileType;
      throw new Error(`Unsupported file type: ${fileType}`);
  }
};

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

export const processBlobStorageExport = async (config: {
  projectId: string;
  minTimestamp: Date;
  maxTimestamp: Date;
  storageService: StorageService;
  prefix?: string;
  type: BlobStorageIntegrationType;
  table: "traces" | "observations" | "scores" | "observations_v2"; // observations_v2 is the events table
  fileType: BlobStorageIntegrationFileType;
  compressed: boolean;
  // zlib level for the gzip step; undefined => zlib default (6). Only relevant
  // when `compressed` is true.
  gzipLevel: number | undefined;
  convertV4LatencyToSeconds: boolean;
  exportFieldGroups?: ExportFieldGroup[];
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

  const storageService = config.storageService;

  return await instrumentAsync(
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
      // fire and the job re-enqueues as stalled. Torn down below.
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
      });

      // Outside the try so the catch can distinguish a real upload success from
      // a failure.
      let uploadSucceeded = false;

      // Per-stage errors so the catch can name the originating cause instead of
      // the bare "aborted" the pipeline teardown propagates to every stage.
      const abortTracker = new BlobExportAbortTracker();

      try {
        const blobStorageProps = getFileTypeProperties(config.fileType);

        const parquetEligible =
          config.fileType === BlobStorageIntegrationFileType.PARQUET;

        // Raw passthrough is opt-in per project and only valid for
        // JSONL output of the enriched-observation tables — the only formats
        // where ClickHouse FORMAT JSONEachRow bytes map 1:1 to the file. Any
        // other request falls back to the standard path. The integration-level
        // ineligibility warning is emitted once by the dispatcher; here we just
        // select the path per table (scores/traces always use the standard path,
        // so per-table fallback is expected and not worth a warning).
        const passthroughEligible =
          !parquetEligible &&
          config.rawPassthrough &&
          config.fileType === BlobStorageIntegrationFileType.JSONL &&
          (config.table === "observations" ||
            config.table === "observations_v2");

        const exportPath = (() => {
          if (parquetEligible) {
            return "parquet";
          }
          if (passthroughEligible) {
            return "passthrough";
          }
          return "standard";
        })();

        const timestamp = formatBlobExportTimestamp(config.maxTimestamp);
        // Parquet: fixed `.parquet` extension (no `.gz`) and Parquet content type.
        const extension = (() => {
          if (parquetEligible) {
            return "parquet";
          }
          if (config.compressed) {
            return `${blobStorageProps.extension}.gz`;
          }
          return blobStorageProps.extension;
        })();
        const filePath = `${config.prefix ?? ""}${config.projectId}/${config.table}/${timestamp}.${extension}`;
        const uploadContentType = (() => {
          if (parquetEligible) {
            return "application/vnd.apache.parquet";
          }
          if (config.compressed) {
            return "application/gzip";
          }
          return blobStorageProps.contentType;
        })();

        // Each table's query only receives its own groups. Score groups are
        // opt-in, so the empty-selection fallback covers observation groups only;
        // traces export in full unless a trace group is stored.
        const selectedFieldGroups: ExportFieldGroup[] =
          config.exportFieldGroups && config.exportFieldGroups.length > 0
            ? config.exportFieldGroups
            : [...OBSERVATION_FIELD_GROUPS_FULL];
        const observationFieldGroups =
          getObservationFieldGroups(selectedFieldGroups);
        const scoreFieldGroups = getScoreFieldGroups(selectedFieldGroups);
        const traceFieldGroups = getTraceFieldGroups(selectedFieldGroups);

        // blob.path already encodes parquet (no per-table fallback), so no
        // separate blob.config.parquet attribute is needed.
        span.setAttribute("blob.path", exportPath);

        const pipelineCallback = (err: NodeJS.ErrnoException | null) => {
          if (err) {
            // The pipeline source is the ClickHouse read.
            abortTracker.record("ch-read", err);
            logger[getBlobExportShutdownSignal().aborted ? "warn" : "error"](
              "[BLOB INTEGRATION] Getting data from DB for blob storage integration failed: ",
              err,
            );
          }
        };

        // Source read wait; backpressureMs is set only by the parquet
        // TimedByteCounter and stays 0 on every other path.
        const sourceStats = { rows: 0, sourceWaitMs: 0, backpressureMs: 0 };
        // When enrichment is active, chStats isolates ClickHouse read wait from
        // enrichment CPU. enrichMs = sourceStats.sourceWaitMs - chStats.sourceWaitMs.
        let chStats: { rows: number; sourceWaitMs: number } | null = null;

        // Parquet feeds sourceStats.sourceWaitMs from the piped binary stream so
        // the shared metrics derivation works without a per-row generator.
        const serializedCounter = parquetEligible
          ? new TimedByteCounter(sourceStats)
          : new ByteCounter();
        // No worker-side gzip on the parquet path (compression is internal to
        // Parquet), so the parquet path never allocates a compressed counter.
        const compressedCounter =
          !parquetEligible && config.compressed ? new ByteCounter() : null;
        // Paired with compressedCounter: both exist iff compression is on.
        const gzipStats: GzipStats | null = compressedCounter
          ? {
              level: config.gzipLevel ?? ZLIB_DEFAULT_LEVEL,
              activeMs: 0,
              backpressureMs: 0,
            }
          : null;

        let fileStream: Readable;

        if (parquetEligible) {
          // Stream raw FORMAT Parquet bytes straight to upload — no JS
          // parse/enrich/serialize, no gzip, no row counting (binary has no row
          // boundaries, so sourceStats.rows stays 0). Field-group projection,
          // latency ms→s, and dropped price columns are baked into the SQL. The
          // exception-tag Transform in queryClickhouseExecRaw aborts the upload
          // before commit on a mid-stream failure — same guarantee as passthrough.
          let parquetSource: Readable;
          switch (config.table) {
            case "traces":
              parquetSource = (
                await getTracesForBlobStorageExportParquet(
                  config.projectId,
                  config.minTimestamp,
                  config.maxTimestamp,
                  traceFieldGroups,
                )
              ).stream;
              break;
            case "scores":
              parquetSource = (
                await getScoresForBlobStorageExportParquet(
                  config.projectId,
                  config.minTimestamp,
                  config.maxTimestamp,
                  scoreFieldGroups,
                )
              ).stream;
              break;
            case "observations":
              parquetSource = (
                await getObservationsForBlobStorageExportParquet(
                  config.projectId,
                  config.minTimestamp,
                  config.maxTimestamp,
                  observationFieldGroups,
                )
              ).stream;
              break;
            case "observations_v2": // observations_v2 is the events table
              parquetSource = (
                await getEventsForBlobStorageExportParquet(
                  config.projectId,
                  config.minTimestamp,
                  config.maxTimestamp,
                  observationFieldGroups,
                  config.convertV4LatencyToSeconds,
                )
              ).stream;
              break;
            default:
              throw new Error(`Unsupported table type: ${config.table}`);
          }

          fileStream = pipeline(
            parquetSource,
            serializedCounter,
            pipelineCallback,
          );
        } else if (passthroughEligible) {
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
                  observationFieldGroups,
                )
              : getEventsForBlobStorageExportRaw(
                  config.projectId,
                  config.minTimestamp,
                  config.maxTimestamp,
                  observationFieldGroups,
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
                traceFieldGroups,
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
                    observationFieldGroups,
                  ),
                  chStats,
                ),
                config.projectId,
                "model_id",
                false, // v3 query already returns latency in seconds
                observationFieldGroups,
                config.skipEnrichment,
              );
              break;
            case "scores":
              rawStream = getScoresForBlobStorageExport(
                config.projectId,
                config.minTimestamp,
                config.maxTimestamp,
                scoreFieldGroups,
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
                    observationFieldGroups,
                  ),
                  chStats,
                ),
                config.projectId,
                "model_id",
                config.convertV4LatencyToSeconds,
                observationFieldGroups,
                config.skipEnrichment,
              );
              break;
            default:
              throw new Error(`Unsupported table type: ${config.table}`);
          }

          const dataStream = countedStream(rawStream, sourceStats);
          if (config.fileType === BlobStorageIntegrationFileType.PARQUET) {
            throw new Error(
              `Reached the text-format export path with fileType=PARQUET for project ${config.projectId}; the parquetEligible branch should have handled it`,
            );
          }
          const formatTransform =
            streamTransformations[config.fileType as BatchExportFileFormat]();

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
          (config.type === BlobStorageIntegrationType.S3 ||
            config.type === BlobStorageIntegrationType.S3_COMPATIBLE) &&
          sharedEnv.LANGFUSE_S3_UPLOAD_ENABLE_BUFFERED === "true";
        let uploadStartMs: number | undefined;
        let uploadDurationMsFinal: number | undefined;
        try {
          uploadStartMs = performance.now();

          // Destroying the upload's source tears down the whole pipeline (CH
          // read included) and rejects the upload, so the job can be re-queued
          // before ECS kills the task.
          const shutdownSignal = getBlobExportShutdownSignal();
          const abortOnShutdown = () =>
            fileStream.destroy(shutdownSignal.reason);
          if (shutdownSignal.aborted) abortOnShutdown();
          shutdownSignal.addEventListener("abort", abortOnShutdown, {
            once: true,
          });

          try {
            await storageService.uploadFileBuffered({
              fileName: filePath,
              fileType: uploadContentType,
              data: fileStream,
              partSizeBytes: config.partSizeBytes,
              maxConcurrentParts: config.maxConcurrentParts,
              maxPartAttempts: config.maxPartAttempts,
              stats: uploadStats,
            });
          } catch (uploadError) {
            // Attribute to the upload stage; a CH-origin error surfacing here is
            // still classified as ch-error by its preserved cause chain.
            abortTracker.record("upload", uploadError);
            throw uploadError;
          } finally {
            shutdownSignal.removeEventListener("abort", abortOnShutdown);
          }
          // Record at the upload boundary so a throw in the `finally` below
          // can't miscount a real success as a failure.
          uploadSucceeded = true;
          uploadDurationMsFinal = Math.round(performance.now() - uploadStartMs);
          recordIncrement(BLOB_TABLE_EXPORT_METRIC, 1, {
            outcome: "success" satisfies BlobTableExportOutcome,
            table: config.table,
          });

          const exportFormat = parquetEligible
            ? BlobExportFormat.PARQUET
            : resolveBlobExportFormat(config.fileType, config.compressed);

          // rowCount null on parquet: sourceStats.rows stays 0 for the binary
          // stream and would misreport as an empty file.
          const manifestFile: BlobExportManifestFile = {
            key: filePath,
            table: config.table,
            fileType: parquetEligible
              ? BlobStorageIntegrationFileType.PARQUET
              : config.fileType,
            format: exportFormat,
            compressed: parquetEligible ? false : config.compressed,
            contentType: uploadContentType,
            sizeBytes: compressedCounter
              ? compressedCounter.bytes
              : serializedCounter.bytes,
            rowCount: parquetEligible ? null : sourceStats.rows,
          };
          // Unified export-volume metric: the actual uploaded volume per
          // source (post-gzip size for compressed formats, raw/parquet size
          // otherwise). destination_type (S3 / S3_COMPATIBLE / AZURE_*) splits
          // the egress by data-transfer cost in the Datadog dashboard.
          recordExportVolume({
            integration: "blob_storage",
            bytes: compressedCounter
              ? compressedCounter.bytes
              : serializedCounter.bytes,
            projectId: config.projectId,
            destinationType: config.type,
            source: exportFormat,
            table: config.table,
            path: exportPath,
          });

          const uploadDurationMs = uploadDurationMsFinal;
          // Parquet's source counter sits at the upload boundary, so strip its
          // backpressure to recover pure CH read (no-op elsewhere: gzip isolates
          // CH read in chStats, and backpressureMs is 0 on every other path).
          const chReadMs = Math.round(
            Math.max(
              0,
              (chStats ? chStats.sourceWaitMs : sourceStats.sourceWaitMs) -
                (chStats ? 0 : sourceStats.backpressureMs),
            ),
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
          // Measured backpressure (gzip / parquet boundary), else duration residual.
          const uploadWaitMs = (() => {
            if (gzipStats) {
              return Math.round(gzipStats.backpressureMs);
            }
            if (parquetEligible) {
              return Math.round(sourceStats.backpressureMs);
            }
            return Math.max(0, uploadDurationMs - chReadMs - enrichMs);
          })();

          logger.info(
            `[BLOB INTEGRATION] Successfully exported ${config.table} for project ${config.projectId}: ` +
              `jobId=${config.bullmqJobId} attemptsMade=${config.bullmqAttemptsMade} host=${WORKER_HOST_ID} ` +
              `path=${exportPath} ` +
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

          return manifestFile;
        } finally {
          span.setAttribute("blob.rows", sourceStats.rows);
          // Same chReadMs / uploadWaitMs derivation as the success path above.
          const finalChReadMs = Math.round(
            Math.max(
              0,
              (chStats ? chStats.sourceWaitMs : sourceStats.sourceWaitMs) -
                (chStats ? 0 : sourceStats.backpressureMs),
            ),
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
            // On failure the values are partial (the upload aborted mid-stream).
            const finalGzipCpuMs = gzipStats
              ? Math.max(
                  0,
                  Math.round(gzipStats.activeMs - gzipStats.backpressureMs),
                )
              : 0;
            const finalUploadWaitMs = (() => {
              if (gzipStats) {
                return Math.round(gzipStats.backpressureMs);
              }
              if (parquetEligible) {
                return Math.round(sourceStats.backpressureMs);
              }
              return Math.max(0, totalUploadMs - finalChReadMs - finalEnrichMs);
            })();
            span.setAttribute("blob.gzipCpuMs", finalGzipCpuMs);
            span.setAttribute("blob.uploadWaitMs", finalUploadWaitMs);
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
          }
        }
      } catch (error) {
        // On SIGTERM, add a concrete shutdown record. It wins origin() only when
        // no earlier concrete fault (e.g. a real CH exception) was recorded.
        if (isSigtermReceived()) {
          abortTracker.record("shutdown", error);
        }
        // Fall back to the propagated error if no stage recorded one.
        const origin = abortTracker.origin() ?? classifyBlobExportError(error);

        span.setAttribute("blob.abortReason", origin.reason);
        span.setAttribute("blob.abortStage", origin.stage);

        // Skip if `success` already fired (a later step threw post-upload), or
        // on shutdown, whose single outcome is the `aborted` count taken when
        // SIGTERM arrived.
        if (!uploadSucceeded && origin.reason !== "shutdown") {
          recordIncrement(BLOB_TABLE_EXPORT_METRIC, 1, {
            outcome: "failure" satisfies BlobTableExportOutcome,
            abortReason: origin.reason,
            table: config.table,
          });
        }
        // A shutdown abort is routine (the job is re-queued), not an error.
        logger[origin.reason === "shutdown" ? "warn" : "error"](
          `[BLOB INTEGRATION] Error exporting ${config.table} for project ${config.projectId} ` +
            `(jobId=${config.bullmqJobId} attemptsMade=${config.bullmqAttemptsMade} host=${WORKER_HOST_ID} ` +
            `abortReason=${origin.reason} abortStage=${origin.stage}` +
            `${origin.concrete ? "" : " attribution=best-effort"}): ${origin.chain}`,
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
        span.setAttribute("blob.eventLoopDelay.maxMs", Math.round(maxMs));
        span.setAttribute("blob.eventLoopDelay.p99Ms", Math.round(p99Ms));
        span.setAttribute("blob.eventLoopDelay.meanMs", Math.round(meanMs));
      }
    },
  );
};
