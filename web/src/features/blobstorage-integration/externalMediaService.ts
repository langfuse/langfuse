import {
  type BlobStorageIntegration,
  BlobStorageIntegrationType,
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

const EXTERNAL_MEDIA_URL_TTL_SECONDS = 5 * 60;

function isKeyWithinMediaScope(key: string, mediaPrefix: string | null) {
  return !mediaPrefix || isS3KeyWithinPrefix(key, mediaPrefix);
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

  const integrations = await prisma.blobStorageIntegration.findMany({
    where: {
      projectId,
      bucketName: parsed.bucket,
      mediaStorageEnabled: true,
      type: {
        in: [
          BlobStorageIntegrationType.S3,
          BlobStorageIntegrationType.S3_COMPATIBLE,
        ],
      },
    },
  });
  const matchingIntegrations = integrations
    .filter(({ mediaPrefix }) => isKeyWithinMediaScope(parsed.key, mediaPrefix))
    .toSorted(
      (left, right) =>
        (right.mediaPrefix?.length ?? 0) - (left.mediaPrefix?.length ?? 0),
    );
  const integration = matchingIntegrations[0];
  const hasAmbiguousMatch =
    integration !== undefined &&
    matchingIntegrations[1] !== undefined &&
    matchingIntegrations[1]?.mediaPrefix?.length ===
      integration.mediaPrefix?.length;

  if (!integration || hasAmbiguousMatch) {
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

  const integration = await prisma.blobStorageIntegration.findFirst({
    where: {
      id: integrationId,
      projectId,
      mediaStorageEnabled: true,
      type: {
        in: [
          BlobStorageIntegrationType.S3,
          BlobStorageIntegrationType.S3_COMPATIBLE,
        ],
      },
    },
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
