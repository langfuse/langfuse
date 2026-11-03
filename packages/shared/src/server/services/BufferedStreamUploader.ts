import type { Readable } from "stream";
import { backOff } from "exponential-backoff";
import { logger } from "../logger";

const TRANSIENT_ERROR_PATTERNS = [
  "socket hang up",
  "broken pipe",
  "connection reset",
  "econnreset",
  "etimedout",
  "econnrefused",
  "network_error",
  "epipe",
];

export function isTransientError(error: Error): boolean {
  const msg = (error.message ?? "").toLowerCase();
  const code = ((error as any).code ?? "").toLowerCase();
  return TRANSIENT_ERROR_PATTERNS.some(
    (pattern) => msg.includes(pattern) || code.includes(pattern),
  );
}

export interface CompletedPart {
  partIdentifier: string;
  partNumber: number;
}

export interface ChunkedUploadStrategy {
  initialize(): Promise<void>;
  uploadPart(data: Buffer, partNumber: number): Promise<CompletedPart>;
  complete(parts: CompletedPart[]): Promise<void>;
  abort(reason?: string): Promise<void>;
  uploadSingleObject(data: Buffer): Promise<void>;
}

// Upload counters surfaced for telemetry. `partRetries` is the total number of
// retry attempts across all parts (not distinct parts retried); `partFailures`
// is the number of parts that exhausted their attempts; `partsUploaded` is the
// number of completed parts.
export interface UploadPartStats {
  partsUploaded: number;
  partRetries: number;
  partFailures: number;
}

export function emptyUploadPartStats(): UploadPartStats {
  return { partsUploaded: 0, partRetries: 0, partFailures: 0 };
}

export interface BufferedStreamUploaderParams {
  strategy: ChunkedUploadStrategy;
  partSizeBytes: number;
  maxPartAttempts: number;
  maxConcurrentParts: number;
  key: string; // for logging
  // Optional mutable sink the caller owns. Incremented live so counts are
  // readable even when upload() throws. A fresh one is used when omitted.
  stats?: UploadPartStats;
}

// Collects errors from concurrent part uploads. Append-only by design so
// concurrent .catch() handlers can never overwrite each other — each call
// to capture() simply pushes to the list.
class ErrorSink {
  private errors: Error[] = [];

  capture(err: Error): void {
    this.errors.push(err);
  }

  first(): Error | undefined {
    return this.errors[0];
  }

  getAll(): Error[] {
    return [...this.errors];
  }

  hasError(): boolean {
    return this.errors.length > 0;
  }
}

export class BufferedStreamUploader {
  private readonly params: BufferedStreamUploaderParams;
  private completedParts: CompletedPart[] = [];
  private partNumber = 0;
  private currentBuffer: Buffer[] = [];
  private currentBufferSize = 0;
  private isCompleted = false;
  private inFlightUploads: Map<symbol, Promise<void>> = new Map();
  private readonly errors = new ErrorSink();
  private readonly stats: UploadPartStats;

  constructor(params: BufferedStreamUploaderParams) {
    // Buffer.concat rejects a non-integer length. Callers can pass
    // MiB * 1024 * 1024 from a fractional env value (e.g. 5.1).
    this.params = {
      ...params,
      partSizeBytes: Math.floor(params.partSizeBytes),
    };
    this.stats = params.stats ?? emptyUploadPartStats();
  }

  async upload(stream: Readable): Promise<UploadPartStats> {
    try {
      await this.params.strategy.initialize();

      for await (const chunk of stream) {
        if (this.errors.hasError()) break;

        const buf = Buffer.isBuffer(chunk)
          ? chunk
          : Buffer.from(chunk as string, "utf-8");

        if (buf.byteLength > this.params.partSizeBytes) {
          logger.warn(
            `Buffered upload: single chunk (${(buf.byteLength / 1024 / 1024).toFixed(2)} MiB) exceeds configured part size (${(this.params.partSizeBytes / 1024 / 1024).toFixed(2)} MiB) for key ${this.params.key}`,
          );
        }

        this.currentBuffer.push(buf);
        this.currentBufferSize += buf.byteLength;

        // Slice exact partSizeBytes parts and carry the remainder. Some
        // S3-compatible endpoints reject complete-multipart when non-trailing
        // parts differ in length.
        while (
          this.currentBufferSize >= this.params.partSizeBytes &&
          !this.errors.hasError()
        ) {
          await this.flushExactPart();
        }
      }

      // Final part is the only one allowed to be smaller than partSizeBytes.
      if (this.currentBufferSize > 0 && !this.errors.hasError()) {
        await this.flushRemainder();
      }

      // Wait for all in-flight uploads to complete
      await Promise.all(this.inFlightUploads.values());

      // Check for errors after all uploads settle
      if (this.errors.hasError()) {
        const all = this.errors.getAll();
        if (all.length > 1) {
          logger.error(
            `${all.length} part uploads failed for key ${this.params.key}: ${all.map((e) => e.message).join("; ")}`,
          );
        }
        throw all[0];
      }

      // Handle empty stream: abort chunked upload, use single object upload instead
      if (this.partNumber === 0) {
        await this.params.strategy.abort(
          "empty stream, falling back to single-part upload",
        );
        await this.params.strategy.uploadSingleObject(Buffer.alloc(0));
        this.isCompleted = true;
        return this.stats;
      }

      const sortedParts = [...this.completedParts].sort(
        (a, b) => a.partNumber - b.partNumber,
      );
      await this.params.strategy.complete(sortedParts);
      this.isCompleted = true;
    } finally {
      if (!this.isCompleted) {
        await Promise.all(this.inFlightUploads.values());
        await this.params.strategy.abort("upload failed or incomplete");
      }
    }

    return this.stats;
  }

