import { describe, expect, it, vi } from "vitest";
import { Readable } from "stream";

import {
  S3_DEFAULT_PART_SIZE_BYTES,
  S3_MAX_PARTS,
  S3MultipartLimitExceededError,
  formatGiB,
  isS3MultipartLimitExceededError,
  maxBytesForPartSize,
} from "./s3MultipartLimits";
import {
  BufferedStreamUploader,
  type ChunkedUploadStrategy,
} from "./BufferedStreamUploader";

describe("s3MultipartLimits", () => {
  it("defaults lib-storage parts to 64 MiB for a ~625 GiB ceiling (issue #17282)", () => {
    expect(S3_DEFAULT_PART_SIZE_BYTES).toBe(64 * 1024 * 1024);
    expect(S3_MAX_PARTS).toBe(10_000);
    // 64 MiB x 10k = 625 GiB, ~13x the old 48.83 GiB wall (5 MiB x 10k).
    expect(maxBytesForPartSize(S3_DEFAULT_PART_SIZE_BYTES)).toBe(
      64 * 1024 * 1024 * 10_000,
    );
    expect(maxBytesForPartSize(5 * 1024 * 1024)).toBe(52_428_800_000);
    expect(formatGiB(52_428_800_000)).toBe("48.8 GiB");
  });

  it("detects our named error even through handleStorageError-style wrapping", () => {
    const inner = new S3MultipartLimitExceededError("too big", {
      key: "k",
      partSizeBytes: 1,
    });
    const wrapped = new Error("Failed to upload file to S3", {
      cause: inner,
    });
    expect(isS3MultipartLimitExceededError(inner)).toBe(true);
    expect(isS3MultipartLimitExceededError(wrapped)).toBe(true);
  });

  it("detects lib-storage's bare 'Exceeded 10000 parts' message", () => {
    const libStorageError = new Error(
      "Exceeded 10000 parts in multipart upload to Bucket: b Key: k",
    );
    expect(isS3MultipartLimitExceededError(libStorageError)).toBe(true);
    expect(
      isS3MultipartLimitExceededError(
        new Error("Failed to upload", { cause: libStorageError }),
      ),
    ).toBe(true);
  });

  it("does not misclassify ordinary upload failures", () => {
    expect(isS3MultipartLimitExceededError(new Error("socket hang up"))).toBe(
      false,
    );
    expect(isS3MultipartLimitExceededError(new Error("AccessDenied"))).toBe(
      false,
    );
    expect(isS3MultipartLimitExceededError(null)).toBe(false);
    expect(isS3MultipartLimitExceededError(undefined)).toBe(false);
  });
});

describe("BufferedStreamUploader S3 part-count guard", () => {
  // Plain counters instead of a self-referential strategy object: the mock
  // closures must not reference the object under construction.
  const makeStrategy = () => {
    const counters = { abortCalls: 0, completeCalls: 0 };
    const strategy: ChunkedUploadStrategy = {
      initialize: vi.fn(async () => undefined),
      uploadPart: vi.fn(async (_data: Buffer, partNumber: number) => ({
        partIdentifier: `etag-${partNumber}`,
        partNumber,
      })),
      complete: vi.fn(async () => {
        counters.completeCalls++;
      }),
      abort: vi.fn(async () => {
        counters.abortCalls++;
      }),
      uploadSingleObject: vi.fn(async () => undefined),
    };
    return { strategy, counters };
  };

  it("fails fast with S3MultipartLimitExceededError past 10k parts and aborts", async () => {
    const { strategy, counters } = makeStrategy();
    const partSizeBytes = 5 * 1024 * 1024;
    const uploader = new BufferedStreamUploader({
      strategy,
      partSizeBytes,
      maxPartAttempts: 1,
      maxConcurrentParts: 2,
      key: "langfuse-export/p/observations_v2/2026-09-06T01-20-00.parquet",
    });

    // 10,001 parts of exactly partSizeBytes each.
    const onePart = Buffer.alloc(partSizeBytes, 1);
    async function* gen() {
      for (let i = 0; i < S3_MAX_PARTS + 1; i++) {
        yield onePart;
      }
    }

    const failure = await uploader
      .upload(Readable.from(gen()))
      .then(
        () => null,
        (e: unknown) => e,
      );
    expect(failure).toBeInstanceOf(S3MultipartLimitExceededError);
    expect(failure).toMatchObject({ name: "S3MultipartLimitExceededError" });
    // The worker keys its no-retry path off this predicate (BullMQ
    // UnrecoverableError), so the thrown error must stay detectable.
    expect(isS3MultipartLimitExceededError(failure)).toBe(true);
    // Abort runs on failure so no orphaned parts are left behind to bill.
    expect(counters.abortCalls).toBeGreaterThanOrEqual(1);
  });

  it("uploads exactly 10k parts successfully (boundary)", async () => {
    const { strategy, counters } = makeStrategy();
    const partSizeBytes = 1024;
    const uploader = new BufferedStreamUploader({
      strategy,
      partSizeBytes,
      maxPartAttempts: 1,
      maxConcurrentParts: 4,
      key: "boundary-key",
    });

    const onePart = Buffer.alloc(partSizeBytes, 2);
    async function* gen() {
      for (let i = 0; i < S3_MAX_PARTS; i++) {
        yield onePart;
      }
    }

    const stats = await uploader.upload(Readable.from(gen()));
    expect(stats.partsUploaded).toBe(S3_MAX_PARTS);
    expect(counters.completeCalls).toBe(1);
  });
});
