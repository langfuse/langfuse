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
  ingestionBatchEvent,
  IngestionBatchEventType,
} from "@langfuse/shared/src/server";

import {
  handleBatch,
  addTracesToTraceUpsertQueue,
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
            forcePathStyle:
              env.LANGFUSE_S3_EVENT_UPLOAD_FORCE_PATH_STYLE === "true",
          });
          data = (
            await Promise.all(
              job.data.payload.data.map(async (record) => {
                const eventName = record.type.split("-").shift();
                const file = await s3Client.download(
                  `${env.LANGFUSE_S3_EVENT_UPLOAD_PREFIX}${job.data.payload.authCheck.scope.projectId}/${eventName}/${record.eventBodyId}/${record.eventId}.json`,
                );
                const parsed = ingestionBatchEvent.safeParse(JSON.parse(file));
                if (parsed.success) {
                  return parsed.data;
                } else {
                  throw new Error(
                    `Failed to parse event from S3: ${parsed.error.message}`,
                  );
                }
              }),
            )
          ).flat();
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

        const waitTime = Date.now() - job.timestamp;
        recordIncrement("langfuse.queue.legacy_ingestion.request");
        recordHistogram("langfuse.queue.legacy_ingestion.wait_time", waitTime, {
          unit: "milliseconds",
        });

        const result = await handleBatch(
          data,
          job.data.payload.authCheck,
          tokenCount,
        );

        // send out REDIS requests to worker for all trace types
        await addTracesToTraceUpsertQueue(
          result.results,
          job.data.payload.authCheck.scope.projectId,
        );

        // Log queue size
        await LegacyIngestionQueue.getInstance()
          ?.count()
          .then((count) => {
            logger.debug(`Legacy Ingestion flush queue length: ${count}`);
            recordGauge("langfuse.queue.legacy_ingestion.length", count, {
              unit: "records",
            });
            return count;
          })
          .catch();
        recordHistogram(
          "langfuse.queue.legacy_ingestion.processing_time",
          Date.now() - startTime,
          { unit: "milliseconds" },
        );
      } catch (e) {
        logger.error(
          `Failed job legacy ingestion processing for ${job.data.payload.authCheck.scope.projectId}`,
          e,
        );
        traceException(e);
        throw e;
      }
    },
  );
};
