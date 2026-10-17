import { describe, expect, it } from "vitest";

import {
  OtelIngestionProcessor,
  type ResourceSpan,
} from "./OtelIngestionProcessor";

const cacheSplit = {
  ephemeral_5m_input_tokens: 1000,
  ephemeral_1h_input_tokens: 500,
};

function extractUsageDetails(params: {
  genAiCacheCreation?: number;
  anthropicUsage: Record<string, unknown>;
}) {
  const batch: ResourceSpan[] = [
    {
      scopeSpans: [
        {
          scope: { name: "openinference.instrumentation.google_adk" },
          spans: [
            {
              traceId: Buffer.from("0123456789abcdef0123456789abcdef", "hex"),
              spanId: Buffer.from("0123456789abcdef", "hex"),
              name: "anthropic-cache-write",
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
                  value: { stringValue: "claude-sonnet-4" },
                },
                {
                  key: "gen_ai.usage.input_tokens",
                  value: { intValue: 5000 },
                },
                ...(params.genAiCacheCreation === undefined
                  ? []
                  : [
                      {
                        key: "gen_ai.usage.cache_creation.input_tokens",
                        value: { intValue: params.genAiCacheCreation },
                      },
                    ]),
                {
                  key: "ai.response.providerMetadata",
                  value: {
                    stringValue: JSON.stringify({
                      anthropic: { usage: params.anthropicUsage },
                    }),
                  },
                },
              ],
              status: {},
            },
          ],
        },
      ],
    },
  ];

  const events = new OtelIngestionProcessor({
    projectId: "project-1",
    publicKey: "pk-test",
    sdkName: "google_adk",
    sdkVersion: "0.1.6",
  }).processToEvent(batch);

  expect(events).toHaveLength(1);
  return events[0].providedUsageDetails;
}

describe("OtelIngestionProcessor Anthropic cache usage", () => {
  it("splits gen_ai cache writes without subtracting input twice", () => {
    const usage = extractUsageDetails({
      genAiCacheCreation: 2000,
      anthropicUsage: {
        cache_creation_input_tokens: 2000,
        cache_creation: cacheSplit,
      },
    });

    expect(usage).toMatchObject({
      input: 3000,
      input_cache_creation: 500,
      input_cache_creation_5m: 1000,
      input_cache_creation_1h: 500,
    });
  });

  it("uses provider metadata when gen_ai sends no cache tokens", () => {
    const usage = extractUsageDetails({
      anthropicUsage: {
        cache_read_input_tokens: 1500,
        cache_creation_input_tokens: 2000,
        cache_creation: cacheSplit,
      },
    });

    expect(usage).toMatchObject({
      input: 1500,
      input_cached_tokens: 1500,
      input_cache_creation: 500,
      input_cache_creation_5m: 1000,
      input_cache_creation_1h: 500,
    });
  });

  it("keeps the generic cache-write total when the metadata split exceeds it", () => {
    const usage = extractUsageDetails({
      genAiCacheCreation: 2000,
      anthropicUsage: {
        cache_creation_input_tokens: 2000,
        cache_creation: {
          ephemeral_5m_input_tokens: 1500,
          ephemeral_1h_input_tokens: 1000,
        },
      },
    });

    expect(usage).toMatchObject({
      input: 3000,
      input_cache_creation: 2000,
    });
    expect(usage).not.toHaveProperty("input_cache_creation_5m");
    expect(usage).not.toHaveProperty("input_cache_creation_1h");
  });
});
