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
  type TraceBatchInputs,
} from "./storage-schema";

export type TraceBatchInputReference = {
  projectId: string;
  traceId: string;
  revision: string;
};

// UTF-16 length of the complete JSON envelope, not a UTF-8 byte limit.
export const TRACE_BATCH_INPUT_MAX_CHARACTERS = 1_000_000;

let storage: StorageService | undefined;

/** Ordinary PUT: retries using the same revision can replace the saved input. */
export async function putTraceBatchInputs(
  reference: TraceBatchInputReference,
  transcript: Transcript | null,
): Promise<{ outcome: "stored" | "too_large"; jsonLength: number }> {
  const inputs: TraceBatchInputs = {
    schemaVersion: 1,
    transcript: transcript === null ? null : toStoredTranscriptV1(transcript),
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
}

/** Missing objects, invalid JSON and unsupported schemas propagate to the caller. */
export async function getTraceBatchInputs(
  reference: TraceBatchInputReference,
): Promise<Transcript | null> {
  const json = await getStorage().download(getTraceBatchInputsKey(reference));
  const inputs = traceBatchInputsSchema.parse(JSON.parse(json));
  return inputs.transcript === null
    ? null
    : fromStoredTranscriptV1(inputs.transcript);
}

function getStorage(): StorageService {
  if (!storage)
    storage = createEventUploadStorageService(
      env.LANGFUSE_S3_EVENT_UPLOAD_BUCKET,
    );
  return storage;
}

function getTraceBatchInputsKey({
  projectId,
  traceId,
  revision,
}: TraceBatchInputReference): string {
  const hash = createW3CTraceId(JSON.stringify([projectId, traceId])).slice(
    0,
    3,
  );
  return `${env.LANGFUSE_S3_EVENT_UPLOAD_PREFIX}trace-batch/trace/${hash}/${safeBlobKeySegment(projectId)}/${safeBlobKeySegment(traceId)}/${safeBlobFilenameStem(revision, ".json")}.json`;
}
