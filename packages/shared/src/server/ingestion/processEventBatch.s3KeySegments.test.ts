import { describe, expect, it, vi } from "vitest";

const uploadedPaths: string[] = [];

vi.mock("../../env", () => ({
  env: {
    LANGFUSE_S3_EVENT_UPLOAD_PREFIX: "events/",
    LANGFUSE_S3_EVENT_UPLOAD_BUCKET: "langfuse",
    LANGFUSE_S3_EVENT_UPLOAD_ACCESS_KEY_ID: "minio",
    LANGFUSE_S3_EVENT_UPLOAD_SECRET_ACCESS_KEY: "miniosecret",
    LANGFUSE_S3_EVENT_UPLOAD_ENDPOINT: "http://localhost:9000",
    LANGFUSE_S3_EVENT_UPLOAD_REGION: "auto",
    LANGFUSE_S3_EVENT_UPLOAD_FORCE_PATH_STYLE: "true",
    LANGFUSE_S3_EVENT_UPLOAD_SSE: null,
    LANGFUSE_S3_EVENT_UPLOAD_SSE_KMS_KEY_ID: null,
    LANGFUSE_INGESTION_QUEUE_DELAY_MS: 0,
    LANGFUSE_SKIP_S3_LIST_FOR_OBSERVATIONS_PROJECT_IDS: undefined,
  },
}));

vi.mock("../instrumentation", () => ({
  getCurrentSpan: () => ({
    setAttribute: vi.fn(),
  }),
  instrumentAsync: (_opts: unknown, fn: () => Promise<unknown>) => fn(),
  recordDistribution: vi.fn(),
  recordIncrement: vi.fn(),
  traceException: vi.fn(),
}));

vi.mock("../logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("../redis/s3SlowdownTracking", () => ({
  isS3SlowDownError: () => false,
  markProjectS3Slowdown: vi.fn(),
}));

vi.mock("../services/StorageService", () => ({
  StorageService: class StorageService {},
  StorageServiceFactory: {
    getInstance: () => ({
      uploadJson: async (path: string) => {
        uploadedPaths.push(path);
        throw new Error("boom");
      },
    }),
  },
}));

vi.mock("./types", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./types")>();
  const { z } = await import("zod");

  const minimalSchema = z
    .object({
      id: z.string(),
      type: z.string(),
      timestamp: z.string(),
      body: z.object({ id: z.string() }).loose(),
    })
    .loose();

  return {
    ...actual,
    createIngestionEventSchema: () => minimalSchema,
  };
});

describe("processEventBatch S3 key segmentation", () => {
  it("keeps every S3 key path segment <= 255 bytes", async () => {
    const { processEventBatch } = await import("./processEventBatch");
    const { eventTypes } = await import("./types");

    const longId = `resp_${"a".repeat(300)}`;
    const now = new Date().toISOString();

    await expect(
      processEventBatch(
        [
          {
            id: "evt_1",
            type: eventTypes.TRACE_CREATE,
            timestamp: now,
            body: { id: longId },
          },
        ],
        {
          validKey: true,
          scope: {
            projectId: "proj_123",
            accessLevel: "project",
          },
        } as any,
      ),
    ).rejects.toThrow("Failed to upload events to blob storage");

    expect(uploadedPaths).toHaveLength(1);

    const segments = uploadedPaths[0].split("/").filter(Boolean);
    for (const segment of segments) {
      expect(Buffer.byteLength(segment, "utf8")).toBeLessThanOrEqual(255);
    }
  });
});
