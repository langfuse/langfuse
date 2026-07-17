import { createHash } from "crypto";
import { Readable } from "stream";

import { afterEach, describe, expect, it, vi } from "vitest";

import type { S3Client } from "@aws-sdk/client-s3";

import { env } from "../../env";
import { StorageServiceFactory } from "./StorageService";

/**
 * Regression tests for the Azure Blob download path.
 *
 * `AzureBlobStorageService.streamToString` used to decode each download
 * stream chunk individually with `data.toString()` and concatenate the
 * resulting strings. Node.js stream chunk boundaries can fall in the middle
 * of a multibyte UTF-8 sequence, so any character straddling a boundary was
 * split and decoded as invalid bytes, producing U+FFFD. The fix aggregates
 * the raw Buffers and decodes once at the end.
 */
describe("AzureBlobStorageService.streamToString", () => {
  // streamToString is private; reach it through the Azure instance for a
  // focused unit test without standing up a real Azure backend (the
  // constructor does not perform any network calls).
  const getStreamToString = () => {
    const service = StorageServiceFactory.getInstance({
      accessKeyId: "test-account",
      secretAccessKey: Buffer.from("test-secret-key").toString("base64"),
      bucketName: "test-container",
      endpoint: "https://test.blob.core.windows.net",
      region: undefined,
      forcePathStyle: false,
      useAzureBlob: true,
      awsSse: undefined,
      awsSseKmsKeyId: undefined,
    });

    return (chunks: Buffer[]): Promise<string> =>
      (
        service as unknown as {
          streamToString(stream: NodeJS.ReadableStream): Promise<string>;
        }
      ).streamToString(streamFromChunks(chunks));
  };

  // Emits each provided buffer as its own discrete "data" chunk, so we can
  // reproduce exact chunk boundaries.
  const streamFromChunks = (chunks: Buffer[]): Readable => {
    let index = 0;
    return new Readable({
      read() {
        if (index < chunks.length) {
          this.push(chunks[index++]);
        } else {
          this.push(null);
        }
      },
    });
  };

  const splitBufferAt = (buffer: Buffer, offset: number): Buffer[] => [
    buffer.subarray(0, offset),
    buffer.subarray(offset),
  ];

  it("reassembles a 3-byte character split across a chunk boundary", async () => {
    const streamToString = getStreamToString();
    const text = "について の ご相談"; // の = E3 81 AE
    const buffer = Buffer.from(text, "utf-8");
    const splitOffset = buffer.indexOf(Buffer.from("の", "utf-8")) + 1; // inside の

    const result = await streamToString(splitBufferAt(buffer, splitOffset));

    expect(result).toBe(text);
    expect(result).not.toContain("�");
  });

  it("handles a boundary at every byte (worst case)", async () => {
    const streamToString = getStreamToString();
    const text = "支払いは退院後になります。🙂 café";
    const buffer = Buffer.from(text, "utf-8");
    const oneBytePerChunk = Array.from(buffer, (byte) => Buffer.from([byte]));

    const result = await streamToString(oneBytePerChunk);

    expect(result).toBe(text);
  });

  it("leaves ASCII-only content unchanged", async () => {
    const streamToString = getStreamToString();
    const text = "plain ascii payload";
    const buffer = Buffer.from(text, "utf-8");

    const result = await streamToString(splitBufferAt(buffer, 4));

    expect(result).toBe(text);
  });

  it("returns an empty string for an empty stream", async () => {
    const streamToString = getStreamToString();

    const result = await streamToString([]);

    expect(result).toBe("");
  });
});

/**
 * Regression tests for Google Cloud Storage signed-URL generation.
 *
 * Generating a v4 signed URL calls Google's `iamcredentials:signBlob` endpoint
 * through `@google-cloud/storage` -> `google-auth-library` -> `gaxios`. That
 * call can fail transiently with "Premature close" (the socket to Google's IAM
 * API is dropped mid-response), which previously surfaced as a hard failure for
 * the whole export/media flow (issue #14460). `deleteFiles` already wraps its
 * GCS call in `backOff`; these tests cover the same hardening now applied to
 * `getSignedUrl` / `getSignedUploadUrl`: a single transient failure is retried,
 * a persistent failure still propagates (never masked), and retries are bounded.
 */
