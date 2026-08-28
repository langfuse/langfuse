const {
  fetchWithSecureRedirectsMock,
  parseOutboundUrlMock,
  uploadMediaForDatasetItemMock,
  validateOutboundUrlHostMock,
} = vi.hoisted(() => ({
  fetchWithSecureRedirectsMock: vi.fn(),
  parseOutboundUrlMock: vi.fn((url: string) => new URL(url)),
  uploadMediaForDatasetItemMock: vi.fn(),
  validateOutboundUrlHostMock: vi.fn(),
}));

vi.mock("@/src/env.mjs", () => ({
  env: {
    LANGFUSE_S3_MEDIA_UPLOAD_BUCKET: "media-bucket",
    LANGFUSE_S3_MEDIA_UPLOAD_PREFIX: "media/",
    LANGFUSE_S3_MEDIA_MAX_CONTENT_LENGTH: 1_000_000_000,
  },
}));

vi.mock("@langfuse/shared/src/server", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...(actual as object),
    fetchWithSecureRedirects: fetchWithSecureRedirectsMock,
    parseOutboundUrl: parseOutboundUrlMock,
    uploadMediaForDatasetItem: uploadMediaForDatasetItemMock,
    validateOutboundUrlHost: validateOutboundUrlHostMock,
  };
});

import { InvalidRequestError } from "@langfuse/shared";
import { ingestDatasetItemMediaFromUrl } from "@/src/features/media/server/ingestDatasetItemMediaFromUrl";

describe("ingestDatasetItemMediaFromUrl", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    validateOutboundUrlHostMock.mockResolvedValue(undefined);
    uploadMediaForDatasetItemMock.mockResolvedValue({
      mediaId: "media-id",
      outcome: "uploaded",
      sha256Hash: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa=",
    });
  });

  it("uploads fetched bytes and returns a langfuse media reference", async () => {
    fetchWithSecureRedirectsMock.mockResolvedValue({
      response: new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: { "content-type": "image/png" },
      }),
    });

    const result = await ingestDatasetItemMediaFromUrl({
      projectId: "project-id",
      datasetId: "dataset-id",
      datasetItemId: "item-id",
      field: "input",
      url: "https://cdn.example.com/cat.png",
    });

    expect(result.referenceString).toBe(
      "@@@langfuseMedia:type=image/png|id=media-id|source=bytes@@@",
    );
    expect(uploadMediaForDatasetItemMock).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: "project-id",
        datasetId: "dataset-id",
        datasetItemId: "item-id",
        field: "input",
        contentType: "image/png",
      }),
    );
  });

  it("rejects http URLs", async () => {
    await expect(
      ingestDatasetItemMediaFromUrl({
        projectId: "project-id",
        datasetId: "dataset-id",
        datasetItemId: "item-id",
        field: "input",
        url: "http://cdn.example.com/cat.png",
      }),
    ).rejects.toBeInstanceOf(InvalidRequestError);

    expect(fetchWithSecureRedirectsMock).not.toHaveBeenCalled();
  });
});
