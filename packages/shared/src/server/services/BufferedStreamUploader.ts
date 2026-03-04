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
  abort(): Promise<void>;
  uploadSingleObject(data: Buffer): Promise<void>;
}

export interface BufferedStreamUploaderParams {
  strategy: ChunkedUploadStrategy;
  partSizeBytes: number;
  maxPartAttempts: number;
  maxConcurrentParts: number;
  key: string; // for logging
}

// Encapsulates "first write wins" for error capture. Prevents callers from
// accidentally overwriting a prior error — a subtle bug that would be easy to
// introduce when multiple parts fail concurrently, even though Node's
// single-threaded model makes the raw check-then-set technically safe today,
// it is entirely possible to just forget to check if an error is already captured.
class FirstError {
  private error: Error | null = null;

  capture(err: Error): void {
    if (!this.error) {
      this.error = err;
    }
  }

  get(): Error | null {
    return this.error;
  }

  hasError(): boolean {
    return this.error !== null;
  }
}

export class BufferedStreamUploader {
  private readonly params: BufferedStreamUploaderParams;
  private completedParts: CompletedPart[] = [];
  private partNumber = 0;
  private currentBuffer: Buffer[] = [];
  private currentBufferSize = 0;
  private isCompleted = false;
  private inFlightUploads: Set<Promise<void>> = new Set();
  private readonly firstError = new FirstError();

  constructor(params: BufferedStreamUploaderParams) {
    this.params = params;
  }

  async upload(stream: Readable): Promise<void> {
    try {
      await this.params.strategy.initialize();

      for await (const chunk of stream) {
        if (this.firstError.hasError()) break;

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

        if (this.currentBufferSize >= this.params.partSizeBytes) {
          await this.flushBuffer();
          if (this.firstError.hasError()) break;
        }
      }

      // Flush remaining data
      if (this.currentBufferSize > 0 && !this.firstError.hasError()) {
        await this.flushBuffer();
      }

      // Wait for all in-flight uploads to complete
      await Promise.all(this.inFlightUploads);

      // Check for errors after all uploads settle
      if (this.firstError.hasError()) {
        throw this.firstError.get();
      }

      // Handle empty stream: abort chunked upload, use single object upload instead
      if (this.partNumber === 0) {
        await this.params.strategy.abort();
        await this.params.strategy.uploadSingleObject(Buffer.alloc(0));
        this.isCompleted = true;
        return;
      }

      const sortedParts = [...this.completedParts].sort(
        (a, b) => a.partNumber - b.partNumber,
      );
      await this.params.strategy.complete(sortedParts);
      this.isCompleted = true;
    } finally {
      if (!this.isCompleted) {
        await Promise.all(this.inFlightUploads);
        await this.params.strategy.abort();
      }
    }
  }

  private async flushBuffer(): Promise<void> {
    const partData = Buffer.concat(this.currentBuffer);
    this.currentBuffer = [];
    this.currentBufferSize = 0;
    this.partNumber++;

    // Wait for a slot if all concurrent slots are full
    while (
      this.inFlightUploads.size >= this.params.maxConcurrentParts &&
      !this.firstError.hasError()
    ) {
      await Promise.race(this.inFlightUploads);
    }

    if (this.firstError.hasError()) return;

    this.scheduleUpload(partData, this.partNumber);
  }

  private scheduleUpload(data: Buffer, partNumber: number): void {
    const promise = this.uploadPartWithRetry(data, partNumber)
      .then((result) => {
        this.completedParts.push(result);
        logger.debug(
          `Uploaded part ${partNumber} (${(data.byteLength / 1024 / 1024).toFixed(1)} MiB) for key ${this.params.key}`,
        );
      })
      .catch((err) => {
        this.firstError.capture(err);
      })
      .finally(() => {
        this.inFlightUploads.delete(promise);
      });

    this.inFlightUploads.add(promise);
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
        logger.warn(
          `Part ${partNumber} upload failed (attempt ${attemptNumber}/${this.params.maxPartAttempts}): ${error.message}. Retrying...`,
        );
        return true;
      },
    });
  }
}
