import {
  BLOB_STORAGE_REGION_INVALID_MESSAGE,
  BlobStorageIntegrationType,
  ForbiddenError,
  InvalidRequestError,
  isS3KeyWithinPrefix,
  normalizeBlobStorageRegion,
  parseS3Uri,
  StorageIntegrationAuthType,
} from "@langfuse/shared";
import { decrypt, encrypt } from "@langfuse/shared/encryption";
import { type PrismaClient } from "@langfuse/shared/src/db";
import {
  OutboundUrlValidationError,
  StorageServiceFactory,
  storageKeys,
  externalMediaStorageEndpointConnectionValidationOptions,
  validateExternalMediaStorageEndpoint,
} from "@langfuse/shared/src/server";
import { generateCustomerRoleExternalId } from "@langfuse/shared/src/server/ee/customerRoleAuth/customerRoleCredentials";
import {
  assertStorageRolePartition,
  getCrossAccountRoleArn,
  getStorageRoleCredentialsProvider,
} from "@langfuse/shared/src/server/ee/storageRoleAuth/storageRoleCredentials";
import {
  STORAGE_SESSION_POLICY_MAX_LENGTH,
  buildStorageReadSessionPolicy,
} from "@langfuse/shared/src/server/ee/storageRoleAuth/storageSessionPolicy";

import { getDisplayCredential } from "@/src/features/analytics-integrations/server/displayCredential";
import { auditLog } from "@/src/features/audit-logs/auditLog";
import { isSameStorageDestination } from "@/src/features/automations/destinationUrl";
import { type ExternalMediaStorageFormValues } from "@/src/ee/features/external-media-storage/types";
import { hasExternalMediaStorageAccess } from "@/src/ee/features/external-media-storage/server/hasExternalMediaStorageAccess";
import {
  createExternalMediaStorageRepository,
  type ExternalMediaStorageRecord,
} from "@/src/ee/features/external-media-storage/server/repository";

const EXTERNAL_MEDIA_URL_TTL_SECONDS = 5 * 60;

type AuditLogInput = Parameters<typeof auditLog>[0];
type AuditLogSession = Extract<AuditLogInput, { session: unknown }>["session"];

export type ExternalMediaStorageAuditActor =
  | { session: AuditLogSession }
  | { apiKeyId: string; orgId: string };

async function auditConfigurationChange({
  action,
  actor,
  projectId,
}: {
  action: "update" | "delete";
  actor: ExternalMediaStorageAuditActor;
  projectId: string;
}) {
  const event = {
    action,
    resourceType: "externalMediaStorageIntegration" as const,
    resourceId: projectId,
  };

  await auditLog(
    "session" in actor
      ? { ...event, session: actor.session }
      : { ...event, ...actor, projectId },
  );
}

function isKeyWithinPrefix(key: string, prefix: string | null) {
  const normalizedPrefix = prefix?.trim().replace(/\/+$/, "");
  return !normalizedPrefix || isS3KeyWithinPrefix(key, normalizedPrefix);
}

async function validateEndpoint(endpoint: string) {
  try {
    await validateExternalMediaStorageEndpoint(endpoint);
  } catch (error) {
    if (error instanceof OutboundUrlValidationError) {
      throw new InvalidRequestError(error.message);
    }
    throw error;
  }
}

function assertRoleAuthAvailable() {
  if (!getCrossAccountRoleArn()) {
    throw new InvalidRequestError(
      "IAM role auth is not available on this Langfuse deployment",
    );
  }
}

function getRoleCredentials(integration: ExternalMediaStorageRecord) {
  assertRoleAuthAvailable();
  if (!integration.roleArn || !integration.externalId) {
    throw new InvalidRequestError("The IAM role is not configured");
  }
  return getStorageRoleCredentialsProvider({
    cacheKey: `external-media-storage:${integration.projectId}`,
    version: integration.updatedAt.toISOString(),
    roleArn: integration.roleArn,
    externalId: decrypt(integration.externalId),
    projectId: integration.projectId,
    orgId: integration.project.orgId,
    sessionPolicy: buildStorageReadSessionPolicy({
      roleArn: integration.roleArn,
      bucketName: integration.bucketName,
      prefix: integration.prefix,
      region: integration.region,
    }),
  });
}

