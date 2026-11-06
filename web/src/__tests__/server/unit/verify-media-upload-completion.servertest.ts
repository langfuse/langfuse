import { InternalServerError, LangfuseNotFoundError } from "@langfuse/shared";
import { verifyMediaUploadCompletion } from "@/src/features/media/server/mediaService";

const headObject = vi.fn();

vi.mock("@/src/features/media/server/getMediaStorageClient", () => ({
  getMediaStorageServiceClient: () => ({ getObjectContentLength: headObject }),
}));

const mediaFindUnique = vi.fn();

vi.mock("@langfuse/shared/src/db", () => ({
  prisma: {
    media: {
      findUnique: (...args: unknown[]) => mediaFindUnique(...args),
    },
  },
  Prisma: {
    PrismaClientKnownRequestError: class extends Error {
      code: string;
      constructor(message: string, code: string) {
        super(message);
        this.code = code;
      }
    },
  },
}));

const mediaRow = {
  id: "media-1",
  bucketName: "media-bucket",
  bucketPath: "projects/org_1_proj_1/media/media-1",
  contentLength: BigInt(42),
};

describe("verifyMediaUploadCompletion", () => {
  beforeEach(() => {
    headObject.mockReset();
    mediaFindUnique.mockReset();
  });

  it("accepts a success attestation when storage confirms existence and length", async () => {
    mediaFindUnique.mockResolvedValue(mediaRow);
    headObject.mockResolvedValue(42);

    await expect(
      verifyMediaUploadCompletion({
        projectId: "proj",
        mediaId: "media-1",
        uploadHttpStatus: 200,
      }),
    ).resolves.toBe(42);
    expect(headObject).toHaveBeenCalledWith(mediaRow.bucketPath);
  });

  it("rejects a success attestation when the blob is absent", async () => {
    mediaFindUnique.mockResolvedValue(mediaRow);
    headObject.mockResolvedValue(undefined);

    await expect(
      verifyMediaUploadCompletion({
        projectId: "proj",
        mediaId: "media-1",
        uploadHttpStatus: 201,
      }),
    ).rejects.toBeInstanceOf(InternalServerError);
  });

  it("rejects a success attestation when the length does not match the declaration", async () => {
    mediaFindUnique.mockResolvedValue(mediaRow);
    headObject.mockResolvedValue(4242);

    await expect(
      verifyMediaUploadCompletion({
        projectId: "proj",
        mediaId: "media-1",
        uploadHttpStatus: 200,
      }),
    ).rejects.toBeInstanceOf(InternalServerError);
  });

  it("skips storage verification for failure attestations", async () => {
    mediaFindUnique.mockResolvedValue(mediaRow);

    await expect(
      verifyMediaUploadCompletion({
        projectId: "proj",
        mediaId: "media-1",
        uploadHttpStatus: 403,
      }),
    ).resolves.toBeUndefined();
    expect(headObject).not.toHaveBeenCalled();
  });

  it("surfaces a missing media row as not found", async () => {
    mediaFindUnique.mockResolvedValue(null);

    await expect(
      verifyMediaUploadCompletion({
        projectId: "proj",
        mediaId: "media-1",
        uploadHttpStatus: 200,
      }),
    ).rejects.toBeInstanceOf(LangfuseNotFoundError);
  });
});
