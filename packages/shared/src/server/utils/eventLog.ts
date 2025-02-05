import { EventLog } from "@prisma/client";
import { prisma } from "../../db";
import { logger } from "../logger";
import { env } from "../../env";
import {
  StorageService,
  StorageServiceFactory,
} from "../services/StorageService";

let s3StorageServiceClient: StorageService;

const getS3StorageServiceClient = (bucketName: string): StorageService => {
  if (!s3StorageServiceClient) {
    s3StorageServiceClient = StorageServiceFactory.getInstance({
      bucketName,
      accessKeyId: env.LANGFUSE_S3_EVENT_UPLOAD_ACCESS_KEY_ID,
      secretAccessKey: env.LANGFUSE_S3_EVENT_UPLOAD_SECRET_ACCESS_KEY,
      endpoint: env.LANGFUSE_S3_EVENT_UPLOAD_ENDPOINT,
      region: env.LANGFUSE_S3_EVENT_UPLOAD_REGION,
      forcePathStyle: env.LANGFUSE_S3_EVENT_UPLOAD_FORCE_PATH_STYLE === "true",
    });
  }
  return s3StorageServiceClient;
};

export const uploadEventToS3 = async (
  event: Omit<
    EventLog,
    "createdAt" | "updatedAt" | "bucketPath" | "bucketName"
  >,
  data: Record<string, unknown>[],
) => {
  // We upload the event in an array to the S3 bucket grouped by the eventBodyId.
  // That way we batch updates from the same invocation into a single file and reduce
  // write operations on S3.
  const bucketPath = `${env.LANGFUSE_S3_EVENT_UPLOAD_PREFIX}${event.projectId}/${event.entityType}/${event.entityId}/${event.id}.json`;
  if (env.LANGFUSE_S3_EVENT_UPLOAD_POSTGRES_LOG_ENABLED === "true") {
    try {
      await prisma.eventLog.create({
        data: {
          ...event,
          bucketPath,
          bucketName: env.LANGFUSE_S3_EVENT_UPLOAD_BUCKET,
        },
      });
    } catch (e) {
      logger.error("Failed to write event log to Postgres", e);
      // Fallthrough as this shouldn't block further execution right now.
    }
  }

  return getS3StorageServiceClient(
    env.LANGFUSE_S3_EVENT_UPLOAD_BUCKET,
  ).uploadJson(bucketPath, data);
};
