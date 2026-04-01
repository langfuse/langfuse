import { describe, it, expect, vi } from "vitest";
import { Readable } from "stream";

import {
  BufferedStreamUploader,
  isTransientError,
  type ChunkedUploadStrategy,
  type CompletedPart,
} from "@langfuse/shared/src/server";
import { S3ChunkedUploadStrategy } from "@langfuse/shared/src/server";
import { logger } from "@langfuse/shared/src/server";

/**
 * Creates a mock ChunkedUploadStrategy that records method calls.
 */
function createMockStrategy(overrides?: {
  uploadPartImpl?: (data: Buffer, partNumber: number) => Promise<CompletedPart>;
}) {
  const calls: Array<{ method: string; args: any[] }> = [];
  const uploadedParts: Array<{ data: Buffer; partNumber: number }> = [];

  const strategy: ChunkedUploadStrategy = {
    initialize: vi.fn(async () => {
      calls.push({ method: "initialize", args: [] });
    }),
    uploadPart: vi.fn(async (data: Buffer, partNumber: number) => {
      calls.push({ method: "uploadPart", args: [data, partNumber] });
      if (overrides?.uploadPartImpl) {
        return overrides.uploadPartImpl(data, partNumber);
      }
      uploadedParts.push({ data, partNumber });
      return { partIdentifier: `etag-${partNumber}`, partNumber };
    }),
    complete: vi.fn(async (parts: CompletedPart[]) => {
      calls.push({ method: "complete", args: [parts] });
    }),
    abort: vi.fn(async () => {
      calls.push({ method: "abort", args: [] });
    }),
    uploadSingleObject: vi.fn(async (data: Buffer) => {
      calls.push({ method: "uploadSingleObject", args: [data] });
    }),
  };

  return { strategy, calls, uploadedParts };
}

function defaultParams(strategy: ChunkedUploadStrategy) {
  return {
    strategy,
    key: "test-key.csv",
    partSizeBytes: 1024, // 1 KiB for easy testing
    maxPartAttempts: 3,
    maxConcurrentParts: 1, // sequential by default for test predictability
  };
}

/** Create a readable stream from an array of string chunks */
function streamFrom(chunks: string[]): Readable {
  return Readable.from(chunks);
}

