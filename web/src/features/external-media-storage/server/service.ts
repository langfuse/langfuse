import {
  BLOB_STORAGE_REGION_INVALID_MESSAGE,
  BlobStorageIntegrationType,
  InvalidRequestError,
  isS3KeyWithinPrefix,
  normalizeBlobStorageRegion,
  parseS3Uri,
} from "@langfuse/shared";
import { decrypt, encrypt } from "@langfuse/shared/encryption";
import { type PrismaClient } from "@langfuse/shared/src/db";
import {
  StorageServiceFactory,
  blobStorageEndpointConnectionValidationOptions,
  validateBlobStorageEndpoint,
} from "@langfuse/shared/src/server";
import { type Session } from "next-auth";

import { env } from "@/src/env.mjs";
import { getDisplayCredential } from "@/src/features/analytics-integrations/server";
import { auditLog } from "@/src/features/audit-logs/server";
import { type ExternalMediaStorageFormValues } from "@/src/features/external-media-storage/types";
import {
  createExternalMediaStorageRepository,
  type ExternalMediaStorageRecord,
} from "@/src/features/external-media-storage/server/repository";

const EXTERNAL_MEDIA_URL_TTL_SECONDS = 5 * 60;

export type ExternalMediaStorageAuditActor =
  | { session: Session }
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
    connectionValidation: blobStorageEndpointConnectionValidationOptions(),
  });
}

export function createExternalMediaStorageService(prisma: PrismaClient) {
  const repository = createExternalMediaStorageRepository(prisma);

  return {
    async getConfiguration(projectId: string) {
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
      if (values.endpoint) {
        await validateBlobStorageEndpoint(values.endpoint);
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
      const canUseHostCredentials =
        !env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION &&
        values.type === BlobStorageIntegrationType.S3;

      if (
        !canUseHostCredentials &&
        (!accessKeyId || !encryptedSecretAccessKey)
      ) {
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
          endpoint: values.endpoint?.trim() || null,
          forcePathStyle: values.forcePathStyle,
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
        await validateBlobStorageEndpoint(integration.endpoint);
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
        await validateBlobStorageEndpoint(integration.endpoint);
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
