import { afterEach, describe, expect, it, vi } from "vitest";

// Required @langfuse/shared env vars so the real StorageServiceFactory can load
// (this test exercises the real S3 presigner, only the web env is mocked).
process.env.CLICKHOUSE_URL ??= "http://localhost:8123";
process.env.CLICKHOUSE_MIGRATION_URL ??= "clickhouse://localhost:9000";
process.env.CLICKHOUSE_USER ??= "clickhouse";
process.env.CLICKHOUSE_PASSWORD ??= "clickhouse";
process.env.LANGFUSE_S3_EVENT_UPLOAD_BUCKET ??= "langfuse";

const INTERNAL_HOST = "langfuse-s3.internal:9000";
const EXTERNAL_HOST = "media.public.example.com";

const mockEnv = vi.hoisted(() => ({
  env: {
    LANGFUSE_S3_MEDIA_UPLOAD_ACCESS_KEY_ID: "minio",
    LANGFUSE_S3_MEDIA_UPLOAD_SECRET_ACCESS_KEY: "miniosecret",
    LANGFUSE_S3_MEDIA_UPLOAD_ENDPOINT: "http://langfuse-s3.internal:9000",
    LANGFUSE_S3_MEDIA_UPLOAD_REGION: "us-east-1",
    LANGFUSE_S3_MEDIA_UPLOAD_FORCE_PATH_STYLE: "true",
    LANGFUSE_S3_MEDIA_UPLOAD_SSE: undefined as string | undefined,
    LANGFUSE_S3_MEDIA_UPLOAD_SSE_KMS_KEY_ID: undefined as string | undefined,
    LANGFUSE_S3_MEDIA_UPLOAD_EXTERNAL_ENDPOINT: undefined as string | undefined,
  },
}));

// Only the web env is mocked; the real StorageServiceFactory / S3StorageService
// runs so getSignedUrl produces an actual SigV4 presigned URL we can inspect.
vi.mock("@/src/env.mjs", () => mockEnv);

const loadModule = () =>
  import("@/src/features/media/server/getMediaStorageClient");

// sha256 of the empty string, base64 (a valid ChecksumSHA256 value).
const SHA256_B64 = "47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=";

afterEach(() => {
  mockEnv.env.LANGFUSE_S3_MEDIA_UPLOAD_EXTERNAL_ENDPOINT = undefined;
  vi.resetModules();
});

describe("media presigned URL endpoints", () => {
  it("signs download URLs against the external host while uploads stay internal", async () => {
    mockEnv.env.LANGFUSE_S3_MEDIA_UPLOAD_EXTERNAL_ENDPOINT = `https://${EXTERNAL_HOST}`;
    const mod = await loadModule();

    const downloadUrl = await mod
      .getMediaDownloadStorageServiceClient("langfuse")
      .getSignedUrl("media/file.png", 3600, false);

    const uploadUrl = await mod
      .getMediaStorageServiceClient("langfuse")
      .getSignedUploadUrl({
        path: "media/file.png",
        ttlSeconds: 3600,
        sha256Hash: SHA256_B64,
        contentType: "image/png",
        contentLength: 1234,
      });

    expect(new URL(downloadUrl).host).toBe(EXTERNAL_HOST);
    expect(downloadUrl).toContain("X-Amz-Signature=");
    expect(new URL(uploadUrl).host).toBe(INTERNAL_HOST);
  });

  it("falls back to the internal host for downloads when no external endpoint is set", async () => {
    const mod = await loadModule();

    const downloadUrl = await mod
      .getMediaDownloadStorageServiceClient("langfuse")
      .getSignedUrl("media/file.png", 3600, false);

    expect(new URL(downloadUrl).host).toBe(INTERNAL_HOST);
  });
});
