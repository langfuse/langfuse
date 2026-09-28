import "./helpers/otelReplaySetup";
import { describe, expect, it } from "vitest";
import type { ResourceSpan } from "@langfuse/shared/src/server";
import { vercelAiSdkMixedToolMessagesFixture } from "../../../packages/shared/src/utils/normalized-io/conventions/providers/ai-sdk/fixtures";
import { langgraphProductionShapeFixture } from "../../../packages/shared/src/utils/normalized-io/conventions/providers/langchain/fixtures";
import { pydanticAiProductionShapeFixture } from "../../../packages/shared/src/utils/normalized-io/conventions/providers/pydantic-ai/fixtures";
import { microsoftAgentProductionShapeFixture } from "../../../packages/shared/src/utils/normalized-io/conventions/providers/otel-genai/fixtures";
import { runOtelReplay } from "./helpers/otelReplayHarness";

type ScopeSpan = NonNullable<ResourceSpan["scopeSpans"]>[number];
type Span = NonNullable<ScopeSpan["spans"]>[number];

type ReplayFixture = {
  name: string;
  otel: {
    scopeSpan: ScopeSpan;
    resourceAttributes: Record<string, unknown>;
  };
  spanIO: {
    input: unknown;
    output: unknown;
  };
};

type ProviderCase = {
  name: string;
  fixture: ReplayFixture;
  toolDefinitionsAttribute?: string;
  addToolDefinitionsToInput?: boolean;
  expectedObservationType?: string;
  expectedModelName: string;
  expectedUsageDetails: Record<string, number>;
  expectedFinalUsageDetails: Record<string, number>;
  expectedToolCalls?: Array<{
    name: string;
    id: string;
    arguments: string;
    type: string;
    index: number;
  }>;
  expectedMetadata?: Record<string, string>;
  expectedModelParameters?: Record<string, string | number>;
  stringRepairs?: Record<string, string>;
  numericRepairs: Record<string, string>;
};

const providerCases: ProviderCase[] = [
  {
    name: "AI SDK",
    fixture: vercelAiSdkMixedToolMessagesFixture,
    toolDefinitionsAttribute: "gen_ai.tool.definitions",
    // The captured spanIO input omits tools; the replay stores the OTLP tool
    // definitions with the messages in its input column.
    addToolDefinitionsToInput: true,
    expectedModelName: "gpt-5-2025-08-07",
    // This fixture has no usage attributes. The Vercel `ai` scope branch fills
    // missing input/output counts with zero; the generic `gen_ai` branch does not.
    expectedUsageDetails: { input: 0, output: 0 },
    expectedFinalUsageDetails: { input: 0, output: 0, total: 0 },
    expectedToolCalls: [
      {
        name: "extract",
        id: "toolu_01XXtujJ3DBaYEZGzn96xpGt",
        arguments: JSON.stringify({
          score: "0",
          reasoning:
            "The last user message is a how-to question asking for guidance on using Langfuse evaluation features. It does not express feedback about a feature.",
        }),
        type: "tool_use",
        index: 0,
      },
    ],
    numericRepairs: {},
  },
  {
    name: "LangGraph",
    fixture: langgraphProductionShapeFixture,
    expectedModelName: "synthetic-value-044",
    expectedUsageDetails: {
      synthetic_field_010: 13252,
      synthetic_field_011: 0,
      input: 1,
      output: 406,
      synthetic_field_012: 0,
      synthetic_field_013: 13252,
    },
    expectedFinalUsageDetails: {
      synthetic_field_010: 13252,
      synthetic_field_011: 0,
      input: 1,
      output: 406,
      synthetic_field_012: 0,
      synthetic_field_013: 13252,
      total: 26911,
    },
    expectedMetadata: {
      langgraph_step: "1",
      ls_max_tokens: "256",
    },
    numericRepairs: {
      "langfuse.observation.metadata.langgraph_step": "1",
      "langfuse.observation.metadata.ls_max_tokens": "256",
    },
  },
  {
    name: "Pydantic AI",
    fixture: pydanticAiProductionShapeFixture,
    toolDefinitionsAttribute: "gen_ai.tool.definitions",
    expectedModelName: "synthetic-value-403",
    expectedUsageDetails: {
      input: 31,
      output: 96,
      accepted_prediction_tokens: 0,
      audio_tokens: 0,
      reasoning_tokens: 7,
      rejected_prediction_tokens: 0,
    },
    expectedFinalUsageDetails: {
      input: 31,
      output: 96,
      accepted_prediction_tokens: 0,
      audio_tokens: 0,
      reasoning_tokens: 7,
      rejected_prediction_tokens: 0,
      total: 134,
    },
    // Known limitation: this provider puts tool calls in `parts`, which the
    // current extractor does not split into tool-call columns. The full output
    // is persisted while those columns remain empty.
    expectedToolCalls: [],
    expectedModelParameters: { max_tokens: 1024 },
    numericRepairs: {
      "gen_ai.request.max_tokens": "1024",
      "gen_ai.usage.input_tokens": "31",
      "gen_ai.usage.output_tokens": "96",
      "gen_ai.usage.details.accepted_prediction_tokens": "0",
      "gen_ai.usage.details.audio_tokens": "0",
      "gen_ai.usage.details.reasoning_tokens": "7",
      "gen_ai.usage.details.rejected_prediction_tokens": "0",
    },
  },
  {
    name: "OTel GenAI",
    fixture: microsoftAgentProductionShapeFixture,
    toolDefinitionsAttribute: "gen_ai.tool.definitions",
    // The anonymizer replaced this Langfuse enum with an invalid placeholder.
    // For this replay contract, the GenAI model and message payload are treated
    // as a generation; this does not claim the original enum value was recovered.
    stringRepairs: { "langfuse.observation.type": "generation" },
    expectedObservationType: "GENERATION",
    // Current conversion suppresses model and usage for any invoke_agent span,
    // including this fixture with gen_ai.request.model. Keep the observed blank
    // model and absent usage explicit until that behavior is changed separately.
    expectedModelName: "",
    expectedUsageDetails: {},
    expectedFinalUsageDetails: {},
    expectedToolCalls: [],
    expectedModelParameters: { "choice.count": 1 },
    numericRepairs: {
      "gen_ai.request.choice.count": "1",
    },
  },
];

