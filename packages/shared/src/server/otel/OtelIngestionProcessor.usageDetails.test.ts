import { describe, expect, it } from "vitest";

import {
  OtelIngestionProcessor,
  type ResourceSpan,
} from "./OtelIngestionProcessor";

/**
 * Builds a single-span batch under the "ai" instrumentation scope with the
 * provided GenAI usage attributes.
 */
function buildAiUsageBatch(
  usageAttributes: Record<string, number>,
  extraAttributes: Array<{ key: string; value: { stringValue: string } }> = [],
): ResourceSpan[] {
  return [
    {
      scopeSpans: [
        {
          scope: { name: "ai", version: "7.0.0" },
          spans: [
            {
              traceId: Buffer.from("0123456789abcdef0123456789abcdef", "hex"),
              spanId: Buffer.from("0123456789abcdef", "hex"),
              name: "chat gemini-2.5-pro",
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
                  value: { stringValue: "gemini-2.5-pro" },
                },
                ...Object.entries(usageAttributes).map(([key, value]) => ({
                  key,
                  value: { intValue: value },
                })),
                ...extraAttributes,
              ],
              status: {},
            },
          ],
        },
      ],
    },
  ];
}

function processUsageBatch(batch: ResourceSpan[]) {
  const events = new OtelIngestionProcessor({
    projectId: "project-1",
    publicKey: "pk-test",
    sdkName: "ai",
    sdkVersion: "7.0.0",
  }).processToEvent(batch);

  expect(events).toHaveLength(1);
  return events[0].providedUsageDetails;
}

describe("OtelIngestionProcessor usage details", () => {
  it("maps standardized gen_ai.usage.cache_read.input_tokens for the ai scope", () => {
    // AI SDK v7 (Gemini/Google) emits semconv cache attributes under scope "ai"
    // without provider-specific ai.usage.* / providerMetadata cache fields.
    const batch = buildAiUsageBatch({
      "gen_ai.usage.input_tokens": 572457,
      "gen_ai.usage.output_tokens": 617,
      "gen_ai.usage.cache_read.input_tokens": 564696,
    });

    const usageDetails = processUsageBatch(batch);

    expect(usageDetails).toMatchObject({
      input: 7761, // 572457 - 564696
      input_cached_tokens: 564696,
      output: 617,
    });
  });

  it("maps standardized gen_ai.usage.cache_creation.input_tokens for the ai scope", () => {
    const batch = buildAiUsageBatch({
      "gen_ai.usage.input_tokens": 572457,
      "gen_ai.usage.output_tokens": 617,
      "gen_ai.usage.cache_creation.input_tokens": 100000,
    });

    const usageDetails = processUsageBatch(batch);

    expect(usageDetails).toMatchObject({
      input: 472457, // 572457 - 100000
      input_cache_creation: 100000,
      output: 617,
    });
  });

  it("keeps provider metadata cache values in precedence over the semconv fallback", () => {
    // When both providerMetadata (openai) and the standardized semconv cache
    // attribute are present, the ??= fallback must keep the providerMetadata value.
    const batch = buildAiUsageBatch(
      {
        "gen_ai.usage.input_tokens": 1000,
        "gen_ai.usage.output_tokens": 50,
        "gen_ai.usage.cache_read.input_tokens": 900,
      },
      [
        {
          key: "ai.response.providerMetadata",
          value: {
            stringValue: JSON.stringify({
              openai: { cachedPromptTokens: 100 },
            }),
          },
        },
      ],
    );

    const usageDetails = processUsageBatch(batch);

    expect(usageDetails).toMatchObject({
      input: 900, // 1000 - 100 (providerMetadata value wins)
      input_cached_tokens: 100,
      output: 50,
    });
  });
});
