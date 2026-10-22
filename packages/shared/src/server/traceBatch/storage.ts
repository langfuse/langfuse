import { Readable } from "node:stream";
import { env } from "../../env";
import { createEventUploadStorageService } from "../s3";
import type { StorageService } from "../services/StorageService";
import {
  safeBlobFilenameStem,
  safeBlobKeySegment,
} from "../services/safeBlobKeySegment";
import type { Transcript } from "../transcript/types";
import {
  toStoredTranscriptV1,
  fromStoredTranscriptV1,
} from "../transcript/serialization";
import { createW3CTraceId } from "../utils/traceId";
import {
  traceBatchInputsSchema,
  traceBatchInputsVersionSchema,
  type TraceBatchInputs,
} from "./storage-schema";

export type TraceBatchInputReference = {
  projectId: string;
  traceId: string;
  revision: string;
};

export type TraceBatchInputData = {
  transcript: Transcript | null;
  traceContext: TraceBatchInputs["traceContext"];
};

export interface TraceBatchInputStorage {
  /** Ordinary PUT: retries using the same revision can replace the saved input. */
  put(
    reference: TraceBatchInputReference,
    inputs: TraceBatchInputData,
  ): Promise<{ outcome: "stored" | "too_large"; jsonLength: number }>;
  /**
   * Missing objects and invalid JSON propagate to the caller. A newer
   * `schemaVersion` throws `UnsupportedTraceBatchInputVersionError`, which
   * callers must treat as retryable: a later attempt can run on an updated reader.
   */
  get(reference: TraceBatchInputReference): Promise<TraceBatchInputData>;
}

/** The object was written by a newer schema than this reader knows. */
export class UnsupportedTraceBatchInputVersionError extends Error {
  constructor(readonly schemaVersion: number) {
    super(
      `Trace batch input schema version ${schemaVersion} is not supported by this reader.`,
    );
    this.name = "UnsupportedTraceBatchInputVersionError";
  }
}

// UTF-16 length of the complete JSON envelope, not a UTF-8 byte limit.
export const TRACE_BATCH_INPUT_MAX_CHARACTERS = 1_000_000;

let storage: StorageService | undefined;

/** Storage dependencies share one lazily initialized provider client. */
export function createTraceBatchInputStorage(): TraceBatchInputStorage {
  return {
    async put(reference, { transcript, traceContext }) {
      const inputs: TraceBatchInputs = {
        schemaVersion: 1,
        transcript:
          transcript === null ? null : toStoredTranscriptV1(transcript),
        traceContext,
      };
      const json = JSON.stringify(inputs);
      const jsonLength = json.length;
      if (jsonLength > TRACE_BATCH_INPUT_MAX_CHARACTERS)
        return { outcome: "too_large", jsonLength };

      await getStorage().uploadFile({
        fileName: getTraceBatchInputsKey(reference),
        fileType: "application/json",
        // Stream the serialized text so providers handle its UTF-8 byte length.
        data: Readable.from([json]),
      });
      return { outcome: "stored", jsonLength };
    },
    async get(reference) {
      const json = await getStorage().download(
        getTraceBatchInputsKey(reference),
      );
      const stored: unknown = JSON.parse(json);
      const envelope = traceBatchInputsVersionSchema.safeParse(stored);
      if (envelope.success && envelope.data.schemaVersion !== 1)
        throw new UnsupportedTraceBatchInputVersionError(
          envelope.data.schemaVersion,
        );
      const inputs = traceBatchInputsSchema.parse(stored);
      return {
        transcript:
          inputs.transcript === null
            ? null
            : fromStoredTranscriptV1(inputs.transcript),
        traceContext: inputs.traceContext,
      };
    },
  };
}

/** Each S3 request is bounded so a stalled upload cannot hold a Topics slot indefinitely. */
function getStorage(): StorageService {
  if (!storage)
    storage = createEventUploadStorageService(
      env.LANGFUSE_S3_EVENT_UPLOAD_BUCKET,
      {
        s3RequestTimeoutMs:
          env.LANGFUSE_TRACE_BATCH_TRANSCRIPT_STORAGE_REQUEST_TIMEOUT_MS,
      },
    );
  return storage;
}

function getTraceBatchInputsKey({
  projectId,
  traceId,
  revision,
}: TraceBatchInputReference): string {
  const safeProjectId = safeBlobKeySegment(projectId);
  const safeTraceId = safeBlobKeySegment(traceId);
  const safeRevision = safeBlobFilenameStem(revision, ".json");
  const hash = createW3CTraceId(JSON.stringify([projectId, traceId])).slice(
    0,
    3,
  );
  return `${env.LANGFUSE_S3_EVENT_UPLOAD_PREFIX}trace-batch/trace/${hash}/${safeProjectId}/${safeTraceId}/${safeRevision}.json`;
}
