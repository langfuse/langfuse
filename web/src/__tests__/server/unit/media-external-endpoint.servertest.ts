import { beforeEach, describe, expect, it, vi } from "vitest";

const INTERNAL = "http://langfuse-s3.langfuse.svc.cluster.local:9000";
const EXTERNAL = "https://media.public.example.com";

// Records the params passed to StorageServiceFactory.getInstance so we can assert
// which endpoint each media client is built against, without constructing a real
// S3 client or hitting the network.
const mocks = vi.hoisted(() => ({
  getInstance: vi.fn((params: Record<string, unknown>) => ({ params })),
}));

const mockEnv = vi.hoisted(() => ({
  env: {
    LANGFUSE_S3_MEDIA_UPLOAD_ACCESS_KEY_ID: "minio" as string | undefined,
    LANGFUSE_S3_MEDIA_UPLOAD_SECRET_ACCESS_KEY: "miniosecret" as
      | string
      | undefined,
    LANGFUSE_S3_MEDIA_UPLOAD_ENDPOINT:
      "http://langfuse-s3.langfuse.svc.cluster.local:9000" as
        | string
        | undefined,
    LANGFUSE_S3_MEDIA_UPLOAD_REGION: "us-east-1" as string | undefined,
    LANGFUSE_S3_MEDIA_UPLOAD_FORCE_PATH_STYLE: "true",
    LANGFUSE_S3_MEDIA_UPLOAD_SSE: undefined as string | undefined,
    LANGFUSE_S3_MEDIA_UPLOAD_SSE_KMS_KEY_ID: undefined as string | undefined,
    LANGFUSE_S3_MEDIA_UPLOAD_EXTERNAL_ENDPOINT: undefined as string | undefined,
  },
}));

vi.mock("@/src/env.mjs", () => mockEnv);
// Mock the shared barrel: override StorageServiceFactory, and keep the exports the
// global test teardown destructures (redis/logger/ClickHouseClientManager).
vi.mock("@langfuse/shared/src/server", () => ({
  StorageServiceFactory: { getInstance: mocks.getInstance },
  redis: null,
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  ClickHouseClientManager: {
    getInstance: () => ({ closeAllConnections: vi.fn(async () => undefined) }),
  },
}));

const loadModule = () =>
  import("@/src/features/media/server/getMediaStorageClient");

beforeEach(() => {
  mocks.getInstance.mockClear();
  mockEnv.env.LANGFUSE_S3_MEDIA_UPLOAD_EXTERNAL_ENDPOINT = undefined;
  // Reset the module so its cached client singletons are rebuilt per test.
  vi.resetModules();
});

describe("media download external endpoint", () => {
  it("signs download (GET) URLs against the external endpoint when configured", async () => {
    mockEnv.env.LANGFUSE_S3_MEDIA_UPLOAD_EXTERNAL_ENDPOINT = EXTERNAL;
    const mod = await loadModule();

    mod.getMediaDownloadStorageServiceClient("langfuse");

    expect(mocks.getInstance).toHaveBeenCalledTimes(1);
    expect(mocks.getInstance.mock.calls[0][0]).toMatchObject({
      bucketName: "langfuse",
      endpoint: INTERNAL, // server ops still use the internal endpoint
      externalEndpoint: EXTERNAL, // GET URLs signed against the public host
    });
  });

  it("keeps uploads (PUT) and server ops on the internal endpoint", async () => {
    mockEnv.env.LANGFUSE_S3_MEDIA_UPLOAD_EXTERNAL_ENDPOINT = EXTERNAL;
    const mod = await loadModule();

    mod.getMediaStorageServiceClient("langfuse");

    expect(mocks.getInstance).toHaveBeenCalledTimes(1);
    const params = mocks.getInstance.mock.calls[0][0];
    expect(params.endpoint).toBe(INTERNAL);
    expect(params).not.toHaveProperty("externalEndpoint");
  });

  it("falls back to the internal client for downloads when the external endpoint is unset", async () => {
    const mod = await loadModule(); // no LANGFUSE_S3_MEDIA_UPLOAD_EXTERNAL_ENDPOINT

    const download = mod.getMediaDownloadStorageServiceClient("langfuse");
    const internal = mod.getMediaStorageServiceClient("langfuse");

    // Same singleton, only one client constructed, and no external endpoint.
    expect(download).toBe(internal);
    expect(mocks.getInstance).toHaveBeenCalledTimes(1);
    expect(mocks.getInstance.mock.calls[0][0]).not.toHaveProperty(
      "externalEndpoint",
    );
  });
});
