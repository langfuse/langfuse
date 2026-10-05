import {
  type BlobStorageIntegration,
  InvalidRequestError,
  isS3KeyWithinPrefix,
  parseS3Uri,
} from "@langfuse/shared";
import { decrypt } from "@langfuse/shared/encryption";
import { type PrismaClient } from "@langfuse/shared/src/db";
import {
  StorageServiceFactory,
  blobStorageEndpointConnectionValidationOptions,
  validateBlobStorageEndpoint,
} from "@langfuse/shared/src/server";
import {
  findMatchingExternalMediaIntegration,
  findMediaEnabledS3IntegrationById,
} from "@/src/features/blobstorage-integration/server/blobStorageIntegrationRepository";

const EXTERNAL_MEDIA_URL_TTL_SECONDS = 5 * 60;

function isKeyWithinMediaScope(key: string, mediaPrefix: string | null) {
  const normalizedPrefix = mediaPrefix?.trim().replace(/\/+$/, "");
  return !normalizedPrefix || isS3KeyWithinPrefix(key, normalizedPrefix);
}

function createExternalMediaStorageService(
  integration: BlobStorageIntegration,
) {
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

export async function resolveExternalMediaUrl({
  prisma,
  projectId,
  uri,
}: {
  prisma: PrismaClient;
  projectId: string;
  uri: string;
}) {
  const parsed = parseS3Uri(uri);
  if (!parsed) {
    throw new InvalidRequestError(
      "External media must use s3://<bucket>/<key>",
    );
  }

  const integration = await findMatchingExternalMediaIntegration({
    prisma,
    projectId,
    bucketName: parsed.bucket,
    key: parsed.key,
  });

  if (
    !integration ||
    !isKeyWithinMediaScope(parsed.key, integration.mediaPrefix)
  ) {
    throw new InvalidRequestError("External media is not available");
  }

  if (integration.endpoint) {
    await validateBlobStorageEndpoint(integration.endpoint);
  }

  const storageService = createExternalMediaStorageService(integration);

  const url = await storageService.getSignedUrl(
    parsed.key,
    EXTERNAL_MEDIA_URL_TTL_SECONDS,
    false,
  );

  return {
    url,
    expiresAt: new Date(Date.now() + EXTERNAL_MEDIA_URL_TTL_SECONDS * 1000),
  };
}

export async function testExternalMediaObject({
  prisma,
  projectId,
  integrationId,
  uri,
}: {
  prisma: PrismaClient;
  projectId: string;
  integrationId: string;
  uri: string;
}) {
  const parsed = parseS3Uri(uri);
  if (!parsed) {
    throw new InvalidRequestError(
      "External media must use s3://<bucket>/<key>",
    );
  }

  const integration = await findMediaEnabledS3IntegrationById({
    prisma,
    projectId,
    integrationId,
  });
  if (!integration) {
    throw new InvalidRequestError(
      "The selected external media integration is not available",
    );
  }
  if (parsed.bucket !== integration.bucketName) {
    throw new InvalidRequestError(
      "The media object must use the selected integration bucket",
    );
  }
  if (!isKeyWithinMediaScope(parsed.key, integration.mediaPrefix)) {
    throw new InvalidRequestError(
      "The media object must be within the selected integration media prefix",
    );
  }

  if (integration.endpoint) {
    await validateBlobStorageEndpoint(integration.endpoint);
  }

  const storageService = createExternalMediaStorageService(integration);
  await storageService.verifyObjectAccess(parsed.key);
  const signedUrl = await storageService.getSignedUrl(
    parsed.key,
    EXTERNAL_MEDIA_URL_TTL_SECONDS,
    false,
  );

  return { signedUrl };
}
