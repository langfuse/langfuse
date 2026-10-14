import { env } from "@/src/env.mjs";
import {
  type StorageService,
  StorageServiceFactory,
} from "@langfuse/shared/src/server";

let batchExportStorageServiceClient: StorageService;

export const getBatchExportStorageServiceClient = (
  bucketName: string,
): StorageService => {
  if (!batchExportStorageServiceClient) {
    batchExportStorageServiceClient = StorageServiceFactory.getInstance({
      bucketName,
      accessKeyId: env.LANGFUSE_S3_BATCH_EXPORT_ACCESS_KEY_ID,
      secretAccessKey: env.LANGFUSE_S3_BATCH_EXPORT_SECRET_ACCESS_KEY,
      endpoint: env.LANGFUSE_S3_BATCH_EXPORT_ENDPOINT,
      externalEndpoint: env.LANGFUSE_S3_BATCH_EXPORT_EXTERNAL_ENDPOINT,
      region: env.LANGFUSE_S3_BATCH_EXPORT_REGION,
      forcePathStyle: env.LANGFUSE_S3_BATCH_EXPORT_FORCE_PATH_STYLE === "true",
      awsSse: undefined,
      awsSseKmsKeyId: undefined,
    });
  }
  return batchExportStorageServiceClient;
};
