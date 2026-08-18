import { describe, expect, it } from "vitest";

import {
  OtelIngestionProcessor,
  type ResourceSpan,
} from "./OtelIngestionProcessor";

describe("OtelIngestionProcessor model parameters", () => {
  it("retains the service tier from Vercel AI SDK spans", () => {
    const batch: ResourceSpan[] = [
      {
        scopeSpans: [
          {
            scope: { name: "ai", version: "7.0.0" },
            spans: [
              {
                traceId: Buffer.from("0123456789abcdef0123456789abcdef", "hex"),
                spanId: Buffer.from("0123456789abcdef", "hex"),
                name: "chat gpt-5.5",
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
                    value: { stringValue: "gpt-5.5" },
                  },
                  {
                    key: "gen_ai.request.service_tier",
                    value: { stringValue: "priority" },
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
      sdkName: "ai",
      sdkVersion: "7.0.0",
    }).processToEvent(batch);

    expect(events).toHaveLength(1);
    expect(events[0].modelParameters).toMatchObject({
      service_tier: "priority",
    });
  });

  it("falls back to the OpenAI service tier in Vercel provider metadata", () => {
    const batch: ResourceSpan[] = [
      {
        scopeSpans: [
          {
            scope: { name: "ai", version: "7.0.0" },
            spans: [
              {
                traceId: Buffer.from("0123456789abcdef0123456789abcdef", "hex"),
                spanId: Buffer.from("0123456789abcdef", "hex"),
                name: "chat gpt-5.5",
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
                    value: { stringValue: "gpt-5.5" },
                  },
                  {
                    key: "ai.response.providerMetadata",
                    value: {
                      stringValue: JSON.stringify({
                        openai: { serviceTier: "priority" },
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
      sdkName: "ai",
      sdkVersion: "7.0.0",
    }).processToEvent(batch);

    expect(events).toHaveLength(1);
    expect(events[0].modelParameters).toMatchObject({
      service_tier: "priority",
    });
  });

  it("merges the Vercel provider service tier into explicit model parameters", () => {
    const batch: ResourceSpan[] = [
      {
        scopeSpans: [
          {
            scope: { name: "ai", version: "7.0.0" },
            spans: [
              {
                traceId: Buffer.from("0123456789abcdef0123456789abcdef", "hex"),
                spanId: Buffer.from("0123456789abcdef", "hex"),
                name: "chat gpt-5.5",
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
                    value: { stringValue: "gpt-5.5" },
                  },
                  {
                    key: "langfuse.observation.model.parameters",
                    value: {
                      stringValue: JSON.stringify({ temperature: 0.5 }),
                    },
                  },
                  {
                    key: "ai.response.providerMetadata",
                    value: {
                      stringValue: JSON.stringify({
                        openai: { serviceTier: "priority" },
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
      sdkName: "ai",
      sdkVersion: "7.0.0",
    }).processToEvent(batch);

    expect(events).toHaveLength(1);
    expect(events[0].modelParameters).toMatchObject({
      temperature: 0.5,
      service_tier: "priority",
    });
  });

  it("maps flattened OpenInference invocation parameters", () => {
    const batch: ResourceSpan[] = [
      {
        scopeSpans: [
          {
            scope: { name: "config-task-service-ai", version: "0.1.0" },
            spans: [
              {
                traceId: Buffer.from("0123456789abcdef0123456789abcdef", "hex"),
                spanId: Buffer.from("0123456789abcdef", "hex"),
                name: "gen_ai.client.operation",
                kind: 3,
                startTimeUnixNano: "1752384000000000000",
                endTimeUnixNano: "1752384001000000000",
                attributes: [
                  {
                    key: "openinference.span.kind",
                    value: { stringValue: "LLM" },
                  },
                  {
                    key: "llm.model_name",
                    value: { stringValue: "gpt-5.6-luna" },
                  },
                  {
                    key: "llm.invocation_parameters.temperature",
                    value: { doubleValue: 0.1 },
                  },
                  {
                    key: "llm.invocation_parameters.max_tokens",
                    value: { intValue: { low: 6000, high: 0 } },
                  },
                  {
                    key: "llm.invocation_parameters.reasoning_effort",
                    value: { stringValue: "high" },
                  },
                  {
                    key: "llm.invocation_parameters.service_tier",
                    value: { stringValue: "priority" },
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
      sdkName: "opentelemetry",
      sdkVersion: "1.31.0",
    }).processToEvent(batch);

    expect(events).toHaveLength(1);
    expect(events[0].modelParameters).toEqual({
      temperature: 0.1,
      max_tokens: 6000,
      reasoning_effort: "high",
      service_tier: "priority",
    });
  });
});
