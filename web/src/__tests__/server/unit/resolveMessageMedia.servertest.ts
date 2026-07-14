import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  ChatMessageRole,
  ChatMessageType,
  type ChatMessage,
} from "@langfuse/shared";

const { findUniqueMock, downloadBytesMock } = vi.hoisted(() => ({
  findUniqueMock: vi.fn(),
  downloadBytesMock: vi.fn(),
}));

vi.mock("@langfuse/shared/src/db", () => ({
  prisma: { media: { findUnique: findUniqueMock } },
}));

vi.mock("@/src/features/media/server/getMediaStorageClient", () => ({
  getMediaStorageServiceClient: () => ({ downloadBytes: downloadBytesMock }),
}));

vi.mock("@/src/env.mjs", () => ({
  env: { LANGFUSE_S3_MEDIA_MAX_CONTENT_LENGTH: 10_000_000 },
}));

import { resolveMessageMedia } from "@/src/features/media/server/resolveMessageMedia";

const mediaMessage = (mediaId: string): ChatMessage => ({
  type: ChatMessageType.User,
  role: ChatMessageRole.User,
  content: [
    { type: "text", text: "what is this?" },
    {
      type: "media",
      mediaId,
      mimeType: "image/png",
      reference: `@@@langfuseMedia:type=image/png|id=${mediaId}|source=base64@@@`,
    },
  ],
});

const uploadedImageRow = (id: string) => ({
  id,
  uploadHttpStatus: 200,
  contentType: "image/png",
  contentLength: BigInt(3),
  bucketName: "bucket",
  bucketPath: `path/${id}.png`,
});

describe("resolveMessageMedia", () => {
  beforeEach(() => {
    findUniqueMock.mockReset();
    downloadBytesMock.mockReset();
  });

  it("returns text-only messages untouched without any storage access", async () => {
    const messages: ChatMessage[] = [
      {
        type: ChatMessageType.System,
        role: ChatMessageRole.System,
        content: "system",
      },
      {
        type: ChatMessageType.User,
        role: ChatMessageRole.User,
        content: "hello",
      },
    ];

    const result = await resolveMessageMedia({ projectId: "p1", messages });

    expect(result).toBe(messages);
    expect(findUniqueMock).not.toHaveBeenCalled();
    expect(downloadBytesMock).not.toHaveBeenCalled();
  });

  it("inlines base64 for image media parts", async () => {
    findUniqueMock.mockResolvedValue(uploadedImageRow("m1"));
    downloadBytesMock.mockResolvedValue(new Uint8Array([65, 66, 67])); // "ABC"

    const [resolved] = await resolveMessageMedia({
      projectId: "p1",
      messages: [mediaMessage("m1")],
    });

    expect(Array.isArray(resolved.content)).toBe(true);
    const part = (resolved.content as any[]).find((p) => p.type === "media");
    expect(part.data).toBe(Buffer.from([65, 66, 67]).toString("base64"));
    expect(part.mimeType).toBe("image/png");
    // text part is preserved
    expect((resolved.content as any[])[0]).toEqual({
      type: "text",
      text: "what is this?",
    });
  });

  it("throws when the media row is missing", async () => {
    findUniqueMock.mockResolvedValue(null);
    await expect(
      resolveMessageMedia({ projectId: "p1", messages: [mediaMessage("m1")] }),
    ).rejects.toThrow(/not found/);
  });

  it("throws when upload has not completed", async () => {
    findUniqueMock.mockResolvedValue({
      ...uploadedImageRow("m1"),
      uploadHttpStatus: null,
    });
    await expect(
      resolveMessageMedia({ projectId: "p1", messages: [mediaMessage("m1")] }),
    ).rejects.toThrow(/not finished uploading/);
  });

  it("rejects non-image media", async () => {
    findUniqueMock.mockResolvedValue({
      ...uploadedImageRow("m1"),
      contentType: "audio/mpeg",
    });
    await expect(
      resolveMessageMedia({ projectId: "p1", messages: [mediaMessage("m1")] }),
    ).rejects.toThrow(/Unsupported media type/);
  });

  it("rejects media that exceeds the size limit", async () => {
    findUniqueMock.mockResolvedValue({
      ...uploadedImageRow("m1"),
      contentLength: BigInt(20_000_000),
    });
    await expect(
      resolveMessageMedia({ projectId: "p1", messages: [mediaMessage("m1")] }),
    ).rejects.toThrow(/exceeds the maximum/);
  });
});
