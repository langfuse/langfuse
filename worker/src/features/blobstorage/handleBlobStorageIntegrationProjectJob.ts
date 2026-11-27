// Blob storage export job for one project: computes the export window, streams
// each table to the customer bucket, writes the manifest, and handles failures.

import { Job, UnrecoverableError } from "bullmq";
import { prisma } from "@langfuse/shared/src/db";
import { createBlobStorageRoleCredentials } from "@langfuse/shared/src/server/ee/storageRoleAuth/blobStorageRoleCredentials";
import {
  QueueName,
  TQueueJobTypes,
  logger,
  StorageService,
  StorageServiceFactory,
  storageKeys,
  getCurrentSpan,
  BlobStorageIntegrationProcessingQueue,
  QueueJobs,
  blobStorageEndpointConnectionValidationOptions,
  assertGcsBlobStorageBucketAllowed,
  validateBlobStorageBucketHost,
  validateBlobStorageEndpoint,
} from "@langfuse/shared/src/server";
import { errorChainText } from "./abortClassification";
import { classifyCustomerFault } from "./isCustomerFaultError";
import {
  isMultipartPartLimitError,
  BLOB_EXPORT_PART_LIMIT_ERROR_MESSAGE,
} from "./partLimitError";
import { setLastError } from "./planDisable";
import { isRecordNotFoundError } from "../integrations/prismaErrors";
import { isFinalBullmqAttempt } from "../integrations/bullmqAttempts";
import { WORKER_HOST_ID } from "../../utils/hostId";
import {
  BlobStorageIntegrationType,
  StorageIntegrationAuthType,
  BlobStorageIntegrationFileType,
  type ExportFieldGroup,
  isLegacyExportSource,
  isLegacyExporter,
  resolveBlobExportTuning,
  DEFAULT_BLOB_EXPORT_PART_SIZE_BYTES,
} from "@langfuse/shared";
import { decrypt } from "@langfuse/shared/encryption";
import { randomUUID } from "crypto";
import { env } from "../../env";
import { assertExportSourceWritable } from "../exportWriteModeGuard";
import { isExportCaughtUp } from "../../services/exportStalenessMetric";
import {
  buildBlobExportManifest,
  buildBlobExportManifestKey,
  type BlobExportManifestFile,
} from "./manifest";
import {
  buildBlobExportDeprecationNotice,
  buildBlobExportDeprecationNoticeKey,
} from "./deprecationNotice";
import {
  BLOB_STORAGE_LAG_BUFFER_MS,
  BLOB_STORAGE_REMAINDER_COALESCE_MS,
  getFrequencyIntervalMs,
  getMinTimestampForExport,
} from "./exportWindow";
import {
  extractStorageErrorMessage,
  notifyBlobStorageExportFailed,
  recordTerminalExportError,
} from "./terminalExportError";
import { processBlobStorageExport } from "./exportTable";
import { getBlobExportShutdownSignal } from "./inFlightExports";

// KMS SSE is not supported for this integration.
type BlobStorageConnectionConfig = {
  bucketName: string;
  endpoint: string | null;
  region: string;
  accessKeyId: string | undefined;
  secretAccessKey: string | undefined;
  // IAM role auth; replaces the access keys when set.
  credentials?: ReturnType<typeof createBlobStorageRoleCredentials>;
  forcePathStyle?: boolean;
  type: BlobStorageIntegrationType;
};

