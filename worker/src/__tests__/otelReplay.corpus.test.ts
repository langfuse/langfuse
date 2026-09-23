import "./helpers/otelReplaySetup";
import { describe, expect, it } from "vitest";
import fc from "fast-check";
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
};

type ProviderCase = {
  name: string;
  fixture: ReplayFixture;
  inputNeedle: string;
  outputNeedle: string;
  numericRepairs: Record<string, string>;
};

const providerCases: ProviderCase[] = [
  {
    name: "AI SDK",
    fixture: vercelAiSdkMixedToolMessagesFixture,
    inputNeedle: "What can I use Langfuse for?",
    outputNeedle: "extract",
    numericRepairs: {},
  },
  {
    name: "LangGraph",
    fixture: langgraphProductionShapeFixture,
    inputNeedle: "Synthetic user request 010.",
    outputNeedle: "Synthetic assistant response 043.",
    numericRepairs: {
      "langfuse.observation.metadata.langgraph_step": "1",
      "langfuse.observation.metadata.ls_max_tokens": "256",
    },
  },
  {
    name: "Pydantic AI",
    fixture: pydanticAiProductionShapeFixture,
    inputNeedle: "Synthetic user request 391.",
    outputNeedle: "Synthetic assistant response 392.",
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
    inputNeedle: "Synthetic user request 012.",
    outputNeedle: "Synthetic assistant response 087.",
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

function buildResourceSpans(
  fixture: ReplayFixture,
  startTimeUnixNano: string,
  endTimeUnixNano: string,
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
              return repairedValue === undefined
                ? structuredClone(attribute)
                : {
                    ...attribute,
                    value: { intValue: repairedValue },
                  };
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

function persistedRowText(row: Record<string, unknown>, key: string): string {
  const value = row[key];
  return typeof value === "string" ? value : JSON.stringify(value);
}

// The writer owns retries; a Vitest retry could overlap an in-flight ClickHouse replay.
describe("OTEL replay provider corpus", { retry: 0, timeout: 120_000 }, () => {
  it.each(providerCases)(
    "$name keeps provider content and identity through ClickHouse",
    async ({ fixture, inputNeedle, name, numericRepairs, outputNeedle }) => {
      const resourceSpans = buildResourceSpans(
        fixture,
        "1714488530686000000",
        "1714488530687000000",
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
      expect(persistedRowText(row, "input")).toContain(inputNeedle);
      expect(persistedRowText(row, "output")).toContain(outputNeedle);
      expect(Number(row.event_bytes)).toBeGreaterThan(0);
    },
  );

  it("preserves generated identities and nested Unicode payloads", async () => {
    const textArbitrary = fc
      .array(fc.fullUnicode(), { minLength: 0, maxLength: 20 })
      .map((codePoints) => `${codePoints.join("")}🌍`);
    const nestedPayloadArbitrary = fc.record({
      label: textArbitrary,
      values: fc.array(fc.integer({ min: -1000, max: 1000 }), {
        maxLength: 3,
      }),
      child: fc.record({ unicode: textArbitrary }),
    });

    await fc.assert(
      fc.asyncProperty(
        fc
          .stringMatching(/^[0-9a-f]{32}$/)
          .filter((value) => value !== "0".repeat(32)),
        fc
          .stringMatching(/^[0-9a-f]{16}$/)
          .filter((value) => value !== "0".repeat(16)),
        textArbitrary,
        nestedPayloadArbitrary,
        async (traceId, spanId, text, nestedPayload) => {
          const input = { message: text, nested: nestedPayload };
          const output = { answer: `${text} response`, nested: nestedPayload };
          const resourceSpans: ResourceSpan[] = [
            {
              resource: {
                attributes: [
                  {
                    key: "service.name",
                    value: { stringValue: "otel-replay-property" },
                  },
                ],
              },
              scopeSpans: [
                {
                  scope: { name: "otel-replay", version: "1.0.0" },
                  spans: [
                    {
                      traceId: Buffer.from(traceId, "hex"),
                      spanId: Buffer.from(spanId, "hex"),
                      name: "replay.generation",
                      kind: 3,
                      startTimeUnixNano: "1714488530686000000",
                      endTimeUnixNano: "1714488530687000000",
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
                          key: "gen_ai.provider.name",
                          value: { stringValue: "openai" },
                        },
                        {
                          key: "langfuse.observation.input",
                          value: { stringValue: JSON.stringify(input) },
                        },
                        {
                          key: "langfuse.observation.output",
                          value: { stringValue: JSON.stringify(output) },
                        },
                      ],
                      status: { code: 0 },
                    },
                  ],
                },
              ],
            },
          ];

          const { storedRows } = await runOtelReplay({
            resourceSpans,
            projectId: `otel-replay-property-${traceId.slice(0, 8)}`,
          });

          expect(storedRows).toHaveLength(1);
          const row = storedRows[0];
          expect(row.trace_id).toBe(traceId);
          expect(row.span_id).toBe(spanId);
          expect(JSON.parse(persistedRowText(row, "input"))).toEqual(input);
          expect(JSON.parse(persistedRowText(row, "output"))).toEqual(output);
          expect(Number(row.event_bytes)).toBeGreaterThan(0);
        },
      ),
      { numRuns: 16 },
    );
  });
});
