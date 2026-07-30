import {
  type EventRecordInsertType,
  logger,
  recordDistribution,
  recordIncrement,
  uploadMediaForTrace,
} from "@langfuse/shared/src/server";
import {
  MediaContentType,
  type MediaField,
  OBSERVATION_FIELD_SIZE_LIMIT_MEDIA_SOURCE,
} from "@langfuse/shared";

import { env } from "../../env";

export async function applyObservationFieldOverflow(
  eventRecord: EventRecordInsertType,
): Promise<EventRecordInsertType> {
  if (env.LANGFUSE_OBSERVATION_FIELD_OVERFLOW_ENABLED !== "true") {
    return eventRecord;
  }

  try {
    const mediaBucket = env.LANGFUSE_S3_MEDIA_UPLOAD_BUCKET;
    const input =
      eventRecord.input == null
        ? eventRecord.input
        : await overflowValue(
            eventRecord,
            "input",
            eventRecord.input,
            mediaBucket,
          );
    const output =
      eventRecord.output == null
        ? eventRecord.output
        : await overflowValue(
            eventRecord,
            "output",
            eventRecord.output,
            mediaBucket,
          );
    const metadataValues: string[] = [];
    for (const value of eventRecord.metadata_values) {
      metadataValues.push(
        await overflowValue(eventRecord, "metadata", value, mediaBucket),
      );
    }

    return {
      ...eventRecord,
      input,
      output,
      metadata_values: metadataValues,
    };
  } catch (error) {
    logger.warn(
      "Observation field overflow processing failed; persisting original record",
      {
        error,
        projectId: eventRecord.project_id,
        traceId: eventRecord.trace_id,
        observationId: eventRecord.span_id,
      },
    );
    return eventRecord;
  }
}

async function overflowValue(
  eventRecord: EventRecordInsertType,
  field: MediaField,
  value: string,
  mediaBucket: string | undefined,
): Promise<string> {
  const originalBytes = Buffer.byteLength(value, "utf8");
  if (originalBytes <= env.LANGFUSE_OBSERVATION_FIELD_SIZE_LIMIT_BYTES) {
    return value;
  }
  if (!mediaBucket) {
    throw new Error("Media upload bucket is not configured");
  }

  const uploadResult = await uploadMediaForTrace({
    projectId: eventRecord.project_id,
    traceId: eventRecord.trace_id,
    observationId: eventRecord.span_id,
    field,
    contentType: MediaContentType.TXT,
    contentBytes: Buffer.from(value, "utf8"),
    mediaBucket,
    mediaPrefix: env.LANGFUSE_S3_MEDIA_UPLOAD_PREFIX,
  }).catch((error) => {
    logger.warn(
      "Oversized observation field upload failed; persisting original field",
      {
        error,
        projectId: eventRecord.project_id,
        traceId: eventRecord.trace_id,
        observationId: eventRecord.span_id,
        field,
        originalBytes,
      },
    );
    const metricTags = { field, outcome: "failed" };
    recordIncrement(
      "langfuse.ingestion.observation_field_overflow",
      1,
      metricTags,
    );
    recordDistribution(
      "langfuse.ingestion.observation_field_overflow.bytes_removed",
      0,
      metricTags,
    );

    return null;
  });
  if (!uploadResult) return value;

  const mediaReference =
    `@@@langfuseMedia:type=text/plain|id=${uploadResult.mediaId}` +
    `|source=${OBSERVATION_FIELD_SIZE_LIMIT_MEDIA_SOURCE}@@@`;
  const metricTags = { field, outcome: uploadResult.outcome };

  recordIncrement(
    "langfuse.ingestion.observation_field_overflow",
    1,
    metricTags,
  );
  recordDistribution(
    "langfuse.ingestion.observation_field_overflow.bytes_removed",
    Math.max(originalBytes - Buffer.byteLength(mediaReference, "utf8"), 0),
    metricTags,
  );

  return mediaReference;
}
