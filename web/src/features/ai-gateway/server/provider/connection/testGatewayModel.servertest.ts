import { describe, expect, it, vi } from "vitest";

import { getGatewayFetch } from "@/src/features/ai-gateway/server/provider/getGatewayFetch";

import { encodeBedrockCredential } from "@/src/features/ai-gateway/server/provider/bedrock";
import { testGatewayModel } from "@/src/features/ai-gateway/server/provider/connection/testGatewayModel";

vi.mock("@/src/features/ai-gateway/server/provider/getGatewayFetch", () => ({
  getGatewayFetch: vi.fn(),
}));

describe("testGatewayModel", () => {
  it("tests a Bedrock Claude model on the Anthropic route and surfaces the provider message", async () => {
    const fetcher = vi.fn<typeof fetch>(
      async () =>
        new Response(JSON.stringify({ message: "Model is not available" }), {
          status: 400,
        }),
    );

    vi.mocked(getGatewayFetch).mockReturnValue(fetcher);
    const result = await testGatewayModel({
      provider: "BEDROCK",
      config: { region: "eu-central-1" },
      baseURL: null,
      extraHeaders: {},
      credential: encodeBedrockCredential("bedrock-key"),
      model: "eu.anthropic.claude-opus-4-8",
    });

    expect(result).toEqual({
      success: false,
      status: "400 Bad Request",
      error: "Model is not available",
    });
    const [url, init] = fetcher.mock.calls[0] ?? [];
    expect(url).toBe(
      "https://bedrock-runtime.eu-central-1.amazonaws.com/anthropic/v1/messages",
    );
    expect(init?.headers).toMatchObject({ "x-api-key": "bedrock-key" });
  });

  it("tries each route for an application inference profile ARN until one answers", async () => {
    const fetcher = vi.fn<typeof fetch>(async (input) =>
      String(input).endsWith("/anthropic/v1/messages")
        ? new Response(JSON.stringify({ message: "Unsupported" }), {
            status: 404,
          })
        : new Response("{}", { status: 200 }),
    );

    vi.mocked(getGatewayFetch).mockReturnValue(fetcher);
    const result = await testGatewayModel({
      provider: "BEDROCK",
      config: { region: "eu-central-1" },
      baseURL: null,
      extraHeaders: {},
      credential: encodeBedrockCredential("bedrock-key"),
      model:
        "arn:aws:bedrock:eu-central-1:123456789012:application-inference-profile/abc123",
    });

    expect(result).toEqual({ success: true, durationMs: expect.any(Number) });
    expect(fetcher.mock.calls.map(([url]) => String(url))).toEqual([
      "https://bedrock-runtime.eu-central-1.amazonaws.com/anthropic/v1/messages",
      "https://bedrock-runtime.eu-central-1.amazonaws.com/openai/v1/chat/completions",
    ]);
  });

  it("accepts an OpenAI model that only serves Chat Completions", async () => {
    const fetcher = vi.fn<typeof fetch>(async (input) =>
      String(input).endsWith("/responses")
        ? new Response(JSON.stringify({ message: "Unsupported" }), {
            status: 400,
          })
        : new Response("{}", { status: 200 }),
    );

    vi.mocked(getGatewayFetch).mockReturnValue(fetcher);
    const result = await testGatewayModel({
      provider: "OPENAI",
      config: {},
      baseURL: null,
      extraHeaders: {},
      credential: "openai-key",
      model: "ft:gpt-4o-mini:acme::abc123",
    });

    expect(result).toEqual({ success: true, durationMs: expect.any(Number) });
    expect(fetcher.mock.calls.map(([url]) => String(url))).toEqual([
      "https://api.openai.com/v1/responses",
      "https://api.openai.com/v1/chat/completions",
    ]);
  });

  it("sends OpenAI tests to a custom base URL without letting extra headers replace the credential", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response("{}"));

    vi.mocked(getGatewayFetch).mockReturnValue(fetcher);
    const result = await testGatewayModel({
      provider: "OPENAI",
      config: null,
      baseURL: "https://llm-proxy.example/openai/v1",
      extraHeaders: { "x-team": "research", authorization: "Bearer other" },
      credential: "sk-test",
      model: "gpt-4.1",
    });

    expect(result).toEqual({ success: true, durationMs: expect.any(Number) });
    const [url, init] = fetcher.mock.calls[0] ?? [];
    expect(url).toBe("https://llm-proxy.example/openai/v1/responses");
    expect(init?.headers).toMatchObject({
      "x-team": "research",
      authorization: "Bearer sk-test",
    });
  });
});
