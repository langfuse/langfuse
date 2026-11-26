import { Readable } from "node:stream";
import { env } from "../../env";
import { createEventUploadStorageService } from "../s3";
import type { StorageService } from "../services/StorageService";
import {
  safeBlobFilenameStem,
  safeBlobKeySegment,
} from "../services/safeBlobKeySegment";
import type { ExecutionIssue, Transcript } from "../transcript/types";
import { createW3CTraceId } from "../utils/traceId";
import {
  fromStoredExecutionIssuesV1,
  fromStoredTranscriptV1,
  toStoredExecutionIssuesV1,
  toStoredTranscriptV1,
} from "./serialization";
import { traceTranscriptVersionSchema } from "./storage-schema";
import { traceTranscriptV1Schema, type TraceTranscriptV1 } from "./versions/v1";

export type TraceTranscriptReference = {
  projectId: string;
  traceId: string;
  revision: string;
};

export type TraceTranscriptData = {
  transcript: Transcript | null;
  /** Empty when there is no transcript. */
  executionIssues: ExecutionIssue[];
  traceContext: TraceTranscriptV1["traceContext"];
};

type TraceTranscriptPutResult =
  | { outcome: "stored"; jsonLength: number; key: string }
  | { outcome: "too_large"; jsonLength: number };

export interface TraceTranscriptStorage {
  /**
   * Ordinary PUT: retries using the same revision can replace the saved input.
   * `stored` includes the object key. `too_large` uploads nothing.
   */
  put(
    reference: TraceTranscriptReference,
    inputs: TraceTranscriptData,
  ): Promise<TraceTranscriptPutResult>;
  /**
   * Reads the object at the key `put` returned. Missing objects and invalid
   * JSON propagate to the caller. A newer `schemaVersion` throws
   * `UnsupportedTraceTranscriptVersionError`, which callers must treat as
   * retryable: a later attempt can run on an updated reader.
   */
  get(key: string): Promise<TraceTranscriptData>;
}

/** The object was written by a newer schema than this reader knows. */
export class UnsupportedTraceTranscriptVersionError extends Error {
  constructor(readonly schemaVersion: number) {
    super(
      `Trace transcript schema version ${schemaVersion} is not supported by this reader.`,
    );
    this.name = "UnsupportedTraceTranscriptVersionError";
  }
}

// UTF-16 length of the complete JSON envelope, not a UTF-8 byte limit.
export const TRACE_TRANSCRIPT_MAX_CHARACTERS = 1_000_000;

/** After `LANGFUSE_S3_EVENT_UPLOAD_PREFIX`. The events-dispatch transcript cleaner lists this prefix. */
export const TRACE_TRANSCRIPT_PREFIX = "events-dispatch/trace-transcript/";

/** Trace transcripts expire after three days, matching span-eval inputs. */
export const TRACE_TRANSCRIPT_RETENTION_MS = 3 * 24 * 60 * 60 * 1000;

let storage: StorageService | undefined;

/** Shared by `put` and the test-on-trace path so both measure the same envelope against the same limit. */
export function serializeTraceTranscriptInputs({
  transcript,
  executionIssues,
  traceContext,
}: TraceTranscriptData): {
  json: string;
  jsonLength: number;
  tooLarge: boolean;
} {
  const inputs: TraceTranscriptV1 = {
    schemaVersion: 1,
    transcript: transcript === null ? null : toStoredTranscriptV1(transcript),
    executionIssues: toStoredExecutionIssuesV1(executionIssues),
    traceContext,
  };
  const json = JSON.stringify(inputs);
  const jsonLength = json.length;
  return {
    json,
    jsonLength,
    tooLarge: jsonLength > TRACE_TRANSCRIPT_MAX_CHARACTERS,
  };
}

/** Storage dependencies share one lazily initialized provider client. */
export function createTraceTranscriptStorage(): TraceTranscriptStorage {
  return {
    async put(reference, inputs) {
      const { json, jsonLength, tooLarge } =
        serializeTraceTranscriptInputs(inputs);
      if (tooLarge) return { outcome: "too_large", jsonLength };

      const key = getTraceTranscriptKey(reference);
      await getStorage().uploadFile({
        fileName: key,
        fileType: "application/json",
        // Stream the serialized text so providers handle its UTF-8 byte length.
        data: Readable.from([json]),
      });
      return { outcome: "stored", jsonLength, key };
    },
    get: readStored,
  };
}

async function readStored(key: string): Promise<TraceTranscriptData> {
  const json = await getStorage().download(key);
  const stored: unknown = JSON.parse(json);
  const envelope = traceTranscriptVersionSchema.safeParse(stored);
  if (envelope.success && envelope.data.schemaVersion !== 1)
    throw new UnsupportedTraceTranscriptVersionError(
      envelope.data.schemaVersion,
    );
  const inputs = traceTranscriptV1Schema.parse(stored);
  return {
    transcript:
      inputs.transcript === null
        ? null
        : fromStoredTranscriptV1(inputs.transcript),
    executionIssues: fromStoredExecutionIssuesV1(inputs.executionIssues),
    traceContext: inputs.traceContext,
  };
}

/** Each S3 request is bounded so a stalled upload cannot hold a Topics slot indefinitely. */
function getStorage(): StorageService {
  if (!storage)
    storage = createEventUploadStorageService(
      env.LANGFUSE_S3_EVENT_UPLOAD_BUCKET,
      {
        // This timeout applies only to S3; Azure, GCS, and OCI retain their provider defaults.
        s3RequestTimeoutMs: 10_000,
      },
    );
  return storage;
}

function getTraceTranscriptKey({
  projectId,
  traceId,
  revision,
}: TraceTranscriptReference): string {
  const safeProjectId = safeBlobKeySegment(projectId);
  const safeTraceId = safeBlobKeySegment(traceId);
  const safeRevision = safeBlobFilenameStem(revision, ".json");
  const hash = createW3CTraceId(JSON.stringify([projectId, traceId])).slice(
    0,
    3,
  );
  return `${env.LANGFUSE_S3_EVENT_UPLOAD_PREFIX}${TRACE_TRANSCRIPT_PREFIX}${hash}/${safeProjectId}/${safeTraceId}/${safeRevision}.json`;
}
