/**
 * Test suite to verify that OTEL events coming through the ingestion pipeline
 * correctly conform to the ObservationForEval schema.
 *
 * This is critical because:
 * 1. OTEL events are the primary ingestion path for observation-level evals
 * 2. If the schema validation fails, observation evals become ineffective
 * 3. We need to ensure all typical fields are correctly mapped
 *
 * Flow tested:
 * ResourceSpan -> processToEvent() -> createEventRecord() -> convertEventRecordToObservationForEval()
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { OtelIngestionProcessor } from "@langfuse/shared/src/server";
import {
  convertEventRecordToObservationForEval,
  observationForEvalSchema,
  type ObservationForEval,
} from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import { IngestionService } from "../../services/IngestionService";
import * as clickhouseWriterExports from "../../services/ClickhouseWriter";

// Mock ClickhouseWriter to avoid actual database writes
const mockAddToClickhouseWriter = vi.fn();
vi.mock("../../services/ClickhouseWriter", async (importOriginal) => {
  const original = (await importOriginal()) as object;
  return {
    ...original,
    ClickhouseWriter: {
      getInstance: () => ({
        addToQueue: mockAddToClickhouseWriter,
      }),
    },
  };
});

// Mock ClickhouseClient to return empty results (no existing records)
const mockClickhouseClient = {
  query: async () => ({
    json: async () => [],
    query_id: "test-query-id",
    response_headers: { "x-clickhouse-summary": "[]" },
  }),
};

// Create IngestionService instance with mocked dependencies
// Note: redis is null as we don't need it for createEventRecord
// prisma is used for prompt/model lookups (will return null if not found)
const ingestionService = new IngestionService(
  null as any,
  prisma,
  clickhouseWriterExports.ClickhouseWriter.getInstance() as any,
  mockClickhouseClient as any,
);

/**
 * Helper to create protobuf-style timestamp from nanoseconds
 */
function createNanoTimestamp(nanoTime: bigint): {
  low: number;
  high: number;
  unsigned: boolean;
} {
  const low = Number(nanoTime & BigInt(0xffffffff));
  const high = Number(nanoTime >> BigInt(32));
  return { low, high, unsigned: true };
}

/**
 * Helper to create Buffer-style ID from hex string
 */
function createBufferId(hexString: string): { type: "Buffer"; data: number[] } {
  const buffer = Buffer.from(hexString, "hex");
  return { type: "Buffer", data: Array.from(buffer) };
}

/**
 * Process a ResourceSpan through the full pipeline and return the ObservationForEval
 */
async function processOtelSpanToObservationForEval(
  resourceSpan: any,
  projectId = "test-project",
): Promise<ObservationForEval[]> {
  const processor = new OtelIngestionProcessor({ projectId });

  // Process to EventInput array using the real OtelIngestionProcessor
  const eventInputs = processor.processToEvent([resourceSpan]);

  // Convert each EventInput to EventRecordInsertType using the real IngestionService
  // Then convert to ObservationForEval
  const results: ObservationForEval[] = [];
  for (const eventInput of eventInputs) {
    const eventRecord = await ingestionService.createEventRecord(
      eventInput,
      "test/otel/test.json",
    );
    const observation = convertEventRecordToObservationForEval(eventRecord);
    results.push(observation);
  }

  return results;
}

