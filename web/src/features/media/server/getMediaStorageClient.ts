import { env } from "@/src/env.mjs";
import {
  resolveMediaStorageEndpoints,
  type StorageService,
  StorageServiceFactory,
} from "@langfuse/shared/src/server";

const s3StorageServiceClients = new Map<string, StorageService>();

export const getMediaStorageServiceClient = (
  bucketName: string,
): StorageService => {
  const existingClient = s3StorageServiceClients.get(bucketName);
  if (existingClient) return existingClient;

  const endpoints = resolveMediaStorageEndpoints({
    endpoint: env.LANGFUSE_S3_MEDIA_UPLOAD_ENDPOINT,
    internalEndpoint: env.LANGFUSE_S3_MEDIA_UPLOAD_INTERNAL_ENDPOINT,
  });
  const client = StorageServiceFactory.getInstance({
    bucketName,
    accessKeyId: env.LANGFUSE_S3_MEDIA_UPLOAD_ACCESS_KEY_ID,
    secretAccessKey: env.LANGFUSE_S3_MEDIA_UPLOAD_SECRET_ACCESS_KEY,
    ...endpoints,
    region: env.LANGFUSE_S3_MEDIA_UPLOAD_REGION,
    forcePathStyle: env.LANGFUSE_S3_MEDIA_UPLOAD_FORCE_PATH_STYLE === "true",
    awsSse: env.LANGFUSE_S3_MEDIA_UPLOAD_SSE,
    awsSseKmsKeyId: env.LANGFUSE_S3_MEDIA_UPLOAD_SSE_KMS_KEY_ID,
  });
  s3StorageServiceClients.set(bucketName, client);
  return client;
};