const createBlobStorageService = (
  config: BlobStorageConnectionConfig,
): StorageService => {
  const useGoogleCloudStorage =
    config.type === BlobStorageIntegrationType.GOOGLE_CLOUD_STORAGE;
  // GCS: a stored secret is the customer's service account JSON key; none means
  // default credentials (the deployment identity).
  const gcsServiceAccountKey = useGoogleCloudStorage
    ? config.secretAccessKey
    : undefined;
  if (useGoogleCloudStorage && !gcsServiceAccountKey) {
    // Re-checked per run so removing a bucket from the allowlist stops keyless
    // exports that were saved while it was allowed.
    assertGcsBlobStorageBucketAllowed(config.bucketName);
  }
  // The GCS client treats a non-JSON string as a key *file path*; a customer
  // secret must never be read as one.
  if (gcsServiceAccountKey && !gcsServiceAccountKey.trim().startsWith("{")) {
    // Named so classifyCustomerFault disables the integration instead of retrying.
    throw Object.assign(
      new Error("GCS credentials must be a service account JSON key"),
      { name: "InvalidGcsServiceAccountKey" },
    );
  }
  const keys = useGoogleCloudStorage
    ? undefined
    : storageKeys(config.accessKeyId, config.secretAccessKey);
  return StorageServiceFactory.getInstance({
    credentials: config.credentials
      ? { type: "role", provider: config.credentials }
      : keys,
    bucketName: config.bucketName,
    endpoint: config.endpoint ?? undefined,
    region: config.region,
    forcePathStyle: config.forcePathStyle ?? false,
    awsSse: undefined,
    awsSseKmsKeyId: undefined,
    useAzureBlob: config.type === BlobStorageIntegrationType.AZURE_BLOB_STORAGE,
    // Undefined → ADC (the deployment's own identity), allowlist-gated above.
    useGoogleCloudStorage,
    googleCloudCredentials: gcsServiceAccountKey,
    useOCIObjectStorage: false, // Not supported in blob storage integration
    connectionValidation: blobStorageEndpointConnectionValidationOptions(),
    sendContentMd5: true,
  });
};

// Small JSON body, so single-shot uploadFile instead of the buffered multipart
// path the table streams use.
const writeBlobExportManifest = async (params: {
  storageService: StorageService;
  prefix?: string;
  projectId: string;
  exportSource: string;
  minTimestamp: Date;
  maxTimestamp: Date;
  files: BlobExportManifestFile[];
}): Promise<void> => {
  const manifest = buildBlobExportManifest({
    projectId: params.projectId,
    exportSource: params.exportSource,
    minTimestamp: params.minTimestamp,
    maxTimestamp: params.maxTimestamp,
    createdAt: new Date(),
    files: params.files,
  });
  const key = buildBlobExportManifestKey({
    prefix: params.prefix,
    projectId: params.projectId,
    maxTimestamp: params.maxTimestamp,
  });

  await params.storageService.uploadFile({
    fileName: key,
    fileType: "application/json; charset=utf-8",
    // Trailing newline for POSIX-friendly shell tooling.
    data: JSON.stringify(manifest, null, 2) + "\n",
  });

  logger.info(
    `[BLOB INTEGRATION] Wrote run manifest for project ${params.projectId}: ` +
      `key=${key} files=${manifest.files.length} tables=${manifest.tables.join(",")}`,
  );
};

// Drop a plain-text deprecation notice into the export destination
// for legacy-source projects. Best-effort — a failure to write the notice must
// not fail the export run, so it is called after the manifest commit point and
// swallows its own error.
const writeBlobExportDeprecationNotice = async (params: {
  storageService: StorageService;
  prefix?: string;
  projectId: string;
}): Promise<void> => {
  const key = buildBlobExportDeprecationNoticeKey({
    prefix: params.prefix,
    projectId: params.projectId,
  });
  try {
    await params.storageService.uploadFile({
      fileName: key,
      fileType: "text/plain; charset=utf-8",
      data: buildBlobExportDeprecationNotice(),
    });
    logger.info(
      `[BLOB INTEGRATION] Wrote legacy-source deprecation notice for project ${params.projectId}: key=${key}`,
    );
  } catch (error) {
    logger.warn(
      `[BLOB INTEGRATION] Failed to write legacy-source deprecation notice for project ${params.projectId} (key=${key}); export run is unaffected`,
      error,
    );
  }
};

