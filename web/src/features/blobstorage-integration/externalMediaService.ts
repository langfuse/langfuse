import {
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
    .filter(({ prefix }) => isS3KeyWithinPrefix(parsed.key, prefix))
    .toSorted((left, right) => right.prefix.length - left.prefix.length);
  const integration = matchingIntegrations[0];
  const hasAmbiguousMatch =
    integration &&
    matchingIntegrations[1]?.prefix.length === integration.prefix.length;

  if (!integration || hasAmbiguousMatch) {
    throw new InvalidRequestError("External media is not available");
  }

  if (integration.endpoint) {
    await validateBlobStorageEndpoint(integration.endpoint);
  }

  const storageService = StorageServiceFactory.getInstance({
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
