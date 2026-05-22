import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { encrypt } from "../../../packages/shared/src/encryption";
import { env } from "../../../packages/shared/src/env";
import {
  ChatMessageType,
  LLMAdapter,
} from "../../../packages/shared/src/server/llm/types";
import { fetchLLMCompletion } from "../../../packages/shared/src/server/llm/fetchLLMCompletion";
import {
  createSecureGoogleAIStudioApiClient,
  createSecureVertexAIApiClient,
  rewriteGoogleAIStudioUrl,
} from "../../../packages/shared/src/server/llm/googleSecureApiClient";
import { GoogleAuth } from "google-auth-library";

describe("Google AI Studio secure API client", () => {
  const originalWhitelistedHosts = env.LANGFUSE_LLM_CONNECTION_WHITELISTED_HOST;
  const originalCloudRegion = process.env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION;

  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION;
    env.LANGFUSE_LLM_CONNECTION_WHITELISTED_HOST = [
      "example.com",
      "us-central1-aiplatform.googleapis.com",
    ];
  });

  afterEach(() => {
    vi.restoreAllMocks();
    env.LANGFUSE_LLM_CONNECTION_WHITELISTED_HOST = originalWhitelistedHosts;
    if (originalCloudRegion === undefined) {
      delete process.env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION;
    } else {
      process.env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = originalCloudRegion;
    }
  });

  test.each([
    {
      name: "custom base URL",
      requestUrl:
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
      baseURL: "https://example.com/google",
      expectedUrl:
        "https://example.com/google/v1beta/models/gemini-2.5-flash:generateContent",
    },
    {
      name: "opaque custom base URL prefix",
      requestUrl:
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:streamGenerateContent?alt=sse",
      baseURL:
        "https://86c599932057.ngrok.app?url=https://generativelanguage.googleapis.com",
      expectedUrl:
        "https://86c599932057.ngrok.app?url=https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:streamGenerateContent?alt=sse",
    },
    {
      name: "non-Google URL",
      requestUrl: "https://other.example.com/v1beta/models/model:generate",
      baseURL: "https://example.com/google",
      expectedUrl: "https://other.example.com/v1beta/models/model:generate",
    },
  ])("rewrites $name", ({ requestUrl, baseURL, expectedUrl }) => {
    expect(rewriteGoogleAIStudioUrl(requestUrl, baseURL)).toBe(expectedUrl);
  });

  test("fetches through the rewritten URL with API key auth", async () => {
    const dispatcher = {};
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const client = createSecureGoogleAIStudioApiClient({
      apiKey: "google-api-key",
      baseURL: "https://example.com/google",
      dispatcher,
      whitelist: {
        hosts: ["example.com"],
        ips: [],
        ip_ranges: [],
      },
    });

    await client.fetch(
      new Request(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ contents: [] }),
        },
      ),
    );

    expect(fetchMock).toHaveBeenCalledWith(
      "https://example.com/google/v1beta/models/gemini-2.5-flash:generateContent",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ contents: [] }),
      }),
    );

    const [, requestOptions] = fetchMock.mock.calls[0];
    expect(new Headers(requestOptions?.headers).get("X-Goog-Api-Key")).toBe(
      "google-api-key",
    );
    expect(
      (requestOptions as RequestInit & { dispatcher?: unknown }).dispatcher,
    ).toBe(dispatcher);
  });

  test("fetchLLMCompletion uses the secure client for Google AI Studio", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          candidates: [
            {
              content: { parts: [{ text: "4" }] },
              finishReason: "STOP",
            },
          ],
          usageMetadata: {
            promptTokenCount: 1,
            candidatesTokenCount: 1,
            totalTokenCount: 2,
          },
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      ),
    );

    const completion = await fetchLLMCompletion({
      streaming: false,
      messages: [
        {
          role: "user",
          content: "What is 2+2? Answer only with the number.",
          type: ChatMessageType.PublicAPICreated,
        },
      ],
      modelParams: {
        provider: "google-ai-studio",
        adapter: LLMAdapter.GoogleAIStudio,
        model: "gemini-2.5-flash",
        temperature: 0,
        max_tokens: 10,
      },
      llmConnection: {
        secretKey: encrypt("google-api-key"),
        baseURL: "https://example.com/google",
      },
    });

    expect(completion).toEqual({ text: "4" });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://example.com/google/v1beta/models/gemini-2.5-flash:generateContent",
      expect.any(Object),
    );
  });

  test("Vertex AI client authenticates and uses secure fetch", async () => {
    const dispatcher = {};
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.spyOn(GoogleAuth.prototype, "getProjectId").mockResolvedValue(
      "test-project",
    );
    vi.spyOn(GoogleAuth.prototype, "getRequestHeaders").mockResolvedValue(
      new Headers({ authorization: "Bearer test-token" }),
    );
    const client = createSecureVertexAIApiClient({
      dispatcher,
      whitelist: {
        hosts: ["us-central1-aiplatform.googleapis.com"],
        ips: [],
        ip_ranges: [],
      },
    });

    await client.fetch(
      new Request(
        "https://us-central1-aiplatform.googleapis.com/v1/projects/test-project/locations/us-central1/publishers/google/models/gemini-2.5-flash:generateContent",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ contents: [] }),
        },
      ),
    );

    expect(fetchMock).toHaveBeenCalledWith(
      "https://us-central1-aiplatform.googleapis.com/v1/projects/test-project/locations/us-central1/publishers/google/models/gemini-2.5-flash:generateContent",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ contents: [] }),
      }),
    );
    const [, requestOptions] = fetchMock.mock.calls[0];
    expect(new Headers(requestOptions?.headers).get("authorization")).toBe(
      "Bearer test-token",
    );
    expect(
      (requestOptions as RequestInit & { dispatcher?: unknown }).dispatcher,
    ).toBe(dispatcher);
  });
});