function cloneId(id: Span["traceId"]): Span["traceId"] {
  if (Buffer.isBuffer(id)) return Buffer.from(id);
  if (id.data) return { data: Buffer.from(id.data) };
  return id;
}

function idToHex(id: Span["traceId"]): string {
  return Buffer.from(
    Buffer.isBuffer(id) ? id : (id.data ?? Buffer.alloc(0)),
  ).toString("hex");
}

function fixtureStringAttribute(
  fixture: ReplayFixture,
  key: string,
): string | undefined {
  const attribute = fixture.otel.scopeSpan.spans?.[0]?.attributes?.find(
    (candidate) => candidate.key === key,
  );
  const value = attribute?.value as { stringValue?: unknown } | undefined;
  return typeof value?.stringValue === "string" ? value.stringValue : undefined;
}

function fixtureJsonAttribute(fixture: ReplayFixture, key: string): unknown {
  const value = fixtureStringAttribute(fixture, key);
  if (value === undefined) throw new Error(`Fixture is missing ${key}`);
  return JSON.parse(value);
}

function parseFixtureValue(value: unknown): unknown {
  if (typeof value !== "string") return value;

  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function persistedJsonColumn(
  row: Record<string, unknown>,
  key: string,
): unknown {
  const value = row[key];
  if (typeof value !== "string") return value;

  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function expectedToolDefinitions(
  definitions: unknown[],
): Record<string, string> {
  return Object.fromEntries(
    definitions.map((definition) => {
      const value = definition as {
        function?: Record<string, unknown>;
        name?: string;
        description?: string;
        parameters?: unknown;
        inputSchema?: unknown;
        parameters_json_schema?: unknown;
      };
      const tool = value.function ?? value;
      const name = tool.name as string;
      const parameters =
        tool.parameters ?? tool.parameters_json_schema ?? tool.inputSchema;

      return [
        name,
        JSON.stringify({
          description: (tool.description as string | undefined) ?? "",
          parameters: parameters ? JSON.stringify(parameters) : "",
        }),
      ];
    }),
  );
}

function persistedToolCalls(row: Record<string, unknown>): unknown[] {
  const calls = persistedJsonColumn(row, "tool_calls");
  if (!Array.isArray(calls)) {
    throw new Error("ClickHouse replay row is missing tool_calls");
  }
  return calls.map((call) =>
    typeof call === "string" ? JSON.parse(call) : call,
  );
}

function assertMetadataValues(
  row: Record<string, unknown>,
  expected: Record<string, string>,
): void {
  const names = row.metadata_names as string[];
  const values = row.metadata_values as string[];

  for (const [name, value] of Object.entries(expected)) {
    const index = names.indexOf(name);
    expect(index, `metadata field ${name}`).toBeGreaterThanOrEqual(0);
    expect(values[index]).toBe(value);
  }
}

function buildResourceSpans(
  fixture: ReplayFixture,
  startTimeUnixNano: string,
  endTimeUnixNano: string,
  stringRepairs: Record<string, string>,
  numericRepairs: Record<string, string>,
): ResourceSpan[] {
  const sourceScopeSpan = fixture.otel.scopeSpan;

  return [
    {
      resource: {
        attributes: Object.entries(fixture.otel.resourceAttributes).map(
          ([key, value]) => ({
            key,
            value: { stringValue: String(value) },
          }),
        ),
      },
      scopeSpans: [
        {
          ...sourceScopeSpan,
          scope: sourceScopeSpan.scope
            ? {
                ...sourceScopeSpan.scope,
                attributes: sourceScopeSpan.scope.attributes?.map((attribute) =>
                  structuredClone(attribute),
                ),
              }
            : undefined,
          spans: (sourceScopeSpan.spans ?? []).map((sourceSpan) => ({
            ...sourceSpan,
            traceId: cloneId(sourceSpan.traceId),
            spanId: cloneId(sourceSpan.spanId),
            parentSpanId: sourceSpan.parentSpanId
              ? cloneId(sourceSpan.parentSpanId)
              : undefined,
            startTimeUnixNano,
            endTimeUnixNano,
            attributes: sourceSpan.attributes?.map((attribute) => {
              const repairedValue = numericRepairs[attribute.key];
              if (repairedValue !== undefined) {
                return { ...attribute, value: { intValue: repairedValue } };
              }

              const repairedString = stringRepairs[attribute.key];
              return repairedString === undefined
                ? structuredClone(attribute)
                : { ...attribute, value: { stringValue: repairedString } };
            }),
            events: sourceSpan.events
              ? structuredClone(sourceSpan.events)
              : sourceSpan.events,
            status: sourceSpan.status
              ? { ...sourceSpan.status }
              : sourceSpan.status,
          })),
        },
      ],
    },
  ];
}

// The writer owns retries; a Vitest retry could overlap an in-flight ClickHouse replay.
describe("OTEL replay provider corpus", { retry: 0, timeout: 120_000 }, () => {
  it.each(providerCases)(
    "$name persists provider payloads and identity through ClickHouse",
    async (providerCase) => {
      const {
        expectedMetadata,
        expectedModelParameters,
        expectedToolCalls,
        expectedModelName,
        expectedObservationType,
        expectedFinalUsageDetails,
        expectedUsageDetails,
        fixture,
        name,
        numericRepairs,
        stringRepairs,
        toolDefinitionsAttribute,
        addToolDefinitionsToInput,
      } = providerCase;
      const resourceSpans = buildResourceSpans(
        fixture,
        "1714488530686000000",
        "1714488530687000000",
        stringRepairs ?? {},
        numericRepairs,
      );
      const sourceSpan = resourceSpans[0].scopeSpans?.[0].spans?.[0];
      expect(sourceSpan).toBeDefined();

      const { storedRows } = await runOtelReplay({
        resourceSpans,
        projectId: `otel-replay-${name.toLowerCase().replaceAll(" ", "-")}`,
      });

      expect(storedRows).toHaveLength(1);
      const row = storedRows[0];

      expect(row.trace_id).toBe(idToHex(sourceSpan!.traceId));
      expect(row.span_id).toBe(idToHex(sourceSpan!.spanId));
      if (expectedObservationType) {
        expect(row.type).toBe(expectedObservationType);
      }
      expect(row.provided_model_name).toBe(expectedModelName);

      const spanIOInput = parseFixtureValue(fixture.spanIO.input);
      const expectedOutput = parseFixtureValue(fixture.spanIO.output);
      const storedInput = persistedJsonColumn(row, "input");
      expect(persistedJsonColumn(row, "output")).toEqual(expectedOutput);

      if (toolDefinitionsAttribute) {
        const toolDefinitions = fixtureJsonAttribute(
          fixture,
          toolDefinitionsAttribute,
        ) as unknown[];
        const expectedInput = addToolDefinitionsToInput
          ? {
              ...(spanIOInput as Record<string, unknown>),
              tools: toolDefinitions,
            }
          : spanIOInput;
        expect(storedInput).toEqual(expectedInput);
        expect(persistedJsonColumn(row, "tool_definitions")).toEqual(
          expectedToolDefinitions(toolDefinitions),
        );
      } else {
        expect(storedInput).toEqual(spanIOInput);
      }

      expect(persistedJsonColumn(row, "provided_usage_details")).toEqual(
        expectedUsageDetails,
      );
      expect(persistedJsonColumn(row, "usage_details")).toEqual(
        expectedFinalUsageDetails,
      );

      if (expectedToolCalls) {
        expect(row.tool_call_names).toEqual(
          expectedToolCalls.map((call) => call.name),
        );
        expect(persistedToolCalls(row)).toEqual(
          expectedToolCalls.map(({ name: _name, ...call }) => call),
        );
      }
      if (expectedMetadata) assertMetadataValues(row, expectedMetadata);
      if (expectedModelParameters) {
        expect(persistedJsonColumn(row, "model_parameters")).toMatchObject(
          expectedModelParameters,
        );
      }
    },
  );
});
