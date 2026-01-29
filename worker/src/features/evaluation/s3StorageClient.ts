import {
  StorageService,
  StorageServiceFactory,
} from "@langfuse/shared/src/server";
import { env } from "../../env";

/**
 * Singleton S3 storage client for eval operations.
 * Used by both eval execution (score upload) and observation eval scheduling (observation upload).
 */
let s3StorageServiceClient: StorageService | null = null;

/**
 * Gets the singleton S3 storage client for eval operations.
 * Creates the client on first call using environment configuration.
 *
 * @param bucketName - The S3 bucket name to use
 * @returns The S3 storage service client
 */
export function getEvalS3StorageClient(): StorageService {
  if (!s3StorageServiceClient) {
    s3StorageServiceClient = StorageServiceFactory.getInstance({
      bucketName: env.LANGFUSE_S3_EVENT_UPLOAD_BUCKET,
      accessKeyId: env.LANGFUSE_S3_EVENT_UPLOAD_ACCESS_KEY_ID,
      secretAccessKey: env.LANGFUSE_S3_EVENT_UPLOAD_SECRET_ACCESS_KEY,
      endpoint: env.LANGFUSE_S3_EVENT_UPLOAD_ENDPOINT,
      region: env.LANGFUSE_S3_EVENT_UPLOAD_REGION,
      forcePathStyle: env.LANGFUSE_S3_EVENT_UPLOAD_FORCE_PATH_STYLE === "true",
      awsSse: env.LANGFUSE_S3_EVENT_UPLOAD_SSE,
      awsSseKmsKeyId: env.LANGFUSE_S3_EVENT_UPLOAD_SSE_KMS_KEY_ID,
    });
  }

  return s3StorageServiceClient;
}
