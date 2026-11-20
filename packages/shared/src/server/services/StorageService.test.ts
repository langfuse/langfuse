/* eslint-disable @typescript-eslint/no-use-before-define */
import { createHash, getFips } from "crypto";
import { subscribe, unsubscribe } from "node:diagnostics_channel";
import { once } from "events";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import {
  createServer,
  type ClientRequest,
  type Server,
  type ServerResponse,
} from "http";
import { tmpdir } from "os";
import { join } from "path";
import { PassThrough, Readable } from "stream";

import { afterAll, afterEach, describe, expect, it, vi } from "vitest";

import type { S3Client } from "@aws-sdk/client-s3";
import type { NodeHttpHandler } from "@smithy/node-http-handler";

import { BLOB_STORAGE_REGION_INVALID_MESSAGE } from "../../utils/stringChecks";
import { env } from "../../env";
import { logger } from "../logger";
import type { OutboundUrlConnectionValidationOptions } from "../outbound-url/connection";
import { resolveMediaStorageEndpoints } from "../s3";
import { StorageServiceFactory, storageKeys } from "./StorageService";

// Capture the options handed to lib-storage's Upload so the non-buffered
// fallback's part size can be asserted without real network I/O.
const s3UploadCtorOptions = vi.hoisted(
  () => [] as Array<{ partSize?: number; queueSize?: number }>,
);

vi.mock("@aws-sdk/lib-storage", () => ({
  Upload: class {
    constructor(options: { partSize?: number; queueSize?: number }) {
      s3UploadCtorOptions.push(options);
    }
    done() {
      return Promise.resolve(undefined);
    }
  },
}));

