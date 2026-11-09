import { type PrismaClient } from "@langfuse/shared/src/db";
import {
  BlobStorageExportMode,
  BlobStorageIntegrationType,
  ForbiddenError,
  InvalidRequestError,
  type AnalyticsIntegrationExportSource,
  BlobStorageIntegrationFileType,
  type ExportFieldGroup,
  BLOB_STORAGE_REGION_INVALID_MESSAGE,
  normalizeBlobStorageRegion,
  GCPServiceAccountKeySchema,
  GCS_USE_DEFAULT_CREDENTIALS,
  STORAGE_ROLE_ARN_INVALID_MESSAGE,
  STORAGE_ROLE_ARN_REGEX,
  STORAGE_ROLE_PREFIX_INVALID_MESSAGE,
  STORAGE_ROLE_PREFIX_REGEX,
  StorageIntegrationAuthType,
} from "@langfuse/shared";
import { assertPersistedExportSourceAllowed } from "@/src/features/analytics-integrations/server/exportSource";
import { isSameStorageDestination } from "@/src/features/automations/destinationUrl";
import { encrypt } from "@langfuse/shared/encryption";
import { env } from "@/src/env.mjs";
import {
  assertGcsBlobStorageBucketAllowed,
  validateBlobStorageBucketHost,
  validateBlobStorageEndpoint,
} from "@langfuse/shared/src/server";
import { generateCustomerRoleExternalId } from "@langfuse/shared/src/server/ee/customerRoleAuth/customerRoleCredentials";
import {
  assertStorageRolePartition,
  getCrossAccountRoleArn,
} from "@langfuse/shared/src/server/ee/storageRoleAuth/storageRoleCredentials";
import {
  STORAGE_SESSION_POLICY_MAX_LENGTH,
  buildStorageWriteSessionPolicy,
} from "@langfuse/shared/src/server/ee/storageRoleAuth/storageSessionPolicy";

type UpsertBlobStorageIntegrationInput = {
  type: BlobStorageIntegrationType;
  bucketName: string;
  endpoint: string | null;
  region: string;
  // Undefined means access keys.
  authType?: StorageIntegrationAuthType;
  accessKeyId: string | null;
  secretAccessKey: string | null; // plain text — encrypted by this service
  roleArn?: string | null;
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
  exportFieldGroups?: ExportFieldGroup[];
  compressed?: boolean;
};

// Same shape check the Vertex AI LLM connection applies to its JSON key.
function assertValidGcsServiceAccountKey(secret: string): void {
  let parsed: unknown;
  try {
    parsed = JSON.parse(secret);
  } catch {
    throw new InvalidRequestError(
      "GCS credentials must be a GCP service account JSON key",
    );
  }
  if (!GCPServiceAccountKeySchema.safeParse(parsed).success) {
    throw new InvalidRequestError("Invalid GCP service account JSON key");
  }
}

// Which providers can read each other's stored secret. S3 and S3-compatible
// share the access key shape; an Azure account key and a GCS JSON key do not.
function secretFamily(type: BlobStorageIntegrationType) {
  switch (type) {
    case BlobStorageIntegrationType.S3:
    case BlobStorageIntegrationType.S3_COMPATIBLE:
      return "s3";
    case BlobStorageIntegrationType.AZURE_BLOB_STORAGE:
      return "azure";
    case BlobStorageIntegrationType.GOOGLE_CLOUD_STORAGE:
      return "gcs";
    default: {
      const _exhaustive: never = type;
      _exhaustive;
      return null;
    }
  }
}

