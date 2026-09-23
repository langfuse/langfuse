import { env } from "@/src/env.mjs";
import {
  resolveMediaStorageEndpoints,
  type StorageService,
  StorageServiceFactory,
} from "@langfuse/shared/src/server";

let skillStorageClient: StorageService | undefined;

export function getSkillStorageClient(): StorageService {
  const bucketName = env.LANGFUSE_S3_MEDIA_UPLOAD_BUCKET;
  if (!bucketName) {
    throw new Error(
      "Skill storage is unavailable: media upload bucket is not configured",
    );
  }

  if (!skillStorageClient) {
    const endpoints = resolveMediaStorageEndpoints({
      endpoint: env.LANGFUSE_S3_MEDIA_UPLOAD_ENDPOINT,
      internalEndpoint: env.LANGFUSE_S3_MEDIA_UPLOAD_INTERNAL_ENDPOINT,
    });
    skillStorageClient = StorageServiceFactory.getInstance({
      bucketName,
      accessKeyId: env.LANGFUSE_S3_MEDIA_UPLOAD_ACCESS_KEY_ID,
      secretAccessKey: env.LANGFUSE_S3_MEDIA_UPLOAD_SECRET_ACCESS_KEY,
      ...endpoints,
      region: env.LANGFUSE_S3_MEDIA_UPLOAD_REGION,
      forcePathStyle: env.LANGFUSE_S3_MEDIA_UPLOAD_FORCE_PATH_STYLE === "true",
      awsSse: env.LANGFUSE_S3_MEDIA_UPLOAD_SSE,
      awsSseKmsKeyId: env.LANGFUSE_S3_MEDIA_UPLOAD_SSE_KMS_KEY_ID,
    });
  }

  return skillStorageClient;
}
