// S3 multipart limits shared by every S3 upload path.
//
// S3 caps a multipart upload at 10,000 parts. `@aws-sdk/lib-storage`'s `Upload`
// defaults to a 5 MiB partSize and does NOT scale it with the payload, so any
// object over 10,000 x 5 MiB = 52,428,800,000 bytes (48.83 GiB) fails with
// "Exceeded 10000 parts". The scheduled blob export hit exactly this wall:
// the upload threw, BullMQ retried, ClickHouse retention TTL shrank the window
// on each retry, and a truncated object eventually committed as "success"
// (https://github.com/langfuse/langfuse/issues/17282).
//
// The buffered uploader (`BufferedStreamUploader` + `S3ChunkedUploadStrategy`)
// already takes an explicit partSize (default 100 MiB for blob exports), but
// the lib-storage fallback (`S3StorageService.uploadFile`) left partSize
// undefined and inherited the 5 MiB SDK default. Both paths now share these
// constants and the non-retryable error below.

/** S3 hard limit: maximum parts per multipart upload. */
export const S3_MAX_PARTS = 10_000;

/** S3 minimum part size (5 MiB). Last part may be smaller. */
export const S3_MIN_PART_SIZE_BYTES = 5 * 1024 * 1024;

/** S3 maximum part size (5 GiB). */
export const S3_MAX_PART_SIZE_BYTES = 5 * 1024 * 1024 * 1024;

/**
 * Default part size for lib-storage uploads when the caller provides none.
 *
 * 64 MiB x 10,000 parts = 671,088,640,000 bytes (~625 GiB) ceiling, ~13x the
 * previous 48.83 GiB wall, at ~256 MiB peak buffer (64 MiB x queueSize 4).
 * Matches the issue's suggested fix; blob exports that need more use the
 * buffered path with 100 MiB parts (~953 GiB ceiling).
 */
export const S3_DEFAULT_PART_SIZE_BYTES = 64 * 1024 * 1024;

/** Default lib-storage concurrency (matches the SDK default). */
export const S3_DEFAULT_QUEUE_SIZE = 4;

/** Maximum object size for a given part size under the 10k-part cap. */
export function maxBytesForPartSize(partSizeBytes: number): number {
  return Math.floor(partSizeBytes) * S3_MAX_PARTS;
}

/**
 * Non-retryable error: the payload needs more than S3's 10,000 parts at the
 * configured part size. Retrying the same window cannot succeed (and for blob
 * exports retrying is actively harmful: the ClickHouse retention TTL deletes
 * the oldest rows between attempts, so a retry can commit a truncated object
 * as success). Callers must surface this loudly and NOT retry; operators fix
 * it by raising partSizeBytes and/or shortening the export window (e.g. daily
 * -> hourly).
 */
export class S3MultipartLimitExceededError extends Error {
  override name = "S3MultipartLimitExceededError";
  readonly key?: string;
  readonly partSizeBytes?: number;
  readonly partsAttempted?: number;

  constructor(
    message: string,
    opts?: {
      key?: string;
      partSizeBytes?: number;
      partsAttempted?: number;
      cause?: unknown;
    },
  ) {
    super(message, opts?.cause !== undefined ? { cause: opts.cause } : undefined);
    this.key = opts?.key;
    this.partSizeBytes = opts?.partSizeBytes;
    this.partsAttempted = opts?.partsAttempted;
  }
}

const LIMIT_MESSAGE_PATTERNS = [
  /exceeded\s+10000\s+parts/i,
  /exceed.*10000/i,
  /too\s+many\s+parts/i,
  /maximum.*parts/i,
  /part\s*number.*10000/i,
  /multipart.*limit/i,
];

function messageMatchesLimit(text: string): boolean {
  return LIMIT_MESSAGE_PATTERNS.some((p) => p.test(text));
}

function* errorCauseChain(error: unknown, maxDepth = 10): Generator<object> {
  let current: unknown = error;
  for (let depth = 0; depth < maxDepth; depth++) {
    if (!current || typeof current !== "object") return;
    yield current as object;
    current = (current as { cause?: unknown }).cause;
  }
}

/**
 * True when the error (or any link in its cause chain) is a multipart-part-count
 * limit failure: our own S3MultipartLimitExceededError, or the lib-storage
 * "Exceeded 10000 parts" (and close variants from S3-compatible stores).
 */
export function isS3MultipartLimitExceededError(error: unknown): boolean {
  for (const link of errorCauseChain(error)) {
    if ((link as { name?: unknown }).name === "S3MultipartLimitExceededError") {
      return true;
    }
    // `.message` covers lib-storage's bare Error ("Exceeded 10000 parts ...");
    // `.Code`/`.code` cover S3-compatible stores that surface it as a code.
    const candidates: unknown[] = [
      (link as { message?: unknown }).message,
      (link as { Code?: unknown }).Code,
      (link as { code?: unknown }).code,
    ];
    for (const c of candidates) {
      if (typeof c === "string" && messageMatchesLimit(c)) return true;
    }
  }
  return false;
}

/** Human-readable GiB with one decimal, for error/log messages. */
export function formatGiB(bytes: number): string {
  return `${(bytes / 1024 ** 3).toFixed(1)} GiB`;
}
