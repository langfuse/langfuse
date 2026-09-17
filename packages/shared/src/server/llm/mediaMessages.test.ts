import { beforeEach, describe, expect, it, vi } from "vitest";

const mediaStorageMocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  getSignedUrl: vi.fn(),
  downloadBytes: vi.fn(),
}));

vi.mock("../../db", () => ({
  prisma: { media: { findUnique: mediaStorageMocks.findUnique } },
}));
vi.mock("../s3", () => ({
  getS3MediaStorageClient: () => ({
    getSignedUrl: mediaStorageMocks.getSignedUrl,
    downloadBytes: mediaStorageMocks.downloadBytes,
  }),
}));

import {
  compileLangfuseMediaMessages,
  normalizeEvaluatorMediaType,
  resolveEvaluatorMediaTransport,
  resolveProjectMedia,
} from "./mediaMessages";
import {
  ChatMessageRole,
  ChatMessageType,
  LLMAdapter,
  type ChatMessage,
} from "./types";

const imageRef = "@@@langfuseMedia:type=image/jpeg|id=image-1|source=base64@@@";
const secondImageRef =
  "@@@langfuseMedia:type=image/png|id=image-2|source=base64@@@";
const unknownRef =
  "@@@langfuseMedia:type=application/zip|id=archive-1|source=base64@@@";
const fieldSizeLimitRef =
  "@@@langfuseMedia:type=text/plain|id=oversized-field|source=field_size_limit@@@";

const userMessage = (content: string) => ({
  type: ChatMessageType.User as const,
  role: ChatMessageRole.User as const,
  content,
});

const resolveMedia = vi.fn(async ({ mediaId }: { mediaId: string }) => ({
  url: `https://signed.example/${mediaId}?signature=secret`,
  mediaType: mediaId === "image-1" ? "image/jpeg" : "image/png",
  contentLength: 3,
}));

beforeEach(() => vi.clearAllMocks());