describe("S3StorageService region normalization", () => {
  it("configures a failing request timeout when requested", async () => {
    const server = createServer(() => {});
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Expected a local HTTP port");
    }

    try {
      const service = StorageServiceFactory.getInstance({
        credentials: storageKeys("test-access-key", "test-secret-key"),
        bucketName: "test-bucket",
        endpoint: undefined,
        region: "us-west-2",
        forcePathStyle: false,
        useAzureBlob: false,
        useGoogleCloudStorage: false,
        useOCIObjectStorage: false,
        awsSse: undefined,
        awsSseKmsKeyId: undefined,
        s3RequestTimeoutMs: 50,
      });
      const client = (service as unknown as { client: S3Client }).client;
      const handler = client.config.requestHandler as NodeHttpHandler;
      await expect(
        handler.handle({
          protocol: "http:",
          hostname: "127.0.0.1",
          port: address.port,
          method: "GET",
          path: "/",
        } as Parameters<NodeHttpHandler["handle"]>[0]),
      ).rejects.toMatchObject({ name: "TimeoutError" });

      expect(handler.httpHandlerConfigs()).toMatchObject({
        requestTimeout: 50,
        throwOnRequestTimeout: true,
      });
    } finally {
      server.closeAllConnections();
      server.close();
    }
  });

  it("trims a persisted region before configuring the AWS client", async () => {
    const service = StorageServiceFactory.getInstance({
      credentials: storageKeys("test-access-key", "test-secret-key"),
      bucketName: "test-bucket",
      endpoint: undefined,
      region: " us-west-2",
      forcePathStyle: false,
      useAzureBlob: false,
      useGoogleCloudStorage: false,
      useOCIObjectStorage: false,
      awsSse: undefined,
      awsSseKmsKeyId: undefined,
    });
    const client = (service as unknown as { client: S3Client }).client;

    await expect(client.config.region()).resolves.toBe("us-west-2");
  });

  it("rejects malformed persisted regions before creating an AWS client", () => {
    expect(() =>
      StorageServiceFactory.getInstance({
        credentials: storageKeys("test-access-key", "test-secret-key"),
        bucketName: "test-bucket",
        endpoint: undefined,
        region: "us west-2",
        forcePathStyle: false,
        useAzureBlob: false,
        useGoogleCloudStorage: false,
        useOCIObjectStorage: false,
        awsSse: undefined,
        awsSseKmsKeyId: undefined,
      }),
    ).toThrow(BLOB_STORAGE_REGION_INVALID_MESSAGE);
  });

  it.each(["europe-west1", "eastus", "auto"])(
    "configures an S3-compatible client with region %s",
    async (region) => {
      const service = StorageServiceFactory.getInstance({
        credentials: storageKeys("test-access-key", "test-secret-key"),
        bucketName: "test-bucket",
        endpoint: "https://storage.googleapis.com",
        region,
        forcePathStyle: true,
        useAzureBlob: false,
        useGoogleCloudStorage: false,
        useOCIObjectStorage: false,
        awsSse: undefined,
        awsSseKmsKeyId: undefined,
      });
      const client = (service as unknown as { client: S3Client }).client;

      await expect(client.config.region()).resolves.toBe(region);
    },
  );

  it("follows S3's region redirect when region is auto on AWS", async () => {
    const service = StorageServiceFactory.getInstance({
      credentials: storageKeys("test-access-key", "test-secret-key"),
      bucketName: "test-bucket",
      endpoint: undefined,
      region: "auto",
      forcePathStyle: false,
      useAzureBlob: false,
      useGoogleCloudStorage: false,
      useOCIObjectStorage: false,
      awsSse: undefined,
      awsSseKmsKeyId: undefined,
    });
    const client = (service as unknown as { client: S3Client }).client;
    const hostnames: string[] = [];

    // Answer the first request like S3 does for a bucket in another region,
    // then succeed. No network I/O happens.
    const fakeS3 = () => async (args: { request: unknown }) => {
      hostnames.push((args.request as { hostname: string }).hostname);
      const redirect = hostnames.length === 1;
      return {
        response: {
          statusCode: redirect ? 301 : 200,
          headers: {
            "content-type": "application/xml",
            ...(redirect ? { "x-amz-bucket-region": "eu-west-1" } : {}),
          },
          body: Readable.from([
            Buffer.from(
              redirect
                ? "<Error><Code>PermanentRedirect</Code></Error>"
                : "<ListBucketResult></ListBucketResult>",
            ),
          ]),
        },
      };
    };
    client.middlewareStack.add(
      fakeS3 as unknown as Parameters<typeof client.middlewareStack.add>[0],
      { step: "deserialize", priority: "low", name: "fakeS3", override: true },
    );

    await service.listFiles("exports/");

    expect(hostnames).toEqual([
      "test-bucket.s3.us-east-1.amazonaws.com",
      "test-bucket.s3.eu-west-1.amazonaws.com",
    ]);
  });
});

describe("resolveMediaStorageEndpoints", () => {
  it("keeps the existing endpoint for both server access and signed URLs by default", () => {
    expect(
      resolveMediaStorageEndpoints({
        endpoint: "http://localhost:9090",
        internalEndpoint: undefined,
      }),
    ).toEqual({
      endpoint: "http://localhost:9090",
      externalEndpoint: undefined,
    });
  });

  it("uses the internal override for server access and the existing endpoint for signed URLs", () => {
    expect(
      resolveMediaStorageEndpoints({
        endpoint: "http://localhost:9090",
        internalEndpoint: "http://minio:9000",
      }),
    ).toEqual({
      endpoint: "http://minio:9000",
      externalEndpoint: "http://localhost:9090",
    });
  });
});

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
      credentials: storageKeys(
        "test-account",
        Buffer.from("test-secret-key").toString("base64"),
      ),
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
      credentials: storageKeys(undefined, undefined),
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