describe("GoogleCloudStorageService signed-URL retry", () => {
  // A "Premature close" from the underlying signBlob HTTP call, as seen in #14460.
  const prematureClose = () =>
    Object.assign(
      new Error(
        "Invalid response body while trying to fetch " +
          "https://iamcredentials.googleapis.com/...:signBlob: Premature close",
      ),
      { name: "SigningError" },
    );

  // Build a real GoogleCloudStorageService (its constructor performs no network
  // I/O without credentials) and replace its private `bucket` with a stub whose
  // `file().getSignedUrl` we control, so we exercise the retry wrapper without a
  // live GCS backend.
  const makeService = (getSignedUrl: ReturnType<typeof vi.fn>) => {
    const service = StorageServiceFactory.getInstance({
      accessKeyId: undefined,
      secretAccessKey: undefined,
      bucketName: "test-bucket",
      endpoint: undefined,
      region: undefined,
      forcePathStyle: false,
      useGoogleCloudStorage: true,
      awsSse: undefined,
      awsSseKmsKeyId: undefined,
    });

    (
      service as unknown as { bucket: { file: (name: string) => unknown } }
    ).bucket = {
      file: () => ({ getSignedUrl }),
    };

    return service as unknown as {
      getSignedUrl(fileName: string, ttlSeconds: number): Promise<string>;
      getSignedUrlNonRetrying(
        fileName: string,
        ttlSeconds: number,
      ): Promise<string>;
      getSignedUploadUrl(params: {
        path: string;
        ttlSeconds: number;
        sha256Hash: string;
        contentType: string;
        contentLength: number;
      }): Promise<string>;
    };
  };

  const uploadParams = {
    path: "media/p.png",
    ttlSeconds: 3600,
    sha256Hash: "hash",
    contentType: "image/png",
    contentLength: 1,
  };

  // Reproduction: the un-retried path (old behavior) fails on a single
  // transient "Premature close" -- exactly what issue #14460 reports.
  it("getSignedUrlNonRetrying rejects on a single transient failure (repro)", async () => {
    const getSignedUrl = vi.fn().mockRejectedValueOnce(prematureClose());
    const service = makeService(getSignedUrl);

    await expect(
      service.getSignedUrlNonRetrying("f.png", 3600),
    ).rejects.toThrow();
    expect(getSignedUrl).toHaveBeenCalledTimes(1);
  });

  // Fix: the public method retries the transient failure and succeeds.
  it("getSignedUrl retries a transient failure and returns the URL", async () => {
    const getSignedUrl = vi
      .fn()
      .mockRejectedValueOnce(prematureClose())
      .mockResolvedValue(["https://signed-read-url"]);
    const service = makeService(getSignedUrl);

    await expect(service.getSignedUrl("f.png", 3600)).resolves.toBe(
      "https://signed-read-url",
    );
    expect(getSignedUrl).toHaveBeenCalledTimes(2);
  });

  it("getSignedUploadUrl retries a transient failure and returns the URL", async () => {
    const getSignedUrl = vi
      .fn()
      .mockRejectedValueOnce(prematureClose())
      .mockResolvedValue(["https://signed-write-url"]);
    const service = makeService(getSignedUrl);

    await expect(service.getSignedUploadUrl(uploadParams)).resolves.toBe(
      "https://signed-write-url",
    );
    expect(getSignedUrl).toHaveBeenCalledTimes(2);
  });

  // Guard: a persistent failure is not masked -- it still throws, after a
  // bounded number of attempts (3), not indefinitely.
  it("getSignedUrl gives up after 3 attempts and still throws", async () => {
    const getSignedUrl = vi.fn().mockRejectedValue(prematureClose());
    const service = makeService(getSignedUrl);

    await expect(service.getSignedUrl("f.png", 3600)).rejects.toThrow();
    expect(getSignedUrl).toHaveBeenCalledTimes(3);
  });

  // No retry overhead on the happy path.
  it("getSignedUrl calls the backend once when it succeeds immediately", async () => {
    const getSignedUrl = vi.fn().mockResolvedValue(["https://signed-read-url"]);
    const service = makeService(getSignedUrl);

    await expect(service.getSignedUrl("f.png", 3600)).resolves.toBe(
      "https://signed-read-url",
    );
    expect(getSignedUrl).toHaveBeenCalledTimes(1);
  });
});

