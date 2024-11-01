import { env } from "@/src/env.mjs";
import { S3StorageService } from "@langfuse/shared/src/server";

let s3StorageServiceClient: S3StorageService;

export const getMediaStorageServiceClient = (
  bucketName: string,
): S3StorageService => {
  if (!s3StorageServiceClient) {
    s3StorageServiceClient = new S3StorageService({
      bucketName,
      accessKeyId: env.LANGFUSE_S3_MEDIA_UPLOAD_ACCESS_KEY_ID,
      secretAccessKey: env.LANGFUSE_S3_MEDIA_UPLOAD_SECRET_ACCESS_KEY,
      sessionToken: env.LANGFUSE_S3_MEDIA_UPLOAD_SESSION_TOKEN,
      endpoint: env.LANGFUSE_S3_MEDIA_UPLOAD_ENDPOINT,
      region: env.LANGFUSE_S3_MEDIA_UPLOAD_REGION,
      forcePathStyle: env.LANGFUSE_S3_MEDIA_UPLOAD_FORCE_PATH_STYLE === "true",
    });
  }
  return s3StorageServiceClient;
};
