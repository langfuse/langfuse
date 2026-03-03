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
  key: string; // for logging
}

export class BufferedStreamUploader {
  private readonly params: BufferedStreamUploaderParams;
  private completedParts: CompletedPart[] = [];
  private partNumber = 0;
  private currentBuffer: Buffer[] = [];
  private currentBufferSize = 0;
  private isCompleted = false;

  constructor(params: BufferedStreamUploaderParams) {
    this.params = params;
  }

  async upload(stream: Readable): Promise<void> {
    try {
      await this.params.strategy.initialize();

      for await (const chunk of stream) {
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
        }
      }

      // Flush remaining data
      if (this.currentBufferSize > 0) {
        await this.flushBuffer();
      }

      // Handle empty stream: abort chunked upload, use single object upload instead
      if (this.partNumber === 0) {
        await this.params.strategy.abort();
        await this.params.strategy.uploadSingleObject(Buffer.alloc(0));
        this.isCompleted = true;
        return;
      }

      await this.params.strategy.complete(this.completedParts);
      this.isCompleted = true;
    } finally {
      if (!this.isCompleted) {
        await this.params.strategy.abort();
      }
    }
  }

  private async flushBuffer(): Promise<void> {
    const partData = Buffer.concat(this.currentBuffer);
    this.currentBuffer = [];
    this.currentBufferSize = 0;
    this.partNumber++;

    await this.uploadPart(partData, this.partNumber);
  }

  private async uploadPart(data: Buffer, partNumber: number): Promise<void> {
    const result = await backOff(
      () => this.params.strategy.uploadPart(data, partNumber),
      {
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
      },
    );

    this.completedParts.push(result);

    logger.debug(
      `Uploaded part ${partNumber} (${(data.byteLength / 1024 / 1024).toFixed(1)} MiB) for key ${this.params.key}`,
    );
  }
}