/**
 * Regression tests for the DeleteObjects checksum sent to S3-compatible
 * stores.
 *
 * Since AWS SDK v3.729 the S3 client attaches a CRC32 flexible checksum to
 * DeleteObjects even under `requestChecksumCalculation: "WHEN_REQUIRED"`,
 * because the S3 model marks the operation as checksum-required. Older
 * S3-compatible stores (e.g. the MinIO bundled with langfuse-k8s) only accept
 * the legacy Content-MD5 header for multi-object deletes and reject the CRC32
 * variant with 400 MissingContentMD5, silently breaking data retention and
 * deletion jobs (https://github.com/langfuse/langfuse-k8s/issues/356).
 * LANGFUSE_S3_DELETE_OBJECTS_CHECKSUM_ALGORITHM lets deployments pick the
 * algorithm the store accepts ("MD5" maps to the Content-MD5 header); it is
 * unset by default because MD5 is unavailable on FIPS runtimes.
 */
describe("S3StorageService DeleteObjects checksum", () => {
  const EMPTY_DELETE_RESULT_XML = `<?xml version="1.0" encoding="UTF-8"?><DeleteResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/"></DeleteResult>`;

  const setChecksumAlgorithm = (value: string | undefined) => {
    (
      env as { LANGFUSE_S3_DELETE_OBJECTS_CHECKSUM_ALGORITHM?: string }
    ).LANGFUSE_S3_DELETE_OBJECTS_CHECKSUM_ALGORITHM = value;
  };

  afterEach(() => {
    setChecksumAlgorithm(undefined);
  });

  type CapturedRequest = {
    method: string;
    headers: Record<string, string>;
    body?: unknown;
  };

  // Build a real S3StorageService whose client runs the full middleware stack
  // (serialization, flexible checksums, signing) but short-circuits right
  // before the HTTP handler, capturing the final outgoing request and
  // returning a canned success response. No network I/O happens.
  const makeServiceWithCapture = (responseXml: string) => {
    const service = StorageServiceFactory.getInstance({
      accessKeyId: "test-access-key",
      secretAccessKey: "test-secret-key",
      bucketName: "test-bucket",
      endpoint: "http://127.0.0.1:9000",
      region: "us-east-1",
      forcePathStyle: true,
      useAzureBlob: false,
      useGoogleCloudStorage: false,
      useOCIObjectStorage: false,
      awsSse: undefined,
      awsSseKmsKeyId: undefined,
    });

    const client = (service as unknown as { client: S3Client }).client;
    const captured: CapturedRequest[] = [];

    const captureMiddleware = () => async (args: { request: unknown }) => {
      captured.push(args.request as CapturedRequest);
      return {
        response: {
          statusCode: 200,
          reason: "OK",
          headers: { "content-type": "application/xml" },
          body: Readable.from([Buffer.from(responseXml)]),
        },
      };
    };

    client.middlewareStack.add(
      captureMiddleware as unknown as Parameters<
        typeof client.middlewareStack.add
      >[0],
      {
        step: "deserialize",
        priority: "low",
        name: "testCaptureRequest",
        override: true,
      },
    );

    return { service, captured };
  };

  const findHeader = (
    request: CapturedRequest,
    name: string,
  ): string | undefined => {
    const key = Object.keys(request.headers).find(
      (header) => header.toLowerCase() === name,
    );
    return key === undefined ? undefined : request.headers[key];
  };

  it("keeps the SDK's CRC32 checksum on DeleteObjects by default", async () => {
    const { service, captured } = makeServiceWithCapture(
      EMPTY_DELETE_RESULT_XML,
    );

    await service.deleteFiles([
      "events/project-1/file-1.json",
      "media/project-1/file-2.png",
    ]);

    expect(captured).toHaveLength(1);
    const request = captured[0];
    expect(findHeader(request, "x-amz-checksum-crc32")).toBeDefined();
    expect(findHeader(request, "content-md5")).toBeUndefined();
  });

  it("sends Content-MD5 on DeleteObjects when the algorithm is set to MD5", async () => {
    setChecksumAlgorithm("MD5");
    const { service, captured } = makeServiceWithCapture(
      EMPTY_DELETE_RESULT_XML,
    );

    await service.deleteFiles([
      "events/project-1/file-1.json",
      "media/project-1/file-2.png",
    ]);

    expect(captured).toHaveLength(1);
    const request = captured[0];
    expect(typeof request.body).toBe("string");

    const expectedMd5 = createHash("md5")
      .update(request.body as string)
      .digest("base64");
    expect(findHeader(request, "content-md5")).toBe(expectedMd5);
    expect(findHeader(request, "x-amz-checksum-crc32")).toBeUndefined();
  });
});
