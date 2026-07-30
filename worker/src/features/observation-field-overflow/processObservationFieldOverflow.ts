import {
  type EventRecordInsertType,
  instrumentAsync,
  logger,
  recordDistribution,
  recordIncrement,
  uploadMediaForTrace,
} from "@langfuse/shared/src/server";
import {
  MediaContentType,
  OBSERVATION_FIELD_SIZE_LIMIT_MEDIA_SOURCE,
} from "@langfuse/shared";

import { env } from "../../env";

const OBSERVATION_FIELD_OVERFLOW_UPLOAD_BATCH_SIZE = 3;

type OverflowTarget =
  | { field: "input" | "output" }
  | { field: "metadata"; metadataIndex: number };

type OverflowCandidate = OverflowTarget & {
  value: string;
  originalBytes: number;
};

type OverflowResult = {
  candidate: OverflowCandidate;
  overflowedValue: string;
  outcome: "uploaded" | "reused" | "failed";
  bytesRemoved: number;
};

export async function applyObservationFieldOverflow(
  eventRecord: EventRecordInsertType,
): Promise<EventRecordInsertType> {
  if (env.LANGFUSE_OBSERVATION_FIELD_OVERFLOW_ENABLED !== "true") {
    return eventRecord;
  }

  try {
    const mediaBucket = env.LANGFUSE_S3_MEDIA_UPLOAD_BUCKET;
    const candidates = collectOverflowCandidates(eventRecord);

    if (candidates.length === 0) {
      return eventRecord;
    }

    return await instrumentAsync(
      {
        name: "langfuse.ingestion.observation_field_overflow.process",
      },
      async (span) => {
        if (!mediaBucket) {
          throw new Error("Media upload bucket is not configured");
        }

        const results = await uploadOverflowCandidates(
          eventRecord,
          candidates,
          mediaBucket,
        );

        span.setAttributes({
          "langfuse.project.id": eventRecord.project_id,
          "langfuse.trace.id": eventRecord.trace_id,
          "langfuse.observation.id": eventRecord.span_id,
          "langfuse.ingestion.observation_field_overflow.candidates":
            candidates.length,
          "langfuse.ingestion.observation_field_overflow.fields":
            candidates.map(({ field }) => field),
          "langfuse.ingestion.observation_field_overflow.uploaded":
            results.filter(({ outcome }) => outcome === "uploaded").length,
          "langfuse.ingestion.observation_field_overflow.reused":
            results.filter(({ outcome }) => outcome === "reused").length,
          "langfuse.ingestion.observation_field_overflow.failed":
            results.filter(({ outcome }) => outcome === "failed").length,
          "langfuse.ingestion.observation_field_overflow.bytes_processed":
            candidates.reduce(
              (total, { originalBytes }) => total + originalBytes,
              0,
            ),
          "langfuse.ingestion.observation_field_overflow.bytes_removed":
            results.reduce(
              (total, { bytesRemoved }) => total + bytesRemoved,
              0,
            ),
        });

        return applyOverflowResults(eventRecord, results);
      },
    );
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

function collectOverflowCandidates(
  eventRecord: EventRecordInsertType,
): OverflowCandidate[] {
  const candidates: OverflowCandidate[] = [];
  const addCandidate = (target: OverflowTarget, value: string) => {
    const originalBytes = Buffer.byteLength(value, "utf8");
    if (originalBytes > env.LANGFUSE_OBSERVATION_FIELD_SIZE_LIMIT_BYTES) {
      candidates.push({ ...target, value, originalBytes });
    }
  };

  if (eventRecord.input != null) {
    addCandidate({ field: "input" }, eventRecord.input);
  }
  if (eventRecord.output != null) {
    addCandidate({ field: "output" }, eventRecord.output);
  }
  eventRecord.metadata_values.forEach((value, metadataIndex) => {
    addCandidate({ field: "metadata", metadataIndex }, value);
  });

  return candidates;
}

async function uploadOverflowCandidates(
  eventRecord: EventRecordInsertType,
  candidates: OverflowCandidate[],
  mediaBucket: string,
): Promise<OverflowResult[]> {
  const overflowResults: OverflowResult[] = [];

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
    const settledBatch = await Promise.allSettled(
      batch.map((candidate) =>
        uploadOverflowCandidate(eventRecord, candidate, mediaBucket),
      ),
    );

    for (const result of settledBatch) {
      if (result.status === "rejected") {
        throw result.reason;
      }
      overflowResults.push(result.value);
    }
  }

  return overflowResults;
}

function applyOverflowResults(
  eventRecord: EventRecordInsertType,
  results: OverflowResult[],
): EventRecordInsertType {
  let input = eventRecord.input;
  let output = eventRecord.output;
  const metadataValues = eventRecord.metadata_values.slice();

  for (const { candidate, overflowedValue } of results) {
    switch (candidate.field) {
      case "input":
        input = overflowedValue;
        break;
      case "output":
        output = overflowedValue;
        break;
      case "metadata":
        metadataValues[candidate.metadataIndex] = overflowedValue;
        break;
    }
  }

  return {
    ...eventRecord,
    input,
    output,
    metadata_values: metadataValues,
  };
}

async function uploadOverflowCandidate(
  eventRecord: EventRecordInsertType,
  candidate: OverflowCandidate,
  mediaBucket: string,
): Promise<OverflowResult> {
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
  if (!uploadResult) {
    return {
      candidate,
      overflowedValue: value,
      outcome: "failed",
      bytesRemoved: 0,
    };
  }

  const mediaReference =
    `@@@langfuseMedia:type=text/plain|id=${uploadResult.mediaId}` +
    `|source=${OBSERVATION_FIELD_SIZE_LIMIT_MEDIA_SOURCE}@@@`;
  const metricTags = { field, outcome: uploadResult.outcome };
  const bytesRemoved = Math.max(
    originalBytes - Buffer.byteLength(mediaReference, "utf8"),
    0,
  );

  recordIncrement(
    "langfuse.ingestion.observation_field_overflow",
    1,
    metricTags,
  );
  recordDistribution(
    "langfuse.ingestion.observation_field_overflow.bytes_removed",
    bytesRemoved,
    metricTags,
  );

  return {
    candidate,
    overflowedValue: mediaReference,
    outcome: uploadResult.outcome,
    bytesRemoved,
  };
}