describe("compileLangfuseMediaMessages", () => {
  it("splits embedded and multiple supported references into ordered file parts", async () => {
    const original = [
      userMessage(`before ${imageRef} middle ${secondImageRef} after`),
    ];

    const result = await compileLangfuseMediaMessages({
      projectId: "project-1",
      messages: original,
      adapter: LLMAdapter.OpenAI,
      transport: "url",
      resolveMedia,
    });

    expect(result.providerMessages).toEqual([
      {
        role: "user",
        content: [
          { type: "text", text: "before " },
          {
            type: "file",
            data: new URL("https://signed.example/image-1?signature=secret"),
            mediaType: "image/jpeg",
          },
          { type: "text", text: " middle " },
          {
            type: "file",
            data: new URL("https://signed.example/image-2?signature=secret"),
            mediaType: "image/png",
          },
          { type: "text", text: " after" },
        ],
      },
    ]);
    expect(result.traceMessages).toEqual([
      {
        role: "user",
        content: [
          { type: "text", text: "before " },
          {
            type: "file",
            data: imageRef,
            mediaType: "image/jpeg",
          },
          { type: "text", text: " middle " },
          {
            type: "file",
            data: secondImageRef,
            mediaType: "image/png",
          },
          { type: "text", text: " after" },
        ],
      },
    ]);
    expect(original[0].content).toContain(imageRef);
  });

  it("resolves media references in the same message concurrently", async () => {
    let releaseFirst!: () => void;
    const firstResolution = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const parallelResolveMedia = vi.fn(
      async ({ mediaId }: { mediaId: string }) => {
        if (mediaId === "image-1") await firstResolution;
        return {
          url: `https://signed.example/${mediaId}`,
          mediaType: mediaId === "image-1" ? "image/jpeg" : "image/png",
        };
      },
    );

    const compilation = compileLangfuseMediaMessages({
      projectId: "project-1",
      messages: [userMessage(`${imageRef} ${secondImageRef}`)],
      adapter: LLMAdapter.OpenAI,
      transport: "url",
      resolveMedia: parallelResolveMedia,
    });

    try {
      expect(parallelResolveMedia).toHaveBeenCalledTimes(2);
    } finally {
      releaseFirst();
      await compilation;
    }
  });

  it("sends media bytes inline without changing text and file order", async () => {
    const fetchMedia = vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3]));

    const result = await compileLangfuseMediaMessages({
      projectId: "project-1",
      messages: [userMessage(`before ${imageRef} after`)],
      adapter: LLMAdapter.OpenAI,
      transport: "inline",
      resolveMedia,
      fetchMedia,
    });

    expect(result.providerMessages).toEqual([
      {
        role: "user",
        content: [
          { type: "text", text: "before " },
          {
            type: "file",
            data: new Uint8Array([1, 2, 3]),
            mediaType: "image/jpeg",
          },
          { type: "text", text: " after" },
        ],
      },
    ]);
    expect(fetchMedia).toHaveBeenCalledWith(
      "https://signed.example/image-1?signature=secret",
    );
  });

  it("loads default inline media directly from internal storage", async () => {
    mediaStorageMocks.findUnique.mockResolvedValueOnce({
      uploadHttpStatus: 200,
      contentType: "image/jpeg",
      bucketName: "media",
      bucketPath: "project-1/image-1.jpeg",
      contentLength: 3n,
    });
    mediaStorageMocks.getSignedUrl.mockResolvedValueOnce(
      "https://browser-facing.example/image-1?signature=secret",
    );
    mediaStorageMocks.downloadBytes.mockResolvedValueOnce(
      new Uint8Array([1, 2, 3]),
    );
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const result = await compileLangfuseMediaMessages({
      projectId: "project-1",
      messages: [userMessage(imageRef)],
      adapter: LLMAdapter.OpenAI,
      transport: "inline",
    });

    expect(result.providerMessages).toEqual([
      {
        role: "user",
        content: [
          {
            type: "file",
            data: new Uint8Array([1, 2, 3]),
            mediaType: "image/jpeg",
          },
        ],
      },
    ]);
    expect(mediaStorageMocks.downloadBytes).toHaveBeenCalledWith(
      "project-1/image-1.jpeg",
    );
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("rejects declared inline media above the byte limit before download", async () => {
    const fetchMedia = vi.fn();

    await expect(
      compileLangfuseMediaMessages({
        projectId: "project-1",
        messages: [userMessage(imageRef)],
        adapter: LLMAdapter.OpenAI,
        transport: "inline",
        maxInlineMediaBytes: 2,
        resolveMedia,
        fetchMedia,
      }),
    ).rejects.toMatchObject({
      name: "LLMValidationError",
      message: "Media asset image-1 could not be loaded for inline model input",
    });
    expect(fetchMedia).not.toHaveBeenCalled();
  });

  it("rejects downloaded inline media above the byte limit", async () => {
    const resolver = vi.fn().mockResolvedValue({
      url: "https://signed.example/image-1?signature=secret",
      mediaType: "image/jpeg",
    });
    const fetchMedia = vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3]));

    await expect(
      compileLangfuseMediaMessages({
        projectId: "project-1",
        messages: [userMessage(imageRef)],
        adapter: LLMAdapter.OpenAI,
        transport: "inline",
        maxInlineMediaBytes: 2,
        resolveMedia: resolver,
        fetchMedia,
      }),
    ).rejects.toMatchObject({
      name: "LLMValidationError",
      message: "Media asset image-1 could not be loaded for inline model input",
    });
    expect(fetchMedia).toHaveBeenCalledOnce();
  });

  it("fails without URL fallback when inline media cannot be loaded", async () => {
    const fetchMedia = vi.fn().mockRejectedValue(new Error("download failed"));

    await expect(
      compileLangfuseMediaMessages({
        projectId: "project-1",
        messages: [userMessage(imageRef)],
        adapter: LLMAdapter.OpenAI,
        transport: "inline",
        resolveMedia,
        fetchMedia,
      }),
    ).rejects.toMatchObject({
      name: "LLMValidationError",
      message: "Media asset image-1 could not be loaded for inline model input",
    });
  });

  it("keeps supported references as plain text when media transport is disabled", async () => {
    const fetchMedia = vi.fn();
    const messages: ChatMessage[] = [
      {
        role: ChatMessageRole.System,
        type: ChatMessageType.System,
        content: imageRef,
      },
      userMessage(`inspect ${imageRef}`),
    ];

    await expect(
      compileLangfuseMediaMessages({
        projectId: "project-1",
        messages,
        adapter: LLMAdapter.OpenAI,
        transport: "disabled",
        resolveMedia,
        fetchMedia,
      }),
    ).resolves.toEqual({
      providerMessages: [
        { role: "system", content: imageRef },
        { role: "user", content: `inspect ${imageRef}` },
      ],
      traceMessages: [
        { role: "system", content: imageRef },
        { role: "user", content: `inspect ${imageRef}` },
      ],
    });
    expect(resolveMedia).not.toHaveBeenCalled();
    expect(fetchMedia).not.toHaveBeenCalled();
  });

  it.each([
    ["unknown MIME", unknownRef, "application/zip"],
    ["field-size placeholder", fieldSizeLimitRef, "text/plain"],
  ])(
    "leaves %s references as provider text but exposes them as trace media",
    async (_label, reference, mediaType) => {
      const resolver = vi.fn();
      const result = await compileLangfuseMediaMessages({
        projectId: "project-1",
        messages: [userMessage(`inspect ${reference}`)],
        adapter: LLMAdapter.Anthropic,
        resolveMedia: resolver,
      });

      expect(result).toEqual({
        providerMessages: [{ role: "user", content: `inspect ${reference}` }],
        traceMessages: [
          {
            role: "user",
            content: [
              { type: "text", text: "inspect " },
              { type: "file", data: reference, mediaType },
            ],
          },
        ],
      });
      expect(resolver).not.toHaveBeenCalled();
    },
  );

  it.each([
    [ChatMessageRole.System, ChatMessageType.System],
    [ChatMessageRole.Developer, ChatMessageType.Developer],
    [ChatMessageRole.Assistant, ChatMessageType.AssistantText],
  ])(
    "expands supported media after the adapter normalizes a %s message to user",
    async (role, type) => {
      await expect(
        compileLangfuseMediaMessages({
          projectId: "project-1",
          messages: [{ role, type, content: imageRef } as ChatMessage],
          adapter: LLMAdapter.GoogleAIStudio,
          transport: "url",
          resolveMedia,
        }),
      ).resolves.toEqual({
        providerMessages: [
          {
            role: "user",
            content: [
              {
                type: "file",
                data: new URL(
                  "https://signed.example/image-1?signature=secret",
                ),
                mediaType: "image/jpeg",
              },
            ],
          },
        ],
        traceMessages: [
          {
            role: "user",
            content: [
              { type: "file", data: imageRef, mediaType: "image/jpeg" },
            ],
          },
        ],
      });
      expect(resolveMedia).toHaveBeenCalledOnce();
    },
  );

  it("expands supported media in normalized assistant messages", async () => {
    await expect(
      compileLangfuseMediaMessages({
        projectId: "project-1",
        messages: [
          userMessage("Describe the result"),
          {
            role: ChatMessageRole.Assistant,
            type: ChatMessageType.AssistantText,
            content: `result ${imageRef}`,
          },
        ],
        adapter: LLMAdapter.OpenAI,
        transport: "url",
        resolveMedia,
      }),
    ).resolves.toEqual({
      providerMessages: [
        { role: "user", content: "Describe the result" },
        {
          role: "assistant",
          content: [
            { type: "text", text: "result " },
            {
              type: "file",
              data: new URL("https://signed.example/image-1?signature=secret"),
              mediaType: "image/jpeg",
            },
          ],
        },
      ],
      traceMessages: [
        { role: "user", content: "Describe the result" },
        {
          role: "assistant",
          content: [
            { type: "text", text: "result " },
            { type: "file", data: imageRef, mediaType: "image/jpeg" },
          ],
        },
      ],
    });
  });

  it("fails locally when a project-scoped media reference cannot be resolved", async () => {
    const resolver = vi.fn().mockResolvedValue(null);

    await expect(
      compileLangfuseMediaMessages({
        projectId: "project-1",
        messages: [userMessage(imageRef)],
        adapter: LLMAdapter.OpenAI,
        resolveMedia: resolver,
      }),
    ).rejects.toMatchObject({
      name: "LLMValidationError",
      message: "Media asset image-1 was not found in this project",
    });
    expect(resolver).toHaveBeenCalledWith({
      projectId: "project-1",
      mediaId: "image-1",
      mediaType: "image/jpeg",
    });
  });
});

