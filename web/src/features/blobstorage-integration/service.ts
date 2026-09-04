import { type PrismaClient } from "@langfuse/shared/src/db";
import {
  BlobStorageExportMode,
  BlobStorageIntegrationType,
  InvalidRequestError,
  type AnalyticsIntegrationExportSource,
  BlobStorageIntegrationFileType,
  type ObservationFieldGroupFull,
  BLOB_STORAGE_REGION_INVALID_MESSAGE,
  normalizeBlobStorageRegion,
} from "@langfuse/shared";
import { assertPersistedExportSourceAllowed } from "@/src/features/analytics-integrations/server/exportSource";
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
  // The source a CREATE lands, already validated and resolved by the caller via
  // resolveExportSource. Always concrete, so the CREATE branch never falls
  // through to the Prisma column default (TRACES_OBSERVATIONS). An UPDATE keeps
  // using data.exportSource, where undefined preserves the persisted value.
  createExportSource: AnalyticsIntegrationExportSource;
}) {
  const { prisma, projectId, data } = params;

  const isSelfHosted = !env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION;
  const canUseHostCredentials =
    isSelfHosted && data.type === BlobStorageIntegrationType.S3;

  const accessKeyId = data.accessKeyId?.trim() || null;
  const secretAccessKey = data.secretAccessKey?.trim() || null;
  let region: string;
  try {
    region = normalizeBlobStorageRegion(data.region);
  } catch {
    throw new InvalidRequestError(BLOB_STORAGE_REGION_INVALID_MESSAGE);
  }

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
    region,
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
      // createdAt/exportSource feed the post-upsert backstop below.
      select: {
        exportMode: true,
        lastError: true,
        runStartedAt: true,
        createdAt: true,
        exportSource: true,
      },
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

    // The CREATE payload always carries a concrete source, resolved by the
    // caller through resolveExportSource. Applying it unconditionally (rather
    // than behind a `!existing` guard) closes a TOCTOU: under READ COMMITTED,
    // tx.findUnique and tx.upsert take independent snapshots, so a concurrent
    // DELETE between the two could otherwise leave this undefined and let
    // Postgres apply the @default(TRACES_OBSERVATIONS) column default on INSERT.
    // ON CONFLICT decides CREATE vs UPDATE atomically regardless of what
    // findUnique saw, and UPDATE uses writeData.exportSource (undefined → Prisma
    // omits the column → preserves the existing value), so caller intent is
    // honored on both paths.
    const result = await tx.blobStorageIntegration.upsert({
      where: { projectId },
      create: {
        ...writeData,
        exportSource: params.createExportSource,
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

    // Race-free backstop over the row that actually landed, shared with the
    // PostHog and Mixpanel routers. The pre-flight `existing` snapshot (and the
    // router's pre-flight gate) are racy under READ COMMITTED: a concurrent
    // DELETE can flip this upsert to a CREATE after those reads. Throwing here
    // rolls the transaction back. See export-source-policy.ts.
    assertPersistedExportSourceAllowed({
      existingIntegration: existing,
      result,
    });

    return result;
  });
}
