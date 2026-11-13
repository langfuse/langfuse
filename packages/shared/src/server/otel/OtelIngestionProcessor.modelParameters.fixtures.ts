import type { ResourceSpan } from "./OtelIngestionProcessor";

type OtelAttribute = { key: string; value: Record<string, unknown> };

type ModelParametersFixture = {
  name: string;
  scopeName: string;
  scopeVersion: string;
  sdkName: string;
  sdkVersion: string;
  spanName: string;
  attributes: OtelAttribute[];
  expectedModelName: string;
  expectedModelParameters: Record<string, string | number>;
  exactExpectedModelParameters?: boolean;
};

const stringAttribute = (key: string, value: string): OtelAttribute => ({
  key,
  value: { stringValue: value },
});

const numberAttribute = (key: string, value: number): OtelAttribute => ({
  key,
  value: { doubleValue: value },
});

const intAttribute = (key: string, value: number): OtelAttribute => ({
  key,
  value: { intValue: { low: value, high: 0 } },
});

const vercelAiFixtureDefaults = {
  scopeName: "ai",
  scopeVersion: "7.0.0",
  sdkName: "ai",
  sdkVersion: "7.0.0",
} as const;

export const modelParametersFixtures: ModelParametersFixture[] = [
  {
    ...vercelAiFixtureDefaults,
    name: "Vercel service tier attribute",
    spanName: "chat gpt-5.5",
    attributes: [
      stringAttribute("gen_ai.operation.name", "chat"),
      stringAttribute("gen_ai.request.model", "gpt-5.5"),
      stringAttribute("gen_ai.request.service_tier", "priority"),
    ],
    expectedModelName: "gpt-5.5",
    expectedModelParameters: { service_tier: "priority" },
  },
  {
    ...vercelAiFixtureDefaults,
    name: "Vercel OpenAI provider metadata service tier",
    spanName: "chat gpt-5.5",
    attributes: [
      stringAttribute("gen_ai.operation.name", "chat"),
      stringAttribute("gen_ai.request.model", "gpt-5.5"),
      stringAttribute(
        "ai.response.providerMetadata",
        JSON.stringify({ openai: { serviceTier: "priority" } }),
      ),
    ],
    expectedModelName: "gpt-5.5",
    expectedModelParameters: { service_tier: "priority" },
  },
  {
    ...vercelAiFixtureDefaults,
    name: "Vercel Vertex provider metadata service tier",
    spanName: "chat gemini-3.5-flash",
    attributes: [
      stringAttribute("gen_ai.operation.name", "chat"),
      stringAttribute("gen_ai.request.model", "gemini-3.5-flash"),
      stringAttribute(
        "ai.response.providerMetadata",
        JSON.stringify({
          vertex: { usageMetadata: { trafficType: "ON_DEMAND_FLEX" } },
        }),
      ),
    ],
    expectedModelName: "gemini-3.5-flash",
    expectedModelParameters: { service_tier: "ON_DEMAND_FLEX" },
  },
  {
    ...vercelAiFixtureDefaults,
    name: "Vercel Gemini provider metadata service tier",
    spanName: "chat gemini-3.5-flash",
    attributes: [
      stringAttribute("gen_ai.operation.name", "chat"),
      stringAttribute("gen_ai.request.model", "gemini-3.5-flash"),
      stringAttribute(
        "ai.response.providerMetadata",
        JSON.stringify({ google: { serviceTier: "flex" } }),
      ),
    ],
    expectedModelName: "gemini-3.5-flash",
    expectedModelParameters: { service_tier: "flex" },
  },
  {
    ...vercelAiFixtureDefaults,
    name: "Vercel provider service tier merged with explicit parameters",
    spanName: "chat gpt-5.5",
    attributes: [
      stringAttribute("gen_ai.operation.name", "chat"),
      stringAttribute("gen_ai.request.model", "gpt-5.5"),
      stringAttribute(
        "langfuse.observation.model.parameters",
        JSON.stringify({ temperature: 0.5 }),
      ),
      stringAttribute(
        "ai.response.providerMetadata",
        JSON.stringify({ openai: { serviceTier: "priority" } }),
      ),
    ],
    expectedModelName: "gpt-5.5",
    expectedModelParameters: { temperature: 0.5, service_tier: "priority" },
  },
  {
    name: "OpenInference flattened invocation parameters",
    scopeName: "config-task-service-ai",
    scopeVersion: "0.1.0",
    sdkName: "opentelemetry",
    sdkVersion: "1.31.0",
    spanName: "gen_ai.client.operation",
    attributes: [
      stringAttribute("openinference.span.kind", "LLM"),
      stringAttribute("llm.model_name", "gpt-5.6-luna"),
      numberAttribute("llm.invocation_parameters.temperature", 0.1),
      intAttribute("llm.invocation_parameters.max_tokens", 6000),
      stringAttribute("llm.invocation_parameters.reasoning_effort", "high"),
      stringAttribute("llm.invocation_parameters.service_tier", "priority"),
    ],
    expectedModelName: "gpt-5.6-luna",
    expectedModelParameters: {
      temperature: 0.1,
      max_tokens: 6000,
      reasoning_effort: "high",
      service_tier: "priority",
    },
    exactExpectedModelParameters: true,
  },
];

export function createModelParametersBatch(
  fixture: ModelParametersFixture,
): ResourceSpan[] {
  return [
    {
      scopeSpans: [
        {
          scope: {
            name: fixture.scopeName,
            version: fixture.scopeVersion,
          },
          spans: [
            {
              traceId: Buffer.from("0123456789abcdef0123456789abcdef", "hex"),
              spanId: Buffer.from("0123456789abcdef", "hex"),
              name: fixture.spanName,
              kind: 3,
              startTimeUnixNano: "1752384000000000000",
              endTimeUnixNano: "1752384001000000000",
              attributes: fixture.attributes,
              status: {},
            },
          ],
        },
      ],
    },
  ];
}
