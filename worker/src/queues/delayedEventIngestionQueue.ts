import { Job, Processor } from "bullmq";
import {
  clickhouseClient,
  getCurrentSpan,
  getS3EventStorageClient,
  logger,
  QueueName,
  recordHistogram,
  recordIncrement,
  redis,
  TQueueJobTypes,
  traceException,
} from "@langfuse/shared/src/server";
import { env } from "../env";
import {
  IngestionService,
  type EventInput,
} from "../services/IngestionService";
import { prisma } from "@langfuse/shared/src/db";
import { ClickhouseWriter } from "../services/ClickhouseWriter";
import { chunk } from "lodash";

export const delayedEventIngestionProcessor: Processor = async (
  job: Job<TQueueJobTypes[QueueName.DelayedEventIngestionQueue]>,
): Promise<void> => {
  try {
    const { projectId, observationId, traceId, fileKey } = job.data.payload;

    const span = getCurrentSpan();
    if (span) {
      span.setAttribute("messaging.bullmq.job.input.id", job.data.id);
      span.setAttribute("messaging.bullmq.job.input.projectId", projectId);
      span.setAttribute(
        "messaging.bullmq.job.input.observationId",
        observationId,
      );
      span.setAttribute("messaging.bullmq.job.input.traceId", traceId);
      span.setAttribute("messaging.bullmq.job.input.fileKey", fileKey);
    }

    logger.debug(
      `Processing delayed event ingestion for observation ${observationId} in project ${projectId}`,
    );

    recordIncrement("langfuse.delayed_event_ingestion.event", 1, {
      projectId,
    });

    const s3Client = getS3EventStorageClient(
      env.LANGFUSE_S3_EVENT_UPLOAD_BUCKET,
    );
    const s3Prefix = env.LANGFUSE_S3_EVENT_UPLOAD_PREFIX;

    // Fetch ALL observation files from S3
    const observationPrefix = `${s3Prefix}${projectId}/observation/${observationId}/`;
    const observationFiles = await s3Client.listFiles(observationPrefix);

    if (observationFiles.length === 0) {
      logger.warn(
        `No observation files found for ${observationId} in project ${projectId}`,
      );
      return;
    }

    // Download ALL observation files in batches and combine events
    let totalObservationBytes = 0;
    const allObservationEvents: any[] = [];

    const downloadAndParseObservationFile = async (fileRef: {
      file: string;
    }) => {
      const file = await s3Client.download(fileRef.file);
      const fileSize = file.length;

      recordHistogram(
        "langfuse.delayed_event_ingestion.observation_file_size_bytes",
        fileSize,
      );
      totalObservationBytes += fileSize;

      const parsedFile = JSON.parse(file);
      return Array.isArray(parsedFile) ? parsedFile : [parsedFile];
    };

    const S3_CONCURRENT_READS = env.LANGFUSE_S3_CONCURRENT_READS;
    const observationBatches = chunk(observationFiles, S3_CONCURRENT_READS);
    for (const batch of observationBatches) {
      const batchEvents = await Promise.all(
        batch.map(downloadAndParseObservationFile),
      );
      allObservationEvents.push(...batchEvents.flat());
    }

    recordHistogram(
      "langfuse.delayed_event_ingestion.observation_event_count",
      allObservationEvents.length,
    );
    span?.setAttribute(
      "langfuse.delayed_event_ingestion.observation_files_count",
      observationFiles.length,
    );
    span?.setAttribute(
      "langfuse.delayed_event_ingestion.observation_all_files_size_bytes",
      totalObservationBytes,
    );

    if (allObservationEvents.length === 0) {
      logger.warn(
        `No observation events found for ${observationId} in project ${projectId}`,
      );
      return;
    }

    // Sort events by timestamp (oldest first)
    const sortedObservationEvents = allObservationEvents
      .slice()
      .sort((a, b) => {
        const aTimestamp = new Date(a.timestamp).getTime();
        const bTimestamp = new Date(b.timestamp).getTime();

        if (aTimestamp === bTimestamp) {
          return a.type.includes("create") ? -1 : 1;
        }

        return aTimestamp - bTimestamp;
      });

    // Fetch ALL trace files from S3 for enrichment
    const tracePrefix = `${s3Prefix}${projectId}/trace/${traceId}/`;
    const traceFiles = await s3Client.listFiles(tracePrefix);

    let traceUserId: string | undefined;
    let traceSessionId: string | undefined;
    let traceMetadata: Record<string, unknown> = {};

    if (traceFiles.length > 0) {
      // Download ALL trace files in batches and combine events
      let totalTraceBytes = 0;
      const allTraceEvents: any[] = [];

      const downloadAndParseTraceFile = async (fileRef: { file: string }) => {
        const file = await s3Client.download(fileRef.file);
        const fileSize = file.length;

        recordHistogram(
          "langfuse.delayed_event_ingestion.trace_file_size_bytes",
          fileSize,
        );
        totalTraceBytes += fileSize;

        const parsedFile = JSON.parse(file);
        return Array.isArray(parsedFile) ? parsedFile : [parsedFile];
      };

      const traceBatches = chunk(traceFiles, S3_CONCURRENT_READS);
      for (const batch of traceBatches) {
        const batchEvents = await Promise.all(
          batch.map(downloadAndParseTraceFile),
        );
        allTraceEvents.push(...batchEvents.flat());
      }

      recordHistogram(
        "langfuse.delayed_event_ingestion.trace_event_count",
        allTraceEvents.length,
      );
      span?.setAttribute(
        "langfuse.delayed_event_ingestion.trace_files_count",
        traceFiles.length,
      );
      span?.setAttribute(
        "langfuse.delayed_event_ingestion.trace_all_files_size_bytes",
        totalTraceBytes,
      );

      // Sort trace events by timestamp
      const sortedTraceEvents = allTraceEvents.slice().sort((a, b) => {
        const aTimestamp = new Date(a.timestamp).getTime();
        const bTimestamp = new Date(b.timestamp).getTime();

        if (aTimestamp === bTimestamp) {
          return a.type.includes("create") ? -1 : 1;
        }

        return aTimestamp - bTimestamp;
      });

      // Merge all trace events to get userId, sessionId, and metadata
      // Latest values take precedence (iterate in order)
      for (const traceEvent of sortedTraceEvents) {
        if (traceEvent?.body) {
          if (traceEvent.body.userId !== undefined) {
            traceUserId = traceEvent.body.userId;
          }
          if (traceEvent.body.sessionId !== undefined) {
            traceSessionId = traceEvent.body.sessionId;
          }
          if (traceEvent.body.metadata) {
            // Merge metadata: later events overwrite earlier ones
            traceMetadata = {
              ...traceMetadata,
              ...traceEvent.body.metadata,
            };
          }
        }
      }
    } else {
      logger.warn(
        `No trace files found for ${traceId} in project ${projectId}`,
      );
    }

    // Merge all observation events to get final observation state
    // We use the same merge pattern as IngestionService
    let mergedObservation: any = {};

    for (const obsEvent of sortedObservationEvents) {
      if (obsEvent?.body) {
        // Later events overwrite earlier ones (like IngestionService.overwriteObject)
        mergedObservation = {
          ...mergedObservation,
          ...obsEvent.body,
        };
      }
    }

    // Get the latest observation event type for determining observation type
    const latestObservationEvent =
      sortedObservationEvents[sortedObservationEvents.length - 1];

    if (!mergedObservation || Object.keys(mergedObservation).length === 0) {
      logger.warn(
        `No observation body found for ${observationId} in project ${projectId}`,
      );
      return;
    }

    const obs = mergedObservation;
    const obsType = latestObservationEvent.type;

    // Determine observation type
    let observationType = "SPAN";
    if (
      obsType.includes("generation") ||
      obs.type === "GENERATION" ||
      obs.type === "generation"
    ) {
      observationType = "GENERATION";
    } else if (obsType.includes("span") || obs.type === "SPAN") {
      observationType = "SPAN";
    } else if (obsType.includes("event") || obs.type === "EVENT") {
      observationType = "EVENT";
    } else if (obs.type) {
      observationType = obs.type;
    }

    // Merge metadata: trace metadata enriches observation metadata
    const mergedMetadata = {
      ...traceMetadata,
      ...(obs.metadata || {}),
    };

    // Find latest non-null input and output (reverse iteration)
    const reversedObservationEvents = sortedObservationEvents.slice().reverse();
    const latestInputEvent = reversedObservationEvents.find(
      (e) => e?.body?.input,
    );
    const latestOutputEvent = reversedObservationEvents.find(
      (e) => e?.body?.output,
    );
    const finalInput = latestInputEvent?.body?.input ?? obs.input;
    const finalOutput = latestOutputEvent?.body?.output ?? obs.output;

    // Transform to EventInput format
    const eventInput: EventInput = {
      projectId,
      traceId,
      spanId: observationId,
      parentSpanId: obs.parentObservationId,
      startTimeISO: obs.startTime || latestObservationEvent.timestamp,
      endTimeISO: obs.endTime || latestObservationEvent.timestamp,
      completionStartTime: obs.completionStartTime,
      name: obs.name,
      type: observationType,
      environment: obs.environment || "default",
      version: obs.version,
      userId: traceUserId,
      sessionId: traceSessionId,
      level: obs.level || "DEFAULT",
      statusMessage: obs.statusMessage,
      promptName: obs.promptName,
      promptVersion: obs.promptVersion?.toString(),
      modelName: obs.model,
      modelParameters: obs.modelParameters
        ? JSON.stringify(obs.modelParameters)
        : undefined,
      providedUsageDetails: obs.usage || obs.usageDetails || {},
      usageDetails: obs.usage || obs.usageDetails || {},
      providedCostDetails: obs.costDetails || {},
      costDetails: obs.costDetails || {},
      totalCost: undefined,
      input:
        typeof finalInput === "string"
          ? finalInput
          : finalInput
            ? JSON.stringify(finalInput)
            : undefined,
      output:
        typeof finalOutput === "string"
          ? finalOutput
          : finalOutput
            ? JSON.stringify(finalOutput)
            : undefined,
      metadata: mergedMetadata,
      source: "legacy-ingestion",
      blobStorageFilePath: fileKey,
      serviceName: undefined,
      serviceVersion: undefined,
      scopeName: undefined,
      scopeVersion: undefined,
      telemetrySdkLanguage: undefined,
      telemetrySdkName: undefined,
      telemetrySdkVersion: undefined,
      eventRaw: undefined,
      eventBytes: totalObservationBytes,
    };

    // Ensure required infra config is present
    if (!redis) throw new Error("Redis not available");
    if (!prisma) throw new Error("Prisma not available");

    const ingestionService = new IngestionService(
      redis,
      prisma,
      ClickhouseWriter.getInstance(),
      clickhouseClient(),
    );

    // Write to events table
    await ingestionService.writeEvent(eventInput, fileKey);

    recordIncrement("langfuse.delayed_event_ingestion.success", 1, {
      projectId,
    });

    logger.debug(
      `Successfully processed delayed event ingestion for observation ${observationId} in project ${projectId}`,
    );
  } catch (e) {
    logger.error(
      `Failed job delayed event ingestion processing for project ${job.data.payload.projectId}`,
      e,
    );
    recordIncrement("langfuse.delayed_event_ingestion.error", 1, {
      projectId: job.data.payload.projectId,
    });
    traceException(e);
    throw e;
  }
};
