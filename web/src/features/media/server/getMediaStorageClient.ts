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

/**
 * Storage client for media uploads and all server-side S3 operations. Upload
 * (PUT) presigned URLs and server-side operations always target the internal
 * LANGFUSE_S3_MEDIA_UPLOAD_ENDPOINT.
 */
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

/**
 * Storage client for presigning media download (GET) URLs handed to browsers and
 * API consumers (e.g. the UI media player and GET /api/public/media/:mediaId).
 *
 * When LANGFUSE_S3_MEDIA_UPLOAD_EXTERNAL_ENDPOINT is set, GET URLs are signed
 * against that public host. The SigV4 presigned URL binds the signature to the
 * Host header only (X-Amz-SignedHeaders=host), so the download host may differ
 * from the internal one used for server-side operations. When the external
 * endpoint is unset this returns the internal client, so behaviour is unchanged.
 */
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
