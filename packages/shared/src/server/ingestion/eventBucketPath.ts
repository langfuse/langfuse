import { env } from "../../env";
import { type IngestionEntityTypes } from "../clickhouse/schemaUtils";
import { safeBlobKeySegment } from "../services/safeBlobKeySegment";

/**
 * Standard event-upload key: `<projectId>/<entityType>/<eventBodyId>/<eventId>.json`
 * relative to `LANGFUSE_S3_EVENT_UPLOAD_PREFIX`.
 *
 * The `eventBodyId` segment is matched with greedy `(.+)` — not `[^/]+` —
 * because the bucket holds two shapes side by side: older keys written
 * verbatim from the SDK-supplied id (where `idSchema` permits `/`), and
 * newer keys whose segment has been sanitized via `safeBlobKeySegment`.
 * Whatever form the segment takes, callers must treat the parsed
 * `eventBodyId` as an opaque canonical S3-side string and NOT re-sanitize it.
 */
export const STANDARD_EVENT_KEY_REGEX =
  /^([^/]+)\/([^/]+)\/(.+)\/([^/]+)\.json$/;

/**
 * OTel event-upload key: `otel/<projectId>/<yyyy>/<mm>/<dd>/<hh>/<mm>/<eventId>.json`.
 */
export const OTEL_EVENT_KEY_REGEX =
  /^otel\/([^/]+)\/(\d{4})\/(\d{2})\/(\d{2})\/(\d{2})\/(\d{2})\/([^.]+)\.json$/;

export type ParsedEventKey =
  | {
      kind: "standard";
      projectId: string;
      entityType: string;
      eventBodyId: string;
      eventId: string;
    }
  | { kind: "otel"; projectId: string };

/**
 * Parses an S3 event-upload key (relative to `LANGFUSE_S3_EVENT_UPLOAD_PREFIX`)
 * into its structured form. Returns `null` if the key matches neither shape.
 *
 * Used by the admin replay endpoint and the operator replay script.
 *
 * The returned `eventBodyId` is the literal segment as it sits in S3 —
 * whatever form the original producer wrote (raw, sanitized + hashed, or any
 * future shape). Feed it to `rawEventBucketPrefix` to reconstruct the prefix
 * verbatim; do NOT pass it through `safeBlobKeySegment` /
 * `buildEventBucketPrefix`, which would remap it to a different S3 path than
 * the one this caller observed.
 *
 * `entityType` is returned as a raw string and is NOT validated against
 * `IngestionEntityTypes` here — callers that route by entity type (queue
 * choice, event-type mapping) MUST validate before trusting it.
 */
export function parseEventKey(key: string): ParsedEventKey | null {
  const otel = key.match(OTEL_EVENT_KEY_REGEX);
  if (otel) {
    return { kind: "otel", projectId: otel[1]! };
  }
  const standard = key.match(STANDARD_EVENT_KEY_REGEX);
  if (standard) {
    const [, projectId, entityType, eventBodyId, eventId] = standard;
    return {
      kind: "standard",
      projectId: projectId!,
      entityType: entityType!,
      eventBodyId: eventBodyId!,
      eventId: eventId!,
    };
  }
  return null;
}

/**
 * Builds the S3 key prefix (ending in "/") under which all event files for a
 * given entity ID are stored. Sanitizes the id segment via `safeBlobKeySegment`
 * so the resulting key is always a valid S3/MinIO path regardless of length
 * or character set.
 *
 * Use this when the caller has the ORIGINAL entity ID — e.g. the producer at
 * write time, populating `bucketPrefix` on the IngestionQueue payload, or the
 * `clickhouse.ts` upsert path turning a record id into a path. Centralizing
 * the formula here is what makes producer/consumer drift structurally
 * impossible: every producer that writes an event file goes through this
 * exact function.
 *
 * When the caller already holds the literal S3-side segment — e.g. parsed
 * out of an existing key via `parseEventKey` — use `rawEventBucketPrefix`
 * instead, so we don't re-sanitize a segment that's already canonical.
 */
export function buildEventBucketPrefix(params: {
  projectId: string;
  entityType: IngestionEntityTypes;
  entityId: string;
}): string {
  return `${env.LANGFUSE_S3_EVENT_UPLOAD_PREFIX}${params.projectId}/${params.entityType}/${safeBlobKeySegment(params.entityId)}/`;
}

/**
 * Builds the S3 key prefix (ending in "/") from a path segment that is
 * ALREADY canonical — taken verbatim from an existing S3 key (typically via
 * `parseEventKey`). Does NOT call `safeBlobKeySegment`: the segment is what
 * S3 has, and any rewrite would point at the wrong file.
 *
 * Works for ANY segment shape: sanitized + hashed (newer producers), raw
 * SDK-supplied id (older producers), or whatever future producers emit. The
 * point isn't legacy compatibility — it's that the caller has already
 * observed the literal S3-side string and we must reproduce it byte-for-byte.
 *
 * Use this from replay-style call sites that consume `parseEventKey` output
 * (admin replay endpoint, operator replay script, rolling-deploy consumer
 * fallback). For fresh writes from a user-supplied entity ID where the path
 * still needs to be constructed, use `buildEventBucketPrefix`.
 */
export function rawEventBucketPrefix(params: {
  projectId: string;
  entityType: string;
  rawEntityIdSegment: string;
}): string {
  return `${env.LANGFUSE_S3_EVENT_UPLOAD_PREFIX}${params.projectId}/${params.entityType}/${params.rawEntityIdSegment}/`;
}
