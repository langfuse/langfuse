import {
  createEventUploadStorageService,
  StorageService,
} from "@langfuse/shared/src/server";
import { env } from "../../env";

const EVAL_S3_MAX_ATTEMPTS = 6;

/**
 * Singleton S3 storage client for observation eval scheduling and processing.
 * These operations keep the AWS SDK's configured retry budget because
 * scheduling runs inline with ingestion.
 */
let s3StorageServiceClient: StorageService | null = null;
let s3ScoreStorageServiceClient: StorageService | null = null;

/**
 * Gets the singleton S3 storage client for observation eval operations.
 * Creates the client on first call using environment configuration.
 */
export function getEvalS3StorageClient(): StorageService {
  if (!s3StorageServiceClient) {
    s3StorageServiceClient = createEventUploadStorageService(
      env.LANGFUSE_S3_EVENT_UPLOAD_BUCKET,
    );
  }

  return s3StorageServiceClient;
}

/**
 * Gets the singleton S3 client used for evaluator score uploads.
 * It raises the SDK attempt budget to six.
 */
export function getEvalScoreS3StorageClient(): StorageService {
  if (!s3ScoreStorageServiceClient) {
    s3ScoreStorageServiceClient = createEventUploadStorageService(
      env.LANGFUSE_S3_EVENT_UPLOAD_BUCKET,
      { maxAttempts: EVAL_S3_MAX_ATTEMPTS },
    );
  }

  return s3ScoreStorageServiceClient;
}
