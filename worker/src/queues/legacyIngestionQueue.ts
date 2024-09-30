import { Job, Processor } from "bullmq";
import {
  traceException,
  LegacyIngestionQueue,
  instrumentAsync,
  QueueName,
  recordIncrement,
  recordGauge,
  recordHistogram,
  TQueueJobTypes,
  logger,
  IngestionEventType,
  S3StorageService,
  ingestionEvent,
} from "@langfuse/shared/src/server";

import {
  handleBatch,
  sendToWorkerIfEnvironmentConfigured,
} from "@langfuse/shared/src/server";
import { tokenCount } from "../features/tokenisation/usage";
import { SpanKind } from "@opentelemetry/api";
import { env } from "../env";

export const legacyIngestionQueueProcessor: Processor = async (
  job: Job<TQueueJobTypes[QueueName.LegacyIngestionQueue]>,
) => {
  return instrumentAsync(
    {
      name: "legacyIngestion",
      spanKind: SpanKind.CONSUMER,
      rootSpan: true,
      traceContext: job.data?._tracecontext,
    },
    async () => {
      try {
        const startTime = Date.now();

        let data: IngestionEventType[] = [];
        if (job.data.payload.useS3EventStore) {
          if (
            env.LANGFUSE_S3_EVENT_UPLOAD_ENABLED !== "true" ||
            !env.LANGFUSE_S3_EVENT_UPLOAD_BUCKET
          ) {
            throw new Error(
              "S3 event store is not enabled but useS3EventStore is true",
            );
          }
          // If we used the S3 store we need to fetch the data from S3
          const s3Client = new S3StorageService({
            accessKeyId: env.LANGFUSE_S3_EVENT_UPLOAD_ACCESS_KEY_ID,
            secretAccessKey: env.LANGFUSE_S3_EVENT_UPLOAD_SECRET_ACCESS_KEY,
            bucketName: env.LANGFUSE_S3_EVENT_UPLOAD_BUCKET,
            endpoint: env.LANGFUSE_S3_EVENT_UPLOAD_ENDPOINT,
            region: env.LANGFUSE_S3_EVENT_UPLOAD_REGION,
          });
          data = await Promise.all(
            job.data.payload.data.map(async (record) => {
              const eventName = record.type.split("-").shift();
              const file = await s3Client.download(
                `${env.LANGFUSE_S3_EVENT_UPLOAD_PREFIX}${job.data.payload.authCheck.scope.projectId}/${eventName}/${record.eventBodyId}/${record.eventId}.json`,
              );
              const parsed = ingestionEvent.safeParse(file);
              if (parsed.success) {
                return parsed.data;
              } else {
                throw new Error(
                  `Failed to parse event from S3: ${parsed.error.message}`,
                );
              }
            }),
          );
        } else {
          // If we didn't use the S3 store we can consume the data directly from Redis
          data = job.data.payload.data;
        }

        logger.info("Processing legacy ingestion", {
          payload: data.map(({ body, ...rest }) => {
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

        // Log wait time
        const waitTime = Date.now() - job.timestamp;
        logger.debug(
          `Received flush request after ${waitTime} ms for ${job.data.payload.authCheck.scope.projectId}`,
        );

        recordIncrement("legacy_ingestion_processing_request");
        recordHistogram("legacy_ingestion_flush_wait_time", waitTime, {
          unit: "milliseconds",
        });

        const result = await handleBatch(
          data,
          job.data.payload.authCheck,
          tokenCount,
        );

        // send out REDIS requests to worker for all trace types
        await sendToWorkerIfEnvironmentConfigured(
          result.results,
          job.data.payload.authCheck.scope.projectId,
        );

        // Log queue size
        await LegacyIngestionQueue.getInstance()
          ?.count()
          .then((count) => {
            logger.debug(`Legacy Ingestion flush queue length: ${count}`);
            recordGauge("legacy_ingestion_flush_queue_length", count, {
              unit: "records",
            });
            return count;
          })
          .catch();
        recordHistogram(
          "legacy_ingestion_processing_time",
          Date.now() - startTime,
          { unit: "milliseconds" },
        );
      } catch (e) {
        logger.error(
          `Failed job Evaluation for traceId ${job.data.payload}`,
          e,
        );
        traceException(e);
        throw e;
      }
    },
  );
};
