import {
  type EventRecordInsertType,
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
    if (!mediaBucket) {
      throw new Error("Media upload bucket is not configured");
    }

    const results = await uploadOverflowCandidates(
      eventRecord,
      candidates,
      mediaBucket,
    );

    return applyOverflowResults(eventRecord, results);
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
    return { candidate, overflowedValue: value };
  }

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

  return { candidate, overflowedValue: mediaReference };
}