// Returns the validated role ARN for an IAM role auth integration.
function validateRoleAuthInput(params: {
  type: BlobStorageIntegrationType;
  roleArn: string | null | undefined;
  bucketName: string;
  prefix: string;
  region: string;
  canUseRoleAuth: boolean;
  // The stored role ARN when the integration already uses IAM role auth.
  storedRoleArn: string | null;
}): string {
  const roleArn = params.roleArn?.trim() ?? "";
  // Saves that keep the stored role (e.g. pausing the export) stay possible
  // after a plan downgrade or once the deployment drops IAM role auth.
  if (roleArn !== params.storedRoleArn) {
    if (!getCrossAccountRoleArn()) {
      throw new InvalidRequestError(
        "IAM role auth is not available on this Langfuse deployment",
      );
    }
    if (!params.canUseRoleAuth) {
      throw new ForbiddenError("IAM role auth requires an Enterprise plan");
    }
  }
  if (params.type !== BlobStorageIntegrationType.S3) {
    throw new InvalidRequestError(
      "IAM role auth is only available for Amazon S3",
    );
  }
  if (params.region.toLowerCase() === "auto") {
    throw new InvalidRequestError(
      "IAM role auth requires the bucket's AWS region",
    );
  }
  if (!STORAGE_ROLE_ARN_REGEX.test(roleArn)) {
    throw new InvalidRequestError(STORAGE_ROLE_ARN_INVALID_MESSAGE);
  }
  if (!STORAGE_ROLE_PREFIX_REGEX.test(params.prefix)) {
    throw new InvalidRequestError(STORAGE_ROLE_PREFIX_INVALID_MESSAGE);
  }
  assertStorageRolePartition(roleArn);
  const sessionPolicy = buildStorageWriteSessionPolicy({
    roleArn,
    bucketName: params.bucketName,
    prefix: params.prefix,
    region: params.region,
  });
  if (sessionPolicy.length > STORAGE_SESSION_POLICY_MAX_LENGTH) {
    throw new InvalidRequestError("The export prefix is too long");
  }
  return roleArn;
}

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
  // Whether the organization's plan includes IAM role auth.
  canUseRoleAuth: boolean;
}) {
  const { prisma, projectId, data } = params;

  const isSelfHosted = !env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION;
  const isGcs = data.type === BlobStorageIntegrationType.GOOGLE_CLOUD_STORAGE;
  const usesRole = data.authType === StorageIntegrationAuthType.ROLE_ARN;
  const canUseHostCredentials =
    isSelfHosted && data.type === BlobStorageIntegrationType.S3;

  // GCS, like the Vertex AI LLM connection, takes either a service account JSON
  // key (stored encrypted, in secretAccessKey) or the default-credentials
  // sentinel (ADC; self-hosted only, bucket must be allowlisted). An omitted
  // secret on UPDATE keeps whatever is stored. GCS never uses accessKeyId.
  // The sentinel is never a real secret: the form keeps it when the provider is
  // switched away from GCS, so treat it as "no secret" for every type.
  const rawSecret = usesRole ? null : data.secretAccessKey?.trim() || null;
  const isSentinel = rawSecret === GCS_USE_DEFAULT_CREDENTIALS;
  const isKeylessGcs = isGcs && isSentinel;
  const secretAccessKey = isSentinel ? null : rawSecret;
  if (isGcs && secretAccessKey) {
    assertValidGcsServiceAccountKey(secretAccessKey);
  }

  const accessKeyId =
    isGcs || usesRole ? null : data.accessKeyId?.trim() || null;
  // The GCS client always talks to Google, and IAM role auth is Amazon S3
  // only, so an endpoint (e.g. one the form kept from another provider) is
  // neither validated nor stored.
  const endpoint = isGcs || usesRole ? null : data.endpoint;
  let region: string;
  try {
    region = normalizeBlobStorageRegion(data.region);
  } catch {
    throw new InvalidRequestError(BLOB_STORAGE_REGION_INVALID_MESSAGE);
  }
  const storedRole = usesRole
    ? await prisma.blobStorageIntegration.findUnique({
        where: { projectId },
        select: { authType: true, roleArn: true },
      })
    : null;
  const roleArn = usesRole
    ? validateRoleAuthInput({
        type: data.type,
        roleArn: data.roleArn,
        bucketName: data.bucketName,
        prefix: data.prefix,
        region,
        canUseRoleAuth: params.canUseRoleAuth,
        storedRoleArn:
          storedRole?.authType === StorageIntegrationAuthType.ROLE_ARN
            ? storedRole.roleArn
            : null,
      })
    : null;

  if (endpoint) {
    try {
      await validateBlobStorageEndpoint(endpoint);
      await validateBlobStorageBucketHost({
        type: data.type,
        endpoint,
        bucketName: data.bucketName,
        forcePathStyle: data.forcePathStyle,
      });
    } catch (error) {
      throw new InvalidRequestError(
        `Invalid blob storage endpoint: ${error instanceof Error ? error.message : "Endpoint validation failed"}`,
      );
    }
  }

  if (!isGcs && !usesRole && !canUseHostCredentials && !accessKeyId) {
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
    endpoint,
    region,
    authType: usesRole
      ? StorageIntegrationAuthType.ROLE_ARN
      : StorageIntegrationAuthType.ACCESS_KEYS,
    accessKeyId,
    // Access-key saves keep the role ARN and external ID, so switching back
    // does not invalidate the customer's trust policy.
    ...(roleArn ? { roleArn } : {}),
    prefix: data.prefix,
    exportFrequency: data.exportFrequency,
    enabled: data.enabled,
    forcePathStyle: usesRole ? false : data.forcePathStyle,
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
      // createdAt/exportSource feed the post-upsert backstop below; the
      // destination fields and secretAccessKey decide whether an update keeps
      // a stored secret.
      select: {
        enabled: true,
        exportMode: true,
        lastError: true,
        runStartedAt: true,
        createdAt: true,
        exportSource: true,
        type: true,
        bucketName: true,
        endpoint: true,
        accessKeyId: true,
        secretAccessKey: true,
        externalId: true,
      },
    });

    // A stored secret is only reusable within the same credential family, and
    // only for the destination it was entered for.
    const hasStoredSecretOfFamily =
      !!existing?.secretAccessKey &&
      secretFamily(existing.type) === secretFamily(data.type);
    const canKeepStoredSecret =
      hasStoredSecretOfFamily &&
      isSameStorageDestination(existing, {
        type: data.type,
        bucketName: data.bucketName,
        endpoint,
        accessKeyId,
      });
    // Switching a self-hosted S3 integration to host credentials drops the
    // stored secret instead of asking for it again.
    const isSwitchingToHostCredentials = canUseHostCredentials && !accessKeyId;
    if (
      !usesRole &&
      hasStoredSecretOfFamily &&
      !canKeepStoredSecret &&
      !secretAccessKey &&
      !isKeylessGcs &&
      !isSwitchingToHostCredentials
    ) {
      throw new InvalidRequestError(
        "Secret access key is required when changing the storage provider, bucket, endpoint, or access key ID",
      );
    }
    // A GCS integration that will run keyless: explicitly requested, or an
    // update that sends no secret and has no stored GCS key to keep. Keyless
    // runs as the deployment identity, so it is gated by the bucket allowlist.
    const willRunKeyless =
      isGcs && (isKeylessGcs || (!secretAccessKey && !canKeepStoredSecret));
    if (willRunKeyless) {
      try {
        assertGcsBlobStorageBucketAllowed(data.bucketName);
      } catch (error) {
        throw new InvalidRequestError(
          error instanceof Error ? error.message : "GCS bucket not allowed",
        );
      }
    }

    // New GCS integrations must pick a mode explicitly.
    if (!existing && isGcs && !isKeylessGcs && !secretAccessKey) {
      throw new InvalidRequestError(
        "A GCP service account JSON key or default credentials is required",
      );
    }
    // S3/Azure need a secret (new, or a reusable stored one) unless using host
    // credentials.
    const isUsingHostCredentials =
      canUseHostCredentials && (!accessKeyId || !secretAccessKey);
    if (
      !isGcs &&
      !usesRole &&
      !isUsingHostCredentials &&
      !secretAccessKey &&
      !canKeepStoredSecret
    ) {
      throw new InvalidRequestError("Secret access key is required");
    }

    // A new external ID cannot be in the customer's trust policy yet, so the
    // first export would fail with AccessDenied and auto-disable the
    // integration. Save it disabled until the customer finishes setup.
    const mintsExternalId = usesRole && !existing?.externalId;
    const enabled = data.enabled && !mintsExternalId;
    const modeChanged = existing && existing.exportMode !== data.exportMode;
    const justEnabled = enabled && !existing?.enabled;
    const encryptedSecret = secretAccessKey ? encrypt(secretAccessKey) : null;
    // An update without a new secret writes back the stored secret checked
    // above, never omits the column: a concurrent save that changed the secret
    // in between must not end up paired with this request's destination.
    // Keyless GCS, or a destination the stored secret was not entered for,
    // clears it.
    const nextSecretAccessKey =
      encryptedSecret ??
      (canKeepStoredSecret && !willRunKeyless && !usesRole
        ? existing.secretAccessKey
        : null);
    // Minted once and kept stable so the customer's trust policy keeps working.
    const externalId = usesRole
      ? (existing?.externalId ?? encrypt(generateCustomerRoleExternalId()))
      : undefined;

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
        enabled,
        exportSource: params.createExportSource,
        // Parquet is the default export format; apply it when the caller omits
        // fileType on CREATE. This app-level fallback (not the Prisma column
        // default) is the source of truth for the default across every write path.
        fileType: data.fileType ?? BlobStorageIntegrationFileType.PARQUET,
        projectId,
        secretAccessKey: encryptedSecret,
        externalId,
      },
      update: {
        ...writeData,
        enabled,
        secretAccessKey: nextSecretAccessKey,
        externalId,
        // Schedule an immediate retry when saving an errored integration
        // so the scheduler picks it up via the nextSyncAt clause.
        ...(existing?.lastError && enabled && !modeChanged
          ? { nextSyncAt: new Date() }
          : {}),
        // Reset sync state when export mode changes so the new mode's
        // start-date logic takes effect instead of continuing from the
        // previous mode's lastSyncAt.
        ...(modeChanged ? { lastSyncAt: null, nextSyncAt: new Date() } : {}),
        // Both restart the export from history; the worker clears the flag
        // once it reaches the live tail. CREATE gets it from the column default.
        ...(modeChanged || justEnabled ? { backfill: true } : {}),
        // Saving enabled resets the failure-notification cooldown: the
        // customer just acted, so a fresh failure should email promptly.
        ...(enabled ? { lastFailureNotificationSentAt: null } : {}),
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