function createStorageService(integration: ExternalMediaStorageRecord) {
  const usesRole = integration.authType === StorageIntegrationAuthType.ROLE_ARN;
  const secretAccessKey =
    !usesRole && integration.secretAccessKey
      ? decrypt(integration.secretAccessKey)
      : undefined;
  return StorageServiceFactory.getInstance({
    credentials: usesRole
      ? { type: "role", provider: getRoleCredentials(integration) }
      : storageKeys(integration.accessKeyId ?? undefined, secretAccessKey),
    bucketName: integration.bucketName,
    endpoint: integration.endpoint ?? undefined,
    region: integration.region,
    forcePathStyle: integration.forcePathStyle,
    useAzureBlob: false,
    useGoogleCloudStorage: false,
    useOCIObjectStorage: false,
    googleCloudCredentials: undefined,
    awsSse: undefined,
    awsSseKmsKeyId: undefined,
    externalEndpoint: undefined,
    connectionValidation:
      externalMediaStorageEndpointConnectionValidationOptions({
        endpoint: integration.endpoint,
        bucketName: integration.bucketName,
        forcePathStyle: integration.forcePathStyle,
        region: integration.region,
      }),
  });
}

function getRoleAuthData({
  values,
  bucketName,
  region,
  existingExternalId,
  canUseRoleAuth,
}: {
  values: ExternalMediaStorageFormValues;
  bucketName: string;
  region: string;
  existingExternalId: string | null | undefined;
  canUseRoleAuth: boolean;
}) {
  assertRoleAuthAvailable();
  if (!canUseRoleAuth) {
    throw new ForbiddenError("IAM role auth requires an Enterprise plan");
  }
  // externalMediaStorageFormSchema already checked the type, region, ARN and
  // prefix.
  const roleArn = values.roleArn ?? "";
  assertStorageRolePartition(roleArn);
  const prefix = values.prefix?.trim() || null;
  const sessionPolicy = buildStorageReadSessionPolicy({
    roleArn,
    bucketName,
    prefix,
    region,
  });
  if (sessionPolicy.length > STORAGE_SESSION_POLICY_MAX_LENGTH) {
    throw new InvalidRequestError("The media prefix is too long");
  }

  return {
    authType: StorageIntegrationAuthType.ROLE_ARN,
    roleArn,
    // The external ID stays stable so the customer's trust policy keeps working.
    externalId: existingExternalId ?? encrypt(generateCustomerRoleExternalId()),
    accessKeyId: null,
    secretAccessKey: null,
    endpoint: null,
    forcePathStyle: false,
  };
}

function getAccessKeyAuthData({
  values,
  bucketName,
  endpoint,
  existing,
}: {
  values: ExternalMediaStorageFormValues;
  bucketName: string;
  endpoint: string | null;
  existing: ExternalMediaStorageRecord | null;
}) {
  const accessKeyId = values.accessKeyId?.trim() || null;
  const secretAccessKey = values.secretAccessKey?.trim() || null;

  // A stored secret is only used with the storage it was entered for.
  if (
    !secretAccessKey &&
    existing?.secretAccessKey &&
    !isSameStorageDestination(existing, {
      type: values.type,
      endpoint,
      bucketName,
      accessKeyId,
    })
  ) {
    throw new InvalidRequestError(
      "Secret Access Key is required when changing the storage provider, bucket, endpoint, or Access Key ID",
    );
  }

  const encryptedSecretAccessKey = secretAccessKey
    ? encrypt(secretAccessKey)
    : existing?.secretAccessKey;

  if (!accessKeyId || !encryptedSecretAccessKey) {
    throw new InvalidRequestError(
      "Access Key ID and Secret Access Key are required",
    );
  }

  return {
    authType: StorageIntegrationAuthType.ACCESS_KEYS,
    accessKeyId,
    secretAccessKey: encryptedSecretAccessKey,
    endpoint,
    forcePathStyle:
      values.type === BlobStorageIntegrationType.S3_COMPATIBLE
        ? values.forcePathStyle
        : false,
  };
}

