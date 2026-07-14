import {
  type StorageService,
  StorageServiceFactory,
} from "@langfuse/shared/src/server";
import { env } from "../../env";

/**
 * Singleton S3 storage client for media stored via the multi-modality upload
 * flow. Used when resolving `@@@langfuseMedia:...@@@` references for
 * LLM-as-a-judge evaluators so the worker can presign media download URLs.
 *
 * Mirrors the web `getMediaStorageServiceClient` helper but reads the worker
 * env. The media bucket is determined by the persisted media record, so the
 * client is cached per bucket name (different media records may live in
 * different buckets).
 */
const mediaStorageClientsByBucket = new Map<string, StorageService>();

export function getMediaStorageClient(bucketName: string): StorageService {
  const cached = mediaStorageClientsByBucket.get(bucketName);
  if (cached) {
    return cached;
  }

  const client = StorageServiceFactory.getInstance({
    bucketName,
    accessKeyId: env.LANGFUSE_S3_MEDIA_UPLOAD_ACCESS_KEY_ID,
    secretAccessKey: env.LANGFUSE_S3_MEDIA_UPLOAD_SECRET_ACCESS_KEY,
    endpoint: env.LANGFUSE_S3_MEDIA_UPLOAD_ENDPOINT,
    region: env.LANGFUSE_S3_MEDIA_UPLOAD_REGION,
    forcePathStyle: env.LANGFUSE_S3_MEDIA_UPLOAD_FORCE_PATH_STYLE === "true",
    awsSse: env.LANGFUSE_S3_MEDIA_UPLOAD_SSE,
    awsSseKmsKeyId: env.LANGFUSE_S3_MEDIA_UPLOAD_SSE_KMS_KEY_ID,
  });
  mediaStorageClientsByBucket.set(bucketName, client);
  return client;
}
