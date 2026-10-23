import { readFileSync } from "node:fs";
import { createAmazonBedrock } from "ai-sdk-amazon-bedrock-v4";
import { expect, it } from "vitest";

it("parses a Bedrock tool call whose start event omits input", async () => {
  // ConverseStream: start has only toolUseId/name; the delta supplies input "{}".
  const response = readFileSync(
    new URL("./__fixtures__/bedrock-tool-call.eventstream", import.meta.url),
  );
  const bedrock = createAmazonBedrock({
    region: "us-east-1",
    accessKeyId: "test-access-key",
    secretAccessKey: "test-secret-key",
    fetch: async () =>
      new Response(response, {
        headers: { "content-type": "application/vnd.amazon.eventstream" },
      }),
  });
  const { stream } = await bedrock(
    "anthropic.claude-sonnet-4-20250514-v1:0",
  ).doStream({
    prompt: [
      { role: "user", content: [{ type: "text", text: "My timezone?" }] },
    ],
  });
  const chunks = await Array.fromAsync(stream);

  expect(chunks.filter((chunk) => chunk.type === "error")).toEqual([]);
  expect(chunks).toContainEqual({
    type: "tool-call",
    toolCallId: "call-context",
    toolName: "getRequestContext",
    input: "{}",
  });
});
