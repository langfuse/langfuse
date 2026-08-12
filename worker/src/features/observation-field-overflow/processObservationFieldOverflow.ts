import {
  type EventRecordInsertType,
  instrumentAsync,
  logger,
  type ObservationRecordInsertType,
  recordDistribution,
  recordIncrement,
  uploadMediaForTrace,
} from "@langfuse/shared/src/server";
import {
  MediaAssociationOrigin,
  MediaContentType,
  MediaReferenceStringSchema,
  OBSERVATION_FIELD_SIZE_LIMIT_MEDIA_SOURCE,
} from "@langfuse/shared";

import { env } from "../../env";

const OBSERVATION_FIELD_OVERFLOW_UPLOAD_BATCH_SIZE = 3;
const MEDIA_REFERENCE_PREFIX = "@@@langfuseMedia:";
const MEDIA_REFERENCE_SUFFIX = "@@@";

type OverflowTarget =
  | { field: "input" | "output" }
  | { field: "metadata"; metadataIndex: number }
  | { field: "metadata"; metadataKey: string };

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

type OverflowRecord = EventRecordInsertType | ObservationRecordInsertType;

export async function applyObservationFieldOverflow(
  eventRecord: EventRecordInsertType,
): Promise<EventRecordInsertType> {
  // Preserve the direct-write feature gate as a true no-op. Only the legacy
  // adapter needs to inspect inherited references while the gate is disabled.
  if (env.LANGFUSE_OBSERVATION_FIELD_OVERFLOW_ENABLED !== "true") {
    return eventRecord;
  }

  return processObservationFieldOverflow(eventRecord);
}

/**
 * Applies the same overflow policy to the fully enriched legacy observation
 * shape immediately before persistence.
 */
export async function applyLegacyObservationFieldOverflow(
  observationRecord: ObservationRecordInsertType,
): Promise<ObservationRecordInsertType> {
  return processObservationFieldOverflow(observationRecord);
}

async function processObservationFieldOverflow<T extends OverflowRecord>(
  record: T,
): Promise<T> {
  if (env.LANGFUSE_OBSERVATION_FIELD_OVERFLOW_ENABLED !== "true") {
    return record;
  }

  const candidates = collectOverflowCandidates(record);
  if (candidates.length === 0) {
    return record;
  }

  const context = getOverflowRecordContext(record);

  try {
    const mediaBucket = env.LANGFUSE_S3_MEDIA_UPLOAD_BUCKET;
    if (!mediaBucket) {
      throw new Error("Media upload bucket is not configured");
    }

    return await instrumentAsync(
      {
        name: "langfuse.ingestion.observation_field_overflow.process",
      },
      async (span) => {
        const startedAt = Date.now();

        try {
          const results = await uploadOverflowCandidates(
            record,
            candidates,
            mediaBucket,
          );

          span.setAttributes({
            "langfuse.project.id": context.projectId,
            "langfuse.trace.id": context.traceId,
            "langfuse.observation.id": context.observationId,
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

          return applyOverflowResults(record, results);
        } finally {
          recordDistribution(
            "langfuse.ingestion.observation_field_overflow.processing_duration_ms",
            Date.now() - startedAt,
          );
        }
      },
    );
  } catch (error) {
    logger.warn(
      "Observation field overflow processing failed; persisting original record",
      {
        error,
        projectId: context.projectId,
        traceId: context.traceId,
        observationId: context.observationId,
      },
    );
    return record;
  }
}

function collectOverflowCandidates(
  record: OverflowRecord,
): OverflowCandidate[] {
  const candidates: OverflowCandidate[] = [];
  const addCandidate = (target: OverflowTarget, value: string) => {
    const originalBytes = Buffer.byteLength(value, "utf8");
    if (originalBytes > env.LANGFUSE_OBSERVATION_FIELD_SIZE_LIMIT_BYTES) {
      candidates.push({ ...target, value, originalBytes });
    }
  };

  if (record.input != null) {
    addCandidate({ field: "input" }, record.input);
  }
  if (record.output != null) {
    addCandidate({ field: "output" }, record.output);
  }
  if (isEventRecord(record)) {
    record.metadata_values.forEach((value, metadataIndex) => {
      addCandidate({ field: "metadata", metadataIndex }, value);
    });
  } else {
    Object.entries(record.metadata).forEach(([metadataKey, value]) => {
      addCandidate({ field: "metadata", metadataKey }, value);
    });
  }

  return candidates;
}

async function uploadOverflowCandidates(
  record: OverflowRecord,
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
        uploadOverflowCandidate(record, candidate, mediaBucket),
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

function applyOverflowResults<T extends OverflowRecord>(
  record: T,
  results: OverflowResult[],
): T {
  let input = record.input;
  let output = record.output;
  const metadataValues = isEventRecord(record)
    ? record.metadata_values.slice()
    : undefined;
  const metadata = isEventRecord(record) ? undefined : { ...record.metadata };

  for (const { candidate, overflowedValue } of results) {
    switch (candidate.field) {
      case "input":
        input = overflowedValue;
        break;
      case "output":
        output = overflowedValue;
        break;
      case "metadata":
        if ("metadataIndex" in candidate) {
          metadataValues![candidate.metadataIndex] = overflowedValue;
        } else {
          metadata![candidate.metadataKey] = overflowedValue;
        }
        break;
    }
  }

  return (
    isEventRecord(record)
      ? { ...record, input, output, metadata_values: metadataValues }
      : { ...record, input, output, metadata }
  ) as T;
}

async function uploadOverflowCandidate(
  record: OverflowRecord,
  candidate: OverflowCandidate,
  mediaBucket: string,
): Promise<OverflowResult> {
  const { field, value, originalBytes } = candidate;
  const context = getOverflowRecordContext(record);

  const uploadResult = await uploadMediaForTrace({
    projectId: context.projectId,
    traceId: context.traceId,
    observationId: context.observationId,
    field,
    contentType: MediaContentType.TXT,
    contentBytes: Buffer.from(value, "utf8"),
    mediaBucket,
    mediaPrefix: env.LANGFUSE_S3_MEDIA_UPLOAD_PREFIX,
    origin: MediaAssociationOrigin.INGESTION_FIELD_OVERFLOW,
  }).catch((error) => {
    logger.warn(
      "Oversized observation field upload failed; persisting original field",
      {
        error,
        projectId: context.projectId,
        traceId: context.traceId,
        observationId: context.observationId,
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

function isEventRecord(
  record: OverflowRecord,
): record is EventRecordInsertType {
  return "metadata_values" in record;
}

function getOverflowRecordContext(record: OverflowRecord): {
  projectId: string;
  traceId: string;
  observationId: string;
} {
  const observationId = isEventRecord(record) ? record.span_id : record.id;

  return {
    projectId: record.project_id,
    traceId: record.trace_id ?? observationId,
    observationId,
  };
}

export function isObservationFieldOverflowReference(value: unknown): boolean {
  if (typeof value !== "string") {
    return false;
  }

  if (
    !value.startsWith(MEDIA_REFERENCE_PREFIX) ||
    !value.endsWith(MEDIA_REFERENCE_SUFFIX)
  ) {
    return false;
  }

  const parsed = MediaReferenceStringSchema.safeParse(value);
  return (
    parsed.success &&
    parsed.data.source === OBSERVATION_FIELD_SIZE_LIMIT_MEDIA_SOURCE
  );
}
