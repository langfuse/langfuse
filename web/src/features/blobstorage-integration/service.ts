import { type PrismaClient } from "@langfuse/shared/src/db";
import {
  BlobStorageExportMode,
  BlobStorageIntegrationType,
  InvalidRequestError,
  AnalyticsIntegrationExportSource,
  type BlobStorageIntegrationFileType,
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
  fileType: BlobStorageIntegrationFileType;
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
      void _exhaustive;
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
}) {
  const { prisma, projectId, data } = params;

  const isSelfHosted = !env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION;
  const canUseHostCredentials =
    isSelfHosted && data.type === BlobStorageIntegrationType.S3;

  if (data.endpoint) {
    try {
      await validateBlobStorageEndpoint(data.endpoint);
    } catch (error) {
      throw new InvalidRequestError(
        `Invalid blob storage endpoint: ${error instanceof Error ? error.message : "Endpoint validation failed"}`,
      );
    }
  }

  if (!canUseHostCredentials && !data.accessKeyId) {
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
    accessKeyId: data.accessKeyId,
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
      select: { exportMode: true },
    });

    // Require secret key for new integrations (unless using host credentials)
    if (!existing) {
      const isUsingHostCredentials =
        canUseHostCredentials && (!data.accessKeyId || !data.secretAccessKey);
      if (!isUsingHostCredentials && !data.secretAccessKey) {
        throw new InvalidRequestError(
          "Secret access key is required for new configuration",
        );
      }
    }

    const modeChanged = existing && existing.exportMode !== data.exportMode;
    const encryptedSecret = data.secretAccessKey
      ? encrypt(data.secretAccessKey)
      : null;

    // exportSource for the CREATE payload. The !existing guard was previously
    // here, but it created a residual TOCTOU: READ COMMITTED isolation means
    // tx.findUnique and tx.upsert take independent snapshots, so a concurrent
    // DELETE between the two could leave createExportSource = undefined and let
    // Postgres apply the @default(TRACES_OBSERVATIONS) column default on INSERT.
    // Dropping the guard is safe: ON CONFLICT atomically decides CREATE vs UPDATE
    // at INSERT time regardless of what findUnique saw. UPDATE uses
    // writeData.exportSource (undefined → Prisma omits the column → preserves
    // the existing value), so the caller intent is always honored on both paths.
    const createExportSource =
      data.exportSource ??
      (params.forceEventsOnCreate
        ? AnalyticsIntegrationExportSource.EVENTS
        : undefined);

    return tx.blobStorageIntegration.upsert({
      where: { projectId },
      create: {
        ...writeData,
        exportSource: createExportSource,
        projectId,
        secretAccessKey: encryptedSecret,
      },
      update: {
        ...writeData,
        // Only overwrite secretAccessKey when a new value is provided,
        // so partial updates don't wipe the existing encrypted secret.
        ...(encryptedSecret ? { secretAccessKey: encryptedSecret } : {}),
        // Reset sync state when export mode changes so the new mode's
        // start-date logic takes effect instead of continuing from the
        // previous mode's lastSyncAt.
        ...(modeChanged ? { lastSyncAt: null, nextSyncAt: null } : {}),
      },
    });
  });
}
