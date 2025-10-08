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

    // Fetch observation from S3
    const observationPrefix = `${s3Prefix}${projectId}/observation/${observationId}/`;
    const observationFiles = await s3Client.listFiles(observationPrefix);

    if (observationFiles.length === 0) {
      logger.warn(
        `No observation files found for ${observationId} in project ${projectId}`,
      );
      return;
    }

    // Get the latest observation file
    const latestObservationFile = observationFiles.sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
    )[0];
    const observationContent = await s3Client.download(
      latestObservationFile.file,
    );
    recordHistogram(
      "langfuse.delayed_event_ingestion.observation_file_size_bytes",
      observationContent.length,
    );

    const observationEvents = JSON.parse(observationContent);
    const observationEventList = Array.isArray(observationEvents)
      ? observationEvents
      : [observationEvents];

    // Fetch trace from S3 for enrichment (userId, sessionId, metadata)
    const tracePrefix = `${s3Prefix}${projectId}/trace/${traceId}/`;
    const traceFiles = await s3Client.listFiles(tracePrefix);

    let traceUserId: string | undefined;
    let traceSessionId: string | undefined;
    let traceMetadata: Record<string, unknown> = {};

    if (traceFiles.length > 0) {
      // Get the latest trace file
      const latestTraceFile = traceFiles.sort(
        (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
      )[0];
      const traceContent = await s3Client.download(latestTraceFile.file);
      recordHistogram(
        "langfuse.delayed_event_ingestion.trace_file_size_bytes",
        traceContent.length,
      );

      const traceEvents = JSON.parse(traceContent);
      const traceEventList = Array.isArray(traceEvents)
        ? traceEvents
        : [traceEvents];

      // Extract userId, sessionId, and metadata from the latest trace event
      const latestTraceEvent = traceEventList[traceEventList.length - 1];
      if (latestTraceEvent?.body) {
        traceUserId = latestTraceEvent.body.userId;
        traceSessionId = latestTraceEvent.body.sessionId;
        traceMetadata = latestTraceEvent.body.metadata || {};
      }
    } else {
      logger.warn(
        `No trace files found for ${traceId} in project ${projectId}`,
      );
    }

    // Get the latest observation event for transformation
    const latestObservationEvent =
      observationEventList[observationEventList.length - 1];
    if (!latestObservationEvent?.body) {
      logger.warn(
        `No observation body found for ${observationId} in project ${projectId}`,
      );
      return;
    }

    const obs = latestObservationEvent.body;
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
        typeof obs.input === "string" ? obs.input : JSON.stringify(obs.input),
      output:
        typeof obs.output === "string"
          ? obs.output
          : JSON.stringify(obs.output),
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
      eventBytes: observationContent.length,
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
