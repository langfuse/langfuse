import { describe, expect, it } from "vitest";

import {
  OtelIngestionProcessor,
  type ResourceSpan,
} from "./OtelIngestionProcessor";

describe("OtelIngestionProcessor generic gen_ai usage extraction", () => {
  it("extracts cache creation TTL breakdown without double counting", () => {
    const batch: ResourceSpan[] = [
      {
        scopeSpans: [
          {
            scope: { name: "some-otel-sdk", version: "1.0.0" },
            spans: [
              {
                traceId: Buffer.from("0123456789abcdef0123456789abcdef", "hex"),
                spanId: Buffer.from("0123456789abcdef", "hex"),
                name: "chat anthropic",
                kind: 3,
                startTimeUnixNano: "1752384000000000000",
                endTimeUnixNano: "1752384001000000000",
                attributes: [
                  {
                    key: "gen_ai.usage.input_tokens",
                    value: { intValue: 10000 },
                  },
                  {
                    key: "gen_ai.usage.output_tokens",
                    value: { intValue: 500 },
                  },
                  {
                    key: "gen_ai.usage.total_tokens",
                    value: { intValue: 10500 },
                  },
                  {
                    key: "gen_ai.usage.cache_read.input_tokens",
                    value: { intValue: 5000 },
                  },
                  {
                    key: "gen_ai.usage.cache_creation.input_tokens",
                    value: { intValue: 2089 },
                  },
                  {
                    key: "gen_ai.usage.cache_creation.5m_input_tokens",
                    value: { intValue: 2089 },
                  },
                  {
                    key: "gen_ai.usage.cache_creation.1h_input_tokens",
                    value: { intValue: 0 },
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
      sdkName: "some-otel-sdk",
      sdkVersion: "1.0.0",
    }).processToEvent(batch);

    expect(events).toHaveLength(1);
    const usage = events[0].providedUsageDetails;

    // TTL breakdown extracted as separate keys
    expect(usage.input_cache_creation_5m).toBe(2089);
    expect(usage.input_cache_creation_1h).toBe(0);

    // Total adjusted to avoid double counting the breakdown
    expect(usage.input_cache_creation).toBe(0);

    // Raw breakdown keys must not leak through the passthrough
    expect(usage).not.toHaveProperty("cache_creation.5m_input_tokens");
    expect(usage).not.toHaveProperty("cache_creation.1h_input_tokens");

    // Input subtracts the full cache creation total
    expect(usage.input).toBe(10000 - 5000 - 2089);

    // Cache read
    expect(usage.input_cached_tokens).toBe(5000);

    // Output and total
    expect(usage.output).toBe(500);
    expect(usage.total).toBe(10500);
  });

  it("handles cache creation without TTL breakdown", () => {
    const batch: ResourceSpan[] = [
      {
        scopeSpans: [
          {
            scope: { name: "some-otel-sdk", version: "1.0.0" },
            spans: [
              {
                traceId: Buffer.from("0123456789abcdef0123456789abcdef", "hex"),
                spanId: Buffer.from("0123456789abcdef", "hex"),
                name: "chat anthropic",
                kind: 3,
                startTimeUnixNano: "1752384000000000000",
                endTimeUnixNano: "1752384001000000000",
                attributes: [
                  {
                    key: "gen_ai.usage.input_tokens",
                    value: { intValue: 10000 },
                  },
                  {
                    key: "gen_ai.usage.output_tokens",
                    value: { intValue: 500 },
                  },
                  {
                    key: "gen_ai.usage.cache_creation.input_tokens",
                    value: { intValue: 2089 },
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
      sdkName: "some-otel-sdk",
      sdkVersion: "1.0.0",
    }).processToEvent(batch);

    expect(events).toHaveLength(1);
    const usage = events[0].providedUsageDetails;

    // Without breakdown, the total is stored as-is
    expect(usage.input_cache_creation).toBe(2089);

    // No breakdown keys
    expect(usage).not.toHaveProperty("input_cache_creation_5m");
    expect(usage).not.toHaveProperty("input_cache_creation_1h");

    // Input subtracts the full cache creation total
    expect(usage.input).toBe(10000 - 2089);
  });
});
