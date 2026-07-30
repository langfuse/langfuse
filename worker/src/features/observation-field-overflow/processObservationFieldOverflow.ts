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

const OBSERVATION_FIELD_OVERFLOW_UPLOAD_BATCH_SIZE = 2;

type OverflowCandidate = {
  field: MediaField;
  value: string;
  originalBytes: number;
  apply: (overflowedValue: string) => void;
};

export async function applyObservationFieldOverflow(
  eventRecord: EventRecordInsertType,
): Promise<EventRecordInsertType> {
  if (env.LANGFUSE_OBSERVATION_FIELD_OVERFLOW_ENABLED !== "true") {
    return eventRecord;
  }

  try {
    const mediaBucket = env.LANGFUSE_S3_MEDIA_UPLOAD_BUCKET;
    let input = eventRecord.input;
    let output = eventRecord.output;
    const metadataValues = [...eventRecord.metadata_values];
    const candidates: OverflowCandidate[] = [];
    const addCandidate = (
      field: MediaField,
      value: string,
      apply: OverflowCandidate["apply"],
    ) => {
      const originalBytes = Buffer.byteLength(value, "utf8");
      if (originalBytes <= env.LANGFUSE_OBSERVATION_FIELD_SIZE_LIMIT_BYTES) {
        return;
      }
      candidates.push({ field, value, originalBytes, apply });
    };

    if (input != null) {
      addCandidate("input", input, (overflowedValue) => {
        input = overflowedValue;
      });
    }
    if (output != null) {
      addCandidate("output", output, (overflowedValue) => {
        output = overflowedValue;
      });
    }
    metadataValues.forEach((value, index) => {
      addCandidate("metadata", value, (overflowedValue) => {
        metadataValues[index] = overflowedValue;
      });
    });

    if (candidates.length === 0) {
      return eventRecord;
    }
    if (!mediaBucket) {
      throw new Error("Media upload bucket is not configured");
    }

    // Bound the additional buffers retained by concurrent uploads per event.
    for (
      let start = 0;
      start < candidates.length;
      start += OBSERVATION_FIELD_OVERFLOW_UPLOAD_BATCH_SIZE
    ) {
      const batch = candidates.slice(
        start,
        start + OBSERVATION_FIELD_OVERFLOW_UPLOAD_BATCH_SIZE,
      );
      const results = await Promise.allSettled(
        batch.map((candidate) =>
          overflowValue(eventRecord, candidate, mediaBucket),
        ),
      );

      for (const [index, result] of results.entries()) {
        if (result.status === "rejected") {
          throw result.reason;
        }
        batch[index].apply(result.value);
      }
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
  candidate: OverflowCandidate,
  mediaBucket: string,
): Promise<string> {
  const { field, value, originalBytes } = candidate;

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
