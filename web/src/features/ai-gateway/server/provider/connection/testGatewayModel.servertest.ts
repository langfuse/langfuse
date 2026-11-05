import { describe, expect, it, vi } from "vitest";

import { encodeBedrockCredential } from "@/src/features/ai-gateway/server/provider/bedrock";
import { testGatewayModel } from "@/src/features/ai-gateway/server/provider/connection/testGatewayModel";

describe("testGatewayModel", () => {
  it("tests a Bedrock Claude model on the Anthropic route and surfaces the provider message", async () => {
    const fetcher = vi.fn<typeof fetch>(
      async () =>
        new Response(JSON.stringify({ message: "Model is not available" }), {
          status: 400,
        }),
    );

    const result = await testGatewayModel({
      provider: "BEDROCK",
      config: { region: "eu-central-1" },
      credential: encodeBedrockCredential("bedrock-key"),
      model: "eu.anthropic.claude-opus-4-8",
      fetcher,
    });

    expect(result).toEqual({
      success: false,
      error: "400: Model is not available",
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

    const result = await testGatewayModel({
      provider: "BEDROCK",
      config: { region: "eu-central-1" },
      credential: encodeBedrockCredential("bedrock-key"),
      model:
        "arn:aws:bedrock:eu-central-1:123456789012:application-inference-profile/abc123",
      fetcher,
    });

    expect(result).toEqual({ success: true });
    expect(fetcher.mock.calls.map(([url]) => String(url))).toEqual([
      "https://bedrock-runtime.eu-central-1.amazonaws.com/anthropic/v1/messages",
      "https://bedrock-runtime.eu-central-1.amazonaws.com/openai/v1/chat/completions",
    ]);
  });
});
