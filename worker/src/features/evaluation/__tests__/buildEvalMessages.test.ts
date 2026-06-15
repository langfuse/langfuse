import { describe, it, expect, beforeEach, vi } from "vitest";
import { ChatMessageRole } from "@langfuse/shared";

const findUnique = vi.fn();
const getSignedUrl = vi.fn();

vi.mock("@langfuse/shared/src/db", () => ({
  prisma: {
    media: {
      findUnique: (...args: unknown[]) => findUnique(...args),
    },
  },
}));

vi.mock("../mediaStorageClient", () => ({
  getMediaStorageClient: () => ({
    getSignedUrl: (...args: unknown[]) => getSignedUrl(...args),
  }),
}));

import { buildEvalMessages } from "../evalRuntime";

const PROJECT_ID = "project-1";
const imageRef = (id: string) =>
  `@@@langfuseMedia:type=image/jpeg|id=${id}|source=base64@@@`;

describe("buildEvalMessages", () => {
  beforeEach(() => {
    findUnique.mockReset();
    getSignedUrl.mockReset();
  });

  it("returns a plain string user message when there is no media reference", async () => {
    const messages = await buildEvalMessages("Rate this answer.", PROJECT_ID);

    expect(messages).toEqual([
      expect.objectContaining({
        role: ChatMessageRole.User,
        content: "Rate this answer.",
      }),
    ]);
    expect(findUnique).not.toHaveBeenCalled();
  });

  it("emits multimodal image_url content for resolvable image media", async () => {
    findUnique.mockResolvedValue({
      id: "media-1",
      uploadHttpStatus: 200,
      bucketName: "media-bucket",
      bucketPath: "project-1/media-1.jpg",
    });
    getSignedUrl.mockResolvedValue("https://signed.example/media-1.jpg");

    const prompt = `Describe ${imageRef("media-1")} briefly.`;
    const messages = await buildEvalMessages(prompt, PROJECT_ID);

    expect(messages).toHaveLength(1);
    expect(messages[0].role).toBe(ChatMessageRole.User);
    expect(messages[0].content).toEqual([
      { type: "text", text: "Describe " },
      {
        type: "image_url",
        image_url: { url: "https://signed.example/media-1.jpg" },
      },
      { type: "text", text: " briefly." },
    ]);
    // presigned with inline disposition (asAttachment = false)
    expect(getSignedUrl).toHaveBeenCalledWith(
      "project-1/media-1.jpg",
      expect.any(Number),
      false,
    );
  });

  it("falls back to a plain string message when the media is missing", async () => {
    findUnique.mockResolvedValue(null);

    const prompt = `Look at ${imageRef("missing")} please.`;
    const messages = await buildEvalMessages(prompt, PROJECT_ID);

    // No image resolved -> plain string content equal to the original prompt.
    expect(messages).toEqual([
      expect.objectContaining({
        role: ChatMessageRole.User,
        content: prompt,
      }),
    ]);
    expect(getSignedUrl).not.toHaveBeenCalled();
  });

  it("falls back to text when presigning throws (no hard failure)", async () => {
    findUnique.mockResolvedValue({
      id: "media-1",
      uploadHttpStatus: 200,
      bucketName: "media-bucket",
      bucketPath: "project-1/media-1.jpg",
    });
    getSignedUrl.mockRejectedValue(new Error("S3 down"));

    const prompt = `Describe ${imageRef("media-1")} briefly.`;

    // Should not throw; degrades to a plain-string message.
    const messages = await buildEvalMessages(prompt, PROJECT_ID);
    expect(messages).toEqual([
      expect.objectContaining({
        role: ChatMessageRole.User,
        content: prompt,
      }),
    ]);
  });

  it("does not treat non-image media as an image", async () => {
    const prompt = `Audio: @@@langfuseMedia:type=audio/mpeg|id=a1|source=base64@@@`;
    const messages = await buildEvalMessages(prompt, PROJECT_ID);

    // Non-image media is left as text, so no DB/storage lookups happen.
    expect(findUnique).not.toHaveBeenCalled();
    expect(messages).toEqual([
      expect.objectContaining({
        role: ChatMessageRole.User,
        content: prompt,
      }),
    ]);
  });
});
