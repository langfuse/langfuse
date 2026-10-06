import {
  BLOB_STORAGE_REGION_INVALID_MESSAGE,
  BlobStorageIntegrationType,
  ForbiddenError,
  InvalidRequestError,
  isS3KeyWithinPrefix,
  normalizeBlobStorageRegion,
  parseS3Uri,
} from "@langfuse/shared";
import { decrypt, encrypt } from "@langfuse/shared/encryption";
import { type PrismaClient } from "@langfuse/shared/src/db";
import {
  StorageServiceFactory,
  externalMediaStorageEndpointConnectionValidationOptions,
  validateExternalMediaStorageEndpoint,
} from "@langfuse/shared/src/server";

import { getDisplayCredential } from "@/src/features/analytics-integrations/server";
import { auditLog } from "@/src/features/audit-logs/server";
import { type ExternalMediaStorageFormValues } from "@/src/features/external-media-storage/types";
import {
  createExternalMediaStorageRepository,
  type ExternalMediaStorageRecord,
} from "@/src/features/external-media-storage/server/repository";

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

function createStorageService(integration: ExternalMediaStorageRecord) {
  return StorageServiceFactory.getInstance({
    accessKeyId: integration.accessKeyId ?? undefined,
    secretAccessKey: integration.secretAccessKey
      ? decrypt(integration.secretAccessKey)
      : undefined,
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
      externalMediaStorageEndpointConnectionValidationOptions(),
  });
}

export function createExternalMediaStorageService(prisma: PrismaClient) {
  const repository = createExternalMediaStorageRepository(prisma);
  const assertFeatureEnabled = async (projectId: string) => {
    if (!(await repository.isFeatureEnabled(projectId))) {
      throw new ForbiddenError(
        "External media storage is not enabled for this organization",
      );
    }
  };

  return {
    isFeatureEnabled(projectId: string) {
      return repository.isFeatureEnabled(projectId);
    },

    async getConfiguration(projectId: string) {
      await assertFeatureEnabled(projectId);
      const integration = await repository.findByProjectId(projectId);
      if (!integration) return null;

      const { secretAccessKey, ...configuration } = integration;
      return {
        ...configuration,
        secretAccessKeyDisplay: secretAccessKey
          ? getDisplayCredential(decrypt(secretAccessKey))
          : null,
      };
    },

    async saveConfiguration({
      actor,
      projectId,
      values,
    }: {
      actor: ExternalMediaStorageAuditActor;
      projectId: string;
      values: ExternalMediaStorageFormValues;
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
        await validateExternalMediaStorageEndpoint(endpoint);
      }

      let region: string;
      try {
        region = normalizeBlobStorageRegion(values.region);
      } catch {
        throw new InvalidRequestError(BLOB_STORAGE_REGION_INVALID_MESSAGE);
      }

      const existing = await repository.findByProjectId(projectId);
      const accessKeyId = values.accessKeyId?.trim() || null;
      const secretAccessKey = values.secretAccessKey?.trim() || null;
      const encryptedSecretAccessKey = secretAccessKey
        ? encrypt(secretAccessKey)
        : existing?.secretAccessKey;

      if (!accessKeyId || !encryptedSecretAccessKey) {
        throw new InvalidRequestError(
          "Access Key ID and Secret Access Key are required",
        );
      }

      await repository.upsert({
        projectId,
        data: {
          type: values.type,
          bucketName: values.bucketName.trim(),
          prefix: values.prefix?.trim() || null,
          accessKeyId,
          secretAccessKey: encryptedSecretAccessKey ?? null,
          region,
          endpoint,
          forcePathStyle:
            values.type === BlobStorageIntegrationType.S3_COMPATIBLE
              ? values.forcePathStyle
              : false,
          enabled: values.enabled,
        },
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

      const integration = await repository.findEnabledByProjectAndBucket({
        projectId,
        bucketName: parsed.bucket,
      });
      if (!integration || !isKeyWithinPrefix(parsed.key, integration.prefix)) {
        throw new InvalidRequestError("External media is not available");
      }

      if (integration.endpoint) {
        await validateExternalMediaStorageEndpoint(integration.endpoint);
      }

      const url = await createStorageService(integration).getSignedUrl(
        parsed.key,
        EXTERNAL_MEDIA_URL_TTL_SECONDS,
        false,
      );

      return {
        url,
        expiresAt: new Date(Date.now() + EXTERNAL_MEDIA_URL_TTL_SECONDS * 1000),
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

      const integration = await repository.findEnabledByProjectAndBucket({
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
        await validateExternalMediaStorageEndpoint(integration.endpoint);
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