describe("BufferedStreamUploader", () => {
  describe("single-part upload", () => {
    it("should upload small data as a single part", async () => {
      const mock = createMockStrategy();
      const uploader = new BufferedStreamUploader(defaultParams(mock.strategy));

      await uploader.upload(streamFrom(["hello world"]));

      const methods = mock.calls.map((c) => c.method);
      expect(methods).toEqual(["initialize", "uploadPart", "complete"]);

      // Verify the single part
      expect(mock.uploadedParts).toHaveLength(1);
      expect(mock.uploadedParts[0].data).toEqual(Buffer.from("hello world"));
      expect(mock.uploadedParts[0].partNumber).toBe(1);

      // Verify complete was called with the part
      const completeCall = mock.calls.find((c) => c.method === "complete");
      expect(completeCall!.args[0]).toEqual([
        { partIdentifier: "etag-1", partNumber: 1 },
      ]);
    });
  });

  describe("multi-part upload", () => {
    it("should split data into multiple parts based on partSizeBytes", async () => {
      const mock = createMockStrategy();
      const uploader = new BufferedStreamUploader({
        ...defaultParams(mock.strategy),
        partSizeBytes: 10, // 10 bytes per part
      });

      // Each chunk is 5 bytes, so 2 chunks = 10 bytes = 1 part flush
      // 6 chunks total = 3 parts
      const chunks = ["aaaaa", "bbbbb", "ccccc", "ddddd", "eeeee", "fffff"];
      await uploader.upload(streamFrom(chunks));

      expect(mock.uploadedParts).toHaveLength(3);
      expect(mock.uploadedParts[0].partNumber).toBe(1);
      expect(mock.uploadedParts[0].data).toEqual(Buffer.from("aaaaabbbbb"));
      expect(mock.uploadedParts[1].partNumber).toBe(2);
      expect(mock.uploadedParts[1].data).toEqual(Buffer.from("cccccddddd"));
      expect(mock.uploadedParts[2].partNumber).toBe(3);
      expect(mock.uploadedParts[2].data).toEqual(Buffer.from("eeeeefffff"));

      // Verify complete was called with all parts
      const completeCall = mock.calls.find((c) => c.method === "complete");
      expect(completeCall!.args[0]).toHaveLength(3);
    });

    it("should handle a remainder part smaller than partSizeBytes", async () => {
      const mock = createMockStrategy();
      const uploader = new BufferedStreamUploader({
        ...defaultParams(mock.strategy),
        partSizeBytes: 10,
      });

      // 15 bytes total: 1 full part (10 bytes) + 1 remainder (5 bytes)
      const chunks = ["aaaaaaaaaa", "bbbbb"];
      await uploader.upload(streamFrom(chunks));

      expect(mock.uploadedParts).toHaveLength(2);
      expect(mock.uploadedParts[0].data.byteLength).toBe(10);
      expect(mock.uploadedParts[1].data.byteLength).toBe(5);
    });
  });

  describe("empty stream", () => {
    it("should handle empty stream with single object upload instead of multipart", async () => {
      const mock = createMockStrategy();
      const uploader = new BufferedStreamUploader(defaultParams(mock.strategy));

      await uploader.upload(streamFrom([]));

      const methods = mock.calls.map((c) => c.method);
      // Should abort the chunked upload and use single object upload
      expect(methods).toContain("abort");
      expect(methods).toContain("uploadSingleObject");
      expect(methods).not.toContain("complete");
    });
  });

  describe("part retry on transient error", () => {
    it("should retry a transient error and succeed", async () => {
      let uploadAttempts = 0;
      const mock = createMockStrategy({
        uploadPartImpl: async (data, partNumber) => {
          uploadAttempts++;
          if (uploadAttempts === 1) {
            throw new Error("socket hang up");
          }
          return { partIdentifier: `etag-${partNumber}`, partNumber };
        },
      });

      const uploader = new BufferedStreamUploader(defaultParams(mock.strategy));
      await uploader.upload(streamFrom(["hello world"]));

      // Should have retried and succeeded
      expect(uploadAttempts).toBe(2);
      const methods = mock.calls.map((c) => c.method);
      expect(methods).toContain("complete");
      expect(methods).not.toContain("abort");
    });
  });

  describe("abort on part failure after max retries", () => {
    it("should abort upload when part fails after all retries", async () => {
      const mock = createMockStrategy({
        uploadPartImpl: async () => {
          throw new Error("socket hang up");
        },
      });

      const uploader = new BufferedStreamUploader({
        ...defaultParams(mock.strategy),
        maxPartAttempts: 2,
      });

      await expect(uploader.upload(streamFrom(["hello"]))).rejects.toThrow(
        "socket hang up",
      );

      const methods = mock.calls.map((c) => c.method);
      expect(methods).toContain("abort");
      expect(methods).not.toContain("complete");
    });

    it("should not retry non-transient errors", async () => {
      let uploadAttempts = 0;
      const mock = createMockStrategy({
        uploadPartImpl: async () => {
          uploadAttempts++;
          throw new Error("AccessDenied");
        },
      });

      const uploader = new BufferedStreamUploader(defaultParams(mock.strategy));

      await expect(uploader.upload(streamFrom(["hello"]))).rejects.toThrow(
        "AccessDenied",
      );

      // Should NOT have retried — AccessDenied is not transient
      expect(uploadAttempts).toBe(1);
    });
  });

  describe("abort on stream error", () => {
    it("should abort upload when the source stream errors", async () => {
      const mock = createMockStrategy();
      const uploader = new BufferedStreamUploader(defaultParams(mock.strategy));

      const errorStream = new Readable({
        read() {
          this.destroy(new Error("ClickHouse connection timeout"));
        },
      });

      await expect(uploader.upload(errorStream)).rejects.toThrow(
        "ClickHouse connection timeout",
      );

      const methods = mock.calls.map((c) => c.method);
      expect(methods).toContain("initialize");
      expect(methods).toContain("abort");
      expect(methods).not.toContain("complete");
    });
  });

  describe("oversized row warning", () => {
    it("should warn when a single chunk exceeds partSizeBytes", async () => {
      const mock = createMockStrategy();
      const uploader = new BufferedStreamUploader({
        ...defaultParams(mock.strategy),
        partSizeBytes: 10, // 10 bytes
      });

      const warnSpy = vi.spyOn(logger, "warn");

      // Single chunk of 20 bytes exceeds 10-byte part size
      const largeChunk = "a".repeat(20);
      await uploader.upload(streamFrom([largeChunk]));

      // Should have warned about the oversized chunk
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("exceeds configured part size"),
      );

      // Upload should still complete successfully
      const methods = mock.calls.map((c) => c.method);
      expect(methods).toContain("complete");

      warnSpy.mockRestore();
    });
  });

  describe("upload concurrency", () => {
    it("should upload parts one at a time when maxConcurrentParts is 1", async () => {
      const uploadOrder: number[] = [];
      let activeUploads = 0;
      let maxActiveUploads = 0;

      const mock = createMockStrategy({
        uploadPartImpl: async (data, partNumber) => {
          activeUploads++;
          maxActiveUploads = Math.max(maxActiveUploads, activeUploads);
          uploadOrder.push(partNumber);
          await new Promise((r) => setTimeout(r, 10));
          activeUploads--;
          return { partIdentifier: `etag-${partNumber}`, partNumber };
        },
      });

      const uploader = new BufferedStreamUploader({
        ...defaultParams(mock.strategy),
        partSizeBytes: 5,
        maxConcurrentParts: 1,
      });

      await uploader.upload(streamFrom(["aaaaa", "bbbbb", "ccccc", "ddddd"]));

      expect(uploadOrder).toEqual([1, 2, 3, 4]);
      expect(maxActiveUploads).toBe(1);
    });

    it("should upload parts concurrently up to maxConcurrentParts", async () => {
      let activeUploads = 0;
      let maxActiveUploads = 0;

      const mock = createMockStrategy({
        uploadPartImpl: async (data, partNumber) => {
          activeUploads++;
          maxActiveUploads = Math.max(maxActiveUploads, activeUploads);
          await new Promise((r) => setTimeout(r, 50));
          activeUploads--;
          return { partIdentifier: `etag-${partNumber}`, partNumber };
        },
      });

      const uploader = new BufferedStreamUploader({
        ...defaultParams(mock.strategy),
        partSizeBytes: 5,
        maxConcurrentParts: 3,
      });

      // 5 parts: first 3 fire concurrently, parts 4-5 wait for slots
      await uploader.upload(
        streamFrom(["aaaaa", "bbbbb", "ccccc", "ddddd", "eeeee"]),
      );

      expect(maxActiveUploads).toBe(3);

      // All parts should complete
      const completeCall = mock.calls.find((c) => c.method === "complete");
      expect(completeCall!.args[0]).toHaveLength(5);
    });

    it("should call complete with parts sorted by partNumber even when uploads finish out of order", async () => {
      const mock = createMockStrategy({
        uploadPartImpl: async (data, partNumber) => {
          // Part 1 is slow, part 2 finishes first
          const delay = partNumber === 1 ? 80 : 10;
          await new Promise((r) => setTimeout(r, delay));
          return { partIdentifier: `etag-${partNumber}`, partNumber };
        },
      });

      const uploader = new BufferedStreamUploader({
        ...defaultParams(mock.strategy),
        partSizeBytes: 5,
        maxConcurrentParts: 3,
      });

      await uploader.upload(streamFrom(["aaaaa", "bbbbb", "ccccc"]));

      const completeCall = mock.calls.find((c) => c.method === "complete");
      const parts = completeCall!.args[0] as CompletedPart[];
      expect(parts.map((p) => p.partNumber)).toEqual([1, 2, 3]);
    });

    it("should stop scheduling new parts when a concurrent part fails", async () => {
      let partsStarted = 0;

      const mock = createMockStrategy({
        uploadPartImpl: async (data, partNumber) => {
          partsStarted++;
          if (partNumber === 2) {
            throw new Error("AccessDenied");
          }
          // Slow upload so part 2 fails while others are in flight
          await new Promise((r) => setTimeout(r, 100));
          return { partIdentifier: `etag-${partNumber}`, partNumber };
        },
      });

      const uploader = new BufferedStreamUploader({
        ...defaultParams(mock.strategy),
        partSizeBytes: 5,
        maxConcurrentParts: 3,
        maxPartAttempts: 1,
      });

      // 6 chunks → 6 parts; part 2 fails immediately, should prevent later parts
      await expect(
        uploader.upload(
          streamFrom(["aaaaa", "bbbbb", "ccccc", "ddddd", "eeeee", "fffff"]),
        ),
      ).rejects.toThrow("AccessDenied");

      // Parts 1-3 start concurrently, but part 2 failure should prevent 4+
      expect(partsStarted).toBeLessThanOrEqual(4);

      const methods = mock.calls.map((c) => c.method);
      expect(methods).toContain("abort");
      expect(methods).not.toContain("complete");
    });
  });
});

