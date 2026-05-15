import { describe, expect, it, vi } from "vitest";
import { Readable } from "node:stream";
import { type StorageService } from "@langfuse/shared/src/server";
import { uploadPromptsCoreDataJsonl } from "../coreDataS3ExportQueue";

const readStream = async (stream: Readable): Promise<string> => {
  const chunks: string[] = [];

  for await (const chunk of stream) {
    chunks.push(chunk.toString());
  }

  return chunks.join("");
};

describe("coreDataS3ExportQueue", () => {
  it("streams prompt core data in pages", async () => {
    const createdAt = new Date("2026-05-14T00:00:00.000Z");
    const updatedAt = new Date("2026-05-14T01:00:00.000Z");
    const pages = [
      [
        {
          id: "prompt-1",
          name: "first",
          projectId: "project-1",
          createdAt,
          updatedAt,
        },
        {
          id: "prompt-2",
          name: "second",
          projectId: "project-1",
          createdAt,
          updatedAt,
        },
      ],
      [
        {
          id: "prompt-3",
          name: "third",
          projectId: "project-2",
          createdAt,
          updatedAt,
        },
      ],
    ];

    const fetchPromptPage = vi.fn(async ({ skip }: { skip: number }) => {
      return pages[Math.floor(skip / 2)] ?? [];
    });

    const uploadFileBuffered = vi.fn(async ({ data }: { data: Readable }) => {
      expect(await readStream(data)).toBe(
        [
          JSON.stringify(pages[0][0]),
          JSON.stringify(pages[0][1]),
          JSON.stringify(pages[1][0]),
        ].join("\n"),
      );
    });

    const s3Client = {
      uploadFileBuffered,
    } as unknown as StorageService;

    await uploadPromptsCoreDataJsonl({
      s3Client,
      uploadPrefix: "core/",
      pageSize: 2,
      fetchPromptPage,
    });

    expect(fetchPromptPage).toHaveBeenCalledTimes(2);
    expect(fetchPromptPage).toHaveBeenNthCalledWith(1, { skip: 0, take: 2 });
    expect(fetchPromptPage).toHaveBeenNthCalledWith(2, { skip: 2, take: 2 });
    expect(uploadFileBuffered).toHaveBeenCalledTimes(1);
    expect(uploadFileBuffered).toHaveBeenCalledWith(
      expect.objectContaining({
        fileName: "core/prompts.jsonl",
        fileType: "application/x-ndjson",
        partSizeBytes: 100 * 1024 * 1024,
      }),
    );
  });
});
