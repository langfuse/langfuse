/**
 * `langfuse.ingestion.metadata_dropped` counter at the OTel metadata drop
 * site (`parseMetadataAttribute` drop branches).
 *
 * Spec under test:
 * - Counter name: langfuse.ingestion.metadata_dropped
 * - Tags: reason ∈ {non_object_top_level, parse_failure, primitive},
 *   source = otel, domain ∈ {trace, observation, experiment, experiment_item}, projectId (low
 *   cardinality: only projects emitting malformed metadata appear),
 *   attributeKey (closed set of Langfuse constants), sdkName, sdkVersion,
 *   and — for parse_failure only — kind (value-shape sub-classification)
 * - No behavior change to what the processor returns
 * - Dotted-key metadata (langfuse.*.metadata.foo) stays increment-free
 *
 * recordIncrement is mocked at module level: the processor imports it from
 * the src/server barrel, which re-exports ./instrumentation — mocking the
 * instrumentation module intercepts the call. The "mock plumbing" test
 * proves that interception chain holds.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

const { recordIncrementMock } = vi.hoisted(() => ({
  recordIncrementMock: vi.fn(),
}));

vi.mock("../instrumentation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../instrumentation")>();
  return {
    ...actual,
    recordIncrement: recordIncrementMock,
  };
});

// processToIngestionEvents awaits redis.set (seen-traces tracking); CI's
// tests-shared job has REDIS_HOST set but no Redis server, so ioredis
// queues the command forever and the suite times out. Stub the client.
vi.mock("../redis/redis", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../redis/redis")>()),
  redis: { set: vi.fn().mockResolvedValue("OK") },
}));

import {
  OtelIngestionProcessor,
  type ResourceSpan,
} from "./OtelIngestionProcessor";
import * as serverBarrel from "../index";

const METRIC = "langfuse.ingestion.metadata_dropped";
const ARRAY_ATTRIBUTE_DROPPED_METRIC =
  "langfuse.ingestion.otel.array_attribute_dropped";
const PROJECT_ID = "test-project-lfe-14342";

const createProcessor = () =>
  new OtelIngestionProcessor({
    projectId: PROJECT_ID,
    publicKey: "pk-test",
    sdkName: "python",
    sdkVersion: "3.8.1",
  });

type OtelAttribute = {
  key: string;
  value: Record<string, unknown> | null | undefined;
};

const buildBatch = (attributes: OtelAttribute[]): ResourceSpan[] => [
  {
    resource: {
      attributes: [{ key: "service.name", value: { stringValue: "test-svc" } }],
    },
    scopeSpans: [
      {
        scope: {
          name: "langfuse-sdk",
          version: "3.8.1",
          attributes: [
            { key: "public_key", value: { stringValue: "pk-test" } },
          ],
        },
        spans: [
          {
            traceId: Buffer.from("0123456789abcdef0123456789abcdef", "hex"),
            spanId: Buffer.from("0123456789abcdef", "hex"),
            name: "test-span",
            kind: 1,
            startTimeUnixNano: "1752384000000000000",
            endTimeUnixNano: "1752384001000000000",
            attributes: [
              {
                key: "langfuse.observation.type",
                value: { stringValue: "span" },
              },
              ...attributes,
            ],
            status: {},
          },
        ],
      },
    ],
  },
];

const droppedCalls = () =>
  recordIncrementMock.mock.calls.filter(([stat]) => stat === METRIC);

const expectDropTags = (
  call: unknown[],
  expected: { reason: string; source: string; domain: string },
) => {
  const [, value, tags] = call as [
    string,
    number | undefined,
    Record<string, string | number>,
  ];
  // recordIncrement(stat) defaults to 1; explicit 1 is equivalent.
  expect(value ?? 1).toBe(1);
  expect(tags).toEqual(expect.objectContaining(expected));
  // projectId is a metric tag (low cardinality) for tenant attribution.
  expect(tags?.projectId).toBe(PROJECT_ID);
  // sdkName/sdkVersion attribute the emitting client.
  expect(tags?.sdkName).toBe("python");
  expect(tags?.sdkVersion).toBe("3.8.1");
};

describe("OTLP empty attribute values", () => {
  it.each([
    ["v3", "opentelemetry.instrumentation.openai"],
    ["v4", "opentelemetry.instrumentation.openai"],
    ["v3", "ai"],
    ["v4", "ai"],
  ])(
    "falls back to measured usage for valueless attributes on %s with %s",
    async (path, scope) => {
      const batch = buildBatch([
        { key: "gen_ai.usage.prompt_tokens", value: undefined },
        { key: "gen_ai.usage.input_tokens", value: { intValue: "42" } },
        { key: "gen_ai.usage.completion_tokens", value: null },
        { key: "gen_ai.usage.output_tokens", value: { intValue: "7" } },
      ]);
      batch[0].scopeSpans![0].scope!.name = scope;
      const processor = createProcessor();
      const observations =
        path === "v3"
          ? (await processor.processToIngestionEvents(batch))
              .filter((event) => event.type === "span-create")
              .map((event) => event.body)
          : processor.processToEvent(batch);

      expect(observations).toHaveLength(1);
      expect(observations[0]).toMatchObject({
        [path === "v3" ? "usageDetails" : "providedUsageDetails"]: {
          input: 42,
          output: 7,
        },
      });
    },
  );

  it.each(["opentelemetry.instrumentation.openai", "ai"])(
    "keeps explicit zero usage ahead of fallback counts with %s",
    (scope) => {
      const batch = buildBatch([
        { key: "gen_ai.usage.prompt_tokens", value: { intValue: "0" } },
        { key: "gen_ai.usage.input_tokens", value: { intValue: "42" } },
        { key: "gen_ai.usage.completion_tokens", value: { doubleValue: 0 } },
        { key: "gen_ai.usage.output_tokens", value: { intValue: "7" } },
      ]);
      batch[0].scopeSpans![0].scope!.name = scope;

      expect(createProcessor().processToEvent(batch)).toMatchObject([
        { providedUsageDetails: { input: 0, output: 0 } },
      ]);
    },
  );

  it("uses provider token details when AI SDK cache/reasoning attributes are valueless", () => {
    const batch = buildBatch([
      { key: "gen_ai.usage.input_tokens", value: { intValue: "42" } },
      { key: "gen_ai.usage.output_tokens", value: { intValue: "7" } },
      { key: "ai.usage.cachedInputTokens", value: undefined },
      { key: "ai.usage.reasoningTokens", value: null },
      {
        key: "ai.response.providerMetadata",
        value: {
          stringValue: JSON.stringify({
            openai: { cachedPromptTokens: 2, reasoningTokens: 1 },
          }),
        },
      },
    ]);
    batch[0].scopeSpans![0].scope!.name = "ai";

    expect(createProcessor().processToEvent(batch)).toMatchObject([
      {
        providedUsageDetails: {
          input: 40,
          output: 6,
          input_cached_tokens: 2,
          output_reasoning_tokens: 1,
        },
      },
    ]);
  });

  it.each([
    ["ai.operationId", "ai"],
    ["ai.toolCall.name", "ai"],
    ["genkit:name", "genkit-tracer"],
  ])("uses the span name when %s is valueless", async (key, scope) => {
    const batch = buildBatch([{ key, value: undefined }]);
    batch[0].scopeSpans![0].scope!.name = scope;

    const events = await createProcessor().processToIngestionEvents(batch);
    const trace = events.find((event) => event.type === "trace-create");
    const observation = events.find((event) => event.type !== "trace-create");

    expect(trace?.body).toMatchObject({ name: "test-span" });
    expect(observation?.body).toMatchObject({ name: "test-span" });
  });

  it("omits a valueless name from a child span's trace update", async () => {
    const batch = buildBatch([
      { key: "langfuse.trace.name", value: undefined },
      { key: "langfuse.user.id", value: { stringValue: "user-test" } },
    ]);
    batch[0].scopeSpans![0].spans![0].parentSpanId = Buffer.from(
      "fedcba9876543210",
      "hex",
    );

    const events = await createProcessor().processToIngestionEvents(batch);
    const trace = events.find((event) => event.type === "trace-create");

    expect(trace?.body).toMatchObject({ userId: "user-test" });
    expect(trace?.body.name).toBeUndefined();
  });

  it("keeps the legacy Python SDK span type when generation attributes are valueless", () => {
    const batch = buildBatch([
      { key: "langfuse.observation.model.name", value: undefined },
      { key: "langfuse.observation.usage_details", value: null },
    ]);
    batch[0].scopeSpans![0].scope!.version = "3.3.0";
    batch[0].resource!.attributes!.push({
      key: "telemetry.sdk.language",
      value: { stringValue: "python" },
    });

    expect(createProcessor().processToEvent(batch)[0]).toMatchObject({
      type: "SPAN",
    });
  });

  it.each([
    {
      valueless: "ai.prompt.messages",
      fallback: "ai.prompt",
      field: "input",
    },
    {
      valueless: "ai.result.text",
      fallback: "ai.response.object",
      field: "output",
    },
    {
      valueless: "ai.toolCall.result",
      fallback: "ai.response.object",
      field: "output",
    },
    {
      valueless: "ai.response.text",
      fallback: "ai.response.object",
      field: "output",
      companion: { key: "ai.response.toolCalls", value: { stringValue: "[]" } },
    },
  ])(
    "uses the AI SDK fallback when %s is valueless",
    ({ valueless, fallback, field, companion }) => {
      const batch = buildBatch([
        { key: valueless, value: undefined },
        { key: fallback, value: { stringValue: "fallback-value" } },
        ...(companion ? [companion] : []),
      ]);
      batch[0].scopeSpans![0].scope!.name = "ai";

      const event = createProcessor().processToEvent(batch)[0];

      expect(event).toMatchObject({ [field]: "fallback-value" });
    },
  );

  it("uses AI SDK compatibility fallbacks for valueless finish reason and provider", () => {
    const batch = buildBatch([
      { key: "gen_ai.response.finish_reasons", value: undefined },
      { key: "gen_ai.finishReason", value: { stringValue: "stop" } },
      { key: "gen_ai.system", value: null },
      { key: "ai.model.provider", value: { stringValue: "openai" } },
    ]);
    batch[0].scopeSpans![0].scope!.name = "ai";

    expect(createProcessor().processToEvent(batch)[0]).toMatchObject({
      modelParameters: { finishReason: "stop", system: "openai" },
    });
  });

  it("drops valueless prefixed model parameters while preserving falsy values", () => {
    const batch = buildBatch([
      { key: "gen_ai.request.temperature", value: undefined },
      { key: "gen_ai.request.max_tokens", value: { intValue: "0" } },
      { key: "llm.invocation_parameters.stream", value: { boolValue: false } },
      { key: "llm.invocation_parameters.empty", value: { stringValue: "" } },
    ]);

    expect(createProcessor().processToEvent(batch)[0].modelParameters).toEqual({
      max_tokens: 0,
      stream: "false",
      empty: "",
    });
  });

  it.each([
    "gen_ai.prompt.0.content",
    "gen_ai.completion.0.content",
    "llm.input_messages.0.content",
    "llm.output_messages.0.content",
  ])("ignores valueless %s and uses modern GenAI input/output", (valueless) => {
    const batch = buildBatch([
      { key: valueless, value: undefined },
      {
        key: "gen_ai.input.messages",
        value: { stringValue: "modern-input" },
      },
      {
        key: "gen_ai.output.messages",
        value: { stringValue: "modern-output" },
      },
    ]);

    expect(createProcessor().processToEvent(batch)[0]).toMatchObject({
      input: "modern-input",
      output: "modern-output",
    });
  });

  it.each(["v3", "v4"])(
    "retains both spans with missing and null attribute values on %s",
    async (path) => {
      const batch = buildBatch([
        { key: "langfuse.observation.metadata.empty", value: undefined },
        { key: "langfuse.observation.metadata.null", value: null },
      ]);
      batch[0].resource!.attributes!.push({
        key: "resource.empty",
        value: undefined,
      });
      const scopeSpan = batch[0].scopeSpans![0];
      scopeSpan.scope!.attributes!.push({
        key: "scope.empty",
        value: undefined,
      });
      scopeSpan.spans!.unshift({
        ...scopeSpan.spans![0],
        spanId: Buffer.from("fedcba9876543210", "hex"),
        name: "sibling-span",
        attributes: [],
      });

      const processor = createProcessor();
      const observations =
        path === "v3"
          ? (await processor.processToIngestionEvents(batch))
              .filter((event) => event.type === "span-create")
              .map((event) => event.body)
          : processor.processToEvent(batch);

      expect(observations).toHaveLength(2);
      expect(observations[0]).toMatchObject({
        [path === "v3" ? "id" : "spanId"]: "fedcba9876543210",
        name: "sibling-span",
      });
      expect(observations[1]).toMatchObject({
        [path === "v3" ? "id" : "spanId"]: "0123456789abcdef",
        metadata: {
          empty: null,
          null: null,
          resourceAttributes: { "resource.empty": null },
          scope: { attributes: { "scope.empty": null } },
        },
      });
    },
  );

  it.each(["v3", "v4"])(
    "preserves empty arrays and falsy array elements on %s",
    async (path) => {
      const batch = buildBatch([
        {
          key: "langfuse.observation.metadata.emptyArray",
          value: { arrayValue: {} },
        },
        {
          key: "langfuse.observation.metadata.values",
          value: {
            arrayValue: {
              values: [
                { stringValue: "" },
                { boolValue: false },
                { intValue: "0" },
                { doubleValue: 0 },
                { arrayValue: {} },
              ],
            },
          },
        },
      ]);
      const processor = createProcessor();
      const observations =
        path === "v3"
          ? (await processor.processToIngestionEvents(batch))
              .filter((event) => event.type === "span-create")
              .map((event) => event.body)
          : processor.processToEvent(batch);

      expect(observations).toHaveLength(1);
      expect(observations[0]).toMatchObject({
        metadata: { emptyArray: [], values: ["", false, 0, 0, []] },
      });
    },
  );
});

describe("gateway metadata", () => {
  it.each([
    ["v3", "langfuse-ai-gateway"],
    ["v4", "langfuse-ai-gateway"],
    ["v3", "other-instrumentation"],
    ["v4", "other-instrumentation"],
  ])(
    "preserves canonical fields and non-duplicate metadata for %s %s",
    async (path, scope) => {
      const completionStartTime = "2025-07-13T05:20:00.500Z";
      const modelParameters = {
        service_tier: "default",
        stream: true,
        reasoning: { effort: "low" },
      };
      const usageDetails = { input: 10, output: 21 };
      const canonicalAttributes = {
        "langfuse.observation.type": "generation",
        "langfuse.observation.level": "ERROR",
        "langfuse.observation.status_message": "HTTP 429: rate limited",
        "langfuse.observation.model.name": "test-model",
        "langfuse.observation.model.parameters":
          JSON.stringify(modelParameters),
        "langfuse.observation.usage_details": JSON.stringify(usageDetails),
        "langfuse.observation.cost_details": JSON.stringify({ total: 0.001 }),
        "langfuse.observation.completion_start_time": completionStartTime,
        "user.id": "user-test",
        "session.id": "session-test",
        "langfuse.trace.name": "trace-test",
        "langfuse.trace.tags": JSON.stringify(["tag-a", "tag-b"]),
        "langfuse.environment": "staging",
      };
      const batch = buildBatch(
        Object.entries({
          ...canonicalAttributes,
          "langfuse.observation.input": '[{"role":"user","content":"Hi"}]',
          "langfuse.observation.output": '[{"type":"message","content":[]}]',
          "langfuse.observation.metadata": JSON.stringify({
            "langfuse.gateway.provider.request.id": "req-test",
          }),
          "langfuse.observation.metadata.langfuse.gateway.api-key.id":
            "key-test",
          "custom.attribute": "keep-custom",
          "langfuse.observation.custom": "keep-unknown",
        }).map(([key, value]) => ({ key, value: { stringValue: value } })),
      );
      batch[0].scopeSpans![0].scope!.name = scope;
      const processor = createProcessor();
      const observation =
        path === "v4"
          ? processor.processToEvent(batch)[0]
          : (await processor.processToIngestionEvents(batch)).find(
              (event) => event.type === "generation-create",
            )?.body;

      expect(observation).toMatchObject({
        level: "ERROR",
        statusMessage: "HTTP 429: rate limited",
        modelParameters: {
          service_tier: "default",
          stream: "true",
          reasoning: '{"effort":"low"}',
        },
        completionStartTime,
        environment: "staging",
        input: '[{"role":"user","content":"Hi"}]',
        output: '[{"type":"message","content":[]}]',
        ...(path === "v4"
          ? {
              type: "GENERATION",
              userId: "user-test",
              sessionId: "session-test",
              traceName: "trace-test",
              tags: ["tag-a", "tag-b"],
              modelName: "test-model",
              providedUsageDetails: usageDetails,
              providedCostDetails: { total: 0.001 },
            }
          : {
              model: "test-model",
              usageDetails,
              costDetails: { total: 0.001 },
            }),
      });
      expect(observation?.metadata).toEqual({
        "langfuse.gateway.provider.request.id": "req-test",
        "langfuse.gateway.api-key.id": "key-test",
        attributes: {
          ...(scope === "langfuse-ai-gateway" ? {} : canonicalAttributes),
          "custom.attribute": "keep-custom",
          "langfuse.observation.custom": "keep-unknown",
        },
        resourceAttributes: { "service.name": "test-svc" },
        scope: {
          name: scope,
          version: "3.8.1",
          attributes: { public_key: "pk-test" },
        },
      });
    },
  );
});

describe("OTel metadata_dropped metric", () => {
  beforeEach(() => {
    recordIncrementMock.mockClear();
  });

  it("mock plumbing: server barrel re-exports the mocked recordIncrement", () => {
    // Load-bearing sanity: the processor imports recordIncrement from the
    // barrel; if this fails, every red test below would be a false red.
    expect(serverBarrel.recordIncrement).toBe(recordIncrementMock);
  });

  describe("drop branches on langfuse.observation.metadata (source=otel, domain=observation)", () => {
    it("increments with reason=parse_failure when the metadata string is invalid JSON", async () => {
      const events = await createProcessor().processToIngestionEvents(
        buildBatch([
          {
            key: "langfuse.observation.metadata",
            value: { stringValue: "{invalid json" },
          },
        ]),
      );

      // No behavior change: events are still produced, metadata is dropped.
      expect(events.length).toBeGreaterThan(0);

      const calls = droppedCalls();
      expect(calls).toHaveLength(1);
      expectDropTags(calls[0], {
        reason: "parse_failure",
        source: "otel",
        domain: "observation",
      });
    });

    it("increments with reason=non_object_top_level when the metadata string parses to a non-object", async () => {
      const events = await createProcessor().processToIngestionEvents(
        buildBatch([
          {
            key: "langfuse.observation.metadata",
            value: { stringValue: "42" },
          },
        ]),
      );

      expect(events.length).toBeGreaterThan(0);

      const calls = droppedCalls();
      expect(calls).toHaveLength(1);
      expectDropTags(calls[0], {
        reason: "non_object_top_level",
        source: "otel",
        domain: "observation",
      });
    });

    it("increments with reason=primitive when the metadata attribute is a non-string primitive", async () => {
      const events = await createProcessor().processToIngestionEvents(
        buildBatch([
          {
            key: "langfuse.observation.metadata",
            value: { intValue: 42 },
          },
        ]),
      );

      expect(events.length).toBeGreaterThan(0);

      const calls = droppedCalls();
      expect(calls).toHaveLength(1);
      expectDropTags(calls[0], {
        reason: "primitive",
        source: "otel",
        domain: "observation",
      });
    });
  });

  describe("trace domain", () => {
    it("increments with domain=trace when langfuse.trace.metadata is dropped", async () => {
      const events = await createProcessor().processToIngestionEvents(
        buildBatch([
          {
            key: "langfuse.trace.metadata",
            value: { stringValue: "{invalid json" },
          },
        ]),
      );

      expect(events.length).toBeGreaterThan(0);

      const calls = droppedCalls();
      expect(calls.length).toBeGreaterThanOrEqual(1);
      const traceCall = calls.find(
        ([, , tags]) =>
          (tags as Record<string, string> | undefined)?.domain === "trace",
      );
      expect(traceCall).toBeDefined();
      expectDropTags(traceCall!, {
        reason: "parse_failure",
        source: "otel",
        domain: "trace",
      });
    });
  });

  describe("events path (processToEvent)", () => {
    it("increments on a dropped observation metadata attribute in the events path too", () => {
      const events = createProcessor().processToEvent(
        buildBatch([
          {
            key: "langfuse.observation.metadata",
            value: { stringValue: "{invalid json" },
          },
        ]),
      );

      expect(events.length).toBeGreaterThan(0);

      const calls = droppedCalls();
      expect(calls.length).toBeGreaterThanOrEqual(1);
      expectDropTags(calls[0], {
        reason: "parse_failure",
        source: "otel",
        domain: "observation",
      });
    });
  });

  describe("silence on valid input", () => {
    it("does not increment for a valid JSON-object metadata attribute", async () => {
      const events = await createProcessor().processToIngestionEvents(
        buildBatch([
          {
            key: "langfuse.observation.metadata",
            value: { stringValue: JSON.stringify({ env: "prod" }) },
          },
        ]),
      );

      // Fixture proof: the metadata value flows through into the output.
      expect(JSON.stringify(events)).toContain("prod");
      expect(droppedCalls()).toHaveLength(0);
    });

    it("does not increment for dotted-key metadata attributes", async () => {
      const events = await createProcessor().processToIngestionEvents(
        buildBatch([
          {
            key: "langfuse.observation.metadata.foo",
            value: { stringValue: "bar-value" },
          },
          {
            key: "langfuse.trace.metadata.baz",
            value: { stringValue: "qux-value" },
          },
        ]),
      );

      // Fixture proof: dotted-key metadata survives.
      expect(JSON.stringify(events)).toContain("bar-value");
      expect(droppedCalls()).toHaveLength(0);
    });
  });

  // Reviewer ruling 1 (round 1): one increment per dropped attribute VALUE
  // per job — deduped across the two pipelines the worker runs on the SAME
  // processor instance, and across domain extractions of a shared attribute
  // key. Domain tag of a shared key is the first-seen domain.
  describe("exactly-once semantics across pipelines and domains", () => {
    it.each([
      "langfuse.observation.metadata",
      "langfuse.trace.metadata",
      "langfuse.metadata",
      "langfuse.experiment.metadata",
    ])("counts valueless %s once across both pipelines", async (key) => {
      const batch = buildBatch([
        { key, value: undefined },
        {
          key: "langfuse.observation.metadata.empty",
          value: null,
        },
        ...(key === "langfuse.metadata"
          ? []
          : [
              {
                key: "langfuse.metadata",
                value: { stringValue: '{"env":"compat-prod"}' },
              },
            ]),
      ]);
      const processor = createProcessor();
      const ingestionEvents = await processor.processToIngestionEvents(batch);
      const events = processor.processToEvent(batch);

      expect(ingestionEvents.length).toBeGreaterThan(0);
      expect(events).toMatchObject([
        {
          metadata: {
            empty: null,
            ...(key === "langfuse.metadata" ? {} : { env: "compat-prod" }),
          },
        },
      ]);
      const calls = droppedCalls();
      expect(calls).toHaveLength(1);
      expect(calls[0][2]).toMatchObject({
        attributeKey: key,
        reason: "primitive",
        source: "otel",
      });
    });

    const expectSingleDrop = (expectedReason: string) => {
      const calls = droppedCalls();
      expect(calls).toHaveLength(1);
      const [, value, tags] = calls[0] as [
        string,
        number | undefined,
        Record<string, string | number>,
      ];
      expect(value ?? 1).toBe(1);
      expect(tags).toEqual(
        expect.objectContaining({ reason: expectedReason, source: "otel" }),
      );
      expect(["trace", "observation"]).toContain(tags?.domain);
      expect(tags?.projectId).toBe(PROJECT_ID);
    };

    it("counts a dropped attribute once when both pipelines run on one processor instance", async () => {
      // Mirrors the worker job: processToIngestionEvents then processToEvent
      // with the same parsed spans on the same instance.
      const processor = createProcessor();
      const batch = buildBatch([
        {
          key: "langfuse.observation.metadata",
          value: { stringValue: "{invalid json" },
        },
      ]);

      const ingestionEvents = await processor.processToIngestionEvents(batch);
      const events = processor.processToEvent(batch);

      expect(ingestionEvents.length).toBeGreaterThan(0);
      expect(events.length).toBeGreaterThan(0);

      const calls = droppedCalls();
      expect(calls).toHaveLength(1);
      expectDropTags(calls[0], {
        reason: "parse_failure",
        source: "otel",
        domain: "observation",
      });
    });

    it("counts the shared langfuse.metadata compat key once across trace and observation extraction", async () => {
      const events = await createProcessor().processToIngestionEvents(
        buildBatch([
          {
            key: "langfuse.metadata",
            value: { stringValue: "{invalid json" },
          },
        ]),
      );

      expect(events.length).toBeGreaterThan(0);
      expectSingleDrop("parse_failure");
    });

    // Reviewer ruling 2 (round 1): falsy-but-present values on the compat
    // key are drops — non-string primitives as reason=primitive, "" as
    // reason=parse_failure (JSON.parse("") throws). Returned values stay
    // unchanged; a truly absent attribute stays increment-free.
    it("counts langfuse.metadata = false as a primitive drop", async () => {
      const events = await createProcessor().processToIngestionEvents(
        buildBatch([{ key: "langfuse.metadata", value: { boolValue: false } }]),
      );

      expect(events.length).toBeGreaterThan(0);
      expectSingleDrop("primitive");
    });

    it("counts langfuse.metadata = 0 as a primitive drop", async () => {
      const events = await createProcessor().processToIngestionEvents(
        buildBatch([{ key: "langfuse.metadata", value: { intValue: 0 } }]),
      );

      expect(events.length).toBeGreaterThan(0);
      expectSingleDrop("primitive");
    });

    it('counts langfuse.metadata = "" as a parse_failure drop', async () => {
      const events = await createProcessor().processToIngestionEvents(
        buildBatch([{ key: "langfuse.metadata", value: { stringValue: "" } }]),
      );

      expect(events.length).toBeGreaterThan(0);
      expectSingleDrop("parse_failure");
    });

    it("does not increment when no metadata attribute is present at all", async () => {
      const events = await createProcessor().processToIngestionEvents(
        buildBatch([]),
      );

      expect(events.length).toBeGreaterThan(0);
      expect(droppedCalls()).toHaveLength(0);
    });

    it("does not increment for a valid JSON object on the langfuse.metadata compat key", async () => {
      // Fixture proof that the compat key reaches metadata extraction at
      // all — if this fails, the falsy-value fixtures above cannot reach
      // the parser either (report as a finding, not a test problem).
      const events = await createProcessor().processToIngestionEvents(
        buildBatch([
          {
            key: "langfuse.metadata",
            value: { stringValue: JSON.stringify({ env: "compat-prod" }) },
          },
        ]),
      );

      expect(JSON.stringify(events)).toContain("compat-prod");
      expect(droppedCalls()).toHaveLength(0);
    });
  });

  // Adversarial-gate rulings (round 2). Shared fixture builders for
  // multi-resourceSpan / multi-span batches.
  describe("adversarial rulings", () => {
    const makeSpan = (attributes: OtelAttribute[], spanIdHex: string) => ({
      traceId: Buffer.from("0123456789abcdef0123456789abcdef", "hex"),
      spanId: Buffer.from(spanIdHex, "hex"),
      name: "test-span",
      kind: 1,
      startTimeUnixNano: "1752384000000000000",
      endTimeUnixNano: "1752384001000000000",
      attributes: [
        { key: "langfuse.observation.type", value: { stringValue: "span" } },
        ...attributes,
      ],
      status: {},
    });

    const makeResourceSpan = (
      resourceAttrs: OtelAttribute[],
      spans: ReturnType<typeof makeSpan>[],
    ): ResourceSpan => ({
      resource: {
        attributes: [
          { key: "service.name", value: { stringValue: "test-svc" } },
          ...resourceAttrs,
        ],
      },
      scopeSpans: [
        {
          scope: {
            name: "langfuse-sdk",
            version: "3.8.1",
            attributes: [
              { key: "public_key", value: { stringValue: "pk-test" } },
            ],
          },
          spans,
        },
      ],
    });

    const expectDropReasons = (expectedReasons: string[]) => {
      const calls = droppedCalls();
      expect(
        calls
          .map(
            ([, , tags]) =>
              (tags as Record<string, string> | undefined)?.reason,
          )
          .sort(),
      ).toEqual([...expectedReasons].sort());
      for (const [, value, tags] of calls) {
        expect((value as number | undefined) ?? 1).toBe(1);
        expect(tags).toEqual(expect.objectContaining({ source: "otel" }));
        expect(["trace", "observation"]).toContain(
          (tags as Record<string, string>)?.domain,
        );
        expect((tags as Record<string, string>)?.projectId).toBe(PROJECT_ID);
      }
    };

    // RULING A: dedup is scoped per resourceSpan, not per processor
    // instance — distinct resourceSpans in one job count separately.
    describe("resource-scope dedup", () => {
      it("counts bad resource-level metadata once per resourceSpan, not once per job", async () => {
        const events = await createProcessor().processToIngestionEvents([
          makeResourceSpan(
            [{ key: "langfuse.metadata", value: { stringValue: "{bad-one" } }],
            [makeSpan([], "0000000000000001")],
          ),
          makeResourceSpan(
            [{ key: "langfuse.metadata", value: { stringValue: "{bad-two" } }],
            [makeSpan([], "0000000000000002")],
          ),
        ]);

        expect(events.length).toBeGreaterThan(0);
        expectDropReasons(["parse_failure", "parse_failure"]);
      });

      it("counts one resourceSpan's bad resource-level metadata once even with multiple spans", async () => {
        const events = await createProcessor().processToIngestionEvents([
          makeResourceSpan(
            [{ key: "langfuse.metadata", value: { stringValue: "{bad-one" } }],
            [
              makeSpan([], "0000000000000001"),
              makeSpan([], "0000000000000002"),
            ],
          ),
        ]);

        expect(events.length).toBeGreaterThan(0);
        expectDropReasons(["parse_failure"]);
      });
    });

    // RULING B: falsy-but-present PRIMARY keys count (supersedes the
    // compat-key-only scoping of round-1 ruling 2). Truly-absent stays
    // zero — pinned by "does not increment when no metadata attribute is
    // present at all" above.
    describe("falsy-present primary keys", () => {
      it("counts langfuse.observation.metadata = false as a primitive drop", async () => {
        const events = await createProcessor().processToIngestionEvents([
          makeResourceSpan(
            [],
            [
              makeSpan(
                [
                  {
                    key: "langfuse.observation.metadata",
                    value: { boolValue: false },
                  },
                ],
                "0000000000000001",
              ),
            ],
          ),
        ]);

        expect(events.length).toBeGreaterThan(0);
        const calls = droppedCalls();
        expect(calls).toHaveLength(1);
        expectDropTags(calls[0], {
          reason: "primitive",
          source: "otel",
          domain: "observation",
        });
      });

      it("counts langfuse.observation.metadata = 0 as a primitive drop", async () => {
        const events = await createProcessor().processToIngestionEvents([
          makeResourceSpan(
            [],
            [
              makeSpan(
                [
                  {
                    key: "langfuse.observation.metadata",
                    value: { intValue: 0 },
                  },
                ],
                "0000000000000001",
              ),
            ],
          ),
        ]);

        expect(events.length).toBeGreaterThan(0);
        const calls = droppedCalls();
        expect(calls).toHaveLength(1);
        expectDropTags(calls[0], {
          reason: "primitive",
          source: "otel",
          domain: "observation",
        });
      });

      it('counts langfuse.observation.metadata = "" as a parse_failure drop', async () => {
        const events = await createProcessor().processToIngestionEvents([
          makeResourceSpan(
            [],
            [
              makeSpan(
                [
                  {
                    key: "langfuse.observation.metadata",
                    value: { stringValue: "" },
                  },
                ],
                "0000000000000001",
              ),
            ],
          ),
        ]);

        expect(events.length).toBeGreaterThan(0);
        const calls = droppedCalls();
        expect(calls).toHaveLength(1);
        expectDropTags(calls[0], {
          reason: "parse_failure",
          source: "otel",
          domain: "observation",
        });
      });

      it("counts a falsy-present primary key AND a malformed compat key as two drops", async () => {
        const events = await createProcessor().processToIngestionEvents([
          makeResourceSpan(
            [],
            [
              makeSpan(
                [
                  {
                    key: "langfuse.observation.metadata",
                    value: { boolValue: false },
                  },
                  {
                    key: "langfuse.metadata",
                    value: { stringValue: "{bad" },
                  },
                ],
                "0000000000000001",
              ),
            ],
          ),
        ]);

        expect(events.length).toBeGreaterThan(0);
        expectDropReasons(["parse_failure", "primitive"]);
      });
    });
  });
});

describe("OTel reconstructed array drop telemetry", () => {
  beforeEach(() => {
    recordIncrementMock.mockClear();
  });

  const arrayDropCalls = () =>
    recordIncrementMock.mock.calls.filter(
      ([stat]) => stat === ARRAY_ATTRIBUTE_DROPPED_METRIC,
    );

  it("reports validation drops with their own reasons", async () => {
    const processor = createProcessor();
    const batch = buildBatch([
      {
        key: "llm.input_messages.10001.content",
        value: { stringValue: "dropped" },
      },
      {
        key: `llm.input_messages.${Array.from(
          { length: 65 },
          () => "nested",
        ).join(".")}`,
        value: { stringValue: "dropped" },
      },
    ]);

    await processor.processToIngestionEvents(batch);

    expect(arrayDropCalls()).toEqual(
      expect.arrayContaining([
        [
          ARRAY_ATTRIBUTE_DROPPED_METRIC,
          1,
          {
            reason: "reconstruction_array_index_exceeded",
            prefix: "llm.input_messages",
          },
        ],
        [
          ARRAY_ATTRIBUTE_DROPPED_METRIC,
          1,
          {
            reason: "reconstruction_path_depth_exceeded",
            prefix: "llm.input_messages",
          },
        ],
      ]),
    );
  });

  it("caps warnings without logging rejected attribute keys or values", async () => {
    const warnSpy = vi
      .spyOn(serverBarrel.logger, "warn")
      .mockImplementation(() => serverBarrel.logger);

    try {
      const batches = Array.from(
        { length: 12 },
        (_, index) =>
          buildBatch([
            {
              key: "llm.input_messages.5000.messages.5000.secret-content",
              value: { stringValue: `customer-secret-${index}` },
            },
          ])[0],
      );

      await createProcessor().processToIngestionEvents(batches);

      expect(arrayDropCalls().length).toBeGreaterThan(0);
      const arrayDropWarnings = warnSpy.mock.calls.filter(
        ([message]) => String(message) === "OTEL array attribute dropped",
      );
      expect(arrayDropWarnings).toHaveLength(10);
      for (const warning of arrayDropWarnings) {
        expect(warning).toEqual([
          "OTEL array attribute dropped",
          {
            projectId: PROJECT_ID,
            prefix: "llm.input_messages",
            reason: "reconstruction_budget_exceeded",
            droppedAttributeCount: 1,
          },
        ]);
        expect(JSON.stringify(warning)).not.toContain("customer-secret");
        expect(JSON.stringify(warning)).not.toContain("secret-content");
      }
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("does not let validation drops consume the array-budget warning cap", async () => {
    const warnSpy = vi
      .spyOn(serverBarrel.logger, "warn")
      .mockImplementation(() => serverBarrel.logger);

    try {
      const deepPath = Array.from({ length: 65 }, () => "nested").join(".");
      const processor = createProcessor();
      const validationBatches = Array.from(
        { length: 12 },
        () =>
          buildBatch([
            {
              key: `llm.input_messages.${deepPath}`,
              value: { stringValue: "dropped" },
            },
          ])[0],
      );

      await processor.processToIngestionEvents(validationBatches);
      warnSpy.mockClear();

      await processor.processToIngestionEvents(
        buildBatch([
          {
            key: "llm.input_messages.5000.messages.5000.content",
            value: { stringValue: "dropped" },
          },
        ]),
      );

      expect(warnSpy).toHaveBeenCalledWith("OTEL array attribute dropped", {
        projectId: PROJECT_ID,
        prefix: "llm.input_messages",
        reason: "reconstruction_budget_exceeded",
        droppedAttributeCount: 1,
      });
    } finally {
      warnSpy.mockRestore();
    }
  });
});

describe("metadata_dropped attribution tags (parse_failure kind, attributeKey)", () => {
  beforeEach(() => {
    recordIncrementMock.mockClear();
  });

  const singleDropTags = () => {
    const calls = recordIncrementMock.mock.calls.filter(
      ([stat]) => stat === METRIC,
    );
    expect(calls).toHaveLength(1);
    return (calls[0] as [string, number, Record<string, string>])[2];
  };

  // Each value fails JSON.parse and must be sub-classified by its shape.
  // The values are synthetic and carry no real user content.
  const kindCases: Array<{ name: string; value: string; kind: string }> = [
    {
      name: "python dict repr",
      value: "{'user': 'x', 'ok': True}",
      kind: "python_repr",
    },
    { name: "bare True token", value: "True", kind: "python_repr" },
    { name: "unquoted string", value: "in progress", kind: "unquoted_string" },
    {
      name: "truncated object",
      value: '{"a":"long va',
      kind: "truncated_json",
    },
    {
      name: "loose json trailing comma",
      value: '{"a":1,}',
      kind: "loose_json",
    },
    { name: "empty string on compat key", value: "", kind: "empty" },
  ];

  for (const { name, value, kind } of kindCases) {
    it(`classifies ${name} as kind=${kind}`, async () => {
      // Empty is only reachable on the compat key (a falsy primary value
      // survives the `||` fallback); non-empty values sit on the primary key.
      const attrKey =
        value === "" ? "langfuse.metadata" : "langfuse.observation.metadata";
      await createProcessor().processToIngestionEvents(
        buildBatch([{ key: attrKey, value: { stringValue: value } }]),
      );

      const tags = singleDropTags();
      expect(tags.reason).toBe("parse_failure");
      expect(tags.kind).toBe(kind);
      expect(tags.attributeKey).toBe(attrKey);
      expect(tags.sdkName).toBe("python");
      expect(tags.sdkVersion).toBe("3.8.1");
    });
  }

  it("omits kind for a non-parse_failure drop (primitive)", async () => {
    await createProcessor().processToIngestionEvents(
      buildBatch([
        { key: "langfuse.observation.metadata", value: { intValue: 42 } },
      ]),
    );
    const tags = singleDropTags();
    expect(tags.reason).toBe("primitive");
    expect(tags.kind).toBeUndefined();
  });

  it("sanitizes and bounds attacker-controlled sdkName/sdkVersion tags", async () => {
    // sdkName/sdkVersion come from raw request headers; a caller must not be
    // able to inject tag separators, control chars, or oversized values.
    const processor = new OtelIngestionProcessor({
      projectId: PROJECT_ID,
      publicKey: "pk-test",
      sdkName: "evil,name|with:sep=chars",
      sdkVersion: `1.0\n${"x".repeat(100)}`,
    });
    await processor.processToIngestionEvents(
      buildBatch([
        {
          key: "langfuse.observation.metadata",
          value: { stringValue: "{bad" },
        },
      ]),
    );

    const tags = singleDropTags();
    for (const key of ["sdkName", "sdkVersion"] as const) {
      expect(tags[key]).not.toMatch(/[,|:=]/);
      expect(tags[key].length).toBeLessThanOrEqual(32);
      for (const character of tags[key]) {
        const codePoint = character.codePointAt(0) ?? 0;
        expect(codePoint).toBeGreaterThan(31);
        expect(codePoint).not.toBe(127);
      }
    }
  });
});
