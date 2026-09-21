import { describe, expect, it } from "vitest";
import { rewriteCsvFieldMedia } from "./csvMedia";

const IMAGE_REF =
  "@@@langfuseMedia:type=image/png|id=cc48838a-3da8-4ca4-a007-2cf8df930e69|source=bytes@@@";

describe("rewriteCsvFieldMedia", () => {
  it("leaves langfuse media tokens and non-media strings unchanged", async () => {
    const convertUrl = async () => "should-not-run";
    await expect(
      rewriteCsvFieldMedia(IMAGE_REF, "input", convertUrl),
    ).resolves.toBe(IMAGE_REF);
    await expect(
      rewriteCsvFieldMedia("https://example.com/page", "input", convertUrl),
    ).resolves.toBe("https://example.com/page");
  });

  it("converts third-party media URLs nested in JSON", async () => {
    const rewritten = await rewriteCsvFieldMedia(
      {
        prompt: "describe",
        image: "https://cdn.example.com/cat.png",
        note: "https://example.com/page",
      },
      "input",
      async (url) => `token:${url}`,
    );
    expect(rewritten).toEqual({
      prompt: "describe",
      image: "token:https://cdn.example.com/cat.png",
      note: "https://example.com/page",
    });
  });
});
