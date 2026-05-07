import {
  hasImageExtension,
  isOctetStream,
  isValidImageUrl,
} from "@/src/server/api/routers/utilities";

describe("utilities image url validation", () => {
  describe("hasImageExtension", () => {
    it("returns true for known image extension", () => {
      expect(hasImageExtension("https://cdn.example.com/img/photo.webp")).toBe(
        true,
      );
    });

    it("returns false for non-image extension", () => {
      expect(hasImageExtension("https://cdn.example.com/file.zip")).toBe(false);
    });

    it("returns false when no extension is present", () => {
      expect(hasImageExtension("https://cdn.example.com/data")).toBe(false);
    });

    it("returns true when query string is present", () => {
      expect(
        hasImageExtension("https://cdn.example.com/photo.jpg?token=abc"),
      ).toBe(true);
    });

    it("returns false for double-extension that ends with non-image", () => {
      expect(hasImageExtension("https://cdn.example.com/file.png.exe")).toBe(
        false,
      );
    });
  });

  describe("isOctetStream", () => {
    const responseWith = (contentType: string | null) =>
      new Response(null, {
        headers: contentType ? { "content-type": contentType } : {},
      });

    it("returns true for application/octet-stream", () => {
      expect(isOctetStream(responseWith("application/octet-stream"))).toBe(
        true,
      );
    });

    it("returns true for octet-stream with charset suffix", () => {
      expect(
        isOctetStream(responseWith("application/octet-stream; charset=utf-8")),
      ).toBe(true);
    });

    it("returns false for image content-type", () => {
      expect(isOctetStream(responseWith("image/png"))).toBe(false);
    });

    it("returns false for text/html content-type", () => {
      expect(isOctetStream(responseWith("text/html"))).toBe(false);
    });

    it("returns false when content-type header is missing", () => {
      expect(isOctetStream(responseWith(null))).toBe(false);
    });
  });

  describe("isValidImageUrl (non-S3 CDN)", () => {
    const cloudfrontUrl = (path: string) =>
      `https://d1234.cloudfront.net${path}`;

    const mockHeadResponse = (init: ResponseInit) =>
      vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValueOnce(new Response(null, init));

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("returns true for octet-stream + image extension (core bug scenario)", async () => {
      mockHeadResponse({
        status: 200,
        headers: { "content-type": "application/octet-stream" },
      });

      await expect(
        isValidImageUrl(cloudfrontUrl("/img/photo.webp")),
      ).resolves.toBe(true);
    });

    it("returns false for octet-stream without extension", async () => {
      mockHeadResponse({
        status: 200,
        headers: { "content-type": "application/octet-stream" },
      });

      await expect(isValidImageUrl(cloudfrontUrl("/data"))).resolves.toBe(
        false,
      );
    });

    it("returns false for octet-stream + non-image extension", async () => {
      mockHeadResponse({
        status: 200,
        headers: { "content-type": "application/octet-stream" },
      });

      await expect(isValidImageUrl(cloudfrontUrl("/file.zip"))).resolves.toBe(
        false,
      );
    });

    it("returns true for image/* content-type (existing behavior preserved)", async () => {
      mockHeadResponse({
        status: 200,
        headers: { "content-type": "image/png" },
      });

      await expect(isValidImageUrl(cloudfrontUrl("/photo.png"))).resolves.toBe(
        true,
      );
    });

    it("returns false for text/html even with image extension (octet-stream is the only fallback)", async () => {
      mockHeadResponse({
        status: 200,
        headers: { "content-type": "text/html" },
      });

      await expect(isValidImageUrl(cloudfrontUrl("/photo.jpg"))).resolves.toBe(
        false,
      );
    });
  });
});
