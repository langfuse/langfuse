import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const invokeMock = vi.fn();
const pipeMock = vi.fn().mockReturnValue({
  invoke: invokeMock,
});
const chatOpenAIConstructorMock = vi.fn().mockImplementation(function () {
  return {
    pipe: pipeMock,
  };
});
const prismaMediaFindManyMock = vi.fn();
const getSignedUrlMock = vi.fn();

process.env.CLICKHOUSE_URL ??= "http://localhost:8123";
process.env.CLICKHOUSE_USER ??= "default";
process.env.CLICKHOUSE_PASSWORD ??= "password";
process.env.LANGFUSE_S3_EVENT_UPLOAD_BUCKET ??= "test-bucket";
process.env.ENCRYPTION_KEY ??=
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

describe("fetchLLMCompletion media references", () => {
  let originalCloudRegion: string | undefined;
  let encrypt: typeof import("../../../packages/shared/src/encryption").encrypt;
  let fetchLLMCompletion: typeof import("../../../packages/shared/src/server/llm/fetchLLMCompletion").fetchLLMCompletion;

  beforeEach(async () => {
    invokeMock.mockReset();
    invokeMock.mockResolvedValue("completion");
    pipeMock.mockClear();
    chatOpenAIConstructorMock.mockClear();
    prismaMediaFindManyMock.mockReset();
    getSignedUrlMock.mockReset();
    vi.resetModules();
    originalCloudRegion = process.env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION;
    delete process.env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION;

    vi.doMock(
      "../../../packages/shared/node_modules/@langchain/openai",
      () => ({
        ChatOpenAI: chatOpenAIConstructorMock,
        AzureChatOpenAI: vi.fn(),
      }),
    );
    vi.doMock("../../../packages/shared/src/db", () => ({
      prisma: {
        media: {
          findMany: prismaMediaFindManyMock,
        },
      },
    }));
    vi.doMock("../../../packages/shared/src/server/s3", () => ({
      getS3MediaStorageClient: vi.fn(() => ({
        getSignedUrl: getSignedUrlMock,
      })),
    }));

    ({ encrypt } = await import("../../../packages/shared/src/encryption"));
    ({ fetchLLMCompletion } =
      await import("../../../packages/shared/src/server/llm/fetchLLMCompletion"));
  });

  afterEach(() => {
    if (originalCloudRegion === undefined) {
      delete process.env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION;
    } else {
      process.env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = originalCloudRegion;
    }
  });

  it("replaces resolved media references in human messages with signed image content blocks", async () => {
    const mediaId = "cc48838a-3da8-4ca4-a007-2cf8df930e69";
    const resolvedToken = `@@@langfuseMedia:type=image/jpeg|id=${mediaId}|source=base64@@@`;
    const unresolvedToken =
      "@@@langfuseMedia:type=image/png|id=missing-media|source=base64@@@";

    prismaMediaFindManyMock.mockResolvedValue([
      {
        id: mediaId,
        bucketName: "media-bucket",
        bucketPath: "project/media/image.jpg",
      },
    ]);

    const signedUrl = "https://signed.example/image.jpg";
    getSignedUrlMock.mockResolvedValue(signedUrl);

    const projectId = "project-123";
    await fetchLLMCompletion({
      streaming: false,
      messages: [
        {
          role: "user",
          content: `Describe ${resolvedToken} and keep ${unresolvedToken}.`,
          type: "public-api-created",
        },
      ],
      modelParams: {
        provider: "openai",
        adapter: "openai",
        model: "gpt-4o-mini",
        temperature: 0,
        max_tokens: 10,
      },
      llmConnection: {
        secretKey: encrypt("test-api-key"),
      },
      projectId,
    });

    expect(prismaMediaFindManyMock).toHaveBeenCalledWith({
      select: {
        id: true,
        bucketName: true,
        bucketPath: true,
      },
      where: {
        projectId,
        id: { in: [mediaId, "missing-media"] },
        uploadHttpStatus: { in: [200, 201] },
      },
    });

    const [finalMessages] = invokeMock.mock.calls[0];
    expect(finalMessages[0].content).toEqual([
      { type: "text", text: "Describe " },
      {
        type: "image",
        mimeType: "image/jpeg",
        url: signedUrl,
      },
      { type: "text", text: ` and keep ${unresolvedToken}.` },
    ]);
  });

  it("keeps resolved unsupported media references as text", async () => {
    const mediaId = "cc48838a-3da8-4ca4-a007-2cf8df930e70";
    const textToken = `@@@langfuseMedia:type=text/plain|id=${mediaId}|source=base64@@@`;

    prismaMediaFindManyMock.mockResolvedValue([
      {
        id: mediaId,
        bucketName: "media-bucket",
        bucketPath: "project/media/document.txt",
      },
    ]);
    getSignedUrlMock.mockResolvedValue("https://signed.example/document.txt");

    await fetchLLMCompletion({
      streaming: false,
      messages: [
        {
          role: "user",
          content: `Read ${textToken}.`,
          type: "public-api-created",
        },
      ],
      modelParams: {
        provider: "openai",
        adapter: "openai",
        model: "gpt-4o-mini",
        temperature: 0,
        max_tokens: 10,
      },
      llmConnection: {
        secretKey: encrypt("test-api-key"),
      },
      projectId: "project-id",
    });

    const [finalMessages] = invokeMock.mock.calls[0];
    expect(finalMessages[0].content).toBe(`Read ${textToken}.`);
  });
});
