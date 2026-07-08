import { describe, expect, test } from "vitest";
import { rewriteGoogleAIStudioUrl } from "../../../packages/shared/src/server/llm/googleSecureApiClient";

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
