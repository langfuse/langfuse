import { describe, expect, it } from "vitest";

import {
  OtelIngestionProcessor,
  type ResourceSpan,
} from "./OtelIngestionProcessor";

type Attribute = { key: string; value: Record<string, unknown> };

const int = (key: string, value: number): Attribute => ({
  key,
  value: { intValue: value },
});

// Anthropic usage as the Vercel AI SDK forwards it, for a call that wrote its cache with the 1-hour TTL.
const anthropicMetadata: Attribute = {
  key: "ai.response.providerMetadata",
  value: {
    stringValue: JSON.stringify({
      anthropic: {
        usage: {
          input_tokens: 2,
          cache_read_input_tokens: 47105,
          cache_creation_input_tokens: 1076,
          cache_creation: {
            ephemeral_5m_input_tokens: 0,
            ephemeral_1h_input_tokens: 1076,
          },
          output_tokens: 714,
        },
      },
    }),
  },
};

function usageOf(scope: string, attributes: Attribute[]) {
  const batch: ResourceSpan[] = [
    {
      scopeSpans: [
        {
          scope: { name: scope, version: "7.0.0" },
          spans: [
            {
              traceId: Buffer.from("0123456789abcdef0123456789abcdef", "hex"),
              spanId: Buffer.from("0123456789abcdef", "hex"),
              name: "chat claude-opus-5-5",
              kind: 3,
              startTimeUnixNano: "1752384000000000000",
              endTimeUnixNano: "1752384001000000000",
              attributes: [
                {
                  key: "gen_ai.operation.name",
                  value: { stringValue: "chat" },
                },
                {
                  key: "gen_ai.request.model",
                  value: { stringValue: "claude-opus-5-5" },
                },
                int("gen_ai.usage.input_tokens", 48183),
                int("gen_ai.usage.output_tokens", 714),
                ...attributes,
              ],
              status: {},
            },
          ],
        },
      ],
    },
  ];
  const [event] = new OtelIngestionProcessor({
    projectId: "project-1",
    publicKey: "pk-test",
    sdkName: "ai",
    sdkVersion: "7.0.0",
  }).processToEvent(batch);
  return event.providedUsageDetails;
}

describe("OtelIngestionProcessor Anthropic cache usage", () => {
  it("splits gen_ai cache writes into their TTLs from Anthropic provider metadata, without counting them twice", () => {
    expect(
      usageOf("gen_ai", [
        int("gen_ai.usage.cache_read.input_tokens", 47105),
        int("gen_ai.usage.cache_creation.input_tokens", 1076),
        anthropicMetadata,
      ]),
    ).toMatchObject({
      input: 2,
      input_cached_tokens: 47105,
      input_cache_creation: 0,
      input_cache_creation_5m: 0,
      input_cache_creation_1h: 1076,
      output: 714,
    });
  });

  it("reads AI SDK 7 gen_ai cache attributes under the ai scope", () => {
    expect(
      usageOf("ai", [
        int("gen_ai.usage.cache_read.input_tokens", 47105),
        int("gen_ai.usage.cache_creation.input_tokens", 1076),
      ]),
    ).toMatchObject({
      input: 2,
      input_cached_tokens: 47105,
      input_cache_creation: 1076,
    });
  });

  it("takes cache tokens from Anthropic provider metadata when no gen_ai cache attributes are sent", () => {
    expect(
      usageOf("openinference.instrumentation.google_adk", [anthropicMetadata]),
    ).toMatchObject({
      input: 2,
      input_cached_tokens: 47105,
      input_cache_creation: 0,
      input_cache_creation_1h: 1076,
    });
  });
});
