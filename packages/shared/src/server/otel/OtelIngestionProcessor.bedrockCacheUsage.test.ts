import { describe, expect, it } from "vitest";

import {
  OtelIngestionProcessor,
  type ResourceSpan,
} from "./OtelIngestionProcessor";

type Attribute = {
  key: string;
  value: { intValue?: number; stringValue?: string };
};

const int = (key: string, value: number): Attribute => ({
  key,
  value: { intValue: value },
});

const providerMetadata = (usage: Record<string, number>): Attribute => ({
  key: "ai.response.providerMetadata",
  value: { stringValue: JSON.stringify({ bedrock: { usage } }) },
});

const providedUsageDetails = (attributes: Attribute[]) => {
  const batch: ResourceSpan[] = [
    {
      scopeSpans: [
        {
          scope: { name: "ai", version: "7.0.173" },
          spans: [
            {
              traceId: Buffer.from("0123456789abcdef0123456789abcdef", "hex"),
              spanId: Buffer.from("0123456789abcdef", "hex"),
              name: "ai.generateText.doGenerate",
              kind: 3,
              startTimeUnixNano: "1752384000000000000",
              endTimeUnixNano: "1752384001000000000",
              attributes,
              status: {},
            },
          ],
        },
      ],
    },
  ];

  return new OtelIngestionProcessor({
    projectId: "project-1",
    publicKey: "pk-test",
    sdkName: "ai",
    sdkVersion: "7.0.173",
  }).processToEvent(batch)[0].providedUsageDetails;
};

describe("OtelIngestionProcessor Vercel AI SDK Bedrock cache writes", () => {
  // Attributes captured from generateText() against a mocked Bedrock Converse
  // response of inputTokens=10, cacheReadInputTokens=300,
  // cacheWriteInputTokens=2000.
  it.each([
    {
      sdk: "ai@6/ai@7, input includes cache reads and writes",
      attributes: [
        int("gen_ai.usage.input_tokens", 2310),
        int("gen_ai.usage.output_tokens", 5),
        int("ai.usage.cachedInputTokens", 300),
        int("ai.usage.inputTokenDetails.cacheReadTokens", 300),
        int("ai.usage.inputTokenDetails.cacheWriteTokens", 2000),
        providerMetadata({ cacheWriteInputTokens: 2000 }),
      ],
      expected: {
        input: 10,
        output: 5,
        input_cached_tokens: 300,
        input_cache_write: 2000,
      },
    },
    {
      sdk: "ai@5, input already excludes cache tokens",
      attributes: [
        int("gen_ai.usage.input_tokens", 10),
        int("gen_ai.usage.output_tokens", 5),
        providerMetadata({ cacheWriteInputTokens: 2000 }),
      ],
      expected: { input: 10, output: 5, input_cache_write: 2000 },
    },
  ])("$sdk", ({ attributes, expected }) => {
    expect(providedUsageDetails(attributes)).toEqual(expected);
  });
});
