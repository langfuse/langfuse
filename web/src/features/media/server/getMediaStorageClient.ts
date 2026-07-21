import { env } from "@/src/env.mjs";
import {
  type StorageService,
  StorageServiceFactory,
} from "@langfuse/shared/src/server";

let s3StorageServiceClient: StorageService;
let s3MediaDownloadStorageServiceClient: StorageService;

const getMediaStorageParams = (bucketName: string) => ({
  bucketName,
  accessKeyId: env.LANGFUSE_S3_MEDIA_UPLOAD_ACCESS_KEY_ID,
  secretAccessKey: env.LANGFUSE_S3_MEDIA_UPLOAD_SECRET_ACCESS_KEY,
  endpoint: env.LANGFUSE_S3_MEDIA_UPLOAD_ENDPOINT,
  region: env.LANGFUSE_S3_MEDIA_UPLOAD_REGION,
  forcePathStyle: env.LANGFUSE_S3_MEDIA_UPLOAD_FORCE_PATH_STYLE === "true",
  awsSse: env.LANGFUSE_S3_MEDIA_UPLOAD_SSE,
  awsSseKmsKeyId: env.LANGFUSE_S3_MEDIA_UPLOAD_SSE_KMS_KEY_ID,
});

export const getMediaStorageServiceClient = (
  bucketName: string,
): StorageService => {
  if (!s3StorageServiceClient) {
    s3StorageServiceClient = StorageServiceFactory.getInstance(
      getMediaStorageParams(bucketName),
    );
  }
  return s3StorageServiceClient;
};

export const getMediaDownloadStorageServiceClient = (
  bucketName: string,
): StorageService => {
  if (!env.LANGFUSE_S3_MEDIA_UPLOAD_EXTERNAL_ENDPOINT) {
    return getMediaStorageServiceClient(bucketName);
  }
  if (!s3MediaDownloadStorageServiceClient) {
    s3MediaDownloadStorageServiceClient = StorageServiceFactory.getInstance({
      ...getMediaStorageParams(bucketName),
      externalEndpoint: env.LANGFUSE_S3_MEDIA_UPLOAD_EXTERNAL_ENDPOINT,
    });
  }
  return s3MediaDownloadStorageServiceClient;
};
