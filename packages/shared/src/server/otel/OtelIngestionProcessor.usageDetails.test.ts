import { describe, expect, it } from "vitest";

import {
  OtelIngestionProcessor,
  type ResourceSpan,
} from "./OtelIngestionProcessor";

describe("OtelIngestionProcessor usage details reasoning tokens", () => {
  it("normalizes gen_ai.usage.reasoning_tokens and adjusts output tokens", () => {
    const batch: ResourceSpan[] = [
      {
        scopeSpans: [
          {
            scope: {
              name: "openinference.instrumentation.openai",
              version: "0.1.0",
            },
            spans: [
              {
                traceId: Buffer.from("0123456789abcdef0123456789abcdef", "hex"),
                spanId: Buffer.from("0123456789abcdef", "hex"),
                name: "chat o1-mini",
                kind: 3,
                startTimeUnixNano: "1752384000000000000",
                endTimeUnixNano: "1752384001000000000",
                attributes: [
                  {
                    key: "gen_ai.operation.name",
                    value: { stringValue: "chat" },
                  },
                  {
                    key: "gen_ai.usage.input_tokens",
                    value: { intValue: 100 },
                  },
                  {
                    key: "gen_ai.usage.output_tokens",
                    value: { intValue: 600 },
                  },
                  {
                    key: "gen_ai.usage.reasoning_tokens",
                    value: { intValue: 500 },
                  },
                  {
                    key: "gen_ai.usage.total_tokens",
                    value: { intValue: 700 },
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
      sdkName: "openinference",
      sdkVersion: "0.1.0",
    }).processToEvent(batch);

    expect(events).toHaveLength(1);
    expect(events[0].providedUsageDetails).toEqual({
      input: 100,
      output: 100, // 600 - 500
      output_reasoning_tokens: 500,
      total: 700,
    });
  });

  it("normalizes gen_ai.usage.reasoning.output_tokens and thoughts_tokens", () => {
    const batch: ResourceSpan[] = [
      {
        scopeSpans: [
          {
            scope: { name: "traceloop.instrumentation", version: "0.1.0" },
            spans: [
              {
                traceId: Buffer.from("0123456789abcdef0123456789abcdef", "hex"),
                spanId: Buffer.from("0123456789abcdef", "hex"),
                name: "chat gemini-2.0-flash-thinking",
                kind: 3,
                startTimeUnixNano: "1752384000000000000",
                endTimeUnixNano: "1752384001000000000",
                attributes: [
                  {
                    key: "gen_ai.operation.name",
                    value: { stringValue: "chat" },
                  },
                  {
                    key: "gen_ai.usage.prompt_tokens",
                    value: { intValue: 50 },
                  },
                  {
                    key: "gen_ai.usage.completion_tokens",
                    value: { intValue: 300 },
                  },
                  {
                    key: "gen_ai.usage.thoughts_tokens",
                    value: { intValue: 200 },
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
      sdkName: "traceloop",
      sdkVersion: "0.1.0",
    }).processToEvent(batch);

    expect(events).toHaveLength(1);
    expect(events[0].providedUsageDetails).toEqual({
      input: 50,
      output: 100, // 300 - 200
      output_reasoning_tokens: 200,
    });
  });

  it("normalizes llm.token_count.reasoning_tokens", () => {
    const batch: ResourceSpan[] = [
      {
        scopeSpans: [
          {
            scope: { name: "custom-otel", version: "1.0.0" },
            spans: [
              {
                traceId: Buffer.from("0123456789abcdef0123456789abcdef", "hex"),
                spanId: Buffer.from("0123456789abcdef", "hex"),
                name: "llm call",
                kind: 3,
                startTimeUnixNano: "1752384000000000000",
                endTimeUnixNano: "1752384001000000000",
                attributes: [
                  {
                    key: "gen_ai.operation.name",
                    value: { stringValue: "chat" },
                  },
                  {
                    key: "llm.token_count.prompt",
                    value: { intValue: 80 },
                  },
                  {
                    key: "llm.token_count.completion",
                    value: { intValue: 150 },
                  },
                  {
                    key: "llm.token_count.reasoning_tokens",
                    value: { intValue: 120 },
                  },
                  {
                    key: "llm.token_count.total",
                    value: { intValue: 230 },
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
      sdkName: "custom",
      sdkVersion: "1.0.0",
    }).processToEvent(batch);

    expect(events).toHaveLength(1);
    expect(events[0].providedUsageDetails).toEqual({
      input: 80,
      output: 30, // 150 - 120
      output_reasoning_tokens: 120,
      total: 230,
    });
  });
});
