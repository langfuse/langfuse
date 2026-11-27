import { errorChainText } from "./abortClassification";

/**
 * Detect an S3 multipart-upload part-count-limit exhaustion.
 *
 * `@aws-sdk/lib-storage` throws `Exceeded 10000 parts in multipart upload ...`
 * when a stream needs more than S3's 10,000-part cap. The SDK exposes no stable
 * error code for it, so we match the message across the wrapped cause chain
 * (StorageService.handleStorageError wraps SDK errors via `new Error(_, { cause })`).
 * The pattern tolerates wording drift (case, the part count, an absent
 * "multipart upload" tail) so it survives an SDK message change.
 */
const PART_LIMIT_PATTERN = /exceeded\s+[\d,_]+\s+parts/i;

export function isMultipartPartLimitError(error: unknown): boolean {
  return PART_LIMIT_PATTERN.test(errorChainText(error));
}

// Persisted as lastError when a window exceeds S3's 10,000-part multipart cap.
// Retrying re-queries a retention-shrinking window until a truncated object
// commits as success, so the run stops loud instead of degrading silently.
/** @internal */
export const BLOB_EXPORT_PART_LIMIT_ERROR_MESSAGE =
  "Blob storage export stopped: the export window exceeded the storage provider's " +
  "10,000-part multipart upload limit. Increase the upload part size or reduce the " +
  "export frequency so each window fits within the limit.";
