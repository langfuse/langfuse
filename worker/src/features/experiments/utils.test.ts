import { describe, expect, it, vi } from "vitest";
import { LLMAdapter, type PromptContent } from "@langfuse/shared";
import { compileLangfuseMediaMessages } from "@langfuse/shared/src/server";
import { replaceVariablesInPrompt } from "./utils";

const imageRef =
  "@@@langfuseMedia:type=image/jpeg|id=experiment-image|source=base64@@@";

describe("prompt experiment multimodal messages", () => {
  it("interpolates a dataset media reference and compiles it for provider egress", async () => {
    const originalMessages = replaceVariablesInPrompt(
      [{ role: "user", content: "Inspect {{image}}" }] as PromptContent,
      { image: imageRef },
      ["image"],
    );
    const resolveMedia = vi.fn().mockResolvedValue({
      url: "https://signed.example/experiment-image?signature=secret",
      mediaType: "image/jpeg",
    });

    const { providerMessages, traceMessages } =
      await compileLangfuseMediaMessages({
        projectId: "project-1",
        messages: originalMessages,
        adapter: LLMAdapter.OpenAI,
        transport: "url",
        resolveMedia,
      });

    expect(originalMessages[0].content).toBe(`Inspect ${imageRef}`);
    expect(providerMessages).toEqual([
      {
        role: "user",
        content: [
          { type: "text", text: "Inspect " },
          {
            type: "file",
            data: new URL(
              "https://signed.example/experiment-image?signature=secret",
            ),
            mediaType: "image/jpeg",
          },
        ],
      },
    ]);
    expect(traceMessages).toEqual([
      {
        role: "user",
        content: [
          { type: "text", text: "Inspect " },
          {
            type: "file",
            data: imageRef,
            mediaType: "image/jpeg",
          },
        ],
      },
    ]);
    expect(resolveMedia).toHaveBeenCalledWith({
      projectId: "project-1",
      mediaId: "experiment-image",
      mediaType: "image/jpeg",
    });
  });
});
