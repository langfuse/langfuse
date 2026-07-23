import { type PrismaClient } from "@langfuse/shared/src/db";
import {
  BlobStorageExportMode,
  BlobStorageIntegrationType,
  InvalidRequestError,
  AnalyticsIntegrationExportSource,
  areLegacyWritesActive,
  validateExportSource,
  BlobStorageIntegrationFileType,
  type ObservationFieldGroupFull,
} from "@langfuse/shared";
import { encrypt } from "@langfuse/shared/encryption";
import { env } from "@/src/env.mjs";
import { validateBlobStorageEndpoint } from "@langfuse/shared/src/server";

type UpsertBlobStorageIntegrationInput = {
  type: BlobStorageIntegrationType;
  bucketName: string;
  endpoint: string | null;
  region: string;
  accessKeyId: string | null;
  secretAccessKey: string | null; // plain text — encrypted by this service
  prefix: string;
  exportFrequency: string;
  enabled: boolean;
  forcePathStyle: boolean;
  // Optional: undefined preserves the persisted value on UPDATE (Prisma omits
  // the column) and falls back to PARQUET on CREATE.
  fileType?: BlobStorageIntegrationFileType;
  exportMode: BlobStorageExportMode;
  exportStartDate: Date | null;
  exportSource?: AnalyticsIntegrationExportSource;
  exportFieldGroups?: ObservationFieldGroupFull[];
  compressed?: boolean;
};

function resolveExportStartDate(params: {
  exportMode: BlobStorageExportMode;
  exportStartDate: Date | null;
}): Date | null {
  switch (params.exportMode) {
    case BlobStorageExportMode.FROM_TODAY:
      return new Date();
    case BlobStorageExportMode.FROM_CUSTOM_DATE:
      return params.exportStartDate || new Date();
    case BlobStorageExportMode.FULL_HISTORY:
      return null;
    default: {
      const _exhaustive: never = params.exportMode;
      _exhaustive;
      return null;
    }
  }
}

