import {
  createEventUploadStorageService,
  StorageService,
} from "@langfuse/shared/src/server";
import { env } from "../../env";

const EVAL_S3_MAX_ATTEMPTS = 6;

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
    s3StorageServiceClient = createEventUploadStorageService(
      env.LANGFUSE_S3_EVENT_UPLOAD_BUCKET,
      { maxAttempts: EVAL_S3_MAX_ATTEMPTS },
    );
  }

  return s3StorageServiceClient;
}
