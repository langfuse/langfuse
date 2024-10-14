import { Job, Processor } from "bullmq";
import {
  traceException,
  QueueName,
  TQueueJobTypes,
  logger,
  IngestionEventType,
  S3StorageService,
  ingestionBatchEvent,
  ingestionEvent,
} from "@langfuse/shared/src/server";

import {
  handleBatch,
  addTracesToTraceUpsertQueue,
} from "@langfuse/shared/src/server";
import { tokenCount } from "../features/tokenisation/usage";
import { env } from "../env";

let s3StorageServiceClient: S3StorageService;

const getS3StorageServiceClient = (bucketName: string): S3StorageService => {
  if (!s3StorageServiceClient) {
    s3StorageServiceClient = new S3StorageService({
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

export const legacyIngestionQueueProcessor: Processor = async (
  job: Job<TQueueJobTypes[QueueName.LegacyIngestionQueue]>,
) => {
  try {
    let ingestionEvents: IngestionEventType[] = [];
    if (job.data.payload.useS3EventStore) {
      if (
        env.LANGFUSE_S3_EVENT_UPLOAD_ENABLED !== "true" ||
        !env.LANGFUSE_S3_EVENT_UPLOAD_BUCKET
      ) {
        throw new Error(
          "S3 event store is not enabled but useS3EventStore is true",
        );
      }
      // If we used the S3 store we need to fetch the ingestionEvents from S3
      const s3Client = getS3StorageServiceClient(
        env.LANGFUSE_S3_EVENT_UPLOAD_BUCKET,
      );
      ingestionEvents = (
        await Promise.all(
          job.data.payload.data.map(async (record) => {
            const eventName = record.type.split("-").shift();
            const file = await s3Client.download(
              `${env.LANGFUSE_S3_EVENT_UPLOAD_PREFIX}${job.data.payload.authCheck.scope.projectId}/${eventName}/${record.eventBodyId}/${record.eventId}.json`,
            );
            const parsedFile = JSON.parse(file);
            const parsed = ingestionBatchEvent.safeParse(parsedFile);
            if (parsed.success) {
              return parsed.data;
            } else {
              // Fallback to non-array format for backwards compatibility
              const parsed = ingestionEvent.safeParse(parsedFile);
              if (parsed.success) {
                return [parsed.data];
              } else {
                throw new Error(
                  `Failed to parse event from S3: ${parsed.error.message}`,
                );
              }
            }
          }),
        )
      ).flat();
    } else {
      // If we didn't use the S3 store we can consume the ingestionEvents directly from Redis
      ingestionEvents = job.data.payload.data;
    }

    logger.info("Processing legacy ingestion", {
      projectId: job.data.payload.authCheck.scope.projectId,
      payload: ingestionEvents.map(({ body, ...rest }) => {
        let modifiedBody = body;
        if (body && "input" in modifiedBody) {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { input, ...restPayload } = modifiedBody || {};
          modifiedBody = restPayload;
        }
        if (body && "output" in modifiedBody) {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { output, ...restPayload } = modifiedBody || {};
          modifiedBody = restPayload;
        }
        return {
          ...rest,
          body: modifiedBody,
        };
      }),
    });

    const result = await handleBatch(
      ingestionEvents,
      job.data.payload.authCheck,
      tokenCount,
    );

    // send out REDIS requests to worker for all trace types
    await addTracesToTraceUpsertQueue(
      result.results,
      job.data.payload.authCheck.scope.projectId,
    );
  } catch (e) {
    logger.error(
      `Failed job legacy ingestion processing for ${job.data.payload.authCheck.scope.projectId}`,
      e,
    );
    traceException(e);
    throw e;
  }
};
