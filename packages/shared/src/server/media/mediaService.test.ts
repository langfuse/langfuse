import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  executeRaw: vi.fn(),
  queryRaw: vi.fn(),
  findUnique: vi.fn(),
  updateMany: vi.fn(),
  update: vi.fn(),
  uploadFile: vi.fn(),
}));

vi.mock("../../db", () => ({
  Prisma: { PrismaClientKnownRequestError: class extends Error {} },
  prisma: {
    $executeRaw: mocks.executeRaw,
    $queryRaw: mocks.queryRaw,
    media: {
      findUnique: mocks.findUnique,
      updateMany: mocks.updateMany,
      update: mocks.update,
    },
  },
}));
vi.mock("../instrumentation", () => ({
  recordHistogram: vi.fn(),
  recordIncrement: vi.fn(),
}));
vi.mock("../s3", () => ({
  getS3MediaStorageClient: vi.fn(() => ({ uploadFile: mocks.uploadFile })),
}));

import { MediaContentType } from "../../domain/media";
import { uploadMediaForTrace } from "./mediaService";

const CONTENT_BYTES = Buffer.from("test-image");

describe("uploadMediaForTrace", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates, links, and uploads a new media asset", async () => {
    mocks.findUnique.mockResolvedValue(null);
    mocks.updateMany.mockResolvedValue({ count: 1 });
    mocks.update.mockResolvedValue({});
    mocks.uploadFile.mockResolvedValue(undefined);

    const result = await uploadMediaForTrace({
      projectId: "project-id",
      traceId: "trace-id",
      observationId: "observation-id",
      field: "input",
      contentType: MediaContentType.PNG,
      contentBytes: CONTENT_BYTES,
      mediaBucket: "media-bucket",
      mediaPrefix: "media/",
    });

    expect(result).toEqual({
      mediaId: "n-vgG9Qb-2loPinXEdit_8",
      outcome: "uploaded",
    });
    expect(mocks.executeRaw).toHaveBeenCalledTimes(1);
    expect(mocks.queryRaw).toHaveBeenCalledTimes(1);
    expect(mocks.uploadFile).toHaveBeenCalledWith(
      expect.objectContaining({
        fileName: "media/project-id/n-vgG9Qb-2loPinXEdit_8.png",
        fileType: "image/png",
      }),
    );
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          projectId_id: {
            projectId: "project-id",
            id: "n-vgG9Qb-2loPinXEdit_8",
          },
        },
        data: expect.objectContaining({ uploadHttpStatus: 200 }),
      }),
    );
  });

  it("links but does not re-upload an existing asset", async () => {
    mocks.findUnique.mockResolvedValue({
      id: "existing-media-id",
      uploadHttpStatus: 200,
      contentType: MediaContentType.PNG,
    });

    const result = await uploadMediaForTrace({
      projectId: "project-id",
      traceId: "trace-id",
      observationId: "observation-id",
      field: "output",
      contentType: MediaContentType.PNG,
      contentBytes: CONTENT_BYTES,
      mediaBucket: "media-bucket",
      mediaPrefix: "media/",
    });

    expect(result).toEqual({
      mediaId: "existing-media-id",
      outcome: "reused",
    });
    expect(mocks.queryRaw).toHaveBeenCalledTimes(1);
    expect(mocks.executeRaw).not.toHaveBeenCalled();
    expect(mocks.uploadFile).not.toHaveBeenCalled();
  });

  it("links trace media when no observation id is provided", async () => {
    mocks.findUnique.mockResolvedValue({
      id: "existing-media-id",
      uploadHttpStatus: 200,
      contentType: MediaContentType.PNG,
    });

    await uploadMediaForTrace({
      projectId: "project-id",
      traceId: "trace-id",
      field: "input",
      contentType: MediaContentType.PNG,
      contentBytes: CONTENT_BYTES,
      mediaBucket: "media-bucket",
      mediaPrefix: "media/",
    });

    const query = mocks.queryRaw.mock.calls[0]?.[0] as TemplateStringsArray;
    expect(query.join(" ")).toContain('INSERT INTO "trace_media"');
  });
});
