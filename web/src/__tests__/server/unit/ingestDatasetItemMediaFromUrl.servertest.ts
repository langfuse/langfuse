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

  it("infers type from the final URL when Content-Type is missing after a redirect", async () => {
    fetchWithSecureRedirectsMock.mockResolvedValue({
      response: new Response(new Uint8Array([1, 2, 3]), { status: 200 }),
      finalUrl: "https://cdn.example.com/real.webp",
    });

    await ingestDatasetItemMediaFromUrl({
      projectId: "project-id",
      datasetId: "dataset-id",
      datasetItemId: "item-id",
      field: "input",
      url: "https://cdn.example.com/cat.png",
    });

    expect(uploadMediaForDatasetItemMock).toHaveBeenCalledWith(
      expect.objectContaining({ contentType: "image/webp" }),
    );
  });

  it("infers type from bytes when Content-Type and final URL have no media type", async () => {
    const pngBytes = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
    ]);
    fetchWithSecureRedirectsMock.mockResolvedValue({
      response: new Response(pngBytes, { status: 200 }),
      finalUrl: "https://cdn.example.com/objects/abc123",
    });

    await ingestDatasetItemMediaFromUrl({
      projectId: "project-id",
      datasetId: "dataset-id",
      datasetItemId: "item-id",
      field: "input",
      url: "https://cdn.example.com/cat.png",
    });

    expect(uploadMediaForDatasetItemMock).toHaveBeenCalledWith(
      expect.objectContaining({ contentType: "image/png" }),
    );
  });

  it("rejects a media-looking URL that redirects to an unsupported Content-Type", async () => {
    fetchWithSecureRedirectsMock.mockResolvedValue({
      response: new Response("<html>not media</html>", {
        status: 200,
        headers: { "content-type": "text/html" },
      }),
      finalUrl: "https://cdn.example.com/landing",
    });

    await expect(
      ingestDatasetItemMediaFromUrl({
        projectId: "project-id",
        datasetId: "dataset-id",
        datasetItemId: "item-id",
        field: "input",
        url: "https://cdn.example.com/cat.png",
      }),
    ).rejects.toBeInstanceOf(InvalidRequestError);

    expect(uploadMediaForDatasetItemMock).not.toHaveBeenCalled();
  });
});
