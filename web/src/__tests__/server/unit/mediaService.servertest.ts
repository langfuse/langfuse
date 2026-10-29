import { beforeEach, describe, expect, it, vi } from "vitest";
import { MediaContentType } from "@/src/features/media/validation";

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  update: vi.fn(),
  linkMediaToTraceOrObservation: vi.fn(),
  getSignedUploadUrl: vi.fn(),
  recordIncrement: vi.fn(),
}));

vi.mock("@/src/env.mjs", () => ({
  env: { LANGFUSE_S3_MEDIA_UPLOAD_BUCKET: "test-media-bucket" },
}));

vi.mock("@/src/features/media/server/getMediaStorageClient", () => ({
  getMediaStorageServiceClient: () => ({
    getSignedUploadUrl: mocks.getSignedUploadUrl,
  }),
}));

vi.mock("@langfuse/shared/src/db", () => ({
  Prisma: { PrismaClientKnownRequestError: class extends Error {} },
  prisma: { media: { findUnique: mocks.findUnique, update: mocks.update } },
}));

vi.mock("@langfuse/shared/src/server", () => ({
  declarePendingDatasetItemMedia: vi.fn(),
  getMediaBucketPath: vi.fn(() => "test-media-path"),
  getMediaId: vi.fn(),
  getCurrentSpan: vi.fn(),
  linkMediaToTraceOrObservation: mocks.linkMediaToTraceOrObservation,
  logger: { error: vi.fn() },
  recordHistogram: vi.fn(),
  recordIncrement: mocks.recordIncrement,
  upsertMediaRecord: vi.fn(),
}));

import {
  createMediaUploadUrl,
  updateMediaUploadStatus,
} from "@/src/features/media/server/mediaService";

describe("media upload status", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSignedUploadUrl.mockResolvedValue("https://example.com/upload");
  });

  it("reuses an Azure upload completed with HTTP 201", async () => {
    mocks.findUnique.mockResolvedValue({
      id: "media-1",
      contentType: MediaContentType.PNG,
      uploadHttpStatus: 201,
    });

    const result = await createMediaUploadUrl({
      projectId: "project-1",
      body: {
        contentType: MediaContentType.PNG,
        contentLength: 10,
        sha256Hash: "a".repeat(44),
        traceId: "trace-1",
        field: "input",
      },
    });

    expect(result).toEqual({ mediaId: "media-1", uploadUrl: null });
    expect(mocks.linkMediaToTraceOrObservation).toHaveBeenCalledOnce();
    expect(mocks.getSignedUploadUrl).not.toHaveBeenCalled();
  });

  it("clears the upload error for HTTP 201", async () => {
    await updateMediaUploadStatus({
      projectId: "project-1",
      mediaId: "media-1",
      body: {
        uploadedAt: new Date("2026-10-01T00:00:00Z"),
        uploadHttpStatus: 201,
        uploadHttpError: "",
      },
    });

    expect(mocks.update).toHaveBeenCalledWith({
      where: { projectId_id: { projectId: "project-1", id: "media-1" } },
      data: {
        uploadedAt: new Date("2026-10-01T00:00:00Z"),
        uploadHttpStatus: 201,
        uploadHttpError: null,
      },
    });
  });

  it("keeps the upload error for a failed upload", async () => {
    await updateMediaUploadStatus({
      projectId: "project-1",
      mediaId: "media-1",
      body: {
        uploadedAt: new Date("2026-10-01T00:00:00Z"),
        uploadHttpStatus: 403,
        uploadHttpError: "Forbidden",
      },
    });

    expect(mocks.update).toHaveBeenCalledWith({
      where: { projectId_id: { projectId: "project-1", id: "media-1" } },
      data: {
        uploadedAt: new Date("2026-10-01T00:00:00Z"),
        uploadHttpStatus: 403,
        uploadHttpError: "Forbidden",
      },
    });
  });
});