export function createExternalMediaStorageService(prisma: PrismaClient) {
  const repository = createExternalMediaStorageRepository(prisma);
  const isFeatureEnabled = async (projectId: string) => {
    const organization =
      await repository.findOrganizationByProjectId(projectId);
    return organization ? hasExternalMediaStorageAccess(organization) : false;
  };
  const assertFeatureEnabled = async (projectId: string) => {
    if (!(await isFeatureEnabled(projectId))) {
      throw new ForbiddenError(
        "External media storage is an Enterprise feature. Upgrade your plan to use it.",
      );
    }
  };

  return {
    isFeatureEnabled,

    async getConfiguration(projectId: string) {
      await assertFeatureEnabled(projectId);
      const integration = await repository.findByProjectId(projectId);
      if (!integration) return null;

      const {
        secretAccessKey,
        externalId,
        project: _project,
        ...configuration
      } = integration;
      return {
        ...configuration,
        // The external ID itself is only returned by getExternalId, on demand.
        hasExternalId: Boolean(externalId),
        secretAccessKeyDisplay: secretAccessKey
          ? getDisplayCredential(decrypt(secretAccessKey))
          : null,
      };
    },

    async getExternalId(projectId: string) {
      await assertFeatureEnabled(projectId);
      const integration = await repository.findByProjectId(projectId);
      return integration?.externalId ? decrypt(integration.externalId) : null;
    },

    async saveConfiguration({
      actor,
      projectId,
      values,
      canUseRoleAuth,
    }: {
      actor: ExternalMediaStorageAuditActor;
      projectId: string;
      values: ExternalMediaStorageFormValues;
      // Whether the organization's plan includes IAM role auth.
      canUseRoleAuth: boolean;
    }) {
      await assertFeatureEnabled(projectId);
      const endpoint =
        values.type === BlobStorageIntegrationType.S3_COMPATIBLE
          ? values.endpoint?.trim() || null
          : null;
      if (
        values.type === BlobStorageIntegrationType.S3_COMPATIBLE &&
        !endpoint
      ) {
        throw new InvalidRequestError(
          "Endpoint URL is required for S3-compatible storage",
        );
      }
      if (endpoint) {
        await validateEndpoint(endpoint);
      }

      let region: string;
      try {
        region = normalizeBlobStorageRegion(values.region);
      } catch {
        throw new InvalidRequestError(BLOB_STORAGE_REGION_INVALID_MESSAGE);
      }

      const existing = await repository.findByProjectId(projectId);
      const bucketName = values.bucketName.trim();
      const prefix = values.prefix?.trim() || null;

      const authData =
        values.authType === StorageIntegrationAuthType.ROLE_ARN
          ? getRoleAuthData({
              values,
              bucketName,
              region,
              existingExternalId: existing?.externalId,
              canUseRoleAuth,
            })
          : getAccessKeyAuthData({ values, bucketName, endpoint, existing });

      await repository.upsert({
        projectId,
        data: { type: values.type, bucketName, prefix, region, ...authData },
      });

      await auditConfigurationChange({ action: "update", actor, projectId });
    },

    async deleteConfiguration({
      actor,
      projectId,
    }: {
      actor: ExternalMediaStorageAuditActor;
      projectId: string;
    }) {
      await assertFeatureEnabled(projectId);
      const existing = await repository.findByProjectId(projectId);
      if (!existing) {
        throw new InvalidRequestError(
          "External media storage integration not found",
        );
      }
      await repository.deleteByProjectId(projectId);
      await auditConfigurationChange({ action: "delete", actor, projectId });
    },

    async resolveUrl({ projectId, uri }: { projectId: string; uri: string }) {
      await assertFeatureEnabled(projectId);
      const parsed = parseS3Uri(uri);
      if (!parsed) {
        throw new InvalidRequestError(
          "External media must use s3://<bucket>/<key>",
        );
      }

      const integration = await repository.findByProjectAndBucket({
        projectId,
        bucketName: parsed.bucket,
      });
      if (!integration || !isKeyWithinPrefix(parsed.key, integration.prefix)) {
        throw new InvalidRequestError("External media is not available");
      }

      if (integration.endpoint) {
        await validateEndpoint(integration.endpoint);
      }

      const storageService = createStorageService(integration);
      const [url, contentLength] = await Promise.all([
        storageService.getSignedUrl(
          parsed.key,
          EXTERNAL_MEDIA_URL_TTL_SECONDS,
          false,
        ),
        storageService
          .getObjectContentLength(parsed.key)
          .catch(() => undefined),
      ]);

      return {
        url,
        contentLength,
        urlTtlSeconds: EXTERNAL_MEDIA_URL_TTL_SECONDS,
      };
    },

    async testObject({ projectId, uri }: { projectId: string; uri: string }) {
      await assertFeatureEnabled(projectId);
      const parsed = parseS3Uri(uri);
      if (!parsed) {
        throw new InvalidRequestError(
          "External media must use s3://<bucket>/<key>",
        );
      }

      const integration = await repository.findByProjectAndBucket({
        projectId,
        bucketName: parsed.bucket,
      });
      if (!integration) {
        throw new InvalidRequestError(
          "The external media storage integration is not available",
        );
      }
      if (!isKeyWithinPrefix(parsed.key, integration.prefix)) {
        throw new InvalidRequestError(
          "The media object must be within the configured prefix",
        );
      }

      if (integration.endpoint) {
        await validateEndpoint(integration.endpoint);
      }

      if (integration.authType === StorageIntegrationAuthType.ROLE_ARN) {
        assertRoleAuthAvailable();
      }

      const storageService = createStorageService(integration);
      const signedUrl = await storageService.getSignedUrl(
        parsed.key,
        EXTERNAL_MEDIA_URL_TTL_SECONDS,
        false,
      );

      return { signedUrl };
    },
  };
}
