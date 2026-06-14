import { env } from "@/src/env.mjs";
import {
  type StorageService,
  StorageServiceFactory,
} from "@langfuse/shared/src/server";

let s3StorageServiceClient: StorageService;

export const getMediaStorageServiceClient = (
  bucketName: string,
): StorageService => {
  if (!s3StorageServiceClient) {
    s3StorageServiceClient = StorageServiceFactory.getInstance({
      bucketName,
      accessKeyId: env.LANGFUSE_S3_MEDIA_UPLOAD_ACCESS_KEY_ID,
      secretAccessKey: env.LANGFUSE_S3_MEDIA_UPLOAD_SECRET_ACCESS_KEY,
      endpoint: env.LANGFUSE_S3_MEDIA_UPLOAD_ENDPOINT,
      region: env.LANGFUSE_S3_MEDIA_UPLOAD_REGION,
      forcePathStyle: env.LANGFUSE_S3_MEDIA_UPLOAD_FORCE_PATH_STYLE === "true",
      awsSse: env.LANGFUSE_S3_MEDIA_UPLOAD_SSE,
      awsSseKmsKeyId: env.LANGFUSE_S3_MEDIA_UPLOAD_SSE_KMS_KEY_ID,
      useLocalFileStorage: env.LANGFUSE_MEDIA_STORAGE_BACKEND === "local",
      localFileStoragePath: env.LANGFUSE_MEDIA_LOCAL_PATH,
    });
  }
  return s3StorageServiceClient;
};
