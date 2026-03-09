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

export interface BufferedStreamUploaderParams {
  strategy: ChunkedUploadStrategy;
  partSizeBytes: number;
  maxPartAttempts: number;
  maxConcurrentParts: number;
  key: string; // for logging
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

  constructor(params: BufferedStreamUploaderParams) {
    this.params = params;
  }

  async upload(stream: Readable): Promise<void> {
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

        if (this.currentBufferSize >= this.params.partSizeBytes) {
          await this.flushBuffer();
          if (this.errors.hasError()) break;
        }
      }

      // Flush remaining data
      if (this.currentBufferSize > 0 && !this.errors.hasError()) {
        await this.flushBuffer();
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
        return;
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
  }

  private async flushBuffer(): Promise<void> {
    const partData = Buffer.concat(this.currentBuffer);
    this.currentBuffer = [];
    this.currentBufferSize = 0;
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
        logger.debug(
          `Uploaded part ${partNumber} (${(data.byteLength / 1024 / 1024).toFixed(1)} MiB) for key ${this.params.key}`,
        );
      })
      .catch((err) => {
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
        logger.warn(
          `Part ${partNumber} upload failed (attempt ${attemptNumber}/${this.params.maxPartAttempts}): ${error.message}. Retrying...`,
        );
        return true;
      },
    });
  }
}