describe("resolveEvaluatorMediaTransport", () => {
  it.each([
    [undefined, undefined, "inline"],
    [undefined, "DEV", "url"],
    [undefined, "EU", "url"],
    ["disabled", "EU", "disabled"],
    ["inline", "EU", "inline"],
    ["url", undefined, "url"],
  ] as const)(
    "resolves configured=%s cloudRegion=%s to %s",
    (configured, cloudRegion, expected) => {
      expect(resolveEvaluatorMediaTransport({ configured, cloudRegion })).toBe(
        expected,
      );
    },
  );
});

describe("resolveProjectMedia", () => {
  it("queries by both project and media id and returns null for missing/cross-project media", async () => {
    mediaStorageMocks.findUnique.mockResolvedValueOnce(null);

    await expect(
      resolveProjectMedia({
        projectId: "project-1",
        mediaId: "foreign-image",
        mediaType: "image/jpeg",
      }),
    ).resolves.toBeNull();
    expect(mediaStorageMocks.findUnique).toHaveBeenCalledWith({
      where: {
        projectId_id: { projectId: "project-1", id: "foreign-image" },
      },
    });
    expect(mediaStorageMocks.getSignedUrl).not.toHaveBeenCalled();
  });

  it("signs an uploaded project media object for two minutes without downloading it", async () => {
    mediaStorageMocks.findUnique.mockResolvedValueOnce({
      uploadHttpStatus: 200,
      contentType: "image/jpeg",
      bucketName: "media",
      bucketPath: "project-1/image-1.jpeg",
      contentLength: 3n,
    });
    mediaStorageMocks.getSignedUrl.mockResolvedValueOnce(
      "https://signed.example/image-1?signature=secret",
    );

    await expect(
      resolveProjectMedia({
        projectId: "project-1",
        mediaId: "image-1",
        mediaType: "image/jpeg",
      }),
    ).resolves.toEqual({
      url: "https://signed.example/image-1?signature=secret",
      mediaType: "image/jpeg",
      contentLength: 3,
      bucketName: "media",
      bucketPath: "project-1/image-1.jpeg",
    });
    expect(mediaStorageMocks.getSignedUrl).toHaveBeenCalledWith(
      "project-1/image-1.jpeg",
      120,
      false,
    );
  });
});

describe("normalizeEvaluatorMediaType", () => {
  it.each([
    ["image/jpg", "image/jpeg"],
    ["audio/mp3", "audio/mpeg"],
    ["audio/x-wav", "audio/wav"],
  ])("normalizes %s", (input, expected) => {
    expect(normalizeEvaluatorMediaType(input)).toBe(expected);
  });
});
