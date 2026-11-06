import { describe, expect, it, vi } from "vitest";

vi.mock("../redis/redis", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../redis/redis")>()),
  redis: { set: vi.fn().mockResolvedValue("OK") },
}));

import {
  OtelIngestionProcessor,
  type ResourceSpan,
} from "./OtelIngestionProcessor";

describe("OtelIngestionProcessor model parameters", () => {
  describe.each(["v3", "v4"] as const)(
    "Vercel sampling parameters (%s)",
    (path) => {
      it.each<{
        name: string;
        attributes: Record<string, number | string | string[]>;
        expected: Record<string, number | string | null>;
      }>([
        {
          name: "retains sampling settings and stop sequences",
          attributes: {
            "gen_ai.request.top_p": 0.8,
            "gen_ai.request.top_k": 12,
            "gen_ai.request.frequency_penalty": 0.2,
            "gen_ai.request.presence_penalty": -0.3,
            "gen_ai.request.stop_sequences": ["END,STOP", "\n"],
          },
          expected: {
            topP: "0.8",
            topK: "12",
            frequencyPenalty: "0.2",
            presencePenalty: "-0.3",
            stopSequences: '["END,STOP","\\n"]',
          },
        },
        {
          name: "preserves zero settings and empty stop sequences",
          attributes: {
            "gen_ai.request.top_p": 0,
            "gen_ai.request.top_k": 0,
            "gen_ai.request.frequency_penalty": 0,
            "gen_ai.request.presence_penalty": 0,
            "gen_ai.request.stop_sequences": [],
          },
          expected: {
            topP: "0",
            topK: "0",
            frequencyPenalty: "0",
            presencePenalty: "0",
            stopSequences: "[]",
          },
        },
        {
          name: "keeps explicit model parameter overrides",
          attributes: {
            "gen_ai.request.top_p": 0.8,
            "gen_ai.request.top_k": 12,
            "gen_ai.request.stop_sequences": ["END"],
            "langfuse.observation.model.parameters": JSON.stringify({
              topP: 0.3,
              stopSequences: ["CUSTOM"],
            }),
          },
          expected: {
            topP: 0.3,
            topK: "12",
            stopSequences: '["CUSTOM"]',
          },
        },
        {
          name: "leaves absent settings unset",
          attributes: {},
          expected: {
            topP: null,
            topK: null,
            frequencyPenalty: null,
            presencePenalty: null,
            stopSequences: null,
          },
        },
      ])("$name", async ({ attributes, expected }) => {
        const batch: ResourceSpan[] = [
          {
            scopeSpans: [
              {
                scope: { name: "ai", version: "6.0.0" },
                spans: [
                  {
                    traceId: Buffer.from(
                      "0123456789abcdef0123456789abcdef",
                      "hex",
                    ),
                    spanId: Buffer.from("0123456789abcdef", "hex"),
                    name: "ai.generateText.doGenerate",
                    kind: 3,
                    startTimeUnixNano: "1752384000000000000",
                    endTimeUnixNano: "1752384001000000000",
                    attributes: Object.entries({
                      "gen_ai.request.model": "gpt-5.5",
                      ...attributes,
                    }).map(([key, value]) => {
                      if (Array.isArray(value)) {
                        return {
                          key,
                          value: {
                            arrayValue: {
                              values: value.map((stringValue) => ({
                                stringValue,
                              })),
                            },
                          },
                        };
                      }
                      return {
                        key,
                        value:
                          typeof value === "number"
                            ? { doubleValue: value }
                            : { stringValue: value },
                      };
                    }),
                    status: {},
                  },
                ],
              },
            ],
          },
        ];
        const processor = new OtelIngestionProcessor({
          projectId: "project-1",
          publicKey: "pk-test",
          sdkName: "ai",
          sdkVersion: "6.0.0",
        });
        const observations =
          path === "v4"
            ? processor.processToEvent(batch)
            : (await processor.processToIngestionEvents(batch))
                .filter((event) => event.type === "generation-create")
                .map((event) => event.body);

        expect(observations).toHaveLength(1);
        expect(observations[0].modelParameters).toMatchObject(expected);
      });
    },
  );

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