describe("isTransientError", () => {
  it.each([
    ["socket hang up", true],
    ["broken pipe", true],
    ["connection reset by peer", true],
    ["Connection Reset", true],
    ["read ECONNRESET", true],
    ["connect ETIMEDOUT", true],
    ["connect ECONNREFUSED 127.0.0.1:443", true],
    ["network_error", true],
    ["write EPIPE", true],
    ["AccessDenied", false],
    ["NoSuchBucket", false],
    ["InvalidPart", false],
    ["", false],
  ])("classifies '%s' as transient=%s", (message, expected) => {
    expect(isTransientError(new Error(message))).toBe(expected);
  });

  it("matches on error code when message does not match", () => {
    const err = new Error("some generic message");
    (err as any).code = "ECONNRESET";
    expect(isTransientError(err)).toBe(true);
  });
});

describe("S3ChunkedUploadStrategy", () => {
  /**
   * Minimal mock of S3Client that records sent commands.
   */
  function createMockS3Client() {
    const sentCommands: Array<{ name: string; input: any }> = [];

    const send = vi.fn(async (command: any) => {
      const name = command.constructor.name;
      sentCommands.push({ name, input: command.input });

      if (name === "CreateMultipartUploadCommand") {
        return { UploadId: "test-upload-id" };
      }
      if (name === "UploadPartCommand") {
        return { ETag: `"etag-part-${command.input.PartNumber}"` };
      }
      if (name === "CompleteMultipartUploadCommand") {
        return {};
      }
      if (name === "AbortMultipartUploadCommand") {
        return {};
      }
      if (name === "PutObjectCommand") {
        return {};
      }
      return {};
    });

    return { client: { send } as any, sentCommands };
  }

  describe("S3 command mapping", () => {
    it("should map initialize to CreateMultipartUploadCommand with SSE params", async () => {
      const mock = createMockS3Client();
      const strategy = new S3ChunkedUploadStrategy({
        client: mock.client,
        bucket: "test-bucket",
        key: "test-key.csv",
        contentType: "text/csv",
        sseConfig: {
          serverSideEncryption: "aws:kms",
          sseKmsKeyId: "my-kms-key-id",
        },
      });

      await strategy.initialize();

      const cmd = mock.sentCommands[0];
      expect(cmd.name).toBe("CreateMultipartUploadCommand");
      expect(cmd.input.Bucket).toBe("test-bucket");
      expect(cmd.input.Key).toBe("test-key.csv");
      expect(cmd.input.ContentType).toBe("text/csv");
      expect(cmd.input.ServerSideEncryption).toBe("aws:kms");
      expect(cmd.input.SSEKMSKeyId).toBe("my-kms-key-id");
    });

    it("should not set SSEKMSKeyId when encryption is not aws:kms", async () => {
      const mock = createMockS3Client();
      const strategy = new S3ChunkedUploadStrategy({
        client: mock.client,
        bucket: "test-bucket",
        key: "test-key.csv",
        contentType: "text/csv",
        sseConfig: {
          serverSideEncryption: "AES256",
          sseKmsKeyId: "should-be-ignored",
        },
      });

      await strategy.initialize();

      const cmd = mock.sentCommands[0];
      expect(cmd.input.ServerSideEncryption).toBe("AES256");
      expect(cmd.input.SSEKMSKeyId).toBeUndefined();
    });

    it("should pass SSE params to PutObject for single object upload", async () => {
      const mock = createMockS3Client();
      const strategy = new S3ChunkedUploadStrategy({
        client: mock.client,
        bucket: "test-bucket",
        key: "test-key.csv",
        contentType: "text/csv",
        sseConfig: {
          serverSideEncryption: "aws:kms",
          sseKmsKeyId: "my-kms-key-id",
        },
      });

      await strategy.uploadSingleObject(Buffer.alloc(0));

      const putCmd = mock.sentCommands.find(
        (c) => c.name === "PutObjectCommand",
      );
      expect(putCmd!.input.ServerSideEncryption).toBe("aws:kms");
      expect(putCmd!.input.SSEKMSKeyId).toBe("my-kms-key-id");
    });

    it("should map uploadPart to UploadPartCommand and return ETag", async () => {
      const mock = createMockS3Client();
      const strategy = new S3ChunkedUploadStrategy({
        client: mock.client,
        bucket: "test-bucket",
        key: "test-key.csv",
        contentType: "text/csv",
      });

      await strategy.initialize();
      const result = await strategy.uploadPart(Buffer.from("hello"), 1);

      expect(result.partIdentifier).toBe('"etag-part-1"');
      expect(result.partNumber).toBe(1);

      const uploadCmd = mock.sentCommands.find(
        (c) => c.name === "UploadPartCommand",
      );
      expect(uploadCmd!.input.UploadId).toBe("test-upload-id");
      expect(uploadCmd!.input.PartNumber).toBe(1);
      expect(uploadCmd!.input.Body).toEqual(Buffer.from("hello"));
    });

    it("should map complete to CompleteMultipartUploadCommand", async () => {
      const mock = createMockS3Client();
      const strategy = new S3ChunkedUploadStrategy({
        client: mock.client,
        bucket: "test-bucket",
        key: "test-key.csv",
        contentType: "text/csv",
      });

      await strategy.initialize();
      await strategy.complete([
        { partIdentifier: "etag-1", partNumber: 1 },
        { partIdentifier: "etag-2", partNumber: 2 },
      ]);

      const completeCmd = mock.sentCommands.find(
        (c) => c.name === "CompleteMultipartUploadCommand",
      );
      expect(completeCmd!.input.UploadId).toBe("test-upload-id");
      expect(completeCmd!.input.MultipartUpload.Parts).toEqual([
        { ETag: "etag-1", PartNumber: 1 },
        { ETag: "etag-2", PartNumber: 2 },
      ]);
    });

    it("should map abort to AbortMultipartUploadCommand", async () => {
      const mock = createMockS3Client();
      const strategy = new S3ChunkedUploadStrategy({
        client: mock.client,
        bucket: "test-bucket",
        key: "test-key.csv",
        contentType: "text/csv",
      });

      await strategy.initialize();
      await strategy.abort();

      const abortCmd = mock.sentCommands.find(
        (c) => c.name === "AbortMultipartUploadCommand",
      );
      expect(abortCmd!.input.UploadId).toBe("test-upload-id");
    });

    it("should not throw when abort is called before initialize", async () => {
      const mock = createMockS3Client();
      const strategy = new S3ChunkedUploadStrategy({
        client: mock.client,
        bucket: "test-bucket",
        key: "test-key.csv",
        contentType: "text/csv",
      });

      // Should not throw — no uploadId means nothing to abort
      await expect(strategy.abort()).resolves.toBeUndefined();
      expect(mock.sentCommands).toHaveLength(0);
    });

    it("should throw when uploadPart returns no ETag", async () => {
      const sentCommands: Array<{ name: string; input: any }> = [];
      const client = {
        send: vi.fn(async (command: any) => {
          const name = command.constructor.name;
          sentCommands.push({ name, input: command.input });
          if (name === "CreateMultipartUploadCommand")
            return { UploadId: "test-upload-id" };
          if (name === "UploadPartCommand") return { ETag: undefined };
          return {};
        }),
      } as any;

      const strategy = new S3ChunkedUploadStrategy({
        client,
        bucket: "test-bucket",
        key: "test-key.csv",
        contentType: "text/csv",
      });

      await strategy.initialize();
      await expect(
        strategy.uploadPart(Buffer.from("hello"), 1),
      ).rejects.toThrow("returned no ETag");
    });

    it("should throw when initialize returns no UploadId", async () => {
      const client = {
        send: vi.fn(async () => ({ UploadId: undefined })),
      } as any;

      const strategy = new S3ChunkedUploadStrategy({
        client,
        bucket: "test-bucket",
        key: "test-key.csv",
        contentType: "text/csv",
      });

      await expect(strategy.initialize()).rejects.toThrow(
        "no UploadId returned",
      );
    });

    it("should swallow errors from abort without propagating", async () => {
      const client = {
        send: vi.fn(async (command: any) => {
          const name = command.constructor.name;
          if (name === "CreateMultipartUploadCommand")
            return { UploadId: "test-upload-id" };
          if (name === "AbortMultipartUploadCommand")
            throw new Error("S3 abort failed");
          return {};
        }),
      } as any;

      const strategy = new S3ChunkedUploadStrategy({
        client,
        bucket: "test-bucket",
        key: "test-key.csv",
        contentType: "text/csv",
      });

      await strategy.initialize();
      // abort() must not throw — the finally block depends on this
      await expect(strategy.abort()).resolves.toBeUndefined();
    });
  });
});