describe("StorageServiceFactory GCS credentials", () => {
  const original = env.LANGFUSE_GOOGLE_CLOUD_STORAGE_CREDENTIALS;
  const serviceAccountEmail = "gcs-test@example.iam.gserviceaccount.com";
  const tempDir = mkdtempSync(join(tmpdir(), "langfuse-gcs-creds-"));
  const deploymentKeyPath = join(tempDir, "deployment-key.json");

  writeFileSync(
    deploymentKeyPath,
    JSON.stringify({
      type: "service_account",
      project_id: "test-project",
      private_key_id: "test-key-id",
      private_key:
        "-----BEGIN PRIVATE KEY-----\nMIIE\n-----END PRIVATE KEY-----\n",
      client_email: serviceAccountEmail,
      client_id: "1234567890",
      auth_uri: "https://accounts.google.com/o/oauth2/auth",
      token_uri: "https://oauth2.googleapis.com/token",
      auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
      client_x509_cert_url:
        "https://www.googleapis.com/robot/v1/metadata/x509/test",
    }),
  );

  afterEach(() => {
    env.LANGFUSE_GOOGLE_CLOUD_STORAGE_CREDENTIALS = original;
  });

  afterAll(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  const credentialEmailOf = (service: unknown) =>
    (
      service as {
        storage: { authClient: { cachedCredential?: { email?: string } } };
      }
    ).storage.authClient.cachedCredential?.email;

  it("uses ADC, not the deployment storage key, when GCS is selected explicitly without credentials", () => {
    env.LANGFUSE_GOOGLE_CLOUD_STORAGE_CREDENTIALS = deploymentKeyPath;
    const service = StorageServiceFactory.getInstance({
      credentials: storageKeys(undefined, undefined),
      bucketName: "test-bucket",
      endpoint: undefined,
      region: undefined,
      forcePathStyle: false,
      useGoogleCloudStorage: true,
      awsSse: undefined,
      awsSseKmsKeyId: undefined,
    });

    expect(credentialEmailOf(service)).toBeUndefined();
  });

  it("rejects a customer key whose type is not service_account", () => {
    expect(() =>
      StorageServiceFactory.getInstance({
        credentials: storageKeys(undefined, undefined),
        bucketName: "test-bucket",
        endpoint: undefined,
        region: undefined,
        forcePathStyle: false,
        useGoogleCloudStorage: true,
        googleCloudCredentials: JSON.stringify({
          type: "external_account",
          audience: "//iam.googleapis.com/projects/1/locations/global",
          subject_token_type: "urn:ietf:params:oauth:token-type:jwt",
          credential_source: { file: "/proc/self/environ" },
          token_url: "https://attacker.example/",
        }),
        awsSse: undefined,
        awsSseKmsKeyId: undefined,
      }),
    ).toThrow("Failed to initialize Google Cloud Storage");
  });

  it("uses the deployment storage key when GCS is selected by env", () => {
    env.LANGFUSE_GOOGLE_CLOUD_STORAGE_CREDENTIALS = deploymentKeyPath;
    const originalUseGcs = env.LANGFUSE_USE_GOOGLE_CLOUD_STORAGE;
    env.LANGFUSE_USE_GOOGLE_CLOUD_STORAGE = "true";
    try {
      const service = StorageServiceFactory.getInstance({
        credentials: storageKeys(undefined, undefined),
        bucketName: "test-bucket",
        endpoint: undefined,
        region: undefined,
        forcePathStyle: false,
        awsSse: undefined,
        awsSseKmsKeyId: undefined,
      });

      expect(credentialEmailOf(service)).toBe(serviceAccountEmail);
    } finally {
      env.LANGFUSE_USE_GOOGLE_CLOUD_STORAGE = originalUseGcs;
    }
  });
});

/**
 * Source-stream errors on GCS uploads must reject the awaited upload instead
 * of escaping as an uncaught 'error' event. `.pipe().on("error")` only
 * listens on the destination; `pipeline()` forwards source errors too.
 */
describe("GoogleCloudStorageService.uploadFile source stream errors", () => {
  it("rejects when the source stream fails without leaking process events", async () => {
    const service = StorageServiceFactory.getInstance({
      credentials: storageKeys(undefined, undefined),
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
      file: () => ({
        createWriteStream: () => new PassThrough(),
      }),
    };

    const unhandled: unknown[] = [];
    const uncaught: unknown[] = [];
    const onUnhandled = (reason: unknown) => {
      unhandled.push(reason);
    };
    const onUncaught = (err: unknown) => {
      uncaught.push(err);
    };
    process.on("unhandledRejection", onUnhandled);
    process.on("uncaughtException", onUncaught);

    try {
      const source = new Readable({
        read() {
          this.destroy(new Error("source stream failed"));
        },
      });

      await expect(
        (
          service as unknown as {
            uploadFile(params: {
              fileName: string;
              fileType: string;
              data: Readable;
            }): Promise<void>;
          }
        ).uploadFile({
          fileName: "export.json",
          fileType: "application/json",
          data: source,
        }),
      ).rejects.toThrow();

      await new Promise<void>((resolve) => {
        setImmediate(resolve);
      });
      expect(unhandled).toHaveLength(0);
      expect(uncaught).toHaveLength(0);
    } finally {
      process.off("unhandledRejection", onUnhandled);
      process.off("uncaughtException", onUncaught);
    }
  });
});

describe("GoogleCloudStorageService.listFilePage", () => {
  it("ends pagination when the client returns no next query on the last page", async () => {
    const service = StorageServiceFactory.getInstance({
      credentials: storageKeys(undefined, undefined),
      bucketName: "test-bucket",
      endpoint: undefined,
      region: undefined,
      forcePathStyle: false,
      useGoogleCloudStorage: true,
      awsSse: undefined,
      awsSseKmsKeyId: undefined,
    });
    const createdAt = "2026-01-01T00:00:00.000Z";
    (service as unknown as { bucket: { getFiles: () => unknown } }).bucket = {
      getFiles: async () => [
        [{ name: "a.json", metadata: { timeCreated: createdAt } }],
        null,
      ],
    };

    await expect(service.listFilePage({ prefix: "p/" })).resolves.toEqual({
      files: [{ file: "a.json", createdAt: new Date(createdAt) }],
      continuationToken: undefined,
    });
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
describe("S3StorageService request checksums", () => {
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
    query?: Record<string, string>;
    headers: Record<string, string>;
    body?: unknown;
  };

  // Build a real S3StorageService whose client runs the full middleware stack
  // (serialization, flexible checksums, signing) but short-circuits right
  // before the HTTP handler, capturing the final outgoing request and
  // returning a canned success response. No network I/O happens.
  type CannedResponse = { headers?: Record<string, string>; xml?: string };

  const makeServiceWithCapture = (
    respond: string | ((request: CapturedRequest) => CannedResponse),
    options: { sendContentMd5?: boolean } = {},
  ) => {
    const service = StorageServiceFactory.getInstance({
      ...options,
      credentials: storageKeys("test-access-key", "test-secret-key"),
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
      const request = args.request as CapturedRequest;
      captured.push(request);
      const canned =
        typeof respond === "string" ? { xml: respond } : respond(request);
      return {
        response: {
          statusCode: 200,
          reason: "OK",
          headers: { "content-type": "application/xml", ...canned.headers },
          body: Readable.from([Buffer.from(canned.xml ?? "")]),
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

  // MD5 checksums are unavailable when OpenSSL runs in FIPS mode.
  it.skipIf(getFips() === 1)(
    "sends Content-MD5 on DeleteObjects when the algorithm is set to MD5",
    async () => {
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
    },
  );

  // Object Lock buckets reject parts without Content-MD5 or x-amz-checksum-*;
  // GCS rejects a composite checksum on CompleteMultipartUpload (412).
  it.skipIf(getFips() === 1)(
    "sends Content-MD5 on every streamed part and no checksum on create/complete",
    async () => {
      const bufferedKey = "LANGFUSE_S3_UPLOAD_ENABLE_BUFFERED" as const;
      const originalBuffered = env[bufferedKey];
      (env as Record<string, unknown>)[bufferedKey] = "true";

      try {
        const { service, captured } = makeServiceWithCapture(
          (request) => {
            if (request.query && "uploads" in request.query) {
              return {
                xml: `<InitiateMultipartUploadResult><Bucket>test-bucket</Bucket><Key>k</Key><UploadId>upload-1</UploadId></InitiateMultipartUploadResult>`,
              };
            }
            if (request.query?.partNumber) {
              return {
                headers: { etag: `"etag-${request.query.partNumber}"` },
              };
            }
            return {
              xml: `<CompleteMultipartUploadResult><Bucket>test-bucket</Bucket><Key>k</Key><ETag>"final"</ETag></CompleteMultipartUploadResult>`,
            };
          },
          { sendContentMd5: true },
        );

        // Stream chunks straddle part boundaries, so parts are sliced views;
        // parts also exceed the middleware's internal hash slice size.
        const MiB = 1024 * 1024;
        const chunks = Array.from({ length: 4 }, (_, i) =>
          Buffer.alloc(3 * MiB, i + 1),
        );
        await service.uploadFileBuffered({
          fileName: "exports/observations.parquet",
          fileType: "application/vnd.apache.parquet",
          data: Readable.from(chunks),
          partSizeBytes: 5 * MiB,
          maxConcurrentParts: 1,
        });

        const parts = captured.filter((r) => r.query?.partNumber);
        const others = captured.filter((r) => !r.query?.partNumber);
        expect(parts).toHaveLength(3);
        expect(others).toHaveLength(2);

        const streamed = Buffer.concat(chunks);
        let offset = 0;
        for (const part of parts) {
          const body = part.body as Uint8Array;
          expect(
            Buffer.from(body).equals(
              streamed.subarray(offset, offset + body.byteLength),
            ),
          ).toBe(true);
          offset += body.byteLength;
          expect(findHeader(part, "content-md5")).toBe(
            createHash("md5").update(body).digest("base64"),
          );
        }
        expect(offset).toBe(streamed.byteLength);

        for (const request of others) {
          expect(
            Object.keys(request.headers).filter((h) =>
              h.toLowerCase().startsWith("x-amz-checksum"),
            ),
          ).toEqual([]);
          expect(findHeader(request, "content-md5")).toBeUndefined();
        }
      } finally {
        (env as Record<string, unknown>)[bufferedKey] = originalBuffered;
      }
    },
  );

  // Ingestion writes go through default clients; they must not pay for MD5.
  it("does not send Content-MD5 unless the client opts in", async () => {
    const { service, captured } = makeServiceWithCapture("");

    await service.uploadJson("events/project-1/event.json", [{ id: "e1" }]);

    expect(captured).toHaveLength(1);
    expect(findHeader(captured[0], "content-md5")).toBeUndefined();
  });
});

describe("S3StorageService non-buffered upload part size", () => {
  const bufferedKey = "LANGFUSE_S3_UPLOAD_ENABLE_BUFFERED" as const;
  const originalBuffered = env[bufferedKey];

  afterEach(() => {
    (env as Record<string, unknown>)[bufferedKey] = originalBuffered;
    s3UploadCtorOptions.length = 0;
  });

  const makeService = () =>
    StorageServiceFactory.getInstance({
      credentials: storageKeys("test-access-key", "test-secret-key"),
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

  it("forwards the caller's part size so the 10k-part cap does not truncate large exports", async () => {
    (env as Record<string, unknown>)[bufferedKey] = "false";

    await makeService().uploadFileBuffered({
      fileName: "export.csv",
      fileType: "text/csv",
      data: Readable.from(["a,b,c\n"]),
      partSizeBytes: 100 * 1024 * 1024,
    });

    expect(s3UploadCtorOptions).toHaveLength(1);
    const { partSize } = s3UploadCtorOptions[0];
    expect(partSize).toBe(100 * 1024 * 1024);
    // Above lib-storage's 5 MiB default, which caps a single object at ~48.83 GiB.
    expect(partSize).toBeGreaterThan(5 * 1024 * 1024);
  });

  it("caps concurrency so parallel callers do not multiply peak buffer memory", async () => {
    (env as Record<string, unknown>)[bufferedKey] = "false";

    await makeService().uploadFileBuffered({
      fileName: "export.csv",
      fileType: "text/csv",
      data: Readable.from(["a,b,c\n"]),
      partSizeBytes: 100 * 1024 * 1024,
      maxConcurrentParts: 2,
    });

    expect(s3UploadCtorOptions).toHaveLength(1);
    // Caller's concurrency is honored instead of lib-storage's default of 4,
    // which would otherwise buffer partSize x 4 per concurrent upload.
    expect(s3UploadCtorOptions[0].queueSize).toBe(2);
  });
});

describe("S3StorageService SlowDown logging", () => {
  const slowDown = Object.assign(
    new Error("Please reduce your request rate."),
    { name: "SlowDown" },
  );

  function makeService(logSlowDownAsWarning = false) {
    return StorageServiceFactory.getInstance({
      credentials: storageKeys("test-access-key", "test-secret-key"),
      bucketName: "test-bucket",
      endpoint: "http://127.0.0.1:9000",
      region: "us-east-1",
      forcePathStyle: true,
      useAzureBlob: false,
      useGoogleCloudStorage: false,
      useOCIObjectStorage: false,
      awsSse: undefined,
      awsSseKmsKeyId: undefined,
      logSlowDownAsWarning,
    });
  }

  async function rejectUpload(
    service: ReturnType<typeof makeService>,
    err: unknown,
  ) {
    vi.spyOn(
      (service as unknown as { client: { send: () => Promise<unknown> } })
        .client,
      "send",
    ).mockRejectedValue(err);
    await expect(service.uploadJson("events/key.json", [])).rejects.toThrow(
      /Failed to upload JSON/,
    );
  }

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("logs SlowDown as an error unless the caller owns retries", async () => {
    const errorSpy = vi.spyOn(logger, "error").mockImplementation(() => logger);
    const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => logger);

    await rejectUpload(makeService(), slowDown);

    expect(errorSpy).toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("logs SlowDown as a warning when the caller owns retries", async () => {
    const errorSpy = vi.spyOn(logger, "error").mockImplementation(() => logger);
    const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => logger);

    await rejectUpload(makeService(true), slowDown);

    expect(warnSpy).toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("still logs other failures as errors when SlowDown is a warning", async () => {
    const errorSpy = vi.spyOn(logger, "error").mockImplementation(() => logger);
    const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => logger);

    await rejectUpload(
      makeService(true),
      Object.assign(new Error("missing"), { name: "NoSuchKey" }),
    );

    expect(errorSpy).toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
  });
});

describe("S3StorageService request handler socket pool", () => {
  const idleTimeoutMs = 25;
  const originalPoolSettings = {
    LANGFUSE_S3_CONCURRENT_WRITES: env.LANGFUSE_S3_CONCURRENT_WRITES,
    LANGFUSE_S3_SOCKET_IDLE_TIMEOUT_MS: env.LANGFUSE_S3_SOCKET_IDLE_TIMEOUT_MS,
  };
  afterEach(() => {
    Object.assign(env, originalPoolSettings);
  });

  type ResolvedHandlerConfig = {
    httpAgentProvider: () => Promise<{ maxSockets: number }>;
    httpsAgent: { maxSockets: number };
  };

  const makeService = (
    endpoint: string,
    connectionValidation?: OutboundUrlConnectionValidationOptions,
  ) =>
    StorageServiceFactory.getInstance({
      credentials: storageKeys("test-access-key", "test-secret-key"),
      bucketName: "test-bucket",
      endpoint,
      region: "us-east-1",
      forcePathStyle: true,
      connectionValidation,
      useAzureBlob: false,
      useGoogleCloudStorage: false,
      useOCIObjectStorage: false,
      awsSse: undefined,
      awsSseKmsKeyId: undefined,
      maxAttempts: 1,
    });

  const withLocalS3 = async (
    server: Server,
    run: (service: ReturnType<typeof makeService>) => Promise<void>,
    connectionValidation?: OutboundUrlConnectionValidationOptions,
  ) => {
    Object.assign(env, {
      LANGFUSE_S3_CONCURRENT_WRITES: 1,
      LANGFUSE_S3_SOCKET_IDLE_TIMEOUT_MS: idleTimeoutMs,
    });
    // Only the client can retire the free socket in these tests.
    server.keepAliveTimeout = 0;
    await new Promise<void>((resolve) =>
      server.listen(0, "localhost", resolve),
    );
    try {
      const address = server.address();
      if (!address || typeof address === "string")
        throw new Error("Expected a local HTTP port");
      await run(
        makeService(`http://localhost:${address.port}`, connectionValidation),
      );
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  };

  it("applies LANGFUSE_S3_CONCURRENT_WRITES to plain-HTTP endpoints such as MinIO", async () => {
    Object.assign(env, { LANGFUSE_S3_CONCURRENT_WRITES: 123 });

    const service = makeService("http://127.0.0.1:9000");
    const client = (service as unknown as { client: S3Client }).client;
    const handler = client.config.requestHandler as unknown as {
      configProvider: Promise<ResolvedHandlerConfig>;
    };
    const config = await handler.configProvider;

    // The HTTP agent is created lazily on the first non-TLS request.
    const httpAgent = await config.httpAgentProvider();
    expect(httpAgent.maxSockets).toBe(123);
    expect(config.httpsAgent.maxSockets).toBe(123);
  });

  it("reuses a validated connection for queued downloads and closes it once idle", async () => {
    const server = createServer((_req, res) => {
      res.write("first ");
      setTimeout(() => res.end("last"), 3 * idleTimeoutMs);
    });
    let connections = 0;
    let closedConnections = 0;
    server.on("connection", (socket) => {
      connections++;
      socket.once("close", () => closedConnections++);
    });
    await withLocalS3(
      server,
      async (service) => {
        const started = once(server, "request");
        const first = service.download("a");
        await started;
        const downloads = await Promise.all([first, service.download("b")]);
        expect(downloads).toEqual(["first last", "first last"]);
        expect(connections).toBe(1);
        await expect.poll(() => closedConnections, { timeout: 1000 }).toBe(1);
      },
      { whitelist: { hosts: ["localhost"], ips: [], ip_ranges: [] } },
    );
  });

  it("keeps a queued download alive when its replacement socket signals a timeout", async ({
    onTestFinished,
  }) => {
    const server = createServer((request, response) => {
      if (request.url?.includes("/first")) {
        response.setHeader("Connection", "close");
      } else {
        response.end("second");
      }
    });
    await withLocalS3(server, async (service) => {
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
      onTestFinished(() => {
        vi.useRealTimers();
      });
      const started = new Promise<ServerResponse>((resolve) =>
        server.once("request", (_req, res) => resolve(res)),
      );
      const first = service.download("first");
      const held = await started;
      const queued = new Promise<ClientRequest>((resolve) => {
        const requestCreated = "http.client.request.created";
        const capture = (message: unknown) => {
          const { request } = message as { request: ClientRequest };
          if (request.path.includes("/second")) resolve(request);
        };
        subscribe(requestCreated, capture);
        onTestFinished(() => {
          unsubscribe(requestCreated, capture);
        });
      });
      const downloads = Promise.all([first, service.download("second")]);
      const request = await queued;
      expect(request.socket).toBeNull();
      vi.runOnlyPendingTimers();
      const assigned = once(request, "socket");
      held.end("first");
      const [socket] = await assigned;
      // A connecting socket can signal inactivity while its DNS lookup is pending.
      expect(socket.connecting).toBe(true);
      socket.emit("timeout");
      await expect(downloads).resolves.toEqual(["first", "second"]);
    });
  });
});
