import { afterEach, describe, expect, test, vi } from "vitest";
import { encrypt } from "../../../packages/shared/src/encryption";
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

describe("Google AI Studio secure API client", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("rewrites generated Google AI Studio URLs to a custom base URL", () => {
    const rewrittenUrl = rewriteGoogleAIStudioUrl(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
      "https://example.com/google",
    );

    expect(rewrittenUrl).toBe(
      "https://example.com/google/v1beta/models/gemini-2.5-flash:generateContent",
    );
  });

  test("uses the custom base URL as an opaque prefix", () => {
    const rewrittenUrl = rewriteGoogleAIStudioUrl(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:streamGenerateContent?alt=sse",
      "https://86c599932057.ngrok.app?url=https://generativelanguage.googleapis.com",
    );

    expect(rewrittenUrl).toBe(
      "https://86c599932057.ngrok.app?url=https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:streamGenerateContent?alt=sse",
    );
  });

  test("keeps non-Google URLs unchanged", () => {
    const requestUrl = "https://other.example.com/v1beta/models/model:generate";

    expect(
      rewriteGoogleAIStudioUrl(requestUrl, "https://example.com/google"),
    ).toBe(requestUrl);
  });

  test("fetches through the rewritten URL with API key auth", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const client = createSecureGoogleAIStudioApiClient({
      apiKey: "google-api-key",
      baseURL: "https://example.com/google",
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
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const client = createSecureVertexAIApiClient({
      authClient: {
        getProjectId: async () => "test-project",
        getRequestHeaders: async () =>
          new Headers({ authorization: "Bearer test-token" }),
      },
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
  });
});
