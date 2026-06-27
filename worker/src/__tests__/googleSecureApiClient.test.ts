import { beforeEach, describe, expect, test, vi } from "vitest";
import {
  createSecureVertexAIApiClient,
  rewriteGoogleAIStudioUrl,
  rewriteVertexAIUrl,
} from "../../../packages/shared/src/server/llm/googleSecureApiClient";

// Capture the low-level secured fetch so the gateway-mode Vertex client can be
// exercised without making a real network call.
const { fetchSecureLlmUrlMock } = vi.hoisted(() => ({
  fetchSecureLlmUrlMock: vi.fn(),
}));
vi.mock("../../../packages/shared/src/server/llm/secureLlmFetch", () => ({
  fetchSecureLlmUrl: fetchSecureLlmUrlMock,
}));

// Stub GoogleAuth so project-id resolution is deterministic: an explicit
// projectId is returned as-is (service-account key path), otherwise we emulate
// ADC detection (GKE/Cloud Run/metadata) returning a detected project.
vi.mock("google-auth-library", () => ({
  GoogleAuth: class {
    private readonly projectId?: string;
    constructor(options?: { projectId?: string }) {
      this.projectId = options?.projectId;
    }
    async getProjectId() {
      return this.projectId ?? "adc-detected-project-id";
    }
  },
}));

// Real Google Vertex AI and AI Studio request paths are exercised end-to-end
// in llmConnections.test.ts against live APIs. This file keeps the pure
// URL-rewrite unit cases that the live tests can't easily express.

describe("rewriteGoogleAIStudioUrl", () => {
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
    {
      name: "unset base URL",
      requestUrl:
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
      baseURL: undefined,
      expectedUrl:
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
    },
  ])("rewrites $name", ({ requestUrl, baseURL, expectedUrl }) => {
    expect(rewriteGoogleAIStudioUrl(requestUrl, baseURL)).toBe(expectedUrl);
  });
});

describe("rewriteVertexAIUrl", () => {
  test.each([
    {
      name: "regional Vertex host through a gateway",
      requestUrl:
        "https://us-central1-aiplatform.googleapis.com/v1/projects/my-project/locations/us-central1/publishers/google/models/gemini-2.5-flash:generateContent",
      baseURL: "https://gateway.example.com/vertex",
      expectedUrl:
        "https://gateway.example.com/vertex/v1/projects/my-project/locations/us-central1/publishers/google/models/gemini-2.5-flash:generateContent",
    },
    {
      name: "global Vertex host through a gateway",
      requestUrl:
        "https://aiplatform.googleapis.com/v1/projects/my-project/locations/global/publishers/google/models/gemini-2.5-flash:streamGenerateContent?alt=sse",
      baseURL: "https://gateway.example.com/vertex",
      expectedUrl:
        "https://gateway.example.com/vertex/v1/projects/my-project/locations/global/publishers/google/models/gemini-2.5-flash:streamGenerateContent?alt=sse",
    },
    {
      name: "base URL with a trailing slash (normalized)",
      requestUrl:
        "https://europe-west4-aiplatform.googleapis.com/v1/projects/p/locations/europe-west4/publishers/google/models/m:generateContent",
      baseURL: "https://gateway.example.com/vertex/",
      expectedUrl:
        "https://gateway.example.com/vertex/v1/projects/p/locations/europe-west4/publishers/google/models/m:generateContent",
    },
    {
      name: "non-Vertex host (left untouched)",
      requestUrl: "https://other.example.com/v1/projects/p/models/m:generate",
      baseURL: "https://gateway.example.com/vertex",
      expectedUrl: "https://other.example.com/v1/projects/p/models/m:generate",
    },
    {
      name: "lookalike host that only contains the suffix (left untouched)",
      requestUrl:
        "https://aiplatform.googleapis.com.evil.example.com/v1/projects/p/models/m:generate",
      baseURL: "https://gateway.example.com/vertex",
      expectedUrl:
        "https://aiplatform.googleapis.com.evil.example.com/v1/projects/p/models/m:generate",
    },
    {
      name: "unset base URL (left untouched)",
      requestUrl:
        "https://us-central1-aiplatform.googleapis.com/v1/projects/p/locations/us-central1/publishers/google/models/m:generateContent",
      baseURL: undefined,
      expectedUrl:
        "https://us-central1-aiplatform.googleapis.com/v1/projects/p/locations/us-central1/publishers/google/models/m:generateContent",
    },
  ])("rewrites $name", ({ requestUrl, baseURL, expectedUrl }) => {
    expect(rewriteVertexAIUrl(requestUrl, baseURL)).toBe(expectedUrl);
  });
});

describe("createSecureVertexAIApiClient gateway mode", () => {
  const baseURL = "https://gateway.example.com/vertex";
  const extraHeaders = { "X-Gateway-Key": "secret-key" };

  beforeEach(() => {
    fetchSecureLlmUrlMock.mockReset();
    fetchSecureLlmUrlMock.mockResolvedValue(new Response("{}"));
  });

  test("never reports an API key so LangChain skips bearer auth", () => {
    const client = createSecureVertexAIApiClient({
      baseURL,
      authOptions: { projectId: "my-project" },
    });

    expect(client.hasApiKey()).toBe(false);
  });

  test("resolves the configured project id", async () => {
    const client = createSecureVertexAIApiClient({
      baseURL,
      authOptions: { projectId: "my-project" },
    });

    await expect(client.getProjectId()).resolves.toBe("my-project");
  });

  test("resolves the project id via ADC when none is configured", async () => {
    const client = createSecureVertexAIApiClient({ baseURL });

    await expect(client.getProjectId()).resolves.toBe(
      "adc-detected-project-id",
    );
  });

  test("routes through the gateway, strips the GCP bearer, and injects extra headers", async () => {
    const client = createSecureVertexAIApiClient({
      baseURL,
      extraHeaders,
      authOptions: { projectId: "my-project" },
    });

    const request = new Request(
      "https://us-central1-aiplatform.googleapis.com/v1/projects/my-project/locations/us-central1/publishers/google/models/gemini-2.5-flash:generateContent",
      {
        method: "POST",
        headers: {
          authorization: "Bearer google-oauth-token",
          "content-type": "application/json",
        },
        body: JSON.stringify({ contents: [] }),
      },
    );

    await client.fetch(request);

    expect(fetchSecureLlmUrlMock).toHaveBeenCalledTimes(1);
    const [url, options, secureOptions] = fetchSecureLlmUrlMock.mock.calls[0];

    expect(url).toBe(
      "https://gateway.example.com/vertex/v1/projects/my-project/locations/us-central1/publishers/google/models/gemini-2.5-flash:generateContent",
    );

    const headers = options.headers as Headers;
    expect(headers.get("authorization")).toBeNull();
    expect(headers.get("X-Gateway-Key")).toBe("secret-key");

    expect(secureOptions.additionalSensitiveHeaders).toContain("X-Gateway-Key");
  });
});
