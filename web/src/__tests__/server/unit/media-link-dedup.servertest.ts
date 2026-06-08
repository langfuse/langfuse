const { loggerMock, prismaMock, recordIncrementMock, redisMock } = vi.hoisted(
  () => ({
    loggerMock: {
      debug: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
    },
    prismaMock: {
      $queryRaw: vi.fn(),
      media: {
        findUnique: vi.fn(),
        update: vi.fn(),
      },
    },
    recordIncrementMock: vi.fn(),
    redisMock: {
      del: vi.fn(),
      disconnect: vi.fn(),
      set: vi.fn(),
      status: "end",
    },
  }),
);

vi.mock("@/src/env.mjs", () => ({
  env: {
    LANGFUSE_MEDIA_LINK_REQUEST_DEDUP_TTL_SECONDS: 30,
    LANGFUSE_S3_MEDIA_DOWNLOAD_URL_EXPIRY_SECONDS: 3600,
    LANGFUSE_S3_MEDIA_UPLOAD_BUCKET: "test-bucket",
    LANGFUSE_S3_MEDIA_UPLOAD_PREFIX: "",
  },
}));

vi.mock("@/src/features/media/server/getMediaStorageClient", () => ({
  getMediaStorageServiceClient: vi.fn(),
}));

vi.mock("@langfuse/shared", () => ({
  InternalServerError: class InternalServerError extends Error {},
  LangfuseNotFoundError: class LangfuseNotFoundError extends Error {},
}));

vi.mock("@langfuse/shared/src/db", () => ({
  Prisma: {
    PrismaClientKnownRequestError: class PrismaClientKnownRequestError extends Error {},
  },
  prisma: prismaMock,
}));

vi.mock("@langfuse/shared/src/server", () => ({
  ClickHouseClientManager: {
    getInstance: vi.fn(() => ({
      closeAllConnections: vi.fn(),
    })),
  },
  getCurrentSpan: vi.fn(() => null),
  logger: loggerMock,
  recordHistogram: vi.fn(),
  recordIncrement: recordIncrementMock,
  redis: redisMock,
}));

import { createMediaUploadUrl } from "@/src/features/media/server/mediaService";
import {
  MediaContentType,
  MediaEnabledFields,
} from "@/src/features/media/validation";

const createTraceMediaUploadRequest = () => ({
  projectId: "project-1",
  body: {
    contentLength: 1,
    contentType: MediaContentType.PNG,
    field: MediaEnabledFields.Input,
    sha256Hash: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
    traceId: "trace-1",
  },
});
const traceMediaLinkCacheKey =
  "langfuse:media-link:trace:3Vge25cSTcp0eOn3YdezuCLvJvGCJX1qPuCYszsbYE4";

describe("media link deduplication", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.media.findUnique.mockResolvedValue({
      contentType: "image/png",
      id: "media-1",
      uploadHttpStatus: 200,
    });
    prismaMock.$queryRaw.mockResolvedValue([]);
    redisMock.del.mockResolvedValue(1);
    redisMock.set.mockResolvedValue("OK");
  });

  it("skips the database insert when Redis has seen the media link request", async () => {
    redisMock.set.mockResolvedValue(null);

    await expect(
      createMediaUploadUrl(createTraceMediaUploadRequest()),
    ).resolves.toEqual({
      mediaId: "media-1",
      uploadUrl: null,
    });

    expect(redisMock.set).toHaveBeenCalledWith(
      traceMediaLinkCacheKey,
      "1",
      "EX",
      30,
      "NX",
    );
    expect(prismaMock.$queryRaw).not.toHaveBeenCalled();
    expect(recordIncrementMock).toHaveBeenCalledWith(
      "langfuse.media.link.dedup_cache_hit",
      1,
      { target: "trace" },
    );
  });

  it("writes the media link when Redis marks the request as new", async () => {
    await createMediaUploadUrl(createTraceMediaUploadRequest());

    expect(prismaMock.$queryRaw).toHaveBeenCalledTimes(1);
    expect(String(prismaMock.$queryRaw.mock.calls[0]?.[0])).toContain(
      'INSERT INTO "trace_media"',
    );
    expect(recordIncrementMock).toHaveBeenCalledWith(
      "langfuse.media.link.dedup_cache_miss",
      1,
      { target: "trace" },
    );
  });

  it("falls back to the database insert when Redis errors", async () => {
    redisMock.set.mockRejectedValue(new Error("redis unavailable"));

    await createMediaUploadUrl(createTraceMediaUploadRequest());

    expect(prismaMock.$queryRaw).toHaveBeenCalledTimes(1);
    expect(loggerMock.warn).toHaveBeenCalledWith(
      "Failed to check media link deduplication cache. Continuing with database write.",
      expect.any(Error),
    );
  });

  it("clears the Redis marker when the database insert fails", async () => {
    prismaMock.$queryRaw.mockRejectedValue(new Error("database unavailable"));

    await expect(
      createMediaUploadUrl(createTraceMediaUploadRequest()),
    ).rejects.toThrow("Failed to get media upload URL");

    expect(redisMock.del).toHaveBeenCalledWith(traceMediaLinkCacheKey);
  });
});