describe("OTEL to ObservationForEval Schema Validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Langfuse SDK spans", () => {
    it("should convert a Langfuse SDK generation span to valid ObservationForEval", async () => {
      const langfuseOtelSpan = {
        resource: {
          attributes: [
            { key: "telemetry.sdk.language", value: { stringValue: "python" } },
            {
              key: "telemetry.sdk.name",
              value: { stringValue: "opentelemetry" },
            },
            { key: "telemetry.sdk.version", value: { stringValue: "1.32.0" } },
            {
              key: "langfuse.environment",
              value: { stringValue: "production" },
            },
            { key: "langfuse.release", value: { stringValue: "0.0.1" } },
            { key: "service.name", value: { stringValue: "test-service" } },
          ],
        },
        scopeSpans: [
          {
            scope: {
              name: "langfuse-sdk",
              version: "3.0.0",
              attributes: [
                { key: "public_key", value: { stringValue: "pk-lf-test" } },
              ],
            },
            spans: [
              {
                traceId: createBufferId("2cce18f7e8cd065a0b4e634eef728391"),
                spanId: createBufferId("57f0255417974100"),
                parentSpanId: createBufferId("dfe387fea7ef3b02"),
                name: "test-generation",
                kind: 1,
                startTimeUnixNano: createNanoTimestamp(
                  BigInt(1714488530686000000),
                ),
                endTimeUnixNano: createNanoTimestamp(
                  BigInt(1714488530687000000),
                ),
                attributes: [
                  {
                    key: "langfuse.observation.type",
                    value: { stringValue: "generation" },
                  },
                  {
                    key: "langfuse.observation.level",
                    value: { stringValue: "WARNING" },
                  },
                  {
                    key: "langfuse.observation.status_message",
                    value: { stringValue: "test status" },
                  },
                  {
                    key: "langfuse.observation.input",
                    value: {
                      stringValue: '[{"role": "user", "content": "hello"}]',
                    },
                  },
                  {
                    key: "langfuse.observation.output",
                    value: {
                      stringValue:
                        '{"role": "assistant", "content": "hi there"}',
                    },
                  },
                  {
                    key: "langfuse.observation.model.name",
                    value: { stringValue: "gpt-4" },
                  },
                  {
                    key: "langfuse.observation.prompt.name",
                    value: { stringValue: "my-prompt" },
                  },
                  {
                    key: "langfuse.observation.prompt.version",
                    value: { intValue: { low: 1, high: 0, unsigned: false } },
                  },
                  {
                    key: "langfuse.observation.usage_details",
                    value: {
                      stringValue: '{"input": 100, "output": 50}',
                    },
                  },
                  {
                    key: "langfuse.observation.cost_details",
                    value: {
                      stringValue: '{"input": 0.001, "output": 0.002}',
                    },
                  },
                  // Model parameters are extracted from gen_ai.request.* attributes
                  {
                    key: "gen_ai.request.temperature",
                    value: { doubleValue: 0.7 },
                  },
                  {
                    key: "langfuse.observation.metadata.custom_key",
                    value: { stringValue: '"custom_value"' },
                  },
                  {
                    key: "langfuse.trace.name",
                    value: { stringValue: "test-trace" },
                  },
                  { key: "user.id", value: { stringValue: "user-123" } },
                  { key: "session.id", value: { stringValue: "session-456" } },
                  {
                    key: "langfuse.version",
                    value: { stringValue: "v1.0.0" },
                  },
                  {
                    key: "langfuse.trace.tags",
                    value: {
                      arrayValue: {
                        values: [
                          { stringValue: "tag1" },
                          { stringValue: "tag2" },
                        ],
                      },
                    },
                  },
                ],
                status: {},
              },
            ],
          },
        ],
      };

      const observations = await processOtelSpanToObservationForEval(
        langfuseOtelSpan,
        "test-project",
      );

      expect(observations).toHaveLength(1);
      const obs = observations[0];

      // Validate schema conformance first
      const result = observationForEvalSchema.safeParse(obs);
      expect(result.success).toBe(true);

      // Validate required identifiers
      expect(obs.span_id).toBe("57f0255417974100");
      expect(obs.trace_id).toBe("2cce18f7e8cd065a0b4e634eef728391");
      expect(obs.project_id).toBe("test-project");
      expect(obs.parent_span_id).toBe("dfe387fea7ef3b02");

      // Validate core properties
      expect(obs.type).toBe("GENERATION");
      expect(obs.name).toBe("test-generation");
      expect(obs.environment).toBe("production");
      expect(obs.level).toBe("WARNING");
      expect(obs.status_message).toBe("test status");
      expect(obs.version).toBe("v1.0.0");

      // Validate trace-level properties
      expect(obs.trace_name).toBe("test-trace");
      expect(obs.user_id).toBe("user-123");
      expect(obs.session_id).toBe("session-456");
      expect(obs.tags).toEqual(["tag1", "tag2"]);
      expect(obs.release).toBe("0.0.1");

      // Validate model properties
      expect(obs.provided_model_name).toBe("gpt-4");
      // model_parameters comes as object from createEventRecord (schema accepts both string and object)
      expect(obs.model_parameters).toEqual({ temperature: 0.7 });

      // Validate prompt properties
      expect(obs.prompt_name).toBe("my-prompt");
      // prompt_version comes as number from createEventRecord (schema accepts both string and number)
      expect(obs.prompt_version).toBe(1);

      // Validate usage/cost
      expect(obs.provided_usage_details).toEqual({ input: 100, output: 50 });
      expect(obs.provided_cost_details).toEqual({
        input: 0.001,
        output: 0.002,
      });

      // Validate I/O
      expect(obs.input).toBe('[{"role": "user", "content": "hello"}]');
      expect(obs.output).toBe('{"role": "assistant", "content": "hi there"}');

      // Validate metadata is an object
      expect(typeof obs.metadata).toBe("object");
    });

    it("should convert a Langfuse SDK span with minimal attributes", async () => {
      const minimalOtelSpan = {
        resource: { attributes: [] },
        scopeSpans: [
          {
            scope: { name: "langfuse-sdk", version: "3.0.0" },
            spans: [
              {
                traceId: createBufferId("1234567890abcdef1234567890abcdef"),
                spanId: createBufferId("abcdef1234567890"),
                name: "minimal-span",
                kind: 1,
                startTimeUnixNano: createNanoTimestamp(
                  BigInt(1714488530686000000),
                ),
                endTimeUnixNano: createNanoTimestamp(
                  BigInt(1714488530687000000),
                ),
                attributes: [
                  {
                    key: "langfuse.observation.type",
                    value: { stringValue: "span" },
                  },
                ],
                status: {},
              },
            ],
          },
        ],
      };

      const observations = await processOtelSpanToObservationForEval(
        minimalOtelSpan,
        "test-project",
      );

      expect(observations).toHaveLength(1);
      const obs = observations[0];

      // Validate schema conformance
      const result = observationForEvalSchema.safeParse(obs);
      expect(result.success).toBe(true);

      // Required fields should be present
      expect(obs.span_id).toBe("abcdef1234567890");
      expect(obs.trace_id).toBe("1234567890abcdef1234567890abcdef");
      expect(obs.project_id).toBe("test-project");
      expect(obs.type).toBe("SPAN");
      expect(obs.name).toBe("minimal-span");
      expect(obs.level).toBe("DEFAULT");
      expect(obs.environment).toBe("default");

      // Nullable fields should be null or undefined (nullish)
      expect(obs.parent_span_id).toBeFalsy();
      expect(obs.user_id).toBeFalsy();
      expect(obs.session_id).toBeFalsy();
      expect(obs.provided_model_name).toBeFalsy();
      expect(obs.input).toBeFalsy();
      expect(obs.output).toBeFalsy();

      // Array/object fields should have defaults
      expect(obs.tags).toEqual([]);
      expect(obs.tool_calls).toEqual([]);
      expect(obs.tool_definitions).toEqual({});
    });
  });

  describe("Vendor SDK spans", () => {
    it("should convert an OpenLit span to valid ObservationForEval", async () => {
      const openLitSpan = {
        resource: {
          attributes: [
            { key: "telemetry.sdk.language", value: { stringValue: "python" } },
            { key: "telemetry.sdk.name", value: { stringValue: "openlit" } },
            { key: "telemetry.sdk.version", value: { stringValue: "1.27.0" } },
            { key: "service.name", value: { stringValue: "default" } },
            {
              key: "deployment.environment",
              value: { stringValue: "production" },
            },
          ],
        },
        scopeSpans: [
          {
            scope: { name: "openlit.otel.tracing" },
            spans: [
              {
                traceId: createBufferId("ea6737084c1c2984a54a3e3962d3595f"),
                spanId: createBufferId("b904bffb20be6d7e"),
                name: "openai.chat.completions",
                kind: 3,
                startTimeUnixNano: createNanoTimestamp(
                  BigInt(1738241187653000000),
                ),
                endTimeUnixNano: createNanoTimestamp(
                  BigInt(1738241188827000000),
                ),
                attributes: [
                  { key: "gen_ai.system", value: { stringValue: "openai" } },
                  {
                    key: "gen_ai.operation.name",
                    value: { stringValue: "chat" },
                  },
                  {
                    key: "gen_ai.request.model",
                    value: { stringValue: "gpt-3.5-turbo" },
                  },
                  {
                    key: "gen_ai.usage.input_tokens",
                    value: { intValue: { low: 14, high: 0, unsigned: false } },
                  },
                  {
                    key: "gen_ai.usage.output_tokens",
                    value: { intValue: { low: 96, high: 0, unsigned: false } },
                  },
                  {
                    key: "gen_ai.usage.total_tokens",
                    value: { intValue: { low: 110, high: 0, unsigned: false } },
                  },
                  {
                    key: "gen_ai.usage.cost",
                    value: { doubleValue: 0.000151 },
                  },
                ],
                events: [
                  {
                    name: "gen_ai.content.prompt",
                    attributes: [
                      {
                        key: "gen_ai.prompt",
                        value: {
                          stringValue: "user: What is LLM Observability?",
                        },
                      },
                    ],
                  },
                  {
                    name: "gen_ai.content.completion",
                    attributes: [
                      {
                        key: "gen_ai.completion",
                        value: { stringValue: "LLM Observability is..." },
                      },
                    ],
                  },
                ],
                status: { code: 1 },
              },
            ],
          },
        ],
      };

      const observations =
        await processOtelSpanToObservationForEval(openLitSpan);

      expect(observations).toHaveLength(1);
      const obs = observations[0];

      // Validate schema conformance
      const result = observationForEvalSchema.safeParse(obs);
      expect(result.success).toBe(true);

      // Validate key fields
      expect(obs.type).toBe("GENERATION");
      expect(obs.environment).toBe("production");
      expect(obs.provided_model_name).toBe("gpt-3.5-turbo");

      // Usage should be extracted
      expect(obs.provided_usage_details).toMatchObject({
        input: 14,
        output: 96,
        total: 110,
      });
    });

    it("should convert a TraceLoop span to valid ObservationForEval", async () => {
      const traceLoopSpan = {
        resource: {
          attributes: [
            { key: "service.name", value: { stringValue: "traceloop-app" } },
          ],
        },
        scopeSpans: [
          {
            scope: {
              name: "opentelemetry.instrumentation.openai.v1",
              version: "0.33.9",
            },
            spans: [
              {
                traceId: createBufferId("e4ef45025c9b40924bff175e2b125b5b"),
                spanId: createBufferId("aabf16e416ae4952"),
                name: "openai.chat",
                kind: 3,
                startTimeUnixNano: createNanoTimestamp(
                  BigInt(1738241287865000000),
                ),
                endTimeUnixNano: createNanoTimestamp(
                  BigInt(1738241289310000000),
                ),
                attributes: [
                  { key: "llm.request.type", value: { stringValue: "chat" } },
                  { key: "gen_ai.system", value: { stringValue: "OpenAI" } },
                  {
                    key: "gen_ai.request.model",
                    value: { stringValue: "gpt-3.5-turbo" },
                  },
                  {
                    key: "gen_ai.response.model",
                    value: { stringValue: "gpt-3.5-turbo-0125" },
                  },
                  {
                    key: "llm.usage.total_tokens",
                    value: { intValue: { low: 187, high: 0, unsigned: false } },
                  },
                  {
                    key: "gen_ai.usage.completion_tokens",
                    value: { intValue: { low: 173, high: 0, unsigned: false } },
                  },
                  {
                    key: "gen_ai.usage.prompt_tokens",
                    value: { intValue: { low: 14, high: 0, unsigned: false } },
                  },
                  {
                    key: "gen_ai.prompt.0.role",
                    value: { stringValue: "user" },
                  },
                  {
                    key: "gen_ai.prompt.0.content",
                    value: { stringValue: "What is LLM Observability?" },
                  },
                  {
                    key: "gen_ai.completion.0.role",
                    value: { stringValue: "assistant" },
                  },
                  {
                    key: "gen_ai.completion.0.content",
                    value: {
                      stringValue: "LLM Observability is a strategy...",
                    },
                  },
                ],
                status: {},
              },
            ],
          },
        ],
      };

      const observations =
        await processOtelSpanToObservationForEval(traceLoopSpan);

      expect(observations).toHaveLength(1);
      const obs = observations[0];

      // Validate schema conformance
      const result = observationForEvalSchema.safeParse(obs);
      expect(result.success).toBe(true);

      // Validate model extraction (should get response.model)
      expect(obs.provided_model_name).toBe("gpt-3.5-turbo-0125");

      // Validate usage extraction (TraceLoop uses different keys)
      expect(obs.provided_usage_details).toMatchObject({
        input: 14,
        output: 173,
      });
    });

    it("should convert a Vercel AI SDK span to valid ObservationForEval", async () => {
      const vercelAISpan = {
        resource: {
          attributes: [
            { key: "telemetry.sdk.language", value: { stringValue: "nodejs" } },
            { key: "service.name", value: { stringValue: "vercel-app" } },
          ],
        },
        scopeSpans: [
          {
            scope: { name: "ai" },
            spans: [
              {
                traceId: createBufferId("f1e2d3c4b5a69788f1e2d3c4b5a69788"),
                spanId: createBufferId("1122334455667788"),
                name: "ai.generateText",
                kind: 1,
                startTimeUnixNano: createNanoTimestamp(
                  BigInt(1738241387865000000),
                ),
                endTimeUnixNano: createNanoTimestamp(
                  BigInt(1738241389310000000),
                ),
                attributes: [
                  { key: "ai.model.id", value: { stringValue: "gpt-4-turbo" } },
                  {
                    key: "ai.operationId",
                    value: { stringValue: "generateText" },
                  },
                  {
                    key: "ai.telemetry.functionId",
                    value: { stringValue: "chat" },
                  },
                  {
                    key: "ai.prompt.messages",
                    value: {
                      stringValue: '[{"role":"user","content":"Say hello"}]',
                    },
                  },
                  {
                    key: "ai.response.text",
                    value: { stringValue: "Hello! How can I help you today?" },
                  },
                  {
                    key: "gen_ai.usage.input_tokens",
                    value: { intValue: { low: 10, high: 0, unsigned: false } },
                  },
                  {
                    key: "gen_ai.usage.output_tokens",
                    value: { intValue: { low: 8, high: 0, unsigned: false } },
                  },
                  {
                    key: "ai.telemetry.metadata.userId",
                    value: { stringValue: "vercel-user-123" },
                  },
                  {
                    key: "ai.telemetry.metadata.sessionId",
                    value: { stringValue: "vercel-session-456" },
                  },
                ],
                status: {},
              },
            ],
          },
        ],
      };

      const observations =
        await processOtelSpanToObservationForEval(vercelAISpan);

      expect(observations).toHaveLength(1);
      const obs = observations[0];

      // Validate schema conformance
      const result = observationForEvalSchema.safeParse(obs);
      expect(result.success).toBe(true);

      // Validate model extraction
      expect(obs.provided_model_name).toBe("gpt-4-turbo");

      // Validate user/session from Vercel AI SDK metadata
      expect(obs.user_id).toBe("vercel-user-123");
      expect(obs.session_id).toBe("vercel-session-456");

      // Validate I/O extraction
      expect(obs.input).toBe('[{"role":"user","content":"Say hello"}]');
      expect(obs.output).toBe("Hello! How can I help you today?");
    });
  });

  describe("Schema field coverage", () => {
    it("should correctly map all ObservationForEval fields", async () => {
      // Create a span with all possible fields populated
      const fullOtelSpan = {
        resource: {
          attributes: [
            { key: "telemetry.sdk.language", value: { stringValue: "python" } },
            { key: "langfuse.environment", value: { stringValue: "staging" } },
            { key: "langfuse.release", value: { stringValue: "v2.0.0" } },
            {
              key: "service.name",
              value: { stringValue: "full-test-service" },
            },
          ],
        },
        scopeSpans: [
          {
            scope: { name: "langfuse-sdk", version: "3.5.0" },
            spans: [
              {
                traceId: createBufferId("abcdef1234567890abcdef1234567890"),
                spanId: createBufferId("1234567890abcdef"),
                parentSpanId: createBufferId("fedcba0987654321"),
                name: "full-test-observation",
                kind: 1,
                startTimeUnixNano: createNanoTimestamp(
                  BigInt(1738241487865000000),
                ),
                endTimeUnixNano: createNanoTimestamp(
                  BigInt(1738241489310000000),
                ),
                attributes: [
                  {
                    key: "langfuse.observation.type",
                    value: { stringValue: "generation" },
                  },
                  {
                    key: "langfuse.observation.level",
                    value: { stringValue: "ERROR" },
                  },
                  {
                    key: "langfuse.observation.status_message",
                    value: { stringValue: "Rate limit exceeded" },
                  },
                  {
                    key: "langfuse.observation.input",
                    value: { stringValue: '{"query": "test input"}' },
                  },
                  {
                    key: "langfuse.observation.output",
                    value: { stringValue: '{"result": "test output"}' },
                  },
                  {
                    key: "langfuse.observation.model.name",
                    value: { stringValue: "claude-3-opus" },
                  },
                  // Model parameters are extracted from gen_ai.request.* attributes
                  {
                    key: "gen_ai.request.temperature",
                    value: { doubleValue: 0.5 },
                  },
                  {
                    key: "gen_ai.request.max_tokens",
                    value: {
                      intValue: { low: 1000, high: 0, unsigned: false },
                    },
                  },
                  {
                    key: "langfuse.observation.prompt.name",
                    value: { stringValue: "analysis-prompt" },
                  },
                  {
                    key: "langfuse.observation.prompt.version",
                    value: { intValue: { low: 3, high: 0, unsigned: false } },
                  },
                  {
                    key: "langfuse.observation.usage_details",
                    value: {
                      stringValue:
                        '{"input": 500, "output": 200, "total": 700}',
                    },
                  },
                  {
                    key: "langfuse.observation.cost_details",
                    value: {
                      stringValue: '{"input": 0.015, "output": 0.030}',
                    },
                  },
                  {
                    key: "langfuse.observation.metadata.request_id",
                    value: { stringValue: '"req-12345"' },
                  },
                  {
                    key: "langfuse.observation.metadata.source",
                    value: { stringValue: '"api"' },
                  },
                  {
                    key: "langfuse.trace.name",
                    value: { stringValue: "full-test-trace" },
                  },
                  { key: "user.id", value: { stringValue: "user-full-test" } },
                  {
                    key: "session.id",
                    value: { stringValue: "session-full-test" },
                  },
                  {
                    key: "langfuse.version",
                    value: { stringValue: "v1.5.0" },
                  },
                  {
                    key: "langfuse.trace.tags",
                    value: {
                      arrayValue: {
                        values: [
                          { stringValue: "production" },
                          { stringValue: "high-priority" },
                          { stringValue: "monitored" },
                        ],
                      },
                    },
                  },
                ],
                status: { code: 2, message: "Error" },
              },
            ],
          },
        ],
      };

      const observations =
        await processOtelSpanToObservationForEval(fullOtelSpan);

      expect(observations).toHaveLength(1);
      const obs = observations[0];

      // Validate schema conformance
      const result = observationForEvalSchema.safeParse(obs);
      expect(result.success).toBe(true);

      // Validate all fields from observationForEvalSchema are present
      const schemaKeys = Object.keys(observationForEvalSchema.shape);
      for (const key of schemaKeys) {
        expect(obs).toHaveProperty(key);
      }

      // Validate specific field values
      expect(obs.span_id).toBe("1234567890abcdef");
      expect(obs.trace_id).toBe("abcdef1234567890abcdef1234567890");
      expect(obs.parent_span_id).toBe("fedcba0987654321");
      expect(obs.type).toBe("GENERATION");
      expect(obs.name).toBe("full-test-observation");
      expect(obs.environment).toBe("staging");
      expect(obs.version).toBe("v1.5.0");
      expect(obs.release).toBe("v2.0.0");
      expect(obs.level).toBe("ERROR");
      expect(obs.status_message).toBe("Rate limit exceeded");
      expect(obs.trace_name).toBe("full-test-trace");
      expect(obs.user_id).toBe("user-full-test");
      expect(obs.session_id).toBe("session-full-test");
      expect(obs.tags).toEqual(["production", "high-priority", "monitored"]);
      expect(obs.provided_model_name).toBe("claude-3-opus");
      expect(obs.model_parameters).toEqual({
        temperature: 0.5,
        max_tokens: 1000,
      });
      expect(obs.prompt_name).toBe("analysis-prompt");
      expect(obs.prompt_version).toBe(3);
      expect(obs.input).toBe('{"query": "test input"}');
      expect(obs.output).toBe('{"result": "test output"}');
    });

    it("should handle experiment fields correctly", async () => {
      const experimentSpan = {
        resource: { attributes: [] },
        scopeSpans: [
          {
            scope: { name: "langfuse-sdk", version: "3.0.0" },
            spans: [
              {
                traceId: createBufferId("1234567890123456789012345678abcd"),
                spanId: createBufferId("exp1234567890123"),
                name: "experiment-run",
                kind: 1,
                startTimeUnixNano: createNanoTimestamp(
                  BigInt(1738241587865000000),
                ),
                endTimeUnixNano: createNanoTimestamp(
                  BigInt(1738241589310000000),
                ),
                attributes: [
                  {
                    key: "langfuse.observation.type",
                    value: { stringValue: "generation" },
                  },
                  {
                    key: "langfuse.experiment.id",
                    value: { stringValue: "exp-001" },
                  },
                  {
                    key: "langfuse.experiment.name",
                    value: { stringValue: "Prompt Optimization v2" },
                  },
                  {
                    key: "langfuse.experiment.description",
                    value: { stringValue: "Testing new prompt templates" },
                  },
                  {
                    key: "langfuse.experiment.dataset.id",
                    value: { stringValue: "dataset-test-001" },
                  },
                  {
                    key: "langfuse.experiment.item.id",
                    value: { stringValue: "item-123" },
                  },
                  {
                    key: "langfuse.experiment.item.expected_output",
                    value: { stringValue: '{"expected": "result"}' },
                  },
                  {
                    key: "langfuse.observation.input",
                    value: { stringValue: '{"test": "input"}' },
                  },
                  {
                    key: "langfuse.observation.output",
                    value: { stringValue: '{"test": "output"}' },
                  },
                ],
                status: {},
              },
            ],
          },
        ],
      };

      const observations =
        await processOtelSpanToObservationForEval(experimentSpan);

      expect(observations).toHaveLength(1);
      const obs = observations[0];

      // Validate schema conformance
      const result = observationForEvalSchema.safeParse(obs);
      expect(result.success).toBe(true);

      // Validate experiment fields
      expect(obs.experiment_id).toBe("exp-001");
      expect(obs.experiment_name).toBe("Prompt Optimization v2");
      expect(obs.experiment_description).toBe("Testing new prompt templates");
      expect(obs.experiment_dataset_id).toBe("dataset-test-001");
      expect(obs.experiment_item_id).toBe("item-123");
      expect(obs.experiment_item_expected_output).toBe(
        '{"expected": "result"}',
      );
    });
  });

  describe("Edge cases", () => {
    it("should handle spans with empty strings correctly", async () => {
      const emptyStringSpan = {
        resource: { attributes: [] },
        scopeSpans: [
          {
            scope: { name: "langfuse-sdk", version: "3.0.0" },
            spans: [
              {
                traceId: createBufferId("12345678901234567890123456789012"),
                spanId: createBufferId("empty123456789ab"),
                name: "",
                kind: 1,
                startTimeUnixNano: createNanoTimestamp(
                  BigInt(1738241687865000000),
                ),
                endTimeUnixNano: createNanoTimestamp(
                  BigInt(1738241689310000000),
                ),
                attributes: [
                  {
                    key: "langfuse.observation.type",
                    value: { stringValue: "span" },
                  },
                  {
                    key: "langfuse.observation.input",
                    value: { stringValue: "" },
                  },
                  {
                    key: "langfuse.observation.output",
                    value: { stringValue: "" },
                  },
                ],
                status: {},
              },
            ],
          },
        ],
      };

      const observations =
        await processOtelSpanToObservationForEval(emptyStringSpan);

      expect(observations).toHaveLength(1);
      const obs = observations[0];

      // Validate schema conformance
      const result = observationForEvalSchema.safeParse(obs);
      expect(result.success).toBe(true);

      // Empty name should use span name (which is empty)
      expect(obs.name).toBe("");
    });

    it("should handle spans with special characters in values", async () => {
      const specialCharsSpan = {
        resource: { attributes: [] },
        scopeSpans: [
          {
            scope: { name: "langfuse-sdk", version: "3.0.0" },
            spans: [
              {
                traceId: createBufferId("12345678901234561234567890123456"),
                spanId: createBufferId("spec123456789abc"),
                name: "span-with-special-chars",
                kind: 1,
                startTimeUnixNano: createNanoTimestamp(
                  BigInt(1738241787865000000),
                ),
                endTimeUnixNano: createNanoTimestamp(
                  BigInt(1738241789310000000),
                ),
                attributes: [
                  {
                    key: "langfuse.observation.type",
                    value: { stringValue: "span" },
                  },
                  {
                    key: "langfuse.observation.input",
                    value: {
                      stringValue:
                        '{"message": "Hello! <script>alert(1)</script>"}',
                    },
                  },
                  {
                    key: "langfuse.observation.output",
                    value: {
                      stringValue: 'Line1\\nLine2\\tTabbed\\"Quoted\\"',
                    },
                  },
                  {
                    key: "langfuse.trace.tags",
                    value: {
                      arrayValue: {
                        values: [
                          { stringValue: "tag-with-dash" },
                          { stringValue: "tag_with_underscore" },
                          { stringValue: "tag.with" },
                        ],
                      },
                    },
                  },
                ],
                status: {},
              },
            ],
          },
        ],
      };

      const observations =
        await processOtelSpanToObservationForEval(specialCharsSpan);

      expect(observations).toHaveLength(1);
      const obs = observations[0];

      // Validate schema conformance
      const result = observationForEvalSchema.safeParse(obs);
      expect(result.success).toBe(true);

      // Validate special characters are preserved
      expect(obs.input).toContain("<script>");
      expect(obs.tags).toEqual([
        "tag-with-dash",
        "tag_with_underscore",
        "tag.with",
      ]);
    });

    it("should handle spans with very large input/output", async () => {
      const largeContent = "x".repeat(100000); // 100KB of data
      const largeSpan = {
        resource: { attributes: [] },
        scopeSpans: [
          {
            scope: { name: "langfuse-sdk", version: "3.0.0" },
            spans: [
              {
                traceId: createBufferId("12345678901234567890123456781234"),
                spanId: createBufferId("large12345678901"),
                name: "large-io-span",
                kind: 1,
                startTimeUnixNano: createNanoTimestamp(
                  BigInt(1738241887865000000),
                ),
                endTimeUnixNano: createNanoTimestamp(
                  BigInt(1738241889310000000),
                ),
                attributes: [
                  {
                    key: "langfuse.observation.type",
                    value: { stringValue: "generation" },
                  },
                  {
                    key: "langfuse.observation.input",
                    value: { stringValue: largeContent },
                  },
                  {
                    key: "langfuse.observation.output",
                    value: { stringValue: largeContent },
                  },
                ],
                status: {},
              },
            ],
          },
        ],
      };

      const observations = await processOtelSpanToObservationForEval(largeSpan);

      expect(observations).toHaveLength(1);
      const obs = observations[0];

      // Validate schema conformance
      const result = observationForEvalSchema.safeParse(obs);
      expect(result.success).toBe(true);

      // Validate large content is preserved
      expect(obs.input?.length).toBe(100000);
      expect(obs.output?.length).toBe(100000);
    });

    it("should handle different observation types", async () => {
      const observationTypes = [
        "span",
        "generation",
        "event",
        "agent",
        "tool",
        "chain",
        "retriever",
        "evaluator",
        "guardrail",
        "embedding",
      ];

      for (const obsType of observationTypes) {
        // Create valid hex string for traceId (32 chars = 16 bytes)
        const typeHex = obsType.padEnd(16, "0").slice(0, 16);
        const traceIdHex = `${typeHex}${typeHex}`;
        // Create valid hex string for spanId (16 chars = 8 bytes)
        const spanIdHex = `${obsType.slice(0, 8).padEnd(8, "0")}12345678`;

        const typeSpan = {
          resource: { attributes: [] },
          scopeSpans: [
            {
              scope: { name: "langfuse-sdk", version: "3.0.0" },
              spans: [
                {
                  traceId: createBufferId(traceIdHex),
                  spanId: createBufferId(spanIdHex),
                  name: `${obsType}-test`,
                  kind: 1,
                  startTimeUnixNano: createNanoTimestamp(
                    BigInt(1738241987865000000),
                  ),
                  endTimeUnixNano: createNanoTimestamp(
                    BigInt(1738241989310000000),
                  ),
                  attributes: [
                    {
                      key: "langfuse.observation.type",
                      value: { stringValue: obsType },
                    },
                  ],
                  status: {},
                },
              ],
            },
          ],
        };

        const observations =
          await processOtelSpanToObservationForEval(typeSpan);

        expect(observations).toHaveLength(1);
        expect(observations[0].type).toBe(obsType.toUpperCase());

        // Validate schema conformance for each type
        const result = observationForEvalSchema.safeParse(observations[0]);
        expect(result.success).toBe(true);
      }
    });

    it("should handle metadata with nested objects", async () => {
      const nestedMetadataSpan = {
        resource: { attributes: [] },
        scopeSpans: [
          {
            scope: { name: "langfuse-sdk", version: "3.0.0" },
            spans: [
              {
                traceId: createBufferId("12345678901234567890123456789abc"),
                spanId: createBufferId("nest123456789012"),
                name: "nested-metadata-span",
                kind: 1,
                startTimeUnixNano: createNanoTimestamp(
                  BigInt(1738242087865000000),
                ),
                endTimeUnixNano: createNanoTimestamp(
                  BigInt(1738242089310000000),
                ),
                attributes: [
                  {
                    key: "langfuse.observation.type",
                    value: { stringValue: "span" },
                  },
                  {
                    key: "langfuse.observation.metadata",
                    value: {
                      stringValue: JSON.stringify({
                        nested: {
                          deeply: {
                            value: "found",
                          },
                        },
                        array: [1, 2, 3],
                        mixed: {
                          string: "text",
                          number: 42,
                          boolean: true,
                        },
                      }),
                    },
                  },
                ],
                status: {},
              },
            ],
          },
        ],
      };

      const observations =
        await processOtelSpanToObservationForEval(nestedMetadataSpan);

      expect(observations).toHaveLength(1);
      const obs = observations[0];

      // Validate schema conformance
      const result = observationForEvalSchema.safeParse(obs);
      expect(result.success).toBe(true);

      // Validate metadata is present (as flattened or stringified)
      expect(obs.metadata).toBeDefined();
      expect(typeof obs.metadata).toBe("object");
    });
  });

  describe("Multiple spans in single batch", () => {
    it("should process multiple spans and all conform to schema", async () => {
      const multiSpanBatch = {
        resource: {
          attributes: [
            { key: "langfuse.environment", value: { stringValue: "test" } },
          ],
        },
        scopeSpans: [
          {
            scope: { name: "langfuse-sdk", version: "3.0.0" },
            spans: [
              {
                traceId: createBufferId("12345678901234567890123456789def"),
                spanId: createBufferId("aaaa1234567890ab"),
                name: "span-1",
                kind: 1,
                startTimeUnixNano: createNanoTimestamp(
                  BigInt(1738242187865000000),
                ),
                endTimeUnixNano: createNanoTimestamp(
                  BigInt(1738242189310000000),
                ),
                attributes: [
                  {
                    key: "langfuse.observation.type",
                    value: { stringValue: "span" },
                  },
                ],
                status: {},
              },
              {
                traceId: createBufferId("12345678901234567890123456789def"),
                spanId: createBufferId("bbbb2345678901bc"),
                parentSpanId: createBufferId("aaaa1234567890ab"),
                name: "generation-1",
                kind: 1,
                startTimeUnixNano: createNanoTimestamp(
                  BigInt(1738242189400000000),
                ),
                endTimeUnixNano: createNanoTimestamp(
                  BigInt(1738242189500000000),
                ),
                attributes: [
                  {
                    key: "langfuse.observation.type",
                    value: { stringValue: "generation" },
                  },
                  {
                    key: "langfuse.observation.model.name",
                    value: { stringValue: "gpt-4" },
                  },
                ],
                status: {},
              },
              {
                traceId: createBufferId("12345678901234567890123456789def"),
                spanId: createBufferId("cccc3456789012cd"),
                parentSpanId: createBufferId("aaaa1234567890ab"),
                name: "tool-call",
                kind: 1,
                startTimeUnixNano: createNanoTimestamp(
                  BigInt(1738242189600000000),
                ),
                endTimeUnixNano: createNanoTimestamp(
                  BigInt(1738242189700000000),
                ),
                attributes: [
                  {
                    key: "langfuse.observation.type",
                    value: { stringValue: "tool" },
                  },
                ],
                status: {},
              },
            ],
          },
        ],
      };

      const observations =
        await processOtelSpanToObservationForEval(multiSpanBatch);

      expect(observations).toHaveLength(3);

      // All observations should have the same trace_id
      expect(observations[0].trace_id).toBe("12345678901234567890123456789def");
      expect(observations[1].trace_id).toBe("12345678901234567890123456789def");
      expect(observations[2].trace_id).toBe("12345678901234567890123456789def");

      // Parent-child relationships should be preserved
      // Note: nullish fields may be null or undefined depending on the processing path
      expect(observations[0].parent_span_id).toBeFalsy();
      expect(observations[1].parent_span_id).toBe("aaaa1234567890ab");
      expect(observations[2].parent_span_id).toBe("aaaa1234567890ab");

      // All should conform to schema
      for (const obs of observations) {
        const result = observationForEvalSchema.safeParse(obs);
        expect(result.success).toBe(true);
      }
    });
  });

  describe("Usage and cost details", () => {
    it("should correctly extract and transform usage details from OTEL spans", async () => {
      const usageSpan = {
        resource: { attributes: [] },
        scopeSpans: [
          {
            scope: { name: "langfuse-sdk", version: "3.0.0" },
            spans: [
              {
                traceId: createBufferId("1234567890123456789012345678cdef"),
                spanId: createBufferId("usage12345678901"),
                name: "usage-test",
                kind: 1,
                startTimeUnixNano: createNanoTimestamp(
                  BigInt(1738242287865000000),
                ),
                endTimeUnixNano: createNanoTimestamp(
                  BigInt(1738242289310000000),
                ),
                attributes: [
                  {
                    key: "langfuse.observation.type",
                    value: { stringValue: "generation" },
                  },
                  {
                    key: "langfuse.observation.model.name",
                    value: { stringValue: "gpt-4" },
                  },
                  {
                    key: "langfuse.observation.usage_details",
                    value: {
                      stringValue: JSON.stringify({
                        input: 100,
                        output: 200,
                        total: 300,
                        cached_input: 50,
                      }),
                    },
                  },
                  {
                    key: "langfuse.observation.cost_details",
                    value: {
                      stringValue: JSON.stringify({
                        input: 0.01,
                        output: 0.02,
                        total: 0.03,
                      }),
                    },
                  },
                ],
                status: {},
              },
            ],
          },
        ],
      };

      const observations = await processOtelSpanToObservationForEval(usageSpan);

      expect(observations).toHaveLength(1);
      const obs = observations[0];

      // Validate schema conformance
      const result = observationForEvalSchema.safeParse(obs);
      expect(result.success).toBe(true);

      // Validate usage details
      expect(obs.provided_usage_details).toEqual({
        input: 100,
        output: 200,
        total: 300,
        cached_input: 50,
      });

      // Validate cost details
      expect(obs.provided_cost_details).toEqual({
        input: 0.01,
        output: 0.02,
        total: 0.03,
      });
    });
  });

  describe("Tool calls extraction", () => {
    it("should correctly extract tool definitions and calls", async () => {
      const toolCallSpan = {
        resource: { attributes: [] },
        scopeSpans: [
          {
            scope: { name: "langfuse-sdk", version: "3.0.0" },
            spans: [
              {
                traceId: createBufferId("123456789012345678901234567890ab"),
                spanId: createBufferId("tool1234567890ab"),
                name: "tool-call-test",
                kind: 1,
                startTimeUnixNano: createNanoTimestamp(
                  BigInt(1738242387865000000),
                ),
                endTimeUnixNano: createNanoTimestamp(
                  BigInt(1738242389310000000),
                ),
                attributes: [
                  {
                    key: "langfuse.observation.type",
                    value: { stringValue: "generation" },
                  },
                  {
                    key: "langfuse.observation.model.name",
                    value: { stringValue: "gpt-4" },
                  },
                  {
                    key: "langfuse.observation.input",
                    value: {
                      stringValue: JSON.stringify({
                        messages: [
                          { role: "user", content: "What is the weather?" },
                        ],
                        tools: [
                          {
                            type: "function",
                            function: {
                              name: "get_weather",
                              description: "Get current weather",
                              parameters: {
                                type: "object",
                                properties: {
                                  location: { type: "string" },
                                },
                              },
                            },
                          },
                        ],
                      }),
                    },
                  },
                  {
                    key: "langfuse.observation.output",
                    value: {
                      stringValue: JSON.stringify({
                        choices: [
                          {
                            message: {
                              role: "assistant",
                              tool_calls: [
                                {
                                  id: "call_123",
                                  type: "function",
                                  function: {
                                    name: "get_weather",
                                    arguments: '{"location": "San Francisco"}',
                                  },
                                },
                              ],
                            },
                          },
                        ],
                      }),
                    },
                  },
                ],
                status: {},
              },
            ],
          },
        ],
      };

      const observations =
        await processOtelSpanToObservationForEval(toolCallSpan);

      expect(observations).toHaveLength(1);
      const obs = observations[0];

      // Validate schema conformance
      const result = observationForEvalSchema.safeParse(obs);
      expect(result.success).toBe(true);

      // Tool definitions and calls are extracted by IngestionService
      // They should be present in the observation
      expect(obs.tool_definitions).toBeDefined();
      expect(obs.tool_calls).toBeDefined();
      expect(obs.tool_call_names).toBeDefined();
    });
  });
});
