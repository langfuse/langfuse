import { describe, expect, it, vi } from "vitest";
import { LLMAdapter, type PromptContent } from "@langfuse/shared";
import { compileLangfuseMediaMessages } from "@langfuse/shared/src/server";
import {
  extractDatasetVersionFromMetadata,
  replaceVariablesInPrompt,
} from "./utils";

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

describe("extractDatasetVersionFromMetadata", () => {
  it("extracts a valid ISO date string", () => {
    const iso = "2026-10-25T11:52:11.000Z";
    const result = extractDatasetVersionFromMetadata({
      dataset_version: iso,
      prompt_id: "p-1",
    });
    expect(result).toEqual(new Date(iso));
  });

  it("extracts a Date object", () => {
    const date = new Date("2026-10-25T11:52:11.000Z");
    const result = extractDatasetVersionFromMetadata({
      dataset_version: date,
    });
    expect(result).toEqual(date);
  });

  it("returns undefined for missing or null dataset_version", () => {
    expect(extractDatasetVersionFromMetadata(null)).toBeUndefined();
    expect(extractDatasetVersionFromMetadata({})).toBeUndefined();
    expect(
      extractDatasetVersionFromMetadata({ dataset_version: null }),
    ).toBeUndefined();
  });

  it("returns undefined for empty or invalid strings", () => {
    expect(
      extractDatasetVersionFromMetadata({ dataset_version: "" }),
    ).toBeUndefined();
    expect(
      extractDatasetVersionFromMetadata({ dataset_version: "   " }),
    ).toBeUndefined();
    expect(
      extractDatasetVersionFromMetadata({ dataset_version: "not-a-date" }),
    ).toBeUndefined();
  });

  it("recovers dataset_version even when other metadata fields are invalid", () => {
    const iso = "2026-10-25T11:52:11.000Z";
    const result = extractDatasetVersionFromMetadata({
      prompt_id: 12345,
      provider: null,
      model_params: "bad-params",
      dataset_version: iso,
    });
    expect(result).toEqual(new Date(iso));
  });
});