export async function upsertBlobStorageIntegration(params: {
  prisma: PrismaClient;
  projectId: string;
  data: UpsertBlobStorageIntegrationInput;
  // When true and no existing row is found inside the transaction, the CREATE
  // branch uses EVENTS instead of the Prisma column default (TRACES_OBSERVATIONS).
  // Evaluated inside the transaction so the row-state check and the INSERT are
  // atomic — no TOCTOU window.
  forceEventsOnCreate?: boolean;
  // When true and no existing row is found inside the transaction, the CREATE
  // branch refuses a legacy export source (throws). Evaluated in-transaction so
  // a concurrent DELETE between the router's pre-flight read and this upsert
  // cannot slip a new post-cutoff row in with a legacy source. Symmetric with
  // forceEventsOnCreate; set by both the tRPC and REST paths on Cloud.
  refuseLegacyOnCreate?: boolean;
}) {
  const { prisma, projectId, data } = params;

  const isSelfHosted = !env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION;
  const canUseHostCredentials =
    isSelfHosted && data.type === BlobStorageIntegrationType.S3;

  const accessKeyId = data.accessKeyId?.trim() || null;
  const secretAccessKey = data.secretAccessKey?.trim() || null;

  if (data.endpoint) {
    try {
      await validateBlobStorageEndpoint(data.endpoint);
    } catch (error) {
      throw new InvalidRequestError(
        `Invalid blob storage endpoint: ${error instanceof Error ? error.message : "Endpoint validation failed"}`,
      );
    }
  }

  if (!canUseHostCredentials && !accessKeyId) {
    throw new InvalidRequestError(
      "Access Key ID and Secret Access Key are required",
    );
  }

  const resolvedExportStartDate = resolveExportStartDate({
    exportMode: data.exportMode,
    exportStartDate: data.exportStartDate,
  });

  const writeData = {
    type: data.type,
    bucketName: data.bucketName,
    endpoint: data.endpoint,
    region: data.region,
    accessKeyId,
    prefix: data.prefix,
    exportFrequency: data.exportFrequency,
    enabled: data.enabled,
    forcePathStyle: data.forcePathStyle,
    fileType: data.fileType,
    exportMode: data.exportMode,
    exportStartDate: resolvedExportStartDate,
    exportSource: data.exportSource,
    exportFieldGroups: data.exportFieldGroups,
    compressed: data.compressed ?? true,
  };

  return prisma.$transaction(async (tx) => {
    const existing = await tx.blobStorageIntegration.findUnique({
      where: { projectId },
      select: { exportMode: true, lastError: true, runStartedAt: true },
    });

    // Require secret key for new integrations (unless using host credentials)
    if (!existing) {
      const isUsingHostCredentials =
        canUseHostCredentials && (!accessKeyId || !secretAccessKey);
      if (!isUsingHostCredentials && !secretAccessKey) {
        throw new InvalidRequestError(
          "Secret access key is required for new configuration",
        );
      }
    }

    const modeChanged = existing && existing.exportMode !== data.exportMode;
    const encryptedSecret = secretAccessKey ? encrypt(secretAccessKey) : null;

    // exportSource for the CREATE payload. The !existing guard was previously
    // here, but it created a residual TOCTOU: READ COMMITTED isolation means
    // tx.findUnique and tx.upsert take independent snapshots, so a concurrent
    // DELETE between the two could leave createExportSource = undefined and let
    // Postgres apply the @default(TRACES_OBSERVATIONS) column default on INSERT.
    // Dropping the guard is safe: ON CONFLICT atomically decides CREATE vs UPDATE
    // at INSERT time regardless of what findUnique saw. UPDATE uses
    // writeData.exportSource (undefined → Prisma omits the column → preserves
    // the existing value), so the caller intent is always honored on both paths.
    // Under events_only a new row must never fall back to the legacy Prisma
    // column default; force EVENTS in-transaction, deployment-agnostic
    // (see export-source-policy.ts).
    const legacyWritesActive = areLegacyWritesActive(
      env.LANGFUSE_MIGRATION_V4_WRITE_MODE,
    );
    const createExportSource =
      data.exportSource ??
      (params.forceEventsOnCreate || !legacyWritesActive
        ? AnalyticsIntegrationExportSource.EVENTS
        : undefined);

    const result = await tx.blobStorageIntegration.upsert({
      where: { projectId },
      create: {
        ...writeData,
        exportSource: createExportSource,
        // Parquet is the default export format; apply it when the caller omits
        // fileType on CREATE. This app-level fallback (not the Prisma column
        // default) is the source of truth for the default across every write path.
        fileType: data.fileType ?? BlobStorageIntegrationFileType.PARQUET,
        projectId,
        secretAccessKey: encryptedSecret,
      },
      update: {
        ...writeData,
        // Only overwrite secretAccessKey when a new value is provided,
        // so partial updates don't wipe the existing encrypted secret.
        ...(encryptedSecret ? { secretAccessKey: encryptedSecret } : {}),
        // Schedule an immediate retry when saving an errored integration
        // so the scheduler picks it up via the nextSyncAt clause.
        ...(existing?.lastError && data.enabled && !modeChanged
          ? { nextSyncAt: new Date() }
          : {}),
        // Reset sync state when export mode changes so the new mode's
        // start-date logic takes effect instead of continuing from the
        // previous mode's lastSyncAt.
        ...(modeChanged ? { lastSyncAt: null, nextSyncAt: new Date() } : {}),
        // Saving enabled resets the failure-notification cooldown: the
        // customer just acted, so a fresh failure should email promptly.
        ...(data.enabled ? { lastFailureNotificationSentAt: null } : {}),
        runStartedAt: null,
      },
    });

    // Race-free backstop over the *persisted* row. The pre-flight `existing`
    // snapshot (and the router's pre-flight gate) are racy under READ
    // COMMITTED: a concurrent DELETE can flip this upsert to a CREATE after
    // those reads. `result.createdAt` reflects the actual CREATE/UPDATE
    // outcome (CREATE → now(); UPDATE → preserved), so validating it catches a
    // brand-new post-cutoff Cloud row born with a legacy source and rolls the
    // transaction back. See export-source-policy.ts.
    const backstop = validateExportSource(result.exportSource, {
      isCloud: !isSelfHosted,
      enrichedAvailable: true,
      legacyWritesActive,
      integrationCreatedAt: params.refuseLegacyOnCreate
        ? result.createdAt
        : undefined,
    });
    if (!backstop.ok) {
      throw new InvalidRequestError(backstop.message);
    }

    return result;
  });
}