  private async flushExactPart(): Promise<void> {
    await this.enqueuePart(this.takeBytes(this.params.partSizeBytes));
  }

  private async flushRemainder(): Promise<void> {
    await this.enqueuePart(this.takeBytes(this.currentBufferSize));
  }

  // Splits off the first `byteLength` bytes of currentBuffer as the part to
  // upload and keeps the leftover as the new buffer. Coalesces in a single
  // Buffer.concat pass so cost stays linear in the byte count regardless of
  // how many row chunks accumulated; a part can hold hundreds of thousands of
  // per-row chunks and this runs on the worker's shared event loop.
  // Caller must pass byteLength <= currentBufferSize.
  private takeBytes(byteLength: number): Buffer {
    // Single backing buffer: this is the loop that slices one oversized stream
    // chunk into k = chunkSize / partSizeBytes parts. Re-concatenating and
    // re-copying the shrinking leftover on each of those k calls would be
    // O(chunkSize^2 / partSizeBytes) — the same synchronous event-loop stall
    // this class avoids for many small chunks. Instead slice by view: copy
    // only the emitted part (so the large source frees once this synchronous
    // loop ends, rather than being pinned for the upload's retry lifetime) and
    // carry the leftover as a zero-copy view. Cost stays O(chunkSize).
    if (this.currentBuffer.length === 1) {
      const buf = this.currentBuffer[0];
      this.currentBufferSize -= byteLength;
      if (byteLength === buf.byteLength) {
        this.currentBuffer = [];
        return buf;
      }
      this.currentBuffer = [buf.subarray(byteLength)];
      return Buffer.from(buf.subarray(0, byteLength));
    }

    const combined = Buffer.concat(this.currentBuffer);
    const remainderLength = combined.byteLength - byteLength;
    // Non-final parts are normally returned as a view into `combined`: no copy
    // on the hot path, where `combined` is one part plus at most a trailing
    // row. But a single oversized stream chunk makes `combined` several parts
    // large, and a view would pin that whole buffer for the part upload's
    // lifetime (including retry backoff). When at least one more part is left
    // over, copy the slice so `combined` is freed as soon as this returns.
    const partData =
      remainderLength >= byteLength
        ? Buffer.from(combined.subarray(0, byteLength))
        : combined.subarray(0, byteLength);
    // Copy the leftover into its own allocation for the same reason.
    this.currentBuffer =
      remainderLength > 0 ? [Buffer.from(combined.subarray(byteLength))] : [];
    this.currentBufferSize -= byteLength;
    return partData;
  }

  private async enqueuePart(partData: Buffer): Promise<void> {
    this.partNumber++;

    // Wait for a slot if all concurrent slots are full
    while (
      this.inFlightUploads.size >= this.params.maxConcurrentParts &&
      !this.errors.hasError()
    ) {
      await Promise.race(this.inFlightUploads.values());
    }

    if (this.errors.hasError()) return;

    this.scheduleUpload(partData, this.partNumber);
  }

  private scheduleUpload(data: Buffer, partNumber: number): void {
    const id = Symbol(`part-${partNumber}`);
    const promise = this.uploadPartWithRetry(data, partNumber)
      .then((result) => {
        this.completedParts.push(result);
        this.stats.partsUploaded++;
        logger.debug(
          `Uploaded part ${partNumber} (${(data.byteLength / 1024 / 1024).toFixed(1)} MiB) for key ${this.params.key}`,
        );
      })
      .catch((err) => {
        this.stats.partFailures++;
        this.errors.capture(err);
      })
      .finally(() => {
        this.inFlightUploads.delete(id);
      });

    this.inFlightUploads.set(id, promise);
  }

  private async uploadPartWithRetry(
    data: Buffer,
    partNumber: number,
  ): Promise<CompletedPart> {
    return backOff(() => this.params.strategy.uploadPart(data, partNumber), {
      numOfAttempts: this.params.maxPartAttempts,
      startingDelay: 1000,
      timeMultiple: 2,
      maxDelay: 10_000,
      retry: (error: Error, attemptNumber: number) => {
        if (!isTransientError(error)) {
          return false;
        }
        // backoff also invokes this on the final failing attempt; skip counting
        // it so partRetries reflects actual retries, not total failures.
        if (attemptNumber >= this.params.maxPartAttempts) {
          return true;
        }
        this.stats.partRetries++;
        logger.warn(
          `Part ${partNumber} upload failed (attempt ${attemptNumber}/${this.params.maxPartAttempts}): ${error.message}. Retrying...`,
        );
        return true;
      },
    });
  }
}