// Counterpart to the writer: once a project migrates off a legacy source (the
// action the notice asks for), a notice left from an earlier run would linger
// with now-false claims. Best-effort delete on the non-legacy path clears it.
// Idempotent — deleting a non-existent key is a no-op — and never fails the run.
const removeBlobExportDeprecationNotice = async (params: {
  storageService: StorageService;
  prefix?: string;
  projectId: string;
}): Promise<void> => {
  const key = buildBlobExportDeprecationNoticeKey({
    prefix: params.prefix,
    projectId: params.projectId,
  });
  try {
    await params.storageService.deleteFiles([key]);
  } catch (error) {
    logger.warn(
      `[BLOB INTEGRATION] Failed to remove stale deprecation notice for project ${params.projectId} (key=${key}); export run is unaffected`,
      error,
    );
  }
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
      include: { project: { select: { orgId: true } } },
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
      where: { projectId },
      data: { runStartedAt: null },
    });
    return;
  }

  const runStartTime = new Date();
  const { count: claimed } = await prisma.blobStorageIntegration.updateMany({
    where: { projectId },
    data: { runStartedAt: runStartTime },
  });
  if (claimed === 0) {
    logger.info(
      `[BLOB INTEGRATION] Blob storage integration for project ${projectId} was deleted before the run started; dropping obsolete job`,
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
    await prisma.blobStorageIntegration.updateMany({
      where: { projectId },
      data: {
        runStartedAt: null,
        nextSyncAt: new Date(now.getTime() + frequencyIntervalMs),
        ...(isExportCaughtUp({
          lastSyncAt: blobStorageIntegration.lastSyncAt,
          runStartTime,
        })
          ? { backfill: false }
          : {}),
      },
    });
    await setLastError(projectId, null);
    return;
  }

  // Legacy-source deprecation is a Cloud policy (isLegacyExporter exempts
  // self-hosted), so the deprecation notice below is Cloud-only too.
  const isCloud = Boolean(env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION);

  try {
    // The catch persists lastError and notifies admins.
    assertExportSourceWritable(
      blobStorageIntegration.exportSource,
      "Select the enriched export source (OBSERVATIONS_V2) in the blob storage integration settings.",
    );

    // Preflight the persisted integration endpoint once per job inside the
    // export error path. StorageService connection-time validation remains the
    // DNS-rebinding defense for each SDK connection.
    if (blobStorageIntegration.endpoint) {
      await validateBlobStorageEndpoint(blobStorageIntegration.endpoint);
      await validateBlobStorageBucketHost(blobStorageIntegration);
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

    const usesRole =
      blobStorageIntegration.authType === StorageIntegrationAuthType.ROLE_ARN;

    // One client per run, shared by all table uploads and the manifest write.
    const storageService = createBlobStorageService({
      bucketName: blobStorageIntegration.bucketName,
      endpoint: blobStorageIntegration.endpoint,
      region: blobStorageIntegration.region || "auto",
      accessKeyId: usesRole
        ? undefined
        : blobStorageIntegration.accessKeyId || undefined,
      secretAccessKey:
        !usesRole && blobStorageIntegration.secretAccessKey
          ? decrypt(blobStorageIntegration.secretAccessKey)
          : undefined,
      credentials: usesRole
        ? createBlobStorageRoleCredentials({
            ...blobStorageIntegration,
            orgId: blobStorageIntegration.project.orgId,
          })
        : undefined,
      forcePathStyle: blobStorageIntegration.forcePathStyle || undefined,
      type: blobStorageIntegration.type,
    });

    const executionConfig = {
      projectId,
      minTimestamp,
      maxTimestamp,
      storageService,
      prefix: blobStorageIntegration.prefix || undefined,
      type: blobStorageIntegration.type,
      fileType: blobStorageIntegration.fileType,
      compressed: blobStorageIntegration.compressed,
      gzipLevel: exportTuning.gzipLevel,
      convertV4LatencyToSeconds,
      exportFieldGroups:
        blobStorageIntegration.exportFieldGroups as ExportFieldGroup[],
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
      blobStorageIntegration.fileType !==
        BlobStorageIntegrationFileType.PARQUET &&
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

    let runFiles: BlobExportManifestFile[];
    if (isTraceOnlyProject) {
      // Only process traces table for projects in the trace-only list (legacy behavior)
      logger.info(
        `[BLOB INTEGRATION] Project ${projectId} is configured for trace-only export via env var, skipping observations, scores, and events`,
      );
      runFiles = [
        await processBlobStorageExport({ ...executionConfig, table: "traces" }),
      ];
    } else {
      // Process tables based on exportSource setting
      const processPromises: Promise<BlobExportManifestFile>[] = [];

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

      runFiles = await Promise.all(processPromises);
    }

    // The manifest is the run's commit point: written strictly after every
    // table upload succeeded. A failure here fails the run, so lastSyncAt does
    // not advance and the retry idempotently overwrites the table files.
    await writeBlobExportManifest({
      storageService,
      prefix: blobStorageIntegration.prefix || undefined,
      projectId,
      exportSource: blobStorageIntegration.exportSource,
      minTimestamp,
      maxTimestamp,
      files: runFiles,
    });

    // Cloud-only v3-deprecation notice; both sides best-effort (never fail the run).
    if (isCloud) {
      if (isLegacyExportSource(blobStorageIntegration.exportSource)) {
        await writeBlobExportDeprecationNotice({
          storageService,
          prefix: blobStorageIntegration.prefix || undefined,
          projectId,
        });
      } else if (
        // Gate cleanup on "old enough to have written a notice": otherwise every
        // enriched-only export adds a needless per-run s3:DeleteObject on the
        // destination, which is write-only for many customers.
        isLegacyExporter(blobStorageIntegration.createdAt, isCloud)
      ) {
        await removeBlobExportDeprecationNotice({
          storageService,
          prefix: blobStorageIntegration.prefix || undefined,
          projectId,
        });
      }
    }

    // Determine if we've caught up with present-day data. A remainder below
    // BLOB_STORAGE_REMAINDER_COALESCE_MS is treated as caught up so we never emit
    // a sub-second trailing chunk that would collide with the full-interval chunk
    // on the same second-precision object key (see the constant's doc comment).
    const remainderMs = uncappedMaxTimestamp.getTime() - maxTimestamp.getTime();
    const caughtUp =
      maxTimestamp.getTime() >= uncappedMaxTimestamp.getTime() ||
      remainderMs < BLOB_STORAGE_REMAINDER_COALESCE_MS;

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

    // Update integration after successful processing. count === 0 means the
    // integration was deleted mid-run — skip the catch-up re-enqueue below,
    // the job is obsolete.
    const { count: persisted } = await prisma.blobStorageIntegration.updateMany(
      {
        where: {
          projectId,
        },
        data: {
          lastSyncAt: maxTimestamp,
          nextSyncAt,
          runStartedAt: null,
          ...(isExportCaughtUp({ lastSyncAt: maxTimestamp, runStartTime })
            ? { backfill: false }
            : {}),
        },
      },
    );
    await setLastError(projectId, null);
    if (persisted === 0) {
      logger.info(
        `[BLOB INTEGRATION] Blob storage integration for project ${projectId} was deleted mid-run; dropping obsolete job after successful export`,
      );
      return;
    }

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
    // A shutdown abort is not an export failure: record nothing and notify no
    // one. The processor re-queues the job; lastSyncAt did not advance, so the
    // re-run exports the same window.
    if (getBlobExportShutdownSignal().aborted) {
      throw error;
    }

    // A part-count-limit exhaustion is terminal, not transient: the window is
    // too large for the configured part size and no retry can shrink it safely.
    // Fail loud and stop before BullMQ burns its remaining attempts re-querying
    // ClickHouse against a retention-shrinking window. Runs BEFORE the generic
    // customer-fault/transient handling below.
    if (isMultipartPartLimitError(error)) {
      // Missing-row-safe: a delete mid-run makes the job obsolete. lastSyncAt /
      // nextSyncAt are left untouched so the window is not advanced past a
      // failed export. enabled is left untouched: a too-large window is not a
      // customer-config fault, so this never auto-disables. update (not
      // updateMany) so the notification can read the post-write enabled state.
      let integration;
      try {
        integration = await prisma.blobStorageIntegration.update({
          where: { projectId },
          data: { runStartedAt: null },
        });
        await setLastError(projectId, BLOB_EXPORT_PART_LIMIT_ERROR_MESSAGE);
      } catch (persistError) {
        if (isRecordNotFoundError(persistError)) {
          logger.info(
            `[BLOB INTEGRATION] Blob storage integration for project ${projectId} was deleted before the part-limit failure could be recorded; dropping obsolete job`,
          );
          return;
        }
        throw persistError;
      }

      // Cooldown-gated, not bypassed: the integration stays enabled and the
      // watermark does not advance, so every scheduled run re-attempts the same
      // too-large window and re-enters here. The cooldown caps this to one alert
      // per cooldown window instead of one per run. (The disable notification
      // bypasses the cooldown because it is a one-shot terminal event.)
      //
      // Gated on the post-write enabled state, mirroring the generic terminal
      // path's stillEnabled check: a user who disabled the integration mid-run
      // must not get an "export failed" alert for a run they already turned off.
      if (integration.enabled) {
        await notifyBlobStorageExportFailed(projectId);
      }

      logger.error(
        `[BLOB INTEGRATION] Blob storage export for project ${projectId} exceeded the multipart part-count limit; failing terminally without retry: ${errorChainText(error)}`,
      );
      // UnrecoverableError so BullMQ fails the job now instead of retrying.
      throw new UnrecoverableError(BLOB_EXPORT_PART_LIMIT_ERROR_MESSAGE);
    }

    const errorMessage = extractStorageErrorMessage(error);

    const isFinalAttempt = isFinalBullmqAttempt(job, error);
    // Defined => disable, on the first occurrence: a config fault cannot succeed
    // on a retry, and the failures metric counts every failed attempt.
    const customerFaultReason = classifyCustomerFault(error);

    const outcome = await recordTerminalExportError({
      projectId,
      errorMessage,
      disableReason: customerFaultReason,
    });

    if (outcome.kind === "integration-deleted") {
      return; // obsolete job: complete it rather than fail it
    }

    switch (outcome.kind) {
      case "disabled-by-us":
        // Awaited: the integration is now off, so the scheduler never revisits
        // it and nothing would carry an interrupted dispatch.
        await notifyBlobStorageExportFailed(projectId, {
          disabledMessage: (projectName) =>
            `The blob storage export for project "${projectName}" has been disabled after a configuration fault. This usually means the destination configuration or credentials are no longer valid. Once you have updated them, simply re-enable the export in the integration settings and it will pick up right where it left off.`,
        });
        return; // resolving is the point; a throw would light the monitor
      case "lost-disable-race":
        return; // the winner sent the terminal email
      case "error-recorded":
        // Skipped once the integration is off: "will retry at the next
        // scheduled export" is no longer true. Not awaited: this path rethrows,
        // so the job is about to fail and be retried regardless.
        if (isFinalAttempt && outcome.stillEnabled) {
          notifyBlobStorageExportFailed(projectId);
        }
        break;
      case "persist-failed":
        // Nothing was written, so we cannot claim the fault is handled: retry
        // and reclassify. No email — "will retry" is all we could honestly say.
        break;
      // A plain switch over a union is not exhaustiveness-checked; the never
      // assignment below is what makes a missing case fail to compile.
      default: {
        const _exhaustiveCheck: never = outcome;
        throw new Error(
          `Unhandled terminal export outcome: ${JSON.stringify(_exhaustiveCheck)}`,
        );
      }
    }

    const chain = errorChainText(error);
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
